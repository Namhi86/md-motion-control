import { el } from './pop.js';
import { button, noteLine } from './analyze-controls.js';
import { blockers, cardLevel, markQueued, mergeCards, queueState, summaryLine } from './analyze-cards.js';
import { t, tn } from './i18n.js';

// Section 3 of the tab: the result. A summary line, one card per prompt (a tick, the title, an editable text, the @tag badges) and the button that puts
// the ticked cards into the queue. Everything that came from AI Studio goes in with textContent / .value only, never as HTML.
// A card is RED when a product tag is missing from its text as it is now (the button then stays off), YELLOW for the core's softer warnings.
// The state lives in `cards` (plain objects, analyze-cards.js); each view looks its card up by id, so the list can be replaced by a new one.
// -> { node, setHandles(handles), add(allPrompts, summary), clear(), cards(), say(text), markQueued(ids), onRerun(fn) }
export function mountResults({ onQueue }) {
  const node = el('div', 'an-results');
  const summary = noteLine('an-summary');
  const list = el('div', 'an-cards');
  const queueBtn = button('', 'an-btn an-btn--main an-queue', () => onQueue());
  const rerun = button(t('Phân tích lại'), 'an-btn', () => rerunHandler());
  const queueMsg = noteLine('an-note');
  const bar = el('div', 'an-resbar');
  bar.append(queueBtn, rerun);
  node.append(summary.node, list, bar, queueMsg.node);
  node.hidden = true;

  let cards = [];
  let handles = [];
  let said = false; // the line under the button holds a message of ours (not the "missing tag" count)
  let rerunHandler = () => {};
  const views = new Map(); // card id -> { root, why, badge, tick }
  const cardOf = (id) => cards.find((c) => c.id === id);

  function paintCard(c) {
    const v = views.get(c.id);
    const level = cardLevel(c, handles);
    v.root.classList.toggle('an-card--red', level === 'red');
    v.root.classList.toggle('an-card--yellow', level === 'yellow');
    v.root.classList.toggle('an-card--queued', c.queued === true);
    v.tick.checked = c.ticked;
    v.tick.disabled = c.queued === true;
    const reasons = level === 'red' ? blockers(c, handles).map((b) => b.text) : level === 'yellow' ? c.warnings : [];
    v.root.title = reasons.join('\n');
    v.why.textContent = reasons[0] || (c.queued ? t('Đã đưa vào hàng đợi') : '');
    v.why.hidden = !v.why.textContent;
    v.badge.replaceChildren();
    for (const h of handles) {
      const has = blockers(c, [h]).every((b) => b.code !== 'tag_missing');
      const tag = el('span', `an-tag${has ? '' : ' an-tag--miss'}`, `@${h}`);
      tag.title = has ? t('Có trong prompt') : t('Thiếu trong prompt');
      v.badge.append(tag);
    }
  }
  function paintBar() {
    const s = queueState(cards, handles);
    queueBtn.textContent = s.count ? tn(s.count, 'Đưa {n} prompt vào hàng đợi', 'Add {n} prompt to the queue', 'Add {n} prompts to the queue') : t('Chưa chọn prompt nào');
    queueBtn.disabled = s.disabled;
    queueBtn.title = s.stuck ? tn(s.stuck, '{n} prompt đang thiếu thẻ sản phẩm (viền đỏ): sửa hoặc bỏ chọn rồi mới đưa vào hàng đợi.', '{n} prompt is missing a product tag (red border): fix it or untick it before adding to the queue.', '{n} prompts are missing a product tag (red border): fix them or untick them before adding to the queue.') : '';
    if (!said) queueMsg.set(s.stuck ? tn(s.stuck, '{n} prompt thiếu thẻ sản phẩm: sửa lại hoặc bỏ chọn.', '{n} prompt is missing a product tag: fix it or untick it.', '{n} prompts are missing a product tag: fix them or untick them.') : '');
  }
  const paintAll = () => { for (const c of cards) paintCard(c); paintBar(); };

  function build(c) {
    const root = el('article', 'an-card');
    root.dataset.id = String(c.id);
    const head = el('div', 'an-card-head');
    const tick = Object.assign(el('input', 'an-card-tick'), { type: 'checkbox' });
    tick.setAttribute('aria-label', t('Chọn prompt {title}', { title: c.title }));
    tick.onchange = () => { cardOf(c.id).ticked = tick.checked; said = false; paintBar(); };
    const badge = el('span', 'an-card-tags');
    head.append(tick, el('span', 'an-card-title', c.title), badge);
    const area = Object.assign(el('textarea', 'an-card-text'), { value: c.text, spellcheck: false, rows: 6 });
    area.setAttribute('aria-label', t('Nội dung prompt {title}', { title: c.title }));
    const why = el('p', 'an-card-why');
    area.oninput = () => {
      const cur = cardOf(c.id);
      cur.text = area.value;
      cur.edited = true;
      said = false;
      paintCard(cur);
      paintBar();
    };
    root.append(head, area, why);
    views.set(c.id, { root, why, badge, tick });
    list.append(root);
  }

  return {
    node,
    onRerun(fn) { rerunHandler = fn; },
    setHandles(next) { handles = [...next]; paintAll(); },
    // prompts: ALL the prompts so far (the cards event and the final answer both repeat the earlier ones); only the new ones are added
    add(prompts, sum) {
      const before = cards.length;
      cards = mergeCards(cards, prompts);
      for (const c of cards.slice(before)) build(c);
      if (sum) summary.set(summaryLine(sum));
      node.hidden = cards.length === 0;
      said = false;
      paintAll();
    },
    clear() { cards = []; views.clear(); list.replaceChildren(); summary.set(''); said = false; queueMsg.set(''); node.hidden = true; },
    cards: () => cards,
    // text '' hands the line back to the count of cards that miss a tag (the message of ours is gone)
    say(text) { said = !!text; if (text) queueMsg.set(text); else paintBar(); },
    // The cards that went into the queue are unticked and marked, so a second press cannot queue the same prompts again.
    markQueued(ids) { cards = markQueued(cards, ids); paintAll(); },
  };
}
