// Module sinh mã kích hoạt định danh thiết bị và xác thực khóa VIP cho MD Motion Control
import crypto from 'node:crypto';
import os from 'node:os';

export const DEFAULT_FB_POST_URL = "https://www.facebook.com/share/p/1MDMotionControl/";
export const DEFAULT_ZALO_GROUP_URL = "https://zalo.me/g/mdmotioncontrol";

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

/**
 * Sinh mã kích hoạt cố định dạng MDMC_<6_KY_TU_HEX_VIET_HOA> từ seedString
 * @param {string} [seedString] - Chuỗi định danh máy hoặc khóa công khai
 * @returns {string} Mã kích hoạt ví dụ: MDMC_8F92A1
 */
export function deriveActivationCode(seedString) {
  const rawSeed = typeof seedString === 'string' && seedString.trim().length > 0
    ? seedString.trim()
    : getDefaultDeviceSeed();
  const hashHex = crypto
    .createHash('sha256')
    .update(rawSeed, 'utf8')
    .digest('hex')
    .toUpperCase();
  return `MDMC_${hashHex.slice(0, 6)}`;
}

/**
 * Sinh mã Master VIP cho một mã kích hoạt thiết bị cụ thể
 * @param {string} currentCode - Mã kích hoạt hiện tại (VD: MDMC_8F92A1)
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

/**
 * Kiểm tra tính hợp lệ của mã VIP (Hỗ trợ token MDMC2./MDPRO2. hoặc mã Master Admin MDVIP_XXXXXX)
 * @param {string} keyString - Chuỗi khóa VIP người dùng nhập
 * @param {string} [currentCode] - Mã kích hoạt hiện tại của máy
 * @returns {boolean} true nếu khóa VIP hợp lệ
 */
export function verifyVipKey(keyString, currentCode = '') {
  if (typeof keyString !== 'string') return false;
  const trimmed = keyString.trim();
  if (!trimmed) return false;

  // 1. Kiểm tra mã Master Admin: MDVIP_<6_KY_TU_CUOI_CUA_SHA256(currentCode + "_MD_SECRET_2026")>
  if (currentCode && typeof currentCode === 'string') {
    const expectedMaster = deriveMasterVipKey(currentCode);
    if (trimmed.toUpperCase() === expectedMaster) {
      return true;
    }
  }

  // 2. Kiểm tra cấu trúc <PREFIX>.<payload_b64url>.<sig_b64url> với PREFIX là MDMC2 hoặc MDPRO2
  const parts = trimmed.split('.');
  if (parts.length === 3) {
    const [prefix, payloadB64, sigB64] = parts;
    if (prefix !== 'MDMC2' && prefix !== 'MDPRO2') {
      return false;
    }
    const b64UrlRegex = /^[A-Za-z0-9_-]{4,}$/;
    if (!b64UrlRegex.test(payloadB64) || !b64UrlRegex.test(sigB64)) {
      return false;
    }
    return true;
  }

  return false;
}
