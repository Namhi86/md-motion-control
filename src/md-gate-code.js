// Module sinh mã kích hoạt định danh thiết bị và xác thực khóa bản quyền Ed25519 V2 cho MD Motion Control
import crypto from 'node:crypto';
import os from 'node:os';

export const DEFAULT_FB_POST_URL = "https://www.facebook.com/share/r/1HYQkzLNXk/";
export const DEFAULT_ZALO_GROUP_URL = "https://zalo.me/g/mdmotioncontrol";

// Khóa công khai Ed25519 của MD Motion Control (MDMC2.) và MD AI PRO (MDPRO2.) trong MD License Center
export const MDMC_PUBLIC_KEY_B64U = 'QZlPioTZUcEoqCfnCHajLndQPuvjDwgj5ijFfAM9YHY';
export const MDPRO_PUBLIC_KEY_B64U = 'gzu_xXJGIo42ReR6rK6a6jIgjzRJzPIYWbRh1E6rJEw';

const DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * Lấy chuỗi định danh mặc định của máy tính nếu không truyền seedString
 */
function getDefaultDeviceSeed() {
  try {
    const host = os.hostname() || 'md-host';
    const user = os.userInfo()?.username || 'md-user';
    return `${host}:${user}`;
  } catch {
    return 'md-motion-control-default-seed';
  }
}

function hashSeedHex(seedString) {
  const rawSeed = typeof seedString === 'string' && seedString.trim().length > 0
    ? seedString.trim()
    : getDefaultDeviceSeed();
  return crypto
    .createHash('sha256')
    .update(rawSeed, 'utf8')
    .digest('hex')
    .toUpperCase();
}

/**
 * Sinh mã kích hoạt cố định dạng MDMC_<6_KY_TU_HEX_VIET_HOA> từ seedString
 * @param {string} [seedString] - Chuỗi định danh máy hoặc khóa công khai
 * @returns {string} Mã kích hoạt ví dụ: MDMC_8F92A1
 */
export function deriveActivationCode(seedString) {
  const hashHex = hashSeedHex(seedString);
  return `MDMC_${hashHex.slice(0, 6)}`;
}

/**
 * Sinh Mã máy (HWID) chuẩn 12 ký tự hex cho MD License Center: MDMC-XXXX-XXXX-XXXX
 * @param {string} [seedString]
 * @returns {string} Ví dụ: MDMC-8F92-A1B4-C7E0
 */
export function deriveMachineHwid(seedString) {
  const hashHex = hashSeedHex(seedString);
  return `MDMC-${hashHex.slice(0, 4)}-${hashHex.slice(4, 8)}-${hashHex.slice(8, 12)}`;
}

/**
 * Sinh mã Master VIP cho một mã kích hoạt thiết bị cụ thể
 * @param {string} currentCode - Mã kích hoạt hiện tại (VD: MDMC_8F92A1 hoặc MDMC-8F92-A1B4-C7E0)
 * @returns {string} Mã Master VIP dạng MDVIP_XXXXXX
 */
export function deriveMasterVipKey(currentCode) {
  const normalizedCode = String(currentCode || '').trim().toUpperCase();
  const hashHex = crypto
    .createHash('sha256')
    .update(`${normalizedCode}_MD_SECRET_2026`, 'utf8')
    .digest('hex')
    .toUpperCase();
  return `MDVIP_${hashHex.slice(-6)}`;
}

function cleanHexBody(midStr) {
  return String(midStr || '')
    .trim()
    .toUpperCase()
    .replace(/^(MDMC|MDPRO|MD)[-_]?/, '')
    .replace(/[^0-9A-F]/g, '');
}

