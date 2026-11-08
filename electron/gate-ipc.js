// Đăng ký các kênh IPC cho cổng kích hoạt MD Motion Control (Facebook + Zalo + VIP)
import { DEFAULT_FB_POST_URL, DEFAULT_ZALO_GROUP_URL } from '../src/md-gate-code.js';

/**
 * Thiết lập các handler IPC cho cổng kích hoạt
 * @param {object} options
 * @param {object} options.ipc - Đối tượng ipcMain hoặc bộ bọc IPC có phương thức .handle()
 * @param {object} options.auth - Đối tượng quản lý cổng kích hoạt (createMdViralGate)
 * @param {Function} options.openExternal - Hàm mở đường dẫn ngoài trình duyệt (shell.openExternal)
 * @param {Function} [options.log] - Hàm ghi log
 */
export function setupGateIpc({ ipc, auth, openExternal, log = () => {} }) {
  ipc.handle('gate:state', () => auth.gateState());

  ipc.handle('gate:claim', () => auth.gateClaim());

  ipc.handle('gate:checkNow', () => auth.gateCheckNow());

  ipc.handle('gate:openPost', async () => {
    const postUrl = auth.gateView?.()?.post_url || DEFAULT_FB_POST_URL;
    if (!postUrl) return { ok: false };
    try {
      if (typeof openExternal === 'function') {
        await openExternal(postUrl);
      }
      auth.markFbOpened?.();
      return {
        ...(auth.gateView?.() || {}),
        ok: true,
      };
    } catch (err) {
      log('Không mở được bài viết Facebook: ' + (err?.message || err));
      return { ok: false };
    }
  });

  ipc.handle('gate:openZalo', async () => {
    const zaloUrl = auth.gateView?.()?.zalo_url || DEFAULT_ZALO_GROUP_URL;
    if (!zaloUrl) return { ok: false };
    try {
      if (typeof openExternal === 'function') {
        await openExternal(zaloUrl);
      }
      auth.markZaloClicked?.();
      return {
        ...(auth.gateView?.() || {}),
        ok: true,
      };
    } catch (err) {
      log('Không mở được nhóm Zalo: ' + (err?.message || err));
      return { ok: false };
    }
  });

  ipc.handle('gate:activateVip', async (arg1, arg2) => {
    const raw = arg2 !== undefined ? arg2 : arg1;
    const key =
      typeof raw === 'string'
        ? raw
        : raw && typeof raw.key === 'string'
          ? raw.key
          : '';
    return auth.activateVipKey(key);
  });

  ipc.handle('gate:setConfig', async (arg1, arg2) => {
    const cfg = arg2 !== undefined ? arg2 : arg1 && typeof arg1 === 'object' ? arg1 : {};
    return auth.setConfig(cfg);
  });
}
