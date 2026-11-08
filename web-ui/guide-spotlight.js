import { darkBoxes, holeOf, placePopup, ringOf, EDGE } from './guide-geometry.js';

// The look of the beginner tour (plans/261020-1535-md-motion-onboarding-wizard): a dark layer with a bright HOLE around the real button, a lime ring on the hole, and a popup with an
// arrow that points into it. DOM only (no word of the guide is typed here: the popup draws the model of guide-tour-steps.js modelFor()); the geometry is guide-geometry.js (pure, tested);
// it is checked in a real browser by /tmp/guide-harness/tour.mjs and in the real app by tests/e2e/guide-checks.mjs.
//   The dark layer is FOUR boxes around the hole, so the hole is a real gap: a click there goes to the real button, a click on the dark part stops here (nothing behind it moves).
//   createSpotlight({ doc, win }) -> { show({ model, rect, clip, pending, handlers, focus, inside }), hide(), isShown(), contains(node), fits() }
//     model     what the popup says: { title, lines: [{ text, tone }], buttons: [{ id, label, kind, disabled }], skip, close, why }
//     rect      the box of the real button(s) in window pixels, or null: no hole, the popup sits in the middle        pending  true = dark only, no popup (the button is not there yet)
//     clip      the box the hole is cut to (the scrolling page below the header), or null = the window      inside  () -> the controls the person can type in / press INSIDE the hole, in page order
//     handlers  { onButton(id), onSkip(), onClose() }                                                                 focus    true = the focus goes to the popup (a new step)
// The Tab key goes round ONE ring: the controls inside the hole first (the paste box, the add button...), then the buttons of the popup, then round again. Esc closes the tour for now, but
// not while a menu / popover of the page (#pop, an element window) is open over it: Esc belongs to that layer first.
// show() may be called as often as the tour likes (every 120 ms): the popup is drawn again only when what it says changes, and the focus is never taken from what the person is typing in.
export const POPUP_WIDTH = 360;

