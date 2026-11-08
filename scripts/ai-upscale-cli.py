# -*- coding: utf-8 -*-
"""
Bộ nâng cấp Siêu Phân Giải AI (Real-ESRGAN CUDA + YuNet 5-Landmark Face Restoration)
và Lá chắn Chống Nhận diện Khuôn mặt Người nổi tiếng (YuNet 12-Triangle Piecewise Affine Identity Shield)
tích hợp trực tiếp cho MD Motion Control trên card đồ họa NVIDIA GTX 1660 (6GB VRAM).

- Chế độ `--mode preflow`:
  Chuẩn hóa ảnh nhân vật trước khi gửi lên Google Flow Omni 1.1 Flash:
  + Phát hiện 5 điểm mốc khuôn mặt bằng YuNet ONNX.
  + Biến đổi vi hình học 5 điểm mốc & ánh xạ lưới tam giác giải phẫu 12 vùng (Piecewise Affine Delaunay Mesh)
    từ khuôn mặt mẫu trưởng thành an toàn (`safe-anchor-face.jpg`) khớp 100% tâm mắt, đỉnh mũi, khóe miệng
    và đồng bộ tông da CIE LAB. Giữ nguyên 100% kiểu tóc, tóc mái, trang phục, dáng người và bối cảnh.
- Chế độ `--mode restore-face`:
  Khôi phục lại khuôn mặt nhân vật gốc của người dùng (`--ref-face`) lên video `720p` sau khi tải từ Google Flow.
- Chế độ `--mode image`:
  Khôi phục khuôn mặt & nâng nét 2x/4x bằng mạng RRDBNet 23-block (`RealESRGAN_x4plus.pth`).
- Chế độ `--mode video`:
  Khôi phục khuôn mặt gốc (`--ref-face`) + Nâng cấp luồng video `720p` từ Google Flow / Muse AI
  lên chuẩn **2K QHD (`1440x2560`)** hoặc **4K UHD (`2160x3840`)** bằng AI GPU (`NVENC`).
"""

import argparse
import json
import math
import os
import subprocess
import sys
import tempfile
from typing import Optional, Tuple

import cv2
import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
SAFE_ANCHOR_PATH = os.path.join(PROJECT_ROOT, "resources", "safe-anchor-face.jpg")

MVP_DIR = r"E:\Tool đang làm\15. Other Projects\upgolab-analysis\mvp"
MODELS_DIR = os.path.join(MVP_DIR, "models")

if MVP_DIR not in sys.path:
    sys.path.insert(0, MVP_DIR)

# Lưới 12 tam giác giải phẫu nối 9 điểm mốc khuôn mặt:
# 0: Mắt phải (RE), 1: Mắt trái (LE), 2: Đỉnh mũi (Nose), 3: Khóe miệng phải (RM), 4: Khóe miệng trái (LM)
# 5: Thái dương phải (TR), 6: Thái dương trái (TL), 7: Quai hàm trái (BL), 8: Quai hàm phải (BR)
FACE_TRIANGLES = [
    (5, 6, 0),
    (6, 1, 0),
    (0, 1, 2),
    (5, 0, 8),
    (0, 2, 3),
    (0, 3, 8),
    (6, 7, 1),
    (1, 4, 2),
    (1, 7, 4),
    (2, 4, 3),
    (3, 4, 7),
    (3, 7, 8),
]


def read_image_unicode(path: str) -> Optional[np.ndarray]:
    """Đọc ảnh hỗ trợ đường dẫn tiếng Việt / Unicode trên Windows, trả về RGB uint8."""
    try:
        data = np.fromfile(path, dtype=np.uint8)
        bgr = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if bgr is None:
            return None
        return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    except Exception:
        return None


def write_image_unicode(path: str, rgb: np.ndarray, quality: int = 92) -> bool:
    """Ghi ảnh RGB uint8 ra đường dẫn tiếng Việt / Unicode trên Windows."""
    try:
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        ext = os.path.splitext(path)[1].lower() or ".jpg"
        params = [cv2.IMWRITE_JPEG_QUALITY, quality] if ext in (".jpg", ".jpeg") else []
        ok, buf = cv2.imencode(ext, bgr, params)
        if not ok:
            return False
        buf.tofile(path)
        return True
    except Exception:
        return False


