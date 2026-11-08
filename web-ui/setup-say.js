import { el } from './pop.js';

// The lines of the Setup screen that answer the person: under the paste box (say), over the table (sayRow) and on the Settings page (saySetting).
const $ = (id) => document.getElementById(id);

export function say(text, bad = false) {
  const m = $('su-msg');
  m.textContent = text;
  m.classList.toggle('stp-msg--bad', bad);
}

// The line above the table: answers to the row buttons (switch, "Kiểm tra", the "⋯" menu) appear where the person is looking.
const tableMsg = el('p', 'stp-msg stp-msg--row');
tableMsg.hidden = true;
$('su-table').before(tableMsg);
export function sayRow(text, bad = false) {
  tableMsg.textContent = text;
  tableMsg.classList.toggle('stp-msg--bad', bad);
  tableMsg.hidden = !text;
}

// The line on the Settings page: the answers to its switches.
export function saySetting(text, bad = false) {
  const m = $('su-set-msg');
  m.textContent = text;
  m.classList.toggle('stp-msg--bad', bad);
  m.hidden = !text;
}
