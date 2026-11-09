/**
 * Đăng ký các kênh IPC cho tính năng Motion Control (`motion:*`).
 * Hỗ trợ lưu lựa chọn (choices) và khởi chạy công việc với cả 2 engine:
 * `"veo-ref"` (Google Flow, mặc định) và `"muse"` (Muse AI).
 */

import { ENGINES, MOTION_RESOLUTIONS } from "../src/motion-chains.js";
import { planFromCuts, priceOf } from "../src/motion-plan.js";
import { sliceBySegments } from "../src/motion-transcript.js";
import { plainSegment } from "./motion-session.js";

const fail = (reason, note) => ({
  ok: false,
  reason,
  note,
});

const HANDLE = /^[a-f0-9]{32}$/;

const text = (val, maxLen) =>
  typeof val === "string" && val.length <= maxLen
    ? val.replace(/\s+/g, " ").trim()
    : undefined;

export const VIDEO_EXT = /\.(mp4|mov|m4v|mkv|webm)$/i;
export const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
export const MAX_LINE_CHARS = 600;
export const MAX_IMAGES = 5;
export const MAX_CUTS = 600;

const SAME_RANGE = 0.05;
const RATIOS = ["auto", "9:16", "16:9"];

const baseName = (filePath) =>
  String(filePath)
    .split(/[\\/]/)
    .pop()
    .slice(0, 120);

const DROPPED = {
  video_changed:
    'Video đã bị thay đổi từ lần làm trước nên Motion control không giữ lại kế hoạch cũ. Hãy chọn video và bấm "Phân tích video" lại.',
  video_missing:
    'Không thấy tệp video của lần làm trước (đã bị xoá hoặc di chuyển) nên Motion control không giữ lại kế hoạch cũ. Hãy chọn video và bấm "Phân tích video" lại.',
};

const NO_SESSION = {
  save: () => false,
  load: () => null,
  clear: () => {},
};

/**
 * Kiểm tra và làm sạch đối tượng tùy chọn (choices) của người dùng.
 * Cho phép lưu thêm trường `engine` ("veo-ref" hoặc "muse").
 */
function checkChoices(raw) {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const out = {};
  if (raw.resolution !== undefined) {
    if (!MOTION_RESOLUTIONS.includes(raw.resolution)) return undefined;
    out.resolution = raw.resolution;
  }
  if (raw.ratio !== undefined) {
    if (!RATIOS.includes(raw.ratio)) return undefined;
    out.ratio = raw.ratio;
  }
  if (raw.engine !== undefined) {
    if (!ENGINES.includes(raw.engine)) return undefined;
    out.engine = raw.engine;
  }
  if (raw.audioMode !== undefined) {
    if (raw.audioMode !== "keep" && raw.audioMode !== "speech") return undefined;
    out.audioMode = raw.audioMode;
  }
  if (raw.keepMusic !== undefined) {
    out.keepMusic = Boolean(raw.keepMusic);
  }
  for (const [key, maxLen] of [
    ["language", 40],
    ["voiceText", 160],
    ["subject", 300],
    ["scene", 400],
  ]) {
    if (raw[key] === undefined) continue;
    const cleaned = text(raw[key], maxLen);
    if (cleaned === undefined) return undefined;
    out[key] = cleaned;
  }
  return out;
}

const viewClip = (clip) => ({
  i: clip.i,
  state: clip.state,
  reason: clip.reason || "",
  note: clip.note || "",
});

/**
 * Thiết lập toàn bộ các IPC handler cho tab Motion Control.
 */
