// Bộ chọn DOM và biểu thức kiểm tra trạng thái trang Google AI Studio
export const AI_STUDIO_URL = 'https://aistudio.google.com/prompts/new_chat';

export const AI_STUDIO_SELECTORS = Object.freeze({
  fileInput: 'ms-add-media-button input.file-input',
  media: 'ms-prompt-media',
  textarea: 'textarea',
  primary: 'button.ms-button-primary',
  turn: 'ms-chat-turn',
  agree: '[aria-label="Agree to the copyright acknowledgement"]',
  grounding: 'button[role=switch][aria-label="Grounding with Google Search"][aria-checked="true"], [aria-label="Remove Grounding with Google Search"]',
  tosDialog: '#tos-dialog',
  tosBox: 'mat-checkbox input[type=checkbox]',
  dialogs: '[role=dialog], [role=alertdialog], mat-dialog-container',
  closeButtons: '[mat-dialog-close]',
  alerts: '[role=alert], snack-bar-container, simple-snack-bar, .mat-mdc-snack-bar-label',
  moreActions: '[aria-label="View more actions"]',
  menuItem: '[role=menuitem]',
  signIn: 'a[href*="accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/v3/signin"]',
});

export const GENERATE_URL = /MakerSuiteService\/GenerateContent(\?|$)/;
export const TIER_URL = /MakerSuiteService\/GetAiStudioBenefitTier(\?|$)/;
export const CHAT_PATH = /\/prompts\/(?!new_chat)[^/?#]+/;

export const CAPS = Object.freeze({
  openMs: 20000,
  runWaitMs: 10000,
  startMs: 30000,
  answerMs: 360000,
  accountMs: 600000,
  refusedMs: 3000,
  fallbackMs: 120000,
  termsReadyMs: 12000,
  termsDoneMs: 20000,
  chatSavedMs: 15000,
  tempChatMs: 8000,
  runReloads: 2,
});

const CLOSE_NAME = '/^(close|fermer|đóng|dong|cerrar|schlie(ß|ss)en|fechar|dismiss|got it)\\b/i';
const TEMP_CHAT = '/temporary chat|chat temporaire|tempor(ä|a)rer chat|chat temporal|cuộc trò chuyện tạm thời|一時チャット/i';
const CANCEL_ARIA = '/^(cancel|no thanks|not now|skip)\\b/i';
const NEVER_NAME = '/enable|allow|accept|agree|confirm|continue|delete|remove|decline|reject|deny|refuse|disagree|learn|help|setting|polic|upgrade|subscribe|buy|manage|sign in|log in|bật|cho phép|từ chối|activer|autoriser|refuser|aktivieren|erlauben|ablehnen|activar|permitir|rechazar|有効|許可|拒否/i';

const q = (v) => JSON.stringify(v);
const VIS = 'const vis = (e) => { if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };';
const TXT = "const txt = (e) => (e.innerText || '').replace(/\\s+/g, ' ').trim();";
const READY = "!e.disabled && e.getAttribute('aria-disabled') !== 'true'";

// Hỗ trợ tìm tọa độ click kể cả khi input[type=checkbox] nằm dưới lớp ripple/label của mat-checkbox
const TOP_POINT = `const topPoint = (e) => {
  if (!e) return null;
  const host = e.closest?.('mat-checkbox, button, [role=button], a, label') || e;
  host.scrollIntoView({ block: 'center' });
  const r = e.getBoundingClientRect().width > 4 ? e.getBoundingClientRect() : host.getBoundingClientRect();
  for (const [fx, fy] of [[0.5, 0.5], [0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75]]) {
    const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
    const top = document.elementFromPoint(x, y);
    if (top && (top === e || e.contains(top) || top === host || host.contains(top))) return { x, y };
  }
  return r.width > 4 && r.height > 4 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null;
};`;

const S = AI_STUDIO_SELECTORS;

export const pointExpr = (sel, { re = '', pick = 'first' } = {}) => `(() => {
  ${VIS} ${TXT} ${TOP_POINT}
  const els = [...document.querySelectorAll(${q(sel)})].filter((e) => vis(e) && ${READY} && ${re ? `${re}.test(txt(e))` : 'true'});
  if (${q(pick)} === 'top') els.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  const e = els[0];
  return e ? topPoint(e) : null;
})()`;

export const SIGNALS = `(() => {
  ${VIS} ${TXT}
  const primary = [...document.querySelectorAll(${q(S.primary)})].filter(vis);
  const turns = document.querySelectorAll(${q(S.turn)});
  const last = turns.length ? turns[turns.length - 1].innerText || '' : '';
  return {
    url: location.href,
    box: [...document.querySelectorAll(${q(S.textarea)})].some(vis),
    running: primary.some((b) => /\\bStop\\b/.test(txt(b))),
    run: primary.some((b) => /\\bRun\\b/.test(txt(b))),
    signIn: !!document.querySelector(${q(S.signIn)}),
    turns: turns.length,
    alerts: [...document.querySelectorAll(${q(S.alerts)})].map(txt).join(' | ').slice(0, 400),
    lastJson: last.includes('{'),
  };
})()`;

export const DIALOG_STATE = `(() => {
  ${VIS}
  const pt = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
  const agree = [...document.querySelectorAll(${q(S.agree)})].find(vis);
  const boxes = [...document.querySelectorAll(${q(S.dialogs)})].filter(vis);
  const closeOf = (b) => [...b.querySelectorAll('button, [role=button]')].find((e) => vis(e) && (e.matches(${q(S.closeButtons)}) || ${CLOSE_NAME}.test((e.getAttribute('aria-label') || '').trim()) || ${CLOSE_NAME}.test((e.innerText || '').trim().split('\\n')[0])));
  const close = boxes.map(closeOf).find(Boolean);
  const label = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')).replace(/\\s+/g, ' ').trim();
  const cancelOf = (b) => {
    if (closeOf(b) || b.querySelector(${q(S.agree)}) || b.querySelector('input, textarea, mat-checkbox')) return null;
    const bs = [...b.querySelectorAll('button')].filter(vis);
    const plain = bs.filter((e) => !e.matches(${q(S.primary)}));
    const ways = [...plain.filter((e) => ${CANCEL_ARIA}.test((e.getAttribute('aria-label') || '').trim())), ...plain.filter((e) => ${TEMP_CHAT}.test(label(e))), ...(bs.length === 2 && plain.length === 1 ? plain : [])];
    return ways.find((e) => !${NEVER_NAME}.test(label(e))) || null;
  };
  const cancel = boxes.map(cancelOf).find(Boolean);
  const text = (b) => (b.innerText || '').replace(/\\s+/g, ' ').trim();
  const tos = document.querySelector(${q(S.tosDialog)});
  const hasTosBox = boxes.some((b) => b.querySelector('mat-checkbox, input[type=checkbox]'));
  return {
    terms: (!!tos && vis(tos)) || hasTosBox || location.pathname.startsWith('/onboarding'),
    agree: agree ? pt(agree) : null,
    close: close ? pt(close) : null,
    cancel: cancel ? pt(cancel) : null,
    boxes: boxes.length,
    blockText: boxes.filter((b) => !closeOf(b) && !b.querySelector(${q(S.agree)})).map(text).join(' | ').slice(0, 400),
    text: boxes.map(text).join(' | ').slice(0, 400),
  };
})()`;

export const RUN_STATE = `(() => {
  ${VIS} ${TXT}
  const run = [...document.querySelectorAll(${q(S.primary)})].find((e) => vis(e) && /\\bRun\\b/.test(txt(e)));
  if (!run) return { exists: false };
  if (!run.disabled && run.getAttribute('aria-disabled') !== 'true') {
    run.scrollIntoView({ block: 'center' });
    const r = run.getBoundingClientRect();
    const top = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    if (top && top !== run && !run.contains(top)) {
      const cls = typeof top.className === 'string' ? top.className.trim().split(/\\s+/)[0] : '';
      return { exists: true, why: 'covered', by: top.tagName.toLowerCase() + (cls ? '.' + cls : '') + (txt(top) ? ' ' + txt(top).slice(0, 50) : '') };
    }
  }
  return { exists: true, why: 'disabled', by: '' };
})()`;

export const termsExpr = (which = '', domClick = false) => `(() => {
  ${VIS} ${TXT} ${TOP_POINT}
  const dlg = document.querySelector(${q(S.tosDialog)}) || [...document.querySelectorAll(${q(S.dialogs)})].find((d) => vis(d) && d.querySelector('mat-checkbox, input[type=checkbox]'));
  const root = dlg && vis(dlg) ? dlg : location.pathname.startsWith('/onboarding') ? document.body : null;
  if (!root) return null;
  const boxes = [...root.querySelectorAll('mat-checkbox input[type=checkbox], input[type=checkbox]')].filter((b) => vis(b) || vis(b.closest('mat-checkbox, label')));
  let form = boxes[0] || root;
  const findBtn = (scope) => {
    if (!scope) return null;
    const primary = [...scope.querySelectorAll(${q(S.primary)})].filter(vis)[0];
    if (primary) return primary;
    return [...scope.querySelectorAll('button')].filter(vis).find((b) => /\\b(continue|accept|agree|confirm|get started|tiếp tục|đồng ý)\\b/i.test(txt(b))) || null;
  };
  while (form && form !== document.body && !findBtn(form)) form = form.parentElement;
  const btn = findBtn(form) || findBtn(root);
  const others = boxes.slice(1);
  const ticked = others.find((b) => b.checked);
  const target = { first: boxes[0], other: ticked, btn }[${q(which)}];
  if (${q(Boolean(domClick))} && target) {
    try { target.click(); } catch {}
  }
  return {
    surface: root === document.body ? 'onboarding' : 'dialog',
    n: boxes.length,
    first: boxes[0] ? boxes[0].checked : null,
    othersTicked: others.filter((b) => b.checked).length,
    btn: btn ? !btn.disabled && btn.getAttribute('aria-disabled') !== 'true' : null,
    at: target ? topPoint(target) : null,
  };
})()`;

export const MEDIA_STATE = `(() => {
  const m = [...document.querySelectorAll(${q(S.media)})];
  const ok = (e) => /tokens/i.test(e.innerText || '') && !/loading/i.test(e.innerText || '');
  const alerts = [...document.querySelectorAll(${q(S.alerts)})].map((e) => (e.innerText || '').replace(/\\s+/g, ' ').trim()).join(' | ').slice(0, 400);
  return { n: m.length, ready: m.filter(ok).length, refused: m.filter((e) => /token count failed/i.test(e.innerText || '')).length, alerts };
})()`;

export const typeExpr = (promptText) => `(() => {
  ${VIS}
  const e = [...document.querySelectorAll(${q(S.textarea)})].filter(vis).sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0];
  if (!e) return -1;
  e.focus();
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(e, ${q(promptText)});
  e.dispatchEvent(new Event('input', { bubbles: true }));
  return e.value.length;
})()`;

export const LAST_TURN_TEXT = `(() => { const t = document.querySelectorAll(${q(S.turn)}); return t.length ? t[t.length - 1].innerText || '' : ''; })()`;

export const PLAN_STATE = `(() => {
  ${VIS}
  const say = (e) => ((e.getAttribute('aria-label') || '') + ' ' + (e.innerText || '')).replace(/\\s+/g, ' ').trim();
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  const hits = [...document.querySelectorAll('body *')].filter((e) => {
    if (!vis(e)) return false;
    const r = e.getBoundingClientRect();
    const t = say(e);
    return r.left < 420 && r.bottom > innerHeight * 0.55 && t.length < 200 && /[\\w.+-]+@[\\w-]+/.test(t);
  }).sort((a, b) => area(a) - area(b));
  if (!hits.length) return { chip: false, badge: '' };
  let box = hits[0];
  const small = (e) => { const r = e.getBoundingClientRect(); return r.width < 420 && r.height < 100; };
  for (let i = 0; i < 2 && box.parentElement && small(box.parentElement) && say(box.parentElement).length < 200; i += 1) box = box.parentElement;
  const m = /(?:^|\\s)(PRO|ULTRA)(?:\\s|$)/.exec(say(box));
  return { chip: true, badge: m ? m[1] : '' };
})()`;
