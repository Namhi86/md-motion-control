import { ct } from './core-text.js';
import { HELP, TITLE, museParallelOf, saveMuseParallel } from './muse-parallel-setting.js';

// The DOM of the "Số lệnh cùng lúc mỗi acc Muse" row (the rules and sentences are in muse-parallel-setting.js). Draws only; setup.js says when the Muse tab is open.
// nodes: { row, box, name, help, msg } (the elements of index.html); queue: window.dola.queue; errText: the shared error sentence.
// -> { load(), show(onMuseTab) }. The row is visible only on the Muse tab AND only when the core reports the setting (an older core has none: nothing is drawn).
export function mountMuseParallel({ row, box, name, help, msg }, queue, errText) {
  let value = null; // what the core holds, null = this core does not report it
  let onMuseTab = false;
  name.textContent = TITLE;
  help.textContent = HELP;
  const paint = () => { row.hidden = !(onMuseTab && value !== null); };
  const say = (text, bad = false) => {
    msg.textContent = text;
    msg.hidden = !text;
    msg.classList.toggle('stp-msg--bad', bad);
    box.classList.toggle('su-muse-par-box--bad', bad);
  };
  box.onchange = async () => {
    const r = await saveMuseParallel(queue, box.value, errText);
    if (r.ok) {
      value = r.value;
      box.value = String(r.value);
      say('');
      return;
    }
    box.value = value === null ? '' : String(value); // the number the core still holds, never one it refused
    say(ct(r.note), true);
  };
  return {
    async load() {
      try {
        value = museParallelOf(await queue.settings());
      } catch {
        value = null; // the queue is not up yet: the row stays hidden until the next time the page opens
      }
      if (value !== null) box.value = String(value);
      paint();
    },
    show(open) {
      onMuseTab = open === true;
      paint();
    },
  };
}
