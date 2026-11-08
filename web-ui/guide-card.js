import { CARD_TEXT, createBlocks } from './guide-content.js';
import { readFlags, writeFlag } from './guide-state.js';
import { skillOffered } from './shared/skill-form.js';
import { skillsOffered } from './skills-entry.js';
import { getLang } from './i18n.js';

// The first-time card of the "Tạo video" tab (plans/261020-1535-md-motion-onboarding-wizard, phase 3). It never takes room from the form:
//   strip   a short bar (<= 96 px) floating at the bottom right: one line + "Xem hướng dẫn". Shown while this e-mail has not pressed "Đã hiểu".
//   panel   the card itself, floating in the same corner (position fixed): the blocks of guide-content.js and "Đã hiểu" (writes the flag cardSeen:create).
//   "?"     the small button in the form (#guide-help) opens the panel at any time. Esc closes it; the focus goes back to what opened it.
// Everything is drawn by position: fixed / absolute, so the form's boxes do not move by even a pixel (tests/headless check measures it).
//   initGuideCard({ dola, opts, helpBtn, isVideoTab, isBlocked, getEmail, storage }) -> { sync, open(from), close, isOpen }
//   isVideoTab()  the Tạo video form is on screen (not Setup, not the picture mode)    sync()  app.js calls it whenever the screen or the mode changes
//   isBlocked()   the question / the tour of guide-init.js is on (or not decided yet): the strip is hidden; app.js calls sync() when that changes
// Every call into the core is guarded: a failure is logged and the app goes on as before.

const TAB = 'create';

// What shows now, pure (tests/guide-card.test.js): the strip while the card was never confirmed, the panel while it is open, the "?" on the video tab.
// loaded = the flags of the signed-in e-mail were read (the strip waits for it, so a person who already pressed "Đã hiểu" never sees it flash).
// blocked = the question "Bạn là người mới?" or the tour is on screen (or about to be): the STRIP waits, so a beginner is not asked twice at once. The panel (opened by the person with the "?")
// and the "?" are never blocked: they were asked for.
export const cardView = ({ available, loaded, seen, panelOpen, blocked } = {}) => ({
  strip: !!available && !!loaded && !seen && !panelOpen && !blocked,
  panel: !!available && !!panelOpen,
  help: !!available,
});

// Which blocks this core can show: each is drawn only when what it talks about is on the form (guide-content.js createBlocks).
export const blockFlags = (opts, dola) => ({ elements: !!dola?.elements, skillFile: skillOffered(opts, dola), skillStore: skillsOffered(opts, dola) });

// A picker of the page (the shared #pop: the Model list, the ratio list, the menu of the "Hướng dẫn" button) is open above a card. Esc belongs to it first, as in elements-popup.js / video-detail.js: the
// cards listen in the CAPTURE phase (before pop.js closes the list on the same key) and leave the key alone while the list is open, or one Esc would close the list AND the card (review L1).
export const popOpen = () => document.getElementById('pop')?.hidden === false;

export const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
export const btn = (cls, text, fn) => { // a handler never throws to the page, sync or async
  const b = h('button', cls, text);
  b.type = 'button';
  b.onclick = () => { Promise.resolve().then(fn).catch((err) => console.error('Guide: a button failed', err)); };
  return b;
};

// The pictures of the guide were shot from the app in each language: guide/<file> is the Vietnamese set, guide/en/<file> the English one (scripts/shoot-guide.mjs, GUIDE_LANG=en).
export const guideImageSrc = (file, lang = getLang()) => (lang === 'en' ? `guide/en/${file}` : `guide/${file}`);

export function blockNode(block) {
  const sec = h('section', 'guide-block');
  sec.dataset.block = block.id;
  sec.append(h('h3', 'guide-block-title', block.title), ...block.lines.map((line) => h('p', 'guide-line', line)));
  if (block.image) { // a picture only when the content names one; width x height are reserved up front (the CSS scales it down, aspect kept), so nothing jumps
    const img = h('img', 'guide-img');
    img.onerror = () => { img.onerror = null; img.src = guideImageSrc(block.image, 'vi'); }; // an English file that is missing: the Vietnamese picture, never a broken one
    img.src = guideImageSrc(block.image);
    img.alt = block.alt || '';
    if (block.width > 0 && block.height > 0) { img.width = block.width; img.height = block.height; }
    sec.append(img);
  }
  return sec;
}

