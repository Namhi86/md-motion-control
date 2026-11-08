import { MENU_LABEL, NO_READY_WAIT, NO_READY_WHY } from './guide-content.js';
import { modeOffered } from './muse-form.js';
import { needsLogin } from './setup-muse.js';
import { isReady } from './setup-platforms.js';
import { isEl } from './setup-eleven.js';
import { effectiveStatus } from './ui-text.js';

// The state of the beginner guide as plain data, pure (no DOM, no Electron): the wizard and the "Hướng dẫn" menu draw it, tests/guide-state.test.js
// tests it. Nothing here invents a status: an account is read through the same isReady / effectiveStatus / needsLogin as the Setup screen.
//   wizardSteps   the three steps (Proxy, Thêm acc, Đợi đăng nhập) and whether each is done
//   shouldAutoOpen / canCreate   when the wizard opens by itself, and the soft lock of the "Tạo" button (the core stays the real gate)
//   menuItems / menuEntries   the entries of the "Hướng dẫn" menu, shown by the same rules as the header / the ones of them that have a text to show
//   storeKey / readFlags / writeFlag   what the person already skipped or read, kept per e-mail in localStorage (never throws)

const CAPTCHA = /captcha/i; // a dead account says in its note that a person must tick a captcha (Facebook, Google)
// An ElevenLabs account (made by the app, not part of the road to a video) is left out: it never ticks "Thêm acc", never counts as ready or failed here.
const listOf = (accounts) => (Array.isArray(accounts) ? accounts.filter((a) => a && typeof a === 'object' && !isEl(a)) : []);

// Where an account stands on the road to "ready": 'ready' | 'logging' (the app is logging in) | 'code' (a Muse account waits for the code Muse mailed: the person must
// type it, setup-muse.js) | 'captcha' | 'failed' | '' (off, resting, at its daily limit… : not part of the login story). A dead account is a 'captcha' one when its
// note says so.
function stage(acc, now) {
  if (isReady(acc, now)) return 'ready';
  const st = effectiveStatus(acc, now);
  if (st === 'login') return acc.type === 'muse' ? 'code' : 'logging';
  if (st === 'dead') return CAPTCHA.test(String(acc.note || '')) ? 'captcha' : 'failed';
  return st === 'ready' && needsLogin(acc, now) ? 'failed' : ''; // a Muse wait for the code that ran out: the person must log in again
}

// proxy = proxySummary() of proxy-ui.js ({ alive, total }); accounts = window.dola.accounts.list().
// -> [{ id: 'proxy' | 'account' | 'ready', done, optional, detail }] in the order the person walks them.
// The last step is done by a ready account of ANY platform (Seedance, Muse, Veo): the same "ready" as the Setup tabs and the soft lock of the "Tạo" button (Sếp 2026-10-21).
export function wizardSteps({ proxy, accounts, now = Date.now() } = {}) {
  const list = listOf(accounts);
  const count = { ready: 0, logging: 0, code: 0, captcha: 0, failed: 0 };
  for (const acc of list) {
    const s = stage(acc, now);
    if (s) count[s] += 1;
  }
  const alive = Number(proxy?.alive) || 0;
  return [
    { id: 'proxy', done: alive >= 1, optional: true, detail: { alive, total: Number(proxy?.total) || 0 } }, // a run works without a proxy
    { id: 'account', done: list.length >= 1, optional: false, detail: { total: list.length } },
    { id: 'ready', done: count.ready >= 1, optional: false, detail: count },
  ];
}

// Does the wizard open by itself? Only for a person with NO account in the list at all (a beginner) who has not skipped the guide. An account that
// rests, is at its daily limit, was switched off or has a dead cookie is a returning person's: the wizard stays closed (the "Hướng dẫn" button opens it by
// hand, and canCreate still dims the "Tạo" button). seenWizard = it already opened in this window session (kept in memory by the caller): closing it
// must not bring it back at the next account change.
export function shouldAutoOpen({ steps, skipped, seenWizard } = {}) {
  if (skipped || seenWizard) return false;
  const account = Array.isArray(steps) ? steps.find((s) => s?.id === 'account') : null;
  return !!account && account.done !== true;
}

