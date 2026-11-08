import { CONFIRM_MS, pressSave } from './admin-text.js';
import { button } from './analyze-controls.js';
import { el } from './pop.js';
import { ADMIN_TEXT, adminErrorText, dayText, momentOf } from './skills-text.js';
import { t, tn } from './i18n.js';

// What an admin sees under a card of the Kho skill tab: "Xem nội dung" (the body, read only, in a <pre>: it is the one place where a body reaches the
// window, and only for the admin session), "Gỡ" (two presses; it deletes the sample videos and cannot be undone) and "Lượt dùng" (who used the skill,
// with "Huỷ lượt" for a fake one). Drawn by skills-view.js only when options().admin is true; the core refuses the calls for anybody else and the
// server decides in the end (403). Text comes in with textContent only, never as markup.
//   dola  window.dola   card  the Card   onChanged()  the list must be read again   now  the clock (tests)
const ask = async (call) => { try { return await call(); } catch { return { ok: false, error: 'server' }; } };

export function adminCardExtras({ dola = window.dola, card, onChanged = () => {}, now = Date.now }) {
  const api = dola.skills.admin;
  const id = String(card.id);
  const line = Object.assign(el('p', 'sk-admin-msg'), { hidden: true });
  line.setAttribute('role', 'status');
  const say = (text, bad = true) => { line.textContent = text || ''; line.hidden = !text; line.classList.toggle('sk-admin-msg--bad', bad && !!text); };
  const panel = Object.assign(el('div', 'sk-admin-panel'), { hidden: true });

  // ── Xem nội dung ──
  let open = '';
  const viewBtn = button(ADMIN_TEXT.view, 'sk-admin-btn', () => toggle('body'));
  const usesBtn = button(ADMIN_TEXT.uses, 'sk-admin-btn', () => toggle('uses'));
  async function toggle(kind) {
    if (open === kind) { open = ''; panel.hidden = true; viewBtn.textContent = ADMIN_TEXT.view; return; }
    say('');
    const r = await ask(() => (kind === 'body' ? api.body(id) : api.uses(id)));
    if (!r?.ok) { say(adminErrorText(r)); return; }
    open = kind;
    viewBtn.textContent = kind === 'body' ? ADMIN_TEXT.hide : ADMIN_TEXT.view;
    panel.replaceChildren(...(kind === 'body' ? bodyNodes(r) : usesNodes(r)));
    panel.hidden = false;
  }
  function bodyNodes(r) {
    const nodes = [el('pre', 'sk-admin-pre', String(r.body ?? ''))];
    if (r.body_muse ?? r.bodyMuse) nodes.push(el('p', 'sk-admin-label', ADMIN_TEXT.museVersion), el('pre', 'sk-admin-pre', String(r.body_muse ?? r.bodyMuse)));
    return nodes;
  }

  // ── Lượt dùng (+ Huỷ lượt) ──
  function usesNodes(r) {
    const rows = Array.isArray(r.rows) ? r.rows : [];
    if (!rows.length) return [el('p', 'sk-admin-label', t('Chưa có ai dùng skill này.'))];
    return rows.map((row) => {
      const when = momentOf(row.last_at ?? row.lastAt);
      const item = el('div', 'sk-admin-use');
      const who = el('span', 'sk-admin-who', [String(row.email || row.user_id || row.userId), when ? dayText(when) : '', row.voided ? t('đã huỷ') : ''].filter(Boolean).join(' · '));
      item.append(who);
      if (!row.voided) {
        const voidBtn = button(ADMIN_TEXT.void, 'sk-admin-btn sk-admin-btn--sm', async () => {
          voidBtn.disabled = true;
          const v = await ask(() => api.void(id, row.user_id ?? row.userId));
          if (!v?.ok) { voidBtn.disabled = false; say(adminErrorText(v)); return; }
          open = '';
          await toggle('uses'); // the list is read again (it clears the line), then the line says what was done
          say(tn(v.voided ?? 0, 'Đã huỷ {n} lượt.', 'Cancelled {n} use.', 'Cancelled {n} uses.'), false);
          onChanged();
        });
        item.append(voidBtn);
      }
      return item;
    });
  }

  // ── Gỡ (two presses) ──
  let armed = null;
  let removing = false;
  const warn = Object.assign(el('p', 'sk-admin-warn', ADMIN_TEXT.removeWarn), { hidden: true });
  const removeBtn = button(ADMIN_TEXT.remove, 'sk-admin-btn sk-admin-btn--danger', async () => {
    if (removing) return;
    const step = pressSave(armed, id, now());
    armed = step.armed;
    if (!step.send) {
      removeBtn.textContent = ADMIN_TEXT.sure;
      warn.hidden = false;
      const timer = setTimeout(() => { if (armed && now() - armed.at >= CONFIRM_MS) { armed = null; removeBtn.textContent = ADMIN_TEXT.remove; warn.hidden = true; } }, CONFIRM_MS + 50);
      timer?.unref?.(); // (a test's process must not wait for it)
      return;
    }
    removing = true;
    removeBtn.disabled = true;
    const r = await ask(() => api.remove(id));
    removing = false;
    removeBtn.disabled = false;
    removeBtn.textContent = ADMIN_TEXT.remove;
    warn.hidden = true;
    if (!r?.ok) { say(adminErrorText(r)); return; }
    onChanged();
  });

  const row = el('div', 'sk-admin');
  row.append(viewBtn, usesBtn, removeBtn);
  return [row, warn, line, panel];
}
