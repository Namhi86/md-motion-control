import { EL_TEXT, failText, noteOf, patchSettings } from './setup-eleven.js';

// The captcha choice of the ElevenLabs part of Setup: "Tự giải captcha" (default) or "Dùng nền tảng giải captcha" (a PAID service the person signs up to; the core
// calls it only in that mode, with a key). Pure functions (no DOM): setup-eleven-captcha-ui.js draws, tests/setup-eleven.test.js tests them.
// The API key goes to the core one way: the window sends it once and never gets it back (the settings answer says only `hasCaptchaKey`). Nothing here keeps, logs or draws it.

export const CAPTCHA_TEXT = Object.freeze({
  title: 'Cách xử lý captcha',
  self: 'Tự giải captcha',
  solver: 'Dùng nền tảng giải captcha',
  selfHint: 'Miễn phí. Khi ElevenLabs hiện captcha, dòng acc có nút "Giải captcha": bấm để mở cửa sổ Chrome của acc rồi tự tick. Acc chờ tối đa 30 phút, quá hạn thì báo "Tạo lỗi".',
  none: 'Bản app này chưa có nền tảng giải captcha nào dùng được. Hãy chọn "Tự giải captcha".',
  provider: 'Nền tảng',
  owner: 'Chủ sở hữu',
  signup: 'Đăng ký lấy API key',
  noLink: 'Nền tảng chưa có link đăng ký.',
  copy: 'Sao chép link',
  copied: 'Đã sao chép link, dán vào trình duyệt để mở.',
  copyFailed: 'Không sao chép được, bạn bôi đen link ở trên rồi nhấn Cmd/Ctrl+C.',
  key: 'API key',
  keyHolder: 'Dán API key (chỉ lưu trên máy bạn)',
  keySaved: 'Đã lưu key ✓',
  keyOther: 'Key đã lưu thuộc nền tảng khác: dán key của nền tảng này.',
  change: 'Đổi',
  remove: 'Xoá key',
  cancel: 'Huỷ',
  enable: 'Lưu và bật',
  test: 'Kiểm tra key',
  testing: 'Đang kiểm tra…',
  orphan: 'Có một API key đã lưu trên máy (không dùng khi bạn tự giải captcha).',
  needKey: 'Dán API key của nền tảng trước.',
  needProvider: 'Chưa chọn nền tảng giải captcha.',
  badKey: 'Key không hợp lệ (không có khoảng trắng, tối đa 400 ký tự).',
  noKeyToTest: 'Chưa có key đã lưu để kiểm tra.',
  shape: 'Key trông không đúng dạng của nền tảng này, hãy kiểm tra lại cho chắc.',
});

const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const https = (v) => (/^https:\/\/[^\s"'<>]{4,300}$/.test(String(v)) ? String(v) : ''); // a link only ever shows as https text; nothing else is kept

// The platforms the core offers (captchaProviders()): only well-formed rows, strings cut to a sane length, links only https. A bad answer gives [].
export function providersOf(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^[\w-]{1,40}$/.test(p.id) || !text(p.label, 60)) continue; // String(undefined) would pass the pattern: the type is checked first
    out.push({
      id: p.id, label: text(p.label, 60), owner: text(p.owner, 120), signupUrl: https(p.signupUrl), keyHint: text(p.keyHint, 160),
      freeNote: text(p.freeNote, 160), priceNote: text(p.priceNote, 160), warning: text(p.warning, 500), verified: p.verified === true,
    });
  }
  return out;
}
export async function loadProviders(api) {
  if (typeof api?.captchaProviders !== 'function') return [];
  try {
    return providersOf(await api.captchaProviders());
  } catch {
    return []; // locked or not up yet: the section says there is no platform
  }
}

