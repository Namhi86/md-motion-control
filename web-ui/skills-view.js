import { button } from './analyze-controls.js';
import { buildCard } from './skills-cards.js';
import { createPlayback } from './skills-playback.js';
import { mountPublish } from './skills-publish.js';
import { mountProfile } from './skills-profile.js';
import { adminCardExtras } from './skills-admin.js';
import { modeOffered } from './muse-form.js';
import { el } from './pop.js';
import { PERIODS, PERIOD_LABEL, STORE_TEXT, TOP_TITLE, isPeriod, listProblem, modeForUse, topThree } from './shared/skill-store-form.js';
import { t, tx } from './i18n.js';

// The "Kho skill" tab (section #view-skills): the three most used skills of the period on top (system and community together), then two columns,
// system skills on the left and community skills on the right. It only talks to window.dola.skills (electron/skills-ipc.js of the core): the core
// calls the server with the person's token; this page draws the cards it gets, as plain text, and never holds a skill body.
// Returns { onShow(), onHide(), reload(), publish(prefill) } (app.js calls them when the screen opens / closes; publish opens the "Đăng skill" window, filled in, from anywhere).
//   dola  window.dola   root  the section   opts  window.dola.options()   prefs  the form's prefs ({ skillsPeriod } is kept there)
//   onUse(card)  "Dùng skill" (the app opens the form)   playback  skills-playback.js (tests give their own)
//   isAdmin()  is the signed-in person an admin NOW (asked at every drawing: signing in as somebody else changes it); the buttons are a courtesy, the server decides
// The period is kept with the form's other choices (localStorage 'prefs', which the app also writes from its own copy): written at once, so closing the app right after is fine.
function rememberPeriod(p) {
  try {
    const saved = JSON.parse(localStorage.getItem('prefs') || '{}');
    localStorage.setItem('prefs', JSON.stringify({ ...saved, skillsPeriod: p }));
  } catch { /* a period that is not remembered costs one click */ }
}

export function mountSkills({ dola = window.dola, root, opts, prefs, onUse, isAdmin = () => opts?.admin === true, playback = createPlayback() }) {
  const api = dola.skills;
  const offered = { pro: modeOffered('pro', opts), muse: modeOffered('muse', opts) }; // what this core can make with a Kho skill
  const adminBridge = typeof api?.admin?.remove === 'function';
  let period = isPeriod(prefs?.skillsPeriod) ? prefs.skillsPeriod : 'week';
  let seq = 0; // the newest load; an older answer that comes back late is dropped
  let drawn = false; // something has been drawn once (a later load keeps it until the new answer comes)

  // ── the frame ──
  const wrap = el('div', 'sk-wrap');
  const bar = el('div', 'sk-bar');
  const topTitle = el('h2', 'sk-top-title', tx(TOP_TITLE[period]));
  const switcher = el('div', 'sk-switch');
  switcher.setAttribute('role', 'group');
  switcher.setAttribute('aria-label', t('Kỳ xếp hạng'));
  const periodBtns = PERIODS.map((p) => {
    const b = button(tx(PERIOD_LABEL[p]), 'sk-period', () => setPeriod(p));
    b.dataset.period = p;
    switcher.append(b);
    return b;
  });
  const tools = el('div', 'sk-tools');
  bar.append(topTitle, switcher, tools);
  const status = Object.assign(el('p', 'sk-status'), { hidden: true });
  status.setAttribute('role', 'status');
  const retry = button(t('Thử lại'), 'an-btn an-btn--sm sk-retry', () => load());
  const topRow = el('div', 'sk-top');
  const cols = el('div', 'sk-cols');
  const foot = el('p', 'sk-foot', tx(STORE_TEXT.honesty));
  wrap.append(bar, status, topRow, cols, foot);
  root.replaceChildren(wrap);

  const refresh = () => load();
  const publish = mountPublish({ dola, isAdmin, onDone: refresh });
  const profile = mountProfile({ dola });
  tools.append(profile.node, publish.node);

  function paintPeriod() {
    topTitle.textContent = tx(TOP_TITLE[period]);
    for (const b of periodBtns) {
      const on = b.dataset.period === period;
      b.classList.toggle('sk-period--on', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  function setPeriod(p) {
    if (p === period) return;
    period = p;
    if (prefs) prefs.skillsPeriod = p;
    rememberPeriod(p);
    paintPeriod();
    load();
  }

  function say(text, canRetry = false) {
    status.replaceChildren(text);
    if (canRetry) status.append(retry);
    status.hidden = !text;
  }

  // ── drawing ──
  const makeCard = (card, rank = 0) => buildCard(card, {
    rank, period, playback, onUse, canUse: modeForUse(card.modes, offered) !== null,
    extras: adminBridge && isAdmin() ? (c) => adminCardExtras({ dola, card: c, onChanged: refresh }) : null,
  });

  function column(title, sub, result) {
    const col = el('section', 'sk-col');
    col.append(el('h2', 'sk-col-title', title), el('p', 'sk-col-sub', sub));
    const grid = el('div', 'sk-grid');
    if (!result.ok) {
      const p = listProblem(result.error);
      const box = el('div', 'sk-empty');
      box.append(el('p', '', tx(p.text)));
      if (p.retry) box.append(button(t('Thử lại'), 'an-btn an-btn--sm', () => load()));
      grid.append(box);
    } else if (!result.skills.length) grid.append(el('p', 'sk-empty', tx(STORE_TEXT.empty)));
    else for (const c of result.skills) grid.append(makeCard(c));
    col.append(grid);
    return col;
  }

  function draw(system, community) {
    playback.clear();
    topRow.replaceChildren();
    const ranked = topThree(system.ok ? system.skills : [], community.ok ? community.skills : []);
    if (!ranked.length) topRow.append(el('p', 'sk-empty sk-top-empty', tx(STORE_TEXT.noTop)));
    ranked.forEach((c, i) => topRow.append(makeCard(c, i + 1)));
    cols.replaceChildren(column(t('Skill hệ thống'), t('Do MD Motion Control viết và đã kiểm duyệt'), system), column(t('Cộng đồng'), t('Do người dùng đăng, hiện ngay khi đăng'), community));
    drawn = true;
  }

  // ── loading ──
  const ask = async (scope) => {
    try {
      const r = await api.list(scope, period);
      return r?.ok === true && Array.isArray(r.skills) ? { ok: true, skills: r.skills } : { ok: false, error: r?.error || 'server' };
    } catch {
      return { ok: false, error: 'network' };
    }
  };
  async function load() {
    const mine = ++seq;
    root.classList.add('sk--busy');
    if (!drawn) say(tx(STORE_TEXT.loading));
    const [system, community] = await Promise.all([ask('system'), ask('community')]);
    if (mine !== seq) return;
    root.classList.remove('sk--busy');
    if (!system.ok && !community.ok) { // nothing to show: one sentence for the whole page, from the first error
      playback.clear();
      topRow.replaceChildren();
      cols.replaceChildren();
      drawn = false;
      const p = listProblem(system.error);
      say(tx(p.text), p.retry);
      return;
    }
    say('');
    draw(system, community);
  }

  paintPeriod();
  return {
    onShow() {
      playback.setActive(true);
      profile.refresh();
      return load();
    },
    onHide() { playback.setActive(false); },
    reload: load,
    publish: (prefill) => publish.open(prefill),
  };
}
