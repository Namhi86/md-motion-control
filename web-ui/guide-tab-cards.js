import { CARD_TEXT, TAB_CARD_TEXT, tabBlocks } from './guide-content.js';
import { blockNode, btn, h, popOpen } from './guide-card.js';
import { readFlags, writeFlag } from './guide-state.js';
import { guideTabs, placePanel, reserveBottom } from './guide-tab-place.js';
import { analyzeOffered } from './analyze-form.js';
import { nanoOffered, nanoRefMax } from './image-models.js';
import { modeOffered } from './muse-form.js';
import { skillsOffered } from './skills-entry.js';

// The first-time card of Tạo ảnh, Kho skill and Phân tích video (plans/261020-1535-md-motion-onboarding-wizard, wave 2). The card of Tạo video is guide-card.js and stays as it was.
//   The FIRST time a person is on one of these tabs the card (a panel floating beside the form / below the title row) opens by itself, once per tab per window: closing it with ✕ or Esc
//   brings it back only after the window is loaded again. "Đã hiểu" writes cardSeen:<tab> for the signed-in e-mail: from then on only the small "?" of the tab (and the "Hướng dẫn" menu) opens it.
//   It never opens by itself while the question "Bạn là người mới?" or the tour is on (isBlocked), nor while another card is open; app.js calls sync() when the tab or that state changes.
//   One panel at a time: a card of another tab closes when its tab is left, and the card of Tạo video lives on its own tab, so two are never on screen together.
//   initTabCards({ dola, opts, tabs, isBlocked, isOtherOpen, closeOther, getEmail, storage, session }) -> { sync, open(id, from), close(confirmed), isOpen, whichOpen, offers(id) }
//   tabs   [{ id: 'image' | 'skills' | 'analyze', current() (that tab is on screen), help() (its "?" button, or null while its view is not built), shown() (its header button is on screen: offers() says false while it is hidden) }]
//   isOtherOpen() / closeOther()  another card (the one of Tạo video) is open / close it: no card opens by itself over another, and opening one by hand closes the other
//   session  the cards already shown in this window, "<e-mail>|<tab>" (a Set; module-level by default): a card closed with ✕ stays closed until the window is loaded again, for that person
// A core without a tab (options() lacks it) gets no card, no "?" and no DOM for it. Every call into the core is guarded: a failure is logged and the app goes on as before.

const asked = new Set();

export const tabOffered = (id, opts, dola) => (id === 'image' ? modeOffered('image', opts) : id === 'skills' ? skillsOffered(opts, dola) : id === 'analyze' ? analyzeOffered(opts, dola) : false);

// What shows now, pure (tests/guide-tab-cards.test.js). here = this tab is on screen and its core offers it; isOpen = its panel is open; otherOpen = another card is open (this tab's own panel does not count).
// auto = the panel opens by itself now: flags read, never understood, not shown in this window, nothing blocks it.
export const tabView = ({ here, loaded, seen, isOpen, blocked, otherOpen, asked: shown } = {}) => ({
  help: !!here,
  panel: !!here && !!isOpen,
  auto: !!here && !!loaded && !seen && !shown && !isOpen && !blocked && !otherOpen,
});

