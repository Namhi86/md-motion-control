import { TOUR_TEXT } from './guide-content.js';

// The steps of the beginner tour (plans/261020-1535-md-motion-onboarding-wizard, "ĐỔI HƯỚNG 2026-10-21"): which real button each step circles, how the tour moves on, and what
// each popup says. PURE: no DOM, no Electron (tests/guide-tour-steps.test.js). The words are in guide-content.js (TOUR_TEXT); the drawing is guide-spotlight.js; the conductor
// is guide-tour.js.
//   ask       the first question, a popup in the middle of the screen (no hole)
//   setup     circles #nav-setup            -> a real click opens Setup
//   proxyTab  circles #su-tab-proxy         -> a real click opens the proxy tab (optional step: "Bỏ qua proxy" leaves it)
//   proxyBox  circles the paste card of the proxy tab -> only "Tiếp" (or leaving the tab) moves on: the person reads the answer under the box first
//   add       circles the platform tabs, the kinds row, the box, the add button and the format line -> an account added moves on
//   wait      circles the line that answers the add, the head of the table and its first rows (+ what a hint points at) -> the first ready account moves on
//   done      circles #nav-create           -> a real click on it ends the tour
export const ORDER = ['ask', 'setup', 'proxyTab', 'proxyBox', 'add', 'wait', 'done'];

// targets: CSS selectors; the hole is the box around ALL the elements they find (null = no hole, the popup sits in the middle). The first match of each selector is used.
export const STEPS = {
  ask: { targets: null },
  setup: { targets: ['#nav-setup'] },
  proxyTab: { targets: ['#su-tab-proxy'] },
  proxyBox: { targets: ['#mount-proxies .stp-card'] }, // the "Thêm proxy" card: the paste box and its button (proxy-ui.js initProxyUi)
  // setup.js: the platform tabs (Seedance | Muse | Veo: an account added on the wrong one is the first mistake of a newcomer), the kinds row, the box, the button "Thêm vào danh sách" and the
  // format line under it. Listed in the order they matter: when the popup cannot fit with all of them the tour drops the LAST ones (guide-tour.js fitTargets), the format line first.
  add: { targets: ['#su-add-pick', '#su-cookies', '#su-add', '#su-plats', '#su-hint'] }, // the core of the step first (kinds, box, button), then the tabs and the format line: the LAST are dropped first when the popup does not fit
  // The row that holds the line that answers the add ("Đã xử lý: thêm 1." / the error) AND the add button stays in the light (the line alone is lower than the button: the hole cut the button in half, seen in the real window), then the title of the table and its first rows: a table taller than the page is circled as far as
  // the page shows it (guide-geometry.js holeOf cuts to the page), not as a wall of rows. waitHints() adds what a hint points at (the switch of the captcha, the tab of Muse).
  wait: { targets: ['#su-add-form .stp-actions', '#su-table-title', '#su-table'] },
  done: { targets: ['#nav-create'] },
};

// What the "Tiếp" button does: the step after this one. 'finished' ends the tour.
const FORWARD = { ask: 'setup', setup: 'proxyTab', proxyTab: 'proxyBox', proxyBox: 'add', add: 'wait', wait: 'done', done: 'finished' };
export const forward = (step) => FORWARD[step] ?? 'finished';

const by = (steps, id) => (Array.isArray(steps) ? steps.find((s) => s?.id === id) : null);

// The three numbers the tour watches, from wizardSteps() of guide-state.js: proxies in the pool, accounts in the list (any state), accounts ready now.
export const tally = (steps) => ({
  proxies: Number(by(steps, 'proxy')?.detail?.total) || 0,
  accounts: Number(by(steps, 'account')?.detail?.total) || 0,
  ready: Number(by(steps, 'ready')?.detail?.ready) || 0,
});

// Does the fallback button "Tiếp" work? Not before there is something to move on from: an account in the list (add), a ready account (wait). The other steps always can.
export function canAdvance(step, steps) {
  if (step === 'add') return tally(steps).accounts >= 1;
  if (step === 'wait') return by(steps, 'ready')?.done === true;
  return true;
}


// What the hints of the wait step point at, besides the table: a captcha account -> the switch "Hiện cửa sổ đăng nhập" (#su-show, on the Cài đặt page: until that page is open the row "Cửa sổ & trình duyệt" of the sidebar, #su-tab-settings, is what is lit) and then the "Kiểm tra" button of the table; a Muse account that
// waits for its code -> the platform tabs (the Muse tab holds its login window and "Đăng nhập"). -> the extra selectors for the hole.
// ONE hole holds them all, and when the popup does not fit the last targets are dropped (guide-tour.js), so the switch and the table are never both lit in a small window. The hole therefore
// follows the NEXT thing the person has to press: while the switch is off it is the switch; once it is on (`showOn`) it is the table, where "Kiểm tra" is (a button under the dark layer
// cannot be pressed: the layer swallows the click).
export function waitHints(steps, { showOn = false } = {}) {
  const d = by(steps, 'ready')?.detail ?? {};
  return [...(d.captcha > 0 && !showOn ? ['#su-show', '#su-tab-settings'] : []), ...(d.code > 0 ? ['#su-plats'] : [])];
}

