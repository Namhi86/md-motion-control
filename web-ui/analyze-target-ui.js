import { closePop, durationTrack, el, listMenu, openPop } from './pop.js';
import { noteLine } from './analyze-controls.js';
import { MODE_LABEL, targetProblem } from './analyze-form.js';
import { MUSE_NOTE } from './muse-form.js';
import { DURATION_NOTE, modelPopNodes, modelRow, pill, seedanceModePop } from './target-pills.js';
import { currentModel, durationNote, rowBlocked, settleTarget, showModePill, targetRange, targetRatios } from './analyze-target.js';
import { t } from './i18n.js';
import { offersLengths, veoModelIn } from './veo-durations.js';
import { veoDurationPop } from './veo-durations-ui.js';

// The "Tạo video bằng" block of the "Phân tích video" tab: the Model row and the three pills (length, ratio, Seedance mode) of the "Tạo video" form,
// with the same classes and popups (target-pills.js). `settings` (analyze-form.js defaultSettings + targetModels) is changed in place; onChange() runs after
// every change so the settings can repaint. Locking while an analysis runs is done by analyze-settings.js (it turns every button of the section off).
//   limits  what analyze.info() reports per mode { min, max }     opts  window.dola.options()
export function mountTarget({ settings, limits, opts, onChange }) {
  const node = el('div', 'an-target');
  const model = modelRow();
  const dur = pill('dur', t('Thời lượng'));
  const ratio = pill('ratio', t('Tỷ lệ khung hình'));
  const mode = pill('mode', t('Chế độ Dola'));
  const pills = el('div', 'cv-controls-row');
  pills.append(dur.node, ratio.node, mode.node);
  const problem = noteLine('an-err');
  node.append(model.node, pills, problem.node);

  const apply = (patch) => { Object.assign(settings, settleTarget(settings, patch, { limits, opts })); onChange(); };

  model.node.onclick = () => openPop(model.node, modelPopNodes({
    opts, state: settings, disabled: (item) => rowBlocked(settings, item), onPick: (patch) => { apply(patch); closePop(); },
  }));
  dur.node.onclick = () => {
    const veoModel = settings.mode === 'veo' ? veoModelIn(opts, settings.veoModel) : undefined;
    if (offersLengths(veoModel)) { // the lengths of that Veo model as buttons; this tab sends no resolution (720p), so none is offered and the price shown is the 720p one
      openPop(dur.node, veoDurationPop({ model: veoModel, withResolution: false, get: () => ({ duration: settings.duration, resolution: '' }), set: (patch) => apply({ duration: patch.duration }) }), 334);
      return;
    }
    const range = targetRange(settings.mode, limits, opts);
    const note = durationNote(settings.mode, range, DURATION_NOTE);
    openPop(dur.node, [
      el('p', 'cv-pop-head', t('Chọn thời lượng')),
      ...(range.min < range.max ? [durationTrack(range, settings.duration, (v) => apply({ duration: v }))] : []),
      ...(note ? [el('p', 'cv-pop-note', note)] : []),
    ], 334);
  };
  ratio.node.onclick = () => openPop(ratio.node, [
    ...listMenu(targetRatios(settings.mode, opts), settings.ratio, (r) => { apply({ ratio: r }); closePop(); }),
    ...(settings.mode === 'muse' ? [el('p', 'cv-pop-note', MUSE_NOTE.ratio)] : []),
  ]);
  mode.node.onclick = () => openPop(mode.node, seedanceModePop({ opts, mode: settings.mode, labels: MODE_LABEL, onPick: (m) => { apply({ mode: m }); closePop(); } }), 334);

  function paint() {
    model.setValue(currentModel(settings, opts).label);
    dur.setValue(`${settings.duration}s`);
    ratio.setValue(settings.ratio);
    mode.setValue(MODE_LABEL[settings.mode] || settings.mode);
    mode.node.hidden = !opts?.modes || !showModePill(settings); // Nhanh / Pro belong to the Seedance models; Veo and Muse are a row of the Model popup
    problem.set(targetProblem(settings));
  }
  paint();
  return { node, paint };
}
