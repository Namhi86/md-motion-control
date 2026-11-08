import { closePop, el, openPop } from './pop.js';
import { dateLocale, t, tn } from './i18n.js';

// The proxy part of the Setup screen (the "Proxy" card): paste proxies, measure them, give every account a proxy of its own.
// The window only gets the public view of the pool from main (host, port, user name, status, latency, usedBy): never a password.
const STATUS = { unknown: t('Chưa đo'), alive: t('Sống'), dead: t('Chết'), refused: t('Sai đăng nhập'), region: t('Bị chặn vùng?') };
const BADGE = { unknown: 'used', alive: 'ready', dead: 'dead', refused: 'dead', region: 'limit' }; // colours of .stp-badge--*
const TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const NOTES = [
  t('Chỉ nhận proxy http/https, có hoặc không có user/mật khẩu. SOCKS5 chưa hỗ trợ. Mỗi dòng một proxy, nhận các dạng: host:port · host:port:user:pass · user:pass:host:port · user:pass@host:port · host:port@user:pass · hoặc các trường cách nhau bằng | ; , tab hay dấu cách (vd 1.2.3.4|8080|user|pass). Thêm https:// phía trước nếu là proxy HTTPS.'),
  t('Mỗi acc Seedance nên dùng một proxy riêng (một IP riêng). Nhiều acc chung một IP thì Dola dễ nhận ra cùng một nguồn.'),
  t('Dola không chạy qua proxy Mỹ. Nhãn "Mỹ?" chỉ là đoán theo tên proxy (app không đo vị trí thật). Trạng thái "Bị chặn vùng?" cũng là phỏng đoán từ phản hồi của Dola, chưa kiểm trên Dola thật.'),
];

let view = [];
let onSummary = () => {};
// What the Setup cards show for the proxy card: { alive, total } (a proxy that was never measured counts as usable too).
export const proxySummary = () => ({ alive: view.filter((e) => e.status === 'alive' || e.status === 'unknown').length, total: view.length });
export const onProxySummary = (fn) => { onSummary = fn; };
let peak = 0; // most proxies seen "being measured" at once in this run: the size of the run, for the progress bar
const ui = {};
const selected = new Set(); // ids ticked in the table; setView drops the ones that vanished, so "Xoá (N)" never counts a proxy that is gone
let confirmN = 0; // > 0 while the bar asks "Xoá N proxy?"
let askedAt = 0;
let busy = false;
const ASK_GUARD_MS = 600; // a double click or a held Enter must not answer the question it has just raised (same as the history bar)

// Two message lines, each next to the buttons that cause it: 'add' (paste box) and 'list' (measure / assign / delete).
const say = (text, bad = false, where = 'list') => {
  ui[where].textContent = text;
  ui[where].classList.toggle('stp-msg--bad', bad);
};
const button = (text, cls, onclick) => {
  const b = el('button', `stp-btn${cls ? ` ${cls}` : ''}`, text);
  b.type = 'button';
  b.onclick = onclick;
  return b;
};
const tip = (node, text) => {
  node.title = text;
  return node;
};
const card = (title, body, side) => {
  const label = el('p', 'stp-card-label', title);
  if (side) label.append(side);
  const inner = el('div', 'stp-card-body');
  inner.append(...body);
  const c = el('div', 'stp-card');
  c.append(label, inner);
  return { c, inner };
};
// Every call into main goes through here: a failure shows on the screen instead of vanishing.
async function call(fn, where = 'list') {
  try {
    return await fn();
  } catch (err) {
    say(t('Lỗi: {why}', { why: String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '') }), true, where);
    return null;
  }
}

const tickBox = (title, onChange) => {
  const c = el('input', 'stp-chk');
  c.type = 'checkbox';
  c.title = title;
  c.onchange = () => onChange(c.checked);
  return c;
};

const dropAsk = () => {
  if (!confirmN) return;
  confirmN = 0;
  say('');
};

// The ticks change often and the table is not redrawn for them (a redraw would drop the keyboard focus): the boxes, the "select all" box and
// the delete buttons are brought in line with `selected` here.
function syncTicks() {
  const n = selected.size;
  for (const [id, c] of ui.boxes) c.checked = selected.has(id);
  if (ui.all) {
    ui.all.checked = n > 0 && n === view.length;
    ui.all.indeterminate = n > 0 && n < view.length;
  }
  if (confirmN && confirmN !== n) dropAsk(); // the ticks changed under the question: ask again
  ui.del.hidden = ui.off.hidden = n === 0;
  ui.del.disabled = busy;
  ui.del.textContent = confirmN ? t('Xoá') : t('Xoá ({n})', { n });
  ui.off.textContent = confirmN ? t('Không') : t('Bỏ chọn');
}

