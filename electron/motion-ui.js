/**
 * Giao diện điều khiển trung tâm cho MD Motion Control Studio & MD Viral Gate (`electron/motion-ui.js`).
 * Đồng bộ hoàn toàn với kiến trúc ES Module và cầu nối `window.dola` trong `preload.cjs`.
 */

import { mediaUrl } from '../src/media-handles.js';

const $ = (id) => document.getElementById(id);

// Nhãn tiếng Việt cho các trạng thái của từng phân đoạn
const CLIP_STATE_LABELS = {
  waiting: 'Đang chờ',
  cutting: 'Đang cắt clip gốc…',
  queued: 'Đã vào hàng đợi…',
  making: 'Đang tạo video AI…',
  done: 'Hoàn thành ✓',
  failed: 'Thất bại ✕',
  cancelled: 'Đã huỷ',
};

// Giá credit cơ bản của Google Flow theo độ phân giải
const FLOW_PRICE_PER_CLIP = {
  '720p': 20,
  '360p': 10,
};

// Trạng thái nội bộ của phiên Motion Control trên UI
const state = {
  video: null, // { handle, name, bytes }
  prepareId: '',
  duration: 0,
  width: 0,
  height: 0,
  hasAudio: false,
  voice: null, // { gender, tone, pace, note, description, ... }
  envelope: [],
  snaps: { pauses: [], scenes: [] },
  segments: [], // [{ i, start, end, seconds, step, cutAt, has_speech, text, translated }]
  cuts: [], // [seconds...] tăng dần (0 < t < duration)
  images: [], // [{ handle, name }] (1..5)
  selected: null,
  preparing: false,
  jobId: '',
  jobRunning: false,
  clipStates: new Map(), // i -> { state, reason, note }
  result: null, // { url, name, seconds }
  gateUnlocked: false,
};

let draftTimer = null;

/**
 * Định dạng dung lượng byte sang chuỗi dễ đọc (KB / MB / GB)
 */
function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return '';
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Định dạng giây sang chuỗi `0.0s`
 */
function formatSec(sec) {
  const n = Number(sec) || 0;
  return `${n.toFixed(1)}s`;
}

/**
 * Rút gọn đường dẫn thư mục để hiển thị gọn trên nút chọn
 */
function shortDirPath(dirPath, maxLen = 42) {
  const s = String(dirPath || '').trim();
  if (!s) return 'Mặc định (Thư mục video / Motion control)';
  if (s.length <= maxLen) return s;
  return '…' + s.slice(-(maxLen - 1));
}

/**
 * Hiển thị cảnh báo / thông báo ở chân cột trái Motion Control
 */
function setMotionWarn(msg, isOk = false) {
  const el = $('mc-warn');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('mc-warn--ok', Boolean(isOk && msg));
}

/**
 * Chuyển đổi mô tả giọng nói nhận diện từ AI Studio sang chuỗi văn bản
 */
function formatDetectedVoice(voice) {
  if (!voice) return '';
  if (typeof voice === 'string') return voice.trim();
  if (typeof voice === 'object') {
    const parts = [
      voice.description,
      voice.summary,
      voice.gender,
      voice.tone,
      voice.pace,
      voice.pitch,
      voice.note,
    ]
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim());
    return Array.from(new Set(parts)).join(', ').slice(0, 160);
  }
  return '';
}

/**
 * Trích xuất danh sách vạch cắt nội bộ từ mảng segments
 */
