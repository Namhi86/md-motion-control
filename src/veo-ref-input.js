import path from 'node:path';
import {
  REF_CONSENT,
  REF_MAX_BYTES,
  REF_MAX_IMAGES,
  REF_MIN_IMAGES,
  REF_RESOLUTIONS,
  isRefModel,
  refSecondsOf,
} from './veo-ref.js';

const VIDEO_EXT = /\.(mp4|mov)$/i;
const plain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const okPath = (p) =>
  typeof p === 'string' && p !== '' && !p.includes('\0') && path.isAbsolute(p);
const refuse = (at, why) => ({ ok: false, note: `${at}: ${why}` });

export function checkRefVideo(
  task,
  { at, mode, kind, model, imageCount, resolve, inspect, now = Date.now }
) {
  if (mode !== 'veo' || kind !== 'video') {
    return refuse(at, 'video tham chiếu chỉ dùng cho lệnh tạo video bằng Veo.');
  }
  if (!isRefModel(model)) {
    return refuse(at, 'video tham chiếu chỉ làm được bằng model Omni 1.2 Flash hoặc Omni 1.1 Flash.');
  }
  if (task.consent !== REF_CONSENT) {
    return refuse(at, 'thiếu xác nhận bạn có quyền dùng video tham chiếu này.');
  }
  if (!REF_RESOLUTIONS.includes(task.resolution)) {
    return refuse(at, `độ phân giải phải là ${REF_RESOLUTIONS.join(' hoặc ')}.`);
  }
  if (task.duration !== undefined && task.duration !== 0) {
    return refuse(at, 'video tham chiếu quyết định độ dài clip, không gửi số giây.');
  }
  if (imageCount < REF_MIN_IMAGES) {
    return refuse(at, 'video tham chiếu cần ít nhất một ảnh chủ thể.');
  }
  if (imageCount > REF_MAX_IMAGES) {
    return refuse(
      at,
      `video tham chiếu đi kèm tối đa ${REF_MAX_IMAGES} ảnh chủ thể (lệnh này có ${imageCount}).`
    );
  }
  if (typeof task.refVideo !== 'string' || !task.refVideo) {
    return refuse(at, 'không đọc được video tham chiếu, hãy chọn lại video.');
  }
  const fullPath = resolve(task.refVideo);
  if (!fullPath) {
    return refuse(at, 'video tham chiếu không còn trong phiên này, hãy chọn lại video.');
  }
  if (!okPath(fullPath)) {
    return refuse(at, 'video tham chiếu phải là đường dẫn đầy đủ.');
  }
  if (!VIDEO_EXT.test(fullPath)) {
    return refuse(at, 'video tham chiếu chỉ nhận tệp .mp4 hoặc .mov.');
  }
  if (typeof inspect !== 'function') {
    return refuse(at, 'app chưa đọc được video tham chiếu lúc này, hãy thử lại sau.');
  }
  const info = inspect(fullPath);
  if (!info?.ok) {
    return refuse(at, info?.note || 'không đọc được video tham chiếu.');
  }
  if (!(info.bytes <= REF_MAX_BYTES)) {
    return refuse(at, `video tham chiếu nặng quá ${REF_MAX_BYTES / 1024 / 1024} MB.`);
  }
  const refSeconds = refSecondsOf(info.meta?.seconds);
  if (refSeconds === null) {
    return refuse(
      at,
      'video tham chiếu ngắn quá hoặc không đọc được độ dài (cần ít nhất nửa giây).'
    );
  }
  return {
    ok: true,
    fields: {
      refVideo: fullPath,
      refSeconds,
      resolution: task.resolution,
      consent: REF_CONSENT,
      consentAt: new Date(now()).toISOString(),
    },
  };
}

export function refFieldsOf(task) {
  if (!plain(task) || task.refVideo === undefined || task.refVideo === null) {
    return {};
  }
  const refSeconds = task.refSeconds;
  const parsedAt =
    typeof task.consentAt === 'string' && task.consentAt.length <= 40
      ? Date.parse(task.consentAt)
      : NaN;
  const valid =
    okPath(task.refVideo) &&
    VIDEO_EXT.test(task.refVideo) &&
    typeof refSeconds === 'number' &&
    refSecondsOf(refSeconds) === refSeconds &&
    REF_RESOLUTIONS.includes(task.resolution) &&
    task.consent === REF_CONSENT &&
    Number.isFinite(parsedAt);
  return valid
    ? {
        refVideo: task.refVideo,
        refSeconds,
        resolution: task.resolution,
        consent: REF_CONSENT,
        consentAt: task.consentAt,
      }
    : null;
}
