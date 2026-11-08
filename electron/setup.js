// Giao diện Setup Tài Khoản chuyên biệt cho Google Flow (Veo 3) & Meta Muse AI
import { el } from './pop.js';
import { onProxySummary, proxySummary } from './proxy-ui.js';
import { renderTable, tickCountdowns } from './setup-table.js';
import {
  browserSetNote,
  browserSwitchView,
  DESC as BROWSER_DESC,
  TITLE as BROWSER_TITLE,
} from './browser-switch-text.js';
import { effectiveStatus, errText } from './ui-text.js';

const $ = (id) => document.getElementById(id);

const TYPES = {
  veo: {
    label: 'Google Flow · Veo 3 (email|pass|2fa)',
    desc: 'Dán email|mật khẩu|khoá 2FA, app tự mở Chrome đăng nhập Google Flow (Omni 1.1 Flash) để sao chép chuyển động Video-to-Video chuẩn gốc.',
    hint: 'Mỗi dòng một tài khoản: email|mật khẩu|khoá 2FA (khoá 2FA có thể bỏ trống nếu không bật 2FA). Dán thẳng dòng tab từ bảng tính cũng được. Nên nhập proxy trước nếu dùng nhiều tài khoản.',
    holder: 'ten@gmail.com|matkhau|KHOA2FA',
    kind: 'google',
  },
  muse_login: {
    label: 'Meta Muse AI · Email (email|pass|2fa)',
    desc: 'Dán email|mật khẩu|khoá 2FA, app tự động đăng nhập tài khoản Meta Muse AI để chạy Motion Control nối cảnh & khớp khẩu hình tiếng Việt miễn phí 0đ.',
    hint: 'Mỗi dòng một tài khoản Meta Muse AI: email|mật khẩu|khoá 2FA (hoặc email|mật khẩu).',
    holder: 'ten@gmail.com|matkhau|KHOA2FA',
    kind: 'muse',
  },
  muse_cookie: {
    label: 'Meta Muse AI · Cookie',
    desc: 'Dán trực tiếp Cookie phiên đăng nhập từ muse.ai (hoặc JSON cookie). App tự động kiểm tra phiên và dùng ngay không cần đăng nhập lại.',
    hint: 'Mỗi dòng một chuỗi cookie (key=value; ...) hoặc dán mảng JSON cookie xuất từ trình duyệt.',
    holder: 'datr=…; fr=…; c_user=…; xs=…',
    kind: 'muse',
  },
};

const KINDS = [
  ['google', 'Tài khoản Google Flow (Veo 3)'],
  ['muse', 'Tài khoản Meta Muse AI'],
];

let view = [];
let type = 'veo';
let section = 'accounts';
const running = new Map();
const selected = new Set();
let bulkBusy = false;
const checking = new Set();
let busySig = '';
let shownReady = -1;

const isSupportedAccount = (acc) =>
  acc.type === 'google' || acc.type === 'muse';
const isReadyNow = (acc) =>
  isSupportedAccount(acc) && effectiveStatus(acc) === 'ready';
const listType = () => TYPES[type]?.kind || 'google';

const belongs = (acc, typeKey) => {
  if (typeKey === 'veo') return acc.type === 'google';
  if (typeKey === 'muse_login') return acc.type === 'muse' && !!acc.hasLogin;
  if (typeKey === 'muse_cookie') return acc.type === 'muse' && !acc.hasLogin;
  return false;
};

const countReadyByType = (typeKey) =>
  view.filter((acc) => belongs(acc, typeKey) && isReadyNow(acc)).length;

export function readyCount() {
  return view.filter(isReadyNow).length;
}

function say(msg, isBad = false) {
  const node = $('su-msg');
  if (!node) return;
  node.textContent = msg;
  node.classList.toggle('stp-msg--bad', isBad);
}

const tableMsg = el('p', 'stp-msg stp-msg--row');
tableMsg.hidden = true;
$('su-table')?.before(tableMsg);

function sayRow(msg, isBad = false) {
  tableMsg.textContent = msg;
  tableMsg.classList.toggle('stp-msg--bad', isBad);
  tableMsg.hidden = !msg;
}

