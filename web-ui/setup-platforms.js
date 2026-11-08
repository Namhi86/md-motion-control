import { EL_TEXT, EL_TYPE, elevenOffered, elevenReady, isEl } from './setup-eleven.js';
import { t } from './i18n.js';
import { MUSE_OLD_APP, MUSE_TYPES, museCards, needsLogin } from './setup-muse.js';
import { effectiveStatus } from './ui-text.js';

// The platform tabs of the Setup screen: Seedance | Muse | Veo | ElevenLabs. Pure functions (no DOM, no Electron): setup.js and setup-platform-ui.js draw,
// tests/setup-platforms.test.js tests them. A platform is the place an account is USED, and each tab lists the accounts that work there:
//   Seedance  Facebook, Gmail of Seedance and (left over from older versions) Dola-cookie accounts   -> src/scheduler-pick.js: every mode but Veo and Muse
//   Muse      Muse accounts only
//   Veo       Gmail accounts made for Veo only. The Gmail accounts of Seedance and of Veo are TWO SEPARATE sets (Sếp 2026-10-18): the same address
//             on both is two accounts, each with its own session and its own rest ("hết credit Flow" rests the Veo one only).
//             An account is of Veo when its public view says platform 'veo'; no platform (an older Gmail account or core) = Seedance.
//   ElevenLabs  accounts the app MAKES itself (type 'elevenlabs', shown as '***'): no paste box, a panel of settings instead (setup-eleven-ui.js). They are never
//             "ready" for a video or a picture (isReady below), so they never unlock the Tạo button nor count in the number next to "Setup tài khoản".
// An account of a type this web does not know yet is listed under Seedance with its type as "Loại", so nothing is ever hidden.

export const PLATFORMS = {
  veo: {
    label: 'Google Flow (Veo)',
    desc: t('Google Flow (Veo) chạy bằng tài khoản Gmail của bạn, dùng cho cả Motion Control và Tạo video từ prompt (khoảng 50 credit miễn phí mỗi ngày).'),
  },
  muse: {
    label: 'Muse',
    desc: t('Muse (muse.ai) tạo video và ảnh. Thêm acc bằng email (bạn tự gõ mã Muse gửi về mail) hoặc bằng cookie đăng nhập.'),
  },
  seedance: {
    label: 'Seedance',
    desc: t('Seedance tạo video bằng Dola: app đăng nhập Dola qua Facebook hoặc Gmail. Hết lượt trong ngày thì app tự chuyển sang acc kế tiếp.'),
  },
  elevenlabs: {
    label: 'ElevenLabs',
    desc: 'ElevenLabs tạo giọng nói. App tự tạo các tài khoản ElevenLabs miễn phí lần lượt từng acc bằng Chrome thật; bạn chỉ chọn proxy, số acc mỗi lần tạo và cách xử lý captcha. Tài khoản luôn hiện là ***.',
  },
};
export const PLATFORM_IDS = Object.keys(PLATFORMS);

// What the Veo tab says instead of the paste box when the app core cannot add a Gmail account for Veo (it does not say `accountPlatforms`).
export const VEO_UPDATE_NOTE = t('Cần cập nhật app để thêm acc Gmail cho Veo.');

// The tab an account is listed under: ONE tab each (the Gmail accounts of Seedance and of Veo are separate sets).
export function platformsOf(acc) {
  if (isEl(acc)) return ['elevenlabs'];
  if (acc?.type === 'muse') return ['muse'];
  if (acc?.type === 'google') return [acc.platform === 'veo' ? 'veo' : 'seedance'];
  return ['seedance'];
}
export const accountsOf = (platform, view) => view.filter((a) => platformsOf(a).includes(platform));

// Ready = switched on and usable now (a resting account is ready again once its rest is over; a Muse account whose login wait ran out is not).
// An ElevenLabs account is never ready HERE: it cannot make a video or a picture (like isReady of src/accounts.js in the core); its own "Sẵn sàng" is elevenReady.
export const isReady = (acc, now = Date.now()) => !isEl(acc) && effectiveStatus(acc, now) === 'ready' && !needsLogin(acc, now);
// The number on a tab: accounts ready / accounts listed there (on the ElevenLabs tab: the accounts that can make a voice).
export function tabCount(platform, view, now = Date.now()) {
  const list = accountsOf(platform, view);
  const ready = platform === EL_TYPE ? elevenReady : isReady;
  return { ready: list.filter((a) => ready(a, now)).length, total: list.length };
}

// The ways to ADD an account on a tab: [[key, button text], …]. The key is the form key of setup.js (TYPES / MUSE_TYPES).
// The Muse kinds follow the functions the app core offers: an older core offers none. Veo has one, a Gmail account made for Veo, and only when the
// core says it can (opts = window.dola.options(), key `accountPlatforms`): an older core would make a Seedance account out of it.
const SEEDANCE_KINDS = [['facebook', 'Facebook cookie'], ['fbpass', 'Facebook id|pass|2fa'], ['gmail', 'Gmail']];
const VEO_KINDS = [['gmail_veo', 'Gmail']];
export function addKindsOf(platform, core, opts) {
  if (platform === 'seedance') return SEEDANCE_KINDS;
  if (platform === 'muse') return Object.keys(museCards(core)).map((key) => [key, MUSE_TYPES[key].label]);
  if (platform === 'veo') return opts?.accountPlatforms === true && typeof core?.addGoogle === 'function' ? VEO_KINDS : [];
  return [];
}
// The kind to show on a tab: the open one when this tab has it, else the tab's first ('' when it has none).
export function openKind(platform, kind, core, opts) {
  const kinds = addKindsOf(platform, core, opts);
  return kinds.some(([key]) => key === kind) ? kind : kinds[0]?.[0] || '';
}
// What a tab says instead of the paste box when it has no way to add (Veo or Muse on a core that cannot add them).
export const noAddNote = (platform) => (platform === 'veo' ? VEO_UPDATE_NOTE : platform === 'muse' ? MUSE_OLD_APP : platform === EL_TYPE ? EL_TEXT.oldApp : '');

// The tabs to show, in order. Seedance always. Muse when the core can add Muse accounts or a Muse account exists. Veo when the core says it
// has Veo (opts = window.dola.options(), null until it arrives) or a Veo Gmail account exists. ElevenLabs when the core says options().elevenlabs AND has
// window.dola.elevenlabs (`eleven`, the 4th argument: undefined = an older core without it) or an ElevenLabs account already exists.
// Chỉ hiển thị nền tảng Google Flow (Veo) trong mục Setup tài khoản
export function platformsOffered() {
  return ['veo'];
}
export const firstPlatform = () => 'veo';

// The "Loại" column.
export function typeLabel(acc) {
  switch (acc?.type) {
    case 'facebook': return acc.hasLogin === true ? 'Facebook · id|pass' : 'Facebook';
    case 'google': return 'Gmail';
    case 'dola': return 'Dola';
    case 'muse': return 'Muse';
    case EL_TYPE: return 'ElevenLabs';
    default: return String(acc?.type || '?');
  }
}
// The header of the account column.
export const accountHeader = (platform) => ({ muse: t('Email / ID Muse'), veo: t('Email Gmail') }[platform] || t('Tài khoản'));
