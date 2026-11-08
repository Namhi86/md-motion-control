import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { loginMuseList } from './setup-muse.js';
import { sayRow } from './setup-say.js';
import { hooks, rowsOf, st, busyIds } from './setup-state.js';
import { errText } from './ui-text.js';

// What a row (or the bulk bar) does to an account: "Kiểm tra", "Đặt lại", the Muse login window, "Đặt lại tất cả". The answers go to the line over the table.

// "Kiểm tra" = log in to see whether the account works (an account with an id|pass|2fa also fetches a new cookie when its cookie is dead).
// Returns the answer of main, or { ok: false, note } when the call itself failed.
export async function checkOne(a) {
  st.checking.add(a.id);
  hooks.paintTable();
  try {
    return (await window.dola.queue.checkAccount(a.id)) || { ok: false };
  } catch (err) {
    return { ok: false, note: t('Không kiểm tra được acc {label}: {why}', { label: a.label, why: errText(err) }) };
  } finally {
    st.checking.delete(a.id);
    hooks.paintTable();
  }
}

export async function checkAccount(a) {
  const r = await checkOne(a);
  if (r?.ok === false) sayRow(ct(r.note) || t('Không kiểm tra được acc {label}.', { label: a.label }), true);
  else sayRow(t('Đã kiểm tra acc {label}. Xem cột Trạng thái và Ghi chú.', { label: a.label }));
}

export async function resetAccounts(list) {
  let bad = 0;
  for (const a of list) {
    try {
      const r = await window.dola.queue.resetAccount(a.id);
      if (r?.ok === false) { bad += 1; sayRow(ct(r.note) || t('Không đặt lại được acc {label}.', { label: a.label }), true); }
    } catch (err) {
      bad += 1;
      sayRow(t('Không đặt lại được acc {label}: {why}', { label: a.label, why: errText(err) }), true);
    }
  }
  if (!bad) sayRow(list.length === 1 ? t('Đã đặt lại acc {label}: sẵn sàng.', { label: list[0].label }) : tn(list.length, 'Đã đặt lại {n} acc: sẵn sàng.', 'Reset {n} account: ready.', 'Reset {n} accounts: ready.'));
}

// "Đặt lại tất cả" (the button of the page header): every account of the open platform that is not running a task, whatever the chip and the search show.
export const resetAll = () => resetAccounts(rowsOf().filter((a) => !busyIds().has(a.id)));

// The Muse login window of one account.
export async function loginMuseOne(a) {
  const r = await loginMuseList(window.dola.accounts, [a]);
  sayRow(r.text, r.bad);
}
