import { existsSync } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, session } from 'electron';
import { activateAccount } from './account-session.js';
import { veoSignInVisible } from '../src/google-session.js';
import { dolaPrefs } from './dola-session.js';
import { loginWithGoogle } from './google-credential-login.js';
import {
  chromeProfileHasSession,
  ensureGoogleSession,
} from './google-session-sync.js';
import { openHome } from './veo-page.js';
import { partitionOf } from './worker-context.js';

// Quản lý kiểm tra & đăng nhập phiên Google Flow (Veo):
// - Khi probe kiểm tra trang Flow: luôn ẩn cửa sổ BrowserWindow (show: false)
// - Khi thực sự cần đăng nhập tài khoản Google (loginWithGoogle): hiện trình duyệt (visible: true)
export function createVeoSessionActions({
  userData,
  log = () => {},
  showWindows = () => true,
} = {}) {
  const sessionOf = (acc) => session.fromPartition(partitionOf(acc.id));

  async function probeFlowHomeHidden(acc) {
    const ses = sessionOf(acc);
    const win = new BrowserWindow({
      show: false,
      width: 1400,
      height: 900,
      title: 'Flow',
      autoHideMenuBar: true,
      webPreferences: dolaPrefs(ses),
    });
    try {
      return await openHome(win);
    } finally {
      if (!win.isDestroyed()) win.destroy();
    }
  }

  return {
    async check(acc, { signal } = {}) {
      const ses = sessionOf(acc);
      await activateAccount({ session: ses }, acc, log);
      const canShowLogin = veoSignInVisible(showWindows);
      return ensureGoogleSession(acc, {
        login: loginWithGoogle,
        electronSession: ses,
        probe: () => probeFlowHomeHidden(acc),
        visible: canShowLogin,
        log,
        signal,
      });
    },
    async signInNew(acc, { signal } = {}) {
      const ses = sessionOf(acc);
      await activateAccount({ session: ses }, acc, log);
      return ensureGoogleSession(acc, {
        login: loginWithGoogle,
        electronSession: ses,
        visible: veoSignInVisible(showWindows),
        log,
        signal,
      });
    },
    async isSigned(acc) {
      if (
        !existsSync(path.join(userData, 'chrome-profiles', String(acc.id)))
      ) {
        return false;
      }
      return chromeProfileHasSession(acc, { log });
    },
  };
}
