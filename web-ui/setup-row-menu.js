import { t } from './i18n.js';
import { ct } from './core-text.js';
import { closePop, el, openPop } from './pop.js';
import { needsLogin } from './setup-muse.js';
import { rowMenuItems } from './setup-row-model.js';
import { nextRow } from './setup-side-model.js';
import { errText } from './ui-text.js';

// The "⋯" menu at the end of an account row (the buttons are described by setup-row-model.js). It opens in the shared popover (pop.js): a click outside or Esc closes it.
const loginBusy = new Set(); // account ids whose Muse login window is being opened: no second window while the first call is in flight
const MENU_WIDTH = 220;
const TRASH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>';

// ctx is the one renderTable gets: { busy, checking, say, onCheck, onReset, onLogin }
async function remove(a, ctx) {
  try {
    const r = await window.dola.accounts.remove(a.id);
    if (r?.ok === false) ctx.say(ct(r.note) || t('Không gỡ được acc {label}.', { label: a.label }), true);
  } catch (err) {
    ctx.say(t('Không gỡ được acc {label}: {why}', { label: a.label, why: errText(err) }), true);
  }
}

async function login(a, ctx) {
  loginBusy.add(a.id);
  try {
    await ctx.onLogin(a);
  } finally {
    loginBusy.delete(a.id);
  }
}

export function openRowMenu(anchor, a, ctx) {
  const items = rowMenuItems({ running: ctx.busy.has(a.id), checking: ctx.checking.has(a.id), login: !!ctx.onLogin && needsLogin(a), loginBusy: loginBusy.has(a.id) });
  const act = { login: () => login(a, ctx), check: () => ctx.onCheck(a), reset: () => ctx.onReset(a), delete: () => remove(a, ctx) };
  const nodes = items.map((it) => {
    const b = el('button', `stp-menu-item${it.danger ? ' stp-menu-item--danger' : ''}`);
    b.type = 'button';
    b.dataset.action = it.id;
    b.disabled = it.disabled;
    b.title = it.title;
    if (it.id === 'delete') b.insertAdjacentHTML('beforeend', TRASH); // fixed markup, no data in it
    b.append(el('span', '', it.text));
    b.onclick = () => { closePop(); act[it.id](); };
    return b;
  });
  openPop(anchor, nodes, MENU_WIDTH);
  const at = anchor.getBoundingClientRect(); // the shared popover opens under the left edge of its anchor; this menu hangs from the right end of the row
  document.getElementById('pop').style.left = `${Math.max(8, Math.min(at.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8))}px`;
  const live = nodes.filter((n) => !n.disabled);
  for (const n of live) { // Up / Down between the buttons of THIS menu (the keys belong to its own buttons, so no other popover is touched)
    n.onkeydown = (e) => {
      if (e.key === 'Escape') { closePop(); anchor.focus(); return; } // the keyboard goes back to the "⋯" it came from
      const to = nextRow(live.indexOf(n), live.length, e.key);
      if (to === null) return;
      e.preventDefault();
      live[to].focus();
    };
  }
  live[0]?.focus(); // the keyboard lands on the first button that works
}