// The soft lock of the "Tạo" button: { ok, why }. It only reminds: the core stays the real gate. A ready account of ANY platform (Seedance, Muse, Veo) counts.
// why = '' when ok; else NO_READY_WHY for an EMPTY list (the person must add accounts), NO_READY_WAIT when accounts exist but none is ready now (a command waits).
// A list that is not an array (not read yet, or failing) is no reason to lock.
export function canCreate(accounts, now = Date.now()) {
  if (!Array.isArray(accounts)) return { ok: true, why: '' };
  const list = listOf(accounts);
  if (list.some((a) => isReady(a, now))) return { ok: true, why: '' };
  return { ok: false, why: list.length ? NO_READY_WAIT : NO_READY_WHY };
}

// The entries of the "Hướng dẫn" menu: [{ id, label }], in the order of the header. "Bắt đầu" and "Tạo video" always; the rest by the rules the
// header uses (app.js paintNav): Tạo ảnh = modeOffered('image') (navState), Phân tích video = opts.analyze === true, Kho skill = opts.skills === true,
// Bàn sáng tạo = opts.studio AND the board module loaded (hasStudio). opts = window.dola.options(); null (an older core / not arrived) = the two.
export function menuItems(opts, hasStudio) {
  const ids = ['start', 'create'];
  if (modeOffered('image', opts)) ids.push('image');
  if (opts?.analyze === true) ids.push('analyze');
  if (opts?.studio && hasStudio) ids.push('studio');
  if (opts?.skills === true) ids.push('skills');
  return ids.map((id) => ({ id, label: MENU_LABEL[id] }));
}

// The entries the menu really lists: the menuItems() that also have a line in `intro` (guide-content.js MENU_INTRO). An entry whose text is not written yet is
// left out, whatever the core offers. -> [{ id, label, intro }]
export function menuEntries(opts, hasStudio, intro) {
  return menuItems(opts, hasStudio).filter((m) => typeof intro?.[m.id] === 'string' && intro[m.id] !== '').map((m) => ({ ...m, intro: intro[m.id] }));
}

// ── What the person already did, per e-mail ──
// Stored as JSON { skipped: true, cardSeen: { create: true, … } } under 'fs-guide:<e-mail in lower case>'. A tab name is a short word, so a
// stored key like "__proto__" is ignored. Storage can be full, blocked or hold junk: every function falls back to "nothing done", none throws.
const TAB = /^[a-z][a-z0-9-]{0,30}$/;
const CARD_PREFIX = 'cardSeen:';

// '' when there is no usable e-mail (then nothing is read or written).
export function storeKey(email) {
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  return mail ? `fs-guide:${mail}` : '';
}

// -> { skipped: boolean, cardSeen: { <tab>: true } }
export function readFlags(storage, email) {
  const flags = { skipped: false, cardSeen: {} };
  const key = storeKey(email);
  if (!key) return flags;
  let data;
  try {
    data = JSON.parse(storage.getItem(key));
  } catch {
    return flags; // no storage, storage refused, or the text is not JSON
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return flags;
  flags.skipped = data.skipped === true;
  const seen = data.cardSeen;
  if (seen && typeof seen === 'object' && !Array.isArray(seen)) {
    for (const [tab, value] of Object.entries(seen)) if (value === true && TAB.test(tab)) flags.cardSeen[tab] = true;
  }
  return flags;
}

// name = 'skipped' or 'cardSeen:<tab>'. -> true when the flag was stored; false for no e-mail, an unknown name or a storage that refuses.
export function writeFlag(storage, email, name) {
  const key = storeKey(email);
  if (!key) return false;
  const flags = readFlags(storage, email);
  const tab = typeof name === 'string' && name.startsWith(CARD_PREFIX) ? name.slice(CARD_PREFIX.length) : '';
  if (name === 'skipped') flags.skipped = true;
  else if (TAB.test(tab)) flags.cardSeen[tab] = true;
  else return false;
  try {
    storage.setItem(key, JSON.stringify(flags));
    return true;
  } catch {
    return false;
  }
}
