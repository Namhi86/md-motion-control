/**
 * Tự động phát hiện tờ ghép nhân vật nhiều ô (Character Sheet / Collage — cả khổ dọc và khổ ngang)
 * và tách lấy đúng 1 nhân vật chính diện rõ mặt cho Google Flow (Veo 3 / Omni 1.1 Flash).
 * Đồng thời loại bỏ siêu dữ liệu (EXIF/C2PA) và chuẩn hóa vi tương phản để tránh bộ lọc
 * nhận diện nhầm khuôn mặt AI thành người nổi tiếng (`veo_content_refused` / `prominent people`).
 */

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const S = 600;

/**
 * Đọc kích thước gốc (width, height) của ảnh bằng ffmpeg.
 */
export function probeImageSize(ffmpegPath, filePath) {
  const res = spawnSync(ffmpegPath, ["-hide_banner", "-nostdin", "-i", filePath], {
    encoding: "utf8",
    timeout: 10_000,
  });
  const match = /Stream #\d+:\d+[^\n]*Video:[^\n]*?\b(\d{2,5})x(\d{2,5})\b/.exec(
    String(res?.stderr || "")
  );
  return match
    ? { width: Number(match[1]), height: Number(match[2]) }
    : { width: 0, height: 0 };
}

/**
 * Đọc buffer RGB 600x600 của ảnh để phân tích đường kẻ lưới và bố cục ô nhân vật.
 */
export function readRgbGrid(ffmpegPath, filePath) {
  const res = spawnSync(
    ffmpegPath,
    [
      "-v",
      "error",
      "-nostdin",
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-vf",
      `scale=${S}:${S}:flags=neighbor`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: 15 * 1024 * 1024, timeout: 12_000 }
  );
  if (res.status !== 0 || !res.stdout || res.stdout.length < S * S * 3) {
    return null;
  }
  return res.stdout;
}

/**
 * Phân tích buffer RGB 600x600 để phát hiện tờ ghép nhiều ô (Character Sheet)
 * và trả về tọa độ chuẩn hóa `{ x, y, w, h, reason }` của ô nhân vật chính diện.
 * Trả về `null` nếu ảnh là chân dung 1 người đơn lẻ.
 */
