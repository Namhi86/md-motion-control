// Bộ quản lý trạng thái cổng kích hoạt Bản quyền Ed25519 V2 (MD License Center) & Viral (Facebook + Zalo) cho MD Motion Control
import fs from 'node:fs';
import https from 'node:https';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {
  DEFAULT_FB_POST_URL,
  DEFAULT_ZALO_GROUP_URL,
  deriveActivationCode,
  deriveMachineHwid,
  verifyLicenseKeyV2,
} from '../src/md-gate-code.js';
import { scanFacebookPostForCode } from './fb-comment-scanner.js';

const DEFAULT_TTL_MS = 14 * 24 * 3600 * 1000; // 14 ngày (Viral)
const VIP_TTL_MS = 365 * 24 * 3600 * 1000; // 365 ngày mặc định
const LICENSE_ENDPOINT = (
  process.env.MD_LICENSE_ENDPOINT || 'https://md-license-api.cogiaothao25.workers.dev'
).replace(/\/+$/, '');
const PRODUCT_ID = 'md-motion-control';

/**
 * Gửi JSON POST tới MD License Center Worker
 */
function postLicenseJson(urlStr, bodyObj, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const data = Buffer.from(JSON.stringify(bodyObj), 'utf8');
      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: u.hostname,
          port: u.port || (u.protocol === 'https:' ? 443 : 80),
          path: u.pathname + u.search,
          method: 'POST',
          family: 4,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
            'User-Agent': 'MD-Motion-Control-License/2.5.1',
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              resolve(null);
            }
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
      req.write(data);
      req.end();
    } catch {
      resolve(null);
    }
  });
}

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
 * @param {string} [options.deviceSeed] - Chuỗi định danh thiết bị để sinh mã MDMC_XXXXXX & MDMC-XXXX-XXXX-XXXX
 * @param {Function} [options.scanner] - Hàm quét bình luận Facebook (mặc định: scanFacebookPostForCode)
 * @param {Function} [options.now] - Hàm lấy thời gian hiện tại (mặc định: Date.now)
 * @param {number} [options.ttlMs] - Thời hạn mở khóa viral (mặc định: 14 ngày)
 * @param {Function} [options.onChange] - Callback khi trạng thái cổng thay đổi
 * @param {Function} [options.log] - Hàm ghi log
 * @param {boolean} [options.cloudSync] - Bật/tắt đồng bộ với MD License Center Cloud
 */
