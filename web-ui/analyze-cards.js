import { parseMentions } from './shared/elements.js';
import { t, tn } from './i18n.js';

// The prompt cards of the "Phân tích video" tab, pure (no DOM): the state of each card, which ones stop the queue, and the list window.dola.queue.add takes.
// RED = the card cannot be queued as it is: a product @tag is missing from its text (read from the text as it is NOW, so typing the tag back clears it),
// or the text is longer than the queue takes. YELLOW = the core's warnings about the answer as AI Studio wrote it (a decimal second, a negative list…);
// they never stop the queue, and they are dropped once the person edits the text (the core cannot check the new text).
export const MAX_PROMPT_CHARS = 200_000; // src/queue-input.js: the queue refuses a longer prompt, and then the whole batch (not a product limit: it only keeps a pasted file from freezing the app)

// prompts: what the core returned [{ title, prompt, tags, problems: [{ code, text, blocking }] }]. First = the id of the first new card.
export function makeCards(prompts, first = 1) {
  return (Array.isArray(prompts) ? prompts : []).map((p, i) => ({
    id: first + i,
    title: String(p?.title ?? '').trim() || `Prompt ${first + i}`,
    text: String(p?.prompt ?? ''),
    ticked: true,
    edited: false,
    warnings: (Array.isArray(p?.problems) ? p.problems : []).filter((x) => x && !x.blocking && typeof x.text === 'string').map((x) => x.text),
  }));
}

// The cards after a new answer: those the person already has stay (with their edits and ticks); the new ones are added at the end.
// A repeated answer of the same call (the cards event, then the final result) gives the same cards: only what is new is added.
export function mergeCards(current, prompts) {
  return current.length >= prompts.length ? current : [...current, ...makeCards(prompts.slice(current.length), (current.at(-1)?.id ?? 0) + 1)];
}

const handleOf = (h) => String(h ?? '').trim().replace(/^@/, '').toLowerCase();

// The product handles the text does not mention, in the order they were picked.
export function missingTags(text, handles) {
  const have = new Set(parseMentions(text).map((m) => m.handle));
  return handles.map(handleOf).filter((h) => h && !have.has(h));
}

// -> [{ code, text }] the reasons this card cannot be queued now. Empty = it can.
export function blockers(card, handles) {
  const out = [];
  const missing = missingTags(card.text, handles);
  if (missing.length) out.push({ code: 'tag_missing', text: t('Thiếu thẻ sản phẩm {tags} trong prompt: gõ lại đúng như vậy.', { tags: missing.map((h) => `@${h}`).join(', ') }) });
  if (!card.text.trim()) out.push({ code: 'empty', text: t('Prompt đang trống.') });
  if (card.text.length > MAX_PROMPT_CHARS) out.push({ code: 'too_long', text: t('Prompt dài {n} ký tự, hàng đợi chỉ nhận tối đa {max}.', { n: card.text.length, max: MAX_PROMPT_CHARS }) });
  return out;
}

export const cardLevel = (card, handles) => (blockers(card, handles).length ? 'red' : card.warnings.length && !card.edited ? 'yellow' : 'ok');

// The state of the queue button: how many cards would go, and whether a ticked card stops it.
export function queueState(cards, handles) {
  const ticked = cards.filter((c) => c.ticked);
  const stuck = ticked.filter((c) => blockers(c, handles).length);
  return { count: ticked.length, stuck: stuck.length, disabled: ticked.length === 0 || stuck.length > 0 };
}

// target: { mode, duration, ratio, model }. The shape is the one the "Tạo video" form sends (queue-ui.js enqueueFromForm): the core finds the @tags
// in each prompt itself and attaches the images of those elements, so no image handle is sent. Veo and Muse take no image.
export function queueTasks(cards, handles, target) {
  const { mode, duration, ratio, model } = target;
  return cards.filter((c) => c.ticked && !blockers(c, handles).length).map((c) => ({
    prompt: c.text.trim(), ratio, duration, model, ...(mode && mode !== 'fast' ? { mode } : {}), ...(mode === 'muse' ? { kind: 'video' } : {}), handles: [],
  }));
}

// One hand-off at a time: while `fn` is in flight a second call (a double click) returns at once with undefined instead of queuing the same prompts twice (every
// video costs). onChange(true) runs when the flight starts and onChange(false) when it ends, however it ends (the button is off meanwhile).
export function singleFlight(fn, onChange = () => {}) {
  let flying = false;
  return async (...args) => {
    if (flying) return undefined;
    flying = true;
    onChange(true);
    try { return await fn(...args); } finally { flying = false; onChange(false); }
  };
}

// After the queue took them: the cards that went are unticked and marked, so a second press cannot queue the same prompts again (every video costs).
export const markQueued = (cards, ids) => cards.map((c) => (ids.has(c.id) ? { ...c, ticked: false, queued: true } : c));

// The one line under the results: what the model saw in the reference video.
export function summaryLine(summary) {
  if (!summary) return '';
  const part = (label, value) => (value ? `${label}: ${value}` : '');
  const text = Array.isArray(summary.onscreen_text) ? summary.onscreen_text.filter(Boolean).join(' / ') : '';
  const none = (v) => (!v || /^none$/i.test(String(v).trim()) ? '' : String(v));
  return [
    Number.isFinite(summary.beats) ? tn(summary.beats, '{n} cảnh', '{n} scene', '{n} scenes') : '',
    part(t('Thoại'), none(summary.dialogue)),
    part(t('Nhạc'), none(summary.music)),
    part(t('Chữ trên màn hình'), text),
  ].filter(Boolean).join(' · ');
}
