// The Motion control timeline, the part with no DOM: cut marks (seconds), the limits of a clip, snapping, split / merge, shots and the undo history.
// Same limits as the core (src/motion-plan.js): a clip is 4..10.5 s. Everything here is pure, so tests/motion-timeline-model.test.js needs no browser.
export const MIN_PIECE = 4;
export const MAX_PIECE = 10.5;
export const SNAP_WINDOW = 0.25; // a mark within this many seconds of a pause or a camera change jumps onto it
export const SAME_RANGE = 0.05; // two ranges whose ends differ by less than this are the same clip (as the core's replan matches lines)

const round2 = (n) => Math.round(n * 100) / 100;
const roundUp2 = (n) => Math.ceil(n * 100 - 1e-6) / 100;
const roundDown2 = (n) => Math.floor(n * 100 + 1e-6) / 100;

// segments (contiguous, from 0 to the end) -> the internal marks
export const cutsOf = (segments) => segments.slice(0, -1).map((s) => s.end);

// marks -> [{ start, end }] of every piece, from 0 to duration
export function rangesOf(cuts, duration) {
  const edges = [0, ...cuts, duration];
  return edges.slice(1).map((end, i) => ({ start: edges[i], end }));
}

export const sameRange = (a, b) => Math.abs(a.start - b.start) < SAME_RANGE && Math.abs(a.end - b.end) < SAME_RANGE;

// The shots: a clip starts a new shot when the clip before it ended on a camera change (cutAt 'scene'), as src/motion-chains.js does.
// -> [{ n, first, last }] (clip indexes, n counted from 1); clips of one shot run one after another at Flow
export function shotsOf(segments) {
  const shots = [];
  segments.forEach((s, i) => {
    if (i === 0 || segments[i - 1].cutAt === 'scene') shots.push({ n: shots.length + 1, first: i, last: i });
    else shots.at(-1).last = i;
  });
  return shots;
}

// The room mark k has to move in: both pieces beside it stay 4..10.5 s. -> { lo, hi } (lo > hi: no room)
export function dragBounds(cuts, k, duration) {
  const prev = k > 0 ? cuts[k - 1] : 0;
  const next = k < cuts.length - 1 ? cuts[k + 1] : duration;
  return { lo: roundUp2(Math.max(prev + MIN_PIECE, next - MAX_PIECE)), hi: roundDown2(Math.min(prev + MAX_PIECE, next - MIN_PIECE)) };
}

// The nearest pause / camera change within SNAP_WINDOW of `at` that is inside [lo, hi]. snaps = { pauses: [s], scenes: [s] } -> { at, kind: 'pause' | 'scene' } | null
export function snapPoint(at, snaps, lo, hi) {
  let best = null;
  for (const [kind, list] of [['pause', snaps?.pauses], ['scene', snaps?.scenes]]) {
    for (const p of Array.isArray(list) ? list : []) {
      const d = Math.abs(p - at);
      if (Number.isFinite(p) && p >= lo && p <= hi && d <= SNAP_WINDOW && (!best || d < best.d)) best = { at: p, kind, d };
    }
  }
  return best && { at: best.at, kind: best.kind };
}

// Mark k dragged to `raw` seconds -> { cuts, at, snap } with the mark snapped and clamped, or null when there is no room to move
export function moveCut(cuts, k, raw, snaps, duration) {
  const { lo, hi } = dragBounds(cuts, k, duration);
  if (!(lo <= hi) || !Number.isFinite(raw)) return null;
  const clamp = (v) => Math.min(hi, Math.max(lo, v));
  const snap = snapPoint(raw, snaps, lo, hi);
  const at = snap ? snap.at : clamp(round2(raw));
  const next = cuts.slice();
  next[k] = at;
  return { cuts: next, at, snap };
}

// Split the piece that holds `at` into two (both halves >= 4 s) -> the new marks | null
export function splitCuts(cuts, raw, duration) {
  const at = round2(raw);
  const r = rangesOf(cuts, duration).find((x) => at > x.start && at < x.end);
  if (!r || at - r.start < MIN_PIECE - 1e-6 || r.end - at < MIN_PIECE - 1e-6) return null;
  return [...cuts, at].sort((a, b) => a - b);
}

// Join clip i with the clip after it (drops mark i) when the joined piece is <= 10.5 s -> the new marks | null
export function mergeCuts(cuts, i, duration) {
  if (!(i >= 0 && i < cuts.length)) return null;
  const r = rangesOf(cuts, duration);
  if (r[i + 1].end - r[i].start > MAX_PIECE + 1e-6) return null;
  return cuts.filter((_, k) => k !== i);
}

// The history of the cut list for undo / redo: `now` is the list on the timeline; commit() after an edit, step() after an undo / redo went through
export function createHistory(initial, limit = 100) {
  const past = [];
  let future = [];
  let now = initial;
  return {
    now: () => now,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    peek: (dir) => (dir === 'undo' ? past.at(-1) : future.at(-1)),
    commit(cuts) { past.push(now); if (past.length > limit) past.shift(); future = []; now = cuts; },
    step(dir) { if (dir === 'undo' && past.length) { future.push(now); now = past.pop(); } else if (dir === 'redo' && future.length) { past.push(now); now = future.pop(); } },
  };
}
