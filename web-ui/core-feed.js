// The gates where the core's data enters the page, so its Vietnamese sentences are shown in the page's language (site/core-text.js has the table and the matcher).
// The page reads window.dola in dozens of places and the bridge cannot be wrapped (window.dola is frozen), so the translation is done where the DATA arrives:
//   tasksFeed(list)      the queue's tasks (queue.list / queue.onChange)       -> a copy; translates task.stage, task.error.note, task.result.note
//   accountsFeed(list)   the accounts (accounts.list / accounts.onChange)       -> a copy; translates account.note
//   optionsFeed(opts)    window.dola.options()                                   -> a copy; translates the label and the desc of every model (and of the Veo / Muse / image lists)
//   noteOf(res, fallback) the sentence of a failed call ({ ok: false, note })    -> the translated note, else the fallback
// A field the PERSON wrote is never touched (a task's prompt, an account's label, a board's name): the keys are named one by one, nothing is "every string".
// In Vietnamese every function returns its argument as it is (same object, no copy). Never throws.
import { getLang } from './i18n-core.js';
import { ct } from './core-text.js';
import './locales/core.js'; // the English table of the core's sentences: whoever uses a gate has it (not every page starts from app.js)

const english = () => getLang() === 'en';
const tr = (v) => (typeof v === 'string' ? ct(v) : v);
const withKeys = (obj, keys) => {
  if (!obj || typeof obj !== 'object') return obj;
  let out = obj;
  for (const k of keys) {
    if (typeof obj[k] !== 'string') continue;
    const en = ct(obj[k]);
    if (en !== obj[k]) { if (out === obj) out = { ...obj }; out[k] = en; }
  }
  return out;
};

export function taskFeed(task) {
  if (!english() || !task || typeof task !== 'object') return task;
  let out = withKeys(task, ['stage', 'note']);
  for (const key of ['error', 'result']) {
    const part = withKeys(task[key], ['note']);
    if (part !== task[key]) { if (out === task) out = { ...task }; out[key] = part; }
  }
  return out;
}
export const tasksFeed = (list) => (english() && Array.isArray(list) ? list.map(taskFeed) : list);

export const accountFeed = (acc) => (english() ? withKeys(acc, ['note']) : acc);
export const accountsFeed = (list) => (english() && Array.isArray(list) ? list.map(accountFeed) : list);

// options(): the model lists of every mode hold { id, label, desc }; their texts come from the core. Walk only arrays of such entries.
const MODEL_KEYS = ['label', 'desc'];
function modelList(list) {
  if (!Array.isArray(list)) return list;
  let changed = false;
  const out = list.map((m) => { const n = withKeys(m, MODEL_KEYS); if (n !== m) changed = true; return n; });
  return changed ? out : list;
}
export function optionsFeed(opts) {
  if (!english() || !opts || typeof opts !== 'object') return opts;
  let out = opts;
  const put = (path, value) => {
    if (out === opts) out = { ...opts };
    let at = out;
    for (let i = 0; i < path.length - 1; i += 1) { at[path[i]] = { ...at[path[i]] }; at = at[path[i]]; }
    at[path[path.length - 1]] = value;
  };
  for (const key of ['models', 'modes']) { const v = modelList(opts[key]); if (v !== opts[key]) put([key], v); }
  for (const side of ['veo', 'muse', 'image', 'nano']) {
    const v = modelList(opts[side]?.models);
    if (v !== opts[side]?.models) put([side, 'models'], v);
  }
  return out;
}

// The sentence of a failed call: `res.note` translated, else `fallback` (already in the page's language by its own t()).
export const noteOf = (res, fallback = '') => (typeof res?.note === 'string' && res.note ? tr(res.note) : fallback);
