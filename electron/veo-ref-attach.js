/**
 * Đính kèm video tham chiếu và ảnh chủ thể vào dự án Google Flow (Omni Reference),
 * đồng thời xử lý tự động hộp thoại xác nhận quyền sử dụng video ("Rights to use this video").
 */

import { randomBytes } from "node:crypto";
import { copyFileSync, existsSync, renameSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { clickPoint } from "./click-at.js";
import { evalJs, PAGE_CALL_MS } from "./dola-session.js";
import { stopDebugger } from "./image-cdp.js";
import { reencodeRefVideo } from "./ref-video-reencode.js";
import { ADD_AT, CHIP_COUNT, PANEL_OPEN, PLUS_AT, rowsState } from "./veo-images-page.js";
import { selectRows, UPLOAD_WAIT_MS, uploadFiles, waitUploaded } from "./veo-images.js";
import { until } from "./veo-flow.js";
import { sleep } from "./veo-page.js";
import {
  AGREE_AT,
  ANY_DIALOG,
  buttonTopAt,
  NO_SHOW_AT,
  RIGHTS_BOX,
  rowText,
  VIDEO_CHIPS,
} from "./veo-ref-page.js";
import { sweepStale, VEO_TMP_DIR } from "../src/veo-image-files.js";
import {
  agreeVerdict,
  REF_MAX_IMAGES,
  REF_MIN_IMAGES,
  refUploadNames,
} from "../src/veo-ref.js";

export const RIGHTS_WAIT_MS = 8000;
const SETTLE_EVERY_MS = 500;
const SETTLE_CAP_MS = 3000;
const CLOSE_WAIT_MS = 4000;
const PANEL_WAIT_MS = 6000;
const CHIPS_WAIT_MS = 8000;
const VIDEOCAM_SETTLE_MS = 5000;

const failed = (note, meta) => ({
  ok: false,
  reason: "veo_images_failed",
  note: note + " (chưa gửi lệnh, chưa tốn credit)",
  agreeClicks: meta.agreeClicks,
});

const at = (win, expr) => evalJs(win, expr, { timeout: PAGE_CALL_MS }).catch(() => null);

/**
 * Biểu thức DOM kích hoạt trực tiếp nút "I agree" (và tuỳ chọn "Do not show again" nếu có)
 * bên trong hộp thoại "Rights to use this video" khi cú click chuột đầu tiên chỉ mới lấy focus.
 */
const DOM_CLICK_AGREE_EXPR = `(() => {
  const walk = (root, acc = []) => {
    for (const el of root.querySelectorAll('*')) {
      acc.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, acc);
    }
    return acc;
  };
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };
  const squash = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const box = walk(document)
    .filter((e) => vis(e) && /^(dialog|alertdialog)$/.test(e.getAttribute('role') || ''))
    .find((d) => /rights to use this video/i.test(d.innerText || ''));
  if (!box) return true;
  const noShow = [...box.querySelectorAll('button, [role=checkbox], input[type=checkbox]')].find(
    (b) => /do not show again|don't show again/i.test(squash(b.innerText || b.getAttribute('aria-label') || ''))
  );
  if (noShow && noShow.getAttribute('aria-checked') !== 'true') {
    try { noShow.click(); } catch {}
  }
  const btn = [...box.querySelectorAll('button')].find((b) => /^i agree$/i.test(squash(b.innerText)));
  if (!btn) return false;
  try { btn.focus(); } catch {}
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    try {
      btn.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1 }));
    } catch {}
  }
  try { btn.click(); } catch {}
  return true;
})()`;

/**
 * Chờ nút "I agree" trên hộp thoại quyền sử dụng video đứng yên ở một tọa độ cố định.
 */
async function settledAgree(win, signal) {
  let prev = null;
  let waitedMs = 0;
  while (waitedMs < SETTLE_CAP_MS && !signal?.aborted) {
    await sleep(SETTLE_EVERY_MS);
    waitedMs += SETTLE_EVERY_MS;
    const cur = await at(win, AGREE_AT);
    if (prev && cur && cur.x === prev.x && cur.y === prev.y) {
      return { target: cur, steady: true, waitedMs };
    }
    prev = cur;
  }
  return { target: prev, steady: false, waitedMs };
}

/**
 * Xử lý hộp thoại "Rights to use this video" của Google Flow khi tải video tham chiếu lên.
 */
export async function answerRights(
  win,
  { videoRow, signal, log, meta, consentAt, ms }
) {
  const found = await until(
    async () => {
      const box = await at(win, RIGHTS_BOX);
      if (box) return { box };
      const rs = await at(win, rowsState([videoRow]));
      if (rs?.alert && /unsupported file type/i.test(rs.alert)) {
        return { alert: rs.alert };
      }
      if (await at(win, rowText(videoRow))) {
        return { none: true };
      }
      const dlg = await at(win, ANY_DIALOG);
      return dlg ? { other: dlg } : null;
    },
    ms,
    signal,
    300
  );

  if (signal?.aborted) return "cancelled";
  if (!found) {
    return (
      "Flow không nhận video tham chiếu sau " +
      Math.round(ms / 1000) +
      " giây (không hiện hộp quyền, không có hàng video)."
    );
  }
  if (found.alert) {
    return "Flow không nhận video tham chiếu. Flow nói: " + found.alert;
  }
  if (found.other) {
    return 'Flow hiện một hộp lạ "' + found.other + '" nên app không bấm gì.';
  }
  if (found.none) {
    log(
      'Veo: Google không hỏi quyền dùng video (không có hộp "Rights to use this video"), đi tiếp'
    );
    return "";
  }
  if (!found.box.buttons.some((b) => /^i agree$/i.test(b))) {
    return (
      'Hộp quyền của Flow không có nút đúng chữ "I agree" (có: ' +
      found.box.buttons.join(" / ") +
      ") nên app không bấm gì."
    );
  }

  const { target, steady, waitedMs } = await settledAgree(win, signal);
  if (signal?.aborted) return "cancelled";
  if (!steady) {
    return (
      "Hộp quyền của Flow chưa đứng yên sau " +
      waitedMs / 1000 +
      ' giây (nút "I agree" cứ đổi chỗ) nên app không bấm gì.'
    );
  }

  const noShowPt = await at(win, NO_SHOW_AT);
  const verdict = agreeVerdict(target, noShowPt);
  if (!verdict.ok) {
    return 'Không bấm "I agree": ' + verdict.why + ".";
  }

  const topText = await at(win, buttonTopAt(target.x, target.y));
  if (topText !== "I agree") {
    return (
      'Có thứ khác nằm đè lên nút "I agree" (' +
      (topText ?? "không phải nút") +
      ") nên app không bấm."
    );
  }

  const hiddenSuffix = win.isVisible?.() === false ? ", cửa sổ Flow đang ẩn" : "";
  log(
    "Veo: hộp quyền đã đứng yên sau " +
      waitedMs / 1000 +
      ' giây, nút "I agree" ở (' +
      target.x +
      ", " +
      target.y +
      ")" +
      hiddenSuffix
  );

  // Tích chọn "Do not show again" nếu có và nằm tách biệt với nút "I agree"
  if (noShowPt && Math.abs(noShowPt.x - target.x) >= 12) {
    await clickPoint(win, noShowPt).catch(() => {});
    await sleep(120);
  }

  await clickPoint(win, target);
  meta.agreeClicks += 1;
  log(
    'Veo: bấm "I agree" (xác nhận của người dùng lúc ' +
      (consentAt || "không rõ") +
      ")"
  );

  // Chờ nhanh 900ms xem hộp quyền đã đóng ngay sau cú click đầu tiên chưa
  if (
    await until(
      async () => ((await at(win, RIGHTS_BOX)) ? null : true),
      900,
      signal,
      180
    )
  ) {
    return "";
  }

  // Nếu cửa sổ ẩn chưa nhận focus ở cú click đầu tiên, thực hiện kích hoạt DOM trực tiếp + click bồi (tối đa 3 nhịp)
  for (let retry = 0; retry < 3 && !signal?.aborted; retry += 1) {
    await evalJs(win, DOM_CLICK_AGREE_EXPR, {
      userGesture: true,
      timeout: PAGE_CALL_MS,
    }).catch(() => null);

    const curAgree = await at(win, AGREE_AT);
    if (curAgree) {
      await clickPoint(win, curAgree);
    }

    if (
      await until(
        async () => ((await at(win, RIGHTS_BOX)) ? null : true),
        Math.round(CLOSE_WAIT_MS / 2),
        signal,
        200
      )
    ) {
      return "";
    }
  }

  if (signal?.aborted) return "cancelled";
  const stillThere = await at(win, AGREE_AT);
  log(
    "Veo: hộp quyền vẫn còn sau cú bấm tại (" +
      target.x +
      ", " +
      target.y +
      '); nút "I agree" nay ' +
      (stillThere
        ? "ở (" + stillThere.x + ", " + stillThere.y + ")"
        : "không còn thấy")
  );
  return (
    'Hộp quyền vẫn còn sau khi bấm "I agree" (bấm tại ' +
    target.x +
    ", " +
    target.y +
    "; app không bấm thêm)."
  );
}

/**
 * Chờ hàng video tham chiếu tải xong trong bảng nguyên liệu của Google Flow.
 */
async function waitVideoRow(win, videoRow, waitMs, signal) {
  const uploaded = await until(
    async () => {
      const txt = (await at(win, rowText(videoRow))) || "";
      return txt && !/uploading/i.test(txt) ? true : null;
    },
    waitMs,
    signal,
    400
  );
  if (signal?.aborted) return "cancelled";
  if (!uploaded) {
    return (
      "Flow chưa tải xong video tham chiếu sau " +
      Math.round(waitMs / 1000) +
      " giây."
    );
  }
  await until(
    async () =>
      /^videocam\b/i.test((await at(win, rowText(videoRow))) || "") ? null : true,
    VIDEOCAM_SETTLE_MS,
    signal,
    400
  );
  return "";
}

/**
 * Tải video tham chiếu và danh sách ảnh chủ thể lên Google Flow, chọn và gắn vào ô lệnh.
 */
export async function attachRefVideo(win, opts) {
  const {
    video,
    images,
    seconds,
    ffmpegPath,
    consentAt,
    signal,
    log = () => {},
    tmpRoot = os.tmpdir(),
    uploadWaitMs = UPLOAD_WAIT_MS,
    rightsWaitMs = RIGHTS_WAIT_MS,
    reencode = reencodeRefVideo,
    rest = async () => false,
  } = opts;

  const meta = { agreeClicks: 0 };
  const cancelledOut = () => ({
    ok: false,
    reason: "cancelled",
    agreeClicks: meta.agreeClicks,
  });
  const outcomeOf = (msg) =>
    msg === "cancelled" ? cancelledOut() : failed(msg, meta);

  if (
    !Array.isArray(images) ||
    images.length < REF_MIN_IMAGES ||
    images.length > REF_MAX_IMAGES
  ) {
    return failed(
      "Cần từ " +
        REF_MIN_IMAGES +
        " đến " +
        REF_MAX_IMAGES +
        " ảnh chủ thể cùng video tham chiếu",
      meta
    );
  }

  const missingFile = [video, ...images].find((filePath) => {
    try {
      return !statSync(filePath).isFile();
    } catch {
      return true;
    }
  });
  if (missingFile) {
    return failed(
      "Tệp " + path.basename(String(missingFile)) + " không còn trên máy",
      meta
    );
  }

  const tag = randomBytes(4).toString("hex");
  const workDir = path.join(tmpRoot, VEO_TMP_DIR, tag);
  const names = refUploadNames(tag, images);
  let reencoded = null;

  try {
    sweepStale(tmpRoot);
    reencoded = await reencode({
      ffmpegPath,
      input: video,
      outDir: workDir,
      seconds,
      signal,
    });
    if (!reencoded.ok) {
      return reencoded.reason === "cancelled"
        ? cancelledOut()
        : failed(reencoded.note, meta);
    }

    const videoTarget = path.join(workDir, names.video);
    renameSync(reencoded.file, videoTarget);

    const imageTargets = images.map((srcPath, idx) => {
      const dstPath = path.join(workDir, names.images[idx]);
      copyFileSync(srcPath, dstPath);
      return dstPath;
    });

    if (await rest('mở ô "+"')) return cancelledOut();

    const plusPt = await at(win, PLUS_AT);
    if (!plusPt) return failed('Không thấy nút "+" của ô lệnh Flow', meta);
    await clickPoint(win, plusPt);

    if (!(await until(() => at(win, PANEL_OPEN), PANEL_WAIT_MS, signal, 400))) {
      return signal?.aborted
        ? cancelledOut()
        : failed("Bảng ảnh của Flow không mở ra", meta);
    }

    if (!(await uploadFiles(win, [videoTarget]))) {
      return failed(
        "Không tải được video lên Flow (không thấy nút Upload media)",
        meta
      );
    }
    log("Veo: đã đưa video tham chiếu (" + seconds + " giây) cho Flow, chờ hộp quyền");

    const rightsErr = await answerRights(win, {
      videoRow: names.videoRow,
      signal,
      log,
      meta,
      consentAt,
      ms: rightsWaitMs,
    });
    if (rightsErr) return outcomeOf(rightsErr);

    if (await rest("chờ video tải lên")) return cancelledOut();

    const rowErr = await waitVideoRow(win, names.videoRow, uploadWaitMs, signal);
    if (rowErr) return outcomeOf(rowErr);

    if (await rest("tải ảnh chủ thể lên")) return cancelledOut();

    for (let idx = 0; idx < imageTargets.length; idx += 1) {
      if (!(await uploadFiles(win, [imageTargets[idx]]))) {
        return failed(
          "Không tải được ảnh lên Flow (không thấy nút Upload media)",
          meta
        );
      }
      log(
        "Veo: đã đưa ảnh chủ thể " +
          (idx + 1) +
          "/" +
          imageTargets.length +
          " cho Flow, chờ tải lên"
      );
      const upErr = await waitUploaded(
        win,
        [names.images[idx]],
        uploadWaitMs,
        signal
      );
      if (upErr) return outcomeOf(upErr);
      if (
        idx < imageTargets.length - 1 &&
        (await rest("tải ảnh chủ thể tiếp theo"))
      ) {
        return cancelledOut();
      }
    }

    const selErr = await selectRows(
      win,
      [names.videoRow, ...names.images],
      signal
    );
    if (selErr) return outcomeOf(selErr);

    const addPt = await at(win, ADD_AT);
    if (!addPt) return failed("Không thấy nút thêm vào lệnh của Flow", meta);
    await clickPoint(win, addPt);

    const expectedCount = images.length + 1;
    const chipsReady = await until(
      async () => ((await at(win, CHIP_COUNT)) === expectedCount ? true : null),
      CHIPS_WAIT_MS,
      signal,
      400
    );
    if (signal?.aborted) return cancelledOut();
    if (!chipsReady) {
      return failed(
        "Ô lệnh của Flow có " +
          (await at(win, CHIP_COUNT)) +
          " mục thay vì " +
          expectedCount +
          " (1 video + " +
          images.length +
          " ảnh)",
        meta
      );
    }

    const videoChips = await at(win, VIDEO_CHIPS);
    if (videoChips !== 1) {
      return failed(
        "Ô lệnh của Flow có " + videoChips + " video thay vì 1",
        meta
      );
    }

    if (await at(win, PANEL_OPEN)) {
      const closePlusPt = await at(win, PLUS_AT);
      if (closePlusPt) await clickPoint(win, closePlusPt);
    }

    if (await rest("xem giá trong cài đặt")) return cancelledOut();

    return {
      ok: true,
      count: expectedCount,
      names,
      agreeClicks: meta.agreeClicks,
    };
  } catch (err) {
    return failed(
      "Lỗi khi đính kèm video tham chiếu: " +
        String(err?.message || err).slice(0, 120),
      meta
    );
  } finally {
    stopDebugger(win);
    reencoded?.cleanup?.();
    if (existsSync(workDir)) {
      rmSync(workDir, { recursive: true, force: true });
    }
  }
}
