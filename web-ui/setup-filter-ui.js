import { el } from './pop.js';
import { FILTERS } from './setup-filter-model.js';

// The status chips over the table (the groups are in setup-filter-model.js). counts = groupCounts(...), current = the chip that is on, onPick(id).
export function paintChips(box, counts, current, onPick) {
  const had = box.contains(document.activeElement) ? document.activeElement.dataset.filter : '';
  box.replaceChildren();
  for (const [id, text] of FILTERS) {
    const on = id === current;
    const b = el('button', ['su-chip', on ? 'su-chip--on' : '', id === 'error' && counts.error ? 'su-chip--bad' : ''].filter(Boolean).join(' '));
    b.type = 'button';
    b.dataset.filter = id;
    b.setAttribute('aria-pressed', String(on));
    b.append(text, el('b', '', String(counts[id] ?? 0)));
    b.onclick = () => onPick(id);
    box.append(b);
  }
  if (had) box.querySelector(`[data-filter="${had}"]`)?.focus(); // the chip the person pressed is drawn again: the focus stays on it
}
