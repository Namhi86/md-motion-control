// The version under the logo: "v<core>" (window.dola.meta().coreVersion = the installed app), the web version in the tooltip
// (<meta name="fs-web-version">). Pure text from the two values; the page draws it with textContent.
import { t } from './i18n.js';

export const VERSION_RE = /^\d{1,4}(\.\d{1,4}){1,3}(-[0-9A-Za-z.]{1,20})?$/;

export function versionLabel(coreVersion, webVersion) {
  const core = typeof coreVersion === 'string' && VERSION_RE.test(coreVersion) ? coreVersion : '';
  const web = typeof webVersion === 'string' && /^[0-9.-]{1,20}$/.test(webVersion) ? webVersion : '';
  return {
    text: core ? `v${core}` : '',
    title: [core && t('Phiên bản app {version}', { version: core }), web && t('giao diện {version}', { version: web })].filter(Boolean).join(' · '),
  };
}

// Fills #app-version once the core answers; an older core or a failed call leaves it empty and hidden.
// -> the core version that was shown ('0.1.10'), or '' when nothing is shown (whats-new-ui.js builds on it).
export async function showVersion({ dola = window.dola, doc = document } = {}) {
  const el = doc.getElementById('app-version');
  const pill = doc.getElementById('md-ver-pill');
  if (!el && !pill) return '';
  let core = '';
  try { core = (await dola.meta())?.coreVersion ?? ''; } catch { /* no version shown */ }
  const web = doc.querySelector('meta[name="fs-web-version"]')?.getAttribute('content') ?? '';
  const { text, title } = versionLabel(core, web);
  if (pill && core) {
    pill.textContent = `v${core} PRO`;
  }
  if (!el) return core;
  el.textContent = text;
  el.title = title;
  el.hidden = !text;
  return text ? text.slice(1) : '';
}
