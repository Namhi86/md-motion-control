import { ct } from './core-text.js';
import { isHandle } from './shared/media-handles.js';

// The Motion control work that the core keeps across a page reload and an app restart (window.dola.motion.session / saveDraft): reading it back, and saving the person's edits as a draft.
// Nothing here touches the page except the two "leaving" events; every call is wrapped, because a draft is a convenience and must never break the tab.

// motion.session() -> null (nothing to restore, an older core, a locked gate, a failed call)
//   | { dropped: the core's sentence in the page's language, or '' } (the saved plan was of a video that changed or is gone: the core says so once)
//   | { plan, video: { handle, name, bytes }, images: [{ handle, name }], choices, selected } (plan = the core's answer, in the shape of a motion.prepare answer)
export async function loadSession(dola) {
  if (typeof dola.motion.session !== 'function') return null;
  let r;
  try { r = await dola.motion.session(); } catch { return null; }
  if (!r || typeof r !== 'object') return null;
  if (r.ok === false) return r.dropped ? { dropped: ct(r.note) || '' } : null;
  if (r.ok !== true || !r.prepareId || !Array.isArray(r.segments) || !r.segments.length || !isHandle(r.video?.handle)) return null;
  const images = (Array.isArray(r.images) ? r.images : []).filter((x) => isHandle(x?.handle)).map((x) => ({ handle: x.handle, name: String(x.name || '') }));
  return {
    plan: r,
    video: { handle: r.video.handle, name: String(r.video.name || ''), bytes: r.video.bytes },
    images,
    choices: r.choices || {},
    selected: Number.isInteger(r.selected) && r.selected >= 0 && r.selected < r.segments.length ? r.selected : -1,
  };
}

// The draft saver: schedule() waits `delay` ms of quiet and then sends build() to motion.saveDraft; flush() sends at once when something is waiting (before the film starts, when the page is left).
// build() -> the saveDraft argument, or null while there is no plan to save for.
export function createDraftSaver({ dola, build, delay = 600 }) {
  let timer = null;
  const cancel = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
  async function send() {
    try {
      const draft = build();
      if (draft && typeof dola.motion.saveDraft === 'function') await dola.motion.saveDraft(draft);
    } catch { /* a draft is a convenience: the next edit tries again */ }
  }
  const flush = async () => { if (timer === null) return; cancel(); await send(); };
  const schedule = () => { cancel(); timer = setTimeout(() => { timer = null; send(); }, delay); };
  // best effort: the window is closing or hidden
  const watchPage = () => {
    document.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
    globalThis.addEventListener?.('pagehide', () => { flush(); });
  };
  return { schedule, flush, cancel, watchPage };
}

// What motion.saveDraft keeps: the lines of ALL clips (not while a replan runs: those are provisional), the sidebar choices, the pictures and the selected clip.
export function draftOf({ prepareId, s, editorUi }) {
  const d = { prepareId, choices: { engine: s.engine, flowModel: s.flowModel, audioMode: s.audioMode, resolution: s.resolution, ratio: s.ratio, language: s.translateTo, voiceText: s.voiceText }, imageHandles: s.images.map((i) => i.handle) };
  if (!editorUi.busy()) d.lines = editorUi.draftLines();
  const at = editorUi.timeline.selected();
  if (at >= 0) d.selected = at;
  return d;
}
