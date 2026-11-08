import { ct } from './core-text.js';
import { errText } from './ui-text.js';

// The ElevenLabs part of the Setup screen: the words, the status badge of a row, the settings answers of the core and the actions behind the buttons.
// Pure functions only (no DOM, no Electron): setup.js, setup-platforms.js and the setup-eleven-*.js files draw, tests/setup-eleven.test.js tests them.
// The core MAKES these accounts itself (a real Chrome, one at a time) and keeps them on this machine. The window never sees an e-mail, a password, a proxy
// line or an API key: an account shows as '***', the settings answer only counts (proxyCount) and booleans (hasCaptchaKey). Every action here answers
// { ok, text, bad, settings? } and never throws; a refusal of the core is its own fixed sentence (note), a crash is a sentence without any detail.

export const EL_TYPE = 'elevenlabs';
export const MASK = '***';
export const MAX_COUNT = 20;
export const DEFAULT_COUNT = 3;
export const isEl = (a) => a?.type === EL_TYPE;
// The accounts that can make a video or a picture: an ElevenLabs account never can (the core never picks it for a Dola, Muse or Veo task), so every picker of accounts leaves it out.
export const withoutEleven = (list) => (Array.isArray(list) ? list.filter((a) => !isEl(a)) : list);

export const EL_TEXT = Object.freeze({
  oldApp: 'Cần cập nhật app lên bản mới để tạo acc ElevenLabs.',
  locked: 'App đang bị khoá, chưa dùng được mục này.',
  warning: 'Lưu ý: acc ElevenLabs do app tự tạo có thể bị ElevenLabs khoá. Bạn tự chịu trách nhiệm về điều khoản của ElevenLabs và của nền tảng giải captcha (nếu bạn dùng). Email, mật khẩu, proxy và API key chỉ lưu trên máy bạn, không bao giờ hiện ra màn hình.',
  topup: 'Khi hết ký tự, app tự tạo thêm tài khoản (bắt đầu từ lần đầu bạn bấm Tạo tài khoản).',
  empty: 'Chưa có tài khoản ElevenLabs nào. Bấm "Tạo tài khoản" ở khung trên, app tự tạo lần lượt từng acc.',
  proxyPlaceholder: 'Để trống = chạy không proxy',
  proxyHint: 'Mỗi dòng một proxy (host:port:user:pass hoặc user:pass@host:port). Danh sách dán vào thay toàn bộ danh sách đang lưu. App không bao giờ hiện lại proxy đã lưu.',
  countNote: `Số tài khoản mỗi lần tạo phải là số nguyên từ 1 đến ${MAX_COUNT}.`,
  noProxies: 'Chưa có proxy: tài khoản được tạo không qua proxy.',
});
export const proxyPlaceholderFor = (count) => (count > 0 ? `Dán danh sách mới để thay ${count} proxy đang lưu` : EL_TEXT.proxyPlaceholder);
export const proxyCountText = (count) => (count > 0 ? `Đã lưu ${count} proxy: app dùng lần lượt từng proxy khi tạo acc.` : EL_TEXT.noProxies);

// ── Which tab, which accounts ──
export const elevenApiOk = (api) => typeof api?.settings === 'function';
// The tab shows when the core says options().elevenlabs AND really has the channels, or when an ElevenLabs account already exists (an older core has neither).
export const elevenOffered = (api, opts, view) => (opts?.elevenlabs === true && elevenApiOk(api)) || (Array.isArray(view) && view.some(isEl));

// ── Status of a row ──
const STATUS_TEXT = { creating: 'Đang tạo', captcha: 'Cần giải captcha', ready: 'Sẵn sàng', spent: 'Hết ký tự', flagged: 'Bị khoá', dead: 'Tạo lỗi' };
const STATUS_CLS = { creating: 'login', captcha: 'limit', ready: 'ready', spent: 'used', flagged: 'rest', dead: 'dead' }; // the stp-badge--<cls> classes of setup.css
const LOCKED_NOTE = 'Bị khoá'; // the core's note for an account that was flagged twice (status dead)

