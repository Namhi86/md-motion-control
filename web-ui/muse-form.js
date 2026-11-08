import { t, tn } from './i18n.js';
import { effectiveStatus } from './ui-text.js';
import { needsLogin } from './setup-muse.js';

// The Muse part of the "Tạo video" form: texts and rules, pure (no DOM, no Electron). app.js, history.js, queue-ui.js and muse-ui.js call them,
// tests/muse-form.test.js tests them. Everything Muse is gated by what the app core offers: window.dola.options() gives `muse` and `image`
// and lists 'muse' in `modes`; an older core has none of these, and then nothing here changes the form, the payload or the history.
// Two modes: 'muse' (a clip, 2-60 s, or 0 = "Theo prompt") and 'image' (a mode of the form only: the core gets mode 'muse' + kind 'image').
const IMAGE_FILE = /\.(webp|png|jpe?g)$/i;
const CLIP_SECONDS = 10; // Muse makes clips of about 10 s and joins them itself

export const MUSE_LABEL = { muse: 'Muse', image: t('Tạo ảnh (Muse)') };
export const MUSE_DESC = {
  muse: t('Video 2-60 giây từ chữ hoặc từ ảnh: Muse tự chia thành các clip ~10 giây rồi ghép thành một file, có tiếng. 10 giây ~1 phút, 30 giây ~4-6 phút. Cần thêm acc Muse ở Setup.'),
  image: t('Tạo ảnh từ chữ bằng Muse, khoảng 25 giây, ra file webp 1920x1280. Cần acc Muse.'),
};
export const MUSE_NOTE = {
  video: t('Muse Video là model duy nhất của Muse. Video có tiếng, làm bằng acc Muse (thêm ở Setup).'),
  image: t('Muse Image là model ảnh duy nhất. Làm bằng acc Muse (thêm ở Setup).'), // the screen of a core that offers no Nano Banana
  imageMuse: t('Muse Image làm bằng acc Muse (thêm ở Setup), khoảng 25 giây mỗi ảnh. Không chọn tỉ lệ: ảnh ra khung 1920x1280.'), // with Nano Banana next to it
  imageNano: t('Nano Banana làm bằng acc Gmail Veo (thêm ở Setup → Veo), chạy trên Google Flow, khoảng 25 giây mỗi ảnh. Chọn được tỉ lệ, kèm ảnh tham chiếu nếu muốn.'),
  ratio: t('Muse làm video theo tỉ lệ bạn chọn (app ghi tỉ lệ vào lời lệnh).'),
  ratioImage: t('Muse không chọn tỉ lệ: ảnh ra khung 1920x1280.'),
  script: t('Muse làm các đoạn ~10 giây theo kịch bản của bạn rồi ghép thành một file. Hướng dẫn nằm dưới ô mô tả.'),
  noAccount: t('Chưa có acc Muse sẵn sàng: lệnh sẽ chờ. Vào "Setup tài khoản" để thêm hoặc đăng nhập acc Muse.'),
  noAccountVeo: t('Chưa có acc Gmail Veo sẵn sàng: lệnh sẽ chờ. Vào "Setup tài khoản" → Veo để thêm.'),
};
export const SCRIPT_SAMPLE = t('[0-10s] một chiếc diều bay trên hồ lúc bình minh. [10-20s] diều bay qua bến cảng đêm.');
export const SCRIPT_GUIDE = t('Viết kịch bản theo mốc giây, mỗi mốc ~10 giây. Ví dụ: {sample} Muse tự làm các clip rồi ghép thành một file. Không để dòng trống giữa các mốc.', { sample: SCRIPT_SAMPLE });
export const SAMPLE_BUTTON = { put: t('Chèn mẫu'), sure: t('Ô đang có chữ: bấm lần nữa để thay') };
export const IMAGE_HINT = {
  none: [t('Ảnh đã tạo xong nhưng chưa có tệp trên máy.'), t('Thử nút "Lấy lại" bên dưới hoặc bấm "Tạo lại".')],
  broken: [t('Không mở được ảnh này: tệp đã mất.'), t('Bấm "Tạo lại" để làm ảnh mới.')],
};

