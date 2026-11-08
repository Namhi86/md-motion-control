import { el } from './pop.js';
import { createPool, thumbUrl } from './elements-pool.js';
import { openElementsPopup } from './elements-popup.js';
import { button, field, noteLine, segmented } from './analyze-controls.js';
import { COUNT_CHIPS, DIALOGUES, KINDS, LANGUAGES, MAX_PRODUCTS, MAX_STYLE_TEXT, STYLE_CHIPS, countNote, parseCount, pickedProducts } from './analyze-form.js';
import { mountTarget } from './analyze-target-ui.js';
import { t, tx } from './i18n.js';

// Section 2 of the tab: the settings. `settings` (analyze-form.js defaultSettings) is changed in place; onChange() runs after every change so the view can
// repaint the button under it. The products are chosen in the element library (the same popup as the form, its own set of ticks).
const POOL_KEY = 'fs-analyze-products'; // the ticks of this tab only: the "Tạo video" form keeps its own

export function mountSettings({ dola, settings, limits, opts, anchor, onChange }) {
  const node = el('div', 'an-settings');
  const pool = createPool(dola, POOL_KEY);
  let locked = false; // an analysis is running: the choices it was asked with must not move under it (setLocked)
  const changed = () => { paint(); onChange(); };

  const kind = segmented(KINDS.map((k) => ({ id: k.id, label: k.label, title: k.desc })), () => settings.kind, (id) => { settings.kind = id; changed(); });
  const kindNote = noteLine();
  const dialogue = segmented(DIALOGUES.map((d) => ({ id: d.id, label: d.label, title: d.desc })), () => settings.dialogue, (id) => { settings.dialogue = id; changed(); });
  const dialogueField = field(t('Lời thoại'), dialogue.node);
  const language = el('select', 'an-input');
  language.setAttribute('aria-label', t('Ngôn ngữ thoại'));
  for (const l of LANGUAGES) language.append(Object.assign(el('option', '', l.label), { value: l.id }));
  language.onchange = () => { settings.language = language.value; changed(); };
  const styleChips = segmented(STYLE_CHIPS.map((s) => ({ id: s, label: tx(s) })), () => settings.styles, (id) => {
    settings.styles = settings.styles.includes(id) ? settings.styles.filter((s) => s !== id) : [...settings.styles, id];
    changed();
  }, { multi: true });
  const styleText = Object.assign(el('input', 'an-input'), { type: 'text', maxLength: MAX_STYLE_TEXT, placeholder: t('Hoặc tự mô tả phong cách (không bắt buộc)') });
  styleText.setAttribute('aria-label', t('Mô tả phong cách'));
  styleText.oninput = () => { settings.styleText = styleText.value; changed(); };

  // products: tiles of the ticked elements + a button that opens the library popup
  const tiles = el('div', 'an-products');
  const productNote = noteLine();
  const openLibrary = () => openElementsPopup({ dola, pool, anchor });
  const sync = () => { settings.products = pool.selected().slice(0, MAX_PRODUCTS).map((e) => e.handle); changed(); };

  // destination: the Model row and the three pills of the "Tạo video" form (analyze-target-ui.js); they start from the form and can be changed here
  const target = mountTarget({ settings, limits, opts, onChange: () => changed() });

  // count: chips 1/3/5/10 and a typed box 1-50
  const countChips = segmented(COUNT_CHIPS.map((n) => ({ id: n, label: String(n) })), () => (settings.countText ? 0 : settings.count), (id) => {
    settings.count = id;
    settings.countText = '';
    countBox.value = '';
    changed();
  });
  const countBox = Object.assign(el('input', 'an-input an-input--num'), { type: 'text', inputMode: 'numeric', maxLength: 2, placeholder: '1-50' });
  countBox.setAttribute('aria-label', t('Số prompt (gõ số từ 1 đến 50)'));
  const countMsg = noteLine();
  const countRow = el('div', 'an-row');
  countRow.append(countChips.node, el('span', 'an-label an-inline', t('hoặc gõ')), countBox);
  countBox.oninput = () => { settings.countText = countBox.value.trim(); changed(); };

  function paintProducts() {
    tiles.replaceChildren();
    const list = pickedProducts(settings.products, pool.library());
    for (const e of list) {
      const tile = el('span', 'an-ptile');
      tile.title = `@${e.handle} · ${e.name}`;
      if (!e.missing) tile.append(Object.assign(el('img'), { src: thumbUrl(e), alt: '' }));
      tile.append(el('span', 'an-ptag', `@${e.handle}`));
      const x = button('✕', 'an-ptile-x', () => { pool.deselect([e.id]); });
      x.setAttribute('aria-label', t('Bỏ sản phẩm {name}', { name: e.name }));
      tile.append(x);
      tiles.append(tile);
    }
    tiles.append(button(list.length ? t('+ Thêm / bớt') : t('+ Chọn sản phẩm từ thư viện'), 'an-btn an-btn--sm an-btn--add', openLibrary));
    productNote.set(pool.selected().length > MAX_PRODUCTS ? t('Chỉ lấy {max} sản phẩm đầu, phần còn lại bị bỏ.', { max: MAX_PRODUCTS }) : list.length ? t('Mọi prompt đều phải có đủ các thẻ @ này.') : t('Không chọn sản phẩm: prompt mô tả sản phẩm bằng chữ, không gắn ảnh.'));
  }

  function paint() {
    kind.paint(); dialogue.paint(); styleChips.paint(); countChips.paint();
    dialogueField.hidden = settings.kind !== 'copy';
    kindNote.set(KINDS.find((k) => k.id === settings.kind)?.desc);
    language.value = settings.language;
    const count = settings.countText ? parseCount(settings.countText) : settings.count;
    countMsg.set(settings.countText && !count ? t('Gõ một số nguyên từ 1 đến 50.') : count ? countNote(count) : '');
    target.paint(); // the Model row and the pills; the rows of the Model popup that take no product image are switched off when it opens (analyze-target.js rowBlocked)
    paintProducts();
    // A lock turns every control off; unlocking turns them on again.
    for (const c of node.querySelectorAll('button, input, select')) c.disabled = locked;
  }

  node.append(
    field(t('Kiểu'), kind.node, kindNote.node),
    dialogueField,
    field(t('Ngôn ngữ thoại'), language),
    field(t('Phong cách (không bắt buộc)'), styleChips.node, styleText),
    field(t('Sản phẩm'), tiles, productNote.node),
    field(t('Tạo video bằng'), target.node),
    field(t('Số prompt'), countRow, countMsg.node),
  );
  pool.onChange(sync);
  pool.load().then(() => { sync(); }).catch(() => paint());
  paint();
  return { node, pool, refresh: () => pool.refresh().catch(() => {}), repaint: paint, setLocked(on) { locked = on; paint(); } };
}
