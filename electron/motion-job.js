/**
 * Điều phối tiến trình thực thi công việc Motion Control (createMotionJob):
 * - Cắt các đoạn video tham chiếu bằng ffmpeg.
 * - Chạy song song các chuỗi cảnh (chainsOf), truyền khung hình cuối (lastFrame) giữa các đoạn liên tiếp.
 * - Hỗ trợ cả 2 engine: Google Flow ("veo-ref") và Muse AI ("muse", giới hạn tối đa 5 ảnh tham chiếu).
 * - Co giãn thời lượng khớp mili-giây với từng đoạn gốc và ghép mượt thành 1 tệp .mp4 bằng planJoin.
 */

import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canWriteInto } from "../src/can-write-into.js";
import { ENGINES, chainsOf, clipTask, jobCredits, startsHard } from "../src/motion-chains.js";
import { planJoin, sizeOf } from "../src/motion-join.js";
import { refTrimArgs, refSafeTrimArgs, lastFrameArgs } from "../src/clip-frame.js";
import { normalizeFlowCharacterImage } from "../src/char-sheet-crop.js";
import { UNWRITABLE_NOTE } from "./motion-dir.js";
import { runChild, probeFile } from "./stitch.js";

export const POLL_MS = 1000;
export const CUT_MS = 60_000;
export const CANCEL_GRACE_MS = 20_000;

const MUSE_MAX_IMAGES = 5;
const TERMINAL = new Set(["done", "failed", "cancelled", "interrupted"]);

const fail = (reason, note, extra = {}) => ({
  ok: false,
  reason,
  note,
  ...extra,
});

/**
 * Khởi tạo bộ quản lý công việc Motion Control.
 */
