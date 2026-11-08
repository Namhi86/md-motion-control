import { t } from './i18n.js';
import { norm } from './elements-pool.js';
import { needsLogin } from './setup-muse.js';
import { effectiveStatus } from './ui-text.js';

// The status chips and the search box of a platform page of the Setup screen. Pure (no DOM, no Electron): setup-filter-ui.js draws,
// tests/setup-filter-model.test.js tests. Nothing here invents a status: a row's group is worked out from effectiveStatus (ui-text.js).

// [id, chip text]. "Tất cả" shows every row; the other four are the groups below.
export const FILTERS = [['all', t('Tất cả')], ['ready', t('Sẵn sàng')], ['limit', t('Hết lượt')], ['off', t('Đã tắt')], ['error', t('Lỗi')]];
export const FILTER_IDS = FILTERS.map(([id]) => id);

// The group of an account:
//   off    switched off by the person (whatever its stored status is)
//   error  dead (cookie, captcha, lost session...) or a Muse account that must log in again
//   limit  out of turns today ('limit') or used up ('used')
//   ready  usable now
//   other  resting or logging in: shown under "Tất cả" only
export function groupOf(acc, now = Date.now()) {
  const st = effectiveStatus(acc, now);
  if (st === 'off') return 'off';
  if (st === 'dead' || needsLogin(acc, now)) return 'error';
  if (st === 'limit' || st === 'used') return 'limit';
  return st === 'ready' ? 'ready' : 'other';
}

// { all, ready, limit, off, error }: the numbers on the chips (of the whole list of the platform, whatever the search says).
export function groupCounts(list, now = Date.now()) {
  const counts = { all: list.length, ready: 0, limit: 0, off: 0, error: 0 };
  for (const a of list) {
    const g = groupOf(a, now);
    if (g !== 'other') counts[g] += 1;
  }
  return counts;
}

// A red dot on the platform's row of the sidebar: some switched-on account needs the person.
export const hasError = (list, now = Date.now()) => list.some((a) => groupOf(a, now) === 'error');

// What the search looks at: the account, its proxy and its note. Accents and case are ignored ("ao dai" finds "Áo dài").
const haystack = (a) => norm([a.label, a.proxyLabel || a.proxy, a.note].filter(Boolean).join(' '));

// rows filtered by a chip (`group`) AND the search text (every word of it must be found).
export function filterRows(rows, group = 'all', query = '', now = Date.now()) {
  const words = norm(query).split(/\s+/).filter(Boolean);
  return rows.filter((a) => (group === 'all' || groupOf(a, now) === group) && (!words.length || words.every((w) => haystack(a).includes(w))));
}