function cutsFromSegments(segments, duration) {
  if (!Array.isArray(segments) || segments.length <= 1) return [];
  const out = [];
  for (let i = 0; i < segments.length - 1; i++) {
    const end = Math.round(Number(segments[i].end) * 1000) / 1000;
    if (Number.isFinite(end) && end > 0 && (!duration || end < duration)) {
      out.push(end);
    }
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. ĐIỀU HƯỚNG TAB (Motion Control <-> Tạo video <-> Setup tài khoản)
   ═══════════════════════════════════════════════════════════════════════════ */

function setupTabNavigation() {
  const navMotion = $('nav-motion');
  const navCreate = $('nav-create');
  const navSetup = $('nav-setup');
  const viewMotion = $('view-motion');
  const viewCreate = $('view-create');
  const viewSetup = $('view-setup');

  if (!navMotion || !viewMotion) return;

  const activateMotionTab = () => {
    viewMotion.hidden = false;
    if (viewCreate) viewCreate.hidden = true;
    if (viewSetup) viewSetup.hidden = true;
    navMotion.classList.add('nav-link--on');
    navCreate?.classList.remove('nav-link--on');
    navSetup?.classList.remove('nav-link--on');
    requestAnimationFrame(() => drawWaveform());
  };

  const deactivateMotionTab = () => {
    viewMotion.hidden = true;
    navMotion.classList.remove('nav-link--on');
  };

  navMotion.addEventListener('click', activateMotionTab);
  navCreate?.addEventListener('click', deactivateMotionTab);
  navSetup?.addEventListener('click', deactivateMotionTab);
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. CỔNG KÍCH HOẠT MD VIRAL GATE (#md-gate-overlay)
   ═══════════════════════════════════════════════════════════════════════════ */

function setGateMessage(msg, isOk = false) {
  const el = $('gate-msg');
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('md-gate-msg--ok', Boolean(isOk && msg));
}

function renderGateState(gateState, { forceOpen = false } = {}) {
  if (!gateState || typeof gateState !== 'object') return;

  const unlocked = Boolean(gateState.unlocked || gateState.exempt);
  state.gateUnlocked = unlocked;

  const codeEl = $('gate-code-val');
  if (codeEl && gateState.code) {
    codeEl.textContent = gateState.code;
  }

  // Cập nhật nút trạng thái trên Header
  const statusBtn = $('gate-status-btn');
  const statusText = $('gate-status-text');
  if (statusBtn && statusText) {
    statusBtn.classList.toggle('mc-gate-pill--unlocked', unlocked);
    statusBtn.classList.toggle('mc-gate-pill--locked', !unlocked);
    statusText.textContent = unlocked
      ? `Đã kích hoạt (${gateState.code || 'VIP'})`
      : `Chưa kích hoạt${gateState.code ? ' · ' + gateState.code : ''}`;
  }

  // Trạng thái Bước 1 (Facebook) & Bước 2 (Zalo)
  const fbDone = Boolean(
    gateState.fb_opened ||
      gateState.fbOpened ||
      gateState.status === 'commented' ||
      gateState.status === 'completed' ||
      gateState.status === 'activated' ||
      unlocked
  );
  const zaloDone = Boolean(
    gateState.zalo_joined ||
      gateState.zaloJoined ||
      gateState.zalo_clicked ||
      gateState.status === 'completed' ||
      gateState.status === 'activated' ||
      unlocked
  );

  const fbStatusEl = $('gate-fb-status');
  if (fbStatusEl) {
    fbStatusEl.textContent = fbDone ? '✓ Đã mở FB' : 'Chưa mở';
    fbStatusEl.classList.toggle('md-gate-step-status--done', fbDone);
  }

  const zaloStatusEl = $('gate-zalo-status');
  if (zaloStatusEl) {
    zaloStatusEl.textContent = zaloDone ? '✓ Đã tham gia' : 'Chưa tham gia';
    zaloStatusEl.classList.toggle('md-gate-step-status--done', zaloDone);
  }

  // Điền link cấu hình nếu ô đang trống
  const cfgFb = $('gate-cfg-fb');
  const cfgZalo = $('gate-cfg-zalo');
  if (cfgFb && !cfgFb.value && gateState.post_url) {
    cfgFb.value = gateState.post_url;
  }
  if (cfgZalo && !cfgZalo.value && gateState.zalo_url) {
    cfgZalo.value = gateState.zalo_url;
  }

  // Nút đóng và hiển thị Overlay
  const overlay = $('md-gate-overlay');
  const closeBtn = $('gate-close-btn');
  if (closeBtn) {
    closeBtn.hidden = !unlocked;
  }
  if (overlay) {
    if (forceOpen) {
      overlay.hidden = false;
    } else if (!unlocked) {
      overlay.hidden = false;
    } else {
      overlay.hidden = true;
    }
  }
}

async function initViralGate() {
  const gateApi = window.dola?.gate;
  if (!gateApi) return;

  const overlay = $('md-gate-overlay');
  const statusBtn = $('gate-status-btn');
  const closeBtn = $('gate-close-btn');
  const copyBtn = $('gate-copy-btn');
  const fbBtn = $('gate-fb-btn');
  const zaloBtn = $('gate-zalo-btn');
  const checkBtn = $('gate-check-btn');
  const vipBtn = $('gate-vip-btn');
  const vipInput = $('gate-vip-input');
  const cfgSaveBtn = $('gate-cfg-save');

  statusBtn?.addEventListener('click', async () => {
    try {
      const s = await gateApi.state();
      renderGateState(s, { forceOpen: true });
    } catch {
      if (overlay) overlay.hidden = false;
    }
  });

  closeBtn?.addEventListener('click', () => {
    if (overlay && state.gateUnlocked) {
      overlay.hidden = true;
    }
  });

  copyBtn?.addEventListener('click', async () => {
    const code = $('gate-code-val')?.textContent?.trim() || '';
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      const oldText = copyBtn.textContent;
      copyBtn.textContent = '✓ Đã sao chép';
      setTimeout(() => {
        copyBtn.textContent = oldText;
      }, 1800);
    } catch {
      setGateMessage(`Mã của bạn là: ${code} (hãy bôi đen để sao chép).`, true);
    }
  });

  fbBtn?.addEventListener('click', async () => {
    setGateMessage('');
    const res = await gateApi.openPost?.();
    if (res) renderGateState(res, { forceOpen: true });
    setGateMessage(
      'Đã mở bài viết Facebook. Hãy bình luận mã kích hoạt của bạn và chia sẻ bài viết!',
      true
    );
  });

  zaloBtn?.addEventListener('click', async () => {
    setGateMessage('');
    const res = await gateApi.openZalo?.();
    if (res) renderGateState(res, { forceOpen: true });
    setGateMessage('Đã mở nhóm Zalo. Bạn chỉ cần bấm Tham gia nhóm là hoàn tất bước 2!', true);
  });

  checkBtn?.addEventListener('click', async () => {
    checkBtn.disabled = true;
    const origLabel = checkBtn.textContent;
    checkBtn.textContent = '⏳ Đang tự động quét bình luận Facebook & kiểm tra…';
    setGateMessage('Đang kiểm tra bình luận chứa mã kích hoạt trên bài viết Facebook…', true);
    try {
      const res = await gateApi.checkNow?.();
      if (res) renderGateState(res, { forceOpen: !res.unlocked });
      if (res?.unlocked) {
        setGateMessage('🎉 Kích hoạt thành công! Đang mở khóa MD Motion Control…', true);
        setTimeout(() => {
          if (overlay) overlay.hidden = true;
        }, 700);
      } else {
        setGateMessage(
          res?.note ||
            res?.reject_reason ||
            'Chưa tìm thấy bình luận chứa mã kích hoạt hoặc chưa hoàn thành đủ 2 bước. Vui lòng kiểm tra lại.',
          false
        );
      }
    } catch (err) {
      setGateMessage('Lỗi khi kiểm tra kích hoạt: ' + (err?.message || err), false);
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = origLabel;
    }
  });

  vipBtn?.addEventListener('click', async () => {
    const key = vipInput?.value?.trim() || '';
    if (!key) {
      setGateMessage('Vui lòng nhập Mã VIP hoặc Master Key.', false);
      return;
    }
    vipBtn.disabled = true;
    try {
      const res = await gateApi.activateVip?.(key);
      if (res) renderGateState(res, { forceOpen: !res.unlocked });
      if (res?.unlocked) {
        setGateMessage('🎉 Kích hoạt VIP thành công! Đã mở khóa toàn bộ tính năng.', true);
        if (vipInput) vipInput.value = '';
        setTimeout(() => {
          if (overlay) overlay.hidden = true;
        }, 600);
      } else {
        setGateMessage(res?.note || 'Mã VIP không hợp lệ. Vui lòng kiểm tra lại.', false);
      }
    } catch (err) {
      setGateMessage('Lỗi kích hoạt VIP: ' + (err?.message || err), false);
    } finally {
      vipBtn.disabled = false;
    }
  });

  cfgSaveBtn?.addEventListener('click', async () => {
    const postUrl = $('gate-cfg-fb')?.value?.trim() || '';
    const zaloUrl = $('gate-cfg-zalo')?.value?.trim() || '';
    cfgSaveBtn.disabled = true;
    try {
      const res = await gateApi.setConfig?.({
        post_url: postUrl,
        zalo_url: zaloUrl,
        fbPostUrl: postUrl,
        zaloGroupUrl: zaloUrl,
      });
      if (res) renderGateState(res, { forceOpen: true });
      setGateMessage('Đã lưu cấu hình đường dẫn Facebook & Zalo.', true);
    } catch (err) {
      setGateMessage('Không lưu được cấu hình: ' + (err?.message || err), false);
    } finally {
      cfgSaveBtn.disabled = false;
    }
  });

  gateApi.onChanged?.((nextState) => {
    renderGateState(nextState);
  });

  try {
    let initial = await gateApi.state?.();
    if (!initial?.code && gateApi.claim) {
      initial = await gateApi.claim();
    }
    if (initial) renderGateState(initial);
  } catch {}
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. BIỂU ĐỒ SÓNG ÂM (<canvas id="mc-waveform">) & VẠCH CẮT (CUTS)
   ═══════════════════════════════════════════════════════════════════════════ */

function drawWaveform() {
  const canvas = $('mc-waveform');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(320, Math.floor(rect.width || canvas.width || 960));
  const h = Math.max(80, Math.floor(rect.height || canvas.height || 110));

  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  ctx.save();
  ctx.scale(dpr, dpr);

  // Nền tối
  ctx.fillStyle = '#101116';
  ctx.fillRect(0, 0, w, h);

  // Đường trục giữa
  const midY = h / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, midY);
  ctx.lineTo(w, midY);
  ctx.stroke();

  const duration = Number(state.duration) || 0;
  if (duration <= 0) {
    ctx.fillStyle = '#6c6e79';
    ctx.font = '12.5px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      'Biểu đồ sóng âm & điểm cắt thông minh sẽ hiển thị tại đây sau khi phân tích video',
      w / 2,
      midY + 4
    );
    ctx.restore();
    return;
  }

  // Tô nền xen kẽ cho từng phân đoạn hiện tại
  if (Array.isArray(state.segments) && state.segments.length) {
    state.segments.forEach((seg, idx) => {
      const x1 = (seg.start / duration) * w;
      const x2 = (seg.end / duration) * w;
      if (state.selected === idx) {
        ctx.fillStyle = 'rgba(245, 184, 65, 0.12)';
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), h);
      } else if (idx % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(x1, 0, Math.max(1, x2 - x1), h);
      }
    });
  }

  // 1. Vẽ sóng âm từ mảng envelope
  const env = Array.isArray(state.envelope) && state.envelope.length ? state.envelope : [];
  if (env.length > 0) {
    const barCount = env.length;
    const stepX = w / barCount;
    ctx.fillStyle = 'rgba(96, 165, 250, 0.45)';
    for (let i = 0; i < barCount; i++) {
      const val = Math.max(0.03, Math.min(1, Number(env[i]) || 0));
      const barH = val * (h - 24);
      const x = i * stepX;
      ctx.fillRect(x, midY - barH / 2, Math.max(1, stepX - 0.5), barH);
    }
  }

  // 2. Vẽ các vạch gợi ý khoảng nghỉ nói (snaps.pauses — màu xanh lá)
  const pauses = Array.isArray(state.snaps?.pauses) ? state.snaps.pauses : [];
  ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  for (const t of pauses) {
    if (t <= 0 || t >= duration) continue;
    const x = (t / duration) * w;
    ctx.beginPath();
    ctx.moveTo(x, 6);
    ctx.lineTo(x, h - 6);
    ctx.stroke();
  }

  // 3. Vẽ các vạch gợi ý đổi cảnh (snaps.scenes — màu cam)
  const scenes = Array.isArray(state.snaps?.scenes) ? state.snaps.scenes : [];
  ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([4, 2]);
  for (const t of scenes) {
    if (t <= 0 || t >= duration) continue;
    const x = (t / duration) * w;
    ctx.beginPath();
    ctx.moveTo(x, 4);
    ctx.lineTo(x, h - 4);
    ctx.stroke();
  }

  // 4. Vẽ các vạch cắt đoạn hiện tại (state.cuts — màu vàng sáng)
  ctx.setLineDash([]);
  ctx.strokeStyle = '#f5b841';
  ctx.fillStyle = '#f5b841';
  ctx.lineWidth = 2;
  for (const t of state.cuts) {
    if (t <= 0 || t >= duration) continue;
    const x = (t / duration) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Đầu mũi tên nhỏ trên đỉnh vạch cắt
    ctx.beginPath();
    ctx.moveTo(x - 5, 0);
    ctx.lineTo(x + 5, 0);
    ctx.lineTo(x, 7);
    ctx.closePath();
    ctx.fill();
  }

  // Nhãn số thứ tự đoạn trên biểu đồ
  if (Array.isArray(state.segments)) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.font = '600 10.5px system-ui, sans-serif';
    ctx.textAlign = 'left';
    state.segments.forEach((seg, idx) => {
      const x = (seg.start / duration) * w + 5;
      if ((seg.end - seg.start) / duration * w > 26) {
        ctx.fillText(`#${idx + 1}`, x, 14);
      }
    });
  }

  ctx.restore();
}

