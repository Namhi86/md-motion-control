import { el } from './pop.js';
import { itemKey } from './model-groups.js';

// The grouped Model popup of the "Tạo video" form: a heading per family (Seedance, Veo, Muse), then the names of its models. The core's
// description (credits, limits) is only the hover tooltip. groups: modelGroups(opts); selected: selectedKey(...); onPick(item).
// disabled(item) -> '' or the reason a row cannot be picked now (the "Phân tích video" tab: Veo and Muse take no product image); the row is then off and the reason is its tooltip.
export function groupedModelPop({ groups, selected, onPick, disabled = () => '' }) {
  return groups.flatMap((g) => {
    const head = el('p', 'cv-pop-group');
    head.append(el('span', 'cv-pop-group-name', g.label));
    const rows = g.items.map((item) => {
      const on = itemKey(item) === selected;
      const b = el('button', `cv-model-item${on ? ' cv-model-item--on' : ''}`);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(on));
      if (item.desc) b.title = item.desc;
      const why = disabled(item);
      if (why) { b.disabled = true; b.title = why; }
      const body = el('span', 'cv-model-body');
      body.append(el('span', 'cv-model-name', item.label));
      b.append(body);
      b.onclick = () => onPick(item);
      return b;
    });
    return [head, ...rows];
  });
}
