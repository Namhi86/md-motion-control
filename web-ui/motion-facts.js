import { el } from './pop.js';

// The facts of a video as small chips with an icon (a clock, a frame, a file): "0:28 · 9:16 · 4 MB". The icons are drawn by CSS (motion-panels.css .cm-fact--time ...), the text is real text.
// The " · " between the chips is kept in the page but hidden by CSS, so a screen reader and a copy of the text still read "0:28 · 9:16 · 4 MB".
// node = the element that holds the chips; parts = factsParts() of motion-form.js. An empty list empties the node.
export function paintFacts(node, parts) {
  const kids = [];
  parts.forEach((p, i) => {
    if (i) kids.push(el('span', 'cm-fact-sep', ' · '));
    kids.push(el('span', `cm-fact cm-fact--${p.kind}`, p.text));
  });
  node.replaceChildren(...kids);
}