export function initGuideCard({ dola, opts, helpBtn, isVideoTab, isBlocked = () => false, getEmail, storage } = {}) {
  const store = storage ?? (() => { try { return localStorage; } catch { return null; } })(); // readFlags / writeFlag cope with a missing or refusing storage
  const mailNow = getEmail ?? (() => dola.auth.state().then((s) => s?.email || s?.name));
  let email = '';
  let seen = false; // this e-mail already pressed "Đã hiểu" (in memory too, so a storage that refuses does not nag in this session)
  let loaded = false;
  let reading = null; // the promise of the flags being read
  let panelOpen = false;
  let opener = null;

  const stripGo = btn('guide-go', CARD_TEXT.open, () => open(stripGo));
  const strip = h('div', 'guide-strip');
  strip.setAttribute('role', 'region');
  strip.setAttribute('aria-label', CARD_TEXT.title);
  strip.append(h('p', 'guide-strip-text', CARD_TEXT.strip), stripGo);

  const closeBtn = btn('guide-x', '✕', () => close(false));
  closeBtn.setAttribute('aria-label', CARD_TEXT.close);
  const head = h('div', 'guide-panel-head');
  head.append(h('h2', 'guide-panel-title', CARD_TEXT.title), closeBtn);
  const body = h('div', 'guide-panel-body');
  body.append(...createBlocks(blockFlags(opts, dola)).map(blockNode));
  const understood = btn('guide-go guide-ok', CARD_TEXT.understood, async () => { await (reading ?? read()); close(true); });
  const foot = h('div', 'guide-panel-foot');
  foot.append(understood);
  const panel = h('div', 'guide-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', CARD_TEXT.title);
  panel.tabIndex = -1;
  panel.append(head, body, foot);
  document.body.append(strip, panel);

  // The flags of the signed-in e-mail, read once (again after somebody signs in or out: a late answer of the old read is dropped).
  function read() {
    const mine = Promise.resolve().then(mailNow).then((mail) => mail || '', (err) => { console.error('Guide: the e-mail was not read', err); return ''; }).then((mail) => {
      if (reading !== mine) return;
      email = mail;
      seen = readFlags(store, email).cardSeen[TAB] === true;
      loaded = true;
      sync();
    });
    reading = mine;
    return mine;
  }

  // The strip and the panel float beside the form column (to its right), where the form is not: the column's right edge, read from the page.
  function place() {
    const col = document.querySelector('.cv-col')?.getBoundingClientRect();
    if (col && col.width > 0) for (const n of [strip, panel]) n.style.left = `${Math.round(col.right + 16)}px`;
  }

  function sync() {
    const available = !!isVideoTab();
    if (!available) panelOpen = false;
    else if (!loaded) read();
    const view = cardView({ available, loaded, seen, panelOpen, blocked: !!isBlocked() });
    strip.hidden = !view.strip;
    panel.hidden = !view.panel;
    helpBtn.hidden = !view.help;
    helpBtn.setAttribute('aria-expanded', String(view.panel));
    if (view.strip || view.panel) place();
  }

  function open(from) {
    if (!isVideoTab()) return;
    opener = from || helpBtn;
    panelOpen = true;
    sync();
    panel.focus();
  }
  // understood = "Đã hiểu": the flag is kept for this e-mail; Esc / ✕ / "?" only close it (the strip stays until it is understood).
  function close(confirmed) {
    if (confirmed) {
      writeFlag(store, email, `cardSeen:${TAB}`); // false when there is no e-mail or the storage refuses: still seen in this session
      seen = true;
    }
    const from = opener;
    opener = null;
    panelOpen = false;
    sync();
    (from === stripGo && strip.hidden ? helpBtn : from || helpBtn).focus(); // the strip's button is gone once it was understood: the "?" takes the focus
  }

  helpBtn.onclick = () => { if (panelOpen) close(false); else open(helpBtn); };
  window.addEventListener('resize', () => { if (!strip.hidden || !panel.hidden) place(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && panelOpen && !popOpen()) close(false); }, true);
  // Another person: their own flags. Only when the e-mail really CHANGED: the core also pushes auth:changed for a token refresh or a gate poll, and that must not close
  // the card the person is reading or bring the strip back after "Đã hiểu". An e-mail that cannot be read (null) changes nothing.
  dola?.auth?.onChange?.(async () => {
    const mail = await Promise.resolve().then(mailNow).then((m) => m || '', (err) => { console.error('Guide: the e-mail was not read', err); return null; });
    if (mail === null || (loaded && mail === email)) return;
    reading = null;
    loaded = false;
    panelOpen = false;
    sync();
  });
  sync();

  return { sync, open, close, isOpen: () => panelOpen };
}
