import { t } from './i18n.js';
import { el } from './pop.js';
import { openRowMenu } from './setup-row-menu.js';
import { museBadge } from './setup-muse.js';
import { typeLabel } from './setup-platforms.js';
import { STATUS_LABEL, countdown, effectiveStatus, errText } from './ui-text.js';

// The account table of the Setup screen. Draws rows from the public view (no cookie, no proxy password) and wires the row controls.
// A row: [tick] [switch] account (+ its note on a muted second line that wraps) | type | proxy | status | "⋯" (Kiểm tra, Đăng nhập Muse, Đặt lại, Xoá: setup-row-menu.js).
export const TRASH = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';
const COLS = 7;

function checkbox(on, title, onChange) {
  const c = el('input', 'stp-chk');
  c.type = 'checkbox';
  c.checked = on;
  c.title = title;
  c.onchange = () => onChange(c.checked);
  return c;
}

function toggle(a, say) {
  const on = a.enabled !== false;
  const b = el('button', `stp-sw${on ? ' stp-sw--on' : ''}`);
  b.type = 'button';
  b.setAttribute('role', 'switch');
  b.setAttribute('aria-checked', String(on));
  b.title = on ? t('Đang bật. Bấm để tắt: acc tắt sẽ không được chạy việc nào') : t('Đang tắt. Bấm để bật lại');
  b.append(el('i'));
  b.onclick = async () => {
    b.disabled = true;
    try {
      const r = await window.dola.accounts.setEnabled(a.id, !on);
      if (r?.ok === false) say(on ? t('Không tắt được acc {label}.', { label: a.label }) : t('Không bật được acc {label}.', { label: a.label }), true);
    } catch (err) {
      say(on ? t('Không tắt được acc {label}: {why}', { label: a.label, why: errText(err) }) : t('Không bật được acc {label}: {why}', { label: a.label, why: errText(err) }), true);
    } finally {
      b.disabled = false; // the list comes back through accounts:changed and redraws the row
    }
  };
  return b;
}

// The note of a row. An account that waits out a busy Dola counts down to its next try (tickCountdowns keeps it going); once that
// wait is over (the list can be drawn a moment after the main process made it) the busy note says nothing any more. -> a node, or null when there is nothing to say.
function noteLine(a, st) {
  if (a.restWhy !== 'busy') return a.note ? el('span', '', a.note) : null;
  if (st !== 'rest') return null;
  const left = el('span', '', countdown(a.restUntil - Date.now()));
  left.dataset.until = String(a.restUntil);
  const line = el('span');
  const [before, after] = t('Dola đang bận: tự thử lại sau {time}', { time: '\u0000' }).split('\u0000');
  line.append(before, left, ...(after ? [after] : []));
  return line;
}

function badge(a, st) {
  const m = museBadge(a); // a Muse account words its own status ("Đợi mã", "Cần đăng nhập")
  const b = el('span', `stp-badge stp-badge--${m ? m.cls : st}`, m ? m.text : STATUS_LABEL[st] || a.status);
  if (st === 'rest') {
    const left = el('span', 'stp-rest', countdown(a.restUntil - Date.now()));
    left.dataset.until = String(a.restUntil);
    b.append(left);
  }
  return b;
}

function moreButton(a, ctx, running, checking) {
  const b = el('button', `stp-more${checking ? ' stp-more--busy' : ''}`, '⋯');
  b.type = 'button';
  b.setAttribute('aria-label', t('Thao tác với acc {label}', { label: a.label }));
  b.title = checking ? t('Đang kiểm tra…') : running ? t('Acc đang chạy việc') : t('Kiểm tra, Đặt lại, Xoá khỏi danh sách');
  b.onclick = () => openRowMenu(b, a, ctx);
  return b;
}

