import { el } from './pop.js';

// The DOM of the "how to add" buttons of the Setup screen (the platform rows are setup-side.js). Draws only; setup-add.js owns the state and passes the clicks in.

// The buttons that pick the way of adding an account on the open tab: kinds = [[key, text], …].
export function paintKindButtons(box, kinds, current, onPick) {
  box.replaceChildren();
  for (const [key, text] of kinds) {
    const on = key === current;
    const b = el('button', `stp-btn stp-btn--sm${on ? ' stp-btn--on' : ''}`, text);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(on));
    b.onclick = () => onPick(key);
    box.append(b);
  }
}