function paintSection() {
  const isProxy = section === 'proxy';
  $('su-types').hidden = isProxy;
  $('su-accounts').hidden = isProxy;
  $('mount-proxies').hidden = !isProxy;
  $('su-tab-accounts').classList.toggle('su-tab--on', !isProxy);
  $('su-tab-proxy').classList.toggle('su-tab--on', isProxy);
  const summary = proxySummary();
  $('su-tab-proxy-n').textContent = summary.total
    ? `${summary.alive}/${summary.total}`
    : '';
}

$('su-tab-accounts').onclick = () => {
  section = 'accounts';
  paintSection();
};
$('su-tab-proxy').onclick = () => {
  section = 'proxy';
  paintSection();
};

function paintTypes() {
  const container = $('su-types');
  container.replaceChildren();
  for (const [key, cfg] of Object.entries(TYPES)) {
    const btn = el('button', 'su-type' + (key === type ? ' su-type--on' : ''));
    btn.type = 'button';
    const nameEl = el('span', 'su-type-name', cfg.label);
    const countEl = el('span', 'su-type-count');
    const totalOfType = view.filter((acc) => belongs(acc, key)).length;
    countEl.append(
      el('b', '', String(countReadyByType(key))),
      ` / ${totalOfType} acc sẵn sàng`
    );
    btn.append(nameEl, el('span', 'su-type-desc', cfg.desc), countEl);
    btn.onclick = () => {
      type = key;
      paintAll();
      say('');
      sayRow('');
    };
    container.append(btn);
  }
}

function paintForm() {
  const cfg = TYPES[type] || TYPES.veo;
  $('su-form-title').textContent = cfg.label;
  $('su-cookies').placeholder =
    `Dán thông tin tài khoản (${cfg.label}), mỗi dòng một acc:\n` + cfg.holder;
  $('su-hint').textContent = cfg.hint;
}

async function checkOne(acc) {
  checking.add(acc.id);
  paintTable();
  try {
    if (acc.type === 'muse' && acc.hasLogin && window.dola.muse?.login) {
      return (await window.dola.muse.login(acc.id)) || { ok: false };
    }
    return (await window.dola.queue.checkAccount(acc.id)) || { ok: false };
  } catch (err) {
    return {
      ok: false,
      note: 'Không kiểm tra được tài khoản ' + acc.label + ': ' + errText(err),
    };
  } finally {
    checking.delete(acc.id);
    paintTable();
  }
}

async function checkAccount(acc) {
  sayRow(
    `Đang đăng nhập / kiểm tra tài khoản ${acc.label}… (vui lòng đợi cửa sổ Chrome/phiên xử lý)`
  );
  const res = await checkOne(acc);
  if (res?.ok === false) {
    sayRow(
      res.note || 'Không kiểm tra được tài khoản ' + acc.label + '.',
      true
    );
  } else {
    sayRow(
      'Đã kiểm tra / kích hoạt đăng nhập tài khoản ' +
        acc.label +
        '. Xem cột Trạng thái và Ghi chú.'
    );
  }
}

async function readAccountCredits(acc) {
  if (typeof window.dola.queue?.readCredits !== 'function') return;
  checking.add(acc.id);
  paintTable();
  sayRow(`Đang đọc số dư Credit Google Flow của ${acc.label}…`);
  try {
    const res = await window.dola.queue.readCredits(acc.id);
    if (res?.ok) {
      sayRow(
        `Tài khoản ${acc.label} hiện có ${Number(res.left || 0).toLocaleString('vi-VN')} credit trên Google Flow.`
      );
    } else {
      sayRow(
        res?.note || `Không đọc được credit của tài khoản ${acc.label}.`,
        true
      );
    }
  } catch (err) {
    sayRow(`Lỗi khi đọc credit ${acc.label}: ${errText(err)}`, true);
  } finally {
    checking.delete(acc.id);
    paintTable();
  }
}

async function resetAccounts(list) {
  let failed = 0;
  for (const acc of list) {
    try {
      const res = await window.dola.queue.resetAccount(acc.id);
      if (res?.ok === false) {
        failed += 1;
        sayRow(
          res.note || 'Không đặt lại được tài khoản ' + acc.label + '.',
          true
        );
      }
    } catch (err) {
      failed += 1;
      sayRow(
        'Không đặt lại được tài khoản ' + acc.label + ': ' + errText(err),
        true
      );
    }
  }
  if (!failed && list.length) {
    sayRow(
      list.length === 1
        ? `Đã đặt lại tài khoản ${list[0].label}: sẵn sàng.`
        : `Đã đặt lại ${list.length} tài khoản: sẵn sàng.`
    );
  }
}