// What the row is NOW: a rest or a month that is over makes it ready again (the core does the same when it makes the view, but a view is not remade every second).
export function elevenStatus(acc, now = Date.now()) {
  const st = String(acc?.status || '');
  if (st === 'flagged' && !(acc.restUntil > now)) return 'ready';
  if (st === 'spent' && acc.restUntil > 0 && now >= acc.restUntil) return 'ready';
  return Object.hasOwn(STATUS_TEXT, st) ? st : '';
}
export const elevenReady = (acc, now = Date.now()) => isEl(acc) && elevenStatus(acc, now) === 'ready';
export const elevenReadyCount = (view, now = Date.now()) => (Array.isArray(view) ? view.filter((a) => elevenReady(a, now)).length : 0);

// { text, cls, until }: until = the ms time a countdown runs to (a captcha waits, a flagged account rests), 0 = none.
export function elevenBadge(acc, now = Date.now()) {
  const st = elevenStatus(acc, now);
  if (!st) return { text: 'Không rõ', cls: 'used', until: 0 };
  const text = st === 'dead' && acc.note === LOCKED_NOTE ? LOCKED_NOTE : STATUS_TEXT[st];
  return { text, cls: STATUS_CLS[st], until: (st === 'captcha' || st === 'flagged') && acc.restUntil > now ? acc.restUntil : 0 };
}

const grouped = (n) => String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); // 9750 -> 9.750
// "Ký tự còn lại": the count with dots, '—' while the core does not know it. A spent account whose month is over has all its characters back.
export function charsText(acc, now = Date.now()) {
  const c = acc?.chars;
  if (!c || !Number.isFinite(c.left) || c.left < 0) return '—';
  const back = acc.status === 'spent' && elevenStatus(acc, now) === 'ready' && Number.isFinite(c.limit) && c.limit > 0;
  return grouped(back ? c.limit : c.left);
}

// Everything the table draws for one account, as plain data. The account column is ALWAYS '***' (whatever the core sent as label): an address could
// never reach the screen through this table. The proxy column says only "Có proxy" / "Không proxy".
export function elevenRowView(acc, i, now = Date.now()) {
  const st = elevenStatus(acc, now);
  const waiting = st === 'creating' || st === 'captcha'; // its Chrome is open: the core refuses to delete it (isBusy)
  const c = acc?.chars;
  return {
    n: i + 1,
    label: MASK,
    proxy: String(acc?.proxyLabel || acc?.proxy || '') === 'Có proxy' ? 'Có proxy' : 'Không proxy',
    badge: elevenBadge(acc, now),
    chars: charsText(acc, now),
    charsTitle: c && Number.isFinite(c.limit) && c.limit > 0 && Number.isFinite(c.left) ? `Còn ${grouped(c.left)} trên ${grouped(c.limit)} ký tự` : 'Chưa biết còn bao nhiêu ký tự',
    note: typeof acc?.note === 'string' ? ct(acc.note.trim()).slice(0, 200) : '', // the core's sentence in the page's language (core-text.js)
    canSolve: st === 'captcha',
    canDelete: !waiting,
    deleteTitle: waiting ? 'Acc đang được tạo hoặc chờ giải captcha: đợi xong (hoặc quá hạn) rồi mới xoá được.' : 'Xoá acc khỏi danh sách',
  };
}

// ── Answers of the core ──
export const noteOf = (r, fallback) => (typeof r?.note === 'string' && r.note.trim() && r.note.length <= 240 ? ct(r.note.trim()) : fallback);
export const failText = (prefix, err) => (/gate_locked/.test(String(err?.message ?? err ?? '')) ? EL_TEXT.locked : `${prefix}: ${errText(err)}`);

export const DEFAULT_SETTINGS = Object.freeze({ proxyCount: 0, regCount: DEFAULT_COUNT, captchaMode: 'self', captchaProvider: '', hasCaptchaKey: false });

// The settings answer of the core, or null when it is not one. Only counts and booleans exist in it.
export function settingsOf(raw) {
  if (!raw || typeof raw !== 'object' || raw.ok === false) return null;
  return {
    proxyCount: Number.isInteger(raw.proxyCount) && raw.proxyCount >= 0 ? raw.proxyCount : 0,
    regCount: Number.isInteger(raw.regCount) && raw.regCount >= 1 && raw.regCount <= MAX_COUNT ? raw.regCount : DEFAULT_COUNT,
    captchaMode: raw.captchaMode === 'solver' ? 'solver' : 'self',
    captchaProvider: typeof raw.captchaProvider === 'string' && /^[\w-]{0,40}$/.test(raw.captchaProvider) ? raw.captchaProvider : '',
    hasCaptchaKey: raw.hasCaptchaKey === true,
  };
}
export async function loadSettings(api) {
  try {
    return settingsOf(await api.settings());
  } catch {
    return null; // locked or not up yet: the panel keeps its defaults and says nothing wrong
  }
}

