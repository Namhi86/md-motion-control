import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { el } from './pop.js';
import { LOGIN_BUTTON, canLoginMuse, loginMuseList } from './setup-muse.js';
import { checkOne, resetAccounts } from './setup-actions.js';
import { sayRow } from './setup-say.js';
import { hooks, idle, st, visibleRows } from './setup-state.js';
import { errText } from './ui-text.js';

// The bar over the table: appears when rows are ticked. "Đăng nhập" = Kiểm tra on each of them, one after the other.
const bulkBar = el('div', 'stp-bulk');
bulkBar.hidden = true;
document.getElementById('su-table').before(bulkBar);
let bulkBusy = false; // a bulk login / reset / delete is in flight

// The ticked rows the person can SEE: a row hidden by a chip or by the search is never touched by a bulk button.
export const chosenRows = () => visibleRows().filter((a) => st.selected.has(a.id));

async function bulk(work) {
  if (bulkBusy) return;
  bulkBusy = true;
  paintBulk();
  try {
    await work();
  } finally {
    bulkBusy = false;
    paintBulk();
  }
}

async function bulkLogin() {
  const rows = chosenRows().filter(idle);
  const skipped = chosenRows().length - rows.length;
  if (!rows.length) return sayRow(t('Các acc đã chọn đang chạy việc: đợi xong rồi hãy đăng nhập.'), true);
  let ok = 0;
  let bad = 0;
  for (const [i, a] of rows.entries()) {
    sayRow(t('Đang đăng nhập acc {i}/{total}: {label}…', { i: i + 1, total: rows.length, label: a.label }));
    const r = await checkOne(a);
    if (r?.ok === false) bad += 1;
    else ok += 1;
  }
  const accounts = tn(rows.length, '{n} acc', '{n} account', '{n} accounts');
  const done = t('Đăng nhập xong {accounts}: {ok} được, {bad} lỗi', { accounts, ok, bad });
  const left = tn(skipped, 'bỏ qua {n} acc đang chạy việc', 'skipped {n} busy account', 'skipped {n} busy accounts');
  sayRow(skipped ? t('{done}, {skipped}. Xem cột Trạng thái.', { done, skipped: left }) : t('{done}. Xem cột Trạng thái.', { done }), bad > 0);
}

// Muse list: "Đăng nhập" opens the Muse login window of each ticked account (the existing check-by-logging-in button is then called "Kiểm tra").
async function bulkMuseLogin() {
  const rows = chosenRows().filter(idle);
  if (!rows.length) return sayRow(t('Các acc đã chọn đang chạy việc: đợi xong rồi hãy đăng nhập.'), true);
  const r = await loginMuseList(window.dola.accounts, rows, sayRow);
  sayRow(r.text, r.bad);
}

async function bulkDelete() {
  const ids = chosenRows().map((a) => a.id);
  try {
    const r = await window.dola.accounts.removeMany(ids);
    if (r?.ok === false) return sayRow(ct(r.note) || t('Không xoá được các acc đã chọn.'), true);
    for (const id of ids) st.selected.delete(id);
    const removed = tn(r.removed, 'Đã xoá {n} acc', 'Deleted {n} account', 'Deleted {n} accounts');
    const kept = tn(r.skipped, 'giữ lại {n} acc đang chạy việc', 'kept {n} busy account', 'kept {n} busy accounts');
    sayRow(r.skipped ? `${removed}, ${kept}.` : `${removed}.`, false);
  } catch (err) {
    sayRow(t('Không xoá được: {why}', { why: errText(err) }), true);
  }
}

// "Đổi proxy": each ticked account moves to another proxy of the pool (a free one first, else the least used, never its own). Only the proxy changes.
async function bulkProxy() {
  const rows = chosenRows();
  try {
    const r = await window.dola.proxies.reassign(rows.map((a) => a.id));
    if (r?.ok === false) return sayRow(t('Không đổi được proxy.'), true);
    const parts = [tn(r.changed, 'Đã đổi proxy cho {n} acc', 'Changed the proxy of {n} account', 'Changed the proxy of {n} accounts')];
    if (r.shared) parts.push(tn(r.shared, '{n} acc phải dùng chung proxy (hết proxy rảnh)', '{n} account has to share a proxy (no free proxy left)', '{n} accounts have to share a proxy (no free proxy left)'));
    if (r.skippedBusy) parts.push(tn(r.skippedBusy, 'bỏ qua {n} acc đang chạy việc', 'skipped {n} account that is busy', 'skipped {n} accounts that are busy'));
    if (r.kept) parts.push(tn(r.kept, '{n} acc không còn proxy nào khác để đổi', '{n} account has no other proxy to switch to', '{n} accounts have no other proxy to switch to'));
    sayRow(`${parts.join('; ')}.`, r.changed === 0);
  } catch (err) {
    sayRow(t('Không đổi được proxy: {why}', { why: errText(err) }), true);
  }
}

// "Đã chọn <b>3</b> acc": the number stays in bold inside one translated sentence (the words around it are what is left of the sentence).
function selectedCount(count) {
  const text = tn(count, 'Đã chọn {n} acc', '{n} account selected', '{n} accounts selected');
  const at = text.indexOf(String(count));
  return [text.slice(0, at), el('b', '', String(count)), text.slice(at + String(count).length)].filter((part) => part !== '');
}

export function paintBulk() {
  const rows = chosenRows();
  bulkBar.hidden = !rows.length;
  bulkBar.replaceChildren();
  if (!rows.length) return;
  const museLogin = st.platform === 'muse' && canLoginMuse(window.dola.accounts); // the Muse list gets its own "Đăng nhập"; the old one is then "Kiểm tra"
  const mk = (text, cls, fn, title) => {
    const b = el('button', `stp-btn stp-btn--sm ${cls}`.trim(), text);
    b.type = 'button';
    b.disabled = bulkBusy;
    b.title = title;
    b.onclick = fn;
    return b;
  };
  const n = el('span');
  n.append(...selectedCount(rows.length));
  bulkBar.append(
    n,
    ...(museLogin ? [mk(LOGIN_BUTTON.text, '', () => bulk(bulkMuseLogin), LOGIN_BUTTON.bulkTitle)] : []),
    mk(museLogin ? t('Kiểm tra') : t('Đăng nhập'), '', () => bulk(bulkLogin), t('Đăng nhập thử từng acc đã chọn (lần lượt từng acc) để biết cookie còn dùng được không; acc có id|pass|2fa tự lấy cookie mới nếu cookie chết')),
    mk(t('Đặt lại'), '', () => bulk(() => resetAccounts(rows.filter(idle))), t('Đưa các acc đã chọn (trừ acc đang chạy việc) về Sẵn sàng ngay')),
    ...(window.dola.proxies?.reassign ? [mk(t('Đổi proxy'), '', () => bulk(bulkProxy), t('Chuyển các acc đã chọn sang proxy khác trong kho: proxy chưa ai dùng trước, hết thì proxy ít người dùng nhất, không bao giờ trùng proxy hiện tại. Chỉ đổi proxy, giữ nguyên phiên đăng nhập; acc đang chạy việc được bỏ qua'))] : []),
    mk(t('Xoá'), 'stp-btn--danger', () => bulk(bulkDelete), t('Xoá các acc đã chọn khỏi danh sách (hỏi một lần)')),
    mk(t('Bỏ chọn'), '', () => { st.selected.clear(); hooks.paintTable(); }, t('Bỏ tick tất cả')),
  );
}
