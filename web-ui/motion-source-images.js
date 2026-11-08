import { el } from './pop.js';
import { button, field, noteLine } from './analyze-controls.js';
import { watchDrop } from './elements-drop.js';
import { MAX_IMAGES } from './motion-form.js';
import { mediaUrl } from './shared/media-handles.js';
import { t } from './i18n.js';

// The pictures of the person to put in the film: a small grid of thumbnails with a "✕" each and the button "＋ Thêm ảnh nhân vật". They come from window.dola.pickImages (the same picker the
// "Tạo video" form uses) or from files dropped on the block; nothing here ever sees a path.
// -> { node, get() -> [{ handle, name }], set(list) (the pictures of a saved plan: shown, onChange does NOT run), refresh() }; onChange() runs when the list changes; isLocked() says whether the block may be changed now.
export function mountImages({ dola, pickImages = () => dola.pickImages?.(), onChange, isLocked }) {
  const images = [];
  const error = noteLine('an-err');
  error.node.setAttribute('role', 'alert');
  const grid = el('div', 'cm-images');
  const addBtn = button(t('＋ Thêm ảnh nhân vật'), 'an-btn an-btn--add cm-add', () => add());

  function refresh() {
    grid.replaceChildren(...images.map((im, i) => {
      const card = el('div', 'cm-image');
      const img = Object.assign(el('img', 'cm-thumb'), { src: mediaUrl.pick(im.handle), alt: im.name });
      const del = button('✕', 'cm-x', () => { if (isLocked()) return; images.splice(i, 1); refresh(); onChange(); });
      del.setAttribute('aria-label', t('Bỏ ảnh này'));
      del.disabled = isLocked();
      card.append(img, del);
      return card;
    }));
    grid.hidden = !images.length;
    addBtn.hidden = images.length >= MAX_IMAGES;
    addBtn.disabled = isLocked();
  }
  async function add() {
    if (isLocked()) return;
    let picked;
    try { picked = await pickImages(); } catch (err) { error.set(t('Không mở được hộp chọn ảnh: {reason}', { reason: err.message })); return; }
    take(Array.isArray(picked) ? picked : []);
  }
  // the pictures of a pick or of a drop: [{ handle, name }]
  function take(list) {
    error.set('');
    for (const it of list) {
      if (images.length >= MAX_IMAGES) { error.set(t('Tối đa {n} ảnh.', { n: MAX_IMAGES })); break; }
      if (!it?.handle || images.some((x) => x.handle === it.handle)) continue;
      images.push({ handle: it.handle, name: String(it.name || '').slice(0, 80) });
    }
    refresh();
    onChange();
  }

  const node = field(t('Ảnh nhân vật'), grid, addBtn, el('p', 'an-note cm-hint', t('Dùng ảnh một người, rõ mặt. Flow hay từ chối tờ nhiều nhân vật hoặc ảnh nhiều khuôn mặt (đã hoàn credit nếu bị từ chối).')), error.node);
  node.classList.add('cm-pics');
  // pictures dropped on this block (the same way the Elements pickers take them); anywhere else on the tab a drop is a video
  watchDrop(node, dola, (items, skipped) => {
    if (isLocked()) return;
    if (items.length) take(items);
    if (skipped) error.set(t('Tệp vừa thả không phải ảnh.'));
  });
  refresh();
  const set = (list) => { images.splice(0, images.length, ...list.slice(0, MAX_IMAGES).map((x) => ({ handle: x.handle, name: String(x.name || '').slice(0, 80) }))); refresh(); };
  return { node, get: () => [...images], set, refresh };
}
