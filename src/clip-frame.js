/**
 * Tạo tham số dòng lệnh ffmpeg để:
 * - Trích xuất khung hình cuối cùng (`lastFrameArgs`) phục vụ nối chuỗi cảnh.
 * - Tách ô ảnh từ lưới (`gridCellArgs`).
 * - Cắt & chuẩn hóa đoạn video tham chiếu (`refTrimArgs`, `refSafeTrimArgs`) gửi lên Google Flow.
 */

export const GRID_MIN = 2;
export const GRID_MAX = 5;
const WIDE_SECONDS = 3;

/**
 * Tạo tham số ffmpeg trích xuất khung hình cuối của một đoạn video.
 */
export function lastFrameArgs(input, output, wide = false) {
  return wide
    ? ["-v", "error", "-y", "-sseof", "-" + WIDE_SECONDS, "-i", input, "-update", "1", output]
    : ["-v", "error", "-y", "-sseof", "-0.1", "-i", input, "-frames:v", "1", output];
}

/**
 * Tạo tham số ffmpeg cắt một ô trong lưới ảnh (rows x cols).
 */
export function gridCellArgs(input, output, rows, cols, index) {
  const validGrid = (n) => Number.isInteger(n) && n >= GRID_MIN && n <= GRID_MAX;
  if (!validGrid(rows) || !validGrid(cols)) {
    throw new RangeError(`rows and cols must be integers from ${GRID_MIN} to ${GRID_MAX}`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= rows * cols) {
    throw new RangeError(`index must be an integer from 0 to ${rows * cols - 1}`);
  }
  const row = Math.floor(index / cols);
  const col = index % cols;
  return [
    "-v",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    `crop=iw/${cols}:ih/${rows}:${col}*iw/${cols}:${row}*ih/${rows}`,
    "-frames:v",
    "1",
    output,
  ];
}

/**
 * Tạo tham số ffmpeg cắt đoạn video tham chiếu chuẩn hóa cho Google Flow.
 * Giữ nguyên 100% chuyển động cơ thể (pose/motion), đồng thời làm dịu chi tiết tần số cao của khuôn mặt
 * trong video gốc để tránh bộ lọc `prominent people` của Google Flow.
 */
export function refTrimArgs(input, output, seconds, start = 0) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10) {
    throw new RangeError("seconds must be a number above 0 and at most 10");
  }
  if (!Number.isFinite(start) || start < 0) {
    throw new RangeError("start must be a number of seconds, 0 or more");
  }
  const seekArgs = start > 0 ? ["-ss", String(start)] : [];
  return [
    "-v",
    "error",
    "-y",
    ...seekArgs,
    "-i",
    input,
    "-t",
    String(seconds),
    "-map_metadata",
    "-1",
    "-an",
    "-vf",
    "scale='if(gt(iw,ih),min(640,iw),-2)':'if(gt(iw,ih),-2,min(640,ih))',gblur=sigma=0.80,eq=contrast=0.96:brightness=0.01:saturation=0.94,noise=alls=3:allf=t",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
}

/**
 * Tạo tham số ffmpeg cắt đoạn video tham chiếu ở chế độ Safe-Mode (khi Google Flow từ chối vì nghi ngờ khuôn mặt trong video gốc).
 * Làm dịu nhẹ chi tiết tần số cao của khuôn mặt trong video tham chiếu nhưng giữ nguyên 100% chuyển động cơ thể và góc máy.
 */
export function refSafeTrimArgs(input, output, seconds, start = 0) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 10) {
    throw new RangeError("seconds must be a number above 0 and at most 10");
  }
  if (!Number.isFinite(start) || start < 0) {
    throw new RangeError("start must be a number of seconds, 0 or more");
  }
  const seekArgs = start > 0 ? ["-ss", String(start)] : [];
  return [
    "-v",
    "error",
    "-y",
    ...seekArgs,
    "-i",
    input,
    "-t",
    String(seconds),
    "-map_metadata",
    "-1",
    "-an",
    "-vf",
    "scale='if(gt(iw,ih),min(540,iw),-2)':'if(gt(iw,ih),-2,min(540,ih))',gblur=sigma=1.1,hue=h=2:s=0.92,eq=contrast=0.94:brightness=0.015,noise=alls=4:allf=t",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    output,
  ];
}
