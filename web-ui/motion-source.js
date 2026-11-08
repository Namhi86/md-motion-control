import { el } from './pop.js';
import { field, segmented } from './analyze-controls.js';
import { mountSourceVideo } from './motion-source-video.js';
import { mountImages } from './motion-source-images.js';
import { mountSaveDir } from './motion-source-dir.js';
import { RESOLUTIONS } from './motion-form.js';
import { t } from './i18n.js';

// Everything that is "Nguồn" in the sidebar of the "Motion control" workspace: the video card, the person's pictures and the choices (quality, frame, audio mode, spoken language, voice). Handles only: nothing here sees a path.
function slide(seg, n, index) {
  seg.node.classList.add('an-seg--fill');
  seg.node.append(el('i', 'cm-seg-slider'));
  seg.node.style.setProperty?.('--n', String(n));
  const paint = seg.paint;
  seg.paint = () => { paint(); seg.node.style.setProperty?.('--i', String(Math.max(0, index()))); };
  seg.paint();
}

export function mountSource({ dola, onChange, pickImages }) {
  const state = {
    video: null,
    engine: 'veo-ref',
    audioMode: 'keep',
    resolution: '4k',
    ratio: 'auto',
    translateTo: '',
    voiceText: '',
  };
  let locked = false;

  const video = mountSourceVideo({ dola, onChange: (v) => { state.video = v; onChange(); } });
  const saveDir = mountSaveDir({ dola });
  const pictures = mountImages({ dola, pickImages, onChange, isLocked: () => locked });

  const ENGINES = [{ id: 'veo-ref', label: t('Google Flow (Veo)') }];
  const engine = segmented(ENGINES, () => 'veo-ref', () => {});

  const AUDIO_MODES = [
    { id: 'keep', label: t('Giữ nhạc gốc (Chỉ thay nhân vật)') },
    { id: 'speech', label: t('Giọng AI / Dịch lời') },
  ];
  const audioSeg = segmented(AUDIO_MODES, () => state.audioMode, (id) => {
    if (locked) return;
    state.audioMode = id;
    audioSeg.paint();
    syncAudioFields();
    onChange();
  });

  const quality = segmented(RESOLUTIONS.map((r) => ({ id: r.id, label: `${r.label} (${r.credits}cr)` })), () => state.resolution, (id) => { if (locked) return; state.resolution = id; quality.paint(); onChange(); });
  const RATIOS = [{ id: 'auto', label: t('Giống gốc') }, { id: '9:16', label: t('Dọc 9:16') }, { id: '16:9', label: t('Ngang 16:9') }];
  const shape = segmented(RATIOS, () => state.ratio, (id) => { if (locked) return; state.ratio = id; shape.paint(); onChange(); });

  slide(engine, ENGINES.length, () => ENGINES.findIndex((e) => e.id === state.engine));
  slide(audioSeg, AUDIO_MODES.length, () => AUDIO_MODES.findIndex((a) => a.id === state.audioMode));
  slide(quality, RESOLUTIONS.length, () => RESOLUTIONS.findIndex((r) => r.id === state.resolution));
  slide(shape, RATIOS.length, () => RATIOS.findIndex((r) => r.id === state.ratio));

  const voice = Object.assign(el('textarea', 'an-input cm-voice'), { rows: 2, maxLength: 160, placeholder: t('Để trống: app đoán giọng từ video (ví dụ: giọng cô gái 24 tuổi, ấm áp)') });
  voice.oninput = () => { state.voiceText = voice.value; onChange(); };
  const LANGS = [['', t('Giữ ngôn ngữ gốc')], ['English', 'English'], ['Vietnamese', 'Tiếng Việt'], ['Japanese', '日本語'], ['Korean', '한국어'], ['Chinese', '中文'], ['Thai', 'ไทย']];
  const lang = el('select', 'an-input');
  for (const [v, label] of LANGS) lang.append(Object.assign(el('option', '', label), { value: v }));
  lang.onchange = () => { state.translateTo = lang.value; onChange(); };

  const langField = field(t('Ngôn ngữ nói'), lang);
  const voiceField = field(t('Giọng'), voice);

  function syncAudioFields() {
    const isKeep = state.audioMode === 'keep';
    langField.hidden = isKeep;
    voiceField.hidden = isKeep;
  }
  syncAudioFields();

  // Cột nguyên liệu hiển thị trực tiếp trong từng luồng (chỉ gồm Video gốc & Ảnh nhân vật như Ảnh 4)
  const node = el('div', 'cm-source');
  node.append(
    field(t('Video gốc'), video.card, video.error.node),
    pictures.node,
  );

  // Phần Cài đặt mặc định (Ảnh 2: Nền tảng tạo, Chế độ âm thanh, Chất lượng 4K, Khung hình Giống gốc, Thư mục lưu phim)
  const settingsNode = el('div', 'cm-source-settings');
  settingsNode.append(
    field(t('Nền tảng tạo'), engine.node),
    field(t('Chế độ âm thanh'), audioSeg.node),
    field(t('Chất lượng'), quality.node),
    field(t('Khung hình'), shape.node),
    langField,
    voiceField,
  );
  if (saveDir.node) settingsNode.append(saveDir.node);

  return {
    node, settingsNode, dir: saveDir, panel: video.panel, player: video.player, error: video.error,
    get: () => ({
      video: state.video,
      engine: state.engine,
      audioMode: state.audioMode,
      keepMusic: state.audioMode === 'keep',
      images: pictures.get(),
      resolution: state.resolution,
      ratio: state.ratio,
      translateTo: state.audioMode === 'keep' ? '' : state.translateTo,
      voiceText: state.audioMode === 'keep' ? '' : state.voiceText.trim(),
    }),
    ready: () => !!state.video && pictures.get().length >= 1,
    restore: ({ video: v, images, choices: c = {} }) => {
      if (v) state.video = video.set(v);
      if (Array.isArray(images)) pictures.set(images);
      state.engine = 'veo-ref';
      if (AUDIO_MODES.some((a) => a.id === c.audioMode)) state.audioMode = c.audioMode;
      if (RESOLUTIONS.some((r) => r.id === c.resolution)) state.resolution = c.resolution;
      state.resolution = '4k'; // Mặc định 4K (20cr) theo cài đặt mặc định Ảnh 2
      if (RATIOS.some((r) => r.id === c.ratio)) state.ratio = c.ratio;
      if (LANGS.some(([v2]) => v2 === c.language)) state.translateTo = lang.value = c.language;
      state.voiceText = voice.value = String(c.voiceText || '').slice(0, 160);
      engine.paint(); audioSeg.paint(); quality.paint(); shape.paint();
      syncAudioFields();
    },
    drop: (files) => video.drop(files),
    watch: (target) => video.watch(target),
    setLocked: (on) => {
      locked = on; video.setLocked(on); lang.disabled = on; voice.disabled = on; pictures.refresh(); saveDir.setLocked(on);
      for (const g of [engine, audioSeg, quality, shape]) g.node.querySelectorAll?.('button').forEach((b) => { b.disabled = on; });
    },
  };
}
