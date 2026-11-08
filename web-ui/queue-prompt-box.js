import { splitPrompts } from './shared/prompt-split.js';
import { mountPromptCards } from './prompt-cards-ui.js';
import { t, tn } from './i18n.js';
import { promptCountText } from './ui-text.js';

// The prompt box of the composer: the "N lệnh" counter, the .txt / .csv import and the cards of the prompts. The markup is in index.html.
const MAX_FILE_BYTES = 2 * 1024 * 1024; // 500 prompts are a few hundred KB at most; anything bigger is not a prompt list

const readText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error || new Error('read failed'));
  reader.readAsText(file, 'utf-8');
});

export function initPromptBox() {
  const box = document.getElementById('prompt');
  const count = document.getElementById('prompt-count');
  const input = document.getElementById('import-file');
  const warn = document.getElementById('warn');
  if (!box || !count || !input) return;

  let shown = null;
  const paint = () => {
    if (box.value === shown) return;
    shown = box.value;
    const { prompts, truncated } = splitPrompts(shown);
    count.textContent = promptCountText(prompts.length, truncated);
    count.classList.toggle('cv-prompt-count--bad', truncated);
  };
  box.addEventListener('input', paint);
  // The cards under the box. With the element library they were mounted by elements-ui.js (chips and "@" list); an app without it gets plain cards.
  const cards = document.getElementById('prompt-cards');
  if (cards && !cards.childElementCount) {
    try {
      mountPromptCards({ box, node: cards, sugg: document.getElementById('prompt-sugg') });
    } catch (err) {
      console.error('Prompt cards: they did not start', err); // the counter and the import go on without them
    }
  }
  // renderer.js puts text into the box without an input event (re-run from the list), so the counter also looks every half second.
  setInterval(paint, 500);
  paint();

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = ''; // the same file can be picked again
    if (!file) return;
    const say = (text, ok = false) => {
      if (!warn) return;
      warn.textContent = text;
      warn.classList.toggle('cv-warn--ok', ok && !!text); // the same green as app.js setWarn()
    };
    const csv = /\.csv$/i.test(file.name);
    if (!csv && !/\.txt$/i.test(file.name)) return say(t('Chỉ nhận tệp .txt hoặc .csv.'));
    if (file.size > MAX_FILE_BYTES) return say(t('Tệp quá lớn (tối đa 2 MB).'));
    try {
      const { prompts, truncated } = splitPrompts(await readText(file), { csv, file: true });
      if (!prompts.length) return say(t('Tệp "{name}" không có lệnh nào.', { name: file.name }));
      // The box always holds prompts apart by a blank line, whatever the file looked like.
      box.value = prompts.join('\n\n');
      box.dispatchEvent(new Event('input', { bubbles: true })); // whatever draws the box (the element chips) redraws
      paint();
      box.dispatchEvent(new Event('prompt-import')); // the card list opens, even if the person closed it earlier
      const loaded = t('Đã nạp {count} từ tệp "{name}".', { count: tn(prompts.length, '{n} prompt', '{n} prompt', '{n} prompts'), name: file.name });
      if (truncated) say(`${loaded} ${t('Tệp có hơn {n} lệnh, chỉ lấy {n} lệnh đầu.', { n: prompts.length })}`); // a warning: red
      else say(loaded, true); // a confirmation: green
    } catch (err) {
      say(t('Không đọc được tệp "{name}": {why}', { name: file.name, why: err.message }));
    }
  });
}
