import { NO_READY_WAIT, NO_READY_WHY } from './guide-content.js';
import { canCreate } from './guide-state.js';

// The SOFT lock of the "Tạo" button while no account is ready (plans/261020-1535-md-motion-onboarding-wizard): the button is dimmed and a line under it says why.
// The press still goes through (a prompt may be queued to wait for an account: app.js tells so after queuing), and the core stays the real gate.
// The line goes into a FREE line only: a message that is already in warnEl (the queue's "Đã xếp N lệnh", a warning of the form) is never overwritten, and only our own
// two lines are ever taken away or swapped. Pure DOM-in, DOM-out: tests/guide-lock.test.js drives it with a stand-in page.
//   createLock({ generateBtn, warnEl, getAccounts }) -> { paint() }      getAccounts() = the list the wizard holds (null = not read yet: nothing is locked)
export const LOCK_EVERY_MS = 2000; // a rest that ends turns an account "Sẵn sàng" with no event from the core: the screen looks again (setup.js does it every second)
const OURS = new Set([NO_READY_WHY, NO_READY_WAIT]);

export function createLock({ generateBtn, warnEl, getAccounts }) {
  function paint() {
    const { ok, why } = canCreate(getAccounts());
    generateBtn?.classList.toggle('guide-locked', !ok);
    if (!warnEl) return;
    const shown = warnEl.textContent;
    if (OURS.has(shown)) {
      if (shown !== why) warnEl.textContent = why; // one of ours: swap it for the right one, or take it away once an account is ready
    } else if (!shown && why) {
      warnEl.textContent = why; // a free line
    }
  }
  return { paint };
}