function headRow(rows, ctx) {
  const head = el('tr');
  const first = el('th', 'stp-th-tick');
  const all = checkbox(rows.length > 0 && rows.every((a) => ctx.selected.has(a.id)), t('Chọn / bỏ chọn tất cả acc đang hiện trong danh sách'), (on) => ctx.onSelectAll(on));
  all.indeterminate = rows.some((a) => ctx.selected.has(a.id)) && !rows.every((a) => ctx.selected.has(a.id));
  first.append(all);
  const more = el('th', 'stp-th-more');
  more.setAttribute('aria-label', t('Thao tác'));
  head.append(first, el('th', '', t('Bật')), el('th', '', ctx.header), el('th', 'stp-th-kind', t('Loại')), el('th', 'stp-th-px', 'Proxy'), el('th', 'stp-th-st', t('Trạng thái')), more);
  const thead = el('thead');
  thead.append(head);
  return thead;
}

// ctx: { header (the title of the account column), busy: Set of account ids running a task, checking: Set of ids being checked, say(text, bad), onCheck(acc), onReset(acc),
//        onLogin(acc) | null (opens the Muse login window; null = the core has no Muse login),
//        selected: Set of ticked ids, onSelect(id, on), onSelectAll(on) }
export function renderTable(box, rows, ctx) {
  const table = el('table', 'stp-table stp-table--acc');
  table.append(headRow(rows, ctx));
  const body = el('tbody');
  const now = Date.now();
  for (const a of rows) {
    const st = effectiveStatus(a, now);
    const running = ctx.busy.has(a.id);
    const checking = ctx.checking.has(a.id);
    const note = noteLine(a, st);
    const tr = el('tr', `${st === 'off' ? 'stp-row--off' : ''}${note ? ' stp-row--noted' : ''}`.trim());
    tr.dataset.id = a.id;

    const tick = el('td', 'stp-c-keep stp-c-tick');
    tick.append(checkbox(ctx.selected.has(a.id), t('Chọn acc này để thao tác hàng loạt'), (on) => ctx.onSelect(a.id, on)));
    const sw = el('td', 'stp-c-keep');
    sw.append(toggle(a, ctx.say));
    const who = el('td');
    const line = el('div', 'stp-who');
    const name = el('span', 'stp-mono stp-name', a.label);
    name.title = a.label;
    line.append(name);
    if (running || checking) {
      const run = el('span', 'stp-run');
      run.append(el('i'), running ? t('Đang chạy') : t('Đang kiểm tra…'));
      line.append(run);
    }
    who.append(line);
    const proxy = a.proxyLabel || a.proxy;
    const px = el('td', proxy ? 'stp-mono stp-px' : 'stp-dim', proxy || t('Không proxy'));
    if (proxy) px.title = proxy;
    const status = el('td', 'stp-c-keep');
    status.append(badge(a, st));
    const more = el('td', 'stp-c-keep stp-c-more');
    more.append(moreButton(a, ctx, running, checking));
    const kind = el('td', 'stp-dim stp-kind-col', typeLabel(a));
    kind.title = typeLabel(a); // the column is narrow in a small window: the whole word is the tooltip
    tr.append(tick, sw, who, kind, px, status, more);
    body.append(tr);

    if (note) { // the note: a second line under the account, as wide as the row, muted, wrapping (never cut)
      const nr = el('tr', `stp-note-row${st === 'off' ? ' stp-row--off' : ''}`);
      const text = el('td', 'stp-note');
      text.colSpan = COLS - 2;
      text.append(note);
      const lead = el('td', 'stp-note-lead');
      lead.colSpan = 2;
      nr.append(lead, text);
      body.append(nr);
    }
  }
  table.append(body);
  box.append(table);
}

// Called once a second: keeps every "Nghỉ tạm m:ss" counting down without redrawing the table.
export function tickCountdowns() {
  const now = Date.now();
  for (const n of document.querySelectorAll('[data-until]')) n.textContent = countdown(Number(n.dataset.until) - now);
}
