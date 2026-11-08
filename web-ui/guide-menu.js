import { MENU_INTRO, MENU_TITLE } from './guide-content.js';
import { menuEntries } from './guide-state.js';
import { closePop, el, openPop } from './pop.js';

// The "Hướng dẫn" button of the header and the list it opens (plans/261020-1535-md-motion-onboarding-wizard, phase 3). The list is the entries of the header
// (guide-state.js menuItems) that ALSO have a text in guide-content.js MENU_INTRO: a tab with no card yet is simply absent. Bắt đầu runs the tour that circles the real buttons (guide-init.js);
// Tạo video goes to its tab and opens its card; Tạo ảnh, Phân tích video and Kho skill do the same with the cards of guide-tab-cards.js; Bàn sáng tạo only goes to its tab (its empty screen already
// walks the three steps). The button shows only for a core that lists accounts (the tour needs it); any other core keeps the header as it was.
//   initGuideMenu({ button, dola, opts, hasStudio, showView, goTo, wizard, card, tabCards }) -> { entries() } | null
//   hasStudio()  the board module is loaded (the header shows Bàn sáng tạo only then)   wizard  the controller of guide-init.js ({ open })   card  the one of guide-card.js
//   tabCards  the controller of guide-tab-cards.js: with it, a card entry is listed only when that tab really has its card (the core offers it AND its screen started)
//   goTo(id)  how a tab is opened (default showView(id)); the Kho skill screen is built the first time its header button is pressed, so app.js gives a goTo that presses it (and may return a promise)

const WIDTH = 340;

const CARD_TABS = ['image', 'analyze', 'skills'];

export function initGuideMenu({ button, dola, opts, hasStudio = () => false, showView, goTo, wizard, card, tabCards } = {}) {
  const offered = !!button && !!wizard && typeof dola?.accounts?.list === 'function';
  if (button) button.hidden = !offered;
  if (!offered) return null;
  // What each entry does when it is picked; an entry with no action is never listed (a text added in guide-content.js before its card exists).
  const go = goTo ?? showView;
  const tab = (id) => async () => { await go(id); tabCards?.open(id, button); };
  const actions = {
    start: () => wizard.open(),
    create: () => { showView('create'); card?.open(button); },
    image: tab('image'),
    analyze: tab('analyze'),
    skills: tab('skills'),
    studio: () => go('studio'),
  };
  const listed = (m) => typeof actions[m.id] === 'function' && (!tabCards || !CARD_TABS.includes(m.id) || tabCards.offers(m.id));
  const entries = () => menuEntries(opts, hasStudio(), MENU_INTRO).filter(listed);

  button.setAttribute('aria-haspopup', 'true');
  button.onclick = () => {
    const rows = entries().map((m) => {
      const b = el('button', 'guide-menu-item');
      b.type = 'button';
      b.dataset.entry = m.id;
      b.append(el('span', 'guide-menu-name', m.label), el('span', 'guide-menu-intro', m.intro));
      b.onclick = () => {
        closePop();
        const failed = (err) => console.error('Guide: a menu entry failed', err);
        try {
          Promise.resolve(actions[m.id]()).catch(failed); // a sync action still runs inside the click; an async one (a tab that must load first) is caught too
        } catch (err) {
          failed(err);
        }
      };
      return b;
    });
    openPop(button, [el('p', 'cv-pop-head', MENU_TITLE), ...rows], WIDTH);
    rows[0]?.focus();
  };
  return { entries };
}
