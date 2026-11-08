import { clock, decimal } from './motion-form.js';
import { moveCut } from './motion-timeline-model.js';
import { t } from './i18n.js';

// Dragging one cut grip (the invisible handle on a boundary, .cm-grip) of the timeline (pointer events; the grip holds the pointer capture, so move and up come to it even outside the strip).
// The position is the start of the mark plus how far the pointer went (no layout reads): it snaps to a pause / camera change within 0.25 s and stays where both pieces next to it are 4..10.5 s.
// d = { state, pps(), editable(), tick (the small label node), onDrop(cuts | null) } ; onDrop(null) = nothing changed, repaint.
export function attachDrag(mark, k, d) {
  let drag = null;
  const hideTick = () => { d.tick.hidden = true; mark.classList.remove('cm-grip--drag'); };
  mark.addEventListener('pointerdown', (ev) => {
    if (!d.editable()) return;
    ev.preventDefault?.();
    mark.setPointerCapture?.(ev.pointerId);
    const cuts = d.state.cuts();
    drag = { x0: ev.clientX, cuts, from: cuts[k], result: null };
    mark.classList.add('cm-grip--drag');
  });
  mark.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const r = moveCut(drag.cuts, k, drag.from + (ev.clientX - drag.x0) / d.pps(), d.state.snaps, d.state.duration);
    if (!r) return;
    drag.result = r;
    mark.style.left = `${r.at * d.pps()}px`;
    const before = k > 0 ? drag.cuts[k - 1] : 0;
    const after = k < drag.cuts.length - 1 ? drag.cuts[k + 1] : d.state.duration;
    const kind = r.snap ? (r.snap.kind === 'scene' ? t('đổi góc máy') : t('ngừng nói')) : '';
    d.tick.hidden = false;
    d.tick.className = `cm-snap${r.snap ? ' cm-snap--on' : ''}`;
    d.tick.style.left = `${r.at * d.pps()}px`;
    d.tick.textContent = [kind, clock(r.at), t('{a} + {b} giây', { a: decimal(r.at - before), b: decimal(after - r.at) })].filter(Boolean).join(' · ');
  });
  const finish = (ev, cancelled) => {
    if (!drag) return;
    const { result, from } = drag;
    drag = null;
    mark.releasePointerCapture?.(ev?.pointerId);
    hideTick();
    d.onDrop(!cancelled && result && Math.abs(result.at - from) > 0.005 ? result.cuts : null);
  };
  mark.addEventListener('pointerup', (ev) => finish(ev, false));
  mark.addEventListener('pointercancel', (ev) => finish(ev, true));
}
