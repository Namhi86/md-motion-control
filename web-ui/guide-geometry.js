// The geometry of the tour, PURE (no DOM; tests/guide-geometry.test.js): where the bright hole is, where the popup goes, where its arrow points.
// Rectangles are { left, top, width, height } in the pixels of the window (what getBoundingClientRect gives); the view is { width, height }.

export const PAD = 2; // the hole is a little bigger than the circled controls (2 px each side)
export const RING = 4; // the lime ring is drawn OUTSIDE the hole, this far from each edge of it: on the dark layer, so it never presses on a button or a line of words (a hole of 2 px of air
//                        with the ring on its very edge looked glued to the controls: the review of 2026-10-21: ring and button 2 px apart)
export const GAP = 14 + RING; // between the hole and the popup: the room of the arrow, and the ring that lies in it
export const EDGE = 12; // the popup never comes nearer than this to the border of the window

const ok = (n) => Number.isFinite(n);
const usable = (r) => !!r && ok(r.left) && ok(r.top) && ok(r.width) && ok(r.height) && r.width > 0 && r.height > 0;

// The box around several rectangles (the elements of one step), or null when none is usable.
export function union(rects) {
  const list = (Array.isArray(rects) ? rects : []).filter(usable);
  if (!list.length) return null;
  const left = Math.min(...list.map((r) => r.left));
  const top = Math.min(...list.map((r) => r.top));
  const right = Math.max(...list.map((r) => r.left + r.width));
  const bottom = Math.max(...list.map((r) => r.top + r.height));
  return { left, top, width: right - left, height: bottom - top };
}

// The hole: the rectangle grown by PAD and cut to `clip`, the part of the window the circled controls really live in (the box of the scrolling page, below the page header), not the whole
// window: a table taller than the page is circled as far as the page shows it, and the hole never runs over the header (the review: the hole began at top 0, over the header, which
// then had a dark layer on it). `clip` defaults to the window. null when there is nothing to circle.
export function holeOf(rect, view, pad = PAD, clip = null) {
  const area = clip ?? { left: 0, top: 0, width: view?.width, height: view?.height };
  if (!usable(rect) || !usable(area)) return null;
  const left = Math.max(area.left, rect.left - pad);
  const top = Math.max(area.top, rect.top - pad);
  const right = Math.min(area.left + area.width, rect.left + rect.width + pad);
  const bottom = Math.min(area.top + area.height, rect.top + rect.height + pad);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

// The ring: the hole grown by RING on every side (it lies on the dark layer around the hole). It is cut to `area`, the box the dark layer covers (the scrolling page below the header while the
// hole is in it, else the window): a hole that the page edge cut (a table running under the header) must not get a ring that sticks 4 px over the header (found by the e2e: ring at 52, header
// ends at 56).
export function ringOf(hole, view, ring = RING, area = null) {
  if (!usable(hole)) return null;
  const a = area ?? { left: 0, top: 0, width: view.width, height: view.height };
  const left = Math.max(a.left, hole.left - ring);
  const top = Math.max(a.top, hole.top - ring);
  const right = Math.min(a.left + a.width, hole.left + hole.width + ring);
  const bottom = Math.min(a.top + a.height, hole.top + hole.height + ring);
  return right > left && bottom > top ? { left, top, width: right - left, height: bottom - top } : null;
}

// The four dark boxes around a hole: top, bottom, left, right (always four, a box may be 0 x 0). Together they cover `area` (the window by default) except the hole. No hole = the first one
// covers it all. `area` is the scrolling page below the header while the hole is in it: the dark layer then stops at the header, which stays in the light and CLICKABLE (the review: "Đăng xuất"
// and the "Hướng dẫn" button were under a 78% dark layer that also swallowed their clicks).
export function darkBoxes(hole, view, area = null) {
  const zero = { left: 0, top: 0, width: 0, height: 0 };
  const a = area ?? { left: 0, top: 0, width: view.width, height: view.height };
  if (!hole) return [{ ...a }, zero, zero, zero];
  const right = hole.left + hole.width;
  const bottom = hole.top + hole.height;
  const aRight = a.left + a.width;
  const aBottom = a.top + a.height;
  return [
    { left: a.left, top: a.top, width: a.width, height: Math.max(0, hole.top - a.top) },
    { left: a.left, top: bottom, width: a.width, height: Math.max(0, aBottom - bottom) },
    { left: a.left, top: hole.top, width: Math.max(0, hole.left - a.left), height: hole.height },
    { left: right, top: hole.top, width: Math.max(0, aRight - right), height: hole.height },
  ];
}

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), Math.max(lo, hi));
const SIDES = ['bottom', 'top', 'right', 'left'];

// The room each side of the hole leaves for a popup of `size`.
const room = (hole, size, view) => ({
  bottom: view.height - (hole.top + hole.height) - GAP - EDGE,
  top: hole.top - GAP - EDGE,
  right: view.width - (hole.left + hole.width) - GAP - EDGE,
  left: hole.left - GAP - EDGE,
}[size]);

// Where the popup goes: { side, left, top, arrow, width, height, fits } or the middle of the window when there is no hole (side null, fits true).
//   side   which side of the hole it sits on ('bottom' = under it): the first of bottom, top, right, left where the WHOLE popup fits; when none fits (fits false), the side with the most room
//   arrow  { side, offset }: the arrow sits on the popup edge facing the hole, `offset` px from the popup's left (top / bottom) or top (left / right), over the hole's middle
// The popup is moved along its side to stay inside the window (EDGE from the border), and it never covers the hole: that is the whole point of choosing a side.
export function placePopup(hole, size, view) {
  const w = Math.min(size.width, view.width - 2 * EDGE);
  const h = Math.min(size.height, view.height - 2 * EDGE);
  if (!hole) return { side: null, left: Math.round((view.width - w) / 2), top: Math.round((view.height - h) / 2), arrow: null, width: w, height: h, fits: true };
  const need = { bottom: h, top: h, right: w, left: w };
  const fits = SIDES.filter((s) => room(hole, s, view) >= need[s]);
  const bySpace = [...SIDES].sort((a, b) => (room(hole, b, view) - need[b]) - (room(hole, a, view) - need[a]));
  const side = fits[0] ?? bySpace[0];
  const midX = hole.left + hole.width / 2;
  const midY = hole.top + hole.height / 2;
  let left;
  let top;
  if (side === 'bottom' || side === 'top') {
    left = clamp(midX - w / 2, EDGE, view.width - w - EDGE);
    top = side === 'bottom' ? hole.top + hole.height + GAP : hole.top - GAP - h;
  } else {
    top = clamp(midY - h / 2, EDGE, view.height - h - EDGE);
    left = side === 'right' ? hole.left + hole.width + GAP : hole.left - GAP - w;
  }
  top = clamp(top, EDGE, view.height - h - EDGE);
  left = clamp(left, EDGE, view.width - w - EDGE);
  const horizontal = side === 'bottom' || side === 'top';
  const along = horizontal ? midX - left : midY - top;
  const arrow = { side: { bottom: 'top', top: 'bottom', right: 'left', left: 'right' }[side], offset: Math.round(clamp(along, 18, (horizontal ? w : h) - 18)) };
  return { side, left: Math.round(left), top: Math.round(top), arrow, width: w, height: h, fits: fits.length > 0 };
}

// Do two rectangles overlap (touching edges do not count)?
export const overlaps = (a, b) => !!a && !!b && a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

// Is the rectangle wholly inside the window?
export const inside = (r, view) => !!r && r.left >= 0 && r.top >= 0 && r.left + r.width <= view.width && r.top + r.height <= view.height;
