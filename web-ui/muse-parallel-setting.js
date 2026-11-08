// "Số lệnh cùng lúc mỗi acc Muse" on the Muse tab of the Setup screen: how many commands ONE Muse account runs at once, each in its own Muse side chat.
// The limit lives in the app core (queue settings, key `museParallel`) and counts EVERY command that goes to Muse, whichever page queued it: the core is
// the only place that enforces it, this file only shows and writes the number. Pure, so the rules are tested without a window (tests/muse-parallel-setting.test.js).
import { t } from './i18n.js';

export const MUSE_PARALLEL = { min: 1, def: 3, max: 20 }; // the same range the core accepts (src/muse.js)
export const TITLE = t('Số lệnh cùng lúc mỗi acc Muse');
export const HELP = t('Mỗi acc Muse làm được nhiều ảnh/video cùng lúc, mỗi lệnh một đoạn chat riêng. Đã thử 20 lệnh một lúc vẫn ra đủ. Áp cho Tạo video, Tạo ảnh, Phân tích video và Bàn sáng tạo.');
export const RANGE_NOTE = t('Nhập một số nguyên từ {min} đến {max}.', { min: MUSE_PARALLEL.min, max: MUSE_PARALLEL.max });

// What the core answered to window.dola.queue.settings() -> the number to show, or null when this core has no such setting (an older core: the row stays hidden,
// a box that changed nothing would be a lie). Only a whole number inside the range counts.
export function museParallelOf(settings) {
  const n = settings?.museParallel;
  return Number.isInteger(n) && n >= MUSE_PARALLEL.min && n <= MUSE_PARALLEL.max ? n : null;
}

// What the person typed -> { ok: true, value } | { ok: false, note }. Empty, text, a fraction and anything out of range are refused with one sentence.
export function parseMuseParallel(text) {
  const raw = String(text ?? '').trim();
  if (!/^\d{1,3}$/.test(raw)) return { ok: false, note: RANGE_NOTE };
  const value = Number(raw);
  return value >= MUSE_PARALLEL.min && value <= MUSE_PARALLEL.max ? { ok: true, value } : { ok: false, note: RANGE_NOTE };
}

// Writes the number through window.dola.queue.setSettings. -> { ok: true, value } with what the core now holds, or { ok: false, note }. Never throws.
export async function saveMuseParallel(queue, text, errText = (e) => String(e?.message ?? e)) {
  const parsed = parseMuseParallel(text);
  if (!parsed.ok) return parsed;
  if (typeof queue?.setSettings !== 'function') return { ok: false, note: t('Cần cập nhật app lên bản mới để đổi số lệnh cùng lúc của acc Muse.') };
  try {
    const now = museParallelOf(await queue.setSettings({ museParallel: parsed.value }));
    return now === null ? { ok: false, note: t('App chưa nhận cài đặt này: cập nhật app lên bản mới.') } : { ok: true, value: now };
  } catch (err) {
    return { ok: false, note: t('Không đổi được số lệnh cùng lúc: {why}', { why: errText(err) }) };
  }
}
