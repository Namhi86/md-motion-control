/**
 * Bộ kiểm thử toàn diện cho Motion Control Pipeline, App Mode, Diag Log và Muse Engine.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { API_URL, pickApiBase, pickWindowMode } from "../src/app-mode.js";
import { setupDiagLog } from "../electron/diag-log.js";
import {
  parseMeanVolume,
  parseSceneCuts,
  parseSilences,
  planFromCuts,
  planSegments,
  silenceThresholdFor,
} from "../src/motion-plan.js";
import { ENGINES, chainsOf, clipTask, jobCredits, startsHard } from "../src/motion-chains.js";
import { REF_CONSENT, REF_MODEL } from "../src/veo-ref.js";
import { createMotionJob } from "../electron/motion-job.js";
import { setupMotion } from "../electron/motion-ipc.js";
import { findFfmpeg, probeFile, runChild } from "../electron/stitch.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIXTURES_DIR = path.join(PROJECT_ROOT, "src", "fixtures");

/**
 * Tìm đường dẫn thực thi ffmpeg.exe từ node_modules cục bộ hoặc bản giải nén MDMotion_Analysis.
 */
function resolveTestFfmpeg() {
  const fromBuiltIn = findFfmpeg({ isPackaged: false });
  if (fromBuiltIn && existsSync(fromBuiltIn)) {
    return fromBuiltIn;
  }
  const candidates = [
    path.join(PROJECT_ROOT, "node_modules", "ffmpeg-static", "ffmpeg.exe"),
    path.resolve(
      PROJECT_ROOT,
      "..",
      "15. Other Projects",
      "MDMotion_Analysis",
      "app_64_extracted",
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "ffmpeg-static",
      "ffmpeg.exe"
    ),
    path.resolve(
      PROJECT_ROOT,
      "..",
      "15. Other Projects",
      "MDMotion_Analysis",
      "app_64_extracted",
      "node_modules",
      "ffmpeg-static",
      "ffmpeg.exe"
    ),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

test("app-mode: pickWindowMode luôn trả về { kind: 'file' } mặc định kể cả khi isPackaged === true", () => {
  assert.deepEqual(pickWindowMode({ isPackaged: true }), { kind: "file" });
  assert.deepEqual(pickWindowMode({ isPackaged: false }), { kind: "file" });
  assert.deepEqual(pickWindowMode({ isPackaged: true, testMode: false, webUrl: "" }), {
    kind: "file",
  });

  // Chỉ mở chế độ web khi chủ động truyền webUrl hợp lệ
  assert.deepEqual(
    pickWindowMode({ isPackaged: true, webUrl: "https://custom.example.com/app" }),
    {
      kind: "web",
      url: "https://custom.example.com/app",
      origin: "https://custom.example.com",
    }
  );

  // Từ chối URL ngoài localhost khi testMode === true
  assert.deepEqual(
    pickWindowMode({
      isPackaged: false,
      testMode: true,
      webUrl: "https://custom.example.com/app",
    }),
    {
      kind: "file",
      refused: "https://custom.example.com/app",
    }
  );

  assert.equal(pickApiBase({ isPackaged: true, apiUrl: "https://other.example.com" }), API_URL);
});

test("diag-log: giữ nguyên giao diện và vô hiệu hóa hoàn toàn việc gửi HTTP log ra ngoài", async () => {
  const tmpUserData = mkdtempSync(path.join(os.tmpdir(), "diag-log-test-"));
  try {
    let remoteHttpCalled = 0;
    const fakeAuth = {
      authed: async () => {
        remoteHttpCalled += 1;
        throw new Error("Không được phép gọi mạng từ diag-log!");
      },
    };

    const diag = setupDiagLog({
      userData: tmpUserData,
      version: "1.3.64",
      testMode: false,
      env: {},
    });

    assert.equal(typeof diag.push, "function");
    assert.equal(typeof diag.tapSend, "function");
    assert.equal(typeof diag.bind, "function");
    assert.equal(typeof diag.onAuth, "function");
    assert.equal(typeof diag.quit, "function");
    assert.equal(typeof diag.flush, "function");

    diag.bind(
      {
        auth: fakeAuth,
        accounts: { get: () => [] },
        taskOf: () => null,
      },
      { status: "signed-in", unlocked: true }
    );

    const wrappedSend = diag.tapSend((channel, payload) => ({ channel, payload }));
    const tapResult = wrappedSend("queue:changed", [
      {
        id: "t1",
        status: "done",
        mode: "muse",
        kind: "video",
        startedAt: Date.now() - 5000,
        finishedAt: Date.now(),
        attempts: 1,
      },
    ]);
    assert.equal(tapResult.channel, "queue:changed");

    diag.push("Lỗi kết nối mạng ECONNRESET (lần 1/3)");
    await diag.flush();
    diag.quit();

    assert.equal(remoteHttpCalled, 0, "Tuyệt đối không được gọi auth.authed để gửi log từ xa");
    assert.ok(diag.entries().length >= 1, "Log vẫn phải được ghi nhận trong bộ nhớ cục bộ");
  } finally {
    rmSync(tmpUserData, { recursive: true, force: true });
  }
});

test("motion-plan: planSegments chia đoạn 4–10.5s chính xác từ fixtures motion-podcast-*.txt", () => {
  const scenesTxt = readFileSync(path.join(FIXTURES_DIR, "motion-podcast-scenes.txt"), "utf8");
  const silencesTxt = readFileSync(path.join(FIXTURES_DIR, "motion-podcast-silences.txt"), "utf8");
  const volumeTxt = readFileSync(path.join(FIXTURES_DIR, "motion-podcast-volume.txt"), "utf8");

  const meanVol = parseMeanVolume(volumeTxt);
  assert.equal(meanVol, -23.5);
  assert.equal(silenceThresholdFor(meanVol), -22);

  const sceneCuts = parseSceneCuts(scenesTxt);
  assert.deepEqual(sceneCuts, [5.70025, 18.754958]);

  const silences = parseSilences(silencesTxt);
  assert.ok(silences.length >= 10);

  const duration = 28.8;
  const segments = planSegments({
    duration,
    silences,
    cuts: sceneCuts,
  });

  assert.ok(segments.length >= 3);
  assert.equal(segments[0].start, 0);
  assert.equal(segments.at(-1).end, duration);

  for (const seg of segments) {
    assert.ok(
      seg.seconds >= 4 && seg.seconds <= 10.5,
      `Đoạn ${seg.i} có thời lượng ${seg.seconds}s nằm ngoài khoảng 4..10.5s`
    );
  }

  // Kiểm tra các chuỗi chainsOf dựa trên cutAt === "scene"
  const chains = chainsOf(segments);
  assert.ok(chains.length >= 2, "Phải tách thành nhiều chuỗi khi có vạch cắt chuyển cảnh (scene)");
  segments.forEach((_, idx) => {
    const expectedHard = idx === 0 || segments[idx - 1].cutAt === "scene";
    assert.equal(startsHard(segments, idx), expectedHard);
  });
});

test("motion-plan & motion-ipc: planFromCuts báo lỗi bad_piece khi đoạn < 4s hoặc > 10.5s", async () => {
  // Kiểm tra trực tiếp hàm planFromCuts
  const tooShort = planFromCuts({
    duration: 15,
    cuts: [2.5, 9],
  });
  assert.equal(tooShort.ok, false);
  assert.equal(tooShort.at, 0);
  assert.match(tooShort.note, /ngắn quá/);

  const tooLong = planFromCuts({
    duration: 20,
    cuts: [12],
  });
  assert.equal(tooLong.ok, false);
  assert.equal(tooLong.at, 0);
  assert.match(tooLong.note, /dài quá/);

  // Kiểm tra qua kênh IPC motion:replan trả về reason: "bad_piece"
  const handlers = new Map();
  const fakeIpc = {
    handle: (ch, fn) => handlers.set(ch, fn),
  };
  const fakeHandle = "a".repeat(32);

  setupMotion({
    ipc: fakeIpc,
    resolveHandle: (h) => (h === fakeHandle ? path.join(PROJECT_ROOT, "fake-video.mp4") : null),
    addHandle: () => fakeHandle,
    statFile: () => ({ isFile: () => true, size: 100_000, mtimeMs: 1000 }),
    prepare: async () => ({
      ok: true,
      duration: 20,
      hasAudio: true,
      width: 1080,
      height: 1920,
      voice: { gender: "female", age: "young adult", style: "warm" },
      segments: planSegments({ duration: 20 }),
      snaps: { pauses: [], scenes: [] },
      envelope: [],
    }),
    makeJob: () => ({
      start: async () => ({ ok: true, jobId: "cm_1", credits: {}, clips: 2 }),
      status: () => null,
      stop: async () => {},
    }),
  });

  const prepRes = await handlers.get("motion:prepare")({}, { videoHandle: fakeHandle });
  assert.equal(prepRes.ok, true);

  const replanShort = await handlers.get("motion:replan")(
    {},
    { prepareId: prepRes.prepareId, cuts: [3, 10] }
  );
  assert.equal(replanShort.ok, false);
  assert.equal(replanShort.reason, "bad_piece");
  assert.equal(replanShort.at, 0);

  const replanLong = await handlers.get("motion:replan")(
    {},
    { prepareId: prepRes.prepareId, cuts: [12] }
  );
  assert.equal(replanLong.ok, false);
  assert.equal(replanLong.reason, "bad_piece");
  assert.equal(replanLong.at, 0);

  // Kiểm tra lưu choices.engine trong motion:saveDraft và truyền engine vào motion:start
  let startedPayload = null;
  const handlers2 = new Map();
  setupMotion({
    ipc: { handle: (ch, fn) => handlers2.set(ch, fn) },
    resolveHandle: (h) => (h === fakeHandle ? path.join(PROJECT_ROOT, "fake-video.mp4") : null),
    addHandle: () => fakeHandle,
    statFile: () => ({ isFile: () => true, size: 100_000, mtimeMs: 1000 }),
    prepare: async () => ({
      ok: true,
      duration: 10,
      hasAudio: true,
      width: 1080,
      height: 1920,
      voice: { gender: "female", age: "young adult", style: "warm" },
      segments: planSegments({ duration: 10 }),
      snaps: { pauses: [], scenes: [] },
      envelope: [],
    }),
    makeJob: () => ({
      start: async (opts) => {
        startedPayload = opts;
        return { ok: true, jobId: "cm_test", credits: { total: 0 }, clips: 1 };
      },
      status: () => null,
      stop: async () => {},
    }),
  });

  const prep2 = await handlers2.get("motion:prepare")({}, { videoHandle: fakeHandle });
  const draftBadEngine = await handlers2.get("motion:saveDraft")(
    {},
    { prepareId: prep2.prepareId, choices: { engine: "invalid-engine" } }
  );
  assert.equal(draftBadEngine.ok, false);

  const draftGoodEngine = await handlers2.get("motion:saveDraft")(
    {},
    {
      prepareId: prep2.prepareId,
      choices: { engine: "muse", resolution: "720p", ratio: "9:16" },
    }
  );
  assert.equal(draftGoodEngine.ok, true);

  const startViaDraftEngine = await handlers2.get("motion:start")(
    {},
    {
      prepareId: prep2.prepareId,
      imageHandles: [fakeHandle],
    }
  );
  assert.equal(startViaDraftEngine.ok, true);
  assert.equal(startedPayload.engine, "muse");

  const startExplicitVeo = await handlers2.get("motion:start")(
    {},
    {
      prepareId: prep2.prepareId,
      imageHandles: [fakeHandle],
      engine: "veo-ref",
    }
  );
  assert.equal(startExplicitVeo.ok, true);
  assert.equal(startedPayload.engine, "veo-ref");
});

test("motion-chains: clipTask và jobCredits hoạt động đúng cho cả 2 chế độ veo-ref và muse", () => {
  assert.deepEqual(ENGINES, ["veo-ref", "muse"]);

  const dummySegments = [{ i: 0 }, { i: 1 }, { i: 2 }];

  // Kiểm tra jobCredits cho veo-ref
  const veo720 = jobCredits({ segments: dummySegments, resolution: "720p", engine: "veo-ref" });
  assert.deepEqual(veo720, { perClip: 20, clips: 3, total: 60 });

  const veo360 = jobCredits({ segments: dummySegments, resolution: "360p" });
  assert.deepEqual(veo360, { perClip: 10, clips: 3, total: 30 });

  // Kiểm tra jobCredits cho muse (0 credit)
  const museCredits = jobCredits({
    segments: dummySegments,
    resolution: "720p",
    engine: "muse",
  });
  assert.deepEqual(museCredits, {
    perClip: 0,
    clips: 3,
    total: 0,
    engine: "muse",
  });

  const sampleSegment = {
    i: 1,
    has_speech: true,
    text: "Xin chào các bạn",
    translated: "",
  };
  const sampleStyle = {
    subject: "A young presenter in casual clothes",
    scene: "in a cozy studio with warm lighting",
    language: "Vietnamese",
    voice: { gender: "female", age: "young adult", style: "warm" },
    voiceText: "",
  };

  // Kiểm tra clipTask cho veo-ref
  const veoTask = clipTask({
    segment: sampleSegment,
    first: false,
    joinsPrevious: true,
    refVideoHandle: "ref_h_1",
    imageHandles: ["img_1", "img_2"],
    resolution: "720p",
    ratio: "9:16",
    style: sampleStyle,
    engine: "veo-ref",
  });
  assert.equal(veoTask.mode, "veo");
  assert.equal(veoTask.model, REF_MODEL);
  assert.equal(veoTask.duration, 0);
  assert.equal(veoTask.refVideo, "ref_h_1");
  assert.equal(veoTask.resolution, "720p");
  assert.equal(veoTask.consent, REF_CONSENT);
  assert.deepEqual(veoTask.handles, ["img_1", "img_2"]);
  assert.match(veoTask.prompt, /last frame of the previous clip/);
  assert.match(veoTask.prompt, /Xin chào các bạn/);

  // Kiểm tra clipTask cho muse
  const museTask = clipTask({
    segment: sampleSegment,
    first: false,
    joinsPrevious: true,
    refVideoHandle: "ref_h_1",
    imageHandles: ["img_1", "img_2"],
    resolution: "720p",
    ratio: "16:9",
    style: sampleStyle,
    engine: "muse",
  });
  assert.deepEqual(museTask, {
    prompt: veoTask.prompt.replace("Vertical 9:16", "Horizontal 16:9"),
    ratio: "16:9",
    duration: 10,
    model: "muse-video",
    mode: "muse",
    kind: "video",
    handles: ["img_1", "img_2"],
  });
});

test("createMotionJob: chạy chuỗi chainsOf, nối last-frame.png, hỗ trợ retrySegment và ghép video thật bằng ffmpeg.exe", async () => {
  const ffmpegPath = resolveTestFfmpeg();
  assert.ok(ffmpegPath, "Phải tìm thấy ffmpeg.exe để chạy kiểm thử thực tế");

  const workDir = mkdtempSync(path.join(os.tmpdir(), "motion-job-test-"));
  const saveDir = path.join(workDir, "saved");
  try {
    // 1. Tạo video nguồn 9 giây và 5 ảnh nhân vật PNG thật bằng ffmpeg
    const srcVideo = path.join(workDir, "source.mp4");
    const genVideoRes = await runChild(ffmpegPath, [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=360x640:rate=30",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=44100",
      "-t",
      "9",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-shortest",
      "-y",
      srcVideo,
    ]);
    assert.equal(genVideoRes.code, 0, "Tạo video nguồn bằng ffmpeg phải thành công");

    const charImages = [];
    for (let idx = 0; idx < 5; idx += 1) {
      const imgPath = path.join(workDir, `char-${idx + 1}.png`);
      const imgRes = await runChild(ffmpegPath, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=blue:s=128x128:d=0.1`,
        "-frames:v",
        "1",
        "-y",
        imgPath,
      ]);
      assert.equal(imgRes.code, 0);
      charImages.push(imgPath);
    }

    // Tạo 2 đoạn clip giả lập kết quả trả về từ worker (mỗi đoạn dài 4.5s để khớp tỷ lệ stretch)
    const clipOut0 = path.join(workDir, "worker-clip-0.mp4");
    const clipOut1 = path.join(workDir, "worker-clip-1.mp4");
    for (const [idx, outFile] of [
      [0, clipOut0],
      [1, clipOut1],
    ]) {
      const freq = idx === 0 ? 520 : 660;
      const clipRes = await runChild(ffmpegPath, [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `testsrc=size=360x640:rate=30`,
        "-f",
        "lavfi",
        "-i",
        `sine=frequency=${freq}:sample_rate=44100`,
        "-t",
        "4.5",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        "-y",
        outFile,
      ]);
      assert.equal(clipRes.code, 0);
    }

    // 2. Tạo bộ giả lập handles và queue để kiểm tra luồng lỗi -> retrySegment -> nối lastFrame -> join
    const handleMap = new Map();
    let handleSeq = 0;
    const handles = {
      add(filePath) {
        const id = `h_${(handleSeq += 1)}`;
        handleMap.set(id, filePath);
        return id;
      },
      resolve(id) {
        return handleMap.get(id) || null;
      },
    };

    const tasks = [];
    let failSecondClipOnce = true;

    const fakeQueue = {
      async add(batch) {
        const addedIds = [];
        for (const payload of batch) {
          const id = `task_${tasks.length + 1}`;
          const isSecondClip = payload.prompt.includes("last frame of the previous clip");
          const shouldFail = isSecondClip && failSecondClipOnce;
          if (shouldFail) {
            failSecondClipOnce = false;
          }
          tasks.push({
            id,
            payload,
            status: shouldFail ? "failed" : "done",
            result: shouldFail
              ? null
              : {
                  file: isSecondClip ? clipOut1 : clipOut0,
                },
            error: shouldFail
              ? {
                  reason: "muse_failed",
                  note: "Lỗi mạng tạm thời ở đoạn 2.",
                }
              : null,
          });
          addedIds.push(id);
        }
        return { ok: true, ids: addedIds };
      },
      list() {
        return tasks;
      },
      cancel() {},
    };

    const progressEvents = [];
    const jobRunner = createMotionJob({
      ffmpegPath,
      queue: fakeQueue,
      handles,
      saveDir: () => saveDir,
      sleep: async () => {},
      tmpRoot: workDir,
      onProgress: (evt) => progressEvents.push(evt),
    });

    // Kế hoạch gồm 2 đoạn liên tiếp trong cùng 1 chuỗi (cutAt: "pause" -> nối mượt bằng lastFrame)
    const plan = {
      segments: [
        {
          i: 0,
          start: 0,
          end: 4.5,
          seconds: 4.5,
          step: 4,
          lostSeconds: 0.5,
          stretch: 1.125,
          cutAt: "pause",
          has_speech: true,
          text: "Câu thoại đoạn một",
          translated: "",
        },
        {
          i: 1,
          start: 4.5,
          end: 9,
          seconds: 4.5,
          step: 4,
          lostSeconds: 0.5,
          stretch: 1.125,
          cutAt: "end",
          has_speech: true,
          text: "Câu thoại đoạn hai",
          translated: "",
        },
      ],
    };

    const startRes = await jobRunner.start({
      video: srcVideo,
      plan,
      images: charImages, // 5 ảnh nhân vật
      style: {
        subject: "The presenter from reference images",
        scene: "in the same studio room",
        language: "Vietnamese",
        voice: { gender: "female", age: "young adult", style: "warm" },
        voiceText: "",
      },
      resolution: "720p",
      ratio: "9:16",
      engine: "muse",
      name: "muse-podcast",
    });

    assert.equal(startRes.ok, true);
    assert.deepEqual(startRes.credits, {
      perClip: 0,
      clips: 2,
      total: 0,
      engine: "muse",
    });

    // Lần chạy đầu tiên: đoạn 0 thành công, đoạn 1 giả lập lỗi
    const firstOutcome = await jobRunner.wait();
    assert.equal(firstOutcome.ok, false);
    assert.equal(firstOutcome.reason, "clips_failed");
    assert.deepEqual(firstOutcome.failed, [1]);

    const statusAfterFail = jobRunner.status();
    assert.equal(statusAfterFail.clips[0].state, "done");
    assert.equal(statusAfterFail.clips[1].state, "failed");

    // Kiểm tra đoạn 1 đã nhận last-000.png và giới hạn đúng 5 ảnh cho Muse (4 ảnh đầu + last-000.png)
    const secondTaskAttempt1 = tasks[1].payload;
    assert.equal(secondTaskAttempt1.mode, "muse");
    assert.equal(secondTaskAttempt1.model, "muse-video");
    assert.equal(secondTaskAttempt1.handles.length, 5, "Muse phải giới hạn tối đa 5 ảnh");
    const resolvedAttempt1Images = secondTaskAttempt1.handles.map((h) => handles.resolve(h));
    assert.deepEqual(resolvedAttempt1Images.slice(0, 4), charImages.slice(0, 4));
    assert.match(path.basename(resolvedAttempt1Images[4]), /^last-000\.png$/);
    assert.ok(existsSync(resolvedAttempt1Images[4]), "Tệp last-000.png phải tồn tại trên đĩa");

    // 3. Gọi retrySegment cho đoạn 1 bị lỗi
    const retryRes = await jobRunner.retrySegment(startRes.jobId, 1);
    assert.equal(retryRes.ok, true);

    const finalOutcome = await jobRunner.wait();
    assert.equal(finalOutcome.ok, true, `Ghép video phải thành công: ${finalOutcome.note || ""}`);
    assert.ok(existsSync(finalOutcome.file), "Tệp .mp4 đầu ra phải tồn tại");
    assert.ok(statSync(finalOutcome.file).size > 1000, "Tệp .mp4 đầu ra phải có dữ liệu");

    const probedFinal = await probeFile(ffmpegPath, finalOutcome.file);
    assert.equal(probedFinal.ok, true);
    assert.equal(probedFinal.hasVideo, true);
    assert.equal(probedFinal.hasAudio, true);
    // 2 đoạn 4.5s nối xfade 0.12s -> ~8.88s
    assert.ok(
      Math.abs(probedFinal.seconds - 8.88) < 0.35,
      `Thời lượng video ghép (${probedFinal.seconds}s) phải xấp xỉ 8.88s`
    );

    const closeRes = jobRunner.close();
    assert.equal(closeRes.ok, true);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
