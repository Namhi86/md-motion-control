import { tx } from './i18n.js';
import { CATEGORY_LABEL } from './shared/elements.js';
import { mediaUrl } from './shared/media-handles.js';

// The elements ticked for the form (the "pool"), and a copy of the library. The library itself lives in the main process
// (window.dola.elements); the pool is only which ids are ticked, remembered between runs (an id that is no longer in the library is
// dropped). change() fires on every change of the ticks AND of the library, so everything that shows either can repaint.
const KEY = 'fs-element-pool';
export const thumbUrl = (e) => mediaUrl.el(e.id, e.v);
// The name of a category in the language of the page (CATEGORY_LABEL of shared/elements.js is Vietnamese: its words are the `dynamic` keys of locales/en-setup.js).
export const categoryLabel = (category) => tx(CATEGORY_LABEL[category] || CATEGORY_LABEL.auto);
// For searching: ignores case and accents ("ao dai" finds "Áo dài").
export const norm = (s) => String(s ?? '').replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const loadIds = (key) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const saveIds = (key, ids) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch { /* the ticks are not remembered, nothing else */ }
};

// key: where the ticks are remembered. The "Tạo video" form uses the default; another screen that picks elements (the products of the video analysis)
// passes its own, so the two never share or overwrite each other's ticks.
export function createPool(dola, key = KEY) {
  let library = [];
  const selected = new Set(loadIds(key));
  const listeners = new Set();
  const emit = () => {
    saveIds(key, [...selected]);
    for (const fn of listeners) fn();
  };
  const prune = () => {
    const ids = new Set(library.map((e) => e.id));
    for (const id of selected) if (!ids.has(id)) selected.delete(id);
  };
  const known = (id) => library.some((e) => e.id === id);

  return {
    library: () => library,
    byHandle: (handle) => library.find((e) => e.handle === handle) || null,
    selected: () => library.filter((e) => selected.has(e.id)),
    isSelected: (id) => selected.has(id),
    toggle(id) {
      if (selected.has(id)) selected.delete(id);
      else if (known(id)) selected.add(id);
      emit();
    },
    select(ids) {
      const add = ids.filter((id) => known(id) && !selected.has(id));
      for (const id of add) selected.add(id);
      if (add.length) emit();
    },
    deselect(ids) {
      const drop = ids.filter((id) => selected.has(id));
      for (const id of drop) selected.delete(id);
      if (drop.length) emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // The library again from main: the picture of an element may have gone (or come back) on the disk since the last push.
    async refresh() {
      library = await dola.elements.list();
      prune();
      emit();
    },
    async load() {
      await this.refresh();
      dola.elements.onChange((list) => {
        library = list;
        prune();
        emit();
      });
    },
  };
}