function paintKinds() {
  const container = $('su-kinds');
  container.replaceChildren();
  const activeKind = listType();
  for (const [kindKey, label] of KINDS) {
    const total = view.filter((acc) => acc.type === kindKey).length;
    const btn = el(
      'button',
      'stp-btn stp-btn--sm stp-kind' +
        (kindKey === activeKind ? ' stp-btn--on' : '')
    );
    btn.type = 'button';
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', String(kindKey === activeKind));
    btn.append(label, el('i', 'stp-kind-n', String(total)));
    btn.onclick = () => {
      if (kindKey === 'google') {
        type = 'veo';
      } else if (type !== 'muse_login' && type !== 'muse_cookie') {
        type = 'muse_login';
      }
      paintAll();
      say('');
      sayRow('');
    };
    container.append(btn);
  }
}

function resetAllButton() {
  let btn = $('su-reset-all');
  if (!btn) {
    btn = el('button', 'stp-btn stp-btn--sm', 'Đặt lại tất cả');
    btn.id = 'su-reset-all';
    btn.type = 'button';
    btn.title =
      'Đưa mọi tài khoản của danh sách này (trừ tài khoản đang chạy việc) về Sẵn sàng ngay';
    $('su-table-count').before(btn);
  }
  btn.onclick = () =>
    resetAccounts(
      view.filter(
        (acc) =>
          acc.type === listType() &&
          !new Set(running.values()).has(acc.id)
      )
    );
  return btn;
}

const bulkBar = el('div', 'stp-bulk');
bulkBar.hidden = true;
$('su-table').before(bulkBar);

const chosenRows = () =>
  view.filter((acc) => acc.type === listType() && selected.has(acc.id));
const idle = (acc) =>
  !new Set(running.values()).has(acc.id) && !checking.has(acc.id);

async function bulk(fn) {
  if (bulkBusy) return;
  bulkBusy = true;
  paintBulk();
  try {
    await fn();
  } finally {
    bulkBusy = false;
    paintBulk();
  }
}

async function bulkLogin() {
  const targets = chosenRows().filter(idle);
  const skipped = chosenRows().length - targets.length;
  if (!targets.length) {
    return sayRow(
      'Các tài khoản đã chọn đang chạy việc: đợi xong rồi hãy đăng nhập.',
      true
    );
  }
  let okCount = 0;
  let errCount = 0;
  for (const [idx, acc] of targets.entries()) {
    sayRow(
      `Đang đăng nhập / kiểm tra tài khoản ${idx + 1}/${targets.length}: ${acc.label}…`
    );
    const res = await checkOne(acc);
    if (res?.ok === false) errCount += 1;
    else okCount += 1;
  }
  sayRow(
    `Đăng nhập xong ${targets.length} acc: ${okCount} thành công, ${errCount} lỗi` +
      (skipped ? `, bỏ qua ${skipped} acc đang bận` : '') +
      '. Xem cột Trạng thái.',
    errCount > 0
  );
}

async function bulkDelete() {
  const ids = chosenRows().map((acc) => acc.id);
  try {
    const res = await window.dola.accounts.removeMany(ids);
    if (res?.ok === false) {
      return sayRow(res.note || 'Không xoá được các tài khoản đã chọn.', true);
    }
    for (const id of ids) selected.delete(id);
    sayRow(
      `Đã xoá ${res.removed} acc` +
        (res.skipped ? `, giữ lại ${res.skipped} acc đang bận` : '') +
        '.',
      false
    );
  } catch (err) {
    sayRow('Không xoá được: ' + errText(err), true);
  }
}

async function bulkProxy() {
  const rows = chosenRows();
  try {
    const res = await window.dola.proxies.reassign(rows.map((r) => r.id));
    if (res?.ok === false) return sayRow('Không đổi được proxy.', true);
    const parts = [`Đã đổi proxy cho ${res.changed} acc`];
    if (res.shared) parts.push(`${res.shared} acc dùng chung proxy`);
    if (res.skippedBusy) parts.push(`bỏ qua ${res.skippedBusy} acc đang bận`);
    if (res.kept) parts.push(`${res.kept} acc không còn proxy khác để đổi`);
    sayRow(parts.join('; ') + '.', res.changed === 0);
  } catch (err) {
    sayRow('Không đổi được proxy: ' + errText(err), true);
  }
}

