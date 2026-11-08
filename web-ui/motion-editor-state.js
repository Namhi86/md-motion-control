import { ct } from './core-text.js';
import { createHistory, cutsOf, rangesOf, sameRange } from './motion-timeline-model.js';

// The data of the Motion control editor (steps 2 and 3), with no DOM: the clips, the line of each, the history of the cut list and the call to motion.replan.
// The person's own words are kept in `memory` by time range: a clip that comes back after an undo, or that a replan did not touch, gets its edited line again and is never transcribed again.
// replan = (args) => Promise (window.dola.motion.replan) | null when this core cannot re-cut (then the marks stay display-only).
// -> { segments(), texts(), pending(), cuts(), canReplan, busy(), setText(i, v), lines(), apply(cuts, mode), canUndo(), canRedo(), undo(), redo() }
//    draftLines() -> [{ start, end, text, translated }] of every clip as the box holds it now (what motion.saveDraft keeps); onEdit() runs when the person types in a box.
//    apply(nextCuts, mode = 'commit' | 'undo' | 'redo') -> { ok, message? (the core's sentence, in the page's language), reason?, transcriptError? }; onChange() runs at every step (the screen repaints from the getters).
export function createPlanState({ plan, replan = null, onChange = () => {}, onEdit = () => {} }) {
  const duration = plan.duration;
  const said = (s) => String(s.translated || s.text || '');
  let segs = plan.segments;
  let texts = segs.map(said);
  let pending = new Set();
  let busy = false;
  const history = createHistory(cutsOf(segs));
  const memory = []; // { start, end, original, translated, box }: what each range said and what the person has in the box
  const lookup = (r) => memory.find((m) => sameRange(m, r));
  const remember = (s, box) => {
    const entry = { start: s.start, end: s.end, original: String(s.text || ''), translated: String(s.translated || ''), box };
    const at = memory.findIndex((m) => sameRange(m, s));
    if (at >= 0) memory[at] = entry; else memory.push(entry);
  };
  segs.forEach((s, i) => remember(s, texts[i]));

  // the line as the core wants it: a clip that has a translation keeps its original and the box is the translation
  const lineOf = (r, m) => (m.translated ? { start: r.start, end: r.end, text: m.original, translated: m.box } : { start: r.start, end: r.end, text: m.box, translated: '' });

  // what the timeline shows while the core works: the pieces of the new cuts, the known ones with their lines, the new ones empty and marked "pending"
  function provisional(next) {
    const keep = [];
    const out = rangesOf(next, duration).map((r, i) => {
      const m = lookup(r);
      const old = segs.find((s) => sameRange(s, r));
      keep.push(m ? m.box : '');
      return { ...(old || { step: r.end - r.start, cutAt: 'pause', has_speech: false, text: '', translated: '' }), i, start: r.start, end: r.end, seconds: r.end - r.start, isNew: !m };
    });
    return { segs: out, texts: keep, pending: new Set(out.flatMap((s, i) => (s.isNew ? [i] : []))) };
  }

  async function apply(next, mode = 'commit') {
    if (busy || !replan) return { ok: false, reason: 'busy', message: '' };
    const before = { segs, texts, pending };
    const prov = provisional(next);
    const lines = rangesOf(next, duration).flatMap((r) => { const m = lookup(r); return m ? [lineOf(r, m)] : []; });
    ({ segs, texts, pending } = { segs: prov.segs, texts: prov.texts, pending: prov.pending });
    busy = true; onChange();
    let r;
    try { r = await replan({ prepareId: plan.prepareId, cuts: next, lines }); } catch (err) { r = { ok: false, reason: 'failed', note: err?.message || '' }; }
    busy = false;
    if (!r?.ok || !Array.isArray(r.segments)) {
      ({ segs, texts, pending } = before); onChange();
      return { ok: false, reason: r?.reason || 'failed', message: ct(r?.note) || '' };
    }
    segs = r.segments;
    texts = segs.map((s) => lookup(s)?.box ?? said(s));
    pending = new Set();
    segs.forEach((s, i) => remember(s, texts[i]));
    if (mode === 'commit') history.commit(next); else history.step(mode);
    onChange();
    return { ok: true, transcriptError: r.transcriptError };
  }

  return {
    segments: () => segs,
    texts: () => texts,
    pending: () => pending,
    cuts: () => cutsOf(segs),
    duration,
    snaps: plan.snaps || { pauses: [], scenes: [] },
    canReplan: !!replan,
    busy: () => busy,
    // what motion.start receives: the text of every clip as it is in its box now (an empty box = a clip that only moves)
    lines: () => texts.map((text, i) => ({ i, text: text.replace(/\s+/g, ' ').trim() })),
    setText(i, v) { if (i >= 0 && i < segs.length && !pending.has(i)) { texts[i] = v; remember(segs[i], v); onEdit(); } },
    draftLines: () => segs.map((s, i) => lineOf(s, { original: String(s.text || ''), translated: String(s.translated || ''), box: texts[i] })),
    apply,
    canUndo: () => !busy && !!replan && history.canUndo(),
    canRedo: () => !busy && !!replan && history.canRedo(),
    undo: () => (history.canUndo() ? apply(history.peek('undo'), 'undo') : Promise.resolve({ ok: false })),
    redo: () => (history.canRedo() ? apply(history.peek('redo'), 'redo') : Promise.resolve({ ok: false })),
  };
}
