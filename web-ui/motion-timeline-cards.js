import { el } from './pop.js';
import { button } from './analyze-controls.js';
import { canRetry, decimal, lineWarning, rateClass, rateText, secondsText, stateText, wordsPerSecond } from './motion-form.js';
import { t } from './i18n.js';

// The cards of the Motion control timeline (what each lane draws per clip), Toby-style: a thumbnail with its time range on it, the name "Đoạn N" with a status dot, a muted caption and a chip with the
// length. The state is told by the dot and the caption only (no bar under the card). Below MIN_CARD pixels (a zoomed-out timeline) the cell is "tight": thumbnail and number only. Text goes in with textContent only.
export const MIN_CARD = 168;

// the five looks of a clip: grey (waiting) / amber (working) / green (ok) / red (failed), the source clip is always ok
const LOOK = { waiting: 'wait', cutting: 'work', queued: 'work', making: 'work', done: 'ok', failed: 'bad', cancelled: 'bad' };
export const lookOf = (clip) => LOOK[clip?.state] || 'wait';

export const cellOf = (cls, s, pps, i) => {
  const width = Math.max(1, (s.end - s.start) * pps);
  const c = el('div', `cm-cell ${cls}${width < MIN_CARD ? ' cm-cell--tight' : ''}`);
  c.style.width = `${width}px`;
  c.dataset.clip = String(i);
  return c;
};
export const rangeText = (s) => `${decimal(s.start)}–${decimal(s.end)}s`;

const dot = (look) => el('i', `cm-dot cm-dot--${look}`);
const nameRow = (i, look) => {
  const row = el('p', 'cm-card-name');
  row.append(el('span', 'cm-card-title', t('Đoạn {n}', { n: i + 1 })), dot(look));
  return row;
};

// The picture lane: a frame of the source video (or a soft gradient with the number while it is not drawn / cannot be)
export function videoCard(s, i, frames) {
  const card = el('div', 'cm-card');
  const thumb = el('div', 'cm-pic');
  thumb.append(el('b', 'cm-pic-n', String(i + 1)));
  if (frames) thumb.append(frames.canvasFor(s.start));
  thumb.append(el('span', 'cm-range', rangeText(s)));
  const text = el('div', 'cm-card-text');
  text.append(nameRow(i, 'ok'), el('p', 'cm-card-cap', t('Video gốc')), el('span', 'cm-dur', secondsText(s.end - s.start)));
  card.append(thumb, text);
  return [card];
}

// The short word under the name; the long reason (a refusal, a missing credit) goes in a note under it.
export const captionOf = (clip) => {
  if (!clip || clip.state === 'waiting') return t('Đang chờ');
  if (clip.state === 'failed') return t('Lỗi');
  if (clip.state === 'cancelled') return t('Đã huỷ');
  return clip.state === 'done' ? t('Đã tạo') : stateText(clip);
};
const longNote = (clip) => {
  if (!clip || !['failed', 'cancelled', 'waiting'].includes(clip.state)) return '';
  const said = stateText(clip);
  return clip.state === 'waiting' && said === t('Đang chờ') ? '' : said; // a waiting clip says more only when the core gave it a sentence
};

// The FLOW lane: no picture of the made clip is known, so the tile is a calm glyph of the state (clock / spinner / tick / cross)
export function flowCard(s, i, clip, perClip, onRetry) {
  const look = lookOf(clip);
  const card = el('div', `cm-card cm-card--flow cm-card--${look}`);
  const thumb = el('div', 'cm-pic cm-pic--flow');
  thumb.append(el('i', `cm-glyph cm-glyph--${look}`), el('span', 'cm-range', rangeText(s)));
  const text = el('div', 'cm-card-text');
  text.append(nameRow(i, look), el('p', `cm-card-cap cm-cap cm-cap--${clip?.state || 'waiting'}`, captionOf(clip)));
  card.append(thumb, text);
  const note = longNote(clip);
  if (note && note !== captionOf(clip)) { const n = el('p', 'cm-flow-note', note); n.title = note; card.append(n); } // the long reason spans the whole card, under the picture and the name
  if (canRetry(clip)) card.append(button(t('Làm lại đoạn này ({price} credit)', { price: perClip }), 'an-btn an-btn--sm cm-retry', () => onRetry(i)));
  return [card];
}

// The sound lane: the loudness of the clip, bars with round caps; the cell is the card
export function fillSound(cell, envelope, s, duration) {
  const n = envelope.length;
  const from = Math.round((s.start / duration) * n);
  const to = Math.max(from + 1, Math.round((s.end / duration) * n));
  for (const v of envelope.slice(from, to)) {
    const b = el('i', 'cm-bar');
    b.style.height = `${Math.max(8, Math.round(v * 100))}%`;
    b.style.background = `hsl(220 5% ${30 + Math.round(v * 42)}%)`; // lighter where it is louder
    cell.append(b);
  }
}

// The line lane: the text of the clip in an editable box and the words a second as a soft pill; the cell is the card
export function fillLine(cell, { i, text, speed, pending, locked, onType, onFocus }) {
  const box = Object.assign(el('textarea', 'an-input cm-line'), { value: text || '', rows: 2, maxLength: 600 });
  box.placeholder = pending ? t('đang chép lời…') : t('Không có lời: nhân vật chỉ diễn lại động tác. Gõ vào đây nếu muốn nhân vật nói.');
  box.disabled = locked || pending;
  const badge = el('span', 'cm-rate');
  const paintRate = () => {
    const rate = wordsPerSecond(box.value, speed);
    badge.className = `cm-rate cm-rate--${rateClass(rate)}`;
    badge.textContent = rate > 0 ? rateText(rate) : '';
    badge.title = lineWarning(box.value, speed);
  };
  box.oninput = () => { onType(i, box.value); paintRate(); };
  box.onfocus = () => onFocus(i);
  paintRate();
  cell.append(box, badge);
}
