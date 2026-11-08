import { btn, h, popOpen } from './guide-card.js';
import { getLang, t } from './i18n.js';
import { compareVersions, entriesUpTo, formatDate, hasUnseen, isVersion, parseChangelog, readSeen, shouldAutoOpen, withEnglishNotes, writeSeen } from './whats-new.js';

// "Có gì mới": the panel and the dot on the version label under the logo (whats-new.js has the rules, tests/whats-new-ui.test.js tests this file).
//   dot     a small lime "Mới" beside "v0.1.10" while this e-mail has not seen the panel for the installed version
//   label   #app-version gets role=button, a tab stop and the Enter / Space keys (it stays the plain text it was when the changelog is missing, empty or malformed: the label never depends on it); it opens / closes the panel
//   panel   a card floating at the top right (position fixed, the look of the first-time guide card): the form does not move by a pixel. Closes with "Đóng", the cross, Esc and a click outside.
// The panel opens by ITSELF once, when the app was updated to a version this e-mail has not seen the panel for, and only on the app screen, never over the beginner tour (the dot stays then).
// A brand-new install is never shown the history: its first launch only remembers the installed version. The dot clears, and the panel never opens by itself again, as soon as the panel has been
// SHOWN for the installed version (by itself or by a click on the label). Every text is drawn with textContent, never as markup. A failure is logged and the app goes on as before.
//   initWhatsNew({ dola, installed, label, tour, getEmail, storage, load }) -> { sync, open, close, isOpen, loaded }
//   installed  the core version already shown on the label ('0.1.10')     tour()  -> { settled, open }: the beginner tour has decided whether it asks its question (settled), and it is on (open)
//   sync()  app.js calls it whenever the tour opens / closes / settles       load()  -> the parsed JSON of changelog.json (default: fetched from the same address as this module)
//   loaded  a promise that is settled once the changelog and the e-mail were read (the tests wait for it)

export const TEXT = { title: t('Có gì mới'), close: t('Đóng'), now: t('Bản bạn đang dùng'), dot: t('Mới'), hint: t('Bấm để xem có gì mới') };

// Same-origin file (the page CSP has connect-src 'self'); the address is taken from this module so it works whatever page address the app loads.
const loadFile = async () => {
  const res = await fetch(new URL('changelog.json', import.meta.url));
  if (!res.ok) throw new Error(`changelog.json answered ${res.status}`);
  const raw = await res.json();
  if (getLang() !== 'en') return raw;
  // English: the same versions with their English notes (changelog-en.json); a file that cannot be read leaves the Vietnamese notes
  try {
    const en = await fetch(new URL('changelog-en.json', import.meta.url));
    return en.ok ? withEnglishNotes(raw, await en.json()) : raw;
  } catch (err) {
    console.warn('WhatsNew: the English changelog was not read', err);
    return raw;
  }
};

// One version of the list: its number, its date, the notes as a bullet list. current = the version of the installed app.
export function entryNode(entry, current) {
  const sec = h('section', `wn-entry${current ? ' wn-entry--now' : ''}`);
  sec.dataset.version = entry.version;
  const head = h('div', 'wn-entry-head');
  head.append(h('span', 'wn-version', t('Phiên bản {version}', { version: entry.version })), h('span', 'wn-date', formatDate(entry.date)));
  if (current) head.append(h('span', 'wn-now', TEXT.now));
  const list = h('ul', 'wn-notes');
  list.append(...entry.notes.map((note) => h('li', 'wn-note', note)));
  sec.append(head, list);
  return sec;
}