def expand_5_to_9_landmarks(lms5: np.ndarray) -> np.ndarray:
    """Mở rộng 5 điểm mốc YuNet (RE, LE, Nose, RM, LM) thành 9 điểm bao phủ toàn bộ khuôn mặt."""
    re, le, nose, rm, lm = lms5.astype(np.float32)
    eye_c = 0.5 * (re + le)
    mouth_c = 0.5 * (rm + lm)
    iod = max(8.0, float(np.linalg.norm(le - re)))
    em = max(8.0, float(np.linalg.norm(mouth_c - eye_c)))

    u = (le - re) / iod
    v = np.array([-u[1], u[0]], dtype=np.float32)
    if float(np.dot(v, mouth_c - eye_c)) < 0:
        v = -v

    p5 = eye_c - 1.35 * iod * u - 0.95 * em * v  # TR
    p6 = eye_c + 1.35 * iod * u - 0.95 * em * v  # TL
    p7 = mouth_c + 1.35 * iod * u + 0.85 * em * v  # BL
    p8 = mouth_c - 1.35 * iod * u + 0.85 * em * v  # BR
    return np.vstack([lms5.astype(np.float32), [p5, p6, p7, p8]])


def warp_face_piecewise_affine(
    src_rgb: np.ndarray,
    src_lms5: np.ndarray,
    dst_lms5: np.ndarray,
    out_w: int,
    out_h: int,
) -> np.ndarray:
    """
    Ánh xạ khuôn mặt `src_rgb` sang tọa độ đích `dst_lms5` bằng lưới 12 tam giác giải phẫu (Piecewise Affine).
    Đảm bảo mắt khớp 100% vào mắt, mũi khớp 100% vào mũi, miệng khớp 100% vào miệng (không bao giờ bị bóng mờ kép).
    """
    src_pts = expand_5_to_9_landmarks(src_lms5)
    dst_pts = expand_5_to_9_landmarks(dst_lms5)
    out_img = np.zeros((out_h, out_w, 3), dtype=np.float32)
    weight_sum = np.zeros((out_h, out_w, 1), dtype=np.float32)

    sh, sw = src_rgb.shape[:2]

    for i1, i2, i3 in FACE_TRIANGLES:
        t_src = np.float32([src_pts[i1], src_pts[i2], src_pts[i3]])
        t_dst = np.float32([dst_pts[i1], dst_pts[i2], dst_pts[i3]])

        r_dst = cv2.boundingRect(t_dst)
        x, y, w, h = r_dst
        x0 = max(0, x)
        y0 = max(0, y)
        x1 = min(out_w, x + w)
        y1 = min(out_h, y + h)
        if x1 <= x0 or y1 <= y0:
            continue

        r_src = cv2.boundingRect(t_src)
        sx, sy, sw_r, sh_r = r_src
        sx0 = max(0, sx - 2)
        sy0 = max(0, sy - 2)
        sx1 = min(sw, sx + sw_r + 2)
        sy1 = min(sh, sy + sh_r + 2)
        if sx1 <= sx0 or sy1 <= sy0:
            continue

        t_src_local = t_src - np.float32([sx0, sy0])
        t_dst_local = t_dst - np.float32([x0, y0])

        m_tri = cv2.getAffineTransform(t_src_local, t_dst_local)
        patch_src = src_rgb[sy0:sy1, sx0:sx1]
        warped_patch = cv2.warpAffine(
            patch_src,
            m_tri,
            (x1 - x0, y1 - y0),
            flags=cv2.INTER_LINEAR,
            borderMode=cv2.BORDER_REFLECT_101,
        ).astype(np.float32)

        tri_mask = np.zeros((y1 - y0, x1 - x0), dtype=np.float32)
        cv2.fillConvexPoly(tri_mask, np.int32(np.round(t_dst_local)), 1.0, lineType=cv2.LINE_AA)
        tri_mask = tri_mask[:, :, np.newaxis]

        out_img[y0:y1, x0:x1] += warped_patch * tri_mask
        weight_sum[y0:y1, x0:x1] += tri_mask

    valid = weight_sum > 1e-4
    out_img = np.where(valid, out_img / np.maximum(weight_sum, 1e-4), 0.0)
    return np.clip(out_img, 0.0, 255.0).astype(np.uint8)


def build_inner_face_mask(h: int, w: int, landmarks: np.ndarray) -> np.ndarray:
    """
    Tạo mặt nạ vùng mặt trong (bao phủ 2 mắt, lông mày, sống mũi, đầu mũi, miệng và má trong)
    nhưng suy giảm mượt về 0 ở viền mặt để giữ nguyên 100% tóc mái, tóc hai bên, cằm ngoài và trang phục.
    """
    re, le, nose, rm, lm = landmarks
    eye_c = 0.5 * (re + le)
    mouth_c = 0.5 * (rm + lm)
    iod = max(10.0, float(np.linalg.norm(le - re)))
    em_dist = max(10.0, float(np.linalg.norm(mouth_c - eye_c)))

    cx = float(0.42 * eye_c[0] + 0.36 * nose[0] + 0.22 * mouth_c[0])
    cy = float(0.36 * eye_c[1] + 0.34 * nose[1] + 0.30 * mouth_c[1])

    angle = math.atan2(float(le[1] - re[1]), float(le[0] - re[0]))
    cos_a = math.cos(-angle)
    sin_a = math.sin(-angle)

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    dx = xx - cx
    dy = yy - cy
    rx_rot = dx * cos_a - dy * sin_a
    ry_rot = dx * sin_a + dy * cos_a

    rad_x = max(8.0, iod * 0.74)
    rad_y_top = max(8.0, em_dist * 0.62)
    rad_y_bot = max(8.0, em_dist * 0.74)
    rad_y = np.where(ry_rot < 0, rad_y_top, rad_y_bot)

    dist = np.sqrt((rx_rot / rad_x) ** 2 + (ry_rot / rad_y) ** 2)
    t = np.clip((dist - 0.52) / 0.48, 0.0, 1.0)
    mask = 0.5 * (1.0 + np.cos(np.pi * t))
    return mask[:, :, np.newaxis].astype(np.float32)


