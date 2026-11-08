import { el } from './pop.js';
import { STORE_TEXT, isUnreviewed, samplesOf } from './shared/skill-store-form.js';
import { t, tn, tx } from './i18n.js';

// One card of the "Kho skill" tab: a muted 9:16 sample video that loops (the sound comes on while the mouse is over it), the title, a short
// description, the modes (Pro / Muse), the author, the uses of the period and the "Dùng skill" button. Everything the server or the core sent is
// put in with textContent (pop.js el()), never as markup. The author label is the one the core sent (a nickname or a masked e-mail): this page never
// builds it. The body of the skill is not in the card at all.
// card: a Card of contracts.md. opts: { rank (1-3 = a top card), period, playback (skills-playback.js), onUse(card), canUse, extras(card) -> [node] }
const MODE_LABEL = { pro: 'Pro', muse: 'Muse' };
const FIRST_FRAME = '#t=0.1'; // a media fragment: a video that is not playing (more than 6 on screen) still shows a picture instead of black

export function usesText(uses, period) {
  const n = Number.isFinite(uses) ? uses : 0;
  if (period === 'week') return tn(n, '{n} lượt tuần này', '{n} use this week', '{n} uses this week');
  if (period === 'month') return tn(n, '{n} lượt tháng này', '{n} use this month', '{n} uses this month');
  return tn(n, '{n} lượt', '{n} use', '{n} uses');
}
const authorLabel = (card) => (typeof card.author?.label === 'string' && card.author.label.trim() ? card.author.label.trim() : t('Người dùng'));

// The video of a card and its way through the samples (a single sample loops; several play one after the other, the dots jump).
function mountMedia(card, playback) {
  const media = el('div', 'sk-media');
  media.title = t('Rê chuột vào để nghe tiếng');
  const list = samplesOf(card);
  if (!list.length) {
    media.append(el('p', 'sk-nomedia', t('Chưa có video mẫu')));
    return media;
  }
  const video = el('video', 'sk-video');
  Object.assign(video, { muted: true, loop: list.length === 1, playsInline: true, preload: 'metadata' });
  video.setAttribute('aria-label', t('Video mẫu của skill {title}', { title: card.title }));
  const dots = list.length > 1 ? el('div', 'sk-dots') : null;
  let at = 0;
  let failed = 0; // samples in a row that did not play
  // A new source stops the video; whether it plays again is the limiter's call (playback.settle), never video.play() from here.
  const show = (i, settle = true) => {
    at = (i + list.length) % list.length;
    video.src = `${list[at].url}${FIRST_FRAME}`; // samplesOf() kept https addresses only
    dots?.childNodes.forEach((d, j) => d.classList.toggle('sk-dot--on', j === at));
    if (settle) playback.settle();
  };
  video.onerror = () => { // a sample that does not play hands over to the next one; when none plays the card keeps its text
    failed += 1;
    if (failed < list.length) show(at + 1);
    else media.replaceChildren(el('p', 'sk-nomedia', t('Không phát được video mẫu')));
  };
  video.onplaying = () => { failed = 0; };
  if (list.length > 1) video.onended = () => show(at + 1);
  if (dots) {
    list.forEach((_, i) => {
      const d = Object.assign(el('button', 'sk-dot'), { type: 'button' });
      d.setAttribute('aria-label', t('Video mẫu {n}', { n: i + 1 }));
      d.onclick = () => { failed = 0; playback.want(video); show(i); }; // the person chose this sample: it takes a slot while the mouse (or the focus) stays
      d.onblur = () => playback.unwant(video);
      dots.append(d);
    });
  }
  media.onmouseenter = () => { // the first user action on this window has happened (the click on the tab), so the sound is allowed
    video.muted = false;
    playback.want(video); // plays it if it is paused, through the limit of 6
  };
  media.onmouseleave = () => {
    video.muted = true;
    playback.unwant(video);
  };
  media.append(video);
  if (dots) media.append(dots);
  playback.watch(video, () => show(0, false)); // playback.js plays it once it is on screen and among the first 6
  return media;
}

export function buildCard(card, { rank = 0, period = 'week', playback, onUse, canUse = true, extras = null } = {}) {
  const top = rank >= 1 && rank <= 3;
  const node = el('article', `sk-card${top ? ' sk-card--top' : ''}`);
  node.dataset.skillId = String(card.id);
  const media = mountMedia(card, playback);
  if (top) media.append(el('span', `sk-rank sk-rank--${rank}`, String(rank)));
  const body = el('div', 'sk-body');
  const modes = el('div', 'sk-modes');
  for (const m of Array.isArray(card.modes) ? card.modes : []) if (MODE_LABEL[m]) modes.append(el('span', `sk-mode sk-mode--${m}`, MODE_LABEL[m]));
  const meta = el('p', 'sk-meta');
  meta.append(el('span', `sk-author${card.author?.kind === 'system' ? ' sk-author--system' : ''}`, authorLabel(card)), el('span', 'sk-uses', usesText(Number(card.uses), period)));
  const use = Object.assign(el('button', 'sk-use', tx(STORE_TEXT.use)), { type: 'button', disabled: !canUse });
  if (!canUse) use.title = tx(STORE_TEXT.needMode);
  use.onclick = () => onUse?.(card);
  body.append(el('h3', 'sk-title', String(card.title ?? '')), modes);
  if (card.description) body.append(el('p', 'sk-desc', String(card.description)));
  if (isUnreviewed(card)) body.append(el('p', 'sk-unreviewed', tx(STORE_TEXT.unreviewed)));
  body.append(meta, use);
  const more = typeof extras === 'function' ? extras(card) : null;
  if (Array.isArray(more) && more.length) body.append(...more);
  node.append(media, body);
  return node;
}
