import { el } from './pop.js';

// Small builders shared by the parts of the "Phân tích video" tab. Text goes in with textContent only (it can come from the library or from the core).

// A labelled row: the label on top, the controls under it.
export function field(label, ...nodes) {
  const row = el('div', 'an-field');
  row.append(el('span', 'an-label', label), ...nodes);
  return row;
}

export const button = (text, className = 'an-btn', onClick = null) => {
  const b = Object.assign(el('button', className, text), { type: 'button' });
  if (onClick) b.onclick = onClick;
  return b;
};

// A row of buttons. items: [{ id, label, title? }]. get() gives what is on (an id, or an array of ids when multi). paint() redraws from get(); button(id) is one of them.
export function segmented(items, get, pick, { multi = false } = {}) {
  const node = el('div', 'an-seg');
  const buttons = items.map((it) => {
    const b = button(it.label, 'an-btn an-btn--sm', () => pick(it.id));
    if (it.title) b.title = it.title;
    node.append(b);
    return [it.id, b];
  });
  const byId = new Map(buttons);
  const paint = () => {
    const on = get();
    for (const [id, b] of buttons) {
      const isOn = multi ? on.includes(id) : on === id;
      b.classList.toggle('an-btn--on', isOn);
      b.setAttribute('aria-pressed', String(isOn));
    }
  };
  paint();
  return { node, paint, button: (id) => byId.get(id) };
}

// A line of text under a control that is empty (and takes no room) until it has something to say.
export function noteLine(className = 'an-note') {
  const node = el('p', className);
  return { node, set(text) { node.textContent = text || ''; node.hidden = !text; } };
}