/**
 * Hiển thị danh sách chip vạch cắt bên dưới thanh sóng âm
 */
function renderCutsChips() {
  const wrap = $('mc-cuts-list');
  if (!wrap) return;
  wrap.replaceChildren();

  if (!state.cuts.length) return;

  state.cuts.forEach((cutSec) => {
    const chip = document.createElement('span');
    chip.className = 'mc-cut-chip';
    chip.textContent = `${cutSec.toFixed(1)}s `;

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.title = `Xoá vạch cắt tại ${cutSec.toFixed(1)}s`;
    rmBtn.textContent = '✕';
    rmBtn.addEventListener('click', () => {
      state.cuts = state.cuts.filter((c) => Math.abs(c - cutSec) > 0.05);
      renderCutsChips();
      drawWaveform();
    });

    chip.appendChild(rmBtn);
    wrap.appendChild(chip);
  });
}

/**
 * Thêm hoặc xóa một vạch cắt tại vị trí giây `rawSec` (tự động bắt dính vào điểm snap gần nhất nếu trong khoảng 0.2s)
 */
function toggleCutAtSeconds(rawSec) {
  const duration = Number(state.duration) || 0;
  if (duration <= 0) return;

  let target = Math.round(Number(rawSec) * 10) / 10;
  if (!Number.isFinite(target) || target <= 0.3 || target >= duration - 0.3) return;

  // Nếu bấm gần một vạch cắt đã có (<= 0.35s) -> xóa vạch đó
  const existingIdx = state.cuts.findIndex((c) => Math.abs(c - target) <= 0.35);
  if (existingIdx !== -1) {
    state.cuts.splice(existingIdx, 1);
    renderCutsChips();
    drawWaveform();
    return;
  }

  // Bắt dính (snap) vào điểm đổi cảnh hoặc khoảng nghỉ nếu gần (<= 0.2s)
  const allSnaps = [...(state.snaps?.scenes || []), ...(state.snaps?.pauses || [])];
  for (const s of allSnaps) {
    if (Math.abs(s - target) <= 0.2) {
      target = Math.round(s * 1000) / 1000;
      break;
    }
  }

  state.cuts = [...state.cuts, target].sort((a, b) => a - b);
  renderCutsChips();
  drawWaveform();
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. QUẢN LÝ CHI PHÍ CREDIT, LƯỚI ẢNH NHÂN VẬT & LƯU NHÁP (SAVE DRAFT)
   ═══════════════════════════════════════════════════════════════════════════ */

function updateCostSummary() {
  const summaryEl = $('mc-cost-summary');
  const hintEl = $('mc-engine-hint');
  const engine = $('mc-engine-select')?.value || 'veo-ref';
  const resolution = $('mc-resolution-select')?.value || '720p';
  const segCount = Array.isArray(state.segments) ? state.segments.length : 0;

  if (hintEl) {
    hintEl.textContent =
      engine === 'muse'
        ? 'Meta Muse AI tạo các đoạn nối tiếp bằng Cookie Muse hoàn toàn miễn phí (0 credit Flow).'
        : 'Google Flow Omni 1.1 Flash dùng video tham chiếu trực tiếp cho từng phân đoạn (tốn credit Flow).';
  }

  if (!summaryEl) return;
  if (engine === 'muse') {
    summaryEl.textContent = `${segCount} đoạn · 0 credit (Miễn phí qua Muse AI)`;
  } else {
    const perClip = FLOW_PRICE_PER_CLIP[resolution] || 20;
    const total = segCount * perClip;
    summaryEl.textContent = `${segCount} đoạn · ${total} credit (${perClip} credit/đoạn)`;
  }
}

function renderCharacterImages() {
  const grid = $('mc-images-grid');
  const countEl = $('mc-images-count');
  if (countEl) {
    countEl.textContent = `${state.images.length} / 5 ảnh`;
  }
  if (!grid) return;
  grid.replaceChildren();

  state.images.forEach((img, idx) => {
    const tile = document.createElement('div');
    tile.className = 'mc-img-tile';
    tile.title = img.name || `Ảnh #${idx + 1}`;

    const imageEl = document.createElement('img');
    imageEl.src = mediaUrl.pick(img.handle);
    imageEl.alt = img.name || '';

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'mc-img-rm';
    rmBtn.textContent = '✕';
    rmBtn.title = 'Xoá ảnh này';
    rmBtn.addEventListener('click', () => {
      state.images = state.images.filter((_, i) => i !== idx);
      renderCharacterImages();
      scheduleSaveDraft();
    });

    tile.append(imageEl, rmBtn);
    grid.appendChild(tile);
  });
}

function collectCurrentChoices() {
  return {
    engine: $('mc-engine-select')?.value || 'veo-ref',
    resolution: $('mc-resolution-select')?.value || '720p',
    ratio: $('mc-ratio-select')?.value || 'auto',
    language: ($('mc-language-input')?.value || 'Vietnamese').trim(),
    voiceText: ($('mc-voice-input')?.value || '').trim(),
    subject: ($('mc-subject-input')?.value || '').trim(),
    scene: ($('mc-scene-input')?.value || '').trim(),
  };
}

function collectDraftLines() {
  return (state.segments || []).map((seg, idx) => ({
    i: idx,
    start: seg.start,
    end: seg.end,
    text: String(seg.text || '').trim(),
    translated: String(seg.translated || '').trim(),
  }));
}

function scheduleSaveDraft() {
  if (!state.prepareId || !window.dola?.motion?.saveDraft) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(async () => {
    draftTimer = null;
    if (!state.prepareId) return;
    try {
      await window.dola.motion.saveDraft({
        prepareId: state.prepareId,
        lines: collectDraftLines().map(({ start, end, text, translated }) => ({
          start,
          end,
          text,
          translated,
        })),
        choices: collectCurrentChoices(),
        imageHandles: state.images.map((im) => im.handle),
        selected: state.selected,
      });
    } catch {}
  }, 600);
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. DANH SÁCH PHÂN ĐOẠN (SEGMENTS) & TRÌNH PHÁT THÀNH PHẨM
   ═══════════════════════════════════════════════════════════════════════════ */

function describeCutKind(seg, idx, total) {
  if (idx === total - 1 || seg.cutAt === 'end') {
    return { label: 'Đoạn cuối video', cls: 'mc-seg-cut-tag--pause' };
  }
  if (seg.cutAt === 'scene') {
    return { label: 'Đổi góc máy (Hard Cut)', cls: 'mc-seg-cut-tag--scene' };
  }
  return { label: 'Chỗ nghỉ — Nối khung cuối', cls: 'mc-seg-cut-tag--pause' };
}

function renderSegmentsList() {
  const listEl = $('mc-segments-list');
  const emptyEl = $('mc-segments-empty');
  const badgeEl = $('mc-segments-badge');
  const replanBtn = $('mc-replan-btn');
  const discardBtn = $('mc-discard-btn');
  const summaryEl = $('mc-plan-summary');

  const segs = Array.isArray(state.segments) ? state.segments : [];
  if (badgeEl) badgeEl.textContent = String(segs.length);
  if (replanBtn) replanBtn.disabled = !state.prepareId || state.jobRunning || state.preparing;
  if (discardBtn) discardBtn.disabled = !state.prepareId || state.jobRunning || state.preparing;

  if (summaryEl) {
    if (!state.prepareId) {
      summaryEl.textContent =
        'Chưa phân tích video. Hãy chọn video nguồn và bấm "Phân tích Video & Bóc băng".';
    } else {
      const dim = state.width && state.height ? ` · ${state.width}×${state.height}` : '';
      const audioNote = state.hasAudio ? 'Có âm thanh' : 'Không có âm thanh';
      summaryEl.textContent = `Thời lượng: ${formatSec(state.duration)}${dim} · ${audioNote} · Đã chia ${segs.length} phân đoạn (bấm lên sóng âm để thêm/xóa vạch cắt).`;
    }
  }

  if (!listEl || !emptyEl) return;
  listEl.replaceChildren();

  if (!segs.length) {
    emptyEl.hidden = false;
    updateCostSummary();
    return;
  }
  emptyEl.hidden = true;

  segs.forEach((seg, idx) => {
    const clipInfo = state.clipStates.get(idx) || { state: 'waiting', reason: '', note: '' };
    const clipState = clipInfo.state || 'waiting';

    const card = document.createElement('div');
    card.className = 'mc-seg-card' + (state.selected === idx ? ' mc-seg-card--selected' : '');
    card.dataset.index = String(idx);

    // Hàng trên cùng: #1 [0.0s – 6.4s · 6.4s] + Nhãn cắt + Trạng thái
    const top = document.createElement('div');
    top.className = 'mc-seg-top';

    const idxSpan = document.createElement('span');
    idxSpan.className = 'mc-seg-idx';
    idxSpan.textContent = `#${idx + 1}`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'mc-seg-time';
    const dur = Number(seg.seconds ?? seg.end - seg.start) || 0;
    timeSpan.textContent = `[${formatSec(seg.start)} – ${formatSec(seg.end)} · ${formatSec(dur)}]`;

    const cutMeta = describeCutKind(seg, idx, segs.length);
    const cutTag = document.createElement('span');
    cutTag.className = `mc-seg-cut-tag ${cutMeta.cls}`;
    cutTag.textContent = cutMeta.label;

    const stateBadge = document.createElement('span');
    stateBadge.className = `mc-seg-state mc-seg-state--${clipState}`;
    stateBadge.textContent = CLIP_STATE_LABELS[clipState] || clipState;

    top.append(idxSpan, timeSpan, cutTag, stateBadge);

    // Lưới 2 ô chỉnh sửa: Lời thoại gốc (text) & Lời dịch (translated)
    const grid = document.createElement('div');
    grid.className = 'mc-seg-grid';

    const colOrig = document.createElement('div');
    colOrig.className = 'mc-field';
    const lblOrig = document.createElement('label');
    lblOrig.className = 'mc-label';
    lblOrig.textContent = 'Lời thoại gốc (Original)';
    const taOrig = document.createElement('textarea');
    taOrig.className = 'mc-textarea';
    taOrig.rows = 2;
    taOrig.placeholder = 'Không có lời thoại ở đoạn này…';
    taOrig.value = seg.text || '';
    taOrig.addEventListener('focus', () => {
      state.selected = idx;
      drawWaveform();
    });
    taOrig.addEventListener('input', () => {
      seg.text = taOrig.value;
      seg.has_speech = Boolean(seg.text.trim() || (seg.translated || '').trim());
      scheduleSaveDraft();
    });
    colOrig.append(lblOrig, taOrig);

    const colTrans = document.createElement('div');
    colTrans.className = 'mc-field';
    const lblTrans = document.createElement('label');
    lblTrans.className = 'mc-label';
    lblTrans.textContent = 'Lời dịch / Lời đọc thay thế (Translated)';
    const taTrans = document.createElement('textarea');
    taTrans.className = 'mc-textarea';
    taTrans.rows = 2;
    taTrans.placeholder = 'Nhập lời dịch (nếu để trống sẽ dùng lời gốc)…';
    taTrans.value = seg.translated || '';
    taTrans.addEventListener('focus', () => {
      state.selected = idx;
      drawWaveform();
    });
    taTrans.addEventListener('input', () => {
      seg.translated = taTrans.value;
      seg.has_speech = Boolean((seg.text || '').trim() || seg.translated.trim());
      scheduleSaveDraft();
    });
    colTrans.append(lblTrans, taTrans);

    grid.append(colOrig, colTrans);
    card.append(top, grid);

    // Chân card: hiển thị lỗi & nút "Làm lại đoạn này" khi failed hoặc cancelled
    if (clipInfo.note || clipState === 'failed' || clipState === 'cancelled') {
      const foot = document.createElement('div');
      foot.className = 'mc-seg-foot';

      const noteEl = document.createElement('span');
      noteEl.className = 'mc-seg-note';
      noteEl.textContent = clipInfo.note || '';

      foot.appendChild(noteEl);

      if ((clipState === 'failed' || clipState === 'cancelled') && state.jobId) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'mc-btn mc-btn--gold mc-btn--sm';
        retryBtn.textContent = '↻ Làm lại đoạn này';
        retryBtn.addEventListener('click', async () => {
          retryBtn.disabled = true;
          setMotionWarn('');
          try {
            const res = await window.dola.motion.retry({ jobId: state.jobId, i: idx });
            if (!res?.ok) {
              setMotionWarn(res?.note || 'Không làm lại được đoạn này.');
            } else {
              state.jobRunning = true;
              syncRunningButtons();
            }
          } catch (err) {
            setMotionWarn('Lỗi khi gọi làm lại đoạn: ' + (err?.message || err));
          } finally {
            retryBtn.disabled = false;
          }
        });
        foot.appendChild(retryBtn);
      }

      card.appendChild(foot);
    }

    listEl.appendChild(card);
  });

  updateCostSummary();
}

function renderResultVideo(result) {
  const box = $('mc-result-box');
  const videoEl = $('mc-result-video');
  const nameEl = $('mc-result-name');
  const durEl = $('mc-result-duration');

  if (!box || !videoEl) return;
  if (!result || !result.url) {
    box.hidden = true;
    videoEl.removeAttribute('src');
    return;
  }

  box.hidden = false;
  if (nameEl) nameEl.textContent = result.name || 'copy-motion.mp4';
  if (durEl) {
    durEl.textContent = result.seconds ? `(${formatSec(result.seconds)})` : '';
  }
  if (videoEl.getAttribute('src') !== result.url) {
    videoEl.src = result.url;
  }
}

function syncRunningButtons() {
  const startBtn = $('mc-start-btn');
  const cancelBtn = $('mc-cancel-btn');
  const prepareBtn = $('mc-prepare-btn');
  const replanBtn = $('mc-replan-btn');
  const discardBtn = $('mc-discard-btn');

  const busy = state.preparing || state.jobRunning;
  if (startBtn) startBtn.disabled = busy || !state.prepareId;
  if (cancelBtn) cancelBtn.hidden = !busy;
  if (prepareBtn) prepareBtn.disabled = busy || !state.video?.handle;
  if (replanBtn) replanBtn.disabled = busy || !state.prepareId;
  if (discardBtn) discardBtn.disabled = busy || !state.prepareId;
}

/* ═══════════════════════════════════════════════════════════════════════════
   6. ÁP DỤNG KẾT QUẢ PHÂN TÍCH / KHÔI PHỤC PHIÊN
   ═══════════════════════════════════════════════════════════════════════════ */

function renderSelectedVideo() {
  const drop = $('mc-video-drop');
  const nameEl = $('mc-video-name');
  const metaEl = $('mc-video-meta');
  const clearBtn = $('mc-video-clear-btn');

  if (!state.video) {
    drop?.classList.remove('mc-dropzone--has-file');
    if (nameEl) nameEl.textContent = 'Kéo thả video vào đây hoặc bấm để chọn';
    if (metaEl) metaEl.textContent = 'Hỗ trợ .mp4, .mov, .m4v, .mkv, .webm (mọi thời lượng)';
    if (clearBtn) clearBtn.hidden = true;
  } else {
    drop?.classList.add('mc-dropzone--has-file');
    if (nameEl) nameEl.textContent = state.video.name || 'video.mp4';
    const sizeStr = formatBytes(state.video.bytes);
    const durStr = state.duration ? ` · ${formatSec(state.duration)}` : '';
    if (metaEl) metaEl.textContent = `${sizeStr || 'Đã chọn tệp video'}${durStr}`;
    if (clearBtn) clearBtn.hidden = false;
  }
  syncRunningButtons();
}

function applyPreparedPlan(data) {
  state.prepareId = data.prepareId || '';
  state.duration = Number(data.duration) || 0;
  state.width = Number(data.width) || 0;
  state.height = Number(data.height) || 0;
  state.hasAudio = Boolean(data.hasAudio);
  state.voice = data.voice || null;
  state.envelope = Array.isArray(data.envelope) ? data.envelope : [];
  state.snaps = data.snaps || { pauses: [], scenes: [] };
  state.segments = Array.isArray(data.segments)
    ? data.segments.map((s) => ({ ...s }))
    : [];
  state.cuts = cutsFromSegments(state.segments, state.duration);
  state.clipStates.clear();

  if (data.video?.handle) {
    state.video = {
      handle: data.video.handle,
      name: data.video.name || 'video.mp4',
      bytes: data.video.bytes || 0,
    };
  }

  if (Array.isArray(data.images)) {
    state.images = data.images.map((im) => ({ handle: im.handle, name: im.name }));
    renderCharacterImages();
  }

  // Tự động điền giọng đọc phát hiện được từ AI Studio nếu ô voiceText đang trống
  const detectedVoiceStr = formatDetectedVoice(state.voice);
  const detectedVoiceEl = $('mc-detected-voice');
  const voiceInput = $('mc-voice-input');
  if (detectedVoiceEl) {
    if (detectedVoiceStr) {
      detectedVoiceEl.hidden = false;
      detectedVoiceEl.textContent = `🎙️ Giọng gốc nhận diện: ${detectedVoiceStr}`;
    } else {
      detectedVoiceEl.hidden = true;
      detectedVoiceEl.textContent = '';
    }
  }
  if (voiceInput && !voiceInput.value.trim() && detectedVoiceStr) {
    voiceInput.value = detectedVoiceStr;
  }

  // Khôi phục choices nếu có
  if (data.choices && typeof data.choices === 'object') {
    if (data.choices.engine && $('mc-engine-select')) {
      $('mc-engine-select').value = data.choices.engine;
    }
    if (data.choices.resolution && $('mc-resolution-select')) {
      $('mc-resolution-select').value = data.choices.resolution;
    }
    if (data.choices.ratio && $('mc-ratio-select')) {
      $('mc-ratio-select').value = data.choices.ratio;
    }
    if (data.choices.language && $('mc-language-input')) {
      $('mc-language-input').value = data.choices.language;
    }
    if (data.choices.voiceText !== undefined && $('mc-voice-input')) {
      $('mc-voice-input').value = data.choices.voiceText;
    }
    if (data.choices.subject && $('mc-subject-input')) {
      $('mc-subject-input').value = data.choices.subject;
    }
    if (data.choices.scene && $('mc-scene-input')) {
      $('mc-scene-input').value = data.choices.scene;
    }
  }

  if (data.transcriptError) {
    setMotionWarn(`Lưu ý bóc băng: ${data.transcriptError}`, false);
  }

  renderSelectedVideo();
  renderCutsChips();
  renderSegmentsList();
  drawWaveform();
  syncRunningButtons();
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. GẮN SỰ KIỆN TƯƠNG TÁC TRÊN GIAO DIỆN MOTION CONTROL
   ═══════════════════════════════════════════════════════════════════════════ */

function applyJobProgress(evt) {
  if (!evt || typeof evt !== 'object') return;

  const prepStatusEl = $('mc-prepare-status');
  if (evt.stage === 'prepare') {
    if (prepStatusEl) {
      prepStatusEl.hidden = false;
      prepStatusEl.textContent = `⏳ ${evt.text || 'Đang phân tích video…'}`;
    }
    return;
  }

  if (evt.jobId) {
    state.jobId = evt.jobId;
  }

  if (Array.isArray(evt.clips)) {
    evt.clips.forEach((c) => {
      state.clipStates.set(c.i, {
        state: c.state || 'waiting',
        reason: c.reason || '',
        note: c.note || '',
      });
    });
  }

  const jobBanner = $('mc-job-banner');
  const jobStageText = $('mc-job-stage-text');

  if (evt.stage === 'start' || evt.stage === 'join') {
    state.jobRunning = true;
    if (jobBanner && jobStageText) {
      jobBanner.hidden = false;
      const doneCount = Array.from(state.clipStates.values()).filter(
        (c) => c.state === 'done'
      ).length;
      const totalCount = state.segments.length;
      jobStageText.textContent =
        evt.stage === 'join'
          ? 'Đang ghép các phân đoạn thành phim hoàn chỉnh…'
          : `Đang tạo các đoạn video (${doneCount}/${totalCount} hoàn thành)…`;
    }
  } else if (evt.stage === 'done') {
    state.jobRunning = false;
    if (jobBanner) jobBanner.hidden = true;
    if (evt.result?.url) {
      state.result = evt.result;
      renderResultVideo(evt.result);
      setMotionWarn('🎉 Đã tạo và ghép xong Motion Video thành công!', true);
    }
  } else if (evt.stage === 'ended') {
    state.jobRunning = false;
    if (jobBanner) jobBanner.hidden = true;
    if (evt.result?.note) {
      setMotionWarn(evt.result.note, false);
    }
  }

  renderSegmentsList();
  syncRunningButtons();
}

async function initMotionStudio() {
  const motionApi = window.dola?.motion;
  if (!motionApi) return;

  // 1. Chọn / Kéo thả Video nguồn
  const dropZone = $('mc-video-drop');
  const pickVideoBtn = $('mc-video-pick-btn');
  const clearVideoBtn = $('mc-video-clear-btn');

  const handleVideoChosen = (res) => {
    if (!res) return;
    if (!res.ok) {
      setMotionWarn(res.note || 'Không chọn được tệp video này.');
      return;
    }
    state.video = {
      handle: res.handle,
      name: res.name,
      bytes: res.bytes,
    };
    setMotionWarn('');
    renderSelectedVideo();
  };

  pickVideoBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    const res = await motionApi.pickVideo();
    handleVideoChosen(res);
  });

  dropZone?.addEventListener('click', async () => {
    const res = await motionApi.pickVideo();
    handleVideoChosen(res);
  });

  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('mc-dropzone--drag');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('mc-dropzone--drag');
  });

  dropZone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropZone.classList.remove('mc-dropzone--drag');
    const droppedFiles = e.dataTransfer?.files;
    if (!droppedFiles?.length) return;
    const res = await motionApi.dropVideo(droppedFiles);
    handleVideoChosen(res);
  });

  clearVideoBtn?.addEventListener('click', async () => {
    const res = await motionApi.pickVideo();
    handleVideoChosen(res);
  });

  // 2. Nút Phân tích Video & Bóc băng
  const prepareBtn = $('mc-prepare-btn');
  const prepStatusEl = $('mc-prepare-status');

  prepareBtn?.addEventListener('click', async () => {
    if (!state.video?.handle) {
      setMotionWarn('Hãy chọn một tệp video nguồn trước khi phân tích.');
      return;
    }
    state.preparing = true;
    setMotionWarn('');
    if (prepStatusEl) {
      prepStatusEl.hidden = false;
      prepStatusEl.textContent = '⏳ Đang đọc video, tách cảnh và bóc băng lời thoại…';
    }
    syncRunningButtons();

    try {
      const translateTo = $('mc-translate-select')?.value || '';
      const res = await motionApi.prepare({
        videoHandle: state.video.handle,
        translateTo,
      });
      if (!res?.ok) {
        setMotionWarn(res?.note || 'Phân tích video không thành công.');
        return;
      }
      applyPreparedPlan(res);
      setMotionWarn('✓ Đã phân tích video và chia đoạn hoàn tất!', true);
    } catch (err) {
      setMotionWarn('Lỗi khi phân tích video: ' + (err?.message || err));
    } finally {
      state.preparing = false;
      if (prepStatusEl) prepStatusEl.hidden = true;
      syncRunningButtons();
    }
  });

  // 3. Chọn ảnh nhân vật (1 - 5 ảnh)
  const pickImagesBtn = $('mc-pick-images-btn');
  pickImagesBtn?.addEventListener('click', async () => {
    setMotionWarn('');
    const picked = await window.dola?.pickImages?.();
    if (!Array.isArray(picked) || !picked.length) return;

    const merged = [...state.images];
    for (const item of picked) {
      if (!merged.some((existing) => existing.handle === item.handle)) {
        merged.push({ handle: item.handle, name: item.name });
      }
    }
    if (merged.length > 5) {
      setMotionWarn('Tối đa 5 ảnh nhân vật. Đã giữ lại 5 ảnh đầu tiên.');
    }
    state.images = merged.slice(0, 5);
    renderCharacterImages();
    scheduleSaveDraft();
  });

  // 4. Thay đổi tùy chọn Engine, Độ phân giải, Tỷ lệ, Nhân vật, Bối cảnh, Giọng
  const choiceInputs = [
    'mc-engine-select',
    'mc-resolution-select',
    'mc-ratio-select',
    'mc-language-input',
    'mc-voice-input',
    'mc-subject-input',
    'mc-scene-input',
  ];
  choiceInputs.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      updateCostSummary();
      scheduleSaveDraft();
    });
    el.addEventListener('input', () => {
      updateCostSummary();
      scheduleSaveDraft();
    });
  });

  // 5. Quản lý Thư mục lưu phim
  const dirPathEl = $('mc-dir-path');
  const dirChooseBtn = $('mc-dir-choose-btn');
  const dirOpenBtn = $('mc-dir-open-btn');

  const refreshMotionDir = async () => {
    try {
      const dir = await motionApi.dir.get();
      if (dirPathEl) {
        dirPathEl.textContent = shortDirPath(dir);
        dirPathEl.title = dir || '';
      }
    } catch {
      if (dirPathEl) dirPathEl.textContent = 'Mặc định';
    }
  };

  dirChooseBtn?.addEventListener('click', async () => {
    const res = await motionApi.dir.choose();
    if (res?.ok && res.dir) {
      if (dirPathEl) {
        dirPathEl.textContent = shortDirPath(res.dir);
        dirPathEl.title = res.dir;
      }
    } else if (res?.note) {
      setMotionWarn(res.note);
    }
  });

  dirOpenBtn?.addEventListener('click', async () => {
    await motionApi.dir.open();
  });

  // 6. Tương tác trên Biểu đồ Sóng âm & Chia lại đoạn (replan) / Bỏ phiên (discardSession)
  const canvas = $('mc-waveform');
  canvas?.addEventListener('click', (e) => {
    if (!state.prepareId || state.duration <= 0 || state.jobRunning) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratioX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const clickedSec = ratioX * state.duration;
    toggleCutAtSeconds(clickedSec);
  });

  $('mc-add-cut-btn')?.addEventListener('click', () => {
    const input = $('mc-cut-sec-input');
    if (!input) return;
    const val = parseFloat(input.value);
    if (!Number.isFinite(val)) return;
    toggleCutAtSeconds(val);
    input.value = '';
  });

  $('mc-replan-btn')?.addEventListener('click', async () => {
    if (!state.prepareId) return;
    setMotionWarn('');
    const cuts = [...state.cuts].sort((a, b) => a - b);
    const lines = collectDraftLines().map(({ start, end, text, translated }) => ({
      start,
      end,
      text,
      translated,
    }));
    const res = await motionApi.replan({
      prepareId: state.prepareId,
      cuts,
      lines,
    });
    if (!res?.ok) {
      setMotionWarn(res?.note || 'Không chia lại được các đoạn theo vạch cắt này.');
      return;
    }
    state.segments = (res.segments || []).map((s) => ({ ...s }));
    state.cuts = cutsFromSegments(state.segments, state.duration);
    renderCutsChips();
    renderSegmentsList();
    drawWaveform();
    setMotionWarn(`✓ Đã chia lại thành ${state.segments.length} phân đoạn.`, true);
  });

  $('mc-discard-btn')?.addEventListener('click', async () => {
    setMotionWarn('');
    const res = await motionApi.discardSession();
    if (!res?.ok) {
      setMotionWarn(res?.note || 'Không bỏ được phiên hiện tại.');
      return;
    }
    state.prepareId = '';
    state.duration = 0;
    state.envelope = [];
    state.snaps = { pauses: [], scenes: [] };
    state.segments = [];
    state.cuts = [];
    state.clipStates.clear();
    state.result = null;
    renderResultVideo(null);
    renderSelectedVideo();
    renderCutsChips();
    renderSegmentsList();
    drawWaveform();
    syncRunningButtons();
  });

  // 7. Nút Bắt đầu tạo Motion Video & Nút Huỷ
  $('mc-start-btn')?.addEventListener('click', async () => {
    setMotionWarn('');
    if (!state.prepareId) {
      setMotionWarn('Hãy chọn video và bấm "Phân tích Video & Bóc băng" trước.');
      return;
    }
    if (!state.images.length) {
      setMotionWarn('Cần chọn từ 1 đến 5 ảnh nhân vật / chủ thể trước khi tạo.');
      return;
    }

    const choices = collectCurrentChoices();
    const nameVal = ($('mc-name-input')?.value || 'copy-motion').trim() || 'copy-motion';
    const lines = collectDraftLines().map(({ i, text, translated }) => ({
      i,
      text,
      translated,
    }));

    state.jobRunning = true;
    syncRunningButtons();

    try {
      const res = await motionApi.start({
        prepareId: state.prepareId,
        imageHandles: state.images.map((im) => im.handle),
        engine: choices.engine,
        resolution: choices.resolution,
        ratio: choices.ratio,
        language: choices.language,
        voiceText: choices.voiceText,
        subject: choices.subject,
        scene: choices.scene,
        name: nameVal,
        lines,
      });

      if (!res?.ok) {
        state.jobRunning = false;
        syncRunningButtons();
        setMotionWarn(res?.note || 'Không bắt đầu tạo được Motion Video.');
        return;
      }

      state.jobId = res.jobId || '';
      setMotionWarn('🚀 Đã bắt đầu tạo các phân đoạn Motion Video…', true);
    } catch (err) {
      state.jobRunning = false;
      syncRunningButtons();
      setMotionWarn('Lỗi khi bắt đầu tạo video: ' + (err?.message || err));
    }
  });

  $('mc-cancel-btn')?.addEventListener('click', async () => {
    try {
      await motionApi.cancel();
      setMotionWarn('Đã gửi yêu cầu dừng tiến trình.');
    } catch {}
  });

  // 8. Nút trên khung Kết quả
  $('mc-result-open-dir')?.addEventListener('click', async () => {
    await motionApi.dir.open();
  });

  $('mc-result-close')?.addEventListener('click', async () => {
    const res = await motionApi.close();
    if (res?.ok !== false) {
      state.result = null;
      renderResultVideo(null);
    }
  });

  // 9. Lắng nghe tiến độ trực tiếp từ `motion:progress`
  motionApi.onProgress?.((evt) => {
    applyJobProgress(evt);
  });

  window.addEventListener('resize', () => {
    if (!$('view-motion')?.hidden) {
      drawWaveform();
    }
  });

  // 10. Khôi phục thư mục, phiên làm việc & trạng thái Job đang chạy khi mở app
  await refreshMotionDir();

  try {
    const restored = await motionApi.session();
    if (restored?.ok) {
      applyPreparedPlan(restored);
    } else if (restored?.note) {
      setMotionWarn(restored.note);
    }
  } catch {}

  try {
    const status = await motionApi.status();
    if (status) {
      state.jobId = status.jobId || '';
      state.jobRunning = !status.done;
      if (Array.isArray(status.clips)) {
        status.clips.forEach((c) => {
          state.clipStates.set(c.i, {
            state: c.state || 'waiting',
            reason: c.reason || '',
            note: c.note || '',
          });
        });
      }
      if (status.result?.url) {
        state.result = status.result;
        renderResultVideo(status.result);
      }
      renderSegmentsList();
      syncRunningButtons();
    }
  } catch {}

  drawWaveform();
  syncRunningButtons();
}

/* ═══════════════════════════════════════════════════════════════════════════
   KHỞI ĐỘNG MODULE KHI TRANG TẢI XONG
   ═══════════════════════════════════════════════════════════════════════════ */

setupTabNavigation();
initViralGate();
initMotionStudio();
