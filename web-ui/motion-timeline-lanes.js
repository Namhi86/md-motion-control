import { el } from './pop.js';
import { cellOf, fillLine, fillSound, flowCard, videoCard } from './motion-timeline-cards.js';
import { shotsOf } from './motion-timeline-model.js';
import { t } from './i18n.js';

// The lanes of the Motion control timeline (VIDEO GỐC, ÂM THANH, LỜI THOẠI, FLOW) and the row of shots above them. Every lane is a flex row of clip cells that touch each other, each as wide as its
// clip (seconds x pps), so a row grows to its tallest cell (a long line) and the clips never overlap. The label of a lane is the first, sticky item of its row (LABEL_W wide): an icon, the title
// in small caps and a muted sub-label. The icons are drawn by CSS (motion-timeline.css .cm-lane-ico--*).
export const LABEL_W = 148;

const LANES = {
  pic: [t('VIDEO GỐC'), t('Đoạn của video gốc')],
  snd: [t('ÂM THANH'), t('Sóng âm')],
  say: [t('LỜI THOẠI'), t('Sửa chữ tại chỗ')],
  flow: [t('FLOW'), t('Kết quả tạo')],
};

export const laneRow = (key) => {
  const row = el('div', `cm-lane cm-lane--${key}`);
  const tag = el('div', 'cm-lane-label');
  tag.style.width = `${LABEL_W}px`;
  const [title, sub] = LANES[key] || ['', ''];
  if (title) {
    const words = el('div', 'cm-lane-words');
    words.append(el('span', 'cm-lane-title', title), el('span', 'cm-lane-sub', sub));
    tag.append(el('i', `cm-lane-ico cm-lane-ico--${key}`), words);
  }
  row.append(tag);
  return row;
};

// -> { rows: [node...], cells: [[node...] per clip] }. h = { onPick(i, play) (a line got the focus), onType(i, text), onRetry(i) }; flow = [{ i, state, reason, note }] | null (nothing sent yet)
export function buildLanes({ segs, texts, pending, envelope = [], duration, pps, flow, frames, locked, perClip, h }) {
  const cells = segs.map(() => []);
  const add = (i, c) => { cells[i].push(c); return c; };
  const pic = laneRow('pic');
  const snd = laneRow('snd');
  const say = laneRow('say');
  const fl = laneRow('flow');
  segs.forEach((s, i) => {
    const p = add(i, cellOf('cm-cell--pic', s, pps, i));
    p.append(...videoCard(s, i, frames));
    p.title = t('Đoạn {n}', { n: i + 1 });

    const a = add(i, cellOf('cm-cell--snd', s, pps, i));
    fillSound(a, envelope, s, duration);

    const l = add(i, cellOf('cm-cell--say', s, pps, i));
    fillLine(l, { i, text: texts[i], speed: s.step || s.seconds, pending: pending.has(i), locked, onType: h.onType, onFocus: (k) => h.onPick(k, false) });

    const f = add(i, cellOf('cm-cell--flow', s, pps, i));
    f.append(...flowCard(s, i, flow?.find((x) => x.i === i) || null, perClip, h.onRetry));
  });
  pic.append(...cells.map((c) => c[0]));
  snd.append(...cells.map((c) => c[1]));
  say.append(...cells.map((c) => c[2]));
  fl.append(...cells.map((c) => c[3]));
  return { rows: [pic, snd, say, fl], cells };
}

// The row above the lanes: a quiet band over the clips of ONE shot ("Cảnh 2") so the person sees why they are made one after another.
export function buildShots(segs, pps) {
  const row = laneRow('shot');
  for (const sh of shotsOf(segs)) {
    const w = (segs[sh.last].end - segs[sh.first].start) * pps;
    const b = el('div', `cm-shot${sh.first === sh.last ? ' cm-shot--one' : ''}`, t('Cảnh {n}', { n: sh.n }));
    b.style.width = `${Math.max(1, w)}px`;
    b.title = sh.first === sh.last ? '' : t('Các đoạn {a} đến {b} làm lần lượt, đoạn sau nối tiếp đoạn trước.', { a: sh.first + 1, b: sh.last + 1 });
    row.append(b);
  }
  return row;
}
