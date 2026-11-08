import { t, tn } from './i18n.js';
import { ct } from './core-text.js';
import { el } from './pop.js';
import { CATEGORIES, MAX_DESC, MAX_NAME } from './shared/elements.js';
import { mediaUrl } from './shared/media-handles.js';
import { MAX_ROWS, niceName, watchDrop } from './elements-drop.js';
import { categoryLabel } from './elements-pool.js';

// "Thêm nhiều phần tử": a row per picture (picked together or dropped together), the name already guessed from the file name; the person
// only types a name, a description and picks a category (or one category for all). Rows that fail stay, with the reason; the others are made
// and ticked in the pool.
let current = null;
export const isBulkOpen = () => current !== null;

export function openBulkModal({ dola, pool, items, onDone = () => {} }) {
  if (current) current.close();
  const opener = document.activeElement;
  const rows = []; // { handle, node, name, desc, cat, note }
  let busy = false;

  const back = el('div', 'el-modal-back');
  const box = el('div', 'el-modal el-bulk');
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', t('Thêm nhiều phần tử'));
  const closeBtn = Object.assign(el('button', 'el-x', '✕'), { type: 'button', title: t('Đóng') });
  closeBtn.setAttribute('aria-label', t('Đóng'));
  const head = el('div', 'el-modal-head');
  const title = el('h2', 'el-modal-title');
  head.append(title, closeBtn);

  const all = el('select', 'el-input el-select el-bulk-all');
  all.setAttribute('aria-label', t('Phân loại cho tất cả'));
  all.append(Object.assign(el('option', '', t('Phân loại cho tất cả…')), { value: '' }));
  for (const c of CATEGORIES) all.append(Object.assign(el('option', '', categoryLabel(c)), { value: c }));
  const more = Object.assign(el('button', 'el-btn', t('Thêm ảnh khác')), { type: 'button' });
  const bar = el('div', 'el-bulk-bar');
  bar.append(all, more);
  const list = el('div', 'el-bulk-list');
  const err = el('p', 'el-err');
  err.setAttribute('role', 'alert');
  const cancel = Object.assign(el('button', 'el-btn', t('Hủy')), { type: 'button' });
  const save = Object.assign(el('button', 'el-btn el-btn--main'), { type: 'button' });
  const foot = el('div', 'el-modal-foot');
  foot.append(err, cancel, save);
  box.append(head, bar, list, foot);
  back.append(box);

  function paint() {
    title.textContent = tn(rows.length, 'Thêm nhiều phần tử ({n} ảnh)', 'Add many elements ({n} image)', 'Add many elements ({n} images)');
    save.textContent = busy ? t('Đang tạo…') : tn(rows.length, 'Tạo {n} phần tử', 'Create {n} element', 'Create {n} elements');
    save.disabled = busy || !rows.length;
    cancel.disabled = busy;
    more.disabled = busy || rows.length >= MAX_ROWS;
    all.disabled = busy;
  }
  const say = (text) => { err.textContent = text || ''; };

  function addRows(picked) {
    let skipped = 0;
    for (const item of picked) {
      if (rows.length >= MAX_ROWS || rows.some((r) => r.handle === item.handle)) { skipped += 1; continue; }
      const thumb = Object.assign(el('img', 'el-bulk-thumb'), { src: mediaUrl.pick(item.handle), alt: '', loading: 'lazy', decoding: 'async' });
      const name = Object.assign(el('input', 'el-input'), { type: 'text', placeholder: t('Tên'), maxLength: MAX_NAME, value: niceName(item.name) });
      name.setAttribute('aria-label', t('Tên của {name}', { name: item.name }));
      const desc = Object.assign(el('input', 'el-input'), { type: 'text', placeholder: t('Mô tả (không bắt buộc)'), maxLength: MAX_DESC });
      desc.setAttribute('aria-label', t('Mô tả của {name}', { name: item.name }));
      const cat = el('select', 'el-input el-select');
      cat.setAttribute('aria-label', t('Phân loại của {name}', { name: item.name }));
      for (const c of CATEGORIES) cat.append(Object.assign(el('option', '', categoryLabel(c)), { value: c }));
      const note = el('p', 'el-bulk-note');
      const rm = Object.assign(el('button', 'el-x', '✕'), { type: 'button', title: t('Bỏ ảnh này') });
      rm.setAttribute('aria-label', t('Bỏ {name}', { name: item.name }));
      const node = el('div', 'el-bulk-row');
      const fields = el('div', 'el-bulk-fields');
      fields.append(name, desc, note);
      node.append(thumb, fields, cat, rm);
      const row = { handle: item.handle, node, name, desc, cat, note };
      rm.onclick = () => { if (busy) return; rows.splice(rows.indexOf(row), 1); node.remove(); paint(); };
      rows.push(row);
      list.append(node);
    }
    if (skipped) say(tn(skipped, '{n} ảnh không thêm được (trùng, quá {max} ảnh hoặc không phải ảnh).', '{n} image could not be added (duplicate, over {max} images or not an image).', '{n} images could not be added (duplicates, over {max} images or not images).').replace('{max}', String(MAX_ROWS)));
    paint();
  }

  all.onchange = () => { if (all.value) rows.forEach((r) => { r.cat.value = all.value; }); all.value = ''; };
  more.onclick = async () => {
    say('');
    try {
      addRows(await dola.elements.pickImages());
    } catch (e) {
      say(t('Không chọn được ảnh: {why}', { why: e.message }));
    }
  };
  const stopDrop = watchDrop(box, dola, (picked, skipped) => { if (picked.length) addRows(picked); if (skipped) say(tn(skipped, '{n} tệp không phải ảnh nên bỏ qua.', '{n} file is not an image and was skipped.', '{n} files are not images and were skipped.')); });

  save.onclick = async () => {
    busy = true;
    say('');
    paint();
    const made = [];
    for (const row of [...rows]) {
      row.note.textContent = '';
      if (!row.name.value.trim()) { row.note.textContent = t('Thiếu tên.'); continue; }
      try {
        const r = await dola.elements.add({ name: row.name.value, description: row.desc.value, category: row.cat.value, image: row.handle });
        if (r.ok) {
          made.push(r.element);
          rows.splice(rows.indexOf(row), 1);
          row.node.remove();
        } else row.note.textContent = ct(r.note) || t('Không lưu được.');
      } catch (e) {
        row.note.textContent = t('Không lưu được: {why}', { why: e.message });
      }
    }
    busy = false;
    if (made.length) {
      pool.select(made.map((e) => e.id));
      onDone(made);
    }
    if (rows.length) say(`${tn(made.length, 'Đã tạo {n} phần tử', 'Created {n} element', 'Created {n} elements')}, ${tn(rows.length, 'còn {n} ảnh cần sửa', '{n} image still needs fixing', '{n} images still need fixing')}.`);
    else close();
    paint();
  };

  function onKey(ev) {
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
  addRows(items);
  list.querySelector('input')?.focus();
}
