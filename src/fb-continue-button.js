// The "Continue" button of Facebook's account chooser (a logged-out page that shows the profile photo, the name, a filled blue button and two other
// buttons, no text input), found in ANY language. Pure: no Electron, no browser; CONTINUE_EXPR is text that a page evaluates.
// Measured 2026-10-18 on the owner's screen (Spanish, a proxy in Spain): blue "Continuar", grey "Usar otro perfil", outlined "Crear cuenta nueva".

// One alternative per way a language writes it. No \b: it does not work with these scripts, so every alternative is anchored with ^ and $ and
// spaces are written out. A word first, then optionally "as / como / ..." and a name (Latin, Cyrillic, Greek, Arabic, Hebrew); a few languages put
// the name first (tr, ja, ko, zh) or write no spaces (th, zh).
const sp = (s) => s.replace(/ /g, '\\s+');
const WORDS = [
  'continue', 'continuar', 'tiếp tục', 'continuer', 'weiter', 'continua', 'lanjutkan', 'devam et', 'продолжить', 'продовжити', 'متابعة', 'المتابعة',
  'המשך', 'ต่อไป', 'ดำเนินการต่อ', '続ける', '続行', '계속', '继续', '繼續', 'kontynuuj', 'doorgaan', 'pokračovat', 'continuă', 'folytatás', 'συνέχεια',
  'fortsätt', 'fortsæt', 'fortsett', 'jatka', 'продължи',
].map(sp).join('|');
const AS = [
  'as', 'como', 'en tant que', 'als', 'come', 'sebagai', 'как', 'як', 'باسم', 'بصفة', 'בתור', 'jako', 'som', 'mint', 'ως', 'като', 'ca', 'nimellä',
  'käyttäjänä', 'dưới tên', 'với tư cách',
].map(sp).join('|');
export const CONTINUE_WORDS = [
  `^(?:${WORDS})$`,
  `^(?:${WORDS})\\s+(?:${AS})\\s+.+$`,
  '^(?:ต่อไป|ดำเนินการต่อ)(?:ในชื่อ|ในนาม)\\s*.+$', // th: no spaces
  '^.+\\s+olarak\\s+devam\\s+et$', // tr: the name comes first
  '^.+として(?:続ける|続行)$', // ja
  '^.+(?:님으로|으로|로)\\s*계속(?:하기)?$', // ko
  '^以.+的?(?:身份|身分)(?:继续|繼續)$', // zh-Hans, zh-Hant
].join('|');

// A computed `background-color` that is Facebook's filled blue (#0866FF, #1877F2 and near). Text in, true/false out. It is pasted into the page
// with toString(), so it uses nothing from outside itself.
export function isPrimaryBlue(cssColor) {
  if (typeof cssColor !== 'string') return false;
  const m = cssColor.trim().match(/^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*\.?\d+%?))?\s*\)$/i);
  if (!m) return false;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  const alpha = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith('%') ? 100 : 1);
  return alpha >= 0.5 && b >= 200 && b - r >= 150 && b - g >= 80;
}

// An expression for Runtime.evaluate / executeJavaScript: where to click, in CSS pixels of the page, after scrolling the button to the middle, or null.
//   word   (rule A) the smallest button-like element whose own label is a "continue" label
//   shape  (rule B) only when A found nothing and no text input is visible: the ONE filled blue button; two or more = ambiguous = null
// Candidates are visible, 80+ px wide, 28 to 100 px high, a BUTTON / A / role=button or a pointer cursor, in shadow roots too. Nothing else is ever clicked.
export const CONTINUE_EXPR = `(() => {
  const isPrimaryBlue = ${isPrimaryBlue.toString()};
  const words = new RegExp(${JSON.stringify(CONTINUE_WORDS)}, 'iu');
  const walk = (root, acc = []) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };
  const all = walk(document);
  const shown = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 4 && r.height > 4 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const label = (e) => (e.innerText || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().normalize('NFC');
  const area = (e) => { const r = e.getBoundingClientRect(); return r.width * r.height; };
  const buttons = all.filter((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 80 || r.height < 28 || r.height > 100 || !shown(e)) return false;
    return e.tagName === 'BUTTON' || e.tagName === 'A' || e.getAttribute('role') === 'button' || getComputedStyle(e).cursor === 'pointer';
  });
  let el = buttons.filter((e) => { const t = label(e); return t && t.length < 64 && words.test(t); }).sort((a, b) => area(a) - area(b))[0];
  let how = 'word';
  if (!el && !all.some((e) => e.tagName === 'INPUT' && e.type !== 'hidden' && shown(e))) {
    const blue = buttons.filter((e) => isPrimaryBlue(getComputedStyle(e).backgroundColor));
    if (blue.length === 1) { el = blue[0]; how = 'shape'; }
  }
  if (!el) return null;
  el.scrollIntoView({ block: 'center' });
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: label(el).slice(0, 40), how };
})()`;
