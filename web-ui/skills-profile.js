import { button } from './analyze-controls.js';
import { el } from './pop.js';
import { NICKNAME_RANGE, nicknameErrorText, nicknameProblem } from './skills-text.js';
import { t } from './i18n.js';

// "Tên hiển thị: <tên> · Đổi" of the Kho skill tab: the name other people see under the skills this person posts (a nickname, or the masked e-mail
// the server builds when there is none). Changing it is one input with Lưu / Huỷ; the server says whether the name is free, allowed, and whether the
// 30 days since the last change have passed. This page never builds the label. Nothing is drawn on a core without window.dola.skills.nickname.
//   -> { node, refresh() }

export function mountProfile({ dola = window.dola }) {
  const api = dola.skills?.nickname;
  const node = el('div', 'sk-profile');
  node.hidden = !api;
  let label = '';
  let editing = false;
  let busy = false;

  const msg = Object.assign(el('p', 'sk-profile-msg'), { hidden: true });
  msg.setAttribute('role', 'status');
  const say = (text) => { msg.textContent = text || ''; msg.hidden = !text; };

  function paint() {
    node.replaceChildren();
    if (!api) return;
    if (!editing) {
      node.append(el('span', 'sk-profile-label', t('Tên hiển thị:')), el('strong', 'sk-profile-name', label || '…'), button(t('Đổi'), 'sk-link', () => { editing = true; say(''); paint(); }), msg);
      return;
    }
    const input = Object.assign(el('input', 'an-input sk-profile-input'), { type: 'text', maxLength: NICKNAME_RANGE.max, placeholder: t('Tên hiển thị (3–30 ký tự)') });
    input.setAttribute('aria-label', t('Tên hiển thị mới'));
    input.setAttribute('autocomplete', 'off');
    const save = button(t('Lưu'), 'an-btn an-btn--sm an-btn--main', async () => {
      if (busy) return;
      const problem = nicknameProblem(input.value);
      if (problem) { say(problem); return; }
      busy = true;
      save.disabled = true;
      let r;
      try { r = await api.set(input.value.trim()); } catch { r = { ok: false, error: 'server' }; }
      busy = false;
      if (r?.ok) { label = r.label || r.nickname || label; editing = false; say(t('Đã đổi tên hiển thị.')); paint(); return; }
      save.disabled = false;
      say(nicknameErrorText(r));
    });
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save.onclick(); } };
    node.append(input, save, button(t('Huỷ'), 'an-btn an-btn--sm', () => { editing = false; say(''); paint(); }), msg);
    input.focus?.();
  }

  async function refresh() {
    if (!api || editing) return;
    let r;
    try { r = await api.get(); } catch { r = null; }
    if (r?.ok) label = r.label || r.nickname || '';
    paint();
  }
  paint();
  return { node, refresh };
}
