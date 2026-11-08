import { LOCK_EVERY_MS, createLock } from './guide-lock.js';
import { readFlags, shouldAutoOpen, wizardSteps, writeFlag } from './guide-state.js';
import { TOUR_FLAG, tourDone } from './guide-tour-steps.js';
import { createTour } from './guide-tour.js';

// What app.js starts for the beginner guide (plans/261020-1535-md-motion-onboarding-wizard): the SOFT lock of the "Tạo" button (guide-lock.js), the ONE 2-second timer that keeps it right
// (the core sends no event when a rest ends), and the tour that circles the real buttons (guide-tour.js). It replaces the full-page wizard (Sếp 2026-10-21).
//   initGuide({ dola, showView, generateBtn, warnEl, getEmail, storage, proxySummary, onTourChange, tour }) -> { open, isOpen, close, isBlocked } | null  (null = a core without accounts.list: nothing changes)
//   open()  the tour from step 1 (the header "Hướng dẫn" > "Bắt đầu"), for anybody, any time      isOpen()  the tour (or its question) is on screen
//   isBlocked()  true while the question / the tour is on, AND until start() has decided whether to ask it: the card strip of the Tạo video tab ("Mới dùng? Xem vài điều cần biết.") must not stand
//                beside the question "Bạn là người mới?" (two invitations at once), and must not flash before the question opens (guide-card.js cardView `blocked`)
//   onTourChange()  isBlocked() may have changed (the tour opened / closed, the decision was made): app.js asks the card to look again
// The tour opens by ITSELF as a question ("Bạn là người mới?") only when shouldAutoOpen says so: no account in the list at all, not skipped, not finished, not shown in this window yet.
// "Tôi biết rồi" and "Bỏ qua hướng dẫn" write the flag `skipped` for the e-mail; the circled "Tạo video" writes `cardSeen:tour`; Esc / the cross write nothing.
// Every call into the core is guarded: a failure is logged and the app goes on as before.
let askedInThisWindow = false; // the question showed once in this window (this module loads once per window): closing it must not bring it back

export function initGuide({ dola, showView, generateBtn, warnEl, getEmail, storage, proxySummary, onTourChange = () => {}, tour: makeTour = createTour } = {}) {
  if (typeof dola?.accounts?.list !== 'function') return null;
  const store = storage ?? (() => { try { return localStorage; } catch { return null; } })(); // readFlags / writeFlag cope with a missing or refusing storage
  let accounts = null; // dola.accounts.list(); null until read: then nothing is locked
  let readProxy = () => ({ alive: 0, total: 0 }); // proxySummary() of proxy-ui.js, once that module is in
  let timer = null; // the ONE timer
  let settled = false; // start() has decided whether the question shows (asked, or not for this person)
  const changed = () => { try { onTourChange(); } catch (err) { console.error('Guide: onTourChange failed', err); } };
  const emailNow = () => Promise.resolve(getEmail ? getEmail() : dola.auth.state().then((s) => s?.email || s?.name)).then((mail) => mail || '', (err) => { console.error('Guide: the e-mail was not read', err); return ''; });
  const stepsNow = () => wizardSteps({ proxy: readProxy(), accounts });
  const tour = makeTour({
    steps: stepsNow,
    showView,
    onSkip: async () => { writeFlag(store, await emailNow(), 'skipped'); },
    onFinish: async () => { writeFlag(store, await emailNow(), TOUR_FLAG); },
    onChange: changed,
  });
  const lock = createLock({ generateBtn, warnEl, getAccounts: () => accounts });

  const stopTimer = () => { clearInterval(timer); timer = null; };
  function startTimer() {
    if (timer !== null) return;
    timer = setInterval(() => {
      if (typeof dola.accounts?.list !== 'function') return stopTimer(); // the core is gone: nothing to look at any more
      lock.paint();
      tour.refresh();
    }, LOCK_EVERY_MS);
    timer.unref?.(); // Node (the tests) is not kept alive by it; a browser's id is a number
  }
  // Signed out (or pending): the app screen is not there, the timer stops and the tour closes; signed in again: it goes on from the list the core pushes.
  dola.auth?.onChange?.((state) => {
    if (state?.status === 'signed-in') { if (accounts) startTimer(); } else { stopTimer(); tour.close(); }
  });
  dola.accounts.onChange?.((list) => { if (Array.isArray(list)) accounts = list; lock.paint(); tour.refresh(); });
  dola.proxies?.onChange?.(() => tour.refresh()); // proxy-ui.js keeps the one onProxySummary slot for setup.js: a second subscription to the same event is the safe way to hear a change

  async function start() {
    const first = await dola.accounts.list();
    accounts ??= Array.isArray(first) ? first : null;
    if (!accounts) return; // a list that cannot be read: no lock, no tour, the app as it was
    readProxy = proxySummary ?? (await import('./proxy-ui.js')).proxySummary;
    lock.paint();
    startTimer();
    if (askedInThisWindow) return;
    const flags = readFlags(store, await emailNow());
    if (!tourDone(flags) && shouldAutoOpen({ steps: stepsNow(), skipped: flags.skipped, seenWizard: askedInThisWindow })) {
      askedInThisWindow = true;
      tour.ask();
    }
  }
  start().catch((err) => console.error('Guide: the tour did not start', err)).finally(() => { settled = true; changed(); });

  return { open: () => { askedInThisWindow = true; tour.begin(); }, isOpen: tour.isOpen, close: tour.close, isBlocked: () => !settled || tour.isOpen() };
}