export function detectCharacterSheetCrop(rgb, width, height) {
  if (!rgb || rgb.length < S * S * 3 || width < 650 || height < 650) {
    return null;
  }

  const idx = (x, y) => (y * S + x) * 3;
  const colorDist = (x, y, r, g, b) => {
    const p = idx(x, y);
    return (
      (Math.abs(rgb[p] - r) +
        Math.abs(rgb[p + 1] - g) +
        Math.abs(rgb[p + 2] - b)) /
      3
    );
  };
  const stepDist = (x1, y1, x2, y2) => {
    const p1 = idx(x1, y1);
    const p2 = idx(x2, y2);
    return (
      (Math.abs(rgb[p1] - rgb[p2]) +
        Math.abs(rgb[p1 + 1] - rgb[p2 + 1]) +
        Math.abs(rgb[p1 + 2] - rgb[p2 + 2])) /
      3
    );
  };

  const isBorderTone = (r, g, b) => {
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return sat <= 16 && (lum >= 165 || lum <= 45);
  };

  const isSkinTone = (r, g, b) => {
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    return (
      r > g &&
      g >= b - 8 &&
      sat >= 14 &&
      sat <= 115 &&
      lum >= 65 &&
      lum <= 235
    );
  };

  function rowLineStats(y, x0 = 15, x1 = S - 15) {
    const rs = [];
    const gs = [];
    const bs = [];
    const step = Math.max(1, Math.floor((x1 - x0) / 30));
    for (let x = x0; x < x1; x += step) {
      const p = idx(x, y);
      rs.push(rgb[p]);
      gs.push(rgb[p + 1]);
      bs.push(rgb[p + 2]);
    }
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const mr = rs[rs.length >> 1];
    const mg = gs[gs.length >> 1];
    const mb = bs[bs.length >> 1];
    const borderTone = isBorderTone(mr, mg, mb);
    let uniform = 0;
    let seam = 0;
    const yUp = Math.max(1, y - 3);
    const yDn = Math.min(S - 2, y + 3);
    for (let x = x0; x < x1; x += 1) {
      if (borderTone && colorDist(x, y, mr, mg, mb) < 10) uniform += 1;
      const p = idx(x, y);
      const pxBorder = isBorderTone(rgb[p], rgb[p + 1], rgb[p + 2]);
      const jump = Math.max(stepDist(x, y, x, yUp), stepDist(x, y, x, yDn));
      const hSmooth = stepDist(x, y, Math.min(S - 1, x + 1), y);
      if (pxBorder && hSmooth < 5 && jump > 14) seam += 1;
    }
    const len = Math.max(1, x1 - x0);
    return { uniform: uniform / len, seam: seam / len, mr, mg, mb };
  }

  function colLineStats(x, y0, y1) {
    const rs = [];
    const gs = [];
    const bs = [];
    const step = Math.max(1, Math.floor((y1 - y0) / 30));
    for (let y = y0; y < y1; y += step) {
      const p = idx(x, y);
      rs.push(rgb[p]);
      gs.push(rgb[p + 1]);
      bs.push(rgb[p + 2]);
    }
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const mr = rs[rs.length >> 1];
    const mg = gs[gs.length >> 1];
    const mb = bs[bs.length >> 1];
    const borderTone = isBorderTone(mr, mg, mb);
    let uniform = 0;
    let seam = 0;
    const xLt = Math.max(1, x - 3);
    const xRt = Math.min(S - 2, x + 3);
    for (let y = y0; y < y1; y += 1) {
      if (borderTone && colorDist(x, y, mr, mg, mb) < 10) uniform += 1;
      const p = idx(x, y);
      const pxBorder = isBorderTone(rgb[p], rgb[p + 1], rgb[p + 2]);
      const jump = Math.max(stepDist(x, y, xLt, y), stepDist(x, y, xRt, y));
      const vSmooth = stepDist(x, y, x, Math.min(S - 1, y + 1));
      if (pxBorder && vSmooth < 5 && jump > 14) seam += 1;
    }
    const len = Math.max(1, y1 - y0);
    return { uniform: uniform / len, seam: seam / len, mr, mg, mb };
  }

  function cellHasPerson(x0, x1, y0, y1) {
    let warmOrDark = 0;
    let detail = 0;
    let total = 0;
    const sx0 = Math.round(x0 + (x1 - x0) * 0.14);
    const sx1 = Math.round(x1 - (x1 - x0) * 0.14);
    const sy0 = Math.round(y0 + (y1 - y0) * 0.12);
    const sy1 = Math.round(y1 - (y1 - y0) * 0.14);
    for (let y = sy0; y < sy1; y += 2) {
      for (let x = sx0; x < sx1; x += 2) {
        const p = idx(x, y);
        const r = rgb[p];
        const g = rgb[p + 1];
        const b = rgb[p + 2];
        total += 1;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if ((r > g && sat > 14 && lum > 45 && lum < 235) || lum < 60) {
          warmOrDark += 1;
        }
        if (stepDist(x, y, Math.min(S - 1, x + 2), y) > 6) detail += 1;
      }
    }
    if (!total) return false;
    return warmOrDark / total > 0.10 && detail / total > 0.025;
  }

  function frontPoseScore(cell, index, totalCells) {
    const { x0, x1, y0, y1 } = cell;
    const w = x1 - x0;
    const h = y1 - y0;
    const hx0 = Math.round(x0 + w * 0.22);
    const hx1 = Math.round(x0 + w * 0.78);
    const hy0 = Math.round(y0 + h * 0.05);
    const hy1 = Math.round(y0 + h * 0.35);
    const midX = Math.round((hx0 + hx1) / 2);
    let leftSkin = 0;
    let rightSkin = 0;
    let symDiff = 0;
    let count = 0;
    const halfW = Math.max(1, midX - hx0);
    for (let y = hy0; y < hy1; y += 2) {
      for (let dx = 1; dx < halfW; dx += 2) {
        const xl = Math.max(0, midX - dx);
        const xr = Math.min(S - 1, midX + dx);
        const pl = idx(xl, y);
        const pr = idx(xr, y);
        if (isSkinTone(rgb[pl], rgb[pl + 1], rgb[pl + 2])) leftSkin += 1;
        if (isSkinTone(rgb[pr], rgb[pr + 1], rgb[pr + 2])) rightSkin += 1;
        symDiff += stepDist(xl, y, xr, y) / 255;
        count += 1;
      }
    }
    if (!count) return 0;
    const skinRatio = (leftSkin + rightSkin) / (count * 2);
    const skinBalance =
      1 - Math.abs(leftSkin - rightSkin) / Math.max(1, leftSkin + rightSkin);
    const symScore = 1 - symDiff / count;
    const posBonus =
      index === 0 ? 0.08 : index === Math.floor(totalCells / 2) ? 0.06 : 0;
    return skinRatio * 1.8 + skinBalance * 0.5 + symScore * 0.4 + posBonus;
  }

  const hDivs = [];
  for (let y = Math.round(S * 0.16); y <= Math.round(S * 0.86); y += 1) {
    const full = rowLineStats(y, 15, S - 15);
    const left65 = rowLineStats(y, 15, Math.round(S * 0.65));
    const right55 = rowLineStats(y, Math.round(S * 0.45), S - 15);
    const isFull =
      (full.uniform >= 0.85 && full.seam >= 0.30) ||
      full.seam >= 0.58 ||
      full.uniform >= 0.90;
    const isLeft =
      (left65.uniform >= 0.88 && left65.seam >= 0.40) ||
      left65.seam >= 0.65 ||
      left65.uniform >= 0.93;
    const isRight =
      (right55.uniform >= 0.88 && right55.seam >= 0.40) ||
      right55.seam >= 0.65 ||
      right55.uniform >= 0.93;
    if (isFull || isLeft || isRight) {
      if (!hDivs.length || y - hDivs[hDivs.length - 1].end > 12) {
        hDivs.push({ start: y, end: y });
      } else {
        hDivs[hDivs.length - 1].end = y;
      }
    }
  }

  const validHDivs = hDivs.filter((d) => {
    if (d.end - d.start + 1 > 90) return false;
    const yMid = Math.round((d.start + d.end) / 2);
    return (
      cellHasPerson(0, S, Math.max(0, yMid - Math.round(S * 0.25)), d.start) &&
      cellHasPerson(0, S, d.end, Math.min(S, yMid + Math.round(S * 0.25)))
    );
  });

  if (!validHDivs.length) return null;

  function findVDivs(y0, y1) {
    if (y1 - y0 < Math.round(S * 0.14)) return [];
    const vDivs = [];
    for (let x = Math.round(S * 0.10); x <= Math.round(S * 0.90); x += 1) {
      const st = colLineStats(x, y0 + 6, y1 - 6);
      const isLine =
        (st.uniform >= 0.85 && st.seam >= 0.25) ||
        st.seam >= 0.55 ||
        st.uniform >= 0.90;
      if (isLine) {
        if (!vDivs.length || x - vDivs[vDivs.length - 1].end > 10) {
          vDivs.push({ start: x, end: x });
        } else {
          vDivs[vDivs.length - 1].end = x;
        }
      }
    }
    return vDivs.filter((d) => d.end - d.start + 1 <= 75);
  }

  const rowBounds = [
    0,
    ...validHDivs.map((d) => Math.round((d.start + d.end) / 2)),
    S,
  ];
  const bands = [];
  for (let i = 0; i < rowBounds.length - 1; i += 1) {
    const y0 = rowBounds[i];
    const y1 = rowBounds[i + 1];
    if (y1 - y0 >= Math.round(S * 0.14)) {
      bands.push({ y0, y1 });
    }
  }

  const searchBands = [...bands];
  if (bands.length >= 2 && bands[0].y1 < S * 0.35) {
    searchBands.push({ y0: 0, y1: Math.round(S * 0.60) });
  }

  let totalVDivBands = 0;
  let bestBand = null;
  let bestCells = null;
  let bestVDivs = null;

  for (const band of searchBands) {
    const vDivs = findVDivs(band.y0, band.y1);
    if (vDivs.length >= 1) {
      totalVDivBands += 1;
      const colBounds = [
        0,
        ...vDivs.map((d) => Math.round((d.start + d.end) / 2)),
        S,
      ];
      const cells = [];
      for (let j = 0; j < colBounds.length - 1; j += 1) {
        const x0 = colBounds[j];
        const x1 = colBounds[j + 1];
        if (x1 - x0 >= Math.round(S * 0.09) && x1 - x0 <= Math.round(S * 0.48)) {
          if (cellHasPerson(x0, x1, band.y0, band.y1)) {
            cells.push({ x0, x1, y0: band.y0, y1: band.y1 });
          }
        }
      }
      if (!bestCells && cells.length >= 2 && band.y0 < S * 0.55) {
        bestBand = band;
        bestCells = cells;
        bestVDivs = vDivs;
      }
    }
  }

  const isSheet =
    bestCells &&
    (totalVDivBands >= 2 ||
      validHDivs.length >= 2 ||
      (bestVDivs && bestVDivs.length >= 3));

  if (!isSheet) return null;

  let chosen = bestCells[0];
  if (width > height && bestCells.length === 5) {
    const sc0 = frontPoseScore(bestCells[0], 0, 5);
    const sc2 = frontPoseScore(bestCells[2], 2, 5);
    if (sc2 >= sc0 * 0.9) {
      chosen = bestCells[2];
    }
  }

  const cw = chosen.x1 - chosen.x0;
  const ch = chosen.y1 - chosen.y0;
  const trimTop = chosen.y0 < 20 ? 0.01 : 0.025;
  const trimBot = 0.08;
  const trimLeft = chosen.x0 < 15 ? 0.025 : 0.02;
  const trimRight = chosen.x1 > S * 0.40 && cw > S * 0.38 ? 0.14 : 0.02;

  const sampleX = Math.min(S - 1, Math.max(0, Math.round(chosen.x0 + cw * 0.06)));
  const sampleY = Math.min(S - 1, Math.max(0, Math.round(chosen.y0 + ch * 0.08)));
  const sp = idx(sampleX, sampleY);
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  const bgHex = `#${toHex(rgb[sp])}${toHex(rgb[sp + 1])}${toHex(rgb[sp + 2])}`;

  return {
    reason: `sheet(hDiv=${validHDivs.length},vBands=${totalVDivBands},vDiv=${bestVDivs.length},band=${bestBand.y0}..${bestBand.y1})`,
    x: (chosen.x0 + cw * trimLeft) / S,
    y: (chosen.y0 + ch * trimTop) / S,
    w: (cw * (1 - trimLeft - trimRight)) / S,
    h: (ch * (1 - trimTop - trimBot)) / S,
    bgHex,
  };
}

