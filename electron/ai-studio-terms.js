// Tự động đồng ý điều khoản sử dụng (18+ & Terms of Service) của Google AI Studio
import { sleepAbortable } from '../src/abortable.js';
import { clickPoint } from './click-at.js';
import { evalJs, PAGE_CALL_MS } from './dola-session.js';
import { CAPS, SIGNALS, termsExpr } from './ai-studio-selectors.js';

const at = (win, expr) => evalJs(win, expr, { timeout: PAGE_CALL_MS }).catch(() => null);

const WANTS = Object.freeze({
  first: (s) => s.first === false,
  other: (s) => s.othersTicked > 0,
  btn: (s) => s.btn === true && s.first === true && s.othersTicked === 0,
});

async function press(win, which) {
  const s = await at(win, termsExpr(which, false));
  if (!s || !WANTS[which](s)) return false;
  if (s.at) {
    await clickPoint(win, s.at);
    await new Promise((r) => setTimeout(r, 180));
  }
  // Kiểm tra lại: nếu click tọa độ chưa ăn (do lớp phủ mat-checkbox), kích hoạt thêm .click() trực tiếp trong DOM
  const after = await at(win, termsExpr(which, false));
  if (after && WANTS[which](after)) {
    await at(win, termsExpr(which, true));
  }
  return true;
}

const whyNot = (s) => (
  !s ? 'covered'
    : s.othersTicked > 0 ? 'optin_stays'
      : s.first === null ? 'no_boxes'
        : s.first === false ? 'not_cleared'
          : s.btn !== true ? 'continue_off'
            : 'not_cleared'
);

async function settles(win, signal, wait, check) {
  for (let i = 0; i < 6 && !signal?.aborted; i += 1) {
    const s = await at(win, termsExpr());
    if (s && check(s)) return true;
    await wait();
  }
  return false;
}

export async function acceptTerms(win, signal, log = () => {}, opts = {}) {
  const {
    readyMs = CAPS.termsReadyMs,
    doneMs = CAPS.termsDoneMs,
    pollMs = 500,
  } = opts;
  const wait = () => sleepAbortable(pollMs, signal);

  if (!(await at(win, termsExpr()))) {
    return { state: 'none' };
  }

  let submitted = false;
  for (const t0 = Date.now(); !submitted && Date.now() - t0 < readyMs && !signal?.aborted; await wait()) {
    const s = await at(win, termsExpr());
    if (!s) continue;
    if (s.othersTicked > 0) {
      if (await press(win, 'other')) {
        await settles(win, signal, wait, (x) => x.othersTicked === 0);
      }
    } else if (s.first === false) {
      if (await press(win, 'first')) {
        await settles(win, signal, wait, (x) => x.first === true);
      }
    } else if (s.first === true && s.btn === true) {
      submitted = await press(win, 'btn');
    }
  }

  if (!submitted) {
    return { state: 'failed', why: whyNot(await at(win, termsExpr())) };
  }

  for (const t0 = Date.now(); Date.now() - t0 < doneMs && !signal?.aborted; await wait()) {
    const sig = await at(win, SIGNALS);
    if (sig?.box && !(await at(win, termsExpr()))) {
      log('AI Studio: acc đồng ý điều khoản lần đầu (tick ô 18 tuổi, bấm Continue tự động)');
      return { state: 'accepted' };
    }
  }

  return { state: 'failed', why: 'not_cleared' };
}
