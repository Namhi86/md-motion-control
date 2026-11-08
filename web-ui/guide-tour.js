import { union } from './guide-geometry.js';
import { createSpotlight } from './guide-spotlight.js';
import { STEPS, canAdvance, forward, modelFor, nextStep, tally } from './guide-tour-steps.js';

const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The conductor of the beginner tour (plans/261020-1535-md-motion-onboarding-wizard, "ĐỔI HƯỚNG 2026-10-21"): it knows which step the person is at, finds the REAL button of that step in
// the page, asks guide-spotlight.js to circle it, and moves on when the person CLICKS it (a capture-phase listener that never stops the click: the button still does its job) or when
// the real state says so (an account was added, one is ready...). A person who wanders off is never stuck: the step is worked out again from what is on the screen (guide-tour-steps.js).
//   createTour({ steps, showView, onSkip, onFinish, onChange, doc, win, spotlight, waitMs, pollMs }) -> { ask(), begin(), close(), refresh(), isOpen(), step() }
//     onChange() the tour (or its question) opened or closed: the card strip of the Tạo video tab hides while it is on and comes back when it is gone (guide-init.js isBlocked)
//     steps()    wizardSteps() of guide-state.js, now          showView(name)  app.js          onSkip()  "Tôi biết rồi" / "Bỏ qua hướng dẫn": the caller writes the flag
//     onFinish() the circled "Tạo video" was pressed: the caller writes the flag          ask()  the question in the middle of the screen          begin()  the tour from step 1
// A button that is not there (an older core, a tab not built yet, a size of 0) is waited for waitMs after the step (or the view) changed, then the popup shows in the middle with no
// hole and still has its "Tiếp": nothing breaks. Esc / the cross only close the tour for now (the caller's flag is written by "Bỏ qua hướng dẫn" and "Tôi biết rồi" only).
export function createTour({ steps, showView, onSkip = () => {}, onFinish = () => {}, onChange = () => {}, doc = document, win = window, spotlight = createSpotlight({ doc, win }), waitMs = 1500, pollMs = 200 } = {}) {
  let cur = null; // null = closed; else a step id of guide-tour-steps.js ORDER
  let start = tally([]); // what the person had when the tour began: a step moves on when its number grew since
  let missingSince = 0;
  let lastKey = '';
  let focusNext = false;
  let scrollNext = false;
  let switchSeen = false; // the state of the switch "Hiện cửa sổ đăng nhập" at the last look: when it flips, the light moves to the table and the page brings the first row into view once
  let raising = false; // a scroll of the page to make room for the popup is under way
  let raisedFor = ''; // the step the page was already raised for: ONE raise per step (see draw), never a chase
  let ownScroll = 0; // the time until which a scroll event is the tour's own (it must not call refresh again for it)
  let timer = null;
  let resizer = null;
  const $ = (id) => doc.getElementById(id);
  const notify = () => { try { onChange(); } catch (err) { console.error('Guide: onChange failed', err); } }; // a listener that throws never breaks the tour
  // section: which page of Setup is open: 'proxy' (Kho proxy), 'settings' (Cài đặt) or 'accounts' (a platform page). Only 'proxy' changes the walk (guide-tour-steps.js); 'settings' counts as 'accounts'.
  const screen = () => ({ view: $('view-setup') && !$('view-setup').hidden ? 'setup' : 'other', section: $('mount-proxies') && !$('mount-proxies').hidden ? 'proxy' : 'accounts' });
  const onSettings = () => !!$('su-settings') && !$('su-settings').hidden;
  const usable = (n) => { const r = n.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (typeof n.checkVisibility !== 'function' || n.checkVisibility()); };
  const showOn = () => !!$('su-show-box')?.checked; // the switch "Hiện cửa sổ đăng nhập": once it is on the captcha hint points at the table (waitHints)
  const targetsOf = (step, list) => (step === 'wait' ? modelFor(step, { steps: list, showOn: showOn() }).targets : STEPS[step]?.targets ?? []);
  const found = (step, list = steps()) => targetsOf(step, list).map((sel) => doc.querySelector(sel)).filter((n) => n && usable(n));
  // The box the hole is cut to: the scrolling page of Setup (below the header) while it is the open view AND every circled element lives in it, else the window. The hole of a table that is
  // taller than the page never runs over the header (guide-geometry.js holeOf). An element OUTSIDE the page is not cut to it: the last step circles #nav-create, which is in the header, and a
  // hole cut to the page below it would be empty (found by the harness: no hole, the whole window dark, the button covered).
  const clipBox = (els) => {
    const page = $('view-setup');
    if (!page || page.hidden || !els.length || !els.every((n) => page.contains(n))) return null;
    const r = page.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
  };
  // The controls the person can type in or press INSIDE the circled elements (not whatever lies in the box around them: the switch "Hiện cửa sổ đăng nhập" sits in the middle of that box on
  // step 3 and is not part of the step) AND inside the bright hole, in the order of the page: the Tab key goes through them, then through the popup (guide-spotlight.js tabRing). The review: with
  // every control of the box in the ring, Tab went round "Seedance > the switch > Seedance" and never reached "Thêm vào danh sách". A row of a long table that the hole does not reach (it is
  // under the dark layer, the person cannot click it) is not in the ring either: with 25 accounts the e2e needed 100 Tab presses to get from the table to the popup.
  const insideHole = (els) => () => {
    const found_ = [];
    for (const n of els) for (const t of (n.matches?.(TABBABLE) ? [n] : []).concat([...n.querySelectorAll(TABBABLE)])) if (!found_.includes(t)) found_.push(t);
    const clip = clipBox(els);
    const area = clip ?? { left: 0, top: 0, width: win.innerWidth, height: win.innerHeight };
    const lit = (r) => r.width > 0 && r.top >= area.top - 1 && r.top + r.height <= area.top + area.height + 1 && r.left >= area.left - 1 && r.left + r.width <= area.left + area.width + 1;
    return found_.filter((n) => !n.closest?.('.guide-tour') && lit(n.getBoundingClientRect()) && (typeof n.checkVisibility !== 'function' || n.checkVisibility()))
      .sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)); // DOCUMENT_POSITION_FOLLOWING = 4: a comes before b
  };

  const proxyForms = () => doc.querySelector('#mount-proxies .px-notes li')?.textContent || '';
  // the accounts page, by the code (the row of the platform that was open), when the tour leaves the proxy page or the settings page
  const accountsTab = () => { if (screen().view === 'setup' && (screen().section === 'proxy' || onSettings())) $('su-tab-accounts')?.click(); };
  // the block "Thêm tài khoản" is folded once the platform has an account: the add step needs the paste box in sight
  function enter(step) {
    cur = step;
    missingSince = 0;
    focusNext = true;
    scrollNext = true;
    raisedFor = ''; // a new step may raise the page once
    switchSeen = showOn();
    if (step === 'add' || step === 'wait') accountsTab();
    watch();
  }

  // What the "Tiếp" button does for the circled step: the same thing the click on the real button would do, then the next step.
  function advance() {
    const list = steps();
    if (!canAdvance(cur, list)) return;
    if (cur === 'setup') showView('setup');
    else if (cur === 'proxyTab') $('su-tab-proxy')?.click();
    else if (cur === 'done') { showView('create'); finish(); return; }
    enter(forward(cur));
    refresh();
  }
  const handlers = {
    onButton(id) {
      if (id === 'yes') { begin(); return; }
      if (id === 'no') { onSkip(); close(); return; }
      if (id === 'skipProxy') { enter('add'); refresh(); return; }
      if (id === 'next') advance();
    },
    onSkip() { onSkip(); close(); },
    onClose() { close(); },
  };

  function draw(list) {
    const els = cur === 'ask' ? [] : found(cur, list);
    const key = `${cur}|${JSON.stringify(screen())}`;
    if (key !== lastKey) { lastKey = key; missingSince = 0; } // a new step or another page: the wait for the button starts again
    if (!els.length && cur !== 'ask' && !missingSince) missingSince = Date.now();
    if (els.length) missingSince = 0;
    const pending = cur !== 'ask' && !els.length && Date.now() - missingSince < waitMs;
    if (showOn() !== switchSeen) { switchSeen = showOn(); scrollNext = true; if (cur === 'wait' && switchSeen) accountsTab(); } // the switch is on (it lives on the Cài đặt page): back to the table, where "Kiểm tra" is
    // once the switch is on, the light is on the table and the page brings its FIRST ROW into view (it holds "Kiểm tra"); every other look brings the first circled element, once per step
    const lead = (cur === 'wait' && showOn() && doc.querySelector('#su-table tbody tr')) || els[0];
    if (scrollNext && lead) { lead.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); scrollNext = false; ownScroll = Date.now() + 300; }
    // The hole circles as many of the step's controls as the popup still fits beside: when it does not, the LAST ones are dropped one by one (the format line of step 3 first), and what the
    // hole holds is what the Tab key goes through. A step that has to drop all but the first still circles that one.
    let use = els;
    let rect = els.length ? union(els.map((n) => n.getBoundingClientRect())) : null;
    const show = () => spotlight.show({ model: modelFor(cur, { steps: list, forms: proxyForms(), showOn: showOn() }), rect, clip: clipBox(use), pending, handlers, focus: focusNext, inside: insideHole(use) });
    show();
    while (rect && !spotlight.fits() && use.length > 1) { use = use.slice(0, -1); rect = union(use.map((n) => n.getBoundingClientRect())); show(); }
    focusNext = false;
    // Still no side where the popup fits whole (a tall box low on the page): scroll the page so the box rises, which makes room. ONCE per step (raisedFor): a person who scrolls the page
    // back up must not be pulled down again (the review: the page chased the table to the bottom every 200 ms, 17 moves in 3 s, and undid a scroll up of 600 px).
    if (els.length && !spotlight.fits() && rect && !raising && raisedFor !== cur) {
      const page = $('view-setup');
      if (page && !page.hidden && page.scrollTop + page.clientHeight < page.scrollHeight) {
        raisedFor = cur;
        raising = true;
        ownScroll = Date.now() + 400;
        page.scrollBy({ top: Math.max(40, Math.min(rect.top - 80, 240)) });
        win.setTimeout(() => { raising = false; refresh(); }, 120);
      }
    }
  }

  // Looks at the real state and draws. clicked = a real click just landed on the circled button.
  function refresh(clicked = false) {
    if (cur === null) return;
    if (doc.body?.dataset?.auth && doc.body.dataset.auth !== 'main') { close(); return; } // signed out or locked: the app screen is not there
    try {
      const list = steps();
      const next = cur === 'ask' ? 'ask' : nextStep({ cur, steps: list, screen: screen(), start, clicked });
      if (next === 'finished') { finish(); return; }
      if (next !== cur) enter(next);
      draw(list);
    } catch (err) {
      console.error('Guide: the tour failed', err); // the tour ends, the app goes on as before
      close();
    }
  }

  function onClick(ev) { // capture phase, the click goes on to the real button; the tour looks AFTER it (a macrotask: the bubble-phase handler of the button runs first)
    if (cur === null || cur === 'ask' || spotlight.contains(ev.target)) return;
    const at = cur;
    // The click counts only for the step it was made on: a button of step 3 whose job makes the tour run on to the last step (an account that is ready at once) must not also "press"
    // the circled Tạo video of step 5 (found in the real app: the tour ended by itself right after "Thêm vào danh sách").
    if (found(at).some((n) => n.contains(ev.target))) win.setTimeout(() => refresh(cur === at), 0);
  }
  const onMove = () => refresh();
  const onScroll = () => { if (Date.now() < ownScroll) return; refresh(); }; // the tour's own scroll is already drawn by the look that made it
  function watch() {
    resizer?.disconnect();
    if (typeof win.ResizeObserver === 'function') {
      resizer = new win.ResizeObserver(onMove);
      for (const sel of targetsOf(cur, steps())) { const n = doc.querySelector(sel); if (n) resizer.observe(n); }
    }
  }
  function open(first) {
    start = tally(steps());
    const opening = cur === null;
    if (opening) {
      doc.addEventListener('click', onClick, true);
      win.addEventListener('resize', onMove);
      win.addEventListener('scroll', onScroll, true);
      timer = win.setInterval(onMove, pollMs);
      timer.unref?.(); // Node (the tests) is not kept alive by it; a browser's id is a number
    }
    cur = first;
    if (opening) notify(); // the question / the tour is on: the strip of the card goes (the question, then the tour, count as ONE opening)
    enter(first);
    refresh();
  }
  function close() {
    if (cur === null) return;
    cur = null;
    win.clearInterval(timer);
    timer = null;
    resizer?.disconnect();
    resizer = null;
    doc.removeEventListener('click', onClick, true);
    win.removeEventListener('resize', onMove);
    win.removeEventListener('scroll', onScroll, true);
    spotlight.hide();
    notify(); // the strip of the card may come back
  }
  function finish() { onFinish(); close(); }
  const begin = () => open('setup');
  const ask = () => open('ask');

  return { ask, begin, close, refresh, isOpen: () => cur !== null, step: () => cur };
}