export function createMdViralGate({
  file,
  deviceSeed,
  scanner = scanFacebookPostForCode,
  now = Date.now,
  ttlMs = DEFAULT_TTL_MS,
  onChange = () => {},
  log = () => {},
  cloudSync,
} = {}) {
  const code = deriveActivationCode(deviceSeed);
  const hwid = deriveMachineHwid(deviceSeed);
  const isTestEnv = Boolean(
    process.env.NODE_TEST_CONTEXT ||
      (typeof file === 'string' && file.includes('md-viral-gate-test-'))
  );
  const enableCloud = cloudSync !== undefined ? Boolean(cloudSync) : !isTestEnv;

  const state = {
    code,
    hwid,
    unlocked: false,
    unlockedAt: 0,
    expiresAt: 0,
    fbPostUrl: DEFAULT_FB_POST_URL,
    zaloGroupUrl: DEFAULT_ZALO_GROUP_URL,
    fbOpened: false,
    zaloClicked: false,
    status: 'none', // 'none' | 'in_progress' | 'activated' | 'rejected'
    unlockMethod: '', // 'viral' | 'vip' | ''
    licenseKey: '',
    plan: '',
    planLabel: '',
    revoked: false,
    revokeReason: '',
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
      if (['none', 'in_progress', 'activated', 'rejected'].includes(parsed.status)) {
        state.status = parsed.status;
      }
      if (['viral', 'vip', ''].includes(parsed.unlockMethod)) {
        state.unlockMethod = parsed.unlockMethod;
      }
      if (typeof parsed.licenseKey === 'string') state.licenseKey = parsed.licenseKey;
      if (typeof parsed.plan === 'string') state.plan = parsed.plan;
      if (typeof parsed.planLabel === 'string') state.planLabel = parsed.planLabel;
      if (typeof parsed.revoked === 'boolean') state.revoked = parsed.revoked;
      if (typeof parsed.revokeReason === 'string') state.revokeReason = parsed.revokeReason;
      if (typeof parsed.note === 'string') state.note = parsed.note;

      // Nếu đang lưu licenseKey V2, xác thực lại chữ ký Ed25519 và thời hạn
      if (state.licenseKey && state.unlockMethod === 'vip') {
        const ver = verifyLicenseKeyV2(state.licenseKey, state.code, state.hwid, now());
        if (!ver.valid) {
          state.unlocked = false;
          state.status = 'in_progress';
          state.note = ver.reason || 'Bản quyền không hợp lệ hoặc đã hết hạn.';
        } else {
          state.plan = ver.plan || state.plan;
          state.planLabel = ver.planLabel || state.planLabel;
          state.expiresAt = ver.isLifetime ? 0 : ver.expiresAt || state.expiresAt;
        }
      }
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
        hwid: state.hwid,
        unlocked: state.unlocked,
        unlockedAt: state.unlockedAt,
        expiresAt: state.expiresAt,
        fbPostUrl: state.fbPostUrl,
        zaloGroupUrl: state.zaloGroupUrl,
        fbOpened: state.fbOpened,
        zaloClicked: state.zaloClicked,
        status: state.status,
        unlockMethod: state.unlockMethod,
        licenseKey: state.licenseKey,
        plan: state.plan,
        planLabel: state.planLabel,
        revoked: state.revoked,
        revokeReason: state.revokeReason,
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
    if (state.revoked === true) return false;
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
    if (state.revoked === true) return 'revoked';
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
      hwid: state.hwid,
      code: state.code,
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
          hwid: state.hwid,
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
    const effectiveStatus = state.revoked
      ? 'rejected'
      : unlockedNow
        ? 'activated'
        : state.status === 'activated'
          ? 'in_progress'
          : state.status;
    return {
      ok: true,
      unlocked: unlockedNow,
      exempt: false,
      code: state.code,
      hwid: state.hwid,
      status: effectiveStatus,
      post_url: state.fbPostUrl,
      zalo_url: state.zaloGroupUrl,
      fbOpened: state.fbOpened,
      zaloClicked: state.zaloClicked,
      expiresAt: state.expiresAt,
      unlockMethod: state.unlockMethod,
      plan: state.plan,
      planLabel: state.planLabel,
      revoked: state.revoked,
      reject_reason: state.revokeReason || undefined,
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
   * Đồng bộ trạng thái bản quyền 2 chiều từ xa với MD License Center Worker (/v1/heartbeat):
   * 1. Thu hồi từ xa (revoked: true) -> Khóa máy ngay lập tức và chuyển về màn hình khóa (#gate).
   * 2. Gỡ / Xóa bản quyền từ xa (valid: false, reason: 'no_license' | 'expired') -> Gỡ Key trên máy và đưa về màn hình khóa (#gate).
   * 3. Kích hoạt / Cấp Key / Gia hạn từ xa (valid: true, key: 'MDMC2...') -> Tự động nhận Key và mở khóa vào thẳng công cụ.
   */
  let manualDeactivatedKey = '';

  async function syncWithLicenseCenter() {
    if (!enableCloud) return gateView();
    try {
      const hostname = os.hostname() || 'MD-PC';
      // Gửi key: '' để tra cứu chuẩn trạng thái trên Cloud theo mid (tránh việc Worker tự chèn lại Key đã bị Admin xóa)
      const res = await postLicenseJson(`${LICENSE_ENDPOINT}/v1/heartbeat`, {
        product: PRODUCT_ID,
        key: '',
        mid: state.hwid,
        hostname,
      });
      if (!res || typeof res !== 'object') return gateView();

      // 1. Admin bấm Thu hồi / Khóa từ xa (Revoke)
      if (res.status === 'revoked' || res.revoked === true) {
        manualDeactivatedKey = '';
        const reason = res.reason || 'Bản quyền trên máy này đã bị thu hồi bởi Quản trị viên.';
        const changed =
          state.unlocked !== false ||
          state.revoked !== true ||
          state.revokeReason !== reason ||
          Boolean(state.licenseKey);
        state.unlocked = false;
        state.revoked = true;
        state.revokeReason = reason;
        state.licenseKey = '';
        state.unlockMethod = '';
        state.plan = '';
        state.planLabel = '';
        state.expiresAt = 0;
        state.status = 'in_progress';
        state.note = `⛔ ${reason}`;
        if (changed) {
          saveStateToDisk();
          notifyChange();
        }
        return gateView();
      }

      // 2. Admin bấm Gỡ / Xóa bản quyền từ xa (Remove) hoặc máy chưa được kích hoạt trên Cloud
      if (res.valid === false && (res.reason === 'no_license' || res.reason === 'expired')) {
        manualDeactivatedKey = '';
        if ((state.unlocked && state.unlockMethod !== 'viral') || state.revoked || state.licenseKey) {
          state.unlocked = false;
          state.revoked = false;
          state.revokeReason = '';
          state.unlockedAt = 0;
          state.expiresAt = 0;
          state.licenseKey = '';
          state.unlockMethod = '';
          state.plan = '';
          state.planLabel = '';
          state.status = 'in_progress';
          state.note =
            res.reason === 'expired'
              ? '⌛ Bản quyền đã hết hạn. Vui lòng gia hạn hoặc nhập Key mới.'
              : '🔒 Bản quyền đã được gỡ từ xa. Vui lòng kích hoạt lại để sử dụng.';
          saveStateToDisk();
          notifyChange();
        }
        return gateView();
      }

      // 3. Admin Cấp Key / Kích hoạt / Mở khóa lại / Gia hạn từ xa trên Cloud
      if ((res.status === 'active' || res.valid === true) && typeof res.key === 'string' && res.key.trim()) {
        const remoteKey = res.key.trim();
        if (manualDeactivatedKey && remoteKey === manualDeactivatedKey) {
          return gateView();
        }
        manualDeactivatedKey = '';
        const ver = verifyLicenseKeyV2(remoteKey, state.code, state.hwid, now());
        if (ver.valid) {
          const nextExp = ver.isLifetime ? 0 : ver.expiresAt || 0;
          const changed =
            !state.unlocked ||
            state.revoked ||
            state.licenseKey !== remoteKey ||
            state.expiresAt !== nextExp ||
            state.plan !== ver.plan;
          state.unlocked = true;
          state.revoked = false;
          state.revokeReason = '';
          state.unlockedAt = state.unlockedAt || now();
          state.expiresAt = nextExp;
          state.status = 'activated';
          state.unlockMethod = 'vip';
          state.licenseKey = remoteKey;
          state.plan = ver.plan;
          state.planLabel = ver.planLabel;
          const expText = ver.isLifetime
            ? 'Vĩnh viễn'
            : `Hạn: ${new Date(nextExp).toLocaleDateString('vi-VN')} (còn ${ver.daysLeft} ngày)`;
          state.note = `Đã kích hoạt bản quyền ${ver.planLabel} · ${expText}`;
          if (changed) {
            saveStateToDisk();
            notifyChange();
          }
        }
      }
    } catch {
      // Bỏ qua lỗi mạng tạm thời
    }
    return gateView();
  }

  if (enableCloud) {
    setTimeout(() => {
      syncWithLicenseCenter().catch(() => {});
    }, 1000).unref?.();
    setInterval(() => {
      syncWithLicenseCenter().catch(() => {});
    }, 5000).unref?.();
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
    if (enableCloud) {
      syncWithLicenseCenter().catch(() => {});
    }
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
   * Kích hoạt nhanh bằng khóa bản quyền Ed25519 V2 (MDMC2.) hoặc Master Key (MDVIP_)
   */
  function activateVipKey(keyString) {
    const ver = verifyLicenseKeyV2(keyString, state.code, state.hwid, now());
    if (!ver.valid) {
      return {
        ok: false,
        reason: 'invalid_key',
        note: ver.reason || 'Mã kích hoạt bản quyền không hợp lệ.',
      };
    }

    const currentTime = now();
    const nextExp = ver.isLifetime ? 0 : ver.expiresAt || currentTime + VIP_TTL_MS;
    manualDeactivatedKey = '';
    state.unlocked = true;
    state.revoked = false;
    state.revokeReason = '';
    state.unlockedAt = currentTime;
    state.expiresAt = nextExp;
    state.status = 'activated';
    state.unlockMethod = 'vip';
    state.licenseKey = ver.key || String(keyString || '').trim();
    state.plan = ver.plan || 'VIP';
    state.planLabel = ver.planLabel || 'VIP';
    const expText = ver.isLifetime
      ? 'Vĩnh viễn'
      : `Hạn dùng: ${new Date(nextExp).toLocaleDateString('vi-VN')} (còn ${ver.daysLeft} ngày)`;
    state.note = `🎉 Đã kích hoạt bản quyền ${state.planLabel} thành công! (${expText})`;
    saveStateToDisk();
    const view = gateView();
    notifyChange();

    if (enableCloud && state.licenseKey.includes('.')) {
      const hostname = os.hostname() || 'MD-PC';
      postLicenseJson(`${LICENSE_ENDPOINT}/v1/activate`, {
        product: PRODUCT_ID,
        key: state.licenseKey,
        mid: state.hwid,
        plan: state.plan,
        exp: nextExp ? new Date(nextExp).toISOString() : null,
        hostname,
      }).catch(() => {});
      postLicenseJson(`${LICENSE_ENDPOINT}/v1/heartbeat`, {
        product: PRODUCT_ID,
        key: state.licenseKey,
        mid: state.hwid,
        hostname,
      }).catch(() => {});
    }

    return {
      ...view,
      ok: true,
    };
  }

  /**
   * Khóa lại công cụ / Gỡ Key hiện tại trên máy để quay về màn hình khóa bản quyền mặc định
   */
  function deactivateKey() {
    manualDeactivatedKey = state.licenseKey || '';
    state.unlocked = false;
    state.unlockedAt = 0;
    state.expiresAt = 0;
    state.status = 'in_progress';
    state.unlockMethod = '';
    state.licenseKey = '';
    state.plan = '';
    state.planLabel = '';
    state.revoked = false;
    state.revokeReason = '';
    state.note = 'Vui lòng nhập Mã kích hoạt bản quyền (MDMC2....) để mở khóa công cụ.';
    saveStateToDisk();
    const view = gateView();
    notifyChange();
    return {
      ...view,
      ok: true,
    };
  }

  /**
   * Kiểm tra điều kiện mở khóa ngay (Thử đồng bộ Cloud trước, sau đó kiểm tra Zalo + Facebook)
   */
  async function gateCheckNow() {
    manualDeactivatedKey = '';
    if (enableCloud) {
      await syncWithLicenseCenter();
    }
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
      state.revoked = false;
      state.revokeReason = '';
      state.unlockedAt = currentTime;
      state.expiresAt = currentTime + ttlMs;
      state.status = 'activated';
      state.unlockMethod = 'viral';
      state.plan = '14D';
      state.planLabel = 'Cộng đồng 14 Ngày';
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
    deactivateKey,
    gateCheckNow,
    syncWithLicenseCenter,
    // Các alias tương thích cho hệ thống xác thực / voice gate nếu được gọi
    state: () => ({
      status: 'signed-in',
      unlocked: isUnlocked(),
      email: 'cogiaothao25@gmail.com',
      name: 'MD Motion Control',
      hwid: state.hwid,
      code: state.code,
      gate: gateView(),
    }),
    login: async () => ({ ok: true, status: 'signed-in', unlocked: isUnlocked() }),
    logout: async () => deactivateKey(),
    voiceGateView: gateView,
    voiceGateState: gateState,
    voiceGateClaim: gateClaim,
    voiceGateCheckNow: gateCheckNow,
  };
}
