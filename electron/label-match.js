// Dola draws a small badge ("Mới" = New) as a child node of some controls: the mode chip reads "Nhanh\nMới" (measured live 2026-10-26), so a
// whole-text match such as /^(Nhanh|Fast|Pro)$/ saw no chip at all and every Pro command failed with pro_not_found after a 10 s wait.
// This is the ONE place that decides what a control's label is once a trailing badge is dropped.
//
// Only the known badge words go (Mới, New, Beta, any case) and only AFTER the label, as a separate word (usually its own line):
//   "Nhanh\nMới" -> "Nhanh"   "Fast New" -> "Fast"   "9:16\nMới" -> "9:16"
//   "Pro" is a real label and stays; "Pro plan" and "Product" are other controls and stay; a text that IS a badge word ("Mới") stays.
// Line breaks inside the label are kept (the Model line of the panel is "Model\n<name>").
//
// Self-contained on purpose: stripBadge.toString() is pasted into page expressions (STRIP_BADGE_SRC), so the page and Node run the very same
// code and it must not use anything outside its own body. The word "Mới" is written with an escape so a file re-saved in another form
// (NFD) cannot change what it matches; the text is put in NFC first for the same reason.
export function stripBadge(text) {
  let s = String(text == null ? '' : text).normalize('NFC').trim();
  const trailing = /^(.*\S)\s+(?:M\u1edbi|New|Beta)$/isu;
  for (let m = trailing.exec(s); m; m = trailing.exec(s)) s = m[1];
  return s;
}

// The source of stripBadge as a JS expression, to be embedded in a page expression: `const strip = ${STRIP_BADGE_SRC};`
export const STRIP_BADGE_SRC = stripBadge.toString();
