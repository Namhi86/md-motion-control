/**
 * Lập kế hoạch ghép nối (planJoin) và nâng cấp siêu phân giải (2K QHD / 4K UHD) cho các đoạn video Motion Control.
 * - Co giãn thời lượng từng đoạn khớp mili-giây với kế hoạch gốc.
 * - Hỗ trợ chuyển cảnh mượt (xfade / acrossfade) hoặc cắt cứng (hard cut).
 * - Tích hợp chuỗi lọc Siêu Phân Giải (Lanczos + Contrast Adaptive Sharpening CAS + Unsharp Mask + Deband)
 *   khi xuất ở độ phân giải Full HD 1080p, 2K QHD (1440x2560) hoặc 4K UHD (2160x3840).
 */

import path from "node:path";

export const FADE = 0.12;
export const WIDTH = 720;
export const HEIGHT = 1280;
export const FPS = 30;

const MIN_CLIP = 0.5;

const RESOLUTION_DIMS = Object.freeze({
  "4k": { short: 2160, long: 3840 },
  "2k": { short: 1440, long: 2560 },
  "1080p": { short: 1080, long: 1920 },
  "720p": { short: 720, long: 1280 },
  "360p": { short: 360, long: 640 },
});

/**
 * Tính toán kích thước khung hình đầu ra (width, height) theo tỷ lệ và mức chất lượng.
 * @param {string} ratio - "9:16" hoặc "16:9"
 * @param {string} [resolution="720p"] - "4k" | "2k" | "1080p" | "720p" | "360p"
 * @returns {{ width: number, height: number }}
 */
export function sizeOf(ratio, resolution = "720p") {
  const dims = RESOLUTION_DIMS[resolution] || RESOLUTION_DIMS["720p"];
  return ratio === "16:9"
    ? { width: dims.long, height: dims.short }
    : { width: dims.short, height: dims.long };
}

const two = (val) => (Math.round(val * 1000) / 1000).toFixed(3);

/**
 * Tạo mảng đối số dòng lệnh ffmpeg để co giãn thời lượng, nâng cấp độ nét 2K/4K và nối các đoạn clip.
 */
export function planJoin({
  clips,
  output,
  width = WIDTH,
  height = HEIGHT,
} = {}) {
  if (!Array.isArray(clips) || clips.length < 1) {
    throw new RangeError("need at least one clip");
  }
  if (typeof output !== "string" || !path.isAbsolute(output)) {
    throw new TypeError("output must be an absolute path");
  }

  const isHiRes = Math.max(width, height) >= 1920;
  const sharpenChain = isHiRes
    ? ",cas=0.55"
    : ",cas=0.35";

  const args = [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-progress",
    "pipe:1",
    "-nostats",
  ];
  const filterParts = [];
  const durations = [];

  clips.forEach((clip, idx) => {
    if (!clip || typeof clip.file !== "string" || !path.isAbsolute(clip.file)) {
      throw new TypeError(`clip ${idx}: file must be an absolute path`);
    }
    for (const key of ["seconds", "target"]) {
      if (
        typeof clip[key] !== "number" ||
        !Number.isFinite(clip[key]) ||
        clip[key] < MIN_CLIP
      ) {
        throw new RangeError(`clip ${idx}: ${key} must be at least ${MIN_CLIP} s`);
      }
    }
    const stretch = clip.target / clip.seconds;
    if (stretch > 1.5 || stretch < 0.7) {
      throw new RangeError(
        `clip ${idx}: stretch ${stretch.toFixed(2)}x is outside 0.7..1.5`
      );
    }
    const targetDur = Number(two(clip.target));
    durations.push(targetDur);
    args.push("-i", clip.file);

    filterParts.push(
      `[${idx}:v:0]setpts=${two(stretch)}*(PTS-STARTPTS),scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos+accurate_rnd+full_chroma_int,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black${sharpenChain},setsar=1,fps=${FPS},format=yuv420p,trim=duration=${two(targetDur)},setpts=PTS-STARTPTS[v${idx}]`
    );

    filterParts.push(
      clip.hasAudio
        ? `[${idx}:a:0]atempo=${two(1 / stretch)},aresample=44100,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=whole_dur=${two(targetDur)},atrim=duration=${two(targetDur)},asetpts=PTS-STARTPTS[a${idx}]`
        : `anullsrc=r=44100:cl=stereo,atrim=duration=${two(targetDur)},asetpts=PTS-STARTPTS[a${idx}]`
    );
  });

  let curV = "v0";
  let curA = "a0";
  let totalDur = durations[0];

  for (let i = 1; i < clips.length; i += 1) {
    const nextV = `vj${i}`;
    const nextA = `aj${i}`;
    if (clips[i].hard) {
      filterParts.push(
        `[v${i}]trim=start=${two(FADE)},setpts=PTS-STARTPTS[vt${i}]`
      );
      filterParts.push(
        `[${curV}][vt${i}]concat=n=2:v=1:a=0,settb=1/${FPS}[${nextV}]`
      );
      filterParts.push(
        `[${curA}][a${i}]acrossfade=d=${two(FADE)}:c1=tri:c2=tri[${nextA}]`
      );
      totalDur = totalDur + durations[i] - FADE;
    } else {
      filterParts.push(
        `[${curV}][v${i}]xfade=transition=fade:duration=${two(FADE)}:offset=${two(totalDur - FADE)},settb=1/${FPS}[${nextV}]`
      );
      filterParts.push(
        `[${curA}][a${i}]acrossfade=d=${two(FADE)}:c1=tri:c2=tri[${nextA}]`
      );
      totalDur = totalDur + durations[i] - FADE;
    }
    curV = nextV;
    curA = nextA;
  }

  filterParts.push(
    `[${curV}]trim=duration=${two(totalDur)},setpts=PTS-STARTPTS[vend]`
  );
  filterParts.push(
    `[${curA}]apad=whole_dur=${two(totalDur)},atrim=duration=${two(totalDur)},asetpts=PTS-STARTPTS[aend]`
  );

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[vend]",
    "-map",
    "[aend]",
    "-c:v",
    "libx264",
    "-preset",
    isHiRes ? "superfast" : "ultrafast",
    "-crf",
    isHiRes ? "17" : "18",
    "-threads",
    "0",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(FPS),
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "44100",
    "-ac",
    "2",
    "-max_muxing_queue_size",
    "1024",
    "-movflags",
    "+faststart",
    "-f",
    "mp4",
    "-y",
    output
  );

  return {
    args,
    totalSeconds: Number(two(totalDur)),
  };
}
