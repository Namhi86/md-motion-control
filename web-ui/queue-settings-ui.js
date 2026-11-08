import { closePop, el, openPop } from './pop.js';
import { withoutEleven } from './setup-eleven.js';
import { t } from './i18n.js';
import { overNote, overSuggestion, threadPicker } from './thread-picker.js';
import { DISTRIBUTION, STATUS_LABEL, distributionRow, effectiveStatus, machineNote, threadsText } from './ui-text.js';

// The queue settings in the composer, under duration and ratio, drawn like the Model / duration rows of MD Motion Control: thread count, how
// prompts are shared out between accounts, and the "show the Dola windows" switch. What the machine can run (free RAM, threads) is told in the
// thread-count popup.
// It only draws settings handed to paint() and reports a change as onPatch(patch); the caller talks to the main process.
const CHEV = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg class="cv-model-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 5 5 9-11"/></svg>';
const TYPE_LABEL = { facebook: 'Facebook', dola: 'Dola' };

// A settings row: the small label above, the value below, a chevron on the right (the look of the Model row).
function row(label) {
  const b = el('button', 'cv-frow qs-row');
  b.type = 'button';
  const text = el('span', 'cv-frow-text');
  const val = el('span', 'cv-frow-value');
  text.append(el('span', 'cv-frow-label', label), val);
  b.append(text);
  b.insertAdjacentHTML('beforeend', CHEV);
  b.lastChild.classList.add('cv-frow-chev');
  return { b, set: (value) => { val.textContent = value; } };
}

// One choice in a popover: name, a short explanation, a tick when it is the current one.
function choice(name, desc, on, onClick) {
  const b = el('button', `cv-model-item${on ? ' cv-model-item--on' : ''}`);
  b.type = 'button';
  const body = el('span', 'cv-model-body');
  body.append(el('span', 'cv-model-name', name));
  if (desc) body.append(el('span', 'qt-opt-desc', desc));
  b.append(body);
  if (on) b.insertAdjacentHTML('beforeend', CHECK);
  b.onclick = onClick;
  return b;
}

