// Bảng hiển thị danh sách tài khoản Google Flow (Veo 3) và Meta Muse AI
import { el } from './pop.js';
import { STATUS_LABEL, countdown, effectiveStatus, errText } from './ui-text.js';

const TRASH =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

function checkbox(checked, title, onChange) {
  const input = el('input', 'stp-chk');
  input.type = 'checkbox';
  input.checked = checked;
  input.title = title;
  input.onchange = () => onChange(input.checked);
  return input;
}

function toggle(acc, say) {
  const isEnabled = acc.enabled !== false;
  const btn = el('button', 'stp-sw' + (isEnabled ? ' stp-sw--on' : ''));
  btn.type = 'button';
  btn.setAttribute('role', 'switch');
  btn.setAttribute('aria-checked', String(isEnabled));
  btn.title = isEnabled
    ? 'Đang bật. Bấm để tắt: tài khoản tắt sẽ không được phân công chạy việc'
    : 'Đang tắt. Bấm để bật lại';
  btn.append(el('i'));
  btn.onclick = async () => {
    btn.disabled = true;
    try {
      const res = await window.dola.accounts.setEnabled(acc.id, !isEnabled);
      if (res?.ok === false) {
        say(
          'Không ' +
            (isEnabled ? 'tắt' : 'bật') +
            ' được tài khoản ' +
            acc.label +
            '.',
          true
        );
      }
    } catch (err) {
      say(
        'Không ' +
          (isEnabled ? 'tắt' : 'bật') +
          ' được tài khoản ' +
          acc.label +
          ': ' +
          errText(err),
        true
      );
    } finally {
      btn.disabled = false;
    }
  };
  return btn;
}

function noteCell(acc, status) {
  const td = el('td', 'stp-dim stp-note');
  if (acc.restWhy !== 'busy') {
    td.textContent = acc.note || '';
  } else if (status === 'rest') {
    const span = el('span', '', countdown(acc.restUntil - Date.now()));
    span.dataset.until = String(acc.restUntil);
    td.append('Đang bận: tự thử lại sau ', span);
  }
  return td;
}

function badge(acc, status) {
  const span = el(
    'span',
    'stp-badge stp-badge--' + status,
    STATUS_LABEL[status] || acc.status
  );
  if (status === 'rest') {
    const cd = el('span', 'stp-rest', countdown(acc.restUntil - Date.now()));
    cd.dataset.until = String(acc.restUntil);
    span.append(cd);
  }
  return span;
}

function creditsCell(acc) {
  if (acc.type !== 'google') return null;
  const left = acc.credits?.left;
  const hasCredits = Number.isFinite(left);
  const text = hasCredits
    ? `${left.toLocaleString('vi-VN')} credit${acc.credits?.estimate ? ' (ước tính)' : ''}`
    : 'Chưa đọc';
  const td = el('td', hasCredits ? 'stp-mono' : 'stp-dim', text);
  return td;
}