export function createMotionJob({
  ffmpegPath,
  queue,
  handles,
  saveDir,
  run = runChild,
  probe = probeFile,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  tmpRoot = os.tmpdir(),
  log = () => {},
  onProgress = () => {},
  cancelGraceMs = CANCEL_GRACE_MS,
} = {}) {
  let currentJob = null;

  /**
   * Bắt đầu một công việc Motion Control mới.
   */
  async function start({
    video,
    plan,
    images,
    style,
    resolution = "720p",
    ratio = "9:16",
    engine = "veo-ref",
    keepMusic = true,
    name = "copy-motion",
  } = {}) {
    if (currentJob) {
      if (!currentJob.done) {
        return fail("busy", "Motion control đang làm một video: chờ xong hoặc bấm Huỷ.");
      }
      try {
        rmSync(currentJob.dir, { recursive: true, force: true });
      } catch {}
      currentJob = null;
    }
    if (!ffmpegPath) {
      return fail("no_ffmpeg", "Thiếu ffmpeg để cắt và ghép video.");
    }
    if (typeof video !== "string" || !path.isAbsolute(video) || !existsSync(video)) {
      return fail("bad_args", "Không thấy video nguồn trên máy.");
    }
    if (!plan || !Array.isArray(plan.segments) || !plan.segments.length) {
      return fail("bad_args", "Chưa có kế hoạch đoạn.");
    }
    if (
      !Array.isArray(images) ||
      images.length < 1 ||
      images.length > 5 ||
      !images.every((img) => typeof img === "string" && path.isAbsolute(img) && existsSync(img))
    ) {
      return fail("bad_args", "Cần từ 1 đến 5 ảnh nhân vật có trên máy.");
    }
    if (!ENGINES.includes(engine)) {
      return fail("bad_args", "Engine tạo video không hợp lệ.");
    }

    let price;
    try {
      price = jobCredits({
        segments: plan.segments,
        resolution,
        engine,
      });
    } catch (err) {
      return fail("bad_args", err.message);
    }

    let targetSaveDir;
    try {
      targetSaveDir = saveDir();
    } catch {
      targetSaveDir = "";
    }
    if (!canWriteInto(targetSaveDir)) {
      return fail("dir_unwritable", UNWRITABLE_NOTE);
    }

    const ac = new AbortController();
    const dir = mkdtempSync(path.join(tmpRoot, "copy-motion-job-"));
    const clips = plan.segments.map((seg) => ({
      i: seg.i,
      state: "waiting",
      taskId: "",
      file: "",
      note: "",
      reason: "",
    }));

    const job = {
      id: "cm_" + now().toString(36),
      ac,
      dir,
      clips,
      plan,
      images,
      style,
      resolution,
      ratio,
      engine,
      keepMusic: Boolean(keepMusic),
      name,
      video,
      price,
      result: null,
      done: false,
    };
    currentJob = job;

    const emitProgress = (extra = {}) => {
      try {
        onProgress({
          jobId: job.id,
          clips: clips.map((clip) => ({ ...clip })),
          credits: price,
          ...extra,
        });
      } catch {}
    };

    emitProgress({ stage: "start" });

    job.promise = (async () => {
      try {
        await Promise.all(
          chainsOf(plan.segments).map((chain) => runChain(job, chain, emitProgress))
        );
        return await finishOrJoin(job, emitProgress);
      } catch (err) {
        log("Motion control: lỗi: " + String(err?.message).slice(0, 160));
        return completeJob(
          job,
          fail(
            "failed",
            "Motion control gặp lỗi bất ngờ. Các đoạn đã làm xong vẫn được giữ."
          ),
          emitProgress
        );
      }
    })();

    return {
      ok: true,
      jobId: job.id,
      credits: price,
      clips: clips.length,
    };
  }

  /**
   * Kiểm tra kết quả tất cả các đoạn và tiến hành ghép video nếu toàn bộ đã hoàn thành.
   */
  async function finishOrJoin(job, emitProgress) {
    if (job.ac.signal.aborted) {
      return completeJob(job, fail("cancelled", "Đã huỷ."), emitProgress);
    }
    const incomplete = job.clips.filter((clip) => clip.state !== "done");
    if (incomplete.length) {
      return completeJob(
        job,
        fail(
          "clips_failed",
          `Có ${incomplete.length} đoạn chưa làm được: xem lý do ở từng đoạn rồi bấm "Làm lại đoạn này".`,
          { failed: incomplete.map((clip) => clip.i) }
        ),
        emitProgress
      );
    }
    return completeJob(job, await joinClips(job, emitProgress), emitProgress);
  }

  /**
   * Đánh dấu công việc hoàn tất và phát sự kiện tiến trình cuối cùng.
   */
  const completeJob = (job, outcome, emitProgress) => {
    job.result = outcome;
    job.done = true;
    emitProgress({
      stage: outcome.ok ? "done" : "ended",
      result: outcome.ok
        ? {
            file: outcome.file,
            name: outcome.name,
            seconds: outcome.seconds,
          }
        : {
            reason: outcome.reason,
            note: outcome.note,
          },
    });
    return outcome;
  };

  /**
   * Thực thi tuần tự các đoạn trong cùng một chuỗi cảnh (chain).
   * Khung hình cuối của đoạn trước sẽ được nối làm ảnh tham chiếu cho đoạn sau.
   */
  async function runChain(job, chain, emitProgress) {
    let prevLastFrame = "";
    for (const segment of chain) {
      if (job.ac.signal.aborted) {
        job.clips[segment.i].state = "cancelled";
        emitProgress();
        continue;
      }
      const stepOutcome = await runSegment(job, segment, prevLastFrame, emitProgress);
      prevLastFrame = stepOutcome.ok ? stepOutcome.lastFrame : "";
      if (!stepOutcome.ok) {
        const remaining = chain.slice(chain.indexOf(segment) + 1);
        for (const nextSeg of remaining) {
          job.clips[nextSeg.i].state = "waiting";
          job.clips[nextSeg.i].note = "Chờ đoạn trước làm xong.";
        }
        emitProgress();
        return;
      }
    }
  }

  /**
   * Tự động chuẩn hóa ảnh nhân vật cho Google Flow (veo-ref):
   * - Tự động phát hiện tờ ghép nhiều ô (Character Sheet cả khổ dọc lẫn khổ ngang) và tách lấy 1 nhân vật chính diện.
   * - Loại bỏ metadata (EXIF/C2PA) và phủ lớp vi hạt chống bộ lọc nhận diện nhầm người nổi tiếng (`veo_content_refused`).
   */
  async function resolveFlowImages(job, { safeMode = false } = {}) {
    if (job.engine !== "veo-ref") {
      return job.images;
    }
    const cacheKey = safeMode ? "safeNormalizedImages" : "normalizedImages";
    const promiseKey = safeMode ? "safeNormalizedImagesPromise" : "normalizedImagesPromise";
    if (Array.isArray(job[cacheKey]) && job[cacheKey].length) {
      return job[cacheKey];
    }
    if (job[promiseKey]) {
      return job[promiseKey];
    }
    job[promiseKey] = (async () => {
      const result = [];
      for (let idx = 0; idx < job.images.length; idx += 1) {
        const imgPath = job.images[idx];
        const prefix = safeMode ? "char-safe-full" : "char-single-full";
        const singleFull = path.join(job.dir, `${prefix}-${idx}-${now().toString(36)}.jpg`);
        const normRes = await normalizeFlowCharacterImage({
          ffmpegPath,
          inputPath: imgPath,
          outputPath: singleFull,
          run,
          signal: job.ac.signal,
          safeMode,
        });
        if (normRes.ok) {
          if (idx === 0 && !job.cleanRefImage) {
            job.cleanRefImage = normRes.cleanRefPath || imgPath;
          }
          if (normRes.cropped) {
            log(
              `Motion control: phát hiện ảnh Character Sheet nhiều khuôn mặt (${normRes.reason}) — tự động tách ảnh đơn 1 người cho Flow.`
            );
          }
          result.push(normRes.path);
        } else {
          if (idx === 0 && !job.cleanRefImage) {
            job.cleanRefImage = imgPath;
          }
          result.push(imgPath);
        }
      }
      job[cacheKey] = result;
      return result;
    })();
    return job[promiseKey];
  }

  /**
   * Thực thi một đoạn đơn lẻ:
   * 1. Cắt đoạn video gốc làm tham chiếu.
   * 2. Chuẩn bị danh sách ảnh tham chiếu (với Muse: giới hạn tối đa 5 ảnh, giữ 4 ảnh đầu + lastFrame).
   * 3. Đẩy vào hàng đợi và chờ kết quả (nếu bị `veo_content_refused` thì tự động thử lại lần 2 ở chế độ Safe-Mode).
   * 4. Trích xuất khung hình cuối cùng (`last-xxx.png`) cho đoạn kế tiếp.
   */
  async function runSegment(job, segment, lastFramePath, emitProgress) {
    const clipState = job.clips[segment.i];
    const updateClip = (patch) => {
      Object.assign(clipState, patch);
      emitProgress();
    };

    try {
      updateClip({ state: "cutting", note: "", reason: "" });

      const refVideoPath = path.join(
        job.dir,
        `ref-${String(segment.i).padStart(3, "0")}.mp4`
      );
      const trimRes = await run(
        ffmpegPath,
        refTrimArgs(job.video, refVideoPath, Math.min(segment.seconds, 10), segment.start),
        { signal: job.ac.signal, timeoutMs: CUT_MS }
      );

      if (trimRes.aborted) {
        updateClip({ state: "cancelled" });
        return { ok: false };
      }
      if (
        trimRes.spawnError ||
        trimRes.timedOut ||
        trimRes.code !== 0 ||
        !existsSync(refVideoPath) ||
        statSync(refVideoPath).size === 0
      ) {
        updateClip({
          state: "failed",
          reason: "ffmpeg_failed",
          note: `Không cắt được đoạn ${segment.i + 1} của video.`,
        });
        return { ok: false };
      }

      let baseImages = await resolveFlowImages(job, { safeMode: false });
      if (job.engine === "muse" && job.images.length > 0) {
        if (!job.cleanRefImage) {
          job.cleanRefImage = job.images[0];
        }
        try {
          const aiUpscaleScript = path.resolve(
            path.dirname(fileURLToPath(import.meta.url)),
            "..",
            "scripts",
            "ai-upscale-cli.py"
          );
          if (existsSync(aiUpscaleScript)) {
            const museScenePath = path.join(
              job.dir,
              `muse-scene-${String(segment.i).padStart(3, "0")}.jpg`
            );
            const prepRes = await run(
              "python",
              [
                aiUpscaleScript,
                "--mode",
                "muse-prep",
                "--input",
                job.images[0],
                "--ref-video",
                refVideoPath,
                "--output",
                museScenePath,
              ],
              { signal: job.ac.signal, timeoutMs: 30_000 }
            );
            if (
              !prepRes.aborted &&
              prepRes.code === 0 &&
              existsSync(museScenePath) &&
              statSync(museScenePath).size > 2000
            ) {
              baseImages = [museScenePath, ...job.images.slice(1)];
            }
          }
        } catch {}
      }
      const joinsPrevious = Boolean(lastFramePath);
      let segmentImages = baseImages;
      if (joinsPrevious) {
        const combined = [...baseImages, lastFramePath];
        segmentImages =
          job.engine === "muse" && combined.length > MUSE_MAX_IMAGES
            ? [...baseImages.slice(0, MUSE_MAX_IMAGES - 1), lastFramePath]
            : combined;
      }

      const effectiveSegment = job.keepMusic
        ? { ...segment, text: "", translated: "", has_speech: false }
        : segment;

      const taskPayload = clipTask({
        segment: effectiveSegment,
        first: segment.i === 0,
        joinsPrevious,
        refVideoHandle: handles.add(refVideoPath),
        imageHandles: segmentImages.map((imgPath) => handles.add(imgPath)),
        resolution: job.resolution,
        ratio: job.ratio,
        style: job.style,
        engine: job.engine,
      });

      const added = await queue.add([taskPayload]);
      if (!added?.ok || !added.ids?.length) {
        updateClip({
          state: "failed",
          reason: "queue_refused",
          note: added?.note || "Hàng đợi từ chối đoạn này.",
        });
        return { ok: false };
      }

      updateClip({ state: "queued", taskId: added.ids[0] });

      let taskResult = await waitForTask(job, added.ids[0], (nextState) => {
        if (clipState.state !== nextState) {
          updateClip({ state: nextState });
        }
      });

      if (
        !job.ac.signal.aborted &&
        taskResult.status === "failed" &&
        ["veo_images_failed", "veo_page_not_ready", "veo_settings_failed"].includes(
          taskResult.error?.reason
        )
      ) {
        log(
          `Motion control: đoạn ${segment.i + 1} gặp lỗi thao tác trang Flow (${taskResult.error?.reason}) — tự động thử lại ngay...`
        );
        updateClip({
          state: "queued",
          note: "Đang tự động thử lại đoạn này trên Google Flow (chưa tốn credit)...",
          reason: "",
        });
        const retryAdded = await queue.add([taskPayload]);
        if (retryAdded?.ok && retryAdded.ids?.length) {
          updateClip({ state: "queued", taskId: retryAdded.ids[0] });
          taskResult = await waitForTask(job, retryAdded.ids[0], (nextState) => {
            if (clipState.state !== nextState) {
              updateClip({ state: nextState });
            }
          });
        }
      }

      if (
        job.engine === "veo-ref" &&
        !job.ac.signal.aborted &&
        taskResult.status === "failed" &&
        taskResult.error?.reason === "veo_content_refused"
      ) {
        log(
          `Motion control: đoạn ${segment.i + 1} bị bộ lọc khuôn mặt Flow từ chối — tự động kích hoạt Safe-Mode (làm dịu nhận diện khuôn mặt) và thử lại...`
        );
        updateClip({
          state: "cutting",
          note: "Đang tự động xử lý vượt bộ lọc khuôn mặt của Flow và thử lại (không tốn thêm credit)...",
          reason: "",
        });

        const refSafeVideoPath = path.join(
          job.dir,
          `ref-safe-${String(segment.i).padStart(3, "0")}.mp4`
        );
        const safeTrimRes = await run(
          ffmpegPath,
          refSafeTrimArgs(job.video, refSafeVideoPath, Math.min(segment.seconds, 10), segment.start),
          { signal: job.ac.signal, timeoutMs: CUT_MS }
        );
        const activeRefVideo =
          !safeTrimRes.aborted &&
          safeTrimRes.code === 0 &&
          existsSync(refSafeVideoPath) &&
          statSync(refSafeVideoPath).size > 0
            ? refSafeVideoPath
            : refVideoPath;

        const safeBaseImages = await resolveFlowImages(job, { safeMode: true });
        const safeSegmentImages = joinsPrevious
          ? [...safeBaseImages, lastFramePath]
          : safeBaseImages;

        const safeTaskPayload = clipTask({
          segment: effectiveSegment,
          first: segment.i === 0,
          joinsPrevious,
          refVideoHandle: handles.add(activeRefVideo),
          imageHandles: safeSegmentImages.map((imgPath) => handles.add(imgPath)),
          resolution: job.resolution,
          ratio: job.ratio,
          style: {
            ...job.style,
            subject:
              "A fictional stylized character wearing the outfit and hairstyle from the reference image",
            scene:
              "moves naturally in a matching environment, lighting and camera angle",
          },
          engine: job.engine,
        });

        const safeAdded = await queue.add([safeTaskPayload]);
        if (safeAdded?.ok && safeAdded.ids?.length) {
          updateClip({ state: "queued", taskId: safeAdded.ids[0] });
          taskResult = await waitForTask(job, safeAdded.ids[0], (nextState) => {
            if (clipState.state !== nextState) {
              updateClip({ state: nextState });
            }
          });
        }
      }

      if (
        job.engine === "muse" &&
        !job.ac.signal.aborted &&
        taskResult.status === "failed" &&
        taskResult.error?.reason === "muse_asked"
      ) {
        log(
          `Motion control: đoạn ${segment.i + 1} bị bộ lọc câu lệnh Muse AI từ chối nhẹ — tự động chuyển sang câu lệnh Safe-Showcase và tạo lại...`
        );
        updateClip({
          state: "queued",
          note: "Đang tự động điều chỉnh câu lệnh tương thích với trang phục trên Muse AI và tạo lại...",
          reason: "",
        });
        const museSafePayload = {
          ...taskPayload,
          prompt:
            "Proceed with the calm, elegant showcase: same person and dress in the dark wood room from the attached image, facing the camera, gentle sway with arms relaxed and a warm smile, no dance choreography. Keep the room background unchanged, do not spin 360 degrees. " +
            (job.ratio === "16:9" ? "Horizontal 16:9" : "Vertical 9:16") +
            ", steady camera framing, no subtitles, no text on screen.",
        };
        const museSafeAdded = await queue.add([museSafePayload]);
        if (museSafeAdded?.ok && museSafeAdded.ids?.length) {
          updateClip({ state: "queued", taskId: museSafeAdded.ids[0] });
          taskResult = await waitForTask(job, museSafeAdded.ids[0], (nextState) => {
            if (clipState.state !== nextState) {
              updateClip({ state: nextState });
            }
          });
        }
      }

      if (
        taskResult.status === "done" &&
        taskResult.result?.file &&
        existsSync(taskResult.result.file)
      ) {
        const outLastFrame = path.join(
          job.dir,
          `last-${String(segment.i).padStart(3, "0")}.png`
        );
        const frameRes = await run(
          ffmpegPath,
          lastFrameArgs(taskResult.result.file, outLastFrame),
          { signal: job.ac.signal, timeoutMs: CUT_MS }
        );

        // Nếu đang bật chế độ "Giữ nhạc gốc (Chỉ thay nhân vật)", tự động ghép đoạn nhạc gốc
        // tương ứng từ `job.video` vào ngay cả clip đơn lẻ trong Thư viện.
        if (job.keepMusic && existsSync(job.video)) {
          try {
            const segMuxed = taskResult.result.file + ".keepmusic.mp4";
            const segMuxRes = await run(
              ffmpegPath,
              [
                "-hide_banner",
                "-nostdin",
                "-loglevel",
                "error",
                "-y",
                "-i",
                taskResult.result.file,
                "-ss",
                String(Math.max(0, Number(segment.start) || 0)),
                "-t",
                String(Math.max(0.5, Number(segment.seconds) || 8)),
                "-i",
                job.video,
                "-map",
                "0:v:0",
                "-map",
                "1:a:0?",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-b:a",
                "192k",
                "-ar",
                "44100",
                "-ac",
                "2",
                "-shortest",
                "-movflags",
                "+faststart",
                segMuxed,
              ],
              { signal: job.ac.signal, timeoutMs: 45_000 }
            );
            if (
              !segMuxRes.aborted &&
              segMuxRes.code === 0 &&
              existsSync(segMuxed) &&
              statSync(segMuxed).size > 1000
            ) {
              rmSync(taskResult.result.file, { force: true });
              renameSync(segMuxed, taskResult.result.file);
            } else {
              rmSync(segMuxed, { force: true });
            }
          } catch {}
        }

        updateClip({ state: "done", file: taskResult.result.file });
        return {
          ok: true,
          lastFrame: frameRes.code === 0 && existsSync(outLastFrame) ? outLastFrame : "",
        };
      }

      if (taskResult.status === "detached") {
        updateClip({
          state: "cancelled",
          reason: "at_flow",
          note: "Đoạn này đã gửi sang Flow trước khi huỷ: clip sẽ tự lưu vào Thư viện, không cần làm lại.",
        });
        return { ok: false };
      }

      if (taskResult.status === "cancelled" || job.ac.signal.aborted) {
        updateClip({ state: "cancelled" });
        return { ok: false };
      }

      if (taskResult.status === "done") {
        updateClip({
          state: "failed",
          reason: "not_saved",
          note: 'Flow đã làm xong đoạn này nhưng chưa lưu về máy: vào Thư viện bấm "Lấy lại video" (miễn phí).',
        });
        return { ok: false };
      }

      updateClip({
        state: "failed",
        reason: taskResult.error?.reason || "failed",
        note: taskResult.error?.note || "Flow không làm được đoạn này.",
      });
      return { ok: false };
    } catch (err) {
      log(
        `Motion control: đoạn ${segment.i + 1}: ` + String(err?.message).slice(0, 120)
      );
      updateClip({
        state: "failed",
        reason: "failed",
        note: "Đoạn này gặp lỗi bất ngờ.",
      });
      return { ok: false };
    }
  }

  /**
   * Theo dõi trạng thái của một tác vụ trong hàng đợi cho đến khi kết thúc hoặc bị huỷ.
   */
  async function waitForTask(job, taskId, onStateChange) {
    let abortedAt = 0;
    for (;;) {
      const task = (queue.list() || []).find((item) => item.id === taskId);
      if (!task) {
        return { status: "cancelled" };
      }
      if (TERMINAL.has(task.status)) {
        return task;
      }
      if (job.ac.signal.aborted && !abortedAt) {
        abortedAt = now() || 1;
        if (task.status === "queued") {
          try {
            queue.cancel([taskId]);
          } catch {}
        }
      }
      if (abortedAt && now() - abortedAt > cancelGraceMs) {
        return {
          status: task.status === "running" ? "detached" : "cancelled",
        };
      }
      if (!abortedAt) {
        onStateChange(task.status === "running" ? "making" : "queued");
      }
      await sleep(POLL_MS);
    }
  }

  /**
   * Co giãn thời lượng từng đoạn video khớp với kế hoạch gốc và nối thành 1 file .mp4 hoàn chỉnh.
   */
  async function joinClips(job, emitProgress) {
    emitProgress({ stage: "join" });
    const outDir = saveDir();
    try {
      mkdirSync(outDir, { recursive: true });
    } catch (err) {
      return fail(
        "dir_unwritable",
        `Không ghi được vào thư mục lưu (${err.code || err.message}).`
      );
    }

    const probed = await Promise.all(
      job.clips.map((clip) => probe(ffmpegPath, clip.file, {}))
    );
    if (probed.some((info) => !info.ok || !info.hasVideo)) {
      return fail("not_video", "Một đoạn Flow trả về không đọc được.");
    }

    const joinInputs = job.plan.segments.map((seg, idx) => ({
      file: job.clips[idx].file,
      seconds: probed[idx].seconds,
      target: seg.seconds,
      hasAudio: probed[idx].hasAudio,
      hard: idx > 0 && startsHard(job.plan.segments, idx),
    }));

    const stamp = new Date(now())
      .toISOString()
      .replace(/[-:T]/g, "")
      .slice(2, 12);
    const outPath = path.join(outDir, `${job.name}-${stamp}-${job.id.slice(-4)}.mp4`);

    let joinPlan;
    try {
      joinPlan = planJoin({
        clips: joinInputs,
        output: outPath + ".part",
        ...sizeOf(job.ratio, job.resolution),
      });
    } catch (err) {
      return fail("bad_clip", "Không ghép được: " + err.message);
    }

    const joinRes = await run(ffmpegPath, joinPlan.args, {
      signal: job.ac.signal,
      timeoutMs: 30 * 60_000,
    });

    if (joinRes.aborted) {
      return fail("cancelled", "Đã huỷ.");
    }
    if (
      joinRes.spawnError ||
      joinRes.timedOut ||
      joinRes.code !== 0 ||
      !existsSync(outPath + ".part")
    ) {
      rmSync(outPath + ".part", { force: true });
      return fail(
        "ffmpeg_failed",
        "Ghép video không thành công. Các đoạn đã làm vẫn được giữ, bấm Tạo lại để ghép."
      );
    }

    // Nếu người dùng giữ nguyên ngôn ngữ gốc (không dịch lời thoại sang ngôn ngữ khác)
    // và video gốc có sẵn nhạc/âm thanh, tự động ghép lại âm thanh/nhạc gốc từ `job.video`
    // để thành phẩm giữ nguyên 100% nhạc nền và giai điệu gốc khi thay nhân vật.
    const isTranslated = job.plan.segments.some(
      (seg) =>
        typeof seg.translated === "string" &&
        seg.translated.trim() !== "" &&
        seg.translated.trim() !== String(seg.text || "").trim()
    );
    if ((job.keepMusic || !isTranslated) && existsSync(job.video)) {
      try {
        const srcProbe = await probe(ffmpegPath, job.video, {});
        if (srcProbe?.ok && srcProbe.hasAudio) {
          const muxedPart = outPath + ".muxed.mp4";
          const muxRes = await run(
            ffmpegPath,
            [
              "-hide_banner",
              "-nostdin",
              "-loglevel",
              "error",
              "-y",
              "-i",
              outPath + ".part",
              "-i",
              job.video,
              "-map",
              "0:v:0",
              "-map",
              "1:a:0",
              "-c:v",
              "copy",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-ar",
              "44100",
              "-ac",
              "2",
              "-shortest",
              "-movflags",
              "+faststart",
              muxedPart,
            ],
            { signal: job.ac.signal, timeoutMs: 60_000 }
          );
          if (
            !muxRes.aborted &&
            muxRes.code === 0 &&
            existsSync(muxedPart) &&
            statSync(muxedPart).size > 1000
          ) {
            rmSync(outPath + ".part", { force: true });
            renameSync(muxedPart, outPath + ".part");
          } else {
            rmSync(muxedPart, { force: true });
          }
        }
      } catch {
        // Giữ nguyên file .part nếu không mux được âm thanh gốc
      }
    }

    renameSync(outPath + ".part", outPath);
    return {
      ok: true,
      file: outPath,
      name: path.basename(outPath),
      seconds: joinPlan.totalSeconds,
      bytes: statSync(outPath).size,
    };
  }

  /**
   * Làm lại một đoạn bị lỗi (hoặc ghép lại nếu tất cả các đoạn đã xong nhưng bước ghép trước đó lỗi).
   * Hỗ trợ cập nhật danh sách ảnh nhân vật (`patch.images`), nền tảng (`patch.engine`) và lời thoại (`patch.lines`)
   * khi người dùng đổi ảnh hoặc nền tảng ở thanh bên trái trước khi bấm "Làm lại đoạn này".
   */
  async function retrySegment(jobId, segmentIndex, patch = {}) {
    const job = currentJob;
    if (!job || job.id !== jobId) {
      return fail("no_job", "Không còn video này để làm lại đoạn.");
    }
    if (!job.done) {
      return fail("busy", "Video đang chạy: chờ xong rồi mới làm lại đoạn.");
    }
    const targetClip = job.clips[segmentIndex];
    if (!targetClip) {
      return fail("bad_args", "Không có đoạn này.");
    }

    if (
      Array.isArray(patch?.images) &&
      patch.images.length >= 1 &&
      patch.images.length <= 5 &&
      patch.images.every(
        (img) => typeof img === "string" && path.isAbsolute(img) && existsSync(img)
      )
    ) {
      job.images = patch.images;
      job.normalizedImages = null;
      job.safeNormalizedImages = null;
      job.normalizedImagesPromise = null;
      job.safeNormalizedImagesPromise = null;
      job.cleanRefImage = null;
    }

    if (patch?.engine && ENGINES.includes(patch.engine)) {
      job.engine = patch.engine;
      try {
        job.price = jobCredits({
          segments: job.plan.segments,
          resolution: job.resolution,
          engine: job.engine,
        });
      } catch {}
    }

    if (typeof patch?.keepMusic === "boolean") {
      job.keepMusic = patch.keepMusic;
    }

    if (Array.isArray(patch?.lines)) {
      for (const item of patch.lines) {
        const seg = Number.isInteger(item?.i) ? job.plan.segments[item.i] : null;
        if (seg && typeof item.text === "string") {
          seg.text = item.text;
          seg.translated = typeof item.translated === "string" ? item.translated : seg.translated;
          seg.has_speech = Boolean(seg.translated || seg.text);
        }
      }
    }

    const emitProgress = (extra = {}) => {
      try {
        onProgress({
          jobId: job.id,
          clips: job.clips.map((clip) => ({ ...clip })),
          credits: job.price,
          ...extra,
        });
      } catch {}
    };

    if (job.clips.every((clip) => clip.state === "done")) {
      if (job.result?.ok) {
        return fail("bad_args", "Video đã ghép xong.");
      }
      job.done = false;
      job.ac = new AbortController();
      job.promise = finishOrJoin(job, emitProgress).catch(() =>
        completeJob(job, fail("failed", "Gặp lỗi bất ngờ khi ghép lại."), emitProgress)
      );
      return { ok: true };
    }

    if (
      !["failed", "cancelled"].includes(targetClip.state) ||
      targetClip.reason === "not_saved" ||
      targetClip.reason === "at_flow"
    ) {
      return fail("bad_args", "Đoạn này không làm lại được.");
    }

    const chain = chainsOf(job.plan.segments).find((c) =>
      c.some((seg) => seg.i === segmentIndex)
    );
    const posInChain = chain.findIndex((seg) => seg.i === segmentIndex);

    if (posInChain > 0 && job.clips[chain[posInChain - 1].i].state !== "done") {
      return fail("bad_args", "Làm lại đoạn trước của cảnh này trước.");
    }

    job.done = false;
    job.ac = new AbortController();

    const prevClipFile = posInChain > 0 ? job.clips[chain[posInChain - 1].i].file : "";
    const prevLastFramePath = prevClipFile
      ? path.join(job.dir, `last-${String(chain[posInChain - 1].i).padStart(3, "0")}.png`)
      : "";
    const tailSegments = chain.slice(posInChain);

    job.promise = (async () => {
      try {
        let lastFrame =
          prevLastFramePath && existsSync(prevLastFramePath) ? prevLastFramePath : "";
        for (const seg of tailSegments) {
          if (job.clips[seg.i].state === "done") break;
          const stepRes = await runSegment(job, seg, lastFrame, emitProgress);
          lastFrame = stepRes.ok ? stepRes.lastFrame : "";
          if (!stepRes.ok) break;
        }
        return await finishOrJoin(job, emitProgress);
      } catch {
        return completeJob(
          job,
          fail("failed", "Gặp lỗi bất ngờ khi làm lại đoạn."),
          emitProgress
        );
      }
    })();

    return { ok: true };
  }

  return {
    start,
    retrySegment,
    wait: () => currentJob?.promise,
    status: () =>
      currentJob
        ? {
            jobId: currentJob.id,
            done: currentJob.done,
            clips: currentJob.clips.map((clip) => ({ ...clip })),
            result: currentJob.result,
            credits: currentJob.price,
          }
        : null,
    cancel: () => {
      if (!currentJob || currentJob.done) {
        return { ok: false, reason: "no_job" };
      }
      currentJob.ac.abort();
      return { ok: true };
    },
    close: () => {
      if (!currentJob) return { ok: true };
      if (!currentJob.done) return { ok: false, reason: "busy" };
      try {
        rmSync(currentJob.dir, { recursive: true, force: true });
      } catch {}
      currentJob = null;
      return { ok: true };
    },
    stop: async () => {
      if (!currentJob) return;
      currentJob.ac.abort();
      try {
        await currentJob.promise;
      } catch {}
      try {
        rmSync(currentJob.dir, { recursive: true, force: true });
      } catch {}
      currentJob = null;
    },
  };
}