// Is `mode` a choice of the mode button for this core? The Dola modes as before (listed in opts.modes; Veo also needs opts.veo);
// Muse needs opts.muse; "image" needs opts.image and the core's 'muse' mode (it sends mode 'muse' with kind 'image').
// 'fast' (Nhanh) is never a choice any more (2026-10-21): an older core still lists it, the page does not offer it. Old tasks of that mode still
// render (ui-text.js MODE_LABEL) and the core still accepts them.
export function modeOffered(mode, opts) {
  if (!Array.isArray(opts?.modes) || mode === 'fast') return false;
  if (mode === 'image') return !!opts.image && opts.modes.includes('muse');
  if (!opts.modes.includes(mode)) return false;
  return (mode !== 'veo' || !!opts.veo) && (mode !== 'muse' || !!opts.muse);
}

// A Nano Banana picture (board node "Ảnh Nano Banana"): a Veo-mode task that asks for a picture (the core: src/nano-banana.js isNanoTask). It is an image
// like a Muse one (kind 'image': no length chip, an <img> in the history), but it was made in Google Flow, not by Muse, so its chip says so.
export const isNanoTask = (task) => task?.mode === 'veo' && task?.kind === 'image';
export function isImageTask(task) {
  return task?.kind === 'image' || (task?.mode === 'muse' && IMAGE_FILE.test(String(task.result?.file ?? '')));
}
// The form mode a history row goes back to: an image task opens the image mode.
export const modeOfTask = (task) => (isImageTask(task) ? 'image' : task?.mode);

// Minutes the core needs for a clip of `seconds` (measured: 10 s ~1, 30 s ~4-6; 60 s is a guess until P8 measures it). 0 = not a length.
export function estimateMinutes(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  if (seconds <= 10) return 1;
  if (seconds <= 20) return 2;
  return seconds <= 30 ? 5 : 9;
}
// The line under the bar: only when the clip is longer than one 10-second piece.
export function museHint(seconds) {
  const n = estimateMinutes(seconds);
  return seconds > CLIP_SECONDS && n ? t('Muse làm từng đoạn {seconds} giây rồi ghép: khoảng {minutes}.', { seconds: CLIP_SECONDS, minutes: tn(n, '{n} phút', '{n} minute', '{n} minutes') }) : '';
}

// Reference pictures of a Muse clip. How many the core takes is `opts.muse.maxImages` (measured: Muse accepts at least 3 in one message, the
// core's cap is 5); a core that says nothing is an older one that takes exactly 1, and the form must keep working with it.
const MAX_REF_ANY = 10; // the most the app ever takes for any mode
export function museRefMax(opts) {
  const n = opts?.muse?.maxImages;
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_REF_ANY) : 1;
}
const capOf = (max) => (Number.isInteger(max) && max >= 1 ? max : 1);
// The first `max` pictures stay (the earliest picked); `dropped` says some were left out. No `max` = 1.
export function clampRefs(files, max) {
  const list = Array.isArray(files) ? files : [];
  const cap = capOf(max);
  return { files: list.slice(0, cap), dropped: list.length > cap };
}
// The pictures after the person picked `picked` while `current` were already there. With a cap of 1 the new picture takes the place of the old
// one ("Đổi ảnh"); with more they are added behind the ones there (the same picture twice counts once) and what does not fit is dropped.
export function refsAfterPick(current, picked, max) {
  const cap = capOf(max);
  const now = Array.isArray(current) ? current : [];
  const fresh = Array.isArray(picked) ? picked : [];
  if (cap === 1) return fresh.length ? clampRefs(fresh, 1) : { files: now.slice(0, 1), dropped: false };
  const all = [...now, ...fresh].filter((f, i, list) => list.findIndex((g) => g?.handle === f?.handle) === i);
  return clampRefs(all, cap);
}
export const tooManyRefs = (max, name = 'Muse') => t('{name} nhận tối đa {images}: các ảnh thừa đã bỏ.', { name, images: tn(capOf(max), '{n} ảnh', '{n} image', '{n} images') }); // name: the family whose box it is (Nano Banana has its own)
// The empty box of the Muse form: with one picture the button says "1 ảnh", with more it only says the most.
export const museRefLabels = (max) => ({ label: capOf(max) === 1 ? t('Thêm 1 ảnh tham chiếu') : t('Thêm ảnh tham chiếu'), hint: tn(capOf(max), 'Tối đa {n} ảnh · bỏ trống = tạo từ chữ', 'Up to {n} image · leave empty = create from text', 'Up to {n} images · leave empty = create from text') });

