import { durationTrack, el } from './pop.js';
import { t } from './i18n.js';
import { hint } from './library-ui.js';
import { mediaUrl } from './shared/media-handles.js';
import { IMAGE_HINT, MUSE_NOTE, SAMPLE_BUTTON, SCRIPT_GUIDE, clampRefs, museHint, museRefLabels, refsAfterPick, sampleInsert, tooManyRefs } from './muse-form.js';
import { promptHint } from './model-groups.js';
import { groupedModelPop } from './model-popup.js';
import { imageGroups, imageSelectedKey, imageSelection } from './image-models.js';

// The DOM pieces of the Muse mode of the form. The rules and texts are in muse-form.js (pure, tested); app.js and history.js only call these.
// Nothing here runs unless the app core offers Muse (app.js mounts them only then).

// The one row of the model popover in a Muse mode: the name and what the core says about the model (a long text, so not a chip).
export function museModelRow(model, onPick) {
  const b = Object.assign(el('button', 'cv-model-item cv-model-item--on'), { type: 'button' });
  const body = el('span', 'cv-model-body');
  body.append(el('span', 'cv-model-name', model.label), el('span', 'qt-opt-desc', model.desc || ''));
  b.append(body);
  b.onclick = onPick;
  return b;
}

// The body of the Model popover of the "Tạo ảnh" screen. A core with Nano Banana lists two groups (Muse, Nano Banana: the look of the video screen's
// popover, the core's description as the tooltip of a row) and a note for the family that is ticked; a core without it gets the one row and note it always
// had. picked: prefs.imageModel; onPick(item): a row was chosen (the caller stores it and closes); close(): the single Muse row only closes the popover.
export function imageModelPop({ opts, picked, onPick, close }) {
  const groups = imageGroups(opts);
  if (groups.length < 2) return [museModelRow(opts.image.models[0], close), el('p', 'cv-pop-note', MUSE_NOTE.image)];
  const nano = imageSelection(opts, picked).family === 'nano';
  return [...groupedModelPop({ groups, selected: imageSelectedKey(picked, opts), onPick }), el('p', 'cv-pop-note', nano ? MUSE_NOTE.imageNano : MUSE_NOTE.imageMuse)];
}

// The body of the duration popover in Muse mode: the 2-60 s bar, the "Theo prompt" switch (script written by the person: the bar is greyed
// and ignored) and the line about how long a long clip takes. prefs: the form's prefs, changed in place; onChange() repaints the form.
export function museDurationPop({ range, prefs, onChange }) {
  const note = el('p', 'cv-pop-note');
  const track = durationTrack(range, prefs.duration, (v) => { prefs.duration = v; paint(); onChange(); });
  const slider = track.querySelector('input');
  const box = Object.assign(el('input', 'qs-check'), { type: 'checkbox', checked: !!prefs.museScript });
  const text = el('span', 'qs-toggle-text');
  text.append(el('span', 'qs-toggle-name', t('Theo prompt')), el('span', 'qs-toggle-desc', t('Bạn tự viết kịch bản theo mốc giây trong ô mô tả; thanh thời lượng không dùng')));
  const sw = el('span', 'qs-sw');
  sw.append(el('i'));
  const toggle = el('label', 'qs-toggle');
  toggle.append(text, box, sw);
  function paint() {
    track.classList.toggle('cv-duration-track--off', box.checked);
    slider.disabled = box.checked;
    note.textContent = box.checked ? MUSE_NOTE.script : museHint(prefs.duration);
    note.hidden = !note.textContent;
  }
  box.onchange = () => { prefs.museScript = box.checked; paint(); onChange(); };
  paint();
  return [el('p', 'cv-pop-head', t('Chọn thời lượng')), track, toggle, note];
}

// The how-to-write-a-script box under the prompt (shown while "Theo prompt" is on) with "Chèn mẫu". The sample never replaces text that is
// already in the box on the first press. -> { show(on) }
export function mountMuseGuide({ node, promptEl }) {
  const insert = Object.assign(el('button', 'cv-import', SAMPLE_BUTTON.put), { type: 'button' });
  let armed = false;
  const disarm = () => { armed = false; insert.textContent = SAMPLE_BUTTON.put; };
  insert.onclick = () => {
    const r = sampleInsert(promptEl.value, armed);
    if (r.text === null) {
      armed = true;
      insert.textContent = SAMPLE_BUTTON.sure;
      return;
    }
    promptEl.value = r.text;
    promptEl.dispatchEvent(new Event('input', { bubbles: true })); // whatever draws the box redraws
  };
  promptEl.addEventListener('input', disarm);
  node.append(el('p', 'cv-muse-guide-text', SCRIPT_GUIDE), insert);
  return { show: (on) => { node.hidden = !on; if (!on) disarm(); } };
}

