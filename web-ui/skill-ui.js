// Copied from dola-seedance-client/electron/skill-ui.js (smit-corp). Keep the two in step: change both, run both tests.
// EXCEPT the Kho chip (useStoreSkill / store(), "Dùng skill" of the Kho skill tab) and useFileSkill ("Dùng ngay" of "Tách skill"): web only, the app's bundled renderer has neither.
import { SKILL_TEXT, pickedSkill, skillAfterMode, skillVisible } from './shared/skill-form.js';
import { STORE_TEXT, storeSkillAfterMode } from './shared/skill-store-form.js';
import { el } from './pop.js';
import { t, tx } from './i18n.js';
import { errText } from './ui-text.js';

// The skill row of the form: a small button "Thêm skill (.md/.txt)" that turns into a chip with the file name and an ✕ once a file is picked.
// The rules (which modes, what the task gets) are in src/skill-form.js (pure, tested); this file only draws and holds the one pick.
// -> { sync(mode, opts), get() -> { handle, name } | null, clear(), useStoreSkill(card), store() -> { id, title, modes } | null }. sync() is called whenever the
// form's mode changes; say(text) is the line under the Tạo video button.
// A skill of the Kho skill tab ("Dùng skill") takes the place of a skill file: a chip "Kho: <title>", dropped by a mode the skill does not have.
export function mountSkill({ node, dola, say }) {
  let skill = null; // { handle, name }: the one skill of the next command(s); the file stays in the core
  let store = null; // { id, title, modes }: a skill of the Kho skill tab, instead of a file (never both)
  let mode = '';
  let opts = null;
  let waiting = false; // the file dialog is open
  const visible = () => !!store || skillVisible({ mode, opts, dola });

  function paint() {
    node.hidden = !visible();
    node.replaceChildren();
    if (node.hidden) return;
    if (store) {
      const chip = el('span', 'cv-skill-chip cv-skill-chip--store');
      const x = Object.assign(el('button', 'cv-skill-x', '✕'), { type: 'button', title: tx(SKILL_TEXT.remove) });
      x.setAttribute('aria-label', tx(SKILL_TEXT.remove));
      x.onclick = () => { store = null; paint(); };
      chip.append(el('span', 'cv-skill-name', `${tx(STORE_TEXT.chipPrefix)}${store.title}`), x);
      chip.title = `${tx(STORE_TEXT.chipPrefix)}${store.title}`;
      node.append(chip);
      return;
    }
    if (skill) {
      const chip = el('span', 'cv-skill-chip');
      const x = Object.assign(el('button', 'cv-skill-x', '✕'), { type: 'button', title: tx(SKILL_TEXT.remove) });
      x.setAttribute('aria-label', tx(SKILL_TEXT.remove));
      x.onclick = clear;
      chip.append(el('span', 'cv-skill-name', skill.name), x);
      chip.title = skill.name;
      node.append(chip);
      return;
    }
    const b = Object.assign(el('button', 'cv-skill-btn', tx(SKILL_TEXT.button)), { type: 'button', title: tx(SKILL_TEXT.tip), disabled: waiting });
    b.onclick = add;
    node.append(b);
  }
  async function add() {
    if (waiting) return;
    waiting = true;
    paint();
    try {
      const picked = pickedSkill(await dola.pickSkill());
      if (picked && visible()) { // the person may have gone to Nhanh while the dialog was open
        skill = picked;
        say(''); // an earlier "Không chọn được skill" line is stale now
      }
    } catch (err) {
      say(t('Không chọn được skill: {why}', { why: errText(err) }));
    } finally {
      waiting = false;
      paint();
    }
  }
  function clear() {
    skill = null;
    store = null;
    paint();
  }
  return {
    sync(nextMode, nextOpts) {
      mode = nextMode;
      opts = nextOpts;
      skill = skillAfterMode(skill, mode);
      const kept = storeSkillAfterMode(store, mode);
      if (store && !kept) say(t('Đã bỏ skill "{title}" của Kho vì chế độ này không dùng skill đó.', { title: store.title }));
      store = kept;
      paint();
    },
    get: () => skill,
    store: () => store,
    // "Dùng skill" of the Kho skill tab: the card's id, title and modes (nothing else of the card is kept). -> true when it was taken
    useStoreSkill(card) {
      const id = typeof card?.id === 'string' || Number.isFinite(card?.id) ? String(card.id) : '';
      if (!id || !Array.isArray(card.modes)) return false;
      skill = null;
      store = { id, title: String(card.title ?? '').trim().slice(0, 80) || 'skill', modes: card.modes.filter((m) => m === 'pro' || m === 'muse') };
      say('');
      paint();
      return true;
    },
    // "Dùng ngay" of "Tách skill": a skill file the core just made (the same { handle, name } pickSkill gives) takes the place of any pick. Call it after the form
    // is in the skill's mode (sync() has run). -> true when it was taken; false when the row is not drawn in this mode (nothing is held then).
    useFileSkill(file) {
      const picked = pickedSkill(file);
      if (!picked || !skillVisible({ mode, opts, dola })) return false;
      store = null;
      skill = picked;
      say('');
      paint();
      return true;
    },
    clear,
  };
}
