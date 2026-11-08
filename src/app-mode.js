/**
 * Cấu hình chế độ cửa sổ hiển thị (Window Mode) và địa chỉ API máy chủ.
 * Mặc định luôn mở giao diện cục bộ (kind: 'file') kể cả khi đã đóng gói (isPackaged === true),
 * chỉ chuyển sang chế độ 'web' khi người dùng chủ động truyền biến môi trường webUrl hợp lệ.
 */

export const WEB_URL = "https://mdmotion.local/";
export const API_URL = "https://api.mdmotion.local";

const LOCAL = new Set(["127.0.0.1", "localhost"]);

/**
 * Kiểm tra và phân tích URL hợp lệ (chấp nhận https: hoặc http: tại localhost/127.0.0.1).
 * @param {string} rawUrl - Chuỗi URL đầu vào.
 * @returns {URL | null}
 */
function httpUrl(rawUrl) {
  try {
    const parsed = new URL(String(rawUrl));
    const isSecure = parsed.protocol === "https:";
    const isLocalHttp = parsed.protocol === "http:" && LOCAL.has(parsed.hostname);
    return isSecure || isLocalHttp ? parsed : null;
  } catch {
    return null;
  }
}

const web = (parsedUrl) => ({
  kind: "web",
  url: parsedUrl.href,
  origin: parsedUrl.origin,
});

/**
 * Quyết định chế độ mở cửa sổ chính của ứng dụng.
 * Luôn trả về `{ kind: 'file' }` theo mặc định (kể cả khi `isPackaged === true`),
 * trừ khi có `webUrl` hợp lệ được truyền vào.
 *
 * @param {object} [options]
 * @param {boolean} [options.isPackaged]
 * @param {boolean} [options.testMode]
 * @param {string} [options.webUrl]
 * @returns {{ kind: 'file', refused?: string } | { kind: 'web', url: string, origin: string }}
 */
export function pickWindowMode({ isPackaged: _isPackaged, testMode, webUrl } = {}) {
  if (!webUrl) {
    return { kind: "file" };
  }
  const parsed = httpUrl(webUrl);
  if (!parsed || (testMode && !LOCAL.has(parsed.hostname))) {
    return { kind: "file", refused: String(webUrl) };
  }
  return web(parsed);
}

/**
 * Chọn địa chỉ API cơ sở.
 * @param {object} [options]
 * @param {boolean} [options.isPackaged]
 * @param {boolean} [options.testMode]
 * @param {string} [options.apiUrl]
 * @returns {string}
 */
export function pickApiBase({ isPackaged, testMode, apiUrl } = {}) {
  if (isPackaged || !apiUrl) {
    return API_URL;
  }
  const parsed = httpUrl(apiUrl);
  if (!parsed || (testMode && !LOCAL.has(parsed.hostname))) {
    return API_URL;
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
}
