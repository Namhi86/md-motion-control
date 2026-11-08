import { el, modelMenu } from './pop.js';
import { t } from './i18n.js';
import { groupedModelPop } from './model-popup.js';
import { SEEDANCE_MODES, modelGroups, pickPatch, selectedKey } from './model-groups.js';
import { modeOffered } from './muse-form.js';
import { veoModeNoteText } from './veo-images-text.js';

// The pieces of the "Tạo video" form that the "Phân tích video" tab draws again for its destination (Model row, the three pills, their popups):
// built here once so the two screens cannot drift apart. Pure builders (no state of their own): app.js and analyze-target.js call them,
// tests/analyze-target.test.js tests them. The SVG paths are the ones of site/index.html (#dur-btn / #ratio-btn / #mode-btn); the test compares them.
export const PILL_ICON = {
  dur: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 7.75V12L14.75 14.75M21.25 12C21.25 17.1086 17.1086 21.25 12 21.25C6.89137 21.25 2.75 17.1086 2.75 12C2.75 6.89137 6.89137 2.75 12 2.75C17.1086 2.75 21.25 6.89137 21.25 12Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>',
  ratio: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.75 3.75C4.75 3.19772 5.19772 2.75 5.75 2.75H18.25C18.8023 2.75 19.25 3.19772 19.25 3.75V20.25C19.25 20.8023 18.8023 21.25 18.25 21.25H5.75C5.19771 21.25 4.75 20.8023 4.75 20.25V3.75Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" /></svg>',
  mode: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 2.75 4.75 13.25H12L11 21.25l8.25-10.5H12L13 2.75Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>',
};
const CHEVRON = '<svg class="cv-frow-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6" /></svg>';

export const MODE_DESC = {
  voice: t('CÓ TIẾNG, dùng điểm miễn phí hằng ngày, khoảng 4 phút. Chỉ làm 4-10 giây (lệnh dài hơn sẽ ra 10s). Dễ bị Dola chặn nếu cảnh có hát hoặc nhạc.'),
  pro: t('Đủ 15s và CÓ TIẾNG, nhưng chậm hơn, hay bị Dola báo bận (app tự gửi lại) và hạn mức Pro riêng 7 ngày. Hết hạn mức thì app đổi sang acc khác.'),
};
export const DURATION_NOTE = t('Acc Dola miễn phí chỉ làm tới 15s: lệnh dài hơn mà Dola báo lỗi thì app tự gửi lại bản 15s (acc trả phí có thể làm dài hơn).');
const SEEDANCE_NOTE = t('Seedance 2.5 là mã app đã chạy thật; hai bản còn lại gửi theo tên trên màn hình Dola, chưa chạy thử.');
const veoNote = (opts) => t('Giá mỗi clip tính bằng credit Flow của acc Gmail. Veo 3.1 sẽ ngừng trên Gemini API từ 22/10; trên Flow vẫn còn, Omni 1.1 Flash là bản thay thế. {images}', { images: veoModeNoteText(opts) });

const asButton = (node) => Object.assign(node, { type: 'button' });

// The big "Model <name> >" row (class cv-frow). -> { node, setValue(text) }
export function modelRow() {
  const node = asButton(el('button', 'cv-frow'));
  const text = el('span', 'cv-frow-text');
  const value = el('span', 'cv-frow-value', '—');
  text.append(el('span', 'cv-frow-label', 'Model'), value);
  node.append(text);
  node.insertAdjacentHTML('beforeend', CHEVRON);
  return { node, setValue: (text) => { value.textContent = text; } };
}

// One pill of the row under it (class cv-pill): an icon and a value. kind: 'dur' | 'ratio' | 'mode'. -> { node, setValue(text) }
export function pill(kind, ariaLabel) {
  const node = asButton(el('button', 'cv-pill'));
  node.setAttribute('aria-label', ariaLabel);
  node.insertAdjacentHTML('beforeend', PILL_ICON[kind]);
  const value = el('span');
  node.append(value);
  return { node, setValue: (text) => { value.textContent = text; } };
}

// The body of the Model popup for a form state { mode, model, veoModel, lastSeedance }. onPick(patch) gets the change to put into the state (the caller applies it and closes the popup).
// A core with Seedance only gets the list it always had; with Veo or Muse the rows are grouped by family and a pick sets the mode too (model-groups.js pickPatch).
// disabled(item) -> '' or the reason the row cannot be picked now (shown as its tooltip).
export function modelPopNodes({ opts, state, onPick, disabled = () => '' }) {
  const groups = modelGroups(opts);
  return [
    ...groupedModelPop({ groups, selected: selectedKey(state, opts), onPick: (item) => onPick(pickPatch(item, state, opts)), disabled }),
    el('p', 'cv-pop-note', veoNote(opts)),
  ];
}

// The "Chế độ Dola" popup: Nhanh + tiếng / Pro (only those this core offers) with what each does. labels: { voice, pro }.
export function seedanceModePop({ opts, mode, labels, onPick }) {
  return [
    el('p', 'cv-pop-head', t('Chế độ Dola')),
    ...SEEDANCE_MODES.filter((m) => modeOffered(m, opts)).map((m) => {
      const b = asButton(el('button', `cv-model-item${m === mode ? ' cv-model-item--on' : ''}`));
      const body = el('span', 'cv-model-body');
      body.append(el('span', 'cv-model-name', labels[m]), el('span', 'qt-opt-desc', MODE_DESC[m]));
      b.append(body);
      b.onclick = () => onPick(m);
      return b;
    }),
  ];
}
