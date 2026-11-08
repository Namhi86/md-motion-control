import { ct } from './core-text.js';
import { getLang, t, tn } from './i18n.js';

// The "Motion control" tab, the part with no DOM (site/motion-*.js draw it): what the core must offer, how a clip is told to the person, the price and time lines, the warnings.
// Nothing here touches window or the page, so tests (tests/motion-form.test.js) need no browser.

// The tab exists only for a core that says so (options().copyMotion === true) and has every call the tab makes; an older core leaves the button hidden.
export function motionOffered(opts, dola) {
  const m = dola?.motion;
  return opts?.copyMotion === true && !!m && ['pickVideo', 'dropVideo', 'prepare', 'start', 'retry', 'cancel', 'status', 'close', 'onProgress'].every((k) => typeof m[k] === 'function');
}

export const RESOLUTIONS = Object.freeze([
  { id: '4k', label: '4K', credits: 20 },
  { id: '2k', label: '2K', credits: 20 },
  { id: '720p', label: '720p', credits: 20 },
  { id: '360p', label: '360p', credits: 10 },
]);
export const MAX_IMAGES = 5;

// How many seconds the person waits for ONE clip (measured 2026-11-04 on Google Flow: 2-5 minutes each, 4 clips of 5.7-10 s took about 12 minutes one after the other)
const CLIP_MINUTES = 4;

// "28,8 giây" / "28.8 seconds": a length for the plan header (tn() picks one/many for English and writes the number; Vietnamese then gets its decimal comma).
export function secondsText(s) {
  const n = Math.round(Number(s) * 10) / 10;
  if (!Number.isFinite(n)) return '';
  const said = tn(n, '{n} giây', '{n} second', '{n} seconds');
  return getLang() === 'en' ? said : said.replace(String(n), String(n).replace('.', ','));
}

// 4.2 -> "4,2" (Vietnamese) / "4.2" (English); one decimal, always shown ("5,0")
export const decimal = (n) => { const s = (Math.round(Number(n) * 10) / 10).toFixed(1); return getLang() === 'en' ? s : s.replace('.', ','); };

