import { t } from './i18n.js';
import { addMessage, museAddKind, museSubmit } from './setup-muse.js';
import { formOf, what } from './setup-add-types.js';
import { paintKindButtons } from './setup-platform-ui.js';
import { addKindsOf, noAddNote, openKind } from './setup-platforms.js';
import { say } from './setup-say.js';
import { st } from './setup-state.js';

// The block "Thêm tài khoản" of a platform page, always open (Sếp 2026-10-29): the ways of adding, the paste box, "Thêm vào danh sách", the format line.
const $ = (id) => document.getElementById(id);
export const currentKind = () => openKind(st.platform, st.kindOf[st.platform], window.dola.accounts, st.opts); // '' = this platform has no way of adding

// repaint(): called when the way of adding changes (the empty-table sentence names what to paste).
let lastRepaint = () => {};
export function paintAddBox(repaint = lastRepaint) {
  lastRepaint = repaint; // the header toggle repaints the box alone: its kind buttons must still redraw the page (a no-op here made "Cookie" impossible to pick, 2026-10-29)
  const core = window.dola.accounts;
  $('su-add-body').hidden = false; // always open (Sếp 2026-10-29): the ways of adding and the paste box are on every platform page, no fold
  const kinds = addKindsOf(st.platform, core, st.opts);
  const kind = currentKind();
  paintKindButtons($('su-add-kinds'), kinds, kind, (k) => { st.kindOf[st.platform] = k; repaint(); say(''); });
  $('su-add-pick').hidden = !kinds.length;
  $('su-add-form').hidden = !kind;
  $('su-add-note').hidden = !!kind;
  $('su-add-note').textContent = kind ? '' : noAddNote(st.platform);
  if (!kind) return;
  const form = formOf(kind);
  $('su-cookies').placeholder = `${t('Dán {what}, mỗi dòng một acc', { what: what(kind) })}\n${form.holder}`;
  $('su-hint').textContent = form.hint;
}

async function addNow() {
  const kind = currentKind();
  if (!kind) return;
  const text = $('su-cookies').value;
  if (!text.trim()) return say(t('Chưa dán {what}.', { what: what(kind) }), true);
  const museKind = museAddKind(kind);
  if (museKind) {
    const btn = $('su-add');
    btn.disabled = true; // checking many cookies takes a while: no second click meanwhile
    try {
      const m = await museSubmit(window.dola.accounts, museKind, text, (line) => say(line));
      say(m.text, m.bad);
      if (m.clear) $('su-cookies').value = '';
    } finally {
      btn.disabled = false;
    }
    return;
  }
  const gmailKind = kind === 'gmail' || kind === 'gmail_veo';
  if (gmailKind && typeof window.dola.accounts.addGoogle !== 'function') return say(t('Cần cập nhật app lên bản mới để thêm acc Gmail.'), true);
  const r = gmailKind ? await window.dola.accounts.addGoogle(text, kind === 'gmail_veo' ? 'veo' : 'seedance')
    : kind === 'fbpass' ? await window.dola.accounts.addCredentials(text) : await window.dola.accounts.add(kind, text);
  const result = addMessage(r);
  const fbNote = kind === 'fbpass' && (r.added || r.updated);
  say(fbNote ? t('Đã xử lý: {result}. App đang đăng nhập Facebook lấy cookie, xem cột Trạng thái.', { result }) : t('Đã xử lý: {result}.', { result }), !r.added && !r.updated);
  if (r.added || r.updated) $('su-cookies').value = '';
}

export function bindAddBox() {
  $('su-add').onclick = addNow;
}
