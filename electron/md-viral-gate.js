// Bộ quản lý trạng thái cổng kích hoạt Viral (Facebook Comment + Share + Nhóm Zalo) & Khóa VIP cho MD Motion Control
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_FB_POST_URL,
  DEFAULT_ZALO_GROUP_URL,
  deriveActivationCode,
  verifyVipKey,
} from '../src/md-gate-code.js';
import { scanFacebookPostForCode } from './fb-comment-scanner.js';

const DEFAULT_TTL_MS = 14 * 24 * 3600 * 1000; // 14 ngày
const VIP_TTL_MS = 365 * 24 * 3600 * 1000; // 365 ngày

/**
 * Kiểm tra đường dẫn URL http/https hợp lệ
 * @param {string} urlStr
 * @returns {string}
 */
function sanitizeHttpUrl(urlStr) {
  if (typeof urlStr !== 'string' || !urlStr.trim()) return '';
  try {
    const parsed = new URL(urlStr.trim());
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    // Bỏ qua URL không hợp lệ
  }
  return '';
}

/**
 * Khởi tạo bộ quản lý cổng kích hoạt MD Motion Control
 * @param {object} options
 * @param {string} [options.file] - Đường dẫn file JSON lưu trạng thái bền vững
 * @param {string} [options.deviceSeed] - Chuỗi định danh thiết bị để sinh mã MDMC_XXXXXX
 * @param {Function} [options.scanner] - Hàm quét bình luận Facebook (mặc định: scanFacebookPostForCode)
 * @param {Function} [options.now] - Hàm lấy thời gian hiện tại (mặc định: Date.now)
 * @param {number} [options.ttlMs] - Thời hạn mở khóa viral (mặc định: 14 ngày)
 * @param {Function} [options.onChange] - Callback khi trạng thái cổng thay đổi
 * @param {Function} [options.log] - Hàm ghi log
 */