// One write to the core: -> { ok: true, settings } | { ok: false, text }. The core refuses the whole patch when one field is wrong.
export async function patchSettings(api, patch, fallback) {
  if (typeof api?.setSettings !== 'function') return { ok: false, text: EL_TEXT.oldApp };
  try {
    const r = await api.setSettings(patch);
    const settings = settingsOf(r);
    return settings ? { ok: true, settings } : { ok: false, text: noteOf(r, fallback) };
  } catch (err) {
    return { ok: false, text: failText(fallback.replace(/\.$/, ''), err) };
  }
}
const done = (r, text) => (r.ok ? { ok: true, bad: false, text, settings: r.settings } : { ok: false, bad: true, text: r.text });

// ── The buttons ──
export function parseCount(text) {
  const s = String(text ?? '').trim();
  const n = /^\d{1,3}$/.test(s) ? Number(s) : 0;
  return n >= 1 && n <= MAX_COUNT ? { ok: true, value: n } : { ok: false, note: EL_TEXT.countNote };
}
export async function saveRegCount(api, text) {
  const n = parseCount(text);
  if (!n.ok) return { ok: false, bad: true, text: n.note };
  return done(await patchSettings(api, { regCount: n.value }, 'Không lưu được số tài khoản mỗi lần tạo.'), `Đã lưu: mỗi lần tạo ${n.value} tài khoản.`);
}
export async function saveProxies(api, text) {
  if (!String(text ?? '').trim()) return { ok: false, bad: true, text: 'Chưa dán proxy nào. Muốn bỏ proxy thì bấm "Xoá proxy".' };
  const r = await patchSettings(api, { proxies: String(text) }, 'Không lưu được proxy.');
  return done(r, r.ok ? `Đã lưu ${r.settings.proxyCount} proxy.` : '');
}
export const clearProxies = async (api) => done(await patchSettings(api, { proxies: '' }, 'Không xoá được proxy.'), 'Đã xoá proxy: tài khoản mới tạo không qua proxy.');

export async function registerAccounts(accountsApi, text) {
  const n = parseCount(text);
  if (!n.ok) return { ok: false, bad: true, text: n.note };
  if (typeof accountsApi?.registerElevenlabs !== 'function') return { ok: false, bad: true, text: EL_TEXT.oldApp };
  try {
    const r = await accountsApi.registerElevenlabs(n.value);
    if (r?.ok === false) return { ok: false, bad: true, text: noteOf(r, 'Không tạo được tài khoản ElevenLabs.') };
    return { ok: true, bad: false, text: `Đã bắt đầu tạo ${Number.isInteger(r?.started) ? r.started : n.value} tài khoản, app tạo lần lượt từng acc. Gặp captcha thì dòng acc có nút Giải captcha.` };
  } catch (err) {
    return { ok: false, bad: true, text: failText('Không tạo được tài khoản ElevenLabs', err) };
  }
}

export async function solveCaptcha(api, id) {
  if (typeof api?.solveCaptcha !== 'function') return { ok: false, bad: true, text: EL_TEXT.oldApp };
  try {
    const r = await api.solveCaptcha(id);
    if (r?.ok === false) return { ok: false, bad: true, text: noteOf(r, 'Không mở được cửa sổ giải captcha.') };
    return { ok: true, bad: false, text: 'Đã mở cửa sổ giải captcha của acc này. Giải xong, acc tự chạy tiếp (có thể phải đợi acc đang tạo xong).' };
  } catch (err) {
    return { ok: false, bad: true, text: failText('Không mở được cửa sổ giải captcha', err) };
  }
}

// The trash button of a row: the core asks the person first (a native question) and refuses an account whose Chrome is open.
export async function removeAccount(accountsApi, id) {
  try {
    const r = await accountsApi.remove(id);
    if (r?.reason === 'cancelled') return { ok: false, bad: false, text: '' }; // the person said "Huỷ" in the core's own question: nothing to complain about
    return r?.ok === false ? { ok: false, bad: true, text: noteOf(r, 'Không xoá được acc này.') } : { ok: true, bad: false, text: '' };
  } catch (err) {
    return { ok: false, bad: true, text: failText('Không xoá được acc này', err) };
  }
}
