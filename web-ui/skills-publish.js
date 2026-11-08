import { button } from './analyze-controls.js';
import { el } from './pop.js';
import { mountSamplePicker } from './skills-sample-picker.js';
import { createPublishFlow } from './skills-publish-flow.js';
import { BODY_MAX, BODY_MAX_SYSTEM, MAX_SAMPLES } from './shared/skill-store-form.js';
import { errText } from './ui-text.js';
import { t, tn } from './i18n.js';

// "Đăng skill": the button of the Kho skill tab and its window. The person gives a title, a short description, the modes (Pro / Muse), the text of
// the skill (typed here, or an .md picked with the app's dialog: the file stays in the core) and 1-3 sample videos. The core makes the skill, uploads
// the samples one after the other and answers { ok, id, samples: { sent, failed: [{ index, error }] } }; its events tell how far it is
// (phase 'create' | 'upload' | 'done'). What each answer means (a failed sample keeps the skill and is sent again alone, never a second skill) is in
// skills-publish-flow.js; this file draws the form and the line of progress. A skill with no sample at all stays a draft that nobody sees; the window says so.
// Admin only: the "Skill hệ thống" tick and the Muse version of the text (both limited to what Muse can take with the rule line in front).
// Everything is typed text and textContent, never markup. -> { node, open(prefill?) }   onDone(): the list must be read again
// open(prefill) fills the window in ("Tách skill" posts the skill it made): { title, description, body, bodyMuse, modes: ['pro'], note, samples: [{ taskId, label? }] }; every key is optional.
// note: a plain line shown under the modes while the skill is NOT a system one (the Kho keeps one body for a community skill).
const MODES = [['pro', 'Seedance Pro'], ['muse', 'Muse']];
const MODE_HINT = { pro: t('Cần acc Dola có Pro'), muse: t('Cần acc Muse') };
const field = (label, ...nodes) => { const row = el('div', 'sk-field'); row.append(el('span', 'sk-field-label', label), ...nodes); return row; };