export function createMdViralGate({
  file,
  deviceSeed,
  scanner = scanFacebookPostForCode,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  onChange = () => {},
  log = () => {},
} = {}) {
  const code = deriveActivationCode(deviceSeed);

  const state = {
    code,
    unlocked: false,
    unlockedAt: 0,
    expiresAt: 0,
    fbPostUrl: DEFAULT_FB_POST_URL,
    zaloGroupUrl: DEFAULT_ZALO_GROUP_URL,
    fbOpened: false,
    zaloClicked: false,
    status: 'none', // 'none' | 'in_progress' | 'activated'
    unlockMethod: '', // 'viral' | 'vip' | ''
    note: '',
  };

  // Đọc trạng thái đã lưu từ đĩa nếu có
  function loadStateFromDisk() {
    if (!file) return;
    try {
      if (!fs.existsSync(file)) return;
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;

      if (typeof parsed.unlocked === 'boolean') state.unlocked = parsed.unlocked;
      if (typeof parsed.unlockedAt === 'number') state.unlockedAt = parsed.unlockedAt;
      if (typeof parsed.expiresAt === 'number') state.expiresAt = parsed.expiresAt;
      if (sanitizeHttpUrl(parsed.fbPostUrl)) state.fbPostUrl = sanitizeHttpUrl(parsed.fbPostUrl);
      if (sanitizeHttpUrl(parsed.zaloGroupUrl)) state.zaloGroupUrl = sanitizeHttpUrl(parsed.zaloGroupUrl);
      if (typeof parsed.fbOpened === 'boolean') state.fbOpened = parsed.fbOpened;
      if (typeof parsed.zaloClicked === 'boolean') state.zaloClicked = parsed.zaloClicked;
      if (['none', 'in_progress', 'activated'].includes(parsed.status)) {
        state.status = parsed.status;
      }
      if (['viral', 'vip', ''].includes(parsed.unlockMethod)) {
        state.unlockMethod = parsed.unlockMethod;
      }
      if (typeof parsed.note === 'string') state.note = parsed.note;
    } catch (err) {
      log(`Không đọc được file trạng thái cổng kích hoạt (${file}): ${err?.message || err}`);
    }
  }

  // Ghi trạng thái hiện tại xuống đĩa
  function saveStateToDisk() {
    if (!file) return;
    try {
      const dir = path.dirname(file);
      fs.mkdirSync(dir, { recursive: true });
      const payload = {
        code: state.code,
        unlocked: state.unlocked,
        unlockedAt: state.unlockedAt,
        expiresAt: state.expiresAt,
        fbPostUrl: state.fbPostUrl,
        zaloGroupUrl: state.zaloGroupUrl,
        fbOpened: state.fbOpened,
        zaloClicked: state.zaloClicked,
        status: state.status,
        unlockMethod: state.unlockMethod,
        note: state.note,
      };
      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      log(`Không lưu được file trạng thái cổng kích hoạt (${file}): ${err?.message || err}`);
    }
  }

  loadStateFromDisk();

  /**
   * Kiểm tra ứng dụng hiện đã mở khóa và còn hạn hay chưa
   */
  function isUnlocked() {
    if (state.unlocked !== true) return false;
    if (state.expiresAt && now() >= state.expiresAt) return false;
    return true;
  }

  /**
   * Phiên bản bất đồng bộ của isUnlocked() dùng cho gateGuard
   */
  async function ensureUnlocked() {
    return isUnlocked();
  }

  /**
   * Lý do đang bị khóa ('locked' hoặc 'expired')
   */
  function lockReason() {
    if (state.unlocked === true && state.expiresAt && now() >= state.expiresAt) {
      return 'expired';
    }
    return 'locked';
  }

  /**
   * Cho phép hiển thị cửa sổ chính của ứng dụng
   */
  function canShowWindows() {
    return true;
  }

  /**
   * Khởi tạo trạng thái xác thực ban đầu
   */
  function init() {
    return {
      status: 'signed-in',
      unlocked: isUnlocked(),
      email: 'cogiaothao25@gmail.com',
      name: 'MD Motion Control',
    };
  }

  /**
   * Trả về thông tin phiên người dùng mặc định
   */
  async function me() {
    return { ok: true };
  }

  /**
   * Hàm gọi API có xác thực giả lập khi chạy độc lập
   */
  async function authed(urlPath = '') {
    const p = String(urlPath || '');
    if (p.startsWith('/auth/fs/gate')) {
      return {
        ok: true,
        data: {
          app: 'voice',
          unlocked: isUnlocked(),
          status: isUnlocked() ? 'activated' : 'in_progress',
          code: state.code,
          post_url: state.fbPostUrl,
        },
      };
    }
    if (p.startsWith('/v1/tts/quota')) {
      return {
        ok: true,
        data: { limit: 100000, used: 0, remaining: 100000 },
      };
    }
    return { ok: false, reason: 'offline' };
  }

  /**
   * Trả về dữ liệu hiển thị cổng kích hoạt cho UI và IPC
   */
  function gateView() {
    const unlockedNow = isUnlocked();
    const effectiveStatus = unlockedNow
      ? 'activated'
      : state.status === 'activated'
        ? 'in_progress'
        : state.status;
    return {
      ok: true,
      unlocked: unlockedNow,
      exempt: false,
      code: state.code,
      status: effectiveStatus,
      post_url: state.fbPostUrl,
      zalo_url: state.zaloGroupUrl,
      fbOpened: state.fbOpened,
      zaloClicked: state.zaloClicked,
      expiresAt: state.expiresAt,
      unlockMethod: state.unlockMethod,
      note: state.note,
    };
  }

  /**
   * Lấy trạng thái cổng kích hoạt hiện tại
   */
  function gateState() {
    return gateView();
  }

  function notifyChange() {
    try {
      onChange(gateView());
    } catch (err) {
      log(`Lỗi trong callback onChange của cổng kích hoạt: ${err?.message || err}`);
    }
  }

  /**
   * Bắt đầu quá trình nhận mã và làm nhiệm vụ mở khóa
   */
  function gateClaim() {
    if (!isUnlocked()) {
      state.status = 'in_progress';
    }
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return view;
  }

  /**
   * Đánh dấu người dùng đã bấm mở bài viết Facebook
   */
  function markFbOpened() {
    state.fbOpened = true;
    if (!isUnlocked()) {
      state.status = 'in_progress';
    }
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return view;
  }

  /**
   * Đánh dấu người dùng đã bấm tham gia nhóm Zalo
   */
  function markZaloClicked() {
    state.zaloClicked = true;
    if (!isUnlocked()) {
      state.status = 'in_progress';
    }
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return view;
  }

  /**
   * Cập nhật cấu hình đường dẫn bài viết Facebook và nhóm Zalo
   */
  function setConfig({ fbPostUrl, zaloGroupUrl } = {}) {
    const nextFb = sanitizeHttpUrl(fbPostUrl);
    const nextZalo = sanitizeHttpUrl(zaloGroupUrl);
    if (nextFb) state.fbPostUrl = nextFb;
    if (nextZalo) state.zaloGroupUrl = nextZalo;
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return {
      ...view,
      ok: true,
    };
  }

  /**
   * Kích hoạt nhanh bằng khóa VIP hợp lệ
   */
  function activateVipKey(keyString) {
    if (!verifyVipKey(keyString, state.code)) {
      return {
        ok: false,
        reason: 'invalid_key',
        note: 'Mã kích hoạt VIP không hợp lệ.',
      };
    }

    const currentTime = now();
    state.unlocked = true;
    state.unlockedAt = currentTime;
    state.expiresAt = currentTime + VIP_TTL_MS;
    state.status = 'activated';
    state.unlockMethod = 'vip';
    state.note = 'Đã mở khóa VIP thành công!';
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return {
      ...view,
      ok: true,
    };
  }

  /**
   * Kiểm tra điều kiện mở khóa ngay (Bắt buộc đã bấm Zalo + Tìm thấy bình luận mã trên bài viết Facebook)
   */
  async function gateCheckNow() {
    if (isUnlocked()) {
      return {
        ...gateView(),
        ok: true,
      };
    }

    // Kiểm tra bắt buộc Bước 2: Phải bấm tham gia nhóm Zalo trước
    if (!state.zaloClicked) {
      const zaloNote =
        'Bạn cần bấm nút "Tham gia nhóm Zalo" ở Bước 2 trước khi kiểm tra mở khóa.';
      state.note = zaloNote;
      saveStateToDisk();
      return {
        ...gateView(),
        ok: false,
        error: 'zalo_not_joined',
        reason: 'zalo_not_joined',
        note: zaloNote,
      };
    }

    // Quét bài viết Facebook để tìm bình luận chứa mã kích hoạt
    const scanResult = await scanner({
      postUrl: state.fbPostUrl,
      code: state.code,
      log,
    });

    if (scanResult && scanResult.found === true) {
      const currentTime = now();
      state.unlocked = true;
      state.unlockedAt = currentTime;
      state.expiresAt = currentTime + ttlMs;
      state.status = 'activated';
      state.unlockMethod = 'viral';
      state.note = scanResult.note || 'Đã kích hoạt thành công!';
      saveStateToDisk();
      const view = gateView();
      notifyChange();
      return {
        ...view,
        ok: true,
      };
    }

    state.note =
      scanResult?.note ||
      'Chưa tìm thấy bình luận chứa mã ' +
        state.code +
        ' trên bài viết Facebook. Hãy đảm bảo bạn đã bình luận đúng mã và để chế độ Công khai.';
    saveStateToDisk();
    return {
      ...gateView(),
      ok: false,
      error: 'comment_not_found',
      reason: 'comment_not_found',
      note: state.note,
    };
  }

  return {
    isUnlocked,
    ensureUnlocked,
    lockReason,
    canShowWindows,
    init,
    me,
    authed,
    gateView,
    gateState,
    gateClaim,
    markFbOpened,
    markZaloClicked,
    setConfig,
    activateVipKey,
    gateCheckNow,
    // Các alias tương thích cho hệ thống xác thực / voice gate nếu được gọi
    state: () => ({ status: 'signed-in', unlocked: isUnlocked(), email: 'cogiaothao25@gmail.com', name: 'MD Motion Control', gate: gateView() }),
    login: async () => ({ ok: true, status: 'signed-in', unlocked: isUnlocked() }),
    logout: async () => ({ ok: true }),
    voiceGateView: gateView,
    voiceGateState: gateState,
    voiceGateClaim: gateClaim,
    voiceGateCheckNow: gateCheckNow,
  };
}
