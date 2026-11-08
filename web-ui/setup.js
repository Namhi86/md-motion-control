import { t } from './i18n.js';
import { accountsFeed } from './core-feed.js';
import { onProxySummary, proxySummary } from './proxy-ui.js';
import { canLoginMuse, museWaiting } from './setup-muse.js';
import { PLATFORMS, accountHeader, firstPlatform, isReady, platformsOffered } from './setup-platforms.js';
import { groupCounts } from './setup-filter-model.js';
import { currentKey, sideGroups } from './setup-side-model.js';
import { bindSideKeys, paintSide } from './setup-side.js';
import { paintChips } from './setup-filter-ui.js';
import { bindAddBox, currentKind, paintAddBox } from './setup-add.js';
import { what } from './setup-add-types.js';
import { checkAccount, loginMuseOne, resetAccounts, resetAll } from './setup-actions.js';
import { paintBulk } from './setup-bulk.js';
import { say, sayRow } from './setup-say.js';
import { hooks, rowsOf, st, visibleRows, busyIds } from './setup-state.js';
import { initBrowserSwitch, initShowSwitch } from './setup-settings.js';
import { renderTable, tickCountdowns } from './setup-table.js';
import { el } from './pop.js';
import { paintDiagNotice } from './diag-notice.js';
import { mountMuseParallel } from './muse-parallel-ui.js';
import { EL_TEXT, EL_TYPE, elevenApiOk, elevenReadyCount, removeAccount, solveCaptcha as solveElevenCaptcha } from './setup-eleven.js';
import { renderElevenTable } from './setup-eleven-table.js';
import { copyViaPage } from './setup-eleven-captcha-ui.js';
import { mountEleven } from './setup-eleven-ui.js';
import { errText } from './ui-text.js';

// The Setup screen: a sidebar (Seedance | Muse | Veo, Kho proxy, Cài đặt) and the page of the row that is open. A platform page has the status chips, the search,
// the folding block "Thêm tài khoản" and the table; the state is setup-state.js, the pieces are the other setup-*.js files.
// The window only ever sees the public view of the list (id, type, label, proxy host:port, status, note, enabled, restUntil): no cookie, no password.
const $ = (id) => document.getElementById(id);
const PAGES = { platform: 'su-accounts', settings: 'su-settings', proxy: 'mount-proxies' };

const running = st.running;
let busySig = '';
let shownReady = -1;
let shownWaiting = -1; // Muse accounts waiting for their login code: the row redraws when that wait ends
let shownElevenReady = -1; // ElevenLabs accounts that can make a voice: a rest that ends redraws the row

// The ElevenLabs page: a panel (proxy, how many accounts, captcha choice) in place of the paste box. Built only when the core has window.dola.elevenlabs: an older core shows no panel.
const elevenApi = window.dola.elevenlabs;
const elevenPanel = elevenApiOk(elevenApi) ? mountEleven({ api: elevenApi, accounts: window.dola.accounts, copy: (text) => copyViaPage(text) }) : null;
if (elevenPanel) $('su-add-note').after(elevenPanel.node);
let elevenOpen = false; // the panel reads the core's settings each time its page opens
const elevenSolving = new Set(); // account ids whose "Giải captcha" is in flight

// "Số lệnh cùng lúc mỗi acc Muse": one box on the Cài đặt page, shown only when the core reports the setting (muse-parallel-ui.js)
const museParallel = mountMuseParallel({ row: $('su-muse-par'), box: $('su-muse-par-box'), name: $('su-muse-par-name'), help: $('su-muse-par-help'), msg: $('su-muse-par-msg') }, window.dola.queue, errText);

export function readyCount() {
  return st.view.filter((a) => a?.type === 'google' && a?.platform === 'veo' && isReady(a)).length;
}

// The sidebar: one row per offered platform ("ready / listed", a red dot when an account needs the person), the proxy pool ("alive / all") and the settings.
function paintSidebar() {
  const offered = platformsOffered(window.dola.accounts, st.view, st.opts, elevenApi);
  if (!offered.includes(st.platform)) st.platform = firstPlatform(offered, st.view); // the open platform went away (the core changed): fall back
  museParallel.show(offered.includes('muse')); // the number of Muse commands lives on the Cài đặt page, and only a core that has Muse shows it (as when it sat on the Muse tab)
  const groups = sideGroups({ offered, view: st.view, proxy: proxySummary() });
  paintSide($('su-side'), groups, { current: currentKey(st.page, st.platform), home: st.platform, onPick: pickRow });
}

function pickRow(item) {
  if (item.page === 'platform') {
    if (item.platform !== st.platform) { st.filter = 'all'; st.query = ''; $('su-search').value = ''; }
    st.platform = item.platform;
    say('');
    sayRow('');
  }
  st.page = item.page;
  paintAll();
}

// The head of a platform page: its name, the sentence about it, "Đặt lại tất cả".
function paintHead() {
  $('su-table-title').textContent = PLATFORMS[st.platform].label;
  $('su-plat-desc').textContent = PLATFORMS[st.platform].desc;
  $('su-reset-all').hidden = !rowsOf().length || st.platform === EL_TYPE;
}

function paintChipRow() {
  paintChips($('su-chips'), groupCounts(rowsOf()), st.filter, (id) => { st.filter = id; paintChipRow(); paintTable(); });
}

function emptyText(total) {
  if (total) return t('Không có acc nào khớp bộ lọc hay ô tìm.');
  return currentKind() ? t('Chưa có acc nào. Dán {what} ở khung trên rồi bấm "Thêm vào danh sách".', { what: what(currentKind()) }) : t('Chưa có acc nào ở đây.');
}