// The "many prompts" hint of the "Tạo ảnh" screen: one line under the prompt counter; the placeholder of the box (the textarea, and the chip box
// that draws it) and the label of the chip box say "picture" and drop the @element words (Muse reads none). Any other mode keeps the form's own
// texts. -> { paint(mode) }
const IMAGE_PLACEHOLDER = t('Mô tả ảnh…');
export function mountPromptHint({ node, promptEl, editorEl }) {
  const own = { textarea: promptEl.placeholder, editor: editorEl?.dataset.placeholder ?? '', label: editorEl?.getAttribute('aria-label') ?? '' };
  return {
    paint(mode) {
      const text = promptHint(mode);
      node.textContent = text;
      node.title = text; // the whole line, should a narrow column cut it
      node.hidden = !text;
      promptEl.placeholder = text ? IMAGE_PLACEHOLDER : own.textarea;
      if (editorEl) {
        editorEl.dataset.placeholder = text ? IMAGE_PLACEHOLDER : own.editor;
        editorEl.setAttribute('aria-label', text ? t('Mô tả ảnh') : own.label);
      }
    },
  };
}

// The reference pictures of a Muse clip: a row of thumbnails with a ✕ each and a "+" while there is room, in the look of the Seedance box. It is its
// own box (not the element tray / the Dola images): Muse reads no @element. `max` is what the core takes (opts.muse.maxImages, museRefMax();
// 1 for an older core, where the "+" swaps the picture). -> { show(on), get() -> [{ handle, name }], set(list | null) }. say(text): a line under the button.
// name: whose box it is, for the "too many" line ("Muse"; the Nano Banana picture of the "Tạo ảnh" screen mounts a second one, with its own max).
export function mountMuseRef({ node, say, max = 1, name = 'Muse' }) {
  let refs = [];
  const paint = () => {
    node.replaceChildren();
    if (!refs.length) {
      const text = museRefLabels(max);
      const b = Object.assign(el('button', 'cv-ref-tray cv-ref-tray--empty'), { type: 'button' });
      b.append(el('span', 'cv-reference-orb', '▣'), el('span', 'cv-ref-label', text.label), el('span', 'cv-ref-hint', text.hint));
      b.onclick = add;
      node.append(b);
      return;
    }
    const tray = el('div', 'cv-ref-tray');
    if (max === 1 || refs.length < max) {
      const plus = Object.assign(el('button', 'cv-ref-add', '+'), { type: 'button', title: max === 1 ? t('Đổi ảnh') : t('Thêm ảnh') });
      plus.onclick = add;
      tray.append(plus);
    }
    refs.forEach((ref, i) => {
      const tile = el('div', 'cv-ref-tile');
      const th = el('div', 'cv-ref-thumb');
      th.append(Object.assign(el('img'), { src: mediaUrl.pick(ref.handle), alt: ref.name || '' }));
      const x = Object.assign(el('button', 'cv-ref-x', '✕'), { type: 'button', title: t('Bỏ ảnh') });
      x.onclick = () => set(refs.filter((_, j) => j !== i));
      tile.append(th, x);
      tray.append(tile);
    });
    node.append(tray);
  };
  function set(next) {
    refs = clampRefs(next, max).files;
    paint();
  }
  async function add() {
    try {
      const picked = await window.dola.pickImages();
      if (!picked.length) return;
      const r = refsAfterPick(refs, picked, max);
      set(r.files);
      say(r.dropped ? tooManyRefs(max, name) : '');
    } catch (err) {
      say(t('Không chọn được ảnh: {why}', { why: err.message }));
    }
  }
  paint();
  return { show: (on) => { node.hidden = !on; }, get: () => refs, set };
}

// The picture of a finished image task in the history card: the saved file through fs-media:// (by task id). A card with no file, or a
// file that does not open, says so in the same grey box as a video card. No detail panel: that one plays a video.
export function showImage(box, task) {
  const file = task.result?.file;
  if (!file) return box.replaceChildren(...hint(IMAGE_HINT.none));
  const img = Object.assign(el('img', 'cvr-img'), { loading: 'lazy', alt: '' });
  img.onerror = () => box.replaceChildren(...hint(IMAGE_HINT.broken));
  img.src = mediaUrl.task(task.id, task.result.savedAt || task.result.bytes || '');
  box.replaceChildren(img);
}
