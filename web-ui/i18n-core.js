// The language of the page (plans/261029-0812-md-motion-english). The KEY of a translation IS the Vietnamese sentence:
// t('Đăng xuất') gives it back unchanged in Vietnamese, and looks it up in site/locales/en.js in English (a key that is missing there
// stays Vietnamese; tests/i18n-keys.test.js makes sure none is). Placeholders: t('{n} lệnh', { n }). The first argument of t() and
// the texts of tn() must be plain string literals (no concatenation, no `${}`): that test reads the source for it.
// The language is decided ONCE, when this module loads: the stored choice ('fs-lang'), else the browser's own language (English gives
// English), else Vietnamese. Anything that is not a real browser page (Node, the tests) is Vietnamese: Node 21+ has a navigator.language
// of its own ("en-US") and must not flip the tests to English. A change of language is "store it, reload the page" (chooseLang).
// The English table of the page is registered by site/i18n.js (the page) or studio/src/i18n.js (the Studio bundle): this core holds none.
// ONE table per page, kept on globalThis: the studio bundle (studio.js) carries its own copy of this file, and the page registers the studio's English before it
// imports that bundle, so both copies must read the same table.
const en = (globalThis.__fsEnglish ||= {});

const KEY = 'fs-lang';
const TEXT_NODE = 3;
const isLang = (v) => v === 'vi' || v === 'en';

// A real browser page (Chromium, Electron, Firefox, Safari all say "Mozilla/5.0 ..."). Node 21+ has a navigator of its own ("Node.js/26",
// language "en-US") and the tests install a fake document under it: neither may flip the tests to English.
const isBrowser = (g) => !!g.document && !!g.navigator && /^Mozilla\//.test(String(g.navigator.userAgent));

// { stored, nav } -> 'vi' | 'en': the stored choice wins, then a browser language that starts with "en", else Vietnamese.
export function detectLang({ stored = '', nav = '' } = {}) {
  if (isLang(stored)) return stored;
  return /^en([-_]|$)/i.test(String(nav)) ? 'en' : 'vi';
}

// The language of the page it runs in: g = the globals (document, navigator, localStorage). Anything that is not a browser page is Vietnamese.
export function langFromEnv(g = globalThis) {
  if (!isBrowser(g)) return 'vi';
  let stored = '';
  try { stored = g.localStorage?.getItem(KEY) || ''; } catch { /* private mode: no stored choice */ }
  return detectLang({ stored, nav: g.navigator.language });
}

let lang = langFromEnv();

export const getLang = () => lang;

// Adds English to the table (the page registers site/locales/en.js, the Bàn sáng tạo bundle its own studio/src/locales/en.js: two builds, two tables).
export const registerStrings = (table) => { Object.assign(en, table); };

// Sets the language in memory only (the tests). The module-level texts of the modules already loaded keep the language they were built in.
export function useLang(next) {
  if (!isLang(next)) throw new RangeError(`i18n: unknown language "${next}"`);
  lang = next;
}

// The VI / EN button: stores the choice and reloads the page (the queue lives in the core and the studio saves itself, so nothing is lost).
// -> true when the choice was stored and the reload asked for.
export function chooseLang(next) {
  if (!isLang(next)) return false;
  try {
    if (typeof localStorage === 'undefined') return false;
    localStorage.setItem(KEY, next);
  } catch (err) {
    console.error('i18n: the language could not be stored', err);
    return false;
  }
  try {
    if (typeof location === 'undefined') return false;
    location.reload();
    return true;
  } catch (err) {
    console.error('i18n: the page could not reload', err);
    return false;
  }
}

const fill = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (all, name) => (Object.hasOwn(params, name) ? String(params[name]) : all)) : text);

export function t(key, params) {
  const text = String(key);
  return fill(lang === 'en' && Object.hasOwn(en, text) ? en[text] : text, params);
}

// A Vietnamese text that already EXISTS as a value (a label from a table, a sentence a site/shared/ module returns, one of the core): looked up
// the same way, but the argument is not a literal, so the keys it can meet must be listed in `export const dynamic = [...]` of the area's
// site/locales/en-<area>.js (tests/i18n-keys.test.js checks that every listed key has its English). Anything unknown stays as it came.
export const tx = (value, params) => (typeof value === 'string' ? t(value, params) : value);

// A counted sentence: tn(n, 'Đợi {n} giây', 'Wait {n} second', 'Wait {n} seconds'). Vietnamese has one form (the first, written as it was);
// English takes the singular for exactly 1. {n} is filled in all of them.
export function tn(n, vi, enOne, enMany) {
  return fill(lang === 'en' ? (n === 1 ? enOne : enMany) : vi, { n });
}

export const dateLocale = () => (lang === 'en' ? 'en-US' : 'vi-VN');

// Static markup: data-i18n translates every DIRECT text node of the element (keeping the spaces around it, so "Setup <span>0</span>" works);
// data-i18n-attr="title,aria-label" translates those attributes (the current value is the key). Also <html lang> and <title>.
// Vietnamese is the markup as written: nothing but the lang attribute is touched.
function translateText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType !== TEXT_NODE) continue;
    const [, before, key, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(node.nodeValue);
    if (!key) continue;
    const text = t(key);
    if (text !== key) node.nodeValue = before + text + after;
  }
}

function translateAttrs(el) {
  for (const name of el.getAttribute('data-i18n-attr').split(',').map((s) => s.trim()).filter(Boolean)) {
    const value = el.getAttribute(name);
    if (!value || !value.trim()) continue;
    const text = t(value);
    if (text !== value) el.setAttribute(name, text);
  }
}

export function applyStatic(root = typeof document === 'undefined' ? null : document) {
  if (!root) return;
  if (root.documentElement) { // a whole document (not a part of one)
    root.documentElement.lang = lang;
    if (lang === 'en' && typeof root.title === 'string' && root.title) root.title = t(root.title);
  }
  if (lang !== 'en' || typeof root.querySelectorAll !== 'function') return;
  const marked = [...root.querySelectorAll('[data-i18n], [data-i18n-attr]')];
  if (root.nodeType === 1) marked.unshift(root); // a part: its own markers count too
  for (const el of marked) {
    if (el.hasAttribute('data-i18n')) translateText(el);
    if (el.hasAttribute('data-i18n-attr')) translateAttrs(el);
  }
}

// What app.js calls first: the static page in the page's language. -> 'vi' | 'en'
export function initLang() {
  applyStatic();
  return lang;
}
