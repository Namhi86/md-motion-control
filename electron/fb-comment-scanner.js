// Bộ quét tự động bình luận bài viết Facebook để xác thực mã kích hoạt MDMC_XXXXXX
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

/**
 * Kiểm tra xem nội dung văn bản/HTML có chứa mã kích hoạt hay không (không phân biệt hoa thường)
 * @param {string} content
 * @param {string} code
 * @returns {boolean}
 */
export function contentHasActivationCode(content, code) {
  if (typeof content !== 'string' || typeof code !== 'string') return false;
  const target = code.trim().toUpperCase();
  if (!target) return false;
  return content.toUpperCase().includes(target);
}

/**
 * Tạo danh sách URL cần quét ở Tầng 1 (bản gốc + bản mbasic.facebook.com)
 * @param {string} postUrl
 * @returns {string[]}
 */
export function buildFacebookScanUrls(postUrl) {
  if (typeof postUrl !== 'string' || !postUrl.trim()) return [];
  const raw = postUrl.trim();
  const urls = [raw];
  try {
    const parsed = new URL(raw);
    if (
      parsed.hostname.endsWith('facebook.com') &&
      parsed.hostname !== 'mbasic.facebook.com'
    ) {
      const mbasicUrl = new URL(raw);
      mbasicUrl.hostname = 'mbasic.facebook.com';
      urls.push(mbasicUrl.toString());
    }
  } catch {
    // Giữ nguyên URL gốc nếu không parse được
  }
  return Array.from(new Set(urls));
}

/**
 * Quét bằng BrowserWindow ẩn của Electron (Tầng 2 mặc định khi chạy trong Electron)
 */
async function scanWithElectronBrowserWindow(postUrl, code, { timeoutMs = 25000, log = () => {} } = {}) {
  let electronMod = null;
  try {
    electronMod = await import('electron');
  } catch {
    return false;
  }

  const BrowserWindow = electronMod?.BrowserWindow || electronMod?.default?.BrowserWindow;
  if (typeof BrowserWindow !== 'function') {
    return false;
  }

  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 1180,
      height: 920,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
      },
    });

    const loadPromise = win.loadURL(postUrl, { userAgent: DEFAULT_USER_AGENT }).catch((err) => {
      log(`Cảnh báo khi tải trang Facebook trong BrowserWindow ẩn: ${err?.message || err}`);
    });

    await Promise.race([
      loadPromise,
      new Promise((resolve) => setTimeout(resolve, Math.min(10000, timeoutMs))),
    ]);

    const normalizedCode = String(code || '').trim().toUpperCase();
    const checkScript = `
      (async () => {
        const target = ${JSON.stringify(normalizedCode)};
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const hasCode = () => {
          const text = (document.body?.innerText || '') + '\\n' + (document.documentElement?.innerHTML || '');
          return text.toUpperCase().includes(target);
        };

        if (hasCode()) return true;

        // Thử bấm mở bộ lọc bình luận sang "Tất cả bình luận" / "Mới nhất"
        const filterKeywords = [
          'phù hợp nhất', 'most relevant',
          'tất cả bình luận', 'all comments',
          'mới nhất', 'newest'
        ];

        const clickMatchingElements = () => {
          const nodes = Array.from(document.querySelectorAll('span, div[role="button"], a, button'));
          for (const el of nodes) {
            const label = (el.innerText || el.textContent || '').trim().toLowerCase();
            if (filterKeywords.some((kw) => label === kw || label.includes(kw))) {
              try { el.click(); } catch {}
            }
          }
        };

        for (let step = 0; step < 4; step++) {
          clickMatchingElements();
          window.scrollBy(0, 900);
          const scrollables = Array.from(document.querySelectorAll('div')).filter(
            (d) => d.scrollHeight > d.clientHeight + 100
          );
          for (const box of scrollables) {
            try { box.scrollTop = box.scrollHeight; } catch {}
          }
          await sleep(800);
          if (hasCode()) return true;
        }

        return hasCode();
      })();
    `;

    const found = await Promise.race([
      win.webContents.executeJavaScript(checkScript, true),
      new Promise((resolve) => setTimeout(() => resolve(false), Math.max(4000, timeoutMs - 5000))),
    ]);

    return Boolean(found);
  } catch (err) {
    log(`Lỗi khi quét bình luận bằng BrowserWindow ẩn: ${err?.message || err}`);
    return false;
  } finally {
    if (win && !win.isDestroyed?.()) {
      try {
        win.destroy();
      } catch {
        // Bỏ qua lỗi khi đóng cửa sổ ẩn
      }
    }
  }
}

