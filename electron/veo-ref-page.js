/**
 * Các biểu thức truy vấn DOM trên trang dự án Google Flow (Omni Reference)
 * phục vụ kiểm tra hộp thoại quyền sử dụng video, độ phân giải và trạng thái ô kết quả.
 */

import { findExpr } from './click-at.js';
import { radio } from './nano-page.js';
import { REF_RESOLUTIONS } from '../src/veo-ref.js';

const WALK =
  "const walk = (root, acc = []) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };";
const VIS =
  'const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };';
const SQUASH =
  "const squash = (s) => String(s || '').replace(/\\s+/g, ' ').trim();";
const DIALOG = "'[role=dialog],[role=alertdialog]'";

export const RIGHTS_BOX = `(() => { ${WALK} ${VIS} ${SQUASH}
  const box = walk(document).filter((e) => vis(e) && /^(dialog|alertdialog)$/.test(e.getAttribute('role') || '')).find((d) => /rights to use this video/i.test(d.innerText || ''));
  return box ? { text: squash(box.innerText).slice(0, 300), buttons: [...box.querySelectorAll('button')].map((b) => squash(b.innerText)) } : null; })()`;

export const ANY_DIALOG = `(() => { ${WALK} ${VIS} ${SQUASH}
  const d = walk(document).find((e) => vis(e) && /^(dialog|alertdialog)$/.test(e.getAttribute('role') || ''));
  return d ? squash(d.innerText).slice(0, 160) : ''; })()`;

export const AGREE_AT = findExpr(
  `e.tagName === 'BUTTON' && /^i agree$/i.test(t) && (() => { const d = e.closest(${DIALOG}); return !!d && /rights to use this video/i.test(d.innerText || ''); })()`
);

export const NO_SHOW_AT = findExpr(
  "e.tagName === 'BUTTON' && /do not show again/i.test(t)"
);

export const buttonTopAt = (x, y) =>
  `(() => { ${SQUASH}
  let el = document.elementFromPoint(${Number(x)}, ${Number(y)});
  for (let i = 0; i < 8 && el && el.shadowRoot; i += 1) { const inner = el.shadowRoot.elementFromPoint(${Number(x)}, ${Number(y)}); if (!inner || inner === el) break; el = inner; }
  const b = el && el.closest ? el.closest('button') : null;
  return b ? squash(b.innerText) : null; })()`;

export const VIDEO_CHIPS =
  "[...document.querySelectorAll('button[aria-label=\"Ingredient\"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4 && /videocam/.test(e.innerText || ''); }).length";

export const RES_RADIO = (res) => {
  if (!REF_RESOLUTIONS.includes(res)) {
    throw new RangeError('the resolution is ' + REF_RESOLUTIONS.join(' or '));
  }
  return radio('/^' + res + '(\\s|$)/i');
};

export const LENGTH_LOCKED =
  "(document.body.innerText.match(/Length based on[^\\n]*/i) || [''])[0]";

export const TILE_COUNT = "document.querySelectorAll('flow-video-tile').length";

export const resultTile = (prompt = '', freshCount = 0) => {
  const head = JSON.stringify(
    String(prompt ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 24)
      .toLowerCase()
  );
  const fresh = Math.max(0, Math.floor(Number(freshCount)) || 0);
  return `(() => { ${SQUASH}
  const head = ${head};
  const src = (m) => !!(m.getAttribute('src') || m.currentSrc);
  const loaded = (v) => typeof v.readyState !== 'number' || v.readyState >= 1 || (Number.isFinite(v.duration) && v.duration > 0) || src(v);
  const holds = (e) => [...e.querySelectorAll('video, img, source')].some((m) => {
    if (m.tagName === 'VIDEO') return (src(m) || [...m.querySelectorAll('source')].some(src)) && loaded(m);
    if (m.tagName === 'SOURCE') { const v = m.closest('video'); return src(m) && (!v || loaded(v)); }
    return m.tagName === 'IMG' && src(m);
  });
  const all = [...document.querySelectorAll('flow-video-tile')]; const fresh = ${fresh};
  for (const e of fresh > 0 ? all.slice(0, fresh) : all) {
    const r = e.getBoundingClientRect(); const text = squash(e.innerText); const pending = !!e.querySelector('flow-pending-tile');
    const failed = /^(warning\\s+)?Failed\\b/.test(text); const working = /^play_circle\\s+\\d+%/.test(text) || (head !== '' && text.toLowerCase().includes(head));
    const badge = /^play_circle\\s+\\d{3,4}p\\b/.test(text);
    const named = fresh > 0 && !badge && !failed && !working && /^play_circle\\s+play_circle\\s+\\S/.test(text);
    const bare = !badge && !pending && (/^play_circle$/.test(text) || named) && holds(e); const done = badge || bare;
    if (r.width <= 4 || r.height <= 4 || !(pending || failed || working || done)) continue;
    const state = pending || (working && !done && !failed) ? 'working' : failed ? 'failed' : done ? 'done' : 'working';
    e.scrollIntoView({ block: 'center' });
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), text: text.slice(0, 300), state, bare: bare && state === 'done' };
  }
  return null; })()`;
};

export const RESULT_TILE = resultTile();

export const tileConfirmed = (prev, cur) =>
  cur?.state === 'done' &&
  (!cur.bare ||
    (prev?.state === 'done' &&
      prev.bare === true &&
      prev.x === cur.x &&
      prev.y === cur.y));

export const rowText = (name) =>
  `(() => { const r = [...document.querySelectorAll('button[role=option].asset-item')].find((x) => (x.innerText || '').includes(${JSON.stringify(String(name))})); return r ? (r.innerText || '').replace(/\\s+/g, ' ').trim() : ''; })()`;

export const ORIGINAL_ITEM = findExpr(
  "e.getAttribute('role') === 'menuitem' && (/original size/i.test(t) || (/^720p/i.test(t) && !/upscal|gif/i.test(t) && ![...document.querySelectorAll('[role=menuitem]')].some((m) => /original size/i.test(m.innerText || ''))))"
);

export const clipHasPrompt = (prompt) => {
  const head = String(prompt ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 24)
    .toLowerCase();
  return `(() => { ${SQUASH}
    const lower = (s) => squash(s).toLowerCase();
    const reuse = [...document.querySelectorAll('button')].some((b) => { const r = b.getBoundingClientRect(); return r.width > 4 && r.height > 4 && /reuse prompt/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.innerText || '')); });
    const head = ${JSON.stringify(head)};
    const typed = [...document.querySelectorAll('textarea, [contenteditable=true], [role=textbox]')].some((b) => lower(b.value || b.innerText).includes(head));
    return reuse || (head !== '' && (lower(document.body.innerText).includes(head) || typed)); })()`;
};
