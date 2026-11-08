// The VI / EN button(s): every element with [data-lang-toggle] (the header, the login card, the unlock card: the header is hidden on the
// last two). The button shows the code of the language it would switch TO ("EN" while the page is Vietnamese) and, as its name, a sentence
// in the language the page is in now. A press stores the other language and reloads the page (i18n.js chooseLang).
import { chooseLang, getLang, t } from './i18n.js';

const other = () => (getLang() === 'en' ? 'vi' : 'en');

export function initLangSwitch(doc = document) {
  if (typeof doc?.querySelectorAll !== 'function') return 0;
  const buttons = [...doc.querySelectorAll('[data-lang-toggle]')];
  const label = getLang() === 'en' ? t('Chuyển sang tiếng Việt') : t('Chuyển sang tiếng Anh');
  for (const b of buttons) {
    b.textContent = other().toUpperCase();
    b.setAttribute('aria-label', label);
    b.title = label;
    b.addEventListener('click', () => { chooseLang(other()); });
  }
  return buttons.length;
}