/**
 * Tự động quét bài viết Facebook để kiểm tra bình luận chứa mã kích hoạt `code`
 * @param {object} options
 * @param {string} options.postUrl - Đường dẫn bài viết Facebook
 * @param {string} options.code - Mã kích hoạt cần tìm (VD: MDMC_8F92A1)
 * @param {Function} [options.fetchFn] - Hàm fetch tùy chỉnh (dùng cho Tầng 1 hoặc unit test)
 * @param {Function} [options.browserScanFn] - Hàm quét trình duyệt tùy chỉnh (dùng cho Tầng 2 hoặc unit test)
 * @param {number} [options.timeoutMs=25000] - Thời gian chờ tối đa (ms)
 * @param {Function} [options.log] - Hàm ghi log
 */
export async function scanFacebookPostForCode({
  postUrl,
  code,
  fetchFn,
  browserScanFn,
  timeoutMs = 25000,
  log = () => {},
} = {}) {
  const normalizedCode = String(code || '').trim();
  const targetPostUrl = String(postUrl || '').trim();

  if (!normalizedCode || !targetPostUrl) {
    return {
      found: false,
      reason: 'comment_not_found',
      note:
        'Chưa tìm thấy bình luận chứa mã ' +
        normalizedCode +
        ' trên bài viết Facebook. Hãy đảm bảo bạn đã bình luận đúng mã và để chế độ Công khai.',
    };
  }

  // Tầng 1: Quét qua HTTP / mbasic / Graph / Embed
  const effectiveFetch = typeof fetchFn === 'function' ? fetchFn : globalThis.fetch;
  if (typeof effectiveFetch === 'function') {
    const candidateUrls = buildFacebookScanUrls(targetPostUrl);
    for (const url of candidateUrls) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = controller
          ? setTimeout(() => controller.abort(), Math.min(12000, timeoutMs))
          : null;
        try {
          const response = await effectiveFetch(url, {
            method: 'GET',
            headers: {
              'User-Agent': DEFAULT_USER_AGENT,
              Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
              'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            signal: controller?.signal,
          });

          let bodyText = '';
          if (typeof response === 'string') {
            bodyText = response;
          } else if (response && typeof response.text === 'function') {
            bodyText = await response.text();
          } else if (response && typeof response.body === 'string') {
            bodyText = response.body;
          }

          if (contentHasActivationCode(bodyText, normalizedCode)) {
            return {
              found: true,
              via: 'http',
              note: 'Đã tìm thấy bình luận mã kích hoạt trên bài viết Facebook.',
            };
          }
        } finally {
          if (timer) clearTimeout(timer);
        }
      } catch (err) {
        log(`Quét HTTP cho ${url} không thành công: ${err?.message || err}`);
      }
    }
  }

  // Tầng 2: Quét bằng BrowserWindow ẩn của Electron hoặc browserScanFn truyền vào
  try {
    let foundInBrowser = false;
    if (typeof browserScanFn === 'function') {
      const result = await browserScanFn(targetPostUrl, normalizedCode, { timeoutMs, log });
      if (typeof result === 'boolean') {
        foundInBrowser = result;
      } else if (typeof result === 'string') {
        foundInBrowser = contentHasActivationCode(result, normalizedCode);
      } else if (result && typeof result === 'object') {
        foundInBrowser = Boolean(result.found);
      }
    } else {
      foundInBrowser = await scanWithElectronBrowserWindow(targetPostUrl, normalizedCode, {
        timeoutMs,
        log,
      });
    }

    if (foundInBrowser) {
      return {
        found: true,
        via: 'browser',
        note: 'Đã xác nhận bình luận mã kích hoạt trên bài viết Facebook.',
      };
    }
  } catch (err) {
    log(`Quét trình duyệt cho ${targetPostUrl} gặp lỗi: ${err?.message || err}`);
  }

  return {
    found: false,
    reason: 'comment_not_found',
    note:
      'Chưa tìm thấy bình luận chứa mã ' +
      normalizedCode +
      ' trên bài viết Facebook. Hãy đảm bảo bạn đã bình luận đúng mã và để chế độ Công khai.',
  };
}
