// The sentences the CORE (the app, dola-seedance-client) writes in Vietnamese and hands to the page (a task's note, an account's note, an error of a call, the model
// tooltips of options(), ...). The core is not changed: the page looks each sentence up in site/locales/core/*.js and shows the English one. A sentence that is not in
// the table (the core changed a word, or it is new) stays as the core wrote it, so nothing is lost; tests/core-text.test.js and scripts/sweep-english.mjs tell which are.
//   ct('Không đổi được proxy: Hết giờ')  ->  'Could not change the proxy: Timed out'      (a pattern with {1}, whose live part is itself translated)
// Table keys: the Vietnamese sentence exactly as the core writes it, with every live part (a number, a name, an error text) written {1}, {2}, ... in order of appearance
// (scripts/extract-core-sentences.mjs prints them that way). The English value uses the same {1}, {2}. In Vietnamese nothing changes.
import { getLang } from './i18n-core.js';

const ESC = /[.*+?^$()|[\]\\]/g;
let compiled = null; // the patterns of every key that has a {n}, longest literal text first (the most specific one wins)

const table = (globalThis.__fsCoreEnglish ||= {}); // one table per page, like the page's own (i18n-core.js)

// More English for the core's sentences (the files of site/locales/core/ register themselves through site/locales/core.js).
export function registerCore(more) {
  Object.assign(table, more);
  compiled = null;
}

function compile() {
  const rows = [];
  for (const [key, en] of Object.entries(table)) {
    if (!/\{\d+\}/.test(key)) continue;
    const order = [];
    // A live part may be EMPTY when the sentence has fixed text on its LEFT (the core writes "Acc{1} chưa đồng ý" with {1} = '' or ' ab…yz', "bước {1}{2}" with {2} = '' or ' (host)');
    // the first part of a sentence that starts with a live part must hold something, or an unknown sentence ending in the same words would match.
    const parts = key.split(/(\{\d+\})/);
    const body = parts.map((part, i) => {
      const m = /^\{(\d+)\}$/.exec(part);
      if (!m) return part.replace(ESC, '\\$&');
      order.push(Number(m[1]));
      const fixedBefore = parts.slice(0, i).some((x) => x && !/^\{\d+\}$/.test(x));
      return fixedBefore ? '([\\s\\S]*?)' : '([\\s\\S]+?)';
    }).join('');
    rows.push({ re: new RegExp(`^${body}$`), order, en, weight: key.replace(/\{\d+\}/g, '').length });
  }
  rows.sort((a, b) => b.weight - a.weight);
  return rows;
}

// text -> its English (English page only), else the text. Never throws; a value that is not a string comes back as it is.
export function ct(text, depth = 0) {
  if (typeof text !== 'string' || !text || getLang() !== 'en' || depth > 4) return text;
  if (Object.hasOwn(table, text) && !/\{\d+\}/.test(text)) return table[text]; // a plain sentence (a key with {n} is a pattern, matched below)
  compiled ||= compile();
  for (const row of compiled) {
    const m = row.re.exec(text);
    if (!m) continue;
    const parts = {};
    row.order.forEach((n, i) => { parts[n] = ct(m[i + 1], depth + 1); });
    return row.en.replace(/\{(\d+)\}/g, (all, n) => (Object.hasOwn(parts, n) ? parts[n] : all));
  }
  return text;
}

// A value of the core that may be a sentence (a string) or a structure holding sentences: strings are translated, arrays and plain objects are walked
// (a copy: the core's object is never changed), every other value is returned as it is. `keys` limits which object keys are translated (default: those that carry text).
const TEXT_KEYS = new Set(['note', 'message', 'why', 'reason', 'error', 'label', 'title', 'desc', 'description', 'hint', 'warning', 'text', 'stage', 'name', 'restNote', 'statusText', 'detail', 'help']);
export function ctDeep(value, keys = TEXT_KEYS, depth = 0) {
  if (getLang() !== 'en' || depth > 8) return value;
  if (typeof value === 'string') return ct(value);
  if (Array.isArray(value)) return value.map((v) => ctDeep(v, keys, depth + 1));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = typeof v === 'string' ? (keys.has(k) ? ct(v) : v) : ctDeep(v, keys, depth + 1);
    return out;
  }
  return value;
}

export const coreTable = () => table;