// The line under the buttons that says why "Tiếp" is off ('' when it works).
export function whyOff(step, steps) {
  if (canAdvance(step, steps)) return '';
  return step === 'add' ? TOUR_TEXT.why.add : TOUR_TEXT.why.wait;
}

// The step the tour should show, from the REAL state, so a person who wandered off (another tab, another view) is never stuck.
//   cur     the step now      steps  wizardSteps()      screen  { view: 'setup' | other, section: 'accounts' | 'proxy' } (which tab of Setup is open)
//   start   tally() taken when the tour began: a step moves on when its number GREW since then (a new person: 0 -> 1; a returning person has to add one more, or press "Tiếp")
//   clicked a real click just landed on the circled element (only the last step uses it)
// One move can start the next (an account added that is ready at once goes add -> wait -> done), so it is repeated until the step stays.
export function nextStep({ cur, steps, screen, start, clicked = false } = {}) {
  const now = tally(steps);
  const base = { ...tally([]), ...start };
  const inSetup = screen?.view === 'setup';
  const proxySide = screen?.section === 'proxy';
  const once = (step, click) => {
    switch (step) {
      case 'setup': return inSetup ? 'proxyTab' : 'setup';
      case 'proxyTab': return !inSetup ? 'setup' : proxySide ? 'proxyBox' : 'proxyTab';
      case 'proxyBox': return !inSetup ? 'setup' : !proxySide ? 'add' : 'proxyBox'; // a proxy added does NOT move it on: the words say "Xong thì bấm Tiếp" and the answer is under the box
      case 'add': return !inSetup ? 'setup' : now.accounts > base.accounts ? 'wait' : 'add';
      case 'wait': return !inSetup ? 'setup' : now.accounts < 1 ? 'add' : now.ready > base.ready ? 'done' : 'wait';
      case 'done': return click ? 'finished' : now.ready < 1 ? 'wait' : 'done';
      default: return step; // 'ask' only moves by its buttons; 'finished' stays
    }
  };
  let step = ORDER.includes(cur) || cur === 'finished' ? cur : 'setup';
  for (let i = 0; i < ORDER.length * 2; i += 1) {
    const next = once(step, clicked && i === 0);
    if (next === step) return step;
    step = next;
  }
  return step;
}

// The person finished the tour (pressed the circled "Tạo video"): kept per e-mail with the card flags of guide-state.js, under the name "tour".
export const TOUR_FLAG = 'cardSeen:tour';
export const tourDone = (flags) => flags?.cardSeen?.tour === true;

// What the popup of a step shows: { id, targets, title, lines: [{ text, tone }], buttons: [{ id, label, kind, disabled }], why, skip, close }. `forms` = the sentence of the proxy page.
//   why    the line that says why "Tiếp" is off ('' when it is on)
//   tone   'plain' | 'hint' (a tip in a box) | 'count' (a number line)      kind  'primary' (the ONE lime button) | 'secondary'
//   skip   the label of the link "Bỏ qua hướng dẫn" (writes the flag; '' = no link)   close  the label of the small cross (closes for now, writes nothing; '' = none)
export function modelFor(step, { steps, forms = '', showOn = false } = {}) {
  const T = TOUR_TEXT;
  const line = (text, tone = 'plain') => ({ text, tone });
  if (step === 'ask') {
    return { id: 'ask', targets: null, title: T.ask.title, lines: [line(T.ask.body)], buttons: [{ id: 'yes', label: T.ask.yes, kind: 'primary' }, { id: 'no', label: T.ask.no, kind: 'secondary' }], skip: '', close: '' };
  }
  const spec = STEPS[step];
  if (!spec) return null;
  const lines = [];
  const text = T[step === 'proxyTab' ? 'proxyTab' : step === 'proxyBox' ? 'proxyBox' : step];
  lines.push(line(text.body));
  if (step === 'proxyBox') lines.push(line(forms || T.proxyBox.forms, 'hint'));
  if (step === 'wait') {
    const d = by(steps, 'ready')?.detail ?? {};
    const counts = T.wait.counts.filter(([key]) => d[key] > 0).map(([key, label]) => line(T.wait.count(label, d[key]), 'count'));
    lines.push(...(counts.length ? counts : [line(T.wait.none, 'count')]));
    if (d.code > 0) lines.push(line(T.wait.codeHint, 'hint'));
    if (d.captcha > 0) lines.push(line(showOn ? T.wait.captchaHintOn : T.wait.captchaHint, 'hint'));
  }
  const buttons = [{ id: 'next', label: step === 'done' ? T.done.next : T.next, kind: 'primary', disabled: !canAdvance(step, steps) }];
  if (step === 'proxyTab') buttons.push({ id: 'skipProxy', label: T.proxyTab.skip, kind: 'secondary' });
  // the control a hint points at comes FIRST in the list of the wait step: it is what the person is told to press, so it is the last one to be dropped when the popup does not fit
  return { id: step, targets: step === 'wait' ? [...waitHints(steps, { showOn }), ...spec.targets] : spec.targets, title: '', lines, buttons, why: whyOff(step, steps), skip: T.skip, close: T.close };
}
