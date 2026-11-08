// One popover shared by every picker (model, duration, ratio, Facebook accounts), placed like MD Motion Control's menus:
// under the button, or above it when there is no room below.
const popEl = document.getElementById('pop');
const backdropEl = document.getElementById('backdrop');

export function closePop() {
  popEl.hidden = true;
  backdropEl.hidden = true;
  popEl.replaceChildren();
}

backdropEl.addEventListener('click', closePop);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePop();
});

export function openPop(anchor, nodes, width) {
  popEl.replaceChildren(...nodes);
  popEl.hidden = false;
  backdropEl.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = Math.min(width || r.width, window.innerWidth - 16);
  popEl.style.width = `${w}px`;
  popEl.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - w - 8))}px`;
  const h = popEl.offsetHeight;
  const below = r.bottom + 4 + h <= window.innerHeight - 8;
  popEl.style.top = `${below ? r.bottom + 4 : Math.max(8, r.top - h - 4)}px`;
}

export function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const CHECK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m5 12 5 5 9-11"/></svg>';

// Plain list of choices (ratio): the picked one is lime with a tick.
export function listMenu(items, value, onPick) {
  return items.map((it) => {
    const b = el('button', `cv-res-item${it === value ? ' cv-res-item--on' : ''}`);
    b.type = 'button';
    b.append(el('span', '', it));
    if (it === value) b.insertAdjacentHTML('beforeend', CHECK);
    b.onclick = () => onPick(it);
    return b;
  });
}

// Model rows: name, a short description chip, and a tick on the picked one.
export function modelMenu(models, value, onPick) {
  return models.map((m) => {
    const b = el('button', `cv-model-item${m.id === value ? ' cv-model-item--on' : ''}`);
    b.type = 'button';
    const body = el('span', 'cv-model-body');
    body.append(el('span', 'cv-model-name', m.label));
    const chips = el('span', 'cv-model-chips');
    chips.append(el('span', 'cv-chip', m.desc));
    body.append(chips);
    b.append(body);
    if (m.id === value) b.insertAdjacentHTML('beforeend', CHECK.replace('<svg', '<svg class="cv-model-check"'));
    b.onclick = () => onPick(m.id);
    return b;
  });
}

// Duration track as in cv-duration.vue: a filled bar with a thin handle, 5..30 s.
export function durationTrack({ min, max }, value, onInput) {
  const wrap = el('div', 'cv-duration-track');
  const fill = el('div', 'cv-duration-fill');
  const label = el('span', 'cv-duration-value');
  const input = el('input', 'cv-dur-slider');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = 1;
  const paint = (v) => {
    wrap.style.setProperty('--progress', `${((v - min) / (max - min)) * 100}%`);
    label.textContent = `${v}s`;
  };
  input.value = value;
  paint(value);
  input.oninput = () => {
    paint(Number(input.value));
    onInput(Number(input.value));
  };
  wrap.append(fill, label, input);
  return wrap;
}
