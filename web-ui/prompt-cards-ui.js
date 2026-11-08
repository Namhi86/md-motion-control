import { el } from './pop.js';
import { t, tn } from './i18n.js';
import { MAX_PROMPTS, MIN_FOR_LIST, addDraft, canAdd, cardText, cardsOf, joinCards, realCount } from './prompt-cards.js';
import { makeCard, nextFrame, numberCard } from './prompt-cards-card.js';
import { attachLiveEditing } from './prompt-cards-live.js';
import { drawChips, promptProblems, serialize } from './prompt-chips.js';

// The list of prompt cards under the prompt box: one small card per prompt when the box holds 2 or more, a toggle "▾ N prompt", and "+ Thêm prompt".
// The text of the box (#prompt) stays the one truth: a card edit or a delete writes the joined text back (value + an `input` event), and a change
// from outside (the box itself, "Tạo lại", the file import, the clear after "Tạo video") draws the cards again. Rules: prompt-cards.js; the editing
// of the card with the focus: prompt-cards-live.js. No timer that runs on its own: the list listens to `input` of the box and does nothing while
// it is closed or hidden.
const BATCH = 100; // cards drawn per frame

// box: #prompt; node: #prompt-cards; sugg: #prompt-sugg; pool: the element library (null: no chips, no "@" list);
// limit() / picked(): what the picked mode takes per command and the handles of the loose images (for the red mark of a card).
// -> { repaint() } (the mode or the Veo model changed: the red marks follow)
export function mountPromptCards({ box, node, sugg, pool = null, limit = () => ({ name: '', max: 10, veo: false }), picked = () => [] }) {
  let open = true; // closing is remembered for the session only
  let rows = []; // the card texts as shown ('' = an empty card: a draft or one the person emptied; it is not in the box)
  const cards = []; // { node, num, ed, x, drawn } per row; drawn: the text its editor was last drawn from
  let lastText = null; // the box text the list reflects; a write of ours sets it first, so its own `input` event does nothing
  let gen = 0; // a new draw cancels the batches of the old one
  const byHandle = pool ? pool.byHandle : () => null;

  const toggle = el('button', 'cv-pc-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'prompt-cards-body');
  const body = el('div', 'cv-pc-body');
  body.id = 'prompt-cards-body';
  const list = el('div', 'cv-pc-list');
  list.setAttribute('role', 'list');
  const add = el('button', 'cv-pc-add', t('+ Thêm prompt'));
  add.type = 'button';
  body.append(list, add);
  node.replaceChildren(toggle, body);

  function head() {
    toggle.textContent = `${open ? '▾' : '▸'} ${tn(realCount(rows), '{n} prompt', '{n} prompt', '{n} prompts')}`;
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
    add.disabled = !canAdd(rows);
    add.title = add.disabled ? t('Đã đủ {max} prompt.', { max: MAX_PROMPTS }) : '';
  }
  const number = (from) => cards.slice(from).forEach((c, k) => numberCard(c, from + k));
  // After a change of the rows: the list shows from MIN_FOR_LIST prompts; the label, the add button and the open body follow.
  function after() {
    node.hidden = realCount(rows) < MIN_FOR_LIST;
    head();
    if (node.hidden) { // nothing to show (the box was emptied, one prompt is left): the cards and any empty draft go, a later list is drawn fresh
      rows = rows.filter((r) => r !== '');
      gen += 1;
      cards.length = 0;
      list.replaceChildren();
    } else if (open) draw();
  }

  // A card with more pictures than the model takes, or a mention whose picture is gone, is red (the sentence is its tooltip); the line under the box says it too.
  function mark(c, i, text) {
    const bad = pool && text && (text.includes('@') || picked().length) ? promptProblems(text, i, { library: pool.library(), picked: picked(), limit: limit() }) : [];
    c.node.classList.toggle('cv-pc-card--bad', bad.length > 0);
    c.node.title = bad.join(' ');
  }
  function paintCard(c, i, text) {
    drawChips(c.ed, text, byHandle);
    c.drawn = text;
    mark(c, i, text);
  }

  // The cards follow the rows: only the ones whose text differs are drawn again, 100 per frame (a first batch right away).
  function draw() {
    gen += 1;
    const mine = gen;
    while (cards.length > rows.length) cards.pop().node.remove();
    const todo = [];
    for (let i = 0; i < rows.length; i += 1) if (i >= cards.length || cards[i].drawn !== rows[i]) todo.push(i);
    let next = 0;
    const step = () => {
      if (mine !== gen) return;
      for (let k = 0; k < BATCH && next < todo.length; k += 1, next += 1) {
        const i = todo[next];
        if (i >= rows.length) break;
        if (i >= cards.length) {
          const c = makeCard(!!pool);
          cards.push(c);
          list.append(c.node);
          numberCard(c, i);
        }
        paintCard(cards[i], i, rows[i]);
      }
      if (next < todo.length) nextFrame(step);
    };
    step();
  }

  function write() {
    const text = joinCards(rows);
    if (text === box.value) return;
    lastText = text;
    box.value = text;
    box.dispatchEvent(new Event('input', { bubbles: true })); // the counter, the main box, the picture check follow
  }
  function removeRow(i) {
    rows.splice(i, 1);
    cards.splice(i, 1)[0].node.remove();
    number(i);
  }
  const indexOf = (ed) => Number(ed.parentNode.dataset.i);

  // A change from outside: the rows are the box's prompts again (empty cards go).
  function refresh() {
    if (box.value === lastText) return;
    lastText = box.value;
    rows = cardsOf(lastText);
    after();
  }

  // The text of a card changed by typing: the box follows. The card itself is not drawn again (the caret stays).
  function onEdit(ed) {
    const i = indexOf(ed);
    if (!(i >= 0 && i < rows.length)) return;
    const text = cardText(serialize(ed));
    cards[i].drawn = text;
    if (text !== rows[i]) {
      rows[i] = text;
      write();
    }
    mark(cards[i], i, text);
    head();
  }
  // The focus left a card: an empty one goes (a draft the person did not fill, or one they emptied); any other is drawn from its text (a typed
  // "@handle" becomes a chip, blank lines the box collapsed disappear).
  function onLeave(ed) {
    if (!ed.isConnected) return;
    const i = indexOf(ed);
    if (!(i >= 0 && i < rows.length)) return;
    if (rows[i] === '') {
      removeRow(i);
      after();
    } else paintCard(cards[i], i, rows[i]);
  }
  attachLiveEditing({ list, sugg, pool, onEdit, onLeave });

  list.addEventListener('click', (ev) => {
    const x = ev.target.closest?.('.cv-pc-x');
    if (!x) return;
    const i = Number(x.parentNode.dataset.i);
    if (!(i >= 0 && i < rows.length)) return;
    const real = rows[i] !== '';
    removeRow(i);
    if (real) write();
    after();
  });
  toggle.addEventListener('click', () => {
    open = !open;
    lastText = null; // the closed list did no work: the cards are compared with the box again
    refresh();
  });
  add.addEventListener('click', () => {
    refresh();
    const room = addDraft(rows);
    if (room !== rows) {
      rows = room;
      draw();
      head();
    }
    const at = rows.indexOf('');
    if (at >= 0 && cards[at]) {
      cards[at].ed.focus();
      cards[at].node.scrollIntoView?.({ block: 'nearest' });
    }
  });

  box.addEventListener('input', refresh);
  // A file import (queue-prompt-box.js) fires this after it wrote the box: the person wants to see what was loaded, so a closed list opens.
  box.addEventListener('prompt-import', () => { if (!open) toggle.click(); }); // the same path as the person's own click: opens and draws what the box holds
  if (pool) { // a renamed picture or a new element: the chips follow (a tick or untick changes no card; a library read again with the same content neither)
    const signature = () => pool.library().map((e) => `${e.id}:${e.handle}:${e.name}:${e.v}:${!!e.missing}`).join('|');
    let seen = signature();
    pool.onChange(() => {
      const now = signature();
      if (now === seen) return;
      seen = now;
      for (const c of cards) if (c.ed !== document.activeElement) c.drawn = null;
      if (!node.hidden && open) draw();
    });
  }
  refresh();
  return {
    repaint() {
      if (!node.hidden && open) cards.forEach((c, i) => mark(c, i, rows[i]));
    },
  };
}
