/**
 * Phân nhóm các đoạn (segments) thành các chuỗi liên tiếp (chains),
 * tính toán chi phí credit và khởi tạo cấu trúc tác vụ (clipTask)
 * hỗ trợ song song Google Flow (`veo-ref`) và Muse AI (`muse`).
 */

import { REF_CEILING, REF_CONSENT, REF_MODEL, REF_MODELS, isRefModel } from "./veo-ref.js";
import { buildClipPrompt, voiceSentence } from "./motion-prompt.js";

/**
 * Danh sách các engine tạo video được hỗ trợ trong Motion Control.
 */
export const ENGINES = Object.freeze(["veo-ref", "muse"]);
export const FLOW_MODELS = Object.freeze([...REF_MODELS]);

/**
 * Danh sách các mức độ phân giải đầu ra được hỗ trợ trong Motion Control
 * (bao gồm 4K UHD, 2K QHD, Full HD 1080p được nâng cấp siêu phân giải từ luồng 720p gốc).
 */
export const MOTION_RESOLUTIONS = Object.freeze(["4k", "2k", "1080p", "720p", "360p"]);

export const MOTION_CEILING = Object.freeze({
  "4k": 20,
  "2k": 20,
  "1080p": 20,
  "720p": 20,
  "360p": 10,
});

/**
 * Gom danh sách các đoạn video thành các chuỗi (chains).
 * Một chuỗi mới bắt đầu ở đoạn đầu tiên (index 0) hoặc ngay sau đoạn có `cutAt === "scene"`.
 * Các đoạn trong cùng một chuỗi sẽ truyền khung hình cuối (lastFrame) cho đoạn kế tiếp.
 *
 * @param {Array<object>} segments - Danh sách đoạn kế hoạch.
 * @returns {Array<Array<object>>}
 */
export function chainsOf(segments) {
  if (!Array.isArray(segments) || !segments.length) {
    throw new RangeError("segments must be a non-empty list");
  }
  const chains = [];
  segments.forEach((segment, index) => {
    const isNewChain = index === 0 || segments[index - 1].cutAt === "scene";
    if (isNewChain) {
      chains.push([segment]);
    } else {
      chains.at(-1).push(segment);
    }
  });
  return chains;
}

/**
 * Kiểm tra xem đoạn tại `index` có bắt đầu bằng vết cắt cứng (hard cut / chuyển cảnh) hay không.
 * @param {Array<object>} segments
 * @param {number} index
 * @returns {boolean}
 */
export const startsHard = (segments, index) =>
  index === 0 || segments[index - 1].cutAt === "scene";

/**
 * Tính toán chi phí credit cho toàn bộ công việc Motion Control.
 * - Với `engine === "muse"`: chạy miễn phí qua cookie Muse AI (`perClip: 0, total: 0`).
 * - Với `engine === "veo-ref"`: tính theo bảng giá `REF_CEILING[resolution] * segments.length`.
 *
 * @param {object} options
 * @param {Array<object>} options.segments
 * @param {string} [options.resolution]
 * @param {string} [options.engine="veo-ref"]
 * @returns {{ perClip: number, clips: number, total: number, engine?: string }}
 */
export function jobCredits({ segments, resolution, engine = "veo-ref" }) {
  if (!ENGINES.includes(engine)) {
    throw new RangeError("unknown engine " + JSON.stringify(engine));
  }
  if (engine === "muse") {
    return {
      perClip: 0,
      clips: segments.length,
      total: 0,
      engine: "muse",
    };
  }
  const perClip = MOTION_CEILING[resolution] ?? REF_CEILING[resolution];
  if (perClip === undefined) {
    throw new RangeError("no price for the resolution " + JSON.stringify(resolution));
  }
  return {
    perClip,
    clips: segments.length,
    total: perClip * segments.length,
  };
}

/**
 * Tạo payload tác vụ hàng đợi cho một đoạn video.
 * - Hỗ trợ `engine === "muse"` (Muse AI `muse-video`, thời lượng 10s).
 * - Hỗ trợ `engine === "veo-ref"` (Google Flow Omni 1.1 Flash có video tham chiếu).
 *
 * @param {object} options
 * @param {object} options.segment
 * @param {boolean} options.first
 * @param {boolean} options.joinsPrevious
 * @param {string} [options.refVideoHandle]
 * @param {Array<string>} options.imageHandles
 * @param {string} [options.resolution]
 * @param {string} [options.ratio="9:16"]
 * @param {object} options.style
 * @param {string} [options.engine="veo-ref"]
 */
export function clipTask({
  segment,
  first,
  joinsPrevious,
  refVideoHandle,
  imageHandles,
  resolution,
  ratio = "9:16",
  style,
  engine = "veo-ref",
  flowModel = REF_MODEL,
}) {
  if (!ENGINES.includes(engine)) {
    throw new RangeError("unknown engine " + JSON.stringify(engine));
  }
  const { subject, scene, language, voice, voiceText } = style;
  const line = segment.has_speech ? segment.translated || segment.text || "" : "";
  const prompt = buildClipPrompt({
    subject,
    scene,
    line,
    language: language || "Vietnamese",
    voice: voiceSentence(voice, voiceText),
    joinsPrevious: Boolean(joinsPrevious),
    first: Boolean(first),
    ratio,
  });

  if (engine === "muse") {
    const cleanLine = String(line ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 360)
      .replace(/"/g, "'");
    const museParts = [
      "Proceed with the calm, elegant showcase: the same person and dress in the dark wood room background from the attached reference image, facing the camera directly.",
      "The subject stays facing forward toward the camera in the room with a gentle, graceful sway to let the outfit catch the light, subtle natural head and hand movement, and a warm, confident smile, no dance choreography.",
      "Keep the exact dark room background from the attached image unchanged and keep the subject facing forward (do not turn 360 degrees and do not use a white background).",
    ];
    if (joinsPrevious) {
      museParts.push(
        "Start seamlessly from the pose and framing of the last reference image."
      );
    }
    if (cleanLine) {
      const voiceDesc = voiceSentence(voice, voiceText);
      museParts.push(
        `The subject speaks/sings directly to the camera in ${language || "Vietnamese"}, in ${voiceDesc}, with lip movements matching the words, saying exactly: "${cleanLine}"`
      );
    }
    museParts.push(
      `${ratio === "16:9" ? "Horizontal 16:9" : "Vertical 9:16"}, steady camera framing, no subtitles, no text on screen.`
    );
    return {
      prompt: museParts.join(" "),
      ratio: ratio === "16:9" ? "16:9" : "9:16",
      duration: 10,
      model: "muse-video",
      mode: "muse",
      kind: "video",
      handles: imageHandles,
    };
  }

  const flowResolution = resolution === "360p" ? "360p" : "720p";
  const selectedModel = isRefModel(flowModel) ? flowModel : REF_MODEL;

  return {
    prompt,
    ratio,
    duration: 0,
    model: selectedModel,
    mode: "veo",
    handles: imageHandles,
    refVideo: refVideoHandle,
    resolution: flowResolution,
    consent: REF_CONSENT,
  };
}