// "m:ss" for the cut marks of the plan ("5:42" = 342 s).
export function clock(s) {
  const total = Math.max(0, Math.round(Number(s) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// The facts of the source video on its card: "0:27 · 9:16 · 33 MB". What is not known yet (no metadata read) is left out, never written as "unknown".
const KNOWN_RATIOS = [['9:16', 9 / 16], ['16:9', 16 / 9], ['1:1', 1], ['3:4', 3 / 4], ['4:3', 4 / 3], ['21:9', 21 / 9]];
export function ratioLabel(w, h) {
  if (!(w > 0 && h > 0)) return '';
  const near = KNOWN_RATIOS.find(([, v]) => Math.abs(v - w / h) / v < 0.03);
  return near ? near[0] : `${w}x${h}`;
}
export function sizeText(bytes) {
  const b = Number(bytes);
  if (!(b > 0)) return '';
  return b >= 1e9 ? `${decimal(b / 1e9)} GB` : `${Math.max(1, Math.round(b / 1e6))} MB`;
}
// The same facts as parts: [{ kind: 'time' | 'ratio' | 'size', text }]; the chips with an icon (motion-facts.js) are drawn from them.
export function factsParts({ seconds, width, height, bytes }) {
  return [
    { kind: 'time', text: seconds > 0 && Number.isFinite(seconds) ? clock(seconds) : '' },
    { kind: 'ratio', text: ratioLabel(width, height) },
    { kind: 'size', text: sizeText(bytes) },
  ].filter((p) => p.text);
}
export const factsText = (m) => factsParts(m).map((p) => p.text).join(' · ');
// the same from a <video> element whose metadata has loaded
export const factsOf = (video, bytes) => factsText({ seconds: video.duration, width: video.videoWidth, height: video.videoHeight, bytes });

// The price line of step 2: n clips x the price of the chosen quality, and an honest time (clips of different shots run side by side, up to the Gmail accounts that can work).
// segments = the plan of motion.prepare (cutAt of each); accounts = how many Veo Gmail accounts can work now (info.usable, 1 when not known).
export function priceLine({ segments, resolution, accounts = 1 }) {
  const res = RESOLUTIONS.find((r) => r.id === resolution) || RESOLUTIONS[0];
  const n = segments.length;
  const total = res.credits * n;
  // the clips of one shot wait for each other: the longest chain decides the time when the accounts are enough, else the clips share the accounts
  const chains = segments.reduce((acc, s, i) => (i === 0 || segments[i - 1].cutAt === 'scene' ? [...acc, 1] : [...acc.slice(0, -1), acc.at(-1) + 1]), []);
  const longest = Math.max(...chains);
  const lanes = Math.max(1, Math.min(accounts, chains.length));
  const minutes = Math.max(longest, Math.ceil(n / lanes)) * CLIP_MINUTES;
  return {
    total,
    minutes,
    text: t('{n} đoạn × {each} = {total} credit Flow (acc Google của bạn) · khoảng {min} phút', { n, each: res.credits, total, min: minutes }),
  };
}

// A line the person typed or the transcript wrote for one clip -> a warning when it cannot be said in the clip's length (a voice rushed to fit is the thing people notice).
// Same measure as the core (src/motion-plan.js lineFits): words are the space-separated tokens with a letter or a digit; above 4.8 words a second is too fast.
export const MAX_WORDS_PER_SECOND = 4.8;
export const WARN_WORDS_PER_SECOND = 3.5; // up to this is comfortable (green), up to MAX is brisk (amber), above it is rushed (red)
export const countWords = (text) => String(text ?? '').split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
export function lineWarning(text, seconds) {
  const words = countWords(text);
  if (!words || !(seconds > 0)) return '';
  const rate = words / seconds;
  return rate > MAX_WORDS_PER_SECOND ? t('Câu hơi dài so với đoạn: nhân vật phải đọc nhanh. Rút ngắn câu hoặc chấp nhận giọng nhanh.') : '';
}

// The speed badge of a clip: words a second -> a colour class suffix ('ok' | 'warn' | 'bad') and the text "4,2 từ/giây". A clip with no line has no badge (rate 0).
export const wordsPerSecond = (text, seconds) => (seconds > 0 ? countWords(text) / seconds : 0);
export const rateClass = (rate) => (rate <= WARN_WORDS_PER_SECOND ? 'ok' : rate <= MAX_WORDS_PER_SECOND ? 'warn' : 'bad');
export function rateText(rate) {
  return t('{rate} từ/giây', { rate: decimal(rate) });
}

// May this clip be made again by itself? Only a failed or cancelled one; 'at_flow' / 'not_saved': the clip is already paid and comes to the Library, a second paid try would be a loss.
export const canRetry = (clip) => (clip?.state === 'failed' || clip?.state === 'cancelled') && clip.reason !== 'at_flow' && clip.reason !== 'not_saved';

// What the person reads for the state of one clip.
export function stateText(clip) {
  switch (clip?.state) {
    case 'waiting': return ct(clip.note) || t('Đang chờ');
    case 'cutting': return t('Đang cắt đoạn');
    case 'queued': return t('Đã gửi, chờ acc rảnh');
    case 'making': return t('Flow đang làm');
    case 'done': return t('Xong');
    case 'cancelled': return clip.reason === 'at_flow' ? ct(clip.note) : t('Đã huỷ');
    case 'failed': return failText(clip);
    default: return '';
  }
}

// A failed clip: the reason in plain words, and whether the credit came back (a refusal by Flow's filter is refunded, measured 2026-11-04: "You will be refunded for this generation").
const FAIL = {
  veo_content_refused: t('Flow từ chối ảnh hoặc video này (thường vì ảnh trông giống người nổi tiếng hoặc có nhiều khuôn mặt). Đã hoàn credit. Đổi ảnh nhân vật rồi làm lại đoạn này.'),
  veo_no_credits: t('Acc Google hết credit Flow. Nạp thêm hoặc đợi, rồi làm lại đoạn này.'),
  veo_timeout: t('Flow làm quá lâu. Kiểm tra trong Google Flow rồi làm lại đoạn này.'),
  queue_refused: t('Hàng đợi từ chối đoạn này.'),
  ffmpeg_failed: t('Không cắt được đoạn này từ video.'),
};
export function failText(clip) {
  return FAIL[clip?.reason] || ct(clip?.note) || t('Flow không làm được đoạn này.');
}

// Is the film over, and how? result = the last progress/status result: { url, name, seconds } | { reason, note } | null
export const finished = (result) => !!result;
export const succeeded = (result) => !!result?.url;

// How many clips are in each state, for the progress strip ("2 xong · 1 đang làm · 1 chờ").
export function counts(clips) {
  const c = { done: 0, making: 0, waiting: 0, failed: 0 };
  for (const x of clips || []) {
    if (x.state === 'done') c.done += 1;
    else if (x.state === 'failed' || x.state === 'cancelled') c.failed += 1;
    else if (x.state === 'making' || x.state === 'queued' || x.state === 'cutting') c.making += 1;
    else c.waiting += 1;
  }
  return c;
}

// The language the clips are told to speak when the person did not ask for a translation: the one the transcript heard most (src/motion-transcript.js `lang`, a short code), as the English name Flow reads.
// An unknown or empty code is Vietnamese (the app's own language and the one measured). Only the name goes into the prompt, never the code.
const LANGUAGE_NAMES = { vi: 'Vietnamese', en: 'English', ja: 'Japanese', ko: 'Korean', zh: 'Chinese', th: 'Thai', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian', id: 'Indonesian', hi: 'Hindi', ar: 'Arabic', it: 'Italian' };
export function spokenLanguage(segments) {
  const votes = new Map();
  for (const s of segments || []) {
    const code = String(s?.lang || '').toLowerCase().split('-')[0];
    if (s?.has_speech && LANGUAGE_NAMES[code]) votes.set(code, (votes.get(code) || 0) + 1);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? LANGUAGE_NAMES[best[0]] : 'Vietnamese';
}