function pick(id, on) {
  if (on) selected.add(id);
  else selected.delete(id);
  dropAsk(); // even with the same count, another set of proxies is another question
  syncTicks();
}

// "3 acc (dùng chung)": a proxy used by more than one account says so.
const usedByText = (n) => (n > 1
  ? tn(n, '{n} acc (dùng chung)', '{n} account (shared)', '{n} accounts (shared)')
  : tn(n, '{n} acc', '{n} account', '{n} accounts'));

function paintTable() {
  ui.table.replaceChildren();
  ui.boxes = new Map();
  ui.all = null;
  if (!view.length) return ui.table.append(el('div', 'stp-empty-block', t('Kho trống. Dán proxy ở khung trên rồi bấm "Thêm proxy".')));
  const table = el('table', 'stp-table');
  const head = el('tr');
  for (const h of ['', '#', t('Địa chỉ'), t('Giao thức'), t('Trạng thái'), t('Độ trễ'), t('Acc dùng'), '']) {
    const th = el('th', '', h);
    if (!h && !head.children.length) {
      ui.all = tickBox(t('Chọn / bỏ chọn tất cả proxy'), (on) => {
        selected.clear();
        if (on) for (const e of view) selected.add(e.id);
        dropAsk();
        syncTicks();
      });
      th.append(ui.all);
    }
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  view.forEach((e, i) => {
    const addr = el('td');
    addr.append(el('span', 'stp-mono', e.label));
    if (e.usWarning) {
      addr.append(tip(el('span', 'px-us', t('Mỹ?')), t('Đoán theo tên proxy: có vẻ là proxy Mỹ. Dola không chạy qua proxy Mỹ.')));
    }
    if (e.username) addr.append(tip(el('div', 'px-user', e.username), e.username));
    const st = el('td');
    const badge = el('span', `stp-badge stp-badge--${e.checking ? 'used' : BADGE[e.status]}`, e.checking ? t('Đang đo…') : STATUS[e.status] || e.status);
    if (e.checkedAt && !e.checking) badge.title = t('Đo lúc {time}', { time: new Date(e.checkedAt).toLocaleTimeString(dateLocale()) });
    st.append(badge);
    if (e.error && !e.checking && e.status !== 'alive') st.append(tip(el('div', 'px-err', e.error), e.error));
    const ms = el('td', e.latencyMs >= 2000 ? 'px-slow' : 'stp-dim', e.latencyMs > 0 && !e.checking ? `${e.latencyMs} ms` : '—');
    const used = el('td', e.usedBy > 1 ? 'px-slow' : 'stp-dim', e.usedBy ? usedByText(e.usedBy) : '—');
    const del = el('button', 'stp-del');
    del.type = 'button';
    del.title = e.usedBy ? t('Xoá khỏi kho (acc đang dùng sẽ bị gỡ proxy này)') : t('Xoá khỏi kho');
    del.innerHTML = TRASH;
    del.onclick = () => call(() => window.dola.proxies.remove(e.id));
    const delTd = el('td');
    delTd.append(del);
    const box = tickBox(t('Chọn proxy {label}', { label: e.label }), (on) => pick(e.id, on));
    ui.boxes.set(e.id, box);
    const boxTd = el('td');
    boxTd.append(box);
    const tr = el('tr');
    tr.append(boxTd, el('td', 'stp-dim', String(i + 1)), addr, el('td', 'stp-dim', e.scheme.toUpperCase()), st, ms, used, delTd);
    body.append(tr);
  });
  table.append(thead, body);
  ui.table.append(table);
}

function paint() {
  const count = (s) => view.filter((e) => e.status === s).length;
  const checking = view.filter((e) => e.checking).length;
  peak = checking ? Math.max(peak, checking) : 0;
  const bad = count('dead') + count('refused') + count('region');
  ui.count.textContent = view.length
    ? t('{total} · {alive} sống · {bad} lỗi · {us} nghi là Mỹ', { total: tn(view.length, '{n} proxy', '{n} proxy', '{n} proxies'), alive: count('alive'), bad, us: view.filter((e) => e.usWarning).length }) : t('0 proxy');
  ui.check.disabled = checking > 0;
  ui.check.textContent = checking ? t('Đang đo {done}/{total}…', { done: peak - checking, total: peak }) : t('Kiểm sức khoẻ');
  ui.bar.hidden = !checking;
  ui.fill.style.width = `${checking ? ((peak - checking) / peak) * 100 : 0}%`;
  paintTable();
  syncTicks();
}

export function setView(next) {
  view = Array.isArray(next) ? next : [];
  const here = new Set(view.map((e) => e.id));
  for (const id of selected) if (!here.has(id)) selected.delete(id); // a ticked proxy that was deleted (here or elsewhere) is gone
  paint();
  onSummary();
}

async function onAdd() {
  if (!ui.text.value.trim()) return say(t('Chưa dán proxy.'), true, 'add');
  const r = await call(() => window.dola.proxies.add(ui.text.value), 'add');
  if (!r) return;
  if (!r.ok) return say(t('Không đọc được danh sách vừa dán.'), true, 'add');
  const bits = [];
  if (r.added) bits.push(t('thêm {n}', { n: r.added }));
  if (r.duplicates) bits.push(t('trùng {n}', { n: r.duplicates }));
  if (r.invalid) bits.push(tn(r.invalid, 'bỏ {n} dòng sai định dạng (xem các dạng nhận được ở mục Cần biết; SOCKS5 không nhận)', 'skipped {n} line in a wrong format (see the accepted formats under "Good to know"; SOCKS5 is not accepted)', 'skipped {n} lines in a wrong format (see the accepted formats under "Good to know"; SOCKS5 is not accepted)'));
  say(t('Đã xử lý: {result}.', { result: bits.join(', ') || t('không có dòng nào') }), !r.added, 'add');
  if (r.added) ui.text.value = '';
}

// "Xoá (N)": the first press asks (what is lost is said out loud: the accounts that use a ticked proxy lose it), the second one deletes.
async function onDelete() {
  if (typeof window.dola.proxies.removeMany !== 'function') return say(t('Cần cập nhật app lên bản mới để xoá nhiều proxy.'), true);
  const n = selected.size;
  if (!confirmN) {
    const used = view.filter((e) => selected.has(e.id)).reduce((sum, e) => sum + (e.usedBy || 0), 0);
    confirmN = n;
    askedAt = Date.now();
    const ask = tn(n, 'Xoá {n} proxy?', 'Delete {n} proxy?', 'Delete {n} proxies?');
    say(`${ask} ${used ? tn(used, '{n} acc đang dùng sẽ bị gỡ proxy.', '{n} account using it will lose its proxy.', '{n} accounts using them will lose their proxy.') : tn(n, 'Chưa acc nào đang dùng.', 'No account is using it.', 'No account is using them.')}`);
    syncTicks();
    ui.off.focus(); // Enter or Space right after the question answers "Không"
    return;
  }
  if (Date.now() - askedAt < ASK_GUARD_MS) return;
  const ids = [...selected];
  confirmN = 0;
  busy = true;
  syncTicks();
  const r = await call(() => window.dola.proxies.removeMany(ids));
  busy = false;
  if (r?.ok) {
    for (const id of ids) selected.delete(id); // not clear(): a box ticked while the call was in flight stays
    const deleted = tn(r.removed, 'Đã xoá {n} proxy', 'Deleted {n} proxy', 'Deleted {n} proxies');
    const cleared = tn(r.cleared, 'gỡ proxy khỏi {n} acc', 'removed the proxy from {n} account', 'removed the proxy from {n} accounts');
    say(`${deleted}, ${cleared}.`);
  } else if (r) say(t('Không xoá được các proxy đã chọn.'), true);
  syncTicks();
}

function onUntick() {
  if (confirmN) dropAsk();
  else selected.clear();
  syncTicks();
}

async function onCheck() {
  if (!view.length) return say(t('Kho trống, chưa có proxy để đo.'), true);
  say(t('Đang đo: mỗi lần tối đa 6 proxy, proxy chết có thể mất tới 15 giây.'));
  const r = await call(() => window.dola.proxies.check());
  if (!r) return;
  if (!r.ok) return say(r.reason === 'busy' ? t('Đang có một lượt đo, đợi nó xong đã.') : t('Không đo được.'), true);
  say(t('{measured}: {alive} sống, {dead} chết, {refused} sai đăng nhập, {region} bị chặn vùng (đoán).', {
    measured: tn(r.checked, 'Đo xong {n} proxy', 'Measured {n} proxy', 'Measured {n} proxies'), alive: r.alive, dead: r.dead, refused: r.refused, region: r.region,
  }));
}

async function assignTo(scope) {
  closePop();
  const r = await call(() => window.dola.proxies.autoAssign({ scope }));
  if (!r) return;
  if (!r.assigned) return say(t('Không ghép được: không có acc nào cần proxy, hoặc không còn proxy dùng được.'), true);
  const bits = [tn(r.assigned, 'Đã ghép proxy cho {n} acc', 'Assigned a proxy to {n} account', 'Assigned proxies to {n} accounts')];
  if (r.shared) bits.push(tn(r.shared, '{n} acc phải dùng chung proxy vì thiếu proxy', '{n} account has to share a proxy because there are not enough', '{n} accounts have to share proxies because there are not enough'));
  if (r.unused) bits.push(tn(r.unused, 'còn {n} proxy chưa ai dùng', '{n} proxy is still unused', '{n} proxies are still unused'));
  say(`${bits.join(', ')}.`, r.shared > 0);
}

function onAssign() {
  if (!view.some((e) => e.status === 'alive' || e.status === 'unknown')) return say(t('Không có proxy dùng được (sống hoặc chưa đo) để ghép.'), true);
  const option = (name, desc, scope) => {
    const b = el('button', 'cv-model-item');
    b.type = 'button';
    const body = el('span', 'cv-model-body');
    body.append(el('span', 'cv-model-name', name), el('span', 'px-opt-desc', desc));
    b.append(body);
    b.onclick = () => assignTo(scope);
    return b;
  };
  openPop(ui.assign, [
    el('p', 'cv-pop-head', t('Ghép proxy tự động cho acc nào?')),
    option(t('Chỉ acc chưa có proxy'), t('Acc đã có proxy giữ nguyên. Nên chọn cái này trước.'), 'noProxy'),
    option(t('Tất cả acc'), t('Đổi cả proxy đang dùng của mọi acc sang proxy mới.'), 'all'),
    el('p', 'cv-pop-note', t('Mỗi acc một proxy sống khác nhau. Thiếu proxy thì acc dùng chung (quay vòng) và app báo rõ. Proxy chết, sai đăng nhập hoặc bị chặn không bao giờ được ghép. Proxy chưa đo vẫn được ghép, nên bấm "Kiểm sức khoẻ" trước.')),
  ], 400);
}

export function initProxyUi() {
  const root = document.getElementById('mount-proxies');
  const notes = el('ul', 'px-notes');
  for (const n of NOTES) notes.append(el('li', '', n));

  ui.text = el('textarea', 'stp-input px-ta');
  ui.text.spellcheck = false;
  ui.text.placeholder = t('Mỗi dòng một proxy, ví dụ:\nhost:port:user:pass\nuser:pass@host:port\nhost:port@user:pass\nhost|port|user|pass');
  ui.add = el('p', 'stp-msg');
  const actions = el('div', 'stp-actions');
  actions.append(button(t('Thêm proxy'), 'stp-btn--accent', onAdd), ui.add);
  const add = card(t('Thêm proxy'), [ui.text, actions]);

  ui.count = el('span');
  ui.check = button(t('Kiểm sức khoẻ'), '', onCheck);
  ui.assign = button(t('Ghép proxy tự động'), 'stp-btn--accent', onAssign);
  ui.del = button('', 'px-danger', onDelete);
  ui.off = button(t('Bỏ chọn'), '', onUntick);
  ui.del.hidden = ui.off.hidden = true;
  ui.fill = el('div', 'px-bar-fill');
  ui.bar = el('div', 'px-bar');
  ui.bar.hidden = true;
  ui.bar.append(ui.fill);
  ui.list = el('p', 'stp-msg');
  const bar = el('div', 'stp-actions');
  bar.append(ui.assign, ui.check, ui.del, ui.off, ui.list);
  ui.table = el('div');
  const list = card(t('Kho proxy'), [bar, ui.bar, ui.table], ui.count);
  list.inner.classList.add('px-list');

  root.append(add.c, list.c, card(t('Cần biết'), [notes]).c);
  window.dola.proxies.onChange(setView);
  // A proxy's "Acc dùng" changes whenever the account list does.
  window.dola.accounts.onChange(() => call(() => window.dola.proxies.list()).then((v) => v && setView(v)));
  call(() => window.dola.proxies.list()).then((v) => v && setView(v));
}
