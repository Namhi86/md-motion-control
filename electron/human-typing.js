/**
 * Nhập lệnh (prompt) vào ô văn bản của Google Flow với tốc độ cao,
 * tránh gọi evalJs kiểm tra DOM trên từng ký tự gây nghẽn ở cửa sổ ẩn.
 */

import { clickPoint } from './click-at.js';
import { evalJs, PAGE_CALL_MS } from './dola-session.js';
import { VIS } from './nano-page.js';
import { randomMs } from '../src/flow-pacing.js';
import { resolvePace } from '../src/human-pace.js';
import { planTyping } from '../src/human-typing.js';

export const PROMPT_LABEL = 'What do you want to create?';

const FINAL_LOOKS = 6;
const FINAL_EVERY_MS = 150;
const SHIFTED = /[A-Z~!@#$%^&*()_+{}|:"<>?]/;

const squash = (s) =>
  String(s ?? '')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const typeable = (ch) =>
  ch.length === 1 &&
  ch >= ' ' &&
  ch !== '\x7f' &&
  !(ch >= '\u0080' && ch <= '\u009f');

const boxState = (scroll) =>
  `(() => { ${VIS}
  const box = [...document.querySelectorAll('[role=textbox], [contenteditable=true], textarea')].filter((e) => vis(e) && e.getBoundingClientRect().width > 50 && e.getAttribute('aria-label') === ${JSON.stringify(PROMPT_LABEL)}).pop();
  if (!box) return null;
  ${scroll ? "box.scrollIntoView({ block: 'center' });" : ''}
  const r = box.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2); const y = Math.round(r.top + r.height / 2);
  const within = (e) => { for (let a = e; a; a = a.parentElement) if (a === box) return true; return false; };
  const top = document.elementFromPoint(x, y);
  const topName = top ? String((top.closest && top.closest('button') ? top.closest('button').innerText : '') || top.getAttribute('aria-label') || top.innerText || top.tagName || '').replace(/\\s+/g, ' ').trim().slice(0, 40) : '';
  return { x, y, onTop: within(top), top: topName, focused: within(document.activeElement), text: box.tagName === 'TEXTAREA' ? String(box.value || '') : String(box.innerText || '') };
})()`;

const FIND = boxState(true);
const LOOK = boxState(false);

const at = (win, expr) =>
  evalJs(win, expr, { timeout: PAGE_CALL_MS }).catch(() => null);

async function pressKey(win, step, holdFn) {
  const wc = win.webContents;
  if (step.op === 'back') {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
    await holdFn();
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
  } else if (!typeable(step.ch)) {
    await wc.insertText(step.ch);
  } else {
    const mods = SHIFTED.test(step.ch) ? { modifiers: ['shift'] } : {};
    for (const type of ['keyDown', 'char']) {
      wc.sendInputEvent({ type, keyCode: step.ch, ...mods });
    }
    await holdFn();
    wc.sendInputEvent({ type: 'keyUp', keyCode: step.ch, ...mods });
  }
}

export async function typePrompt(
  win,
  rawPrompt,
  { pace, signal, log = () => {} } = {}
) {
  const resolved = resolvePace(pace);
  const promptText = String(rawPrompt ?? '');
  const failOut = (note) => ({ ok: false, note });
  const cancelledOut = { ok: false, cancelled: true };

  const sleepAbortable = async (ms) => {
    await resolved.sleep(ms, signal);
    return Boolean(signal?.aborted);
  };

  const randRange = ([low, high]) =>
    randomMs(low, high, resolved.typingRnd ?? resolved.rnd);

  if (!squash(promptText)) {
    return failOut('Lệnh rỗng nên không có gì để gõ vào ô nhập của Flow');
  }

  const found = await at(win, FIND);
  if (!found) {
    return failOut(`Không thấy ô nhập lệnh "${PROMPT_LABEL}" của Flow`);
  }
  if (!found.onTop) {
    return failOut(
      `Có thứ khác nằm đè lên ô nhập lệnh của Flow (${found.top || 'không rõ'}) nên app không gõ`
    );
  }

  await clickPoint(win, found);
  if (await sleepAbortable(randRange(resolved.typing.focusMs))) {
    return cancelledOut;
  }

  const initialLook = await at(win, LOOK);
  if (!initialLook?.focused) {
    return failOut(
      'Bấm vào ô nhập lệnh của Flow mà con trỏ không vào ô nên app không gõ'
    );
  }

  const plan = planTyping(
    promptText,
    resolved.typing,
    resolved.typingRnd ?? resolved.rnd
  );
  const startAt = Date.now();

  for (let i = 0; i < plan.steps.length; i += 1) {
    const step = plan.steps[i];
    const overCap =
      resolved.typing.capMs > 0 &&
      Date.now() - startAt > resolved.typing.capMs;
    if (!overCap && step.waitMs > 0 && (await sleepAbortable(step.waitMs))) {
      return cancelledOut;
    }
    if (signal?.aborted) return cancelledOut;

    // Chỉ kiểm tra lại focus định kỳ mỗi 120 bước (thay vì mỗi ký tự) để tránh nghẽn IPC trên cửa sổ ẩn
    if (i > 0 && i % 120 === 0) {
      const curLook = await at(win, LOOK);
      if (!curLook?.focused) {
        return failOut(
          `Con trỏ rời khỏi ô nhập lệnh của Flow sau ${i} phím nên app dừng gõ`
        );
      }
    }

    try {
      await pressKey(win, step, () =>
        overCap || !(step.holdMs > 0)
          ? Promise.resolve()
          : resolved.sleep(step.holdMs, signal)
      );
    } catch (err) {
      return failOut(
        `Không gõ được phím vào ô nhập của Flow (${String(err?.message || err).slice(0, 80)})`
      );
    }
    if (signal?.aborted) return cancelledOut;
  }

  const prefixText = squash(initialLook.text);
  const targetText = squash(promptText);
  const extractTyped = (lookObj) => {
    const full = squash(lookObj?.text);
    return full.startsWith(prefixText)
      ? full.slice(prefixText.length).trim()
      : full;
  };

  let typedNow = extractTyped(await at(win, LOOK));
  for (
    let attempt = 0;
    attempt < FINAL_LOOKS && typedNow !== targetText && !signal?.aborted;
    attempt += 1
  ) {
    await new Promise((r) => setTimeout(r, FINAL_EVERY_MS));
    typedNow = extractTyped(await at(win, LOOK));
  }

  if (signal?.aborted) return cancelledOut;
  if (typedNow !== targetText) {
    const diffIdx = [...targetText].findIndex((ch, idx) => ch !== typedNow[idx]);
    const pos =
      diffIdx < 0 ? Math.min(targetText.length, typedNow.length) : diffIdx;
    return failOut(
      `Lệnh trong ô nhập của Flow khác lệnh đã gõ (từ ký tự ${pos}: gõ "${targetText.slice(pos, pos + 20)}", ô có "${typedNow.slice(pos, pos + 20)}")`
    );
  }

  const elapsedSec = Math.round((Date.now() - startAt) / 1000);
  log(
    `Veo: gõ ${plan.chars} ký tự, ${plan.typos} lần gõ nhầm rồi xoá, ${elapsedSec} giây`
  );
  return {
    ok: true,
    chars: plan.chars,
    typos: plan.typos,
    seconds: elapsedSec,
  };
}
