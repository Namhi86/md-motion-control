import { TAB_CARD_TEXT } from './guide-content.js';
import { h } from './guide-card.js';

// Where the first-time card of Tạo ảnh / Kho skill / Phân tích video floats, and where the small "?" of each tab sits (plans/261020-1535-md-motion-onboarding-wizard, wave 2).
// Both are drawn by position: fixed / absolute, so no box of the view moves by even a pixel (tests/guide-tab-place.test.js pins the numbers, the headless check measures the page).
//   panelBox     pure: the left / top / max-height of a panel from the rectangles it must keep clear of
//   placePanel   reads those rectangles from the page and sets them on the panel
//   createHelpSlots  the "?" buttons: each one is put in its view by the guide's own code (the views are built by other modules, which are not touched) and put back when a view is rebuilt
//   guideTabs        the `tabs` list guide-tab-cards.js wants, from "is this tab on screen" functions

const TOP = 72; // the header is 56 px, plus the page's own 16
const GAP = 8; // between the thing to clear and the panel
const SIDE = 16; // from the window edge and from the form column
const BOTTOM = 20;
const MIN_HEIGHT = 160; // a window this short still shows a scrolling card
export const NARROW = 1100; // the width below which the two full-page views are one wide column: guide.css @media (max-width: 1099px)

// col   the rectangle of the form column (.cv-col): the card of Tạo ảnh floats to its right, like the one of Tạo video
// clear the rectangle of the part of the view that must stay uncovered (the top bar of the Kho, the title and its line of Phân tích video): the card starts below it, on the right
// -> { left: px | null (null = the stylesheet's right: 16px), top, maxHeight: px | null (null = the stylesheet's) }
export function panelBox(id, { col = null, clear = null } = {}, viewportHeight = 0) {
  const left = id === 'image' && col && col.width > 0 ? Math.round(col.right + SIDE) : null;
  let top = id !== 'image' && clear ? Math.max(TOP, Math.round(clear.bottom + GAP)) : TOP;
  if (viewportHeight > 0) top = Math.min(top, viewportHeight - MIN_HEIGHT - BOTTOM);
  return { left, top, maxHeight: viewportHeight > 0 ? Math.max(MIN_HEIGHT, viewportHeight - top - BOTTOM) : null };
}

const ANCHORS = { image: { col: '.cv-col' }, skills: { clear: '#view-skills .sk-bar' }, analyze: { clear: '#view-analyze .an-sub' } };
// The page that scrolls under a card. A card that lies along the bottom of the window (the strip of a window narrower than 1100px) would hide the last part of the page for good: scrolled to its very end the
// last box still sits under the strip (review L2: measured, 6 of 6). While such a card is open the page gets as much room under its last box as the card is high (+ the gap); the room goes when the card
// closes, and a card that is not along the bottom (beside the form, or on the right) leaves the page exactly as it was. The strip is recognised by where it IS (its bottom edge on the window's), not by the width.
const SCROLLER = { skills: '#view-skills', analyze: '#view-analyze' };
export function reserveBottom(id, panel, doc = document, win = window) {
  const view = SCROLLER[id] ? doc.querySelector(SCROLLER[id]) : null;
  if (!view) return 0;
  const r = panel && !panel.hidden && typeof panel.getBoundingClientRect === 'function' ? panel.getBoundingClientRect() : null;
  const along = !!r && r.height > 0 && (win?.innerHeight || 0) > 0 && r.bottom >= win.innerHeight - BOTTOM - 1 && r.left <= SIDE + 1 && r.width >= (win.innerWidth || 0) - 2 * SIDE - 2;
  const room = along ? Math.ceil(r.height + BOTTOM) : 0;
  view.style.paddingBottom = room ? `${room}px` : ''; // '' = the stylesheet's own 40px
  return room;
}
export function placePanel(panel, id, doc = document, win = window) {
  const spec = ANCHORS[id] ?? {};
  const rectOf = (selector) => {
    const node = selector ? doc.querySelector(selector) : null;
    const r = typeof node?.getBoundingClientRect === 'function' ? node.getBoundingClientRect() : null;
    return r && r.width > 0 ? r : null;
  };
  const box = panelBox(id, { col: rectOf(spec.col), clear: rectOf(spec.clear) }, win?.innerHeight || 0);
  const strip = id !== 'image' && (win?.innerWidth || Infinity) < NARROW; // a narrow window: the stylesheet puts the card at the bottom, as a low wide strip
  panel.style.left = box.left === null ? '' : `${box.left}px`;
  panel.style.top = strip ? '' : `${box.top}px`;
  panel.style.maxHeight = strip || box.maxHeight === null ? '' : `${box.maxHeight}px`;
}