export function initWhatsNew({ dola, installed, label = document.getElementById('app-version'), tour = () => ({ settled: true, open: false }), getEmail, storage, load = loadFile } = {}) {
  const store = storage ?? (() => { try { return localStorage; } catch { return null; } })(); // readSeen / writeSeen cope with a missing or refusing storage
  const mailNow = getEmail ?? (() => dola.auth.state().then((s) => s?.email || s?.name));
  let email = '';
  let seen = ''; // the last version this e-mail has seen the panel for (in memory too, so a storage that refuses does not nag in this session)
  let shown = []; // the entries of changelog.json up to the installed version, newest first
  let ready = false;
  let decided = false; // the question "does it open by itself?" was answered once for this e-mail in this window
  let panelOpen = false;
  let opener = null;

  const dot = h('span', 'wn-dot', TEXT.dot);
  dot.setAttribute('aria-hidden', 'true'); // the button's name is "Có gì mới"
  dot.hidden = true;
  const closeX = btn('guide-x', '✕', () => close());
  closeX.setAttribute('aria-label', TEXT.close);
  const head = h('div', 'guide-panel-head');
  head.append(h('h2', 'guide-panel-title', TEXT.title), closeX);
  const body = h('div', 'guide-panel-body');
  const foot = h('div', 'guide-panel-foot');
  foot.append(btn('guide-go guide-ok', TEXT.close, () => close()));
  const panel = h('div', 'guide-panel wn-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', TEXT.title);
  panel.tabIndex = -1;
  panel.hidden = true;
  panel.append(head, body, foot);
  document.body.append(panel);

  // After a first launch the installed version is remembered at once and silently: nobody gets the whole history thrown at them.
  function loadSeen() {
    let value = readSeen(store, email);
    if (!value && email && isVersion(installed)) {
      writeSeen(store, email, installed);
      value = installed;
    }
    return value;
  }

  const unseen = () => hasUnseen({ installed, seen, hasEmail: !!email, entries: shown });

  function sync() {
    if (!ready) return;
    dot.hidden = !unseen();
    if (decided) return;
    const state = tour();
    if (!state.settled || document.body.dataset.auth !== 'main') return; // not known yet / the login or lock screen is on: ask again at the next sync
    decided = true;
    if (shouldAutoOpen({ installed, seen, hasEmail: !!email, entries: shown, onAppScreen: true, tourOpen: !!state.open })) open(null);
  }

  // from = the button that asked (the label): the focus goes there and back. Opened by itself (null), the focus is left where the person is typing.
  // "Seen" is the newest version the file really has (up to the installed one): an app released before its entry is written is announced when the entry comes.
  function open(from) {
    if (!ready || !shown.length) return;
    opener = from || null;
    panelOpen = true;
    panel.hidden = false;
    label.setAttribute('aria-expanded', 'true');
    if (seen !== shown[0].version) {
      seen = shown[0].version;
      writeSeen(store, email, seen);
    }
    dot.hidden = true;
    if (from) panel.focus();
  }

  function close() {
    if (!panelOpen) return;
    const from = opener;
    opener = null;
    panelOpen = false;
    panel.hidden = true;
    label.setAttribute('aria-expanded', 'false');
    from?.focus();
  }

  const inside = (target) => { for (let n = target; n; n = n.parentNode) if (n === panel || n === label) return true; return false; };
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && panelOpen && !popOpen()) close(); }, true); // capture, and not while the shared #pop is open over the panel (guide-card.js popOpen)
  document.addEventListener('pointerdown', (ev) => { if (panelOpen && !inside(ev.target)) close(); }, true); // a click outside; the label itself toggles through its own click

  const readMail = () => Promise.resolve().then(mailNow).then((mail) => mail || '', (err) => { console.error('WhatsNew: the e-mail was not read', err); return null; });

  const loaded = Promise.all([readMail(), Promise.resolve().then(load).catch((err) => { console.error('WhatsNew: the changelog was not read', err); return null; })]).then(([mail, raw]) => {
    email = mail || '';
    seen = loadSeen();
    shown = entriesUpTo(parseChangelog(raw), installed);
    body.replaceChildren(...shown.map((e) => entryNode(e, compareVersions(e.version, installed) === 0)));
    ready = true;
    if (shown.length) { // the label opens the panel only when there is something to read; else it stays the plain text it was
      const toggle = () => { if (panelOpen) close(); else open(label); };
      label.append(dot);
      label.setAttribute('role', 'button');
      label.setAttribute('aria-label', TEXT.title);
      label.setAttribute('aria-haspopup', 'dialog');
      label.setAttribute('aria-expanded', 'false');
      label.tabIndex = 0;
      label.title = [label.title, TEXT.hint].filter(Boolean).join(' · ');
      label.onclick = toggle;
      label.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } }; // a span is no button: the keys are done by hand
    }
    sync();
  }).catch((err) => console.error('WhatsNew: it did not start', err));

  // Another person: their own seen version, and the question of opening by itself is asked again. Only when the e-mail really CHANGED (the core also pushes auth:changed for a
  // token refresh); an e-mail that cannot be read changes nothing. The unlock screen going away is also a change that lands here: the app screen is on again, so sync() may open it.
  dola?.auth?.onChange?.(async () => {
    const mail = await readMail();
    if (ready && mail !== null && mail !== email) {
      email = mail;
      seen = loadSeen();
      decided = false;
      close();
    }
    sync();
  });

  return { sync, open, close, isOpen: () => panelOpen, loaded };
}
