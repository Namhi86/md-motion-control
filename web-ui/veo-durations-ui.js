import { el } from './pop.js';
import { t } from './i18n.js';
import { hasResolutionChoice, priceOf, priceText, resolutionsOf } from './veo-durations.js';

// The duration popover of a Veo model whose core says its lengths (options().veo.models[].durations): the lengths THAT model offers as separate buttons (Omni 4 / 6 / 8 / 10, Veo 3.1 only 8),
// for a model with a choice of resolutions a second row (720p, 360p), and the price of the chosen cell in Flow credits. The rules are in veo-durations.js (pure, tested); this file only draws.
// get() -> { duration, resolution }  set({ duration } | { resolution })  withResolution: false hides the resolution row ("Phân tích video" sends no resolution: its clips are made at 720p, the price shown is that one).
const NOTE_CHOICE = () => t('Giá tính cho 1 clip bằng credit Flow của acc Gmail; 360p rẻ hơn nhưng kém nét hơn.');
const NOTE_LENGTHS = () => t('Giá tính cho 1 clip 720p bằng credit Flow của acc Gmail.');
const NOTE_FIXED = () => t('Veo 3.1 chỉ làm clip 8 giây ở 720p.');

function row(labels, current, onPick, ariaLabel) {
  const box = el('div', 'cv-seg');
  box.setAttribute('role', 'group');
  box.setAttribute('aria-label', ariaLabel);
  for (const [value, label] of labels) {
    const on = value === current;
    const b = el('button', `cv-seg-btn${on ? ' cv-seg-btn--on' : ''}`, label);
    b.type = 'button';
    b.dataset.value = String(value);
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => onPick(value);
    box.append(b);
  }
  return box;
}

export function veoDurationPop({ model, get, set, withResolution = true }) {
  const box = el('div', 'cv-veo-dur');
  const render = () => {
    const cur = get();
    const choice = withResolution && hasResolutionChoice(model);
    const nodes = [
      el('p', 'cv-pop-head', t('Chọn thời lượng')),
      row(model.durations.map((s) => [s, `${s}s`]), cur.duration, (s) => { set({ duration: s }); render(); }, t('Thời lượng')),
    ];
    if (choice) {
      nodes.push(
        el('p', 'cv-pop-head cv-pop-head--sub', t('Độ phân giải')),
        row(resolutionsOf(model).map((r) => [r, r]), cur.resolution, (r) => { set({ resolution: r }); render(); }, t('Độ phân giải')),
      );
    }
    const price = priceOf(model, { resolution: choice ? cur.resolution : undefined, seconds: cur.duration });
    if (price !== null) nodes.push(el('p', 'cv-veo-price', priceText(price)));
    nodes.push(el('p', 'cv-pop-note', choice ? NOTE_CHOICE() : model.durations.length > 1 ? NOTE_LENGTHS() : NOTE_FIXED()));
    box.replaceChildren(...nodes);
  };
  render();
  return [box];
}