function paintBulk() {
  const chosen = chosenRows();
  bulkBar.hidden = !chosen.length;
  bulkBar.replaceChildren();
  if (!chosen.length) return;

  const makeBtn = (label, cls, onClick, title) => {
    const b = el('button', ('stp-btn stp-btn--sm ' + cls).trim(), label);
    b.type = 'button';
    b.disabled = bulkBusy;
    b.title = title;
    b.onclick = onClick;
    return b;
  };

  const info = el('span');
  info.append('Đã chọn ', el('b', '', String(chosen.length)), ' acc');
  bulkBar.append(
    info,
    makeBtn(
      'Đăng nhập / Kiểm tra',
      '',
      () => bulk(bulkLogin),
      'Đăng nhập và kiểm tra lần lượt từng tài khoản đã chọn'
    ),
    makeBtn(
      'Đặt lại',
      '',
      () => bulk(() => resetAccounts(chosen.filter(idle))),
      'Đưa các tài khoản đã chọn về Sẵn sàng ngay'
    ),
    ...(window.dola.proxies?.reassign
      ? [
          makeBtn(
            'Đổi proxy',
            '',
            () => bulk(bulkProxy),
            'Chuyển các tài khoản đã chọn sang proxy khác trong kho'
          ),
        ]
      : []),
    makeBtn(
      'Xoá',
      'stp-btn--danger',
      () => bulk(bulkDelete),
      'Xoá các tài khoản đã chọn khỏi danh sách'
    ),
    makeBtn(
      'Bỏ chọn',
      '',
      () => {
        selected.clear();
        paintTable();
      },
      'Bỏ chọn tất cả'
    )
  );
}

function paintTable() {
  const activeKind = listType();
  const rows = view.filter((acc) => acc.type === activeKind);
  for (const id of [...selected]) {
    if (!rows.some((r) => r.id === id)) selected.delete(id);
  }
  paintBulk();
  paintKinds();
  $('su-table-count').textContent = `${rows.length} acc`;
  resetAllButton().hidden = !rows.length;

  const container = $('su-table');
  container.replaceChildren();
  if (!rows.length) {
    const emptyLabel =
      activeKind === 'google'
        ? 'Google Flow (Veo 3) email|pass|2fa'
        : 'Meta Muse AI (email|pass|2fa hoặc Cookie)';
    container.append(
      el(
        'div',
        'stp-empty-block',
        `Chưa có tài khoản ${emptyLabel} nào. Dán thông tin ở khung trên rồi bấm "Thêm vào danh sách".`
      )
    );
    return;
  }

  renderTable(container, rows, {
    type: activeKind,
    busy: new Set(running.values()),
    checking,
    say: sayRow,
    onCheck: checkAccount,
    onReadCredits: readAccountCredits,
    onReset: (acc) => resetAccounts([acc]),
    selected,
    onSelect: (id, checked) => {
      if (checked) selected.add(id);
      else selected.delete(id);
      paintTable();
    },
    onSelectAll: (checked) => {
      for (const r of rows) {
        if (checked) selected.add(r.id);
        else selected.delete(r.id);
      }
      paintTable();
    },
  });
}

function paintAll() {
  const rCount = readyCount();
  shownReady = rCount;
  $('nav-badge').textContent = String(rCount);
  $('nav-badge').classList.toggle('nav-badge--zero', rCount === 0);
  paintSection();
  paintTypes();
  paintForm();
  paintTable();
}

export function setView(nextList) {
  view = Array.isArray(nextList) ? nextList.filter(isSupportedAccount) : [];
  paintAll();
}

function trackTasks(tasks) {
  for (const t of tasks || []) {
    if (t.status === 'running' && t.accountId) {
      running.set(t.id, t.accountId);
    } else {
      running.delete(t.id);
    }
  }
  const sig = [...new Set(running.values())].sort().join(',');
  if (sig === busySig) return;
  busySig = sig;
  paintTable();
}

function addMessage(res) {
  const parts = [];
  if (res?.added) parts.push(`thêm mới ${res.added}`);
  if (res?.updated) parts.push(`cập nhật ${res.updated}`);
  if (res?.duplicates) parts.push(`trùng ${res.duplicates}`);
  if (res?.expired) parts.push(`${res.expired} cookie hết hạn`);
  if (res?.invalid) parts.push(`bỏ qua ${res.invalid} dòng không hợp lệ`);
  return parts.join(', ') || 'Không có dòng hợp lệ nào để thêm';
}

