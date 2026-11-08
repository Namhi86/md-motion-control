import { filterRows } from './setup-filter-model.js';
import { accountsOf } from './setup-platforms.js';

// The state of the Setup screen that its modules share (setup.js owns it and draws; the other setup-*.js files read and change it, then ask for a redraw through `hooks`).
// The window only ever sees the public view of the list (id, type, label, proxy host:port, status, note, enabled, restUntil): no cookie, no password.
export const st = {
  view: [], // the public view of the accounts
  opts: null, // window.dola.options(): tells whether the core has Veo
  platform: '', // the open platform (Seedance | Muse | Veo); chosen at the first draw (and again when its row goes away)
  page: 'platform', // the page on the right of the sidebar: 'platform' (the accounts of `platform`) | 'proxy' (the proxy pool) | 'settings'
  filter: 'all', // the status chip that is on (setup-filter-model.js FILTERS)
  query: '', // the text of the search box
  kindOf: {}, // platform -> the way of adding that was open on it
  running: new Map(), // task id -> account id, for tasks that are running right now
  selected: new Set(), // ids of the ticked rows (bulk actions)
  checking: new Set(), // account ids whose "Kiểm tra" is in flight
};

// Set by setup.js: the modules that act on rows ask for a redraw without importing it (that would be a circle).
export const hooks = { paintTable: () => {} };

export const rowsOf = () => accountsOf(st.platform, st.view); // the accounts of the open platform
export const visibleRows = () => filterRows(rowsOf(), st.filter, st.query); // ... that the chip and the search leave on the screen
export const busyIds = () => new Set(st.running.values());
export const idle = (a) => !busyIds().has(a.id) && !st.checking.has(a.id);