export function createSettingsUi({ onPatch }) {
  let s = null;
  let accounts = [];
  const node = el('div', 'qs-set');
  const grid = el('div', 'qs-grid');
  const workers = row(t('Số luồng'));
  const dist = row(t('Chia prompt cho tài khoản'));
  const acc = row(t('Chạy bằng acc'));
  grid.append(workers.b, dist.b);
  // "Hiện cửa sổ": off by default (the core decides); turn it on to watch a login and tick a captcha or consent by hand.
  // A change only applies to the windows opened afterwards.
  const show = el('label', 'qs-toggle');
  show.hidden = true;
  show.title = t('Mở cửa sổ của từng acc để bạn nhìn thấy (cần khi Facebook đòi captcha hoặc đồng ý). Chỉ áp cho cửa sổ mở sau đó, cửa sổ đang mở giữ nguyên.');
  const showBox = el('input', 'qs-check');
  showBox.type = 'checkbox';
  const text = el('span', 'qs-toggle-text');
  text.append(el('span', 'qs-toggle-name', t('Hiện cửa sổ')), el('span', 'qs-toggle-desc', t('Cần khi Facebook đòi captcha hoặc đồng ý')));
  const sw = el('span', 'qs-sw');
  sw.append(el('i'));
  show.append(text, showBox, sw);
  showBox.onchange = () => patch({ showWindows: showBox.checked });
  node.append(el('p', 'qs-title', t('Chạy hàng loạt')), grid, acc.b, show);

  const patch = (p) => {
    closePop();
    onPatch(p);
  };
  // The machine only suggests a number (machine.cap); a number picked or typed here is obeyed, with a warning when it is above the suggestion.
  workers.b.onclick = () => {
    if (!s) return;
    const cap = Number.isFinite(s.machine?.cap) ? Math.floor(s.machine.cap) : NaN;
    const picker = threadPicker({ el, current: s.workers, onPick: (n) => patch({ workers: n }) });
    const nodes = [
      el('p', 'cv-pop-head', t('Số luồng chạy cùng lúc')),
      choice(t('Tự động'), t('Theo số acc sẵn sàng và sức máy.'), s.workers === 0, () => patch({ workers: 0 })),
      picker.chips,
      picker.form,
    ];
    if (Number.isFinite(cap)) nodes.push(el('p', 'cv-pop-note cv-pop-note--machine', machineNote({ ...s.machine, cap }) || t('Máy này nên chạy khoảng {threads} (chỉ là gợi ý, bạn chọn số khác được).', { threads: threadsText(cap) })));
    if (overSuggestion(s.workers, cap)) nodes.push(el('p', 'cv-pop-note cv-pop-note--warn', overNote(s.workers, cap)));
    nodes.push(el('p', 'cv-pop-note', t('Mỗi luồng dùng một acc riêng.')));
    openPop(workers.b, nodes, 280);
  };

  // Switching the mode keeps the other numbers; "Chỉ định" starts on the first ready account so the choice is never blank.
  function pickMode(r) {
    const d = s.distribution || {};
    const next = { mode: r.mode, perAccount: r.perAccount || d.perAccount || 10, fixedAccountId: d.fixedAccountId || '' };
    if (r.mode === 'fixed' && !accounts.some((a) => a.id === next.fixedAccountId)) {
      next.fixedAccountId = (accounts.find((a) => effectiveStatus(a) === 'ready') || accounts[0])?.id || '';
    }
    patch({ distribution: next });
  }
  dist.b.onclick = () => {
    if (!s) return;
    const now = distributionRow(s.distribution).key;
    const rows = DISTRIBUTION.map((r) => choice(r.label, r.desc, r.key === now, () => pickMode(r)));
    openPop(dist.b, [el('p', 'cv-pop-head', t('Cách chia prompt cho tài khoản')), ...rows], 340);
  };

  acc.b.onclick = () => {
    if (!s) return;
    const d = s.distribution || {};
    const rows = accounts.map((a) => choice(a.label, `${TYPE_LABEL[a.type] || a.type} · ${STATUS_LABEL[effectiveStatus(a)] || a.status}`, a.id === d.fixedAccountId, () => patch({ distribution: { ...d, fixedAccountId: a.id } })));
    if (!rows.length) rows.push(el('p', 'cv-pop-note', t('Chưa có tài khoản nào. Thêm cookie ở "Setup tài khoản".')));
    openPop(acc.b, [el('p', 'cv-pop-head', t('Chỉ chạy bằng tài khoản nào?')), ...rows], 320);
  };

  function paint() {
    if (!s) return;
    workers.set(s.workers > 0 ? String(s.workers) : t('Tự động'));
    workers.b.classList.toggle('qs-row--warn', overSuggestion(s.workers, s.machine?.cap)); // a number above what the machine suggests: a warning, not a block
    dist.set(distributionRow(s.distribution).label);
    const fixed = s.distribution?.mode === 'fixed';
    acc.b.hidden = !fixed;
    const chosen = accounts.find((a) => a.id === s.distribution?.fixedAccountId);
    acc.set(chosen ? chosen.label : t('Chọn tài khoản…'));
    acc.b.classList.toggle('qs-row--warn', fixed && !chosen);
    // Drawn only for a person the core allows to watch these windows (owner decision 2026-10-19: everybody else never sees the box and those windows stay hidden).
    // An older core sends no `windowsAllowed`, so the row is not drawn either; only an exact true draws it. No hidden row leaves a gap (hidden = display none).
    // Luôn ẩn nút "Hiện cửa sổ" theo yêu cầu: chỉ khi bấm Đăng nhập mới hiện trình duyệt, còn khi chạy tạo video thì ẩn toàn bộ
    show.hidden = true;
    showBox.checked = false;
  }

  return {
    node,
    paint(next) {
      s = next;
      paint();
    },
    setAccounts(list) {
      accounts = withoutEleven(list); // an ElevenLabs account cannot make a video: it is never offered as "the account to run on"
      paint();
    },
  };
}
