// The thread-count choice of the "Số luồng chạy cùng lúc" popup: a row of fixed numbers and a box for any other number.
// The machine only SUGGESTS a number (settings().machine.cap); the person decides, and a number above the suggestion is allowed, with a warning.
// The rules are pure (tested without a window); threadPicker() only draws them with the `el` helper handed in (pop.js touches `document` the moment it loads).
import { t } from './i18n.js';

export const THREAD_CHOICES = Object.freeze([1, 3, 5, 10, 15, 20, 50, 100]);
export const MAX_THREADS = 100; // the most the queue settings accept (src/scheduler-settings.js MAX_WORKERS)
export const BAD_NUMBER = t('Nhập số nguyên từ 1 đến 100.');

// A typed value (the text of the box, or a number) -> { ok: true, n } for a whole number from 1 to 100, { ok: false } for anything else.
export function parseThreads(value) {
  let n = NaN;
  if (typeof value === 'number') n = value;
  else if (typeof value === 'string' && /^\d+$/.test(value.trim())) n = Number(value.trim());
  return Number.isInteger(n) && n >= 1 && n <= MAX_THREADS ? { ok: true, n } : { ok: false };
}

// Is the chosen number above what the machine suggests? Automatic (0), no suggestion from the core, or a number that is not a thread count: no.
export const overSuggestion = (chosen, cap) => Number.isInteger(chosen) && chosen > 0 && Number.isFinite(cap) && chosen > cap;
export const overNote = (chosen, cap) => t('Bạn chọn {chosen}, máy gợi ý {cap}: có thể chậm hoặc treo máy.', { chosen, cap });

// -> { chips, form }: the row of fixed numbers (the current one lit) and the box + "Áp dụng" + the red line. onPick(n) gets a valid number.
// A bad value shows BAD_NUMBER under the box and picks nothing.
export function threadPicker({ el, current, onPick }) {
  const chips = el('div', 'qt-chips qt-chips--picker');
  for (const n of THREAD_CHOICES) {
    const c = el('button', `qt-chipbtn${current === n ? ' qt-chipbtn--on' : ''}`, String(n));
    c.type = 'button';
    c.onclick = () => onPick(n);
    chips.append(c);
  }
  const input = el('input', 'qt-num-input');
  input.type = 'number';
  input.min = String(1);
  input.max = String(MAX_THREADS);
  input.step = String(1);
  input.inputMode = 'numeric';
  input.placeholder = t('Số khác');
  input.setAttribute('aria-label', t('Số luồng khác'));
  const apply = el('button', 'qt-num-btn', t('Áp dụng'));
  apply.type = 'button';
  const bad = el('p', 'qt-num-bad');
  const submit = () => {
    const r = parseThreads(input.value);
    bad.textContent = r.ok ? '' : BAD_NUMBER;
    if (r.ok) onPick(r.n);
  };
  apply.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    submit();
  };
  input.oninput = () => { bad.textContent = ''; };
  const row = el('div', 'qt-num');
  row.append(input, apply);
  const form = el('div', 'qt-num-form');
  form.append(row, bad);
  return { chips, form };
}