// What the section shows. settings = settingsOf(...), providers = providersOf(...), draft = { mode?, provider? } the person picked and has not saved yet.
// A saved key belongs to ONE platform (the one the core holds): it is "saved" here only for that platform, and the person must paste a new key for another.
export function captchaView(settings, providers, draft = {}, editing = false) {
  const mode = draft.mode === 'solver' || draft.mode === 'self' ? draft.mode : settings.captchaMode;
  const ids = providers.map((p) => p.id);
  const providerId = ids.includes(draft.provider) ? draft.provider : ids.includes(settings.captchaProvider) ? settings.captchaProvider : ids[0] || '';
  const keySaved = settings.hasCaptchaKey && settings.captchaProvider === providerId && providerId !== '';
  return {
    mode,
    providers,
    providerId,
    provider: providers.find((p) => p.id === providerId) || null,
    keySaved,
    keyOtherPlatform: settings.hasCaptchaKey && settings.captchaProvider !== '' && settings.captchaProvider !== providerId,
    showKeyInput: mode === 'solver' && (!keySaved || editing),
    orphanKey: mode === 'self' && settings.hasCaptchaKey,
    active: settings.captchaMode === 'solver' && settings.captchaProvider === providerId,
  };
}

const done = (r, okText) => (r.ok ? { ok: true, bad: false, text: okText, settings: r.settings } : { ok: false, bad: true, text: r.text });
const KEY_OK = (k) => k.length <= 400 && !/[\s\u0000-\u001f]/.test(k);

// "Lưu và bật": provider + (a new key, or the saved one) -> mode 'solver', in ONE patch (the core refuses a half-set solver and the whole patch with it).
export async function enableSolver(api, { providerId, key, keySaved }) {
  if (!providerId) return { ok: false, bad: true, text: CAPTCHA_TEXT.needProvider };
  const k = String(key ?? '').trim();
  if (!k && !keySaved) return { ok: false, bad: true, text: CAPTCHA_TEXT.needKey };
  if (k && !KEY_OK(k)) return { ok: false, bad: true, text: CAPTCHA_TEXT.badKey };
  const patch = { captchaProvider: providerId, captchaMode: 'solver', ...(k ? { captchaKey: k } : {}) };
  return done(await patchSettings(api, patch, 'Không lưu được cài đặt giải captcha.'), 'Đã bật giải captcha bằng nền tảng. Khoá API chỉ lưu trên máy bạn.');
}
export const useSelf = async (api) => done(await patchSettings(api, { captchaMode: 'self' }, 'Không đổi được cách xử lý captcha.'), 'Đã chuyển về tự giải captcha. Dòng acc sẽ có nút "Giải captcha" khi gặp captcha.');
// Deleting the key also leaves the platform mode: the core refuses 'solver' without a key.
export const deleteKey = async (api) => done(await patchSettings(api, { captchaMode: 'self', captchaKey: '' }, 'Không xoá được key.'), 'Đã xoá key, quay về tự giải captcha.');

const CODE_TEXT = {
  captcha_bad_key: 'Key sai hoặc đã bị thu hồi.',
  captcha_no_balance: 'Tài khoản trên nền tảng hết số dư.',
  captcha_timeout: 'Nền tảng không trả lời kịp, thử lại sau.',
  captcha_unsupported: 'Nền tảng này chưa dùng được.',
  captcha_failed: 'Không kiểm tra được key, thử lại sau.',
};
const NO_BALANCE_API = 'Nền tảng này không cho xem số dư nên app chưa kiểm được key (việc này không tốn tiền). Key sẽ được thử thật khi gặp captcha.';

// "Kiểm tra key": costs nothing. ok true = a balance, null = this platform has no balance call, false = a fixed code. The key itself is never in the answer.
export async function testKey(api) {
  if (typeof api?.testCaptchaKey !== 'function') return { ok: false, bad: true, text: EL_TEXT.oldApp };
  try {
    const r = await api.testCaptchaKey();
    const shape = r?.keyShape === false ? ` ${CAPTCHA_TEXT.shape}` : '';
    if (r?.ok === true) return { ok: true, bad: false, text: `Key dùng được.${Number.isFinite(r.balance) ? ` Số dư: ${r.balance}.` : ''}${shape}` };
    if (r?.ok === null) return { ok: null, bad: false, text: `${NO_BALANCE_API}${shape}` };
    return { ok: false, bad: true, text: `${CODE_TEXT[r?.code] || noteOf(r, 'Không kiểm tra được key.')}${shape}` };
  } catch (err) {
    return { ok: false, bad: true, text: failText('Không kiểm tra được key', err) };
  }
}
