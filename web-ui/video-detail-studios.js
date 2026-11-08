import { el } from './pop.js';
import { tx } from './i18n.js';
import { STUDIOS } from './shared/qm-studios.js';
import { HANDOFF_TEXT, STUDIO_TEXT } from './ui-text.js';
import { answerView, canCopy, canSend, cardState, copyLabel, phaseText } from './video-detail-studio-info.js';

// Khối nút sao chép lời nhắc trong bảng chi tiết video
const COPY_RESET_MS = 1500;
const states = new Map();
let mounted = null;
let subscribed = false;

const button = (cls, text) => Object.assign(el('button', cls, text), { type: 'button' });

function subscribe() {
  if (subscribed) return;
  subscribed = true;
  if (typeof window.dola?.library?.onHandoff !== 'function') return;
  try {
    window.dola.library.onHandoff((e) => {
      const st = typeof e?.taskId === 'string' ? states.get(e.taskId) : null;
      if (!st?.phase) return;
      st.phase = e.phase;
      if (mounted?.taskId === e.taskId) mounted.paint();
    });
  } catch (err) {
    console.error('dola.library.onHandoff() failed', err);
  }
}

export function studiosBlock(task) {
  if (!canSend(window.dola)) return null;
  subscribe();
  if (!states.get(task.id)?.phase) states.delete(task.id);
  const grid = el('div', 'vd-cards');
  const status = el('p', 'vd-status');
  status.setAttribute('role', 'status');
  const signIn = button('vd-btn vd-signin', STUDIO_TEXT.signIn);
  signIn.hidden = true;
  const cards = STUDIOS.map((studio) => {
    const b = button('vd-card');
    b.dataset.studio = studio.key;
    const sub = el('span', 'vd-card-s');
    b.append(el('span', 'vd-card-t', tx(studio.label)), sub);
    b.onclick = () => { send(studio, b).catch((err) => console.error('sendToMdStudio failed', err)); };
    return { studio, b, sub };
  });
  grid.append(...cards.map((c) => c.b));

  function paint() {
    const st = states.get(task.id);
    const sending = !!st?.phase;
    for (const { studio, b, sub } of cards) {
      const base = cardState(task, studio);
      const mine = sending && st.key === studio.key;
      b.disabled = sending || base.disabled;
      b.classList.toggle('vd-card--busy', mine);
      b.setAttribute('aria-busy', String(mine));
      sub.textContent = mine ? STUDIO_TEXT.sending : base.disabled ? HANDOFF_TEXT[base.reason] : tx(studio.desc);
    }
    const view = sending ? null : st?.view;
    status.textContent = sending ? phaseText(st.phase) : view?.text || '';
    status.classList.toggle('vd-status--err', !!view && !view.ok);
    signIn.hidden = !view?.signIn;
  }

  async function send(studio, card) {
    if (states.get(task.id)?.phase) return;
    const hadFocus = document.activeElement === card;
    states.set(task.id, { key: studio.key, phase: 'start' });
    paint();
    let answer;
    try {
      answer = await window.dola.library.sendToMdStudio(task.id, studio.key);
    } catch (err) {
      console.error('dola.library.sendToMdStudio() failed', err);
      answer = { ok: false, reason: 'server' };
    }
    states.set(task.id, { key: studio.key, phase: null, view: answerView(answer, studio) });
    if (mounted?.taskId !== task.id) return; // the panel was closed; opened again it shows the answer
    mounted.paint();
    if (hadFocus && card.isConnected) mounted.focusCard(studio.key); // a disabled button drops the focus: give it back to the card that was pressed
  }

  signIn.onclick = async () => {
    if (typeof window.dola?.auth?.login !== 'function') return;
    signIn.disabled = true;
    try {
      const r = await window.dola.auth.login();
      if (r?.ok) { states.delete(task.id); paint(); } // signed in again: the old answer no longer applies
    } catch (err) {
      console.error('dola.auth.login() failed', err);
    } finally {
      signIn.disabled = false;
    }
  };

  const sec = el('section', 'vd-sec vd-studios');
  sec.append(el('h3', 'vd-h', STUDIO_TEXT.title), grid, status, signIn);
  mounted = { taskId: task.id, paint, focusCard: (key) => cards.find((c) => c.studio.key === key)?.b.focus() };
  paint();
  return sec;
}

// The panel closed: the block is no longer on the screen (a send that is still running goes on and is shown again when the panel opens).
export function unmountStudios() {
  mounted = null;
}

// The Chép button of the MÔ TẢ box, or null when the core has no copyPrompt. The core copies the task's own prompt: no text is passed.
export function copyButton(task) {
  if (!canCopy(window.dola)) return null;
  const b = button('vd-copy', STUDIO_TEXT.copy);
  let timer = 0;
  b.onclick = async () => {
    let answer;
    try {
      answer = await window.dola.library.copyPrompt(task.id);
    } catch (err) {
      console.error('dola.library.copyPrompt() failed', err);
    }
    b.textContent = copyLabel(answer);
    clearTimeout(timer);
    timer = setTimeout(() => { b.textContent = STUDIO_TEXT.copy; }, COPY_RESET_MS);
  };
  return b;
}
