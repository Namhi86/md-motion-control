import { el } from './pop.js';
import { CAPTCHA_TEXT as T, captchaView, deleteKey, enableSolver, loadProviders, testKey, useSelf } from './setup-eleven-captcha.js';

// Copies a link with a throwaway box on the page (the core denies navigator.clipboard to the page; the box of the unlock screen is inside a hidden screen and cannot be
// selected). true when the browser did it, false otherwise; never throws.
export function copyViaPage(text, doc = document) {
  let box = null;
  try {
    box = doc.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    doc.body.append(box);
    box.select();
    return doc.execCommand('copy') === true;
  } catch (err) {
    console.error('setup: copy failed', err?.name);
    return false;
  } finally {
    box?.remove?.();
  }
}

// The DOM of the captcha choice (rules and sentences are in setup-eleven-captcha.js). Draws only; setup-eleven-ui.js owns the panel and says when it shows.
//   api   window.dola.elevenlabs      copy(text) -> true | false   copies a link (the core has no "open in the browser" channel for it: the address shows as text)
//   onSettings(settings)   a write to the core answered: the panel keeps the same copy of the settings
// The key the person types lives in one password box until the core has it; it is never put back into the page (the core answers only `hasCaptchaKey`), and after a
// save the box is gone. -> { node, load(settings), setSettings(settings) }
export function mountCaptcha({ api, copy, onSettings = () => {} }) {
  const root = el('div', 'su-el-captcha');
  let settings = { captchaMode: 'self', captchaProvider: '', hasCaptchaKey: false };
  let providers = [];
  let draft = {}; // { mode?, provider? } picked in the window and not saved yet
  let editing = false; // "Đổi": the key box shows although a key is saved
  let busy = false;
  let live = []; // the buttons of the current drawing: disabled while a call is in flight (no redraw, so a typed key is never lost)
  const msg = el('p', 'stp-msg su-el-msg');
  msg.hidden = true;
  const say = (text, bad = false) => {
    msg.textContent = text;
    msg.hidden = !text;
    msg.classList.toggle('stp-msg--bad', bad);
  };
  const button = (text, cls, onclick, title = '') => {
    const b = el('button', `stp-btn stp-btn--sm ${cls}`.trim(), text);
    b.type = 'button';
    b.disabled = busy;
    if (title) b.title = title;
    b.onclick = onclick;
    live.push(b);
    return b;
  };
  async function run(work) {
    if (busy) return;
    busy = true;
    for (const b of live) b.disabled = true;
    let changed = false;
    try {
      const r = await work();
      if (r?.settings) {
        settings = r.settings;
        draft = {};
        editing = false;
        changed = true;
        onSettings(settings);
      }
      say(r?.text || '', r?.bad === true);
    } finally {
      busy = false;
      // Redrawn only when the core took something (the key box is then gone). A refusal leaves the page as it is, so a key that was typed is not lost.
      if (changed) render();
      else for (const b of live) b.disabled = false;
    }
  }
  const row = (label, value) => {
    const r = el('div', 'su-el-kv');
    r.append(el('span', 'su-el-k', label), typeof value === 'string' ? el('span', 'su-el-v', value) : value);
    return r;
  };

  function platformCard(v) {
    const p = v.provider;
    const box = el('div', 'su-el-prov');
    const select = el('select', 'su-el-select');
    select.id = 'su-el-provider';
    select.setAttribute('aria-label', T.provider);
    for (const x of v.providers) {
      const o = el('option', '', x.label);
      o.value = x.id;
      o.selected = x.id === v.providerId;
      select.append(o);
    }
    select.value = v.providerId;
    select.onchange = () => { draft = { ...draft, mode: 'solver', provider: select.value }; editing = false; say(''); render(); };
    box.append(row(T.provider, select), row(T.owner, p.owner || '—'));
    if (p.signupUrl) {
      const link = el('span', 'su-el-link');
      link.append(el('code', 'su-el-url', p.signupUrl));
      link.append(button(T.copy, '', () => say(copy(p.signupUrl) ? T.copied : T.copyFailed, false)));
      box.append(row(T.signup, link));
    } else box.append(row(T.signup, T.noLink));
    if (p.keyHint) box.append(row('Lấy key ở', p.keyHint));
    if (p.freeNote) box.append(row('Miễn phí', p.freeNote));
    if (p.priceNote) box.append(row('Giá', p.priceNote));
    if (p.warning) box.append(el('p', 'su-el-warn', p.warning));
    return box;
  }

  function keyRow(v) {
    const k = el('div', 'su-el-keyrow');
    if (v.showKeyInput) {
      const input = el('input', 'su-el-key');
      input.id = 'su-el-key';
      input.type = 'password';
      input.placeholder = T.keyHolder;
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('aria-label', T.key);
      input.spellcheck = false;
      k.append(input, button(T.enable, 'stp-btn--accent', () => run(async () => {
        const typed = input.value; // read once, sent once
        const r = await enableSolver(api, { providerId: v.providerId, key: typed, keySaved: v.keySaved });
        if (r.ok) input.value = '';
        return r;
      })));
      if (editing) k.append(button(T.cancel, '', () => { editing = false; say(''); render(); }));
      if (v.keyOtherPlatform) k.append(el('p', 'stp-hint su-el-keynote', T.keyOther));
      return k;
    }
    k.append(el('span', 'su-el-saved', T.keySaved));
    if (!v.active) k.append(button('Bật nền tảng này', 'stp-btn--accent', () => run(() => enableSolver(api, { providerId: v.providerId, key: '', keySaved: true }))));
    k.append(
      button(T.change, '', () => { editing = true; say(''); render(); }),
      button(T.remove, '', () => run(() => deleteKey(api))),
      button(T.test, '', () => run(async () => { say(T.testing); return testKey(api); }), 'Không tốn tiền: chỉ hỏi số dư của key đã lưu'),
    );
    return k;
  }

  function render() {
    live = [];
    const v = captchaView(settings, providers, draft, editing);
    const seg = el('div', 'su-el-seg');
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-label', T.title);
    for (const [mode, text] of [['self', T.self], ['solver', T.solver]]) {
      const b = el('button', `su-el-opt${v.mode === mode ? ' su-el-opt--on' : ''}`, text);
      b.type = 'button';
      b.dataset.mode = mode;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(v.mode === mode));
      b.onclick = () => {
        if (busy || v.mode === mode) return;
        if (mode === 'self' && settings.captchaMode === 'solver') return run(() => useSelf(api));
        draft = { ...draft, mode };
        editing = false;
        say('');
        render();
      };
      seg.append(b);
    }
    const body = el('div', 'su-el-capbody');
    if (v.mode === 'self') {
      body.append(el('p', 'stp-hint', T.selfHint));
      if (v.orphanKey) {
        const o = el('div', 'su-el-keyrow');
        o.append(el('span', 'stp-hint', T.orphan), button(T.remove, '', () => run(() => deleteKey(api))));
        body.append(o);
      }
    } else if (!v.provider) body.append(el('p', 'stp-hint', T.none));
    else {
      if (v.active) body.append(el('p', 'su-el-active', `Đang dùng ${v.provider.label} để giải captcha.`));
      body.append(platformCard(v), keyRow(v));
    }
    root.replaceChildren(seg, body, msg);
  }

  render();
  return {
    node: root,
    async load(next) {
      if (next) settings = next;
      providers = await loadProviders(api);
      render();
    },
    setSettings(next) { settings = next; render(); },
  };
}
