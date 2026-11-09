/**
 * Hỗ trợ tìm phần tử trên trang và mô phỏng thao tác di chuột + bấm chuột tự nhiên như người thật
 * (giúp tăng điểm tin cậy reCAPTCHA v3 trên Google Flow và tránh lỗi "unusual activity").
 */

import { evalJs, PAGE_CALL_MS } from "./dola-session.js";
import { STRIP_BADGE_SRC } from "./label-match.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pickSrc = (matcherSrc) =>
  `\n  const strip = ${STRIP_BADGE_SRC};\n  const walk = (root, acc = []) => { for (const el of root.querySelectorAll('*')) { acc.push(el); if (el.shadowRoot) walk(el.shadowRoot, acc); } return acc; };\n  const hits = walk(document).filter((e) => { const r = e.getBoundingClientRect(); const t = (e.innerText || e.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim(); return r.width > 4 && r.height > 4 && t && t.length < 90 && ((l) => (${matcherSrc}))(strip(t)); })\n    .sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);\n  const el = hits[0];`;

export const findExpr = (matcherSrc) =>
  `(() => {${pickSrc(matcherSrc)}\n  if (!el) return null;\n  el.scrollIntoView({ block: 'center' });\n  const r = el.getBoundingClientRect();\n  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40) };\n})()`;

export const probeExpr = (matcherSrc, scroll = false) =>
  `(() => {${pickSrc(matcherSrc)}\n  if (!el) return null;\n  ${scroll ? "el.scrollIntoView({ block: 'center' });" : ""}\n  const r = el.getBoundingClientRect();\n  const topAt = (x, y) => { let t = document.elementFromPoint(x, y); for (let i = 0; t && t.shadowRoot && i < 10; i += 1) { const n = t.shadowRoot.elementFromPoint(x, y); if (!n || n === t) break; t = n; } return t; };\n  const inside = (t) => { for (let n = t; n; n = n.parentNode || n.host) if (n === el) return true; return false; };\n  const word = (t) => (t ? ((t.tagName || '').toLowerCase() + ' ' + (t.innerText || (t.getAttribute && t.getAttribute('aria-label')) || '').replace(/\\s+/g, ' ').trim().slice(0, 30)).trim() : 'không có gì');\n  const points = [];\n  for (const fy of [0.5, 0.2, 0.8]) for (const fx of [0.5, 0.2, 0.8]) {\n    const x = Math.round(r.left + r.width * fx); const y = Math.round(r.top + r.height * fy);\n    const t = topAt(x, y);\n    points.push({ x, y, on: !!t && inside(t), top: word(t) });\n  }\n  return { rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 40), points };\n})()`;

export const activateExpr = (matcherSrc) =>
  `(() => {${pickSrc(matcherSrc)}\n  if (!el) return false;\n  el.click();\n  return true;\n})()`;

let lastCursorX = 420;
let lastCursorY = 360;

/**
 * Mô phỏng đường di chuột cong tự nhiên (6 bước) trước khi bấm chuột trái.
 */
export async function clickPoint(win, pt, modifiers = [], delayMs = 45) {
  const wc = win.webContents;
  const targetX = Math.round(pt.x);
  const targetY = Math.round(pt.y);
  const startX = lastCursorX;
  const startY = lastCursorY;
  const steps = 6;
  const arcX = (Math.random() - 0.5) * 28;
  const arcY = (Math.random() - 0.5) * 22;

  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const bend = Math.sin(t * Math.PI);
    const curX = Math.round(startX + (targetX - startX) * ease + arcX * bend);
    const curY = Math.round(startY + (targetY - startY) * ease + arcY * bend);
    wc.sendInputEvent({ type: "mouseMove", x: curX, y: curY });
    await sleep(12 + Math.floor(Math.random() * 14));
  }

  lastCursorX = targetX;
  lastCursorY = targetY;

  await sleep(Math.max(25, delayMs + Math.floor(Math.random() * 35)));

  const modPart = modifiers.length ? { modifiers } : {};
  wc.sendInputEvent({
    type: "mouseDown",
    x: targetX,
    y: targetY,
    button: "left",
    clickCount: 1,
    ...modPart,
  });
  await sleep(42 + Math.floor(Math.random() * 45));
  wc.sendInputEvent({
    type: "mouseUp",
    x: targetX,
    y: targetY,
    button: "left",
    clickCount: 1,
    ...modPart,
  });
  await sleep(30 + Math.floor(Math.random() * 25));
}

export async function clickAt(win, expr) {
  const pt = await evalJs(win, expr, { timeout: PAGE_CALL_MS }).catch(() => null);
  if (!pt) return "";
  await clickPoint(win, pt);
  return pt.text || "click";
}
