import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { el } from './pop.js';
import { CATEGORIES, MAX_DESC, MAX_NAME, uniqueHandle } from './shared/elements.js';
import { mediaUrl } from './shared/media-handles.js';
import { openBulkModal } from './elements-bulk.js';
import { canDrop, watchDrop } from './elements-drop.js';
import { categoryLabel, thumbUrl } from './elements-pool.js';
import { pickOneHandle } from './library-entry.js';

// The "Phần tử mới" / "Sửa phần tử" window: name, description, category on the left, the picture on the right (picked with the native
// dialog of the app: the window only ever holds a handle, never a path). Creating also ticks the new element in the pool.
let current = null;
export const isElementModalOpen = () => current !== null;

const field = (cls, tag) => Object.assign(el(tag, cls), tag === 'input' ? { type: 'text' } : {});

// element: null = a new one. onDone(element) runs after a save.
export function openElementModal({ dola, pool, element = null, onDone = () => {} }) {
  if (current) current.close();
  const editing = !!element;
  let image = ''; // the handle of a newly picked picture ('' = none picked now)
  const opener = document.activeElement; // the focus goes back there when the window closes
  let busy = false;

  const back = el('div', 'el-modal-back');
  const box = el('div', 'el-modal');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', editing ? t('Sửa phần tử') : t('Phần tử mới'));

  const head = el('div', 'el-modal-head');
  const closeBtn = Object.assign(el('button', 'el-x'), { type: 'button', title: t('Đóng') });
  closeBtn.setAttribute('aria-label', t('Đóng'));
  closeBtn.textContent = '✕';
  head.append(el('h2', 'el-modal-title', editing ? t('Sửa phần tử') : t('Phần tử mới')), closeBtn);

  const name = field('el-input', 'input');
  Object.assign(name, { placeholder: t('Nhập tên'), maxLength: MAX_NAME, value: element?.name || '' });
  name.setAttribute('aria-label', t('Tên phần tử'));
  const handleLine = el('p', 'el-handle');
  const desc = el('textarea', 'el-input el-textarea');
  Object.assign(desc, { placeholder: t('Thêm mô tả (không bắt buộc): nhân vật trông thế nào, đồ vật dùng làm gì…'), maxLength: MAX_DESC, value: element?.description || '' });
  desc.setAttribute('aria-label', t('Mô tả'));
  const count = el('span', 'el-count');
  const select = el('select', 'el-input el-select');
  select.setAttribute('aria-label', t('Phân loại'));
  for (const c of CATEGORIES) select.append(Object.assign(el('option', '', categoryLabel(c)), { value: c }));
  select.value = element?.category || 'auto';
  const catRow = el('div', 'el-row');
  catRow.append(el('span', 'el-label', t('Phân loại')), select);
  const left = el('div', 'el-col');
  left.append(name, handleLine, desc, count, catRow);

  const up = Object.assign(el('button', 'el-up'), { type: 'button' });
  const upText = el('span', 'el-up-text');
  const preview = el('img', 'el-up-img');
  preview.alt = '';
  up.append(preview, upText);
  const right = el('div', 'el-col');
  right.append(up);
  // Several pictures at once: one row each in the bulk window (only for a new element)
  const multi = Object.assign(el('button', 'el-multi', t('Chọn nhiều ảnh cùng lúc')), { type: 'button' });
  if (!editing && typeof dola.elements.pickImages === 'function') right.append(multi);

  const err = el('p', 'el-err');
  err.setAttribute('role', 'alert');
  const cancel = Object.assign(el('button', 'el-btn', t('Hủy')), { type: 'button' });
  const save = Object.assign(el('button', 'el-btn el-btn--main', editing ? t('Lưu') : t('Tạo')), { type: 'button' });
  const foot = el('div', 'el-modal-foot');
  foot.append(err, cancel, save);
  box.append(head, el('div', 'el-modal-body'), foot);
  box.querySelector('.el-modal-body').append(left, right);
  back.append(box);

  const taken = () => new Set(pool.library().filter((e) => e.id !== element?.id).map((e) => e.handle));
  const hasPicture = () => !!image || (editing && !element.missing);
  function paint() {
    handleLine.textContent = editing
      ? t('Dùng trong mô tả: @{handle} (đổi tên không đổi @tên này)', { handle: element.handle })
      : t('Dùng trong mô tả: @{handle}', { handle: uniqueHandle(name.value, taken()) });
    count.textContent = `${desc.value.length}/${MAX_DESC}`;
    if (image) {
      preview.src = mediaUrl.pick(image);
      preview.hidden = false;
    } else if (editing && !element.missing) {
      preview.src = thumbUrl(element);
      preview.hidden = false;
    } else preview.hidden = true;
    upText.textContent = hasPicture() ? t('Bấm hoặc kéo ảnh khác vào để đổi')
      : canDrop(dola) ? t('Bấm để tải ảnh lên hoặc kéo thả ảnh vào đây (png, jpg, webp, tối đa 10 MB)') : t('Bấm để tải ảnh lên (png, jpg, webp, tối đa 10 MB)');
    up.classList.toggle('el-up--has', hasPicture());
    save.disabled = busy || !name.value.trim() || (!editing && !image); // an element being edited keeps its picture (even a missing one) unless a new one is picked
    cancel.disabled = busy;
  }
  const say = (text) => { err.textContent = text || ''; };

  up.onclick = async () => {
    say('');
    try {
      const viaLibrary = await pickOneHandle(dola); // undefined: this app has no library, the system dialog as before
      const picked = viaLibrary === undefined ? await dola.elements.pickImage() : viaLibrary;
      if (picked) image = picked.handle;
    } catch (e) {
      say(t('Không chọn được ảnh: {why}', { why: e.message }));
    }
    paint();
  };
  const toBulk = (items) => { close(); openBulkModal({ dola, pool, items, onDone }); };
  multi.onclick = async () => {
    say('');
    try {
      const items = await dola.elements.pickImages();
      if (items.length > 1) toBulk(items);
      else if (items.length === 1) { image = items[0].handle; paint(); }
    } catch (e) {
      say(t('Không chọn được ảnh: {why}', { why: e.message }));
    }
  };
  // A picture dropped anywhere on this window is its picture; several make new elements, one row each.
  const stopDrop = watchDrop(box, dola, (items, skipped) => {
    if (!items.length) return say(t('Chỉ nhận ảnh png, jpg, jpeg hoặc webp.'));
    if (items.length > 1 && !editing) return toBulk(items);
    image = items[0].handle;
    say(items.length > 1 ? t('Đang sửa một phần tử nên chỉ lấy ảnh đầu tiên.') : skipped ? tn(skipped, '{n} tệp không phải ảnh nên bỏ qua.', '{n} file is not an image and was skipped.', '{n} files are not images and were skipped.') : '');
    paint();
  });
  save.onclick = async () => {
    busy = true;
    say('');
    paint();
    try {
      const fields = { name: name.value, description: desc.value, category: select.value };
      const r = editing ? await dola.elements.update({ id: element.id, ...fields, ...(image ? { image } : {}) }) : await dola.elements.add({ ...fields, image });
      if (!r.ok) say(ct(r.note) || t('Không lưu được phần tử.'));
      else {
        if (!editing) pool.select([r.element.id]);
        close();
        onDone(r.element);
        return;
      }
    } catch (e) {
      say(t('Không lưu được: {why}', { why: e.message }));
    }
    busy = false;
    paint();
  };
  for (const input of [name, desc]) input.addEventListener('input', paint);

  function onKey(ev) {
    if (ev.key === 'Tab') { // the window is modal: Tab stays inside it
      const items = [...box.querySelectorAll('button, input, textarea, select')].filter((n) => !n.disabled && n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (ev.shiftKey && (document.activeElement === first || !box.contains(document.activeElement))) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && (document.activeElement === last || !box.contains(document.activeElement))) { ev.preventDefault(); first.focus(); }
      return;
    }
    if (ev.key !== 'Escape') return;
    ev.stopPropagation();
    if (!busy) close();
  }
  function close() {
    stopDrop();
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (current?.back === back) current = null;
    if (opener?.isConnected) opener.focus();
  }
  closeBtn.onclick = () => { if (!busy) close(); };
  cancel.onclick = close;
  back.addEventListener('mousedown', (ev) => { if (ev.target === back && !busy) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.append(back);
  current = { back, close };
  paint();
  name.focus();
}
