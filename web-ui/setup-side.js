import { el } from './pop.js';
import { SIDE_TEXT, nextRow } from './setup-side-model.js';

// The DOM of the left sidebar of the Setup screen (the rows are described by setup-side-model.js sideGroups). Draws only; setup.js owns the state and passes the click in.
// box: <nav id="su-side">. groups: sideGroups(...). opts: { current (the key of the current row), home (the platform whose page was open last), onPick(item) }.
// One row is in the tab order (roving tabindex); Up / Down move the focus from row to row, round the ends; Enter or Space opens the row (it is a button).
// The platform rows live in #su-plats (the tour circles it), the Kho proxy row is #su-tab-proxy and the settings row is #su-tab-settings;
// the row of the platform that was open last is #su-tab-accounts (guide-tour.js clicks it).
function row(it, { current, home, onPick }) {
  const on = it.key === current;
  const b = el('button', ['su-side-item', it.platform ? 'su-plat' : '', on ? 'su-side-item--on' : '', on && it.platform ? 'su-plat--on' : ''].filter(Boolean).join(' '));
  b.type = 'button';
  b.dataset.key = it.key;
  b.dataset.sideRow = '';
  if (it.elId) b.id = it.elId;
  if (it.platform && it.platform === home) b.id = 'su-tab-accounts'; // the row of the platform that was open: the tour clicks it to come back to the accounts from the proxy page
  b.tabIndex = on ? 0 : -1;
  if (on) b.setAttribute('aria-current', 'page');
  b.title = it.error ? `${it.title}. ${SIDE_TEXT.errorDot}` : it.title;
  b.append(el('span', 'su-side-name', it.label));
  if (it.error) {
    const dot = el('i', 'su-side-dot');
    dot.setAttribute('role', 'img');
    dot.setAttribute('aria-label', SIDE_TEXT.errorDot);
    b.append(dot);
  }
  if (it.n) {
    const n = el('i', `su-side-n${it.platform ? ' su-plat-n' : ''}`);
    if (it.elId === 'su-tab-proxy') n.id = 'su-tab-proxy-n';
    n.append(el('b', '', String(it.n[0])), ` / ${it.n[1]}`);
    b.append(n);
  }
  b.onclick = () => onPick(it);
  return b;
}

export function paintSide(box, groups, opts) {
  const had = box.contains(document.activeElement) ? document.activeElement.dataset.key : '';
  box.replaceChildren();
  for (const g of groups) {
    box.append(el('p', 'su-side-label', g.label));
    const holder = g.rowsId ? el('div', 'su-side-rows') : box;
    if (g.rowsId) holder.id = g.rowsId;
    for (const it of g.items) holder.append(row(it, opts));
    if (holder !== box) box.append(holder);
  }
  if (had) box.querySelector(`[data-key="${had}"]`)?.focus(); // a redraw never takes the keyboard away from the row the person is on
}

// Up / Down between the rows (the sidebar is made once, the handler stays).
export function bindSideKeys(box) {
  box.addEventListener('keydown', (e) => {
    if (!e.target.matches?.('[data-side-row]')) return;
    const rows = [...box.querySelectorAll('[data-side-row]')];
    const at = nextRow(rows.indexOf(e.target), rows.length, e.key);
    if (at === null) return;
    e.preventDefault();
    rows[at].focus();
  });
}
