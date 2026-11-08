import { el } from './pop.js';
import { TRASH } from './setup-table.js';
import { elevenRowView } from './setup-eleven.js';

// The account table of the ElevenLabs tab. Draws only what elevenRowView() says: the account column is always '***', the proxy column only "Có proxy" /
// "Không proxy", so nothing secret can reach the screen through here (the core's public view carries none either).
// ctx: { say(text, bad), onSolve(acc), onRemove(acc), solving: Set of ids whose "Giải captcha" is in flight }
const HEAD = ['#', 'Tài khoản', 'Proxy', 'Trạng thái', 'Ký tự còn lại', 'Ghi chú', '', ''];

export function renderElevenTable(box, rows, ctx, now = Date.now()) {
  const table = el('table', 'stp-table su-el-table');
  const head = el('tr');
  for (const h of HEAD) head.append(el('th', '', h));
  const thead = el('thead');
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  rows.forEach((a, i) => {
    const v = elevenRowView(a, i, now);
    const tr = el('tr');
    tr.dataset.status = v.badge.cls;
    const badge = el('span', `stp-badge stp-badge--${v.badge.cls}`, v.badge.text);
    if (v.badge.until) {
      const left = el('span', 'stp-rest');
      left.dataset.until = String(v.badge.until);
      badge.append(left);
    }
    const status = el('td');
    status.append(badge);
    const note = el('td', 'stp-dim stp-note', v.note);
    if (v.note) note.title = v.note;
    const chars = el('td', 'stp-num su-el-chars', v.chars);
    chars.title = v.charsTitle;
    const act = el('td', 'stp-c-keep');
    if (v.canSolve) {
      const busy = ctx.solving?.has(a.id) === true;
      const b = el('button', 'stp-btn stp-btn--sm stp-btn--accent su-el-solve', busy ? 'Đang mở…' : 'Giải captcha');
      b.type = 'button';
      b.disabled = busy;
      b.title = 'Mở cửa sổ Chrome của acc này để bạn tự tick captcha; xong acc tự chạy tiếp';
      b.onclick = () => ctx.onSolve(a);
      act.append(b);
    }
    const del = el('button', 'stp-del su-el-del');
    del.type = 'button';
    del.disabled = !v.canDelete;
    del.title = v.deleteTitle;
    del.innerHTML = TRASH; // our own constant svg, never text from the core
    del.onclick = () => ctx.onRemove(a);
    const delTd = el('td', 'stp-c-keep');
    delTd.append(del);
    tr.append(el('td', 'stp-dim stp-num', String(v.n)), el('td', 'stp-mono su-el-label', v.label), el('td', 'stp-dim', v.proxy), status, chars, note, act, delTd);
    body.append(tr);
  });
  table.append(body);
  box.append(table);
}