$('su-add').onclick = async () => {
  const raw = $('su-cookies').value;
  if (!raw.trim()) {
    return say('Chưa dán thông tin tài khoản vào ô nhập.', true);
  }

  let res;
  try {
    if (type === 'veo') {
      res = await window.dola.accounts.addGoogle(raw, 'veo');
    } else if (type === 'muse_login') {
      res = await window.dola.muse.add(raw);
    } else if (type === 'muse_cookie') {
      say('Đang kiểm tra phiên Cookie Meta Muse AI…');
      res = await window.dola.muse.addCookie(raw);
    }
  } catch (err) {
    return say('Lỗi khi thêm tài khoản: ' + errText(err), true);
  }

  if (res?.ok === false && res?.note) {
    return say(res.note, true);
  }

  const hasAdded = Boolean(res?.added || res?.updated);
  const extraNote =
    type === 'veo' && hasAdded
      ? ' App đang tự động mở Chrome đăng nhập Google Flow (xem cột Trạng thái).'
      : type === 'muse_login' && hasAdded
        ? ' App đang tự động đăng nhập Meta Muse AI (xem cột Trạng thái).'
        : '';

  say('Đã xử lý: ' + addMessage(res) + '.' + extraNote, !hasAdded);
  if (hasAdded) {
    $('su-cookies').value = '';
  }
};

onProxySummary(paintSection);
window.dola.accounts.onChange(setView);
window.dola.queue.onChange(trackTasks);

setInterval(() => {
  tickCountdowns();
  if (readyCount() !== shownReady) paintAll();
}, 1000);

export async function initSetup() {
  setView(await window.dola.accounts.list());
  const firstWithAccounts = Object.keys(TYPES).find((k) =>
    view.some((acc) => belongs(acc, k))
  );
  if (firstWithAccounts && firstWithAccounts !== type) {
    type = firstWithAccounts;
    paintAll();
  }

  const showBox = $('su-show-box');
  try {
    const settings = await window.dola.queue.settings();
    showBox.checked =
      (typeof settings?.loginWindows === 'boolean'
        ? settings.loginWindows
        : settings?.showWindows) === true;
  } catch {
    // Bỏ qua lỗi đọc cài đặt
  }

  showBox.onchange = async () => {
    try {
      await window.dola.queue.setSettings({
        loginWindows: showBox.checked,
        showWindows: showBox.checked,
      });
    } catch (err) {
      showBox.checked = !showBox.checked;
      sayRow('Không đổi được cài đặt hiện cửa sổ: ' + errText(err), true);
    }
  };

  try {
    trackTasks(await window.dola.queue.list());
  } catch {
    // Bỏ qua
  }
  await initBrowserSwitch();
}

async function initBrowserSwitch() {
  const browserApi = window.dola.browser;
  const labelEl = $('su-browser');
  if (
    typeof browserApi?.get !== 'function' ||
    typeof browserApi?.set !== 'function'
  ) {
    return;
  }
  const checkEl = $('su-browser-box');
  const hintEl = $('su-browser-hint');
  $('su-browser-name').textContent = BROWSER_TITLE;
  $('su-browser-desc').textContent = BROWSER_DESC;

  const applyView = (state) => {
    const v = browserSwitchView(state);
    checkEl.checked = v.checked;
    checkEl.disabled = v.disabled;
    labelEl.classList.toggle('qs-toggle--disabled', v.disabled);
    hintEl.textContent = v.hint;
    hintEl.classList.toggle('stp-msg--bad', v.bad);
    hintEl.hidden = !v.hint;
  };

  const refresh = async () => {
    try {
      applyView(await browserApi.get());
      labelEl.hidden = false;
    } catch {
      // Bỏ qua
    }
  };

  checkEl.onchange = async () => {
    const targetMode = checkEl.checked ? 'chrome' : 'electron';
    try {
      const res = await browserApi.set(targetMode);
      sayRow(browserSetNote(res), res?.ok !== true);
    } catch (err) {
      sayRow('Không đổi được chế độ cửa sổ: ' + errText(err), true);
    }
    await refresh();
  };

  window.dola.queue.onChange(() => {
    refresh();
  });
  await refresh();
}