// The ElevenLabs table: '***' accounts, no tick boxes, no "Kiểm tra / Đặt lại" (the app makes and keeps these accounts itself).
async function elevenSolve(a) {
  if (elevenSolving.has(a.id)) return;
  elevenSolving.add(a.id);
  paintTable();
  try {
    const r = await solveElevenCaptcha(elevenApi, a.id);
    sayRow(r.text, r.bad);
  } finally {
    elevenSolving.delete(a.id);
    paintTable();
  }
}
async function elevenRemove(a) {
  const r = await removeAccount(window.dola.accounts, a.id);
  if (r.bad) sayRow(r.text, true);
  else sayRow('');
}
function paintElevenTable(all, rows) {
  const box = $('su-table');
  if (!rows.length) return void box.append(el('div', 'stp-empty-block', all.length ? t('Không có acc nào khớp bộ lọc hay ô tìm.') : EL_TEXT.empty));
  renderElevenTable(box, rows, { say: sayRow, onSolve: elevenSolve, onRemove: elevenRemove, solving: elevenSolving });
}

function paintTable() {
  const all = rowsOf();
  const rows = visibleRows();
  for (const id of [...st.selected]) if (!rows.some((a) => a.id === id)) st.selected.delete(id); // a removed or filtered-out account is no longer ticked
  paintBulk();
  const box = $('su-table');
  box.replaceChildren();
  if (st.platform === EL_TYPE) return paintElevenTable(all, rows);
  if (!rows.length) {
    box.append(el('div', 'stp-empty-block', emptyText(all.length)));
    return;
  }
  renderTable(box, rows, {
    header: accountHeader(st.platform),
    busy: busyIds(),
    checking: st.checking,
    say: sayRow,
    onCheck: checkAccount,
    onReset: (a) => resetAccounts([a]),
    onLogin: canLoginMuse(window.dola.accounts) ? loginMuseOne : null,
    selected: st.selected,
    onSelect: (id, on) => { if (on) st.selected.add(id); else st.selected.delete(id); paintTable(); },
    onSelectAll: (on) => { for (const a of rows) { if (on) st.selected.add(a.id); else st.selected.delete(a.id); } paintTable(); },
  });
}

function paintPlatformPage() {
  paintHead();
  paintChipRow();
  paintAddBox(paintAll);
  const onEleven = st.platform === EL_TYPE;
  elevenPanel?.show(onEleven);
  if (onEleven && elevenPanel) $('su-add-note').hidden = true; // the ElevenLabs panel is its own note; without it (an older core) the note asks for an update
  if (onEleven !== elevenOpen) { elevenOpen = onEleven; if (onEleven) elevenPanel?.load(); } // the panel reads the core's settings each time its page opens
  paintTable();
}

function paintAll() {
  const n = readyCount();
  shownReady = n;
  shownWaiting = museWaiting(st.view);
  shownElevenReady = elevenReadyCount(st.view);
  $('nav-badge').textContent = String(n);
  $('nav-badge').classList.toggle('nav-badge--zero', n === 0);
  paintSidebar();
  for (const [page, id] of Object.entries(PAGES)) $(id).hidden = st.page !== page;
  if (st.page === 'platform') paintPlatformPage();
}

export function setView(next) {
  st.view = accountsFeed(next); // the core's account notes in the page's language
  paintAll();
}

// Tasks pushed by the queue: the table only redraws when the set of accounts that are busy really changes.
function trackTasks(tasks) {
  for (const task of tasks || []) {
    if (task.status === 'running' && task.accountId) running.set(task.id, task.accountId);
    else running.delete(task.id);
  }
  const sig = [...busyIds()].sort().join(',');
  if (sig === busySig) return;
  busySig = sig;
  if (st.page === 'platform') paintTable();
}

hooks.paintTable = () => { if (st.page === 'platform') paintTable(); };
bindSideKeys($('su-side'));
bindAddBox();
$('su-reset-all').onclick = resetAll;
$('su-search').oninput = (e) => { st.query = e.target.value; paintTable(); };
onProxySummary(paintSidebar);
window.dola.accounts.onChange(setView);
window.dola.queue.onChange(trackTasks);
// Once a second: the "Nghỉ tạm" clocks tick, and when a rest ends (the count of ready accounts moves) the screen redraws.
setInterval(() => {
  tickCountdowns();
  if (readyCount() !== shownReady || museWaiting(st.view) !== shownWaiting || elevenReadyCount(st.view) !== shownElevenReady) paintAll();
}, 1000);

export async function initSetup() {
  setView(await window.dola.accounts.list());
  try {
    st.opts = (await window.dola.options?.()) || null; // tells whether the core has Veo (the Veo row shows without a Gmail account then)
  } catch {
    // an older core without options: the row shows only once a Gmail account exists
  }
  paintDiagNotice($('su-diag'), st.opts); // the one-line notice of the support log: only for a core that says options().diag
  // Open on the first platform that has accounts (Seedance first), not on an empty table.
  st.platform = firstPlatform(platformsOffered(window.dola.accounts, st.view, st.opts, elevenApi), st.view);
  paintAll();
  await initShowSwitch();
  await museParallel.load();
  try {
    trackTasks(await window.dola.queue.list());
  } catch {
    // The queue is not up yet: no row is marked "Đang chạy" until queue:changed arrives.
  }
  await initBrowserSwitch();
}