export function initTabCards({ dola, opts, tabs = [], isBlocked = () => false, isOtherOpen = () => false, closeOther = () => {}, getEmail, storage, session = asked } = {}) {
  const mine = tabs.filter((t) => t && TAB_CARD_TEXT[t.id] && tabOffered(t.id, opts, dola));
  const store = storage ?? (() => { try { return localStorage; } catch { return null; } })(); // readFlags / writeFlag cope with a missing or refusing storage
  const mailNow = getEmail ?? (() => dola.auth.state().then((s) => s?.email || s?.name));
  let email = '';
  let seen = {}; // { <tab>: true }: what this e-mail already pressed "Đã hiểu" for (in memory too, so a storage that refuses does not nag in this session)
  let loaded = false;
  let reading = null; // the promise of the flags being read
  let openId = null;
  let opener = null;
  const panels = new Map();
  const wired = new WeakSet();
  const shownKey = (id) => `${email}|${id}`;
  const handOpened = new Set(); // cards the person opened by hand before the flags were read: they count as shown for the e-mail once it is known

  const closeBtn = (id) => { const b = btn('guide-x', '✕', () => close(false)); b.setAttribute('aria-label', CARD_TEXT.close); b.dataset.tab = id; return b; };
  for (const t of mine) { // one panel per tab, drawn on the body (no view's overflow cuts it), the look of the card of Tạo video
    const title = TAB_CARD_TEXT[t.id].title;
    const head = h('div', 'guide-panel-head');
    head.append(h('h2', 'guide-panel-title', title), closeBtn(t.id));
    const body = h('div', 'guide-panel-body');
    body.append(...tabBlocks(t.id, { nanoMax: nanoOffered(opts) ? nanoRefMax(opts) : 0, publish: typeof dola?.skills?.publish === 'function', pickFile: typeof dola?.pickSkill === 'function', uploadSample: typeof dola?.skills?.pickSample === 'function' }).map(blockNode));
    const foot = h('div', 'guide-panel-foot');
    foot.append(btn('guide-go guide-ok', CARD_TEXT.understood, async () => { await (reading ?? read()); close(true); }));
    const panel = h('div', `guide-panel guide-panel--tab guide-panel--${t.id}`);
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    panel.tabIndex = -1;
    panel.hidden = true;
    panel.append(head, body, foot);
    document.body.append(panel);
    panels.set(t.id, panel);
  }

  // The flags of the signed-in e-mail, read once (again after somebody else signs in: a late answer of the old read is dropped).
  function read() {
    const now = Promise.resolve().then(mailNow).then((mail) => mail || '', (err) => { console.error('Guide: the e-mail was not read', err); return ''; }).then((mail) => {
      if (reading !== now) return;
      email = mail;
      for (const id of handOpened) session.add(shownKey(id));
      handOpened.clear();
      seen = readFlags(store, email).cardSeen;
      loaded = true;
      sync();
    });
    reading = now;
    return now;
  }

  function sync() {
    if (!mine.length) return;
    const on = mine.find((t) => t.current()) ?? null; // one tab at most is on screen
    if (on && !reading) read();
    if (openId && openId !== on?.id) openId = null; // leaving the tab closes its card
    const state = (t) => ({ here: t === on, loaded, seen: seen[t.id] === true, isOpen: openId === t.id, blocked: !!isBlocked(), otherOpen: (openId !== null && openId !== t.id) || !!isOtherOpen(), asked: session.has(shownKey(t.id)) });
    const auto = on && tabView(state(on)).auto;
    if (auto) { openId = on.id; opener = null; session.add(shownKey(on.id)); }
    for (const t of mine) {
      const view = tabView(state(t));
      const help = t.help?.() ?? null;
      if (help) {
        if (!wired.has(help)) { wired.add(help); help.onclick = () => (openId === t.id ? close(false) : open(t.id, help)); }
        help.hidden = !view.help;
        help.setAttribute('aria-expanded', String(view.panel));
      }
      const panel = panels.get(t.id);
      panel.hidden = !view.panel;
      if (view.panel) placePanel(panel, t.id);
      reserveBottom(t.id, panel); // the room under the page for a strip along the bottom; gone when the card is shut
    }
    if (auto) panels.get(openId).focus();
  }

  // By hand ("?" or the menu): even while the tour is on, the person asked for it.
  function open(id, from) {
    const t = mine.find((x) => x.id === id);
    if (!t || !t.current()) return;
    opener = from || null;
    openId = id;
    if (loaded) session.add(shownKey(id)); else handOpened.add(id);
    try { closeOther(); } catch (err) { console.error('Guide: the other card did not close', err); }
    sync();
    panels.get(id)?.focus();
  }
  // confirmed = "Đã hiểu": the flag is kept for this e-mail. ✕ / Esc / the "?" only close it.
  function close(confirmed = false) {
    const id = openId;
    if (!id) return;
    if (confirmed) {
      writeFlag(store, email, `cardSeen:${id}`); // false when there is no e-mail or the storage refuses: still seen in this session
      seen = { ...seen, [id]: true };
    }
    const from = opener;
    opener = null;
    openId = null;
    sync();
    [from, mine.find((t) => t.id === id)?.help?.()].find((n) => n && !n.hidden)?.focus();
  }

  window.addEventListener('resize', () => { if (openId) sync(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && openId && !popOpen()) close(false); }, true); // capture, and not while the shared #pop is open over the card (guide-card.js popOpen)
  // Another person: their own flags. Only when the e-mail really CHANGED (the core also pushes auth:changed for a token refresh); an e-mail that cannot be read changes nothing.
  dola?.auth?.onChange?.(async () => {
    const mail = await Promise.resolve().then(mailNow).then((m) => m || '', (err) => { console.error('Guide: the e-mail was not read', err); return null; });
    if (mail === null || (loaded && mail === email)) return;
    reading = null;
    loaded = false;
    openId = null;
    sync();
  });
  sync();

  return { sync, open, close, isOpen: () => openId !== null, whichOpen: () => openId, offers: (id) => mine.some((t) => t.id === id && t.shown?.() !== false) };
}

// What app.js starts: the cards of the three tabs wired to the page. on = { image, analyze, skills }, each a function "that tab is on screen"; guideCard = the card of Tạo video (guide-card.js),
// the one that must never be open together with these. The "?" of every tab is put in its view here; a view built again gets it back (the card is asked to look again).
export function initGuideTabs({ dola, opts, isBlocked, guideCard, on, ...rest } = {}) {
  const { tabs, watch } = guideTabs(on);
  const cards = initTabCards({
    dola, opts, tabs, isBlocked, ...rest,
    isOtherOpen: () => !!guideCard?.isOpen(),
    closeOther: () => { if (guideCard?.isOpen()) guideCard.close(false); },
  });
  watch(() => cards.sync());
  return cards;
}
