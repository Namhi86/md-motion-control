import { resolveMentions } from './shared/elements.js';
import { closeElementsPopup, openElementsPopup } from './elements-popup.js';
import { createPool } from './elements-pool.js';
import { createPromptEditor } from './prompt-editor.js';
import { mountPromptCards } from './prompt-cards-ui.js';
import { mountElementsTray } from './elements-tray.js';

// The element library in the form: the reference box (#refs) that opens the popup and shows the ticked elements, and the prompt box with chips.
// An app whose core has no window.dola.elements (an older install) gets none of it: the form stays as it was. Returns null then.
// limit(): what the picked mode / Veo model takes per command ({ name, max, veo }); picked(): handles of the loose images picked with the button.
// -> { problems() -> [text] (what stops "Tạo video"), closePopup(), refresh() -> Promise (the library again from main), restore(text) -> [handle],
//      repaint() (the mode or the Veo model changed: the tray's words and the limit line follow) }
export async function initElements({ dola = window.dola, promptEl, limit, picked }) {
  if (!dola.elements) return null;
  const pool = createPool(dola);
  try {
    await pool.load();
  } catch (err) {
    console.error('Elements: the library did not load', err);
    return null;
  }
  const $ = (id) => document.getElementById(id);
  const tray = mountElementsTray({ node: $('refs'), pool, limit, open: () => openElementsPopup({ dola, pool, anchor: document.querySelector('.cv-col') }) });
  const root = $('prompt-editor');
  root.hidden = false;
  promptEl.hidden = true; // the text stays in it, the box draws it
  const editor = createPromptEditor({ textarea: promptEl, root, sugg: $('prompt-sugg'), limitBar: $('prompt-limit'), pool, limit, picked });
  // The cards under the box (one per prompt from 2 prompts on): their chips and "@" list come from the same library.
  let cards = null; // an extra: if it cannot start, the element library and the main box go on without it
  try {
    cards = $('prompt-cards') && mountPromptCards({ box: promptEl, node: $('prompt-cards'), sugg: $('prompt-sugg'), pool, limit, picked });
  } catch (err) {
    console.error('Prompt cards: they did not start', err);
  }
  // A picture may go (or come back) on the disk while the window is open: read the library again when the window gets the focus.
  window.addEventListener('focus', () => { pool.refresh().catch(() => {}); });
  return {
    problems: editor.problems,
    closePopup: closeElementsPopup,
    refresh: () => pool.refresh(),
    repaint() {
      tray.repaint();
      editor.repaintLimit();
      cards?.repaint();
    },
    // "Tạo lại": the prompt came back into the box. Ticks the elements it mentions in the tray; returns the handles that are no
    // longer in the library (they stay as plain text).
    restore(text) {
      const { elements, unknown } = resolveMentions(text, pool.library());
      pool.select(elements.map((e) => e.id));
      return unknown;
    },
  };
}