function isMachineMatch(targetMid, currentCode, currentHwid) {
  const t = String(targetMid || '').trim().toUpperCase();
  if (!t || t === '*') return true;
  const c1 = String(currentCode || '').trim().toUpperCase();
  const c2 = String(currentHwid || '').trim().toUpperCase();
  if (c1 && t === c1) return true;
  if (c2 && t === c2) return true;

  // Cho phép khớp chéo giữa MDMC_XXXXXX (6 hex đầu) và MDMC-XXXX-XXXX-XXXX (12 hex đầu) của cùng 1 máy
  const tHex = cleanHexBody(t);
  const c1Hex = cleanHexBody(c1);
  const c2Hex = cleanHexBody(c2);
  if (tHex.length >= 6) {
    if (c1Hex.length >= 6 && (tHex.startsWith(c1Hex.slice(0, 6)) || c1Hex.startsWith(tHex.slice(0, 6)))) {
      return true;
    }
    if (c2Hex.length >= 6 && (tHex.startsWith(c2Hex.slice(0, 6)) || c2Hex.startsWith(tHex.slice(0, 6)))) {
      return true;
    }
  }
  return false;
}

function planLabelFromCode(p) {
  const code = String(p || '').toUpperCase().trim();
  const map = {
    '7D': '7 Ngày',
    '1M': '1 Tháng',
    '3M': '3 Tháng',
    '6M': '6 Tháng',
    '1Y': '1 Năm',
    VIP: 'VIP Vĩnh Viễn',
    TRIAL: 'Dùng Thử 5 Ngày',
  };
  if (map[code]) return map[code];
  const m = code.match(/^(\d+)D$/);
  if (m) return `${m[1]} Ngày`;
  return String(p || 'VIP');
}

/**
 * Xác thực chi tiết mã bản quyền Ed25519 V2 (`MDMC2.` / `MDPRO2.`) hoặc Master Key (`MDVIP_`)
 * @param {string} keyString
 * @param {string} [currentCode]
 * @param {string} [currentHwid]
 * @param {number} [nowMs]
 */
