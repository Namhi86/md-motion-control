import { MAX_PROMPTS, splitPrompts } from './shared/prompt-split.js';

// The rules of the prompt cards under the prompt box (prompt-cards-ui.js draws them). Pure: no DOM. The text of the box (#prompt) stays the one
// truth: a card is one prompt of splitPrompts(text), and every change of a card is a new text for the box. The box cuts prompts at a blank line, so a
// blank line typed INSIDE a card must not reach it (the owner: Enter in a card is a line break and the card stays one prompt).
export { MAX_PROMPTS };
export const MIN_FOR_LIST = 2; // the list shows from this many prompts

export const cardsOf = (text) => splitPrompts(text).prompts;
export const showList = (text) => cardsOf(text).length >= MIN_FOR_LIST;

// One card's text as it goes into the box: line breaks stay, every run of blank lines becomes one line break, trimmed (as splitPrompts does).
export const cardText = (value) => String(value ?? '').replace(/\r\n?/g, '\n').replace(/\n\s*\n+/g, '\n').trim();

// Cards -> the text of the box. A card with no text is not a prompt (splitPrompts would drop it): it is left out, so a draft is not in the text.
export const joinCards = (cards) => cards.map(cardText).filter(Boolean).slice(0, MAX_PROMPTS).join('\n\n');

// The text with card i replaced by `value` (an emptied card goes). An index that is not a card leaves the text as it is.
export function editCard(text, i, value) {
  const cards = cardsOf(text);
  if (!Number.isInteger(i) || i < 0 || i >= cards.length) return text;
  cards[i] = value;
  return joinCards(cards);
}

export function removeCard(text, i) {
  const cards = cardsOf(text);
  if (!Number.isInteger(i) || i < 0 || i >= cards.length) return text;
  return joinCards(cards.filter((_, j) => j !== i));
}

// ── the rows of the list: the card texts as shown ('' = a draft or an emptied card that is not in the box yet) ──
export const realCount = (rows) => rows.filter((r) => cardText(r) !== '').length;
export const canAdd = (rows) => realCount(rows) < MAX_PROMPTS;

// "+ Thêm prompt": one empty row at the end. None when the box is full or an empty row is already there (it takes the focus instead).
export const addDraft = (rows) => (canAdd(rows) && !rows.some((r) => cardText(r) === '') ? [...rows, ''] : rows);