export function mountPublish({ dola = window.dola, isAdmin = () => false, onDone = () => {} }) {
  const api = dola.skills;
  const node = Object.assign(button(t('Đăng skill'), 'an-btn an-btn--main sk-publish', () => open()), { hidden: typeof api?.publish !== 'function' });
  let current = null; // the open window { back, close }

  function open(prefill) {
    if (current) return;
    const admin = isAdmin() === true; // asked when the window opens: the "Skill hệ thống" tick is for the admin only
    const opener = document.activeElement;
    let busy = false;
    const flow = createPublishFlow({ api });

    const back = el('div', 'el-modal-back');
    const box = el('div', 'el-modal sk-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', t('Đăng skill'));
    const closeBtn = Object.assign(button('✕', 'el-x', () => { if (!busy) close(); }), { title: t('Đóng') });
    closeBtn.setAttribute('aria-label', t('Đóng'));
    const head = el('div', 'el-modal-head');
    head.append(el('h2', 'el-modal-title', t('Đăng skill')), closeBtn);

    const title = Object.assign(el('input', 'el-input'), { type: 'text', maxLength: 80, placeholder: t('Tiêu đề (3–80 ký tự)') });
    title.setAttribute('aria-label', t('Tiêu đề'));
    const desc = Object.assign(el('textarea', 'el-input sk-desc-in'), { maxLength: 300, placeholder: t('Mô tả ngắn: skill này làm ra kiểu video nào (tối đa 300 ký tự)') });
    desc.setAttribute('aria-label', t('Mô tả'));
    const modeBoxes = MODES.map(([id, label]) => {
      const input = Object.assign(el('input', 'sk-check'), { type: 'checkbox', checked: id === 'pro' });
      const lab = el('label', 'sk-mode-opt');
      lab.append(input, el('span', '', label), el('em', 'sk-mode-hint', MODE_HINT[id]));
      return { id, input, lab };
    });
    const modesRow = el('div', 'sk-modes-in');
    modesRow.append(...modeBoxes.map((m) => m.lab));
    const modesNote = Object.assign(el('p', 'sk-hint'), { hidden: true });
    const body = Object.assign(el('textarea', 'el-input sk-body-in'), { placeholder: t('Dán nội dung skill vào đây (tối thiểu 50 ký tự)') });
    body.setAttribute('aria-label', t('Nội dung skill'));
    const count = el('span', 'el-count');
    const bodyHint = el('p', 'sk-hint', t('Skill của bạn hiện công khai ngay, ghi là chưa kiểm duyệt; admin có thể đọc và gỡ.'));
    let bodyHandle = '';
    const fileBtn = button(t('Chọn tệp .md'), 'an-btn an-btn--sm', async () => {
      say('');
      try {
        const f = await dola.pickSkill();
        if (f?.handle) { bodyHandle = f.handle; body.value = ''; paint(); }
      } catch (err) {
        say(t('Không chọn được tệp: {reason}', { reason: errText(err) }));
      }
    });
    fileBtn.hidden = typeof dola.pickSkill !== 'function';
    const fileChip = Object.assign(el('span', 'sk-file'), { hidden: true });
    const dropFile = Object.assign(button('✕', 'sk-chip-x', () => { bodyHandle = ''; paint(); }), { title: t('Bỏ tệp') });
    dropFile.setAttribute('aria-label', t('Bỏ tệp'));
    fileChip.append(el('span', '', t('Đã chọn tệp .md')), dropFile);

    const sysBox = Object.assign(el('input', 'sk-check'), { type: 'checkbox' });
    const sysRow = el('label', 'sk-mode-opt sk-sys');
    sysRow.append(sysBox, el('span', '', t('Skill hệ thống (của MD Motion Control, đã kiểm duyệt)')));
    sysRow.hidden = !admin;
    const museBody = Object.assign(el('textarea', 'el-input sk-body-in'), { placeholder: t('Bản cho Muse (tuỳ chọn, tối đa {max} ký tự)', { max: BODY_MAX_SYSTEM }) });
    museBody.setAttribute('aria-label', t('Bản cho Muse'));
    const museRow = field(t('Bản cho Muse'), museBody);
    museRow.hidden = true;

    const cancel = button(t('Huỷ'), 'el-btn', () => { if (!busy) close(); });
    const send = button(t('Đăng'), 'el-btn el-btn--main', () => submit());
    const samples = mountSamplePicker({ dola, max: MAX_SAMPLES, onChange: () => paint() }); // (paint() reads send and cancel: they come first)
    const progress = Object.assign(el('p', 'sk-progress'), { hidden: true });
    progress.setAttribute('role', 'status');
    const err = el('p', 'el-err');
    err.setAttribute('role', 'alert');
    const foot = el('div', 'el-modal-foot');
    foot.append(err, cancel, send);

    const left = el('div', 'el-col');
    left.append(field(t('Tiêu đề'), title), field(t('Mô tả'), desc), field(t('Chế độ'), modesRow, modesNote), sysRow);
    const fileRow = el('div', 'sk-file-row');
    fileRow.append(fileBtn, fileChip);
    const bodyRow = field(t('Nội dung skill'), body, count, fileRow, bodyHint);
    left.append(bodyRow, museRow);
    const right = el('div', 'el-col');
    right.append(field(t('Video mẫu (1–{max})', { max: MAX_SAMPLES }), samples.node), progress);
    const grid = el('div', 'el-modal-body');
    grid.append(left, right);
    box.append(head, grid, foot);
    back.append(box);

    const input = () => ({
      title: title.value, description: desc.value, modes: modeBoxes.filter((m) => m.input.checked).map((m) => m.id),
      body: body.value, bodyHandle, bodyMuse: museBody.value, system: sysBox.checked, admin, samples: samples.get(),
    });
    const say = (text) => { err.textContent = text || ''; };
    function paint() {
      const system = admin && sysBox.checked;
      museRow.hidden = !system; // red team #15: only a system skill has a Muse version
      modesNote.hidden = !modesNote.textContent || system;
      const max = system ? BODY_MAX_SYSTEM : BODY_MAX;
      count.textContent = bodyHandle ? '' : `${body.value.length}/${max}`;
      count.classList.toggle('el-count--bad', body.value.length > max);
      fileChip.hidden = !bodyHandle;
      body.disabled = !!bodyHandle || busy;
      for (const x of [title, desc, museBody, sysBox, ...modeBoxes.map((m) => m.input)]) x.disabled = busy || flow.made;
      send.disabled = busy;
      cancel.disabled = busy;
    }
    const writeProgress = (text) => { progress.textContent = text || ''; progress.hidden = !text; };

    // The core's events (when it has them): which step it is on. Without them the line only says it is working.
    const stopEvents = api.onPublish?.((ev) => {
      if (ev?.phase === 'create') writeProgress(t('Đang tạo skill…'));
      else if (ev?.phase === 'upload') writeProgress(t('Đang tải video {i}/{total}…', { i: Number(ev.index) + 1, total: uploading }));
      else if (ev?.phase === 'done') writeProgress(t('Xong.'));
    });

    let uploading = 0; // how many samples the call in flight sends (for "video 1/2")
    async function submit() {
      if (busy) return;
      say('');
      busy = true;
      samples.lock(true);
      paint();
      writeProgress(flow.made ? t('Đang tải lại video mẫu bị lỗi…') : t('Đang tạo skill…'));
      uploading = flow.made ? 0 : samples.count();
      const out = await flow.run(input());
      busy = false;
      samples.lock(false);
      if (out.kind === 'invalid' || out.kind === 'refused') { // nothing was made, or nothing was added: the form stays as it is
        writeProgress(flow.made ? progress.textContent : '');
        say(out.error);
        paint();
        send.hidden = flow.made && !out.retry;
        return;
      }
      if (out.kind === 'partial') {
        paint();
        writeProgress(out.progress);
        say(out.error);
        send.textContent = t('Thử lại video lỗi');
        send.hidden = !out.retry;
        onDone();
        return;
      }
      paint();
      writeProgress(out.progress);
      onDone();
      setTimeout(close, 900)?.unref?.(); // (a test's process must not wait for it)
    }

    function onKey(ev) {
      if (ev.key === 'Tab') { // the window is modal: Tab stays inside it (the same rule as the element window)
        const items = [...box.querySelectorAll('button, input, textarea')].filter((n) => !n.disabled && n.offsetParent !== null);
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const outside = !box.contains(document.activeElement);
        if (ev.shiftKey && (document.activeElement === first || outside)) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && (document.activeElement === last || outside)) { ev.preventDefault(); first.focus(); }
        return;
      }
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      if (!busy) close();
    }
    function close() {
      stopEvents?.();
      document.removeEventListener('keydown', onKey, true);
      back.remove();
      current = null;
      if (opener?.isConnected) opener.focus();
    }
    const pre = prefill && typeof prefill === 'object' ? prefill : {};
    const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
    if (pre.title !== undefined) title.value = text(pre.title, 80);
    if (pre.description !== undefined) desc.value = text(pre.description, 300);
    if (Array.isArray(pre.modes) && pre.modes.length) for (const m of modeBoxes) m.input.checked = pre.modes.includes(m.id);
    if (typeof pre.body === 'string') body.value = pre.body; // never cut: the counter turns red and the check says it is too long
    if (typeof pre.bodyMuse === 'string') museBody.value = pre.bodyMuse; // (the Muse box is shown by an admin's "Skill hệ thống" tick only)
    if (typeof pre.note === 'string') modesNote.textContent = pre.note.slice(0, 300);
    if (Array.isArray(pre.samples) && pre.samples.length) samples.preset(pre.samples);
    for (const x of [body, museBody]) x.addEventListener('input', paint);
    sysBox.addEventListener('change', paint);
    back.addEventListener('mousedown', (ev) => { if (ev.target === back && !busy) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(back);
    current = { back, close };
    paint();
    title.focus();
  }

  return { node, open };
}
