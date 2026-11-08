import { VERSION_RE } from './version-label.js';
import { dateLocale, getLang } from './i18n.js';

// "Có gì mới" as plain data, pure (no DOM, no Electron): tests/whats-new.test.js tests it, whats-new-ui.js draws it.
//   parseChangelog   the raw site/changelog.json -> the good entries, newest first (a bad one is dropped, nothing throws)
//   entriesUpTo      the entries the installed app really has (a person on 0.1.7 must not read what 0.1.9 changed)
//   compareVersions / isVersion / formatDate   numeric version order (0.1.10 is after 0.1.9), a version string check, ISO date -> dd/mm/yyyy
//   hasUnseen / shouldAutoOpen   the dot on the version label, and when the panel opens by itself (once, only on the app screen, never over the tour)
//   seenKey / readSeen / writeSeen   the last version this e-mail has seen the panel for, in localStorage (never throws)

export const isVersion = (v) => typeof v === 'string' && VERSION_RE.test(v);

// "1.2.3-beta" -> { nums: [1, 2, 3], pre: 'beta' }; call it only with a value isVersion accepted.
function split(v) {
  const at = v.indexOf('-');
  return { nums: (at < 0 ? v : v.slice(0, at)).split('.').map(Number), pre: at < 0 ? '' : v.slice(at + 1) };
}

// -1 | 0 | 1 like a sort comparator, numeric per part (0.1.10 > 0.1.9; a missing part is 0, so 1.0 = 1.0.0); a pre-release comes before its release.
// NaN when either side is not a version string.
export function compareVersions(a, b) {
  if (!isVersion(a) || !isVersion(b)) return NaN;
  const x = split(a);
  const y = split(b);
  for (let i = 0; i < Math.max(x.nums.length, y.nums.length); i += 1) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0);
    if (d) return Math.sign(d);
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return Math.sign(x.pre.localeCompare(y.pre, 'en', { numeric: true }));
}

// '2026-10-22' -> '22/10/2026' (English: 'Oct 22, 2026'); '' for anything that is not a real calendar day written that way.
export function formatDate(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) return '';
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (!(day.getUTCFullYear() === y && day.getUTCMonth() === mo - 1 && day.getUTCDate() === d)) return '';
  return getLang() === 'en' ? day.toLocaleDateString(dateLocale(), { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : `${m[3]}/${m[2]}/${m[1]}`;
}

// -> [{ version, date, notes: [text] }] newest first. An entry needs a version string, a real ISO date and at least one non-empty text note; a version listed twice keeps its first entry.
export function parseChangelog(raw) {
  if (!Array.isArray(raw)) return [];
  const listed = new Set();
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    if (!isVersion(e.version) || listed.has(e.version) || !formatDate(e.date) || !Array.isArray(e.notes)) continue;
    const notes = e.notes.filter((n) => typeof n === 'string').map((n) => n.trim()).filter(Boolean);
    if (!notes.length) continue;
    listed.add(e.version);
    out.push({ version: e.version, date: e.date, notes });
  }
  return out.sort((a, b) => compareVersions(b.version, a.version));
}

// The entries up to and including the installed version, order kept. An installed value that is not a version gets none.
export function entriesUpTo(entries, installed) {
  if (!Array.isArray(entries) || !isVersion(installed)) return [];
  return entries.filter((e) => compareVersions(e.version, installed) <= 0);
}

// The dot on the version label: a known e-mail whose last seen version is OLDER than the installed one AND the file has something to say in between (an entry newer than
// `seen` and not newer than `installed`). An app newer than the file, or a version with no entry, has nothing to announce yet: no dot, and the caller marks nothing as seen.
// seen = '' (never stored: a brand-new install) is NOT unseen: the caller stores the installed version silently, so nobody gets the whole history thrown at them.
export const hasUnseen = ({ installed, seen, hasEmail, entries } = {}) => !!hasEmail && isVersion(installed) && isVersion(seen) && compareVersions(installed, seen) > 0
  && Array.isArray(entries) && entries.some((e) => compareVersions(e.version, seen) > 0 && compareVersions(e.version, installed) <= 0);

// Does the panel open by itself? The dot rule AND the app screen is on (not the login or the lock screen) AND the beginner tour / its question is not on.
export const shouldAutoOpen = (args = {}) => hasUnseen(args) && args.onAppScreen === true && args.tourOpen !== true;

// ── The last version this e-mail has seen the panel for ──
// Stored as the plain version text under 'fs-whatsnew:<e-mail in lower case>' (the e-mail rule of guide-state.js storeKey). It is a sibling of the guide's flags, not a flag in them:
// those are true / false per tab name and cannot hold a version. Storage can be full, blocked or hold junk: both functions fall back to "nothing seen", none throws.
export function seenKey(email) {
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return mail ? `fs-whatsnew:${mail}` : '';
}

// -> the stored version, or '' (no e-mail, nothing stored, junk, no storage).
export function readSeen(storage, email) {
  const key = seenKey(email);
  if (!key) return '';
  try {
    const value = storage.getItem(key);
    return isVersion(value) ? value : '';
  } catch {
    return '';
  }
}

// -> true when stored; false for no e-mail, a value that is not a version, or a storage that refuses.
export function writeSeen(storage, email, version) {
  const key = seenKey(email);
  if (!key || !isVersion(version)) return false;
  try {
    storage.setItem(key, version);
    return true;
  } catch {
    return false;
  }
}

// English notes: the raw changelog (Vietnamese, the file the owner reviews) with the notes of every version that site/changelog-en.json also has replaced by its English
// ones; a version the English file lacks (or a malformed English entry) keeps its Vietnamese notes, so the panel never loses an entry. Never throws.
export function withEnglishNotes(raw, english) {
  if (!Array.isArray(raw) || !Array.isArray(english)) return raw;
  const notes = new Map();
  for (const e of english) {
    if (!e || typeof e !== 'object' || !isVersion(e.version) || !Array.isArray(e.notes)) continue;
    const list = e.notes.filter((n) => typeof n === 'string' && n.trim());
    if (list.length) notes.set(e.version, list);
  }
  return raw.map((e) => (e && notes.has(e.version) ? { ...e, notes: notes.get(e.version) } : e));
}