export function setupMotion({
  ipc,
  prepare,
  makeJob,
  resolveHandle,
  addHandle,
  choose = async () => [],
  statFile,
  session = NO_SESSION,
  handleUrl,
  transcriber,
  ffmpegPath,
  send = () => {},
  log = () => {},
} = {}) {
  let activeJob = null;
  let cleanupPrepare = null;
  let current = null;
  let prepareController = null;
  let prepareSeq = 0;

  const clearPrepareState = () => {
    try {
      cleanupPrepare?.();
    } catch {}
    cleanupPrepare = null;
    current = null;
  };

  const forwardProgress = (evt) => {
    const hasFile = evt.result && evt.result.ok !== false && evt.result.file;
    send("motion:progress", {
      jobId: evt.jobId,
      stage: evt.stage,
      clips: (evt.clips || []).map(viewClip),
      credits: evt.credits,
      ...(evt.result
        ? {
            result: hasFile
              ? {
                  url: handleUrl(evt.result.file),
                  name: evt.result.name,
                  seconds: evt.result.seconds,
                }
              : {
                  reason: evt.result.reason,
                  note: evt.result.note,
                },
          }
        : {}),
    });
  };

  const isJobRunning = () => Boolean(activeJob?.status() && !activeJob.status().done);

  const persistSession = () => {
    const state = current;
    if (!state || !state.videoMeta) return;
    session.save({
      video: {
        path: state.video,
        size: state.videoMeta.size,
        mtimeMs: state.videoMeta.mtimeMs,
      },
      images: state.images,
      duration: state.plan.duration,
      hasAudio: state.hasAudio,
      width: state.width,
      height: state.height,
      envelope: state.envelope,
      snaps: state.snaps,
      voice: state.voice,
      translated: state.translated,
      translateTo: state.translateTo,
      phrases: state.phrases,
      segments: state.plan.segments.map(plainSegment),
      ...(state.transcriptError ? { transcriptError: state.transcriptError } : {}),
      choices: state.choices,
      ...(state.selected === null ? {} : { selected: state.selected }),
    });
  };

  const ensureJob = () =>
    (activeJob ??= makeJob({
      onProgress: (evt) => forwardProgress(evt),
    }));

  /**
   * Kiểm tra tệp video người dùng chọn hoặc kéo thả vào ứng dụng.
   */
  function validateVideoFile(filePath) {
    if (
      typeof filePath !== "string" ||
      !filePath ||
      filePath.includes("\0") ||
      !/^(\/|[A-Za-z]:[\\/])/.test(filePath)
    ) {
      return { ok: false, note: "Không đọc được đường dẫn của tệp video." };
    }
    if (!VIDEO_EXT.test(filePath)) {
      return {
        ok: false,
        note: "Motion control nhận video .mp4, .mov, .m4v, .mkv hoặc .webm.",
      };
    }
    const stat = statFile(filePath);
    if (!stat || !stat.isFile()) {
      return {
        ok: false,
        note: "Không thấy tệp video này (đã bị xoá hoặc di chuyển).",
      };
    }
    if (stat.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        note: `Video nặng quá ${MAX_VIDEO_BYTES / 1024 / 1024 / 1024} GB.`,
      };
    }
    if (stat.size < 1024) {
      return { ok: false, note: "Tệp video này trống hoặc hỏng." };
    }
    return {
      ok: true,
      handle: addHandle(filePath),
      name: String(filePath).split(/[\\/]/).pop().slice(0, 120),
      bytes: stat.size,
    };
  }

  const firstString = (list) =>
    (Array.isArray(list) ? list : []).find((item) => typeof item === "string" && item);

  /**
   * Xử lý yêu cầu phân tích video (`motion:prepare`).
   */
  async function handlePrepare(payload) {
    if (prepareController) {
      return fail("busy", "Motion control đang đọc một video: chờ xong hoặc bấm Huỷ.");
    }
    if (isJobRunning()) {
      return fail(
        "busy",
        "Motion control đang làm một video: chờ xong rồi mới đọc video khác."
      );
    }

    const handle =
      typeof payload?.videoHandle === "string" && HANDLE.test(payload.videoHandle)
        ? payload.videoHandle
        : null;
    const videoPath = handle ? resolveHandle(handle) : null;
    if (!videoPath) {
      return fail("bad_args", "Video không còn trong phiên này, hãy chọn lại video.");
    }

    const translateTo =
      payload.translateTo === undefined ? "" : text(payload.translateTo, 40);
    if (translateTo === undefined) {
      return fail("bad_args", "Ngôn ngữ dịch không hợp lệ.");
    }
    const keepMusic =
      payload?.keepMusic !== undefined ? Boolean(payload.keepMusic) : !translateTo;

    const stat = statFile(videoPath);
    const videoMeta =
      stat && stat.isFile()
        ? {
            size: stat.size,
            mtimeMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : 0,
          }
        : null;

    const prevImages = Array.isArray(current?.images) ? current.images : [];
    const prevChoices = current?.choices || null;
    clearPrepareState();
    session.clear();

    const ac = new AbortController();
    prepareController = ac;
    try {
      const prep = await prepare({
        ffmpegPath,
        video: videoPath,
        signal: ac.signal,
        transcribe: keepMusic && !translateTo ? null : transcriber,
        translateTo,
        onStage: (stageText) =>
          send("motion:progress", {
            stage: "prepare",
            text: String(stageText).slice(0, 80),
          }),
        log,
      });

      if (!prep.ok) {
        return fail(prep.reason, prep.note);
      }

      cleanupPrepare = prep.cleanup;
      current = {
        id: "p" + (prepareSeq += 1),
        video: videoPath,
        plan: {
          segments: prep.segments,
          duration: prep.duration,
        },
        phrases: prep.phrases || [],
        transcriptError: prep.transcriptError || null,
        width: prep.width,
        height: prep.height,
        voice: prep.voice,
        translated: prep.translated,
        translateTo,
        hasAudio: prep.hasAudio,
        fullWav: prep.fullWav || "",
        snaps: prep.snaps || { pauses: [], scenes: [] },
        videoMeta,
        envelope: Array.isArray(prep.envelope) ? prep.envelope : [],
        images: prevImages,
        choices: prevChoices,
        selected: null,
      };

      persistSession();
      return {
        ok: true,
        prepareId: current.id,
        duration: prep.duration,
        hasAudio: prep.hasAudio,
        width: prep.width,
        height: prep.height,
        voice: prep.voice,
        envelope: current.envelope,
        segments: prep.segments,
        snaps: current.snaps,
        price: priceOf({ segments: prep.segments, resolution: "720p" }),
        transcriptError: prep.transcriptError || undefined,
      };
    } finally {
      prepareController = null;
    }
  }

  /**
   * Xử lý yêu cầu chia lại các đoạn video theo vạch cắt (`motion:replan`).
   */
  async function handleReplan(payload) {
    if (!payload || typeof payload !== "object") {
      return fail("bad_args", "Thiếu yêu cầu.");
    }
    if (prepareController) {
      return fail(
        "busy",
        "Motion control đang đọc video hoặc dựng lại các đoạn: chờ xong hoặc bấm Huỷ."
      );
    }
    if (activeJob?.status() && !activeJob.status().done) {
      return fail(
        "busy",
        "Motion control đang làm một video: chờ xong rồi mới sửa các đoạn."
      );
    }

    const state = current;
    if (!state || payload.prepareId !== state.id) {
      return fail("no_prepare", 'Hãy đọc video trước (bấm "Phân tích video").');
    }

    const { cuts } = payload;
    const validCut = (c) => Number.isFinite(c) && c > 0 && c < state.plan.duration;
    if (
      !Array.isArray(cuts) ||
      cuts.length > MAX_CUTS ||
      !cuts.every((c, idx) => validCut(c) && (idx === 0 || c > cuts[idx - 1]))
    ) {
      return fail("bad_args", "Các vạch cắt không hợp lệ.");
    }

    const customLines = [];
    if (payload.lines !== undefined && !Array.isArray(payload.lines)) {
      return fail("bad_args", "Lời của các đoạn không hợp lệ.");
    }
    for (const item of payload.lines ?? []) {
      const cleanText = text(item?.text ?? "", MAX_LINE_CHARS);
      const cleanTrans = text(item?.translated ?? "", MAX_LINE_CHARS);
      if (
        !Number.isFinite(item?.start) ||
        !Number.isFinite(item?.end) ||
        cleanText === undefined ||
        cleanTrans === undefined
      ) {
        return fail("bad_args", "Lời của một đoạn không hợp lệ.");
      }
      customLines.push({
        start: item.start,
        end: item.end,
        text: cleanText,
        translated: cleanTrans,
      });
    }

    const replanned = planFromCuts({
      duration: state.plan.duration,
      cuts,
      scenes: state.snaps.scenes,
      pauses: state.snaps.pauses,
    });
    if (!replanned.ok) {
      return {
        ...fail("bad_piece", replanned.note),
        at: replanned.at,
      };
    }

    const sameBounds = (a, b) =>
      Math.abs(a.start - b.start) <= SAME_RANGE &&
      Math.abs(a.end - b.end) <= SAME_RANGE;

    const slicedSpeech = sliceBySegments(state.phrases, replanned.segments);
    const nextSegments = replanned.segments.map((seg, idx) => {
      const matchedLine =
        customLines.find((item) => sameBounds(item, seg)) ??
        state.plan.segments.find((item) => sameBounds(item, seg));
      const speechPart = matchedLine
        ? {
            ...slicedSpeech[idx],
            text: matchedLine.text,
            translated: matchedLine.translated,
            has_speech: Boolean(matchedLine.text || matchedLine.translated),
          }
        : slicedSpeech[idx];
      return {
        ...seg,
        ...speechPart,
      };
    });

    state.plan = {
      ...state.plan,
      segments: nextSegments,
    };
    if (state.selected !== null && state.selected >= nextSegments.length) {
      state.selected = null;
    }

    persistSession();
    return {
      ok: true,
      segments: nextSegments,
      price: priceOf({ segments: nextSegments, resolution: "720p" }),
      transcriptError:
        state.phrases.length || !state.transcriptError
          ? undefined
          : state.transcriptError,
    };
  }

  const mapSessionImages = (state) =>
    state.images.map((imgPath) => ({
      handle: addHandle(imgPath),
      name: baseName(imgPath),
    }));

  function formatRestoredSession(state) {
    const flowRes = state.choices?.resolution === "360p" ? "360p" : "720p";
    const segments = state.plan.segments.map(plainSegment);
    return {
      ok: true,
      prepareId: state.id,
      duration: state.plan.duration,
      hasAudio: state.hasAudio,
      width: state.width,
      height: state.height,
      envelope: state.envelope,
      snaps: state.snaps,
      segments,
      voice: state.voice,
      price: priceOf({ segments, resolution: flowRes }),
      video: {
        handle: addHandle(state.video),
        name: baseName(state.video),
        bytes: state.videoMeta?.size ?? 0,
      },
      images: mapSessionImages(state),
      choices: state.choices,
      selected: state.selected,
      ...(state.transcriptError ? { transcriptError: state.transcriptError } : {}),
      restored: true,
    };
  }

  /**
   * Khôi phục phiên làm việc từ bộ nhớ hoặc tệp lưu nháp (`motion:session`).
   */
  async function handleSession() {
    if (current) return formatRestoredSession(current);
    if (prepareController) return null;

    const loaded = session.load();
    if (!loaded) return null;
    if (loaded.dropped) {
      session.clear();
      return {
        ok: false,
        dropped: loaded.dropped,
        note: DROPPED[loaded.dropped] || DROPPED.video_changed,
      };
    }

    current = {
      id: "p" + (prepareSeq += 1),
      video: loaded.video.path,
      videoMeta: {
        size: loaded.video.size,
        mtimeMs: loaded.video.mtimeMs,
      },
      plan: {
        segments: loaded.segments,
        duration: loaded.duration,
      },
      phrases: loaded.phrases,
      transcriptError: loaded.transcriptError,
      width: loaded.width,
      height: loaded.height,
      voice: loaded.voice,
      translated: loaded.translated,
      translateTo: loaded.translateTo,
      hasAudio: loaded.hasAudio,
      fullWav: "",
      snaps: loaded.snaps,
      envelope: loaded.envelope,
      images: loaded.images,
      choices: loaded.choices ? checkChoices(loaded.choices) ?? null : null,
      selected: loaded.selected,
    };

    return formatRestoredSession(current);
  }

  /**
   * Lưu bản nháp cấu hình, lời thoại, ảnh nhân vật và tùy chọn (`motion:saveDraft`).
   */
  async function handleSaveDraft(payload) {
    if (!payload || typeof payload !== "object") {
      return fail("bad_args", "Thiếu yêu cầu.");
    }
    if (!current || payload.prepareId !== current.id) {
      return fail("no_prepare", 'Hãy đọc video trước (bấm "Phân tích video").');
    }

    const updatedLines = [];
    if (payload.lines !== undefined) {
      if (!Array.isArray(payload.lines) || payload.lines.length > MAX_CUTS + 1) {
        return fail("bad_args", "Lời của các đoạn không hợp lệ.");
      }
      for (const item of payload.lines) {
        const cleanText = text(item?.text ?? "", MAX_LINE_CHARS);
        const cleanTrans = text(item?.translated ?? "", MAX_LINE_CHARS);
        if (
          !Number.isFinite(item?.start) ||
          !Number.isFinite(item?.end) ||
          cleanText === undefined ||
          cleanTrans === undefined
        ) {
          return fail("bad_args", "Lời của một đoạn không hợp lệ.");
        }
        updatedLines.push({
          start: item.start,
          end: item.end,
          text: cleanText,
          translated: cleanTrans,
        });
      }
    }

    const checkedChoices =
      payload.choices === undefined ? undefined : checkChoices(payload.choices);
    if (payload.choices !== undefined && !checkedChoices) {
      return fail(
        "bad_args",
        "Lựa chọn chất lượng, khung hình hoặc giọng không hợp lệ."
      );
    }

    let resolvedImages;
    if (payload.imageHandles !== undefined) {
      const handles = payload.imageHandles;
      if (
        !Array.isArray(handles) ||
        handles.length > MAX_IMAGES ||
        !handles.every((h) => typeof h === "string" && HANDLE.test(h))
      ) {
        return fail("bad_args", `Ảnh nhân vật phải từ 0 đến ${MAX_IMAGES} ảnh.`);
      }
      resolvedImages = handles.map((h) => resolveHandle(h));
      if (resolvedImages.some((p) => !p)) {
        return fail(
          "bad_args",
          "Ảnh nhân vật không còn trong phiên này, hãy chọn lại ảnh."
        );
      }
    }

    const segCount = current.plan.segments.length;
    if (
      payload.selected !== undefined &&
      payload.selected !== null &&
      !(
        Number.isInteger(payload.selected) &&
        payload.selected >= 0 &&
        payload.selected < segCount
      )
    ) {
      return fail("bad_args", "Đoạn được chọn không hợp lệ.");
    }

    const sameBounds = (a, b) =>
      Math.abs(a.start - b.start) <= SAME_RANGE &&
      Math.abs(a.end - b.end) <= SAME_RANGE;

    if (updatedLines.length) {
      current.plan = {
        ...current.plan,
        segments: current.plan.segments.map((seg) => {
          const matched = updatedLines.find((item) => sameBounds(item, seg));
          return matched
            ? {
                ...seg,
                text: matched.text,
                translated: matched.translated,
                has_speech: Boolean(matched.text || matched.translated),
              }
            : seg;
        }),
      };
    }

    if (checkedChoices) {
      current.choices = { ...(current.choices || {}), ...checkedChoices };
    }
    if (resolvedImages) {
      current.images = resolvedImages;
    }
    if (payload.selected !== undefined) {
      current.selected = payload.selected;
    }

    persistSession();
    return { ok: true };
  }

  /**
   * Bắt đầu tiến trình tạo video Motion Control (`motion:start`).
   */
  async function handleStart(payload) {
    if (!payload || typeof payload !== "object") {
      return fail("bad_args", "Thiếu yêu cầu.");
    }
    if (!current || payload.prepareId !== current.id) {
      return fail(
        "no_prepare",
        'Hãy đọc video trước (bấm "Phân tích video"), rồi mới bấm Tạo.'
      );
    }
    if (prepareController) {
      return fail(
        "busy",
        "Motion control đang dựng lại các đoạn: chờ xong rồi mới bấm Tạo."
      );
    }

    const imageHandles = Array.isArray(payload.imageHandles)
      ? payload.imageHandles
      : null;
    if (
      !imageHandles ||
      imageHandles.length < 1 ||
      imageHandles.length > MAX_IMAGES ||
      !imageHandles.every((h) => typeof h === "string" && HANDLE.test(h))
    ) {
      return fail("bad_args", `Cần từ 1 đến ${MAX_IMAGES} ảnh nhân vật.`);
    }

    const images = imageHandles.map((h) => resolveHandle(h));
    if (images.some((p) => !p)) {
      return fail(
        "bad_args",
        "Ảnh nhân vật không còn trong phiên này, hãy chọn lại ảnh."
      );
    }

    const resolution =
      payload.resolution === undefined ? "2k" : payload.resolution;
    if (!MOTION_RESOLUTIONS.includes(resolution)) {
      return fail(
        "bad_args",
        "Chất lượng phải là " + MOTION_RESOLUTIONS.join(", ") + "."
      );
    }

    const rawRatio = payload.ratio === undefined ? "auto" : payload.ratio;
    if (!["auto", "9:16", "16:9"].includes(rawRatio)) {
      return fail("bad_args", "Khung hình phải là tự động, 9:16 hoặc 16:9.");
    }
    const ratio =
      rawRatio === "auto"
        ? current.width > current.height
          ? "16:9"
          : "9:16"
        : rawRatio;

    const engine =
      payload.engine === undefined
        ? current.choices?.engine || "veo-ref"
        : payload.engine;
    if (!ENGINES.includes(engine)) {
      return fail("bad_args", "Engine phải là " + ENGINES.join(" hoặc ") + ".");
    }

    const keepMusic =
      payload.keepMusic !== undefined
        ? Boolean(payload.keepMusic)
        : current.choices?.audioMode !== "speech";

    const segments = current.plan.segments.map((seg) => ({
      ...seg,
      ...(keepMusic ? { text: "", translated: "", has_speech: false } : {}),
    }));
    if (!keepMusic) {
      for (const item of Array.isArray(payload.lines) ? payload.lines : []) {
        const targetSeg = Number.isInteger(item?.i) ? segments[item.i] : null;
        const cleanText = text(item?.text ?? "", MAX_LINE_CHARS);
        const cleanTrans = text(item?.translated ?? "", MAX_LINE_CHARS);
        if (!targetSeg || cleanText === undefined || cleanTrans === undefined) {
          return fail("bad_args", "Lời của một đoạn không hợp lệ.");
        }
        Object.assign(targetSeg, {
          text: cleanText,
          translated: cleanTrans,
          has_speech: Boolean(cleanTrans || cleanText),
        });
      }
    }

    const subject = text(
      payload.subject ??
        "The fictional adult character from the reference image (wearing the same outfit and hairstyle)",
      300
    );
    const scene = text(
      payload.scene ??
        "is in the same place, with the same light and camera framing as the reference video",
      400
    );
    const language = text(payload.language ?? "Vietnamese", 40);
    const voiceText =
      payload.voiceText === undefined ? "" : text(payload.voiceText, 160);
    const rawName = text(payload.name ?? "copy-motion", 40);

    if (
      [subject, scene, language, rawName].some((val) => !val) ||
      voiceText === undefined
    ) {
      return fail("bad_args", "Mô tả nhân vật, cảnh hoặc giọng không hợp lệ.");
    }

    const safeName =
      rawName.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "copy-motion";

    const started = await ensureJob().start({
      video: current.video,
      plan: { segments },
      images,
      style: {
        subject,
        scene,
        language,
        voice: current.voice,
        voiceText,
      },
      resolution,
      ratio,
      engine,
      keepMusic,
      name: safeName,
    });

    return started.ok ? started : fail(started.reason, started.note);
  }

  const wrapChannel = (name, handler) => async (_event, payload) => {
    try {
      return await handler(payload);
    } catch (err) {
      log(
        `Lỗi ở kênh Motion control (${name}): ` + String(err?.message).slice(0, 100)
      );
      return fail("failed", "Motion control gặp lỗi bất ngờ. Thử lại sau ít phút.");
    }
  };

  ipc.handle(
    "motion:pickVideo",
    wrapChannel("pickVideo", async () => {
      const chosen = firstString(await choose());
      return chosen ? validateVideoFile(chosen) : null;
    })
  );

  ipc.handle(
    "motion:dropVideo",
    wrapChannel("dropVideo", async (paths) => {
      const dropped = firstString(paths);
      return dropped ? validateVideoFile(dropped) : null;
    })
  );

  ipc.handle("motion:prepare", wrapChannel("prepare", handlePrepare));
  ipc.handle("motion:replan", wrapChannel("replan", handleReplan));
  ipc.handle("motion:start", wrapChannel("start", handleStart));

  ipc.handle(
    "motion:retry",
    wrapChannel("retry", async (payload) => {
      const segIdx = payload?.i;
      if (
        !activeJob ||
        typeof payload?.jobId !== "string" ||
        !Number.isInteger(segIdx)
      ) {
        return fail("bad_args", "Thiếu thông tin đoạn cần làm lại.");
      }
      let retryImages = null;
      if (
        Array.isArray(payload?.imageHandles) &&
        payload.imageHandles.length >= 1 &&
        payload.imageHandles.length <= MAX_IMAGES &&
        payload.imageHandles.every((h) => typeof h === "string" && HANDLE.test(h))
      ) {
        const resolved = payload.imageHandles.map((h) => resolveHandle(h));
        if (resolved.every(Boolean)) {
          retryImages = resolved;
          if (current) {
            current.images = resolved;
            persistSession();
          }
        }
      } else if (Array.isArray(current?.images) && current.images.length >= 1) {
        retryImages = current.images;
      }

      const retryEngine =
        typeof payload?.engine === "string" && ENGINES.includes(payload.engine)
          ? payload.engine
          : current?.choices?.engine && ENGINES.includes(current.choices.engine)
            ? current.choices.engine
            : undefined;

      const retryKeepMusic =
        payload?.keepMusic !== undefined
          ? Boolean(payload.keepMusic)
          : current?.choices?.audioMode !== undefined
            ? current.choices.audioMode !== "speech"
            : undefined;

      const res = await activeJob.retrySegment(payload.jobId, segIdx, {
        images: retryImages,
        engine: retryEngine,
        keepMusic: retryKeepMusic,
        lines: Array.isArray(payload?.lines) ? payload.lines : undefined,
      });
      return res.ok ? res : fail(res.reason, res.note);
    })
  );

  ipc.handle(
    "motion:cancel",
    wrapChannel("cancel", async () => {
      if (prepareController) {
        prepareController.abort();
        return { ok: true };
      }
      return activeJob ? activeJob.cancel() : { ok: false, reason: "no_job" };
    })
  );

  ipc.handle(
    "motion:status",
    wrapChannel("status", async () => {
      const st = activeJob?.status();
      if (!st) return null;
      const res = st.result;
      return {
        jobId: st.jobId,
        done: st.done,
        clips: st.clips.map(viewClip),
        credits: st.credits,
        result: res
          ? res.ok
            ? {
                url: handleUrl(res.file),
                name: res.name,
                seconds: res.seconds,
              }
            : {
                reason: res.reason,
                note: res.note,
              }
          : null,
      };
    })
  );

  ipc.handle(
    "motion:close",
    wrapChannel("close", async () => {
      const res = activeJob ? activeJob.close() : { ok: true };
      if (res.ok) {
        clearPrepareState();
        session.clear();
      }
      return res;
    })
  );

  ipc.handle("motion:session", wrapChannel("session", handleSession));
  ipc.handle("motion:saveDraft", wrapChannel("saveDraft", handleSaveDraft));

  ipc.handle(
    "motion:discardSession",
    wrapChannel("discardSession", async () => {
      if (prepareController || isJobRunning()) {
        return fail(
          "busy",
          "Motion control đang đọc video hoặc làm phim: chờ xong rồi mới bỏ kế hoạch."
        );
      }
      clearPrepareState();
      session.clear();
      return { ok: true };
    })
  );

  return {
    stop: async () => {
      prepareController?.abort();
      await activeJob?.stop();
      clearPrepareState();
    },
  };
}