// Where each "?" goes: find() = the element that must hold it (null while the view is not built), put(holder, button) puts it in.
//   image     first child of the prompt box, in the corner where the "?" of Tạo video stands (that one is hidden in the picture mode)
//   skills    in the top bar between the period switch and the tools: the tools sit at the right edge (margin-left: auto), so nothing moves
//   analyze   at the end of the title line (inside the h1, after its words, sized like a letter of it): a block of its own would push everything under it down
const SPEC = {
  image: { find: (doc) => doc.querySelector('.cv-prompt'), put: (holder, b) => holder.prepend(b) },
  skills: { find: (doc) => doc.querySelector('#view-skills .sk-bar'), put: (holder, b) => { const tools = holder.querySelector('.sk-tools'); if (tools) tools.before(b); else holder.append(b); } },
  // The button sits INSIDE the h1, so the name a screen reader gives the heading would be "Phân tích video Hướng dẫn phân tích video" (measured in Chrome's accessibility tree, review L9). The heading
  // keeps its own words as its name: the label is the text it had before the button came (read from the page, no sentence typed here), and the button keeps its own name.
  analyze: { find: (doc) => doc.querySelector('#view-analyze .an-title'), put: (holder, b) => { if (!holder.getAttribute?.('aria-label')) { const words = (holder.textContent || '').trim(); if (words) holder.setAttribute('aria-label', words); } holder.append(b); } },
};

// -> { help(id) -> the "?" of that tab (made once, put in its view when the view exists) | null, watch(onInserted) }
export function createHelpSlots(doc = document) {
  const made = new Map();
  const wanted = new Set(); // the tabs somebody asked a "?" for (the tabs of an older core are never asked: no button is made for them)
  function help(id) {
    const spec = SPEC[id];
    if (!spec) return null;
    wanted.add(id);
    const holder = spec.find(doc);
    if (!holder) return null;
    let b = made.get(id);
    if (!b) {
      b = h('button', `guide-help guide-help--${id}`, '?');
      b.type = 'button';
      b.id = `guide-help-${id}`;
      b.title = TAB_CARD_TEXT[id].help;
      b.setAttribute('aria-label', TAB_CARD_TEXT[id].help);
      b.setAttribute('aria-haspopup', 'dialog');
      b.hidden = true; // the card shows it while its tab is on screen
      made.set(id, b);
    }
    if (b.parentNode !== holder) spec.put(holder, b); // a view that was built again lost it: the same button goes back in
    return b;
  }
  // A view the guide did not build (the Kho and Phân tích video draw themselves, the Kho the first time its tab opens) may be drawn again: onInserted() runs after a "?" was put back.
  function watch(onInserted) {
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(() => {
      let moved = false;
      for (const id of wanted) {
        const before = made.get(id)?.parentNode;
        if (help(id) && made.get(id).parentNode !== before) moved = true;
      }
      if (moved) onInserted();
    });
    for (const name of ['view-skills', 'view-analyze']) {
      const root = doc.getElementById(name);
      if (root) observer.observe(root, { childList: true, subtree: true });
    }
  }
  return { help, watch };
}

// The `tabs` of initTabCards: on = { image, analyze, skills }, each a function "that tab is on screen". -> { tabs, watch(onInserted) }
// shown() = the header button of the tab is on screen (app.js hides it while the tab's own module did not start: `$('nav-analyze').hidden = !analyzeUi`). The menu lists an entry only then, the same
// rule the header follows, so "Hướng dẫn" never offers a tab that opens an empty screen (review L3: analyze-view.js failing to load left the entry in the menu and the button hidden).
const NAV_BUTTON = { image: 'nav-image', analyze: 'nav-analyze', skills: 'nav-skills' };
export function guideTabs(on, doc = document) {
  const slots = createHelpSlots(doc);
  const tabs = Object.keys(SPEC).map((id) => ({ id, current: () => !!on[id]?.(), help: () => slots.help(id), shown: () => { const nav = doc.getElementById(NAV_BUTTON[id]); return !nav || nav.hidden !== true; } }));
  return { tabs, watch: slots.watch };
}
