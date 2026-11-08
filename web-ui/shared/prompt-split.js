// Copied from dola-seedance-client/src/prompt-split.js (smit-corp). Keep the two in step: change both, run both tests.
// Splits the text of the prompt box (or of an imported .txt / .csv file) into separate prompts. Pure: no DOM, no Electron.
//   txt  prompts are separated by one or more blank lines; line breaks inside one prompt are kept. This is the rule for text typed or pasted into the box.
//   txt FILE ({ file: true })  a file that has no blank line at all (leading and trailing blanks do not count) is a list: one line is one prompt, like csv
//        but without the unquoting. A file with a blank line anywhere is split at its blank lines, as above.
//   csv  one line is one prompt; blank lines are skipped; a well-formed quoted line loses its outer quotes and "" becomes ".
//        The first line is never guessed to be a header.
// Every prompt is trimmed, empty ones are dropped, and at most MAX_PROMPTS are kept (`truncated` says some were left out).
export const MAX_PROMPTS = 500;

// A full quoted field: starts and ends with a quote, and every quote inside is doubled.
const QUOTED = /^"(?:[^"]|"")*"$/;

// A BOM at the start needs no handling of its own: String.prototype.trim() counts U+FEFF as whitespace.
const normalize = (text) => String(text ?? '').replace(/\r\n?/g, '\n');

function unquote(line) {
  return QUOTED.test(line) ? line.slice(1, -1).replace(/""/g, '"') : line;
}

// A blank line: a line break, then only spaces, then a line break (a line of spaces counts as blank).
const BLANK_LINE = /\n\s*\n/;

export function splitPrompts(text, { csv = false, file = false } = {}) {
  const src = normalize(text);
  // A .txt file with no blank line: the lines are the prompts. One line alone gives the same single prompt either way.
  const perLine = csv || (file && !BLANK_LINE.test(src.trim()));
  const parts = perLine ? src.split('\n').map((line) => (csv ? unquote(line.trim()) : line)) : src.split(BLANK_LINE);
  const all = parts.map((p) => p.trim()).filter(Boolean);
  return { prompts: all.slice(0, MAX_PROMPTS), truncated: all.length > MAX_PROMPTS };
}