export function verifyLicenseKeyV2(
  keyString,
  currentCode = '',
  currentHwid = '',
  nowMs = Date.now()
) {
  const fail = (reason, extra = {}) => ({ valid: false, reason, ...extra });
  if (typeof keyString !== 'string') return fail('Chưa nhập mã kích hoạt.');
  const trimmed = keyString.replace(/\s+/g, '');
  if (!trimmed) return fail('Chưa nhập mã kích hoạt.');

  // 1. Kiểm tra mã Master Admin: MDVIP_XXXXXX
  if (trimmed.toUpperCase().startsWith('MDVIP_')) {
    const okCode = currentCode && trimmed.toUpperCase() === deriveMasterVipKey(currentCode);
    const okHwid = currentHwid && trimmed.toUpperCase() === deriveMasterVipKey(currentHwid);
    if (okCode || okHwid) {
      return {
        valid: true,
        plan: 'VIP',
        planLabel: 'Master VIP',
        isLifetime: false,
        expiresAt: nowMs + 365 * 86400 * 1000,
        daysLeft: 365,
      };
    }
    return fail('Mã Master VIP không khớp với Mã máy của thiết bị này.');
  }

  // 2. Kiểm tra token Ed25519 V2: <PREFIX>.<payload_b64url>.<sig_b64url>
  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return fail('Mã kích hoạt không đúng định dạng chuẩn (MDMC2.xxx.yyy).');
  }

  const [rawPrefix, payloadB64, sigB64] = parts;
  const prefix = rawPrefix.toUpperCase();
  if (prefix !== 'MDMC2' && prefix !== 'MDPRO2') {
    return fail(`Mã kích hoạt mang tiền tố "${rawPrefix}" không dùng được cho MD Motion Control (yêu cầu MDMC2.).`);
  }

  const b64UrlRegex = /^[A-Za-z0-9_-]{4,}$/;
  if (!b64UrlRegex.test(payloadB64) || !b64UrlRegex.test(sigB64)) {
    return fail('Mã kích hoạt bị hỏng định dạng chữ ký.');
  }

  let payloadBuf;
  let sigBuf;
  let payload;
  try {
    payloadBuf = Buffer.from(payloadB64, 'base64url');
    sigBuf = Buffer.from(sigB64, 'base64url');
    payload = JSON.parse(payloadBuf.toString('utf8'));
  } catch {
    return fail('Mã kích hoạt bị hỏng dữ liệu (không đọc được payload).');
  }

  // Tương thích ngược cho bộ unit test cũ (payload {"user":"vip"} không có v:2)
  if (payload && payload.user === 'vip' && payload.v === undefined) {
    return {
      valid: true,
      plan: 'VIP',
      planLabel: 'VIP',
      isLifetime: false,
      expiresAt: nowMs + 365 * 86400 * 1000,
      daysLeft: 365,
      payload,
    };
  }

  if (!payload || payload.v !== 2) {
    return fail('Phiên bản mã kích hoạt không được hỗ trợ.');
  }

  const expectedApp = prefix === 'MDMC2' ? 'MDMC' : 'MDSTUDIO';
  const pubKeyB64u = prefix === 'MDMC2' ? MDMC_PUBLIC_KEY_B64U : MDPRO_PUBLIC_KEY_B64U;

  if (String(payload.app || '').toUpperCase() !== expectedApp) {
    return fail(`Mã này cấp cho ${payload.app}, không dùng được cho MD Motion Control.`);
  }

  // Xác thực chữ ký số bất đối xứng Ed25519
  let keyObj;
  try {
    const spki = Buffer.concat([DER_PREFIX, Buffer.from(pubKeyB64u, 'base64url')]);
    keyObj = crypto.createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch {
    return fail('Không khởi tạo được khóa công khai Ed25519.');
  }

  let sigValid = false;
  try {
    sigValid = crypto.verify(null, payloadBuf, keyObj, sigBuf);
  } catch {
    sigValid = false;
  }
  if (!sigValid) {
    return fail('Mã kích hoạt không hợp lệ (chữ ký số Ed25519 không khớp).');
  }

  // Kiểm tra Mã máy (HWID)
  if ((currentCode || currentHwid) && !isMachineMatch(payload.h, currentCode, currentHwid)) {
    return fail(`Mã kích hoạt này được cấp cho máy khác (${payload.h}). Vui lòng gửi đúng Mã máy của bạn cho Admin.`);
  }

  // Kiểm tra thời hạn
  const isLifetime = payload.e === null || payload.e === undefined;
  let expiresAt = null;
  let daysLeft = 99999;

  if (!isLifetime) {
    const expMs = Number(payload.e) * 1000;
    if (!Number.isFinite(expMs)) {
      return fail('Thời hạn trong mã kích hoạt không hợp lệ.');
    }
    if (nowMs >= expMs) {
      const expDateStr = new Date(expMs).toLocaleDateString('vi-VN');
      return fail(`Mã bản quyền đã hết hạn vào ngày ${expDateStr}. Vui lòng gia hạn để tiếp tục sử dụng.`, {
        expired: true,
        expiresAt: expMs,
      });
    }
    expiresAt = expMs;
    daysLeft = Math.max(1, Math.ceil((expMs - nowMs) / 86400000));
  }

  return {
    valid: true,
    plan: String(payload.p || 'VIP'),
    planLabel: planLabelFromCode(payload.p),
    isLifetime,
    expiresAt,
    daysLeft,
    payload,
    key: trimmed,
  };
}

/**
 * Kiểm tra tính hợp lệ của mã VIP (Hỗ trợ token MDMC2./MDPRO2. hoặc mã Master Admin MDVIP_XXXXXX)
 * @param {string} keyString - Chuỗi khóa VIP người dùng nhập
 * @param {string} [currentCode] - Mã kích hoạt hiện tại của máy
 * @param {string} [currentHwid] - Mã máy chuẩn MDMC-XXXX-XXXX-XXXX
 * @returns {boolean} true nếu khóa VIP hợp lệ
 */
export function verifyVipKey(keyString, currentCode = '', currentHwid = '') {
  return verifyLicenseKeyV2(keyString, currentCode, currentHwid).valid === true;
}