export function createSpotlight({ doc = document, win = window } = {}) {
  let root = null;
  let boxes = [];
  let ring = null;
  let popup = null;
  let body = null;
  let arrow = null;
  let sig = '';
  let handlers = {};
  let before = null; // what had the focus when the tour came
  let keys = null;
  let insideNow = () => [];
  let lastFits = true;
  let measured = '';

  const h = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const place = (n, r) => Object.assign(n.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, display: r.width > 0 && r.height > 0 ? 'block' : 'none' });
  const focusables = () => [...popup.querySelectorAll('button:not([disabled])')];

  function build() {
    root = h('div', 'guide-tour');
    root.dataset.guideTour = '';
    boxes = [0, 1, 2, 3].map(() => h('div', 'guide-tour-dark'));
    ring = h('div', 'guide-tour-ring');
    ring.dataset.guideHole = '';
    popup = h('div', 'guide-tour-popup'); // the shell: it does not scroll, so the arrow can stick out of it; the words live in `body`, which scrolls when the window is tiny
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-modal', 'false'); // the controls inside the hole are part of the step and stay reachable, so the page behind is not "inert" for a screen reader
    popup.tabIndex = -1;
    body = h('div', 'guide-tour-body');
    arrow = h('div', 'guide-tour-arrow');
    popup.append(body, arrow);
    root.append(...boxes, ring, popup);
    // a wheel over the dark part still scrolls the page behind (the Setup page scrolls inside itself), so the person can reach the rest of it
    root.addEventListener('wheel', (ev) => { const page = doc.getElementById('view-setup'); if (page && !page.hidden) page.scrollBy({ top: ev.deltaY }); }, { passive: true });
    doc.body.append(root);
  }

  function draw(model) {
    body.replaceChildren();
    popup.querySelector('.guide-tour-x')?.remove(); // the cross lives in the shell (outside the scrolling words), so it is made again with every popup
    if (model.close) {
      const x = h('button', 'guide-tour-x', '✕');
      x.type = 'button';
      x.setAttribute('aria-label', model.close);
      x.onclick = () => handlers.onClose?.();
      popup.insertBefore(x, arrow);
    }
    if (model.title) body.append(h('h2', 'guide-tour-title', model.title));
    for (const line of model.lines) body.append(h('p', `guide-tour-line guide-tour-line--${line.tone}`, line.text));
    if (model.why) { const why = h('p', 'guide-tour-line guide-tour-line--why', model.why); why.id = 'guide-tour-why'; body.append(why); } // why "Tiếp" is off: beside the buttons, read with it
    const row = h('div', 'guide-tour-actions');
    for (const b of model.buttons) {
      const n = h('button', `guide-tour-btn${b.kind === 'primary' ? ' guide-tour-btn--primary' : ''}`, b.label);
      n.type = 'button';
      n.dataset.button = b.id;
      if (b.disabled) { n.disabled = true; n.setAttribute('aria-disabled', 'true'); if (model.why) n.setAttribute('aria-describedby', 'guide-tour-why'); }
      n.onclick = () => handlers.onButton?.(b.id);
      row.append(n);
    }
    body.append(row);
    if (model.skip) {
      const s = h('button', 'guide-tour-skip', model.skip);
      s.type = 'button';
      s.onclick = () => handlers.onSkip?.();
      body.append(s);
    }
    popup.setAttribute('aria-label', model.title || model.lines[0]?.text || '');
    body.querySelectorAll('.guide-tour-line').forEach((n, i) => { n.id = n.id || `guide-tour-line-${i}`; });
    popup.setAttribute('aria-describedby', body.querySelector('.guide-tour-line')?.id || '');
  }

  // Esc and Tab belong to a menu / popover of the page when one is open above the tour (the shared #pop, an element window): the layer on top answers first (as video-detail.js does).
  const otherLayerOpen = () => !!doc.querySelector('.el-pop, .el-modal-back') || doc.getElementById('pop')?.hidden === false;
  // The ring of Tab: the controls inside the hole (in page order), then the buttons of the popup. Focus on the page outside both: Tab goes to the first of the ring.
  const tabRing = () => [...insideNow(), ...focusables()];
  function onKey(ev) {
    if (ev.key === 'Escape') { if (otherLayerOpen()) return; ev.preventDefault(); handlers.onClose?.(); return; } // closes for now; only "Bỏ qua hướng dẫn" writes the flag
    if (ev.key !== 'Tab' || otherLayerOpen()) return;
    const list = tabRing();
    if (!list.length) { ev.preventDefault(); return; }
    // ALWAYS step round the ring by hand. Letting the browser move on "by itself in the order of the page" was wrong (found in the real app with 25 accounts): the control that follows the last circled
    // one in the page ("Đặt lại tất cả", beside the title of the table) is not in the ring, Tab went there and back to the first control, and never reached the popup.
    ev.preventDefault();
    const at = list.indexOf(doc.activeElement);
    const next = at < 0 ? (ev.shiftKey ? list.length - 1 : 0) : (at + (ev.shiftKey ? -1 : 1) + list.length) % list.length;
    list[next].focus();
  }

  function layout(rect, pending, clip) {
    const view = { width: win.innerWidth, height: win.innerHeight };
    body.style.maxHeight = `${view.height - 2 * EDGE - 32}px`;
    popup.style.width = `${Math.min(POPUP_WIDTH, view.width - 2 * EDGE)}px`;
    popup.style.visibility = pending ? 'hidden' : 'visible';
    const hole = pending ? null : holeOf(rect, view, undefined, clip);
    const size = { width: popup.offsetWidth, height: popup.offsetHeight };
    const at = placePopup(hole, size, view);
    lastFits = at.fits;
    // The dark layer covers the window, or only the scrolling page (the header then stays in the light and clickable) when the circled things live in it: `clip` is given only then, so a hole
    // in the page, AND no hole because the person scrolled the page so far that they are out of view (the review: the header went dark under the popup in the middle). A hole in the header
    // (the last step: #nav-create) has no clip and covers the whole window.
    const inPage = !!clip && (!hole || hole.top >= clip.top - 1);
    boxes.forEach((n, i) => place(n, darkBoxes(pending && !rect ? null : hole, view, inPage ? clip : null)[i]));
    const around = hole ? ringOf(hole, view, undefined, inPage ? clip : null) : null; // outside the hole, on the dark layer (and not over the header): it presses on nothing
    ring.style.display = around ? 'block' : 'none';
    if (around) place(ring, around);
    popup.style.left = `${at.left}px`;
    popup.style.top = `${at.top}px`;
    popup.dataset.side = at.side || 'middle';
    arrow.style.display = at.arrow ? 'block' : 'none';
    if (at.arrow) {
      arrow.dataset.side = at.arrow.side;
      const horizontal = at.arrow.side === 'top' || at.arrow.side === 'bottom';
      Object.assign(arrow.style, { left: horizontal ? `${at.arrow.offset - 7}px` : '', top: horizontal ? '' : `${at.arrow.offset - 7}px` });
    }
  }

  return {
    show({ model, rect = null, clip = null, pending = false, handlers: hs = {}, focus = false, inside = () => [] } = {}) {
      if (!model) return;
      if (!root) build();
      handlers = hs;
      insideNow = inside;
      const first = root.hidden !== false || !keys;
      if (!keys) { before = doc.activeElement; keys = onKey; doc.addEventListener('keydown', keys, true); }
      root.hidden = false;
      const next = JSON.stringify(model);
      const hadFocus = popup.contains(doc.activeElement);
      const id = hadFocus ? doc.activeElement?.dataset?.button : null;
      if (next !== sig) {
        sig = next;
        draw(model);
        if (id) popup.querySelector(`[data-button="${id}"]:not([disabled])`)?.focus(); // the person was on a button of this popup: the new one keeps the focus
      }
      layout(rect, pending, clip);
      // the words may have changed the popup's height after the width was set (a line wraps): measure again once and place it right, so it never sits on the circled box
      const size = `${popup.offsetWidth}x${popup.offsetHeight}`;
      if (size !== measured) { measured = size; layout(rect, pending, clip); }
      // A new step: the focus goes to its main button when that works; when it is off the focus rests on the popup itself, NEVER on the skip link or the cross: Space / Enter there would end the
      // tour for a person who only pressed a key to go on (the review: Enter on "Bỏ qua hướng dẫn" wrote the skip flag).
      if (focus || first) (popup.querySelector('.guide-tour-btn--primary:not([disabled])') || popup).focus();
    },
    hide() {
      if (!root) return;
      root.hidden = true;
      sig = '';
      if (keys) { doc.removeEventListener('keydown', keys, true); keys = null; }
      const back = before;
      before = null;
      if (back && typeof back.focus === 'function' && back.isConnected !== false) back.focus(); // the focus goes back to what had it
    },
    fits: () => lastFits, // the last popup found a side of the hole where it fits whole: when not, the tour scrolls the page so the circled box rises
    isShown: () => !!root && !root.hidden,
    contains: (node) => !!root && !!node && root.contains(node),
  };
}
