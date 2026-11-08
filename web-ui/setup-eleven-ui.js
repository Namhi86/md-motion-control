import { el } from './pop.js';
import { DEFAULT_SETTINGS, EL_TEXT, MAX_COUNT, clearProxies, loadSettings, proxyCountText, registerAccounts, saveProxies, saveRegCount } from './setup-eleven.js';
import { mountCaptcha } from './setup-eleven-captcha-ui.js';

// The ElevenLabs panel of the Setup screen, drawn in place of the paste box (ElevenLabs has no paste: the app MAKES its accounts). Draws only; the rules and every
// sentence are in setup-eleven.js, the captcha choice in setup-eleven-captcha-ui.js. The panel is built here, not in index.html (an older page without it is untouched).
//   api = window.dola.elevenlabs   accounts = window.dola.accounts   copy(text) -> bool
// The window never gets a proxy line back: the box is empty again after a save and the core answers only a count.
// -> { node, show(on), load() }
export function mountEleven({ api, accounts, copy }) {
  const root = el('div', 'su-el');
  root.id = 'su-el';
  root.hidden = true;
  let settings = { ...DEFAULT_SETTINGS };
  let busy = false;
  const live = []; // the buttons of this panel: disabled while one call is in flight
  const button = (text, cls, onclick, title = '') => {
    const b = el('button', `stp-btn ${cls}`.trim(), text);
    b.type = 'button';
    if (title) b.title = title;
    b.onclick = onclick;
    live.push(b);
    return b;
  };
  // One answer line under a block: say(text, bad).
  const line = () => {
    const p = el('p', 'stp-msg su-el-msg');
    p.hidden = true;
    return { node: p, say(text, bad = false) { p.textContent = text; p.hidden = !text; p.classList.toggle('stp-msg--bad', bad); } };
  };
  async function run(work, say) {
    if (busy) return;
    busy = true;
    for (const b of live) b.disabled = true;
    try {
      const r = await work();
      if (r.settings) adopt(r.settings);
      say(r.text, r.bad === true);
    } finally {
      busy = false;
      for (const b of live) b.disabled = false;
    }
  }
  const section = (title) => {
    const s = el('div', 'su-el-sec');
    s.append(el('h3', 'su-el-h', title));
    return s;
  };

  const warn = el('p', 'su-el-warn', EL_TEXT.warning);
  warn.setAttribute('role', 'note');

  // the proxies: a paste box that is empty after a save; the core answers only how many it holds
  const proxy = section('Proxy');
  const proxyBox = el('textarea', 'stp-input su-el-proxy');
  proxyBox.id = 'su-el-proxy';
  proxyBox.placeholder = EL_TEXT.proxyPlaceholder;
  proxyBox.spellcheck = false;
  proxyBox.setAttribute('autocomplete', 'off');
  proxyBox.setAttribute('aria-label', 'Proxy');
  const proxyInfo = el('p', 'stp-hint su-el-proxyinfo');
  const proxyLine = line();
  const saveBtn = button('Lưu proxy', '', () => run(async () => {
    const r = await saveProxies(api, proxyBox.value);
    if (r.ok) proxyBox.value = '';
    return r;
  }, proxyLine.say));
  saveBtn.id = 'su-el-proxy-save';
  const clearBtn = button('Xoá proxy', '', () => run(() => clearProxies(api), proxyLine.say));
  const proxyActions = el('div', 'stp-actions');
  proxyActions.append(saveBtn, clearBtn);
  proxy.append(proxyBox, proxyActions, proxyInfo, el('p', 'stp-hint', EL_TEXT.proxyHint), proxyLine.node);

  // how many accounts one press makes, and the button
  const count = section('Số tài khoản mỗi lần tạo');
  const countBox = el('input', 'su-el-count');
  countBox.id = 'su-el-count';
  countBox.type = 'number';
  countBox.min = '1';
  countBox.max = String(MAX_COUNT);
  countBox.step = '1';
  countBox.setAttribute('inputmode', 'numeric');
  countBox.setAttribute('aria-label', 'Số tài khoản mỗi lần tạo');
  const countLine = line();
  countBox.onchange = async () => {
    const r = await saveRegCount(api, countBox.value);
    if (r.settings) adopt(r.settings);
    else countBox.value = String(settings.regCount); // the number the core still holds, never one it refused
    countLine.say(r.text, r.bad === true);
  };
  const createBtn = button('Tạo tài khoản', 'stp-btn--accent', () => run(() => registerAccounts(accounts, countBox.value), countLine.say), 'App tự tạo lần lượt từng tài khoản bằng Chrome thật');
  createBtn.id = 'su-el-create';
  const countRow = el('div', 'su-el-countrow');
  countRow.append(countBox, createBtn);
  count.append(countRow, el('p', 'stp-hint', `Từ 1 đến ${MAX_COUNT}. ${EL_TEXT.topup}`), countLine.node);

  // the captcha choice
  const captcha = mountCaptcha({ api, copy, onSettings: (s) => adopt(s, true) });
  const cap = section('Cách xử lý captcha');
  cap.append(captcha.node);

  root.append(warn, proxy, count, cap);

  // `fromCaptcha`: the captcha block already holds these settings (it made the write)
  function adopt(next, fromCaptcha = false) {
    settings = next;
    proxyInfo.textContent = proxyCountText(settings.proxyCount);
    clearBtn.hidden = settings.proxyCount === 0;
    countBox.value = String(settings.regCount);
    if (!fromCaptcha) captcha.setSettings(settings);
  }
  adopt(settings);

  return {
    node: root,
    show(on) { root.hidden = !on; },
    async load() {
      const s = await loadSettings(api);
      if (s) adopt(s);
      await captcha.load(s || settings);
    },
  };
}