// The fields a Muse task adds to the payload. Video: duration N (the bar) or 0 ("Theo prompt": the person wrote the script), the pictures
// (at most `maxImages`, 1 when unknown). Image: no length (0) and no image. `model` is the id the core listed in opts.muse / opts.image.
export function museTaskFields({ kind = 'video', model, museScript = false, duration, files = [], maxImages, range = { min: 2, max: 60 } }) {
  if (kind === 'image') return { mode: 'muse', kind, model, duration: 0, files: [] };
  const seconds = museScript ? 0 : Math.min(range.max, Math.max(range.min, Math.round(Number(duration) || range.min)));
  return { mode: 'muse', kind: 'video', model, duration: seconds, files: clampRefs(files, maxImages).files };
}

// The saved duration that may be restored: tested against the range of the saved mode (Muse and image: 2-60; any other: the Dola range,
// as before). null = keep the default.
export function savedDuration(saved, opts) {
  const range = (saved?.mode === 'muse' || saved?.mode === 'image') && opts?.muse ? opts.muse.duration : saved?.mode === 'veo' && opts?.veo?.duration ? opts.veo.duration : opts?.duration;
  const d = saved?.duration;
  return Number.isInteger(d) && range && d >= range.min && d <= range.max ? d : null;
}
// "Tạo lại": the length and the "Theo prompt" flag a row brings back. Duration 0 of a Muse clip is the flag (the bar keeps its number);
// an image has no length; a Muse clip of N seconds turns the flag off; any other task leaves the flag alone.
export function rerunDuration(task, prefs) {
  if (isImageTask(task)) return { duration: prefs.duration, museScript: prefs.museScript };
  if (task?.mode === 'muse') return task.duration === 0 ? { duration: prefs.duration, museScript: true } : { duration: task.duration, museScript: false };
  return { duration: task.duration, museScript: prefs.museScript };
}
export const durationLabel = (prefs) => (prefs.mode === 'muse' && prefs.museScript ? t('Theo prompt') : `${prefs.duration}s`);

// History rows: the length chip ('' = none: an image has no length) and the mode chip ('' = none).
export function durationText(task) {
  if (isImageTask(task)) return '';
  return task?.mode === 'muse' && task.duration === 0 ? t('Theo prompt') : `${task?.duration}s`;
}
export function modeChipText(task) {
  if (isNanoTask(task)) return 'Nano Banana';
  if (task?.mode === 'muse') return isImageTask(task) ? t('Muse · Ảnh') : 'Muse';
  return { pro: 'Pro', voice: t('Có tiếng'), veo: 'Veo' }[task?.mode] || '';
}

// "Chèn mẫu": text that is already in the box is never overwritten on the first press; the second press on the same text does.
// -> { text: string | null (null = leave the box), armed: boolean }
export function sampleInsert(current, armed) {
  if (!String(current ?? '').trim() || armed) return { text: SCRIPT_SAMPLE, armed: false };
  return { text: null, armed: true };
}

// Muse accounts ready to work now: the same rule as the Setup screen (switched on, not resting, not waiting for a login).
export const museReadyCount = (accounts) => (Array.isArray(accounts) ? accounts : []).filter((a) => a?.type === 'muse' && effectiveStatus(a) === 'ready' && !needsLogin(a)).length;