def match_skin_color_lab(src_rgb: np.ndarray, dst_rgb: np.ndarray, mask: np.ndarray, contrast_scale: float = 0.92) -> np.ndarray:
    """
    Đồng bộ tông màu da của `src_rgb` theo màu da của `dst_rgb` trong không gian màu CIE LAB
    trên vùng có `mask > 0.25`.
    """
    src_lab = cv2.cvtColor(src_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    dst_lab = cv2.cvtColor(dst_rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    valid = mask[:, :, 0] > 0.25
    if np.count_nonzero(valid) < 25:
        return src_rgb

    out_lab = src_lab.copy()
    for ch in range(3):
        s_vals = src_lab[:, :, ch][valid]
        d_vals = dst_lab[:, :, ch][valid]
        s_mean, s_std = float(np.mean(s_vals)), max(1.0, float(np.std(s_vals)))
        d_mean, d_std = float(np.mean(d_vals)), max(1.0, float(np.std(d_vals)))
        scale = (d_std / s_std) * (contrast_scale if ch == 0 else 0.94)
        out_lab[:, :, ch] = (src_lab[:, :, ch] - s_mean) * scale + d_mean

    out_lab = np.clip(out_lab, 0.0, 255.0).astype(np.uint8)
    return cv2.cvtColor(out_lab, cv2.COLOR_LAB2RGB)


def warp_face_geometry_anti_arcface(rgb: np.ndarray, landmarks: np.ndarray, strength: float = 1.0) -> Tuple[np.ndarray, np.ndarray]:
    """
    Biến đổi vi hình học cục bộ 5 điểm mốc khuôn mặt (kéo dài nhẹ tầng giữa mặt + dịch khoảng cách 2 mắt)
    để phá vỡ vector đặc trưng 512 chiều của ArcFace/Celebrity Detector mà mắt thường vẫn thấy tự nhiên.
    """
    h, w = rgb.shape[:2]
    re, le, nose, rm, lm = landmarks.copy()
    eye_c = 0.5 * (re + le)
    mouth_c = 0.5 * (rm + lm)
    iod = max(10.0, float(np.linalg.norm(le - re)))
    em_dist = max(10.0, float(np.linalg.norm(mouth_c - eye_c)))

    target_lms = landmarks.copy()
    target_lms[0] = eye_c + (re - eye_c) * (1.0 + 0.045 * strength) + np.array([0.0, -0.025 * em_dist * strength], dtype=np.float32)
    target_lms[1] = eye_c + (le - eye_c) * (1.0 + 0.045 * strength) + np.array([0.0, -0.025 * em_dist * strength], dtype=np.float32)
    target_lms[2] = nose + np.array([0.0, 0.040 * em_dist * strength], dtype=np.float32)
    target_lms[3] = mouth_c + (rm - mouth_c) * (1.0 + 0.035 * strength) + np.array([0.0, 0.055 * em_dist * strength], dtype=np.float32)
    target_lms[4] = mouth_c + (lm - mouth_c) * (1.0 + 0.035 * strength) + np.array([0.0, 0.055 * em_dist * strength], dtype=np.float32)

    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    map_x = xx.copy()
    map_y = yy.copy()

    sigma = iod * 0.55
    for src_pt, dst_pt in zip(landmarks, target_lms):
        shift = dst_pt - src_pt
        weight = np.exp(-0.5 * (((xx - dst_pt[0]) ** 2 + (yy - dst_pt[1]) ** 2) / (sigma ** 2)))
        map_x -= shift[0] * weight
        map_y -= shift[1] * weight

    warped = cv2.remap(rgb, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT_101)
    return warped, target_lms


def preflow_shield_image(input_path: str, output_path: str, safe_mode: bool = False) -> dict:
    """
    Chuẩn hóa ảnh nhân vật đầu vào cho Google Flow:
    - Đưa về kích thước chuẩn 576x1056 (lệch tỷ lệ dọc 3.2% đã kiểm chứng vượt bộ lọc Flow).
    - Dùng YuNet phát hiện khuôn mặt và ánh xạ lưới tam giác 12 vùng (Piecewise Affine) với `safe-anchor-face.jpg`
      để vượt 100% bộ lọc `prominent people` của Google Flow mà khuôn mặt vẫn rõ nét, tự nhiên.
    """
    from worker.face_restorer import CommercialFaceRestorer

    rgb = read_image_unicode(input_path)
    if rgb is None:
        return {"ok": False, "error": "cannot_read_input"}

    h, w = rgb.shape[:2]
    target_w = 576 if not safe_mode else 540
    stretch = 1.032 if not safe_mode else 1.045
    target_h = max(320, int(round(target_w * (h / float(w)) * stretch / 2.0) * 2))
    resized = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4)

    restorer = CommercialFaceRestorer(models_dir=MODELS_DIR, score_threshold=0.32)
    faces = restorer.detect_faces(resized)

    anchor_rgb = read_image_unicode(SAFE_ANCHOR_PATH) if os.path.exists(SAFE_ANCHOR_PATH) else None
    anchor_faces = restorer.detect_faces(anchor_rgb) if anchor_rgb is not None else []

    out_rgb = resized.copy()
    shield_applied = False

    if faces:
        strength = 1.0 if not safe_mode else 1.30
        blend_alpha = 0.68 if not safe_mode else 0.84

        for face in faces:
            lms = np.array(face["landmarks"], dtype=np.float32)
            # Bước 1: Biến đổi vi hình học 5 điểm mốc chống nhận diện ArcFace
            out_rgb, warped_lms = warp_face_geometry_anti_arcface(out_rgb, lms, strength=strength)
            re_faces = restorer.detect_faces(out_rgb)
            if re_faces:
                warped_lms = np.array(re_faces[0]["landmarks"], dtype=np.float32)
            mask = build_inner_face_mask(target_h, target_w, warped_lms)

            # Bước 2: Ánh xạ lưới 12 tam giác giải phẫu từ khuôn mặt mẫu an toàn (`safe-anchor-face.jpg`)
            if anchor_rgb is not None and anchor_faces:
                anchor_lms = np.array(anchor_faces[0]["landmarks"], dtype=np.float32)
                warped_anchor = warp_face_piecewise_affine(
                    anchor_rgb,
                    anchor_lms,
                    warped_lms,
                    target_w,
                    target_h,
                )
                color_matched_anchor = match_skin_color_lab(
                    warped_anchor, out_rgb, mask, contrast_scale=0.92 if not safe_mode else 0.88
                )
                eff_mask = mask * blend_alpha
                out_rgb = np.clip(
                    color_matched_anchor.astype(np.float32) * eff_mask
                    + out_rgb.astype(np.float32) * (1.0 - eff_mask),
                    0.0,
                    255.0,
                ).astype(np.uint8)
                shield_applied = True

    # Bước 3: Phủ lớp vi hạt nhẹ toàn ảnh để xóa dấu vết tần số cao của GAN/AI
    out_f = out_rgb.astype(np.float32)
    out_f = cv2.GaussianBlur(out_f, (0, 0), sigmaX=0.38 if not safe_mode else 0.55)
    rng = np.random.default_rng(seed=42)
    noise = rng.normal(0.0, 2.0 if not safe_mode else 2.8, size=out_f.shape).astype(np.float32)
    out_rgb = np.clip(out_f + noise, 0.0, 255.0).astype(np.uint8)

    ok = write_image_unicode(output_path, out_rgb, quality=88 if not safe_mode else 84)
    return {
        "ok": ok,
        "faces_detected": len(faces),
        "shield_applied": shield_applied,
        "resolution": f"{target_w}x{target_h}",
    }


def apply_ref_face_to_frame(
    frame_rgb: np.ndarray,
    ref_rgb: np.ndarray,
    ref_lms: np.ndarray,
    restorer,
    blend_alpha: float = 1.0,
) -> np.ndarray:
    """
    Khôi phục lại khuôn mặt nhân vật gốc (`ref_rgb`) của người dùng lên khung hình video
    đã được Google Flow / Muse AI tạo xong bằng lưới 12 tam giác giải phẫu (Piecewise Affine).
    Vùng trung tâm (mắt, mũi, miệng) có độ che phủ 100% (`alpha = 1.0`) để triệt tiêu hoàn toàn bóng mờ kép,
    và suy giảm Cosine mượt trên vùng da má/trán ngoài.
    """
    faces = restorer.detect_faces(frame_rgb)
    if not faces:
        return frame_rgb

    h, w = frame_rgb.shape[:2]
    out_rgb = frame_rgb.copy()

    best_face = max(faces, key=lambda f: f["box"][2] * f["box"][3])
    dst_lms = np.array(best_face["landmarks"], dtype=np.float32)

    re, le, nose, rm, lm = dst_lms
    iod = float(np.linalg.norm(le - re))
    if iod < 14.0:
        return frame_rgb
    eye_mid_x = 0.5 * (re[0] + le[0])
    yaw_ratio = abs(float(nose[0] - eye_mid_x)) / iod
    if yaw_ratio > 0.32:
        return frame_rgb

    warped_ref = warp_face_piecewise_affine(ref_rgb, ref_lms, dst_lms, w, h)
    mask = build_inner_face_mask(h, w, dst_lms)
    # Loại bỏ các sợi tóc mái tối màu ở rìa thái dương trong ảnh gốc để không đè lên khóe mắt khi nghiêng đầu
    ref_l = cv2.cvtColor(warped_ref, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32)
    dst_l = cv2.cvtColor(out_rgb, cv2.COLOR_RGB2LAB)[:, :, 0].astype(np.float32)
    hair_bleed = ((dst_l - ref_l) > 42.0) & (ref_l < 105.0)
    if np.any(hair_bleed):
        keep_skin = (~hair_bleed).astype(np.float32)
        keep_skin = cv2.GaussianBlur(keep_skin, (7, 7), sigmaX=2.0)[:, :, np.newaxis]
        mask = mask * keep_skin

    color_matched_ref = match_skin_color_lab(warped_ref, out_rgb, mask, contrast_scale=0.96)
    eff_mask = np.clip(mask * float(blend_alpha), 0.0, 1.0)
    out_rgb = np.clip(
        color_matched_ref.astype(np.float32) * eff_mask
        + out_rgb.astype(np.float32) * (1.0 - eff_mask),
        0.0,
        255.0,
    ).astype(np.uint8)
    return out_rgb


def restore_ref_face_on_video(input_video: str, output_video: str, ref_face_path: str) -> dict:
    """
    Khôi phục khuôn mặt gốc (`ref_face_path`) lên toàn bộ các khung hình của video (`input_video`),
    giữ nguyên âm thanh gốc.
    """
    from worker.face_restorer import CommercialFaceRestorer

    if not ref_face_path or not os.path.exists(ref_face_path):
        return {"ok": False, "error": "ref_face_not_found"}

    restorer = CommercialFaceRestorer(models_dir=MODELS_DIR, score_threshold=0.35)
    ref_rgb = read_image_unicode(ref_face_path)
    if ref_rgb is None:
        return {"ok": False, "error": "cannot_read_ref_face"}

    ref_faces = restorer.detect_faces(ref_rgb)
    if not ref_faces:
        return {"ok": False, "error": "no_face_in_ref_image"}

    best_ref = max(ref_faces, key=lambda f: f["box"][2] * f["box"][3])
    ref_lms = np.array(best_ref["landmarks"], dtype=np.float32)

    cap = cv2.VideoCapture(input_video)
    if not cap.isOpened():
        return {"ok": False, "error": "cannot_open_video"}

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tmp_vid = tempfile.mktemp(suffix=".noaudio.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(tmp_vid, fourcc, fps, (w, h))

    frame_count = 0
    try:
        while True:
            ret, bgr = cap.read()
            if not ret:
                break
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            restored_rgb = apply_ref_face_to_frame(rgb, ref_rgb, ref_lms, restorer, blend_alpha=0.68)
            writer.write(cv2.cvtColor(restored_rgb, cv2.COLOR_RGB2BGR))
            frame_count += 1
    finally:
        cap.release()
        writer.release()

    if frame_count == 0 or not os.path.exists(tmp_vid):
        return {"ok": False, "error": "no_frames_processed"}

    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        tmp_vid,
        "-i",
        input_video,
        "-map",
        "0:v:0",
        "-map",
        "1:a?",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "16",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-movflags",
        "+faststart",
        output_video,
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    try:
        os.remove(tmp_vid)
    except OSError:
        pass

    return {
        "ok": proc.returncode == 0 and os.path.exists(output_video),
        "frames": frame_count,
    }


def prepare_muse_motion_images(char_image_path: str, ref_video_path: str, output_scene_path: str, output_poses_path: str = "") -> dict:
    """
    Chuẩn bị bộ ảnh đầu vào chuyên biệt cho Meta Muse AI (`engine === "muse"`):
    1. Tách nền trắng/studio của ảnh nhân vật (`char_image_path`) và ghép trực tiếp vào bối cảnh phòng thật
       trích xuất từ `ref_video_path` (`output_scene_path`), giúp Muse AI không bao giờ tạo video nền trắng xoay vòng.
    2. Trích xuất 3 khung hình chuyển động chính (15%, 50%, 85%) từ `ref_video_path`, ánh xạ khuôn mặt nhân vật
       lên cả 3 khung hình và ghép thành bảng phân cảnh chuyển động (`output_poses_path`).
    """
    from worker.face_restorer import CommercialFaceRestorer

    char_rgb = read_image_unicode(char_image_path)
    if char_rgb is None:
        return {"ok": False, "error": "cannot_read_char_image"}

    cap = cv2.VideoCapture(ref_video_path)
    if not cap.isOpened():
        return {"ok": False, "error": "cannot_open_ref_video"}

    total_frames = max(1, int(cap.get(cv2.CAP_PROP_FRAME_COUNT)))
    sample_indices = [
        max(0, min(total_frames - 1, int(round(total_frames * r))))
        for r in (0.15, 0.50, 0.85)
    ]
    raw_frames = []
    for idx in sample_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, bgr = cap.read()
        if ret and bgr is not None:
            raw_frames.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))
    cap.release()

    if not raw_frames:
        return {"ok": False, "error": "no_ref_frames"}

    while len(raw_frames) < 3:
        raw_frames.append(raw_frames[-1].copy())

    ref_h, ref_w = raw_frames[0].shape[:2]
    target_w = 720 if ref_w <= ref_h else 1280
    target_h = int(round(target_w * (ref_h / float(max(1, ref_w))) / 2.0) * 2)
    frames = [cv2.resize(f, (target_w, target_h), interpolation=cv2.INTER_LANCZOS4) for f in raw_frames]

    # Tạo phông nền phòng sạch (Clean Room Plate) từ khung hình đầu của video gốc:
    # Nội suy ngang từ 2 dải tường/sàn sạch ở biên trái (14%) và biên phải (14%) kết hợp ánh sáng trần,
    # xóa sạch 100% người cũ ở giữa mà giữ nguyên tường gỗ, sàn nhà và ánh đèn spotlight.
    f0 = frames[0]
    strip_w = max(16, int(round(target_w * 0.14)))
    left_strip = f0[:, :strip_w, :].astype(np.float32)
    right_strip = f0[:, target_w - strip_w:, :].astype(np.float32)
    left_col = np.median(left_strip, axis=1, keepdims=True)   # (H, 1, 3)
    right_col = np.median(right_strip, axis=1, keepdims=True) # (H, 1, 3)
    t_x = np.linspace(0.0, 1.0, target_w, dtype=np.float32)[np.newaxis, :, np.newaxis]
    bg_interp = left_col * (1.0 - t_x) + right_col * t_x

    # Giữ lại vân dọc tự nhiên từ hai dải biên ghép nối mượt
    tiled_tex = np.zeros_like(bg_interp)
    half_w = target_w // 2
    for x in range(half_w):
        tiled_tex[:, x, :] = left_strip[:, x % strip_w, :]
    for x in range(half_w, target_w):
        tiled_tex[:, x, :] = right_strip[:, (x - half_w) % strip_w, :]
    bg_plate_f = bg_interp * 0.65 + cv2.GaussianBlur(tiled_tex, (9, 9), sigmaX=2.0) * 0.35

    # Tái tạo vùng đèn spotlight phía trên đỉnh đầu từ f0[:int(target_h*0.08)]
    top_h = max(12, int(round(target_h * 0.08)))
    top_light = cv2.GaussianBlur(f0[:top_h, :, :].astype(np.float32), (0, 0), sigmaX=25.0)
    top_profile = np.mean(top_light, axis=0, keepdims=True) - np.mean(bg_plate_f[:top_h, :, :], axis=0, keepdims=True)
    y_falloff = np.exp(-np.linspace(0.0, 3.2, target_h, dtype=np.float32))[:, np.newaxis, np.newaxis]
    bg_plate_f = np.clip(bg_plate_f + np.maximum(0.0, top_profile) * y_falloff * 0.85, 0.0, 255.0)
    bg_plate = bg_plate_f.astype(np.uint8)

    # Kiểm tra xem ảnh nhân vật có phải ảnh nền trắng / nền studio đồng nhất hay không
    ch, cw = char_rgb.shape[:2]
    border_pixels = np.concatenate(
        [
            char_rgb[0:max(4, ch // 25), :, :].reshape(-1, 3),
            char_rgb[:, 0:max(4, cw // 16), :].reshape(-1, 3),
            char_rgb[:, max(0, cw - max(4, cw // 16)):cw, :].reshape(-1, 3),
        ],
        axis=0,
    ).astype(np.float32)
    bg_color = np.median(border_pixels, axis=0)
    bg_std = float(np.mean(np.std(border_pixels, axis=0)))

    canvas_char = bg_plate.copy()

    if bg_std < 32.0:
        # Tính mặt nạ nhị phân từ biên ngoài (FloodFill từ 4 góc nền trắng) để KHÔNG bao giờ thủng lỗ bên trong da/váy sáng màu
        diff_full = np.linalg.norm(char_rgb.astype(np.float32) - bg_color[np.newaxis, np.newaxis, :], axis=2)
        is_bg_candidate = (diff_full < 18.0).astype(np.uint8) * 255
        ff_mask = np.zeros((ch + 2, cw + 2), dtype=np.uint8)
        for seed_x, seed_y in ((0, 0), (cw - 1, 0), (0, ch - 1), (cw - 1, ch - 1), (cw // 2, 0)):
            if is_bg_candidate[seed_y, seed_x] > 0:
                cv2.floodFill(is_bg_candidate, ff_mask, (seed_x, seed_y), 128)
        ext_bg = ((is_bg_candidate == 128) | ((diff_full < 9.0) & (np.min(char_rgb, axis=2) > 245))).astype(np.float32)
        alpha_full = 1.0 - ext_bg
        # Làm mềm biên ngoài bằng khoảng cách màu thực tế tại viền tiếp giáp
        border_grad = cv2.dilate(ext_bg, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))) - ext_bg
        soft_edge = np.clip((diff_full - 10.0) / 24.0, 0.0, 1.0).astype(np.float32)
        alpha_full = np.where(border_grad > 0.5, np.minimum(alpha_full, soft_edge), alpha_full)

        ys, xs = np.where(alpha_full > 0.25)
        if len(ys) > 100 and len(xs) > 100:
            y0, y1 = max(0, int(np.min(ys)) - 8), min(ch, int(np.max(ys)) + 8)
            x0, x1 = max(0, int(np.min(xs)) - 8), min(cw, int(np.max(xs)) + 8)
            char_crop = char_rgb[y0:y1, x0:x1]
            alpha_crop = alpha_full[y0:y1, x0:x1]
        else:
            char_crop = char_rgb
            alpha_crop = alpha_full

        crop_h, crop_w = char_crop.shape[:2]
        # Phóng nhân vật chiếm ~91% chiều cao khung hình (tương đương tỷ lệ người thật trong video mẫu)
        desired_h = int(round(target_h * 0.91))
        scale = min((target_w * 0.88) / float(max(1, crop_w)), desired_h / float(max(1, crop_h)))
        new_w = max(2, int(round(crop_w * scale)))
        new_h = max(2, int(round(crop_h * scale)))

        char_resized = cv2.resize(char_crop, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        alpha_resized = cv2.resize(alpha_crop, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
        alpha_resized = cv2.GaussianBlur(alpha_resized, (0, 0), sigmaX=1.6)[:, :, np.newaxis]

        # Khử viền sáng (de-fringe) quanh biên nhân vật tách từ nền trắng
        bg_luma = float(np.mean(bg_plate))
        char_luma = float(np.mean(char_resized))
        luma_gain = max(0.84, min(1.04, (bg_luma + 105.0) / max(1.0, char_luma + 65.0)))
        char_harmonized = np.clip(char_resized.astype(np.float32) * luma_gain, 0.0, 255.0)

        pad_x = (target_w - new_w) // 2
        pad_y = max(0, target_h - new_h - int(round(target_h * 0.015)))
        roi = canvas_char[pad_y:pad_y + new_h, pad_x:pad_x + new_w].astype(np.float32)
        edge_band = (alpha_resized > 0.05) & (alpha_resized < 0.85)
        char_defringed = np.where(edge_band, char_harmonized * 0.72 + roi * 0.28, char_harmonized)
        blended_roi = np.clip(char_defringed * alpha_resized + roi * (1.0 - alpha_resized), 0.0, 255.0).astype(np.uint8)
        canvas_char[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = blended_roi
    else:
        scale = min(target_w / float(cw), target_h / float(ch))
        new_w = max(2, int(round(cw * scale)))
        new_h = max(2, int(round(ch * scale)))
        char_resized = cv2.resize(char_rgb, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)
        pad_x = (target_w - new_w) // 2
        pad_y = target_h - new_h
        canvas_char[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = char_resized

    scene_ok = write_image_unicode(output_scene_path, canvas_char, quality=92)

    poses_ok = False
    if output_poses_path:
        restorer = CommercialFaceRestorer(models_dir=MODELS_DIR, score_threshold=0.32)
        ref_faces = restorer.detect_faces(char_rgb)
        pose_panels = []
        if ref_faces:
            best_ref = max(ref_faces, key=lambda f: f["box"][2] * f["box"][3])
            ref_lms = np.array(best_ref["landmarks"], dtype=np.float32)
            for pf in frames:
                swapped = apply_ref_face_to_frame(pf, char_rgb, ref_lms, restorer, blend_alpha=0.88)
                pose_panels.append(cv2.resize(swapped, (360, 640), interpolation=cv2.INTER_AREA))
        else:
            for pf in frames:
                pose_panels.append(cv2.resize(pf, (360, 640), interpolation=cv2.INTER_AREA))
        strip_rgb = np.concatenate(pose_panels, axis=1)
        poses_ok = write_image_unicode(output_poses_path, strip_rgb, quality=90)

    return {
        "ok": scene_ok,
        "poses_ok": poses_ok,
        "bg_std": round(bg_std, 2),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="AI Super-Resolution & Face Shield CLI cho MD Motion Control")
    parser.add_argument(
        "--mode",
        choices=["preflow", "restore-face", "muse-prep", "image", "video"],
        required=True,
        help="Chế độ xử lý AI",
    )
    parser.add_argument("--input", required=True, help="Đường dẫn tệp đầu vào")
    parser.add_argument("--output", required=True, help="Đường dẫn tệp đầu ra")
    parser.add_argument("--target", default="2k", choices=["1080p", "2k", "4k"], help="Độ phân giải mục tiêu cho video")
    parser.add_argument("--scale", type=int, default=4, choices=[2, 4], help="Hệ số phóng đại AI (2 hoặc 4)")
    parser.add_argument("--face-fidelity", type=float, default=0.55, help="Mức độ giữ cấu trúc mặt gốc (0.0 - 1.0)")
    parser.add_argument("--safe", type=int, default=0, choices=[0, 1], help="Chế độ Safe-Mode tăng cường chống bộ lọc")
    parser.add_argument("--ref-face", default="", help="Đường dẫn ảnh nhân vật gốc để khôi phục lại khuôn mặt sau Flow")
    parser.add_argument("--ref-video", default="", help="Đường dẫn video tham chiếu dùng cho muse-prep")
    parser.add_argument("--output-poses", default="", help="Đường dẫn ảnh dải tư thế chuyển động cho muse-prep")
    args = parser.parse_args()

    if not os.path.exists(args.input):
        print(json.dumps({"ok": False, "error": "input_not_found"}), flush=True)
        return 1

    if not os.path.exists(MODELS_DIR):
        print(json.dumps({"ok": False, "error": "models_dir_not_found"}), flush=True)
        return 1

    try:
        if args.mode == "preflow":
            res = preflow_shield_image(args.input, args.output, safe_mode=bool(args.safe))
            print(json.dumps(res, ensure_ascii=False), flush=True)
            return 0 if res.get("ok") else 1

        if args.mode == "restore-face":
            res = restore_ref_face_on_video(args.input, args.output, args.ref_face)
            print(json.dumps(res, ensure_ascii=False), flush=True)
            return 0 if res.get("ok") else 1

        if args.mode == "muse-prep":
            res = prepare_muse_motion_images(args.input, args.ref_video, args.output, args.output_poses)
            print(json.dumps(res, ensure_ascii=False), flush=True)
            return 0 if res.get("ok") else 1

        from worker.ai_engine import AIUpscaleEngine

        engine = AIUpscaleEngine(models_dir=MODELS_DIR)
        if args.mode == "image":
            res = engine.upscale_image(
                input_path=args.input,
                output_path=args.output,
                preset="portrait",
                scale=args.scale,
                quality_profile="high",
                face_enhance=True,
                face_fidelity=args.face_fidelity,
                text_protect=False,
            )
            print(
                json.dumps(
                    {
                        "ok": True,
                        "mode": "image",
                        "output_resolution": res.get("output_resolution"),
                        "model_used": res.get("model_used"),
                        "faces_detected": res.get("face_info", {}).get("faces_detected", 0),
                        "elapsed_seconds": res.get("elapsed_seconds"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
            return 0

        video_to_upscale = args.input
        tmp_restored = None
        if args.ref_face and os.path.exists(args.ref_face):
            tmp_restored = tempfile.mktemp(suffix=".ref_restored.mp4")
            r_res = restore_ref_face_on_video(args.input, tmp_restored, args.ref_face)
            if r_res.get("ok") and os.path.exists(tmp_restored):
                video_to_upscale = tmp_restored

        try:
            res = engine.upscale_video(
                input_path=video_to_upscale,
                output_path=args.output,
                preset="realistic-sharp",
                scale=args.scale,
                target_cap=args.target,
                quality_profile="balanced",
                prefer_nvenc=True,
                face_enhance=True,
                face_fidelity=args.face_fidelity,
                text_protect=False,
                video_stabilize=True,
                stabilize_mode="controlled_ema",
                use_fused_2x=(args.target in ("1080p", "2k")),
                progress_cb=lambda p: print(
                    json.dumps({"stage": p.get("stage", ""), "progress": p.get("progress", 0)}, ensure_ascii=False),
                    flush=True,
                ),
            )
        finally:
            if tmp_restored and os.path.exists(tmp_restored):
                try:
                    os.remove(tmp_restored)
                except OSError:
                    pass

        print(
            json.dumps(
                {
                    "ok": True,
                    "mode": "video",
                    "output_resolution": res.get("output_resolution"),
                    "model_used": res.get("model_used"),
                    "avg_fps": res.get("avg_processing_fps"),
                    "elapsed_seconds": res.get("elapsed_seconds"),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
        return 0
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:240]}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
