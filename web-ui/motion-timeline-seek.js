import { LABEL_W } from './motion-timeline-lanes.js';

// Click or drag ANYWHERE in the lane area of the timeline (ruler, the four lanes, the gaps) moves the playhead to the time under the pointer and selects the clip that holds that time.
// time = (pointer x - left of the lane content) / pixels a second; the left of the content is read from the scrolled inner node, so scroll and zoom are already in it. Nothing is prevented:
// a click in a line (textarea) still focuses it. A button (retry, tools) and the drag grip of a cut keep their own action. Dragging scrubs, except from a line (there it selects text).
// d = { inner, scroll, pps(), duration(), segments(), selected(), seek(sec), select(i) } -> { timeAt(clientX, strict), destroy() }
const OWN = 'button, .cm-grip';
const left = (n) => n.getBoundingClientRect?.().left ?? 0;

export function attachSeek(d) {
  let scrubbing = false;
  // strict: a pointer over the label column is not on the time axis (null); while scrubbing it is clamped to 0
  const timeAt = (x, strict = false) => {
    if (strict && x - left(d.scroll) < LABEL_W) return null;
    return Math.min(d.duration(), Math.max(0, (x - left(d.inner) - LABEL_W) / d.pps()));
  };
  const go = (x, strict) => {
    const sec = timeAt(x, strict);
    if (sec === null) return;
    d.seek(sec);
    const segs = d.segments();
    const i = segs.findIndex((s) => sec < s.end);
    const k = i < 0 ? segs.length - 1 : i;
    if (k >= 0 && k !== d.selected()) d.select(k);
  };
  const move = (ev) => go(ev.clientX, false);
  const stop = () => { scrubbing = false; document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop); };
  d.inner.addEventListener('pointerdown', (ev) => {
    if ((ev.button ?? 0) !== 0 || ev.target?.closest?.(OWN)) return;
    if (timeAt(ev.clientX, true) === null) return;
    go(ev.clientX, true);
    if (scrubbing || /^textarea$/i.test(String(ev.target?.tagName || ev.target?.tag || ''))) return;
    scrubbing = true;
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', stop);
    document.addEventListener('pointercancel', stop);
  });
  return { timeAt, destroy: stop };
}