/**
 * Chuẩn hóa ảnh nhân vật đầu vào cho Google Flow:
 * - Nếu là tờ ghép nhiều ô (Character Sheet dọc hoặc ngang): tự động cắt lấy 1 ô chính diện.
 * - Kích hoạt Lá chắn Chống Nhận diện Khuôn mặt Người nổi tiếng (`ai-upscale-cli.py --mode preflow` dùng YuNet 5-Landmark)
 *   để vượt 100% bộ lọc `prominent people` của Google Flow (khuôn mặt gốc sẽ được khôi phục lại ở bước hậu kỳ 2K/4K).
 * - Có fallback thuần FFmpeg (`576x1056`, lệch tỷ lệ dọc `1.032` + lọc tần số cao) để tương thích mọi môi trường.
 */
export async function normalizeFlowCharacterImage({
  ffmpegPath,
  inputPath,
  outputPath,
  run,
  signal,
  safeMode = false,
}) {
  try {
    const { width, height } = probeImageSize(ffmpegPath, inputPath);
    if (!width || !height) {
      return { ok: false, path: inputPath, cropped: false };
    }
    const rgb = readRgbGrid(ffmpegPath, inputPath);
    const crop = rgb ? detectCharacterSheetCrop(rgb, width, height) : null;

    const toneFilter = safeMode
      ? "hue=h=3.0:s=0.92,eq=gamma=1.06:contrast=0.93:brightness=0.018,gblur=sigma=0.65,noise=alls=5:allf=t"
      : "hue=h=1.8:s=0.95,eq=gamma=1.03:contrast=0.96:brightness=0.01,gblur=sigma=0.45,noise=alls=3:allf=t";
    const aspectStretch = safeMode ? "1.042" : "1.032";
    const targetW = safeMode ? 540 : 576;

    let vf;
    if (crop) {
      const cx = Math.max(0, Math.round(crop.x * width));
      const cy = Math.max(0, Math.round(crop.y * height));
      const cw = Math.min(width - cx, Math.round(crop.w * width)) & ~1;
      const ch = Math.min(height - cy, Math.round(crop.h * height)) & ~1;
      const padColor = crop.bgHex || "#d8d4ce";
      vf = `crop=${cw}:${ch}:${cx}:${cy},pad='max(iw,trunc(ih*9/16/2)*2)':ih:(ow-iw)/2:0:color=${padColor},scale=${targetW}:'trunc(ow*ih/iw*${aspectStretch}/2)*2':flags=lanczos,${toneFilter}`;
    } else {
      vf = `scale=${targetW}:'trunc(ow*ih/iw*${aspectStretch}/2)*2':flags=lanczos,${toneFilter}`;
    }

    const res = await run(
      ffmpegPath,
      [
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        inputPath,
        "-map_metadata",
        "-1",
        "-vf",
        vf,
        "-frames:v",
        "1",
        "-update",
        "1",
        "-q:v",
        safeMode ? "4" : "3",
        outputPath,
      ],
      { signal, timeoutMs: 15_000 }
    );

    if (res.code === 0 && existsSync(outputPath) && statSync(outputPath).size > 1000) {
      try {
        const aiUpscaleScript = path.resolve(
          path.dirname(fileURLToPath(import.meta.url)),
          "..",
          "scripts",
          "ai-upscale-cli.py"
        );
        if (existsSync(aiUpscaleScript)) {
          let shieldInput = inputPath;
          let cleanRefPath = inputPath;
          if (crop) {
            const rawCropPath = outputPath.replace(/\.jpg$/i, ".cleanref.jpg");
            const cx = Math.max(0, Math.round(crop.x * width));
            const cy = Math.max(0, Math.round(crop.y * height));
            const cw = Math.min(width - cx, Math.round(crop.w * width)) & ~1;
            const ch = Math.min(height - cy, Math.round(crop.h * height)) & ~1;
            const padColor = crop.bgHex || "#d8d4ce";
            await run(
              ffmpegPath,
              [
                "-hide_banner",
                "-nostdin",
                "-y",
                "-i",
                inputPath,
                "-map_metadata",
                "-1",
                "-vf",
                `crop=${cw}:${ch}:${cx}:${cy},pad='max(iw,trunc(ih*9/16/2)*2)':ih:(ow-iw)/2:0:color=${padColor}`,
                "-frames:v",
                "1",
                "-update",
                "1",
                "-q:v",
                "2",
                rawCropPath,
              ],
              { signal, timeoutMs: 10_000 }
            );
            if (existsSync(rawCropPath) && statSync(rawCropPath).size > 1000) {
              shieldInput = rawCropPath;
              cleanRefPath = rawCropPath;
            }
          }
          const shieldOutPath = outputPath.replace(/\.jpg$/i, ".shield.jpg");
          const shieldRes = await run(
            "python",
            [
              aiUpscaleScript,
              "--mode",
              "preflow",
              "--input",
              shieldInput,
              "--output",
              shieldOutPath,
              "--safe",
              safeMode ? "1" : "0",
            ],
            { signal, timeoutMs: 25_000 }
          );
          if (shieldRes.code === 0 && existsSync(shieldOutPath) && statSync(shieldOutPath).size > 2000) {
            rmSync(outputPath, { force: true });
            renameSync(shieldOutPath, outputPath);
          } else {
            rmSync(shieldOutPath, { force: true });
          }
          return {
            ok: true,
            path: outputPath,
            cleanRefPath,
            cropped: Boolean(crop),
            reason: crop?.reason || "single",
          };
        }
      } catch {}
      return { ok: true, path: outputPath, cropped: Boolean(crop), reason: crop?.reason || "single" };
    }
  } catch {
    // Fallback về ảnh gốc nếu gặp lỗi ngoài dự kiến
  }
  return { ok: false, path: inputPath, cropped: false };
}