export function renderTable(container, rows, opts) {
  const isGoogle = opts.type === 'google';
  const table = el('table', 'stp-table');
  const headRow = el('tr');

  const headers = isGoogle
    ? [
        'Bật',
        '#',
        'Email Google Flow (Veo 3)',
        'Credit Flow',
        'Proxy',
        'Trạng thái',
        'Ghi chú',
        '',
        '',
      ]
    : [
        'Bật',
        '#',
        'Tài khoản Meta Muse AI',
        'Proxy',
        'Trạng thái',
        'Ghi chú',
        '',
        '',
      ];

  for (const h of headers) {
    const th = el('th', '', h === '#' ? '' : h);
    if (h === '#') {
      const allChecked =
        rows.length > 0 && rows.every((r) => opts.selected.has(r.id));
      const someChecked =
        rows.some((r) => opts.selected.has(r.id)) && !allChecked;
      const chk = checkbox(
        allChecked,
        'Chọn / bỏ chọn tất cả tài khoản trong danh sách',
        (val) => opts.onSelectAll(val)
      );
      chk.indeterminate = someChecked;
      th.append(chk);
    }
    headRow.append(th);
  }

  const thead = el('thead');
  thead.append(headRow);
  table.append(thead);

  const tbody = el('tbody');
  const now = Date.now();

  rows.forEach((acc, idx) => {
    const status = effectiveStatus(acc, now);
    const tr = el('tr', status === 'off' ? 'stp-row--off' : '');

    const tdToggle = el('td', 'stp-c-keep');
    tdToggle.append(toggle(acc, opts.say));

    const tdNum = el('td', 'stp-dim stp-num');
    tdNum.append(
      checkbox(
        opts.selected.has(acc.id),
        'Chọn tài khoản này để thao tác hàng loạt',
        (val) => opts.onSelect(acc.id, val)
      ),
      el('span', '', String(idx + 1))
    );

    const tdLabel = el('td', 'stp-mono', acc.label);
    if (opts.busy.has(acc.id)) {
      const runBadge = el('span', 'stp-run');
      runBadge.append(el('i'), 'Đang chạy');
      tdLabel.append(runBadge);
    }

    const pxText = acc.proxyLabel || acc.proxy;
    const tdProxy = el(
      'td',
      pxText ? 'stp-mono stp-px' : 'stp-dim',
      pxText || 'Không proxy'
    );
    if (pxText) tdProxy.title = pxText;

    const tdStatus = el('td');
    tdStatus.append(badge(acc, status));

    const isBusy = opts.busy.has(acc.id);
    const isChecking = opts.checking.has(acc.id);

    const btnCheck = el(
      'button',
      'stp-btn stp-btn--sm',
      isChecking
        ? 'Đang xử lý…'
        : acc.type === 'muse' && acc.hasLogin
          ? 'Đăng nhập'
          : 'Đăng nhập / Kiểm tra'
    );
    btnCheck.type = 'button';
    btnCheck.disabled = isBusy || isChecking;
    btnCheck.title = isBusy
      ? 'Tài khoản đang chạy việc, đợi xong rồi hãy kiểm tra'
      : 'Đăng nhập hoặc kiểm tra phiên làm việc của tài khoản';
    btnCheck.onclick = () => opts.onCheck(acc);

    const actionWrap = el('div', 'stp-btns');
    actionWrap.append(btnCheck);

    if (isGoogle && typeof opts.onReadCredits === 'function') {
      const btnCredits = el('button', 'stp-btn stp-btn--sm', 'Đọc Credit');
      btnCredits.type = 'button';
      btnCredits.disabled = isBusy || isChecking;
      btnCredits.title = 'Kiểm tra số dư Credit trên Google Flow (Veo 3)';
      btnCredits.onclick = () => opts.onReadCredits(acc);
      actionWrap.append(btnCredits);
    }

    const btnReset = el('button', 'stp-btn stp-btn--sm', 'Đặt lại');
    btnReset.type = 'button';
    btnReset.disabled = isBusy || isChecking;
    btnReset.title = isBusy
      ? 'Tài khoản đang chạy việc, đợi xong rồi hãy đặt lại'
      : 'Đưa tài khoản về trạng thái Sẵn sàng ngay';
    btnReset.onclick = () => opts.onReset(acc);
    actionWrap.append(btnReset);

    const tdActions = el('td', 'stp-c-keep');
    tdActions.append(actionWrap);

    const btnDel = el('button', 'stp-del');
    btnDel.type = 'button';
    btnDel.disabled = isBusy || isChecking;
    btnDel.title =
      isBusy || isChecking
        ? 'Tài khoản đang chạy lệnh: đợi xong rồi gỡ'
        : 'Xoá tài khoản khỏi danh sách';
    btnDel.innerHTML = TRASH;
    btnDel.onclick = async () => {
      try {
        const res = await window.dola.accounts.remove(acc.id);
        if (res?.ok === false) {
          opts.say(
            res.note || 'Không gỡ được tài khoản ' + acc.label + '.',
            true
          );
        }
      } catch (err) {
        opts.say(
          'Không gỡ được tài khoản ' + acc.label + ': ' + errText(err),
          true
        );
      }
    };

    const tdDel = el('td', 'stp-c-keep');
    tdDel.append(btnDel);

    if (isGoogle) {
      tr.append(
        tdToggle,
        tdNum,
        tdLabel,
        creditsCell(acc),
        tdProxy,
        tdStatus,
        noteCell(acc, status),
        tdActions,
        tdDel
      );
    } else {
      tr.append(
        tdToggle,
        tdNum,
        tdLabel,
        tdProxy,
        tdStatus,
        noteCell(acc, status),
        tdActions,
        tdDel
      );
    }
    tbody.append(tr);
  });

  table.append(tbody);
  container.append(table);
}

export function tickCountdowns() {
  const now = Date.now();
  for (const node of document.querySelectorAll('[data-until]')) {
    node.textContent = countdown(Number(node.dataset.until) - now);
  }
}
