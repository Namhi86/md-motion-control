import { el } from './pop.js';
import { button, noteLine } from './analyze-controls.js';
import { createResultPanel, mountResult } from './motion-result.js';
import { mountEditor } from './motion-editor.js';
import { mountSource } from './motion-source.js';
import { buildWorkspace } from './motion-workspace.js';
import { createEmptyZone } from './motion-empty-zone.js';
import { motionOffered, spokenLanguage, succeeded } from './motion-form.js';
import { createDraftSaver, draftOf } from './motion-session.js';
import { readRestorable } from './motion-restore.js';
import { mediaUrl } from './shared/media-handles.js';
import { ct } from './core-text.js';
import { t } from './i18n.js';

// The "Motion control" tab (section #view-motion): ONE editor workspace (motion-workspace.js) that talks to window.dola.motion. The three stages are indicators, not pages:
//   1 Nguồn   the sidebar (motion-source.js) + its main button "Phân tích video" = motion.prepare (reads the video, cuts it into clips, writes the lines: no credit is spent)
//   2 Đoạn & lời   the timeline (motion-editor.js) fills the bottom of the stage; the main button becomes "Tạo video (N credit Flow)" = motion.start (THIS spends Flow credits: the price is on the button)
//   3 Kết quả   the same screen, the timeline read-only and its FLOW lane following motion.onProgress; the film appears in the right player (motion-result.js); the main button is "Huỷ", then "Làm video khác"
// Changing the video or the language after a plan exists keeps the plan on screen but marks it stale: the main button goes back to "Phân tích video". The sidebar is editable until the film starts.
// A reopened tab (restoreAll) draws the plan first (step 2), then puts the film the core still holds on top of it: the film in the right player, the FLOW lane fed by its clips. Only a film with no saved plan shows the result panel alone.
// The work is KEPT: the core saves the plan, and the sidebar choices and lines are sent as a draft (motion-session.js, 600 ms after the last edit, not while the plan is stale); on open the plan comes back through motion.session() and is drawn as after a prepare.
// Returns null when this core does not offer the tab (options().copyMotion !== true or a call missing): the caller then leaves its button hidden.
export async function initMotion({ dola = window.dola, root, opts, say = () => {} }) {
  if (!motionOffered(opts, dola)) return null;
  let plan = null; // the answer of motion.prepare
  let planKey = ''; // which video and language the plan was made for
  let job = null; // { jobId } of a film that was started
  let ended = false; // the film has its final answer (made or failed)
  let phase = 'idle'; // 'prepare' | 'start' while a call waits
  let editorUi = null;
  let resultUi = null;
  let shown = ''; // which node the zone holds now: 'empty' | 'editor' | 'restored'
  let shownRes = '';
  let editorLocked = false;
  let restoring = false; // the saved clip is being selected: that is not an edit
  let usable = 1; // Veo Gmail accounts that can work (analyze.info), for the time on the price line
  let latestClips = [];
  let latestResult = null;
  let latestStageText = '';

  function emitMotionState() {
    window.dispatchEvent(new CustomEvent('md:motion-state', {
      detail: {
        phase,
        hasPlan: !!plan,
        segmentCount: editorUi?.segments()?.length || plan?.segments?.length || 0,
        job: !!job,
        ended,
        clips: latestClips,
        result: latestResult,
        stageText: latestStageText,
      },
    }));
  }

  const ws = buildWorkspace();
  root.replaceChildren(ws.node);
  const msg = noteLine('an-err');
  msg.node.setAttribute('role', 'alert');
  const reAnalyzeBtn = button('↻ Phân tích lại lời thoại', 'an-btn cm-reanalyze-btn', () => prepare());
  reAnalyzeBtn.hidden = true;
  const info = noteLine('an-note');
  const staleNote = noteLine('an-note cm-warn');
  const stage = el('p', 'an-stage', '');
  stage.hidden = true;
  ws.status.append(stage, staleNote.node, info.node, msg.node, reAnalyzeBtn);

  const source = mountSource({ dola, onChange: () => { paint(); draft.schedule(); } });
  const draft = createDraftSaver({
    dola,
    build: () => (plan && !job && editorUi && phase !== 'prepare' && keyOf(source.get()) === planKey ? draftOf({ prepareId: plan.prepareId, s: source.get(), editorUi }) : null), // a stale plan keeps what the core saved until the person analyses again
  });
  source.watch(ws.streams?.[0]?.unit || ws.node);
  ws.side.append(source.node);
  if (ws.defaultLeftPane && source.settingsNode) {
    ws.defaultLeftPane.append(source.settingsNode);
  }

  // Đồng bộ dòng tóm tắt trên nút Cài đặt mặc định khi đổi Model trong hộp Cài đặt mặc định
  const syncDefaultSummary = (flowModel) => {
    const cur = flowModel || source.get().flowModel || 'omni-1-2-flash';
    const sumEl = ws.node.querySelector('#cm-dcfg-summary');
    if (sumEl) {
      const mLabel = cur === 'omni-1-1-flash' ? 'Omni 1.1 Flash' : 'Omni 1.2 Flash';
      sumEl.textContent = `${mLabel} · 4K · Giữ nhạc gốc · Motion AI (50/70/90%)`;
    }
  };
  window.addEventListener('md:motion-model-changed', (e) => {
    syncDefaultSummary(e.detail?.flowModel);
  });
  syncDefaultSummary(source.get().flowModel);
  const resultPanel = createResultPanel();
  const emptyZone = createEmptyZone();
  const showPlayers = (restored) => {
    ws.players.replaceChildren(...(restored ? [resultPanel.node] : [source.panel, resultPanel.node]));
    ws.setRestored(restored);
  };
  showPlayers(false);

  // Khởi tạo thêm các luồng tạo video song song trên hàng ngang (Luồng 02 → Luồng 10)
  const extraSources = [];
  Array.from({ length: Math.max(0, (ws.streams?.length || 1) - 1) }, (_, k) => k + 1).forEach((idx) => {
    const streamSlot = ws.streams?.[idx];
    if (!streamSlot) return;
    const storageKey = `md_motion_stream_${idx + 1}`;
    const extSource = mountSource({
      dola,
      onChange: () => {
        try {
          const cur = extSource.get();
          localStorage.setItem(storageKey, JSON.stringify({ video: cur.video, images: cur.images }));
        } catch {}
        paint();
      },
    });
    extSource.watch(streamSlot.unit);
    streamSlot.side.append(extSource.node);
    const extResultPanel = createResultPanel();
    streamSlot.players.replaceChildren(extSource.panel, extResultPanel.node);
    extraSources.push({ idx: idx + 1, source: extSource, resultPanel: extResultPanel, storageKey, createBtn: streamSlot.createBtn });
  });

  let activeStreamIdx = 1;
  let activeResultPanel = resultPanel;

  // Hàm chạy xuyên suốt 1 chạm (tự động phân tích ngầm + tạo video thành phẩm luôn) cho 1 luồng
  async function runOneClickMain() {
    activeStreamIdx = 1;
    activeResultPanel = resultPanel;
    if ((job && !ended) || phase === 'prepare' || phase === 'start') {
      cancel();
      return;
    }
    if (job && ended) {
      const sCur = source.get();
      const failedClips = latestClips.filter((c) => c.state === 'failed');
      if (latestResult && !succeeded(latestResult) && failedClips.length > 0 && keyOf(sCur) === planKey) {
        for (const c of failedClips) {
          await retry(c.i);
        }
        return;
      }
      await again();
    }
    if (!source.ready()) {
      msg.set('Vui lòng chọn đủ Video gốc và Ảnh nhân vật trước khi bấm Tạo video.');
      return;
    }
    const s = source.get();
    const stale = !!plan && !job && keyOf(s) !== planKey;
    if (!plan || stale) {
      const ok = await prepare();
      if (!ok) return;
    }
    if (plan && !job && phase === 'idle') {
      await start();
    }
  }

  // Gắn sự kiện nút "Tạo video" riêng cho từng luồng (Luồng 01 -> Luồng 05): bấm 1 lần chạy ra video thành phẩm luôn
  ws.streams?.[0]?.createBtn?.addEventListener('click', async () => {
    ws.streams.forEach((st, i) => st.unit.classList.toggle('cm-stream-unit--active', i === 0));
    await runOneClickMain();
  });

  extraSources.forEach((ext) => {
    ext.createBtn?.addEventListener('click', async () => {
      activeStreamIdx = ext.idx;
      activeResultPanel = ext.resultPanel || resultPanel;
      ws.streams?.forEach((st, i) => st.unit.classList.toggle('cm-stream-unit--active', i === ext.idx - 1));
      if ((job && !ended) || phase === 'prepare' || phase === 'start') {
        cancel();
        return;
      }
      if (job && ended) {
        await again();
      }
      if (!ext.source.ready()) {
        msg.set(`Vui lòng chọn đủ Video gốc và Ảnh nhân vật ở Luồng 0${ext.idx} trước khi tạo video.`);
        return;
      }
      const cur = ext.source.get();
      const base = source.get();
      source.restore({
        video: cur.video,
        images: cur.images,
        choices: {
          engine: base.engine,
          flowModel: base.flowModel,
          audioMode: base.audioMode,
          resolution: base.resolution,
          ratio: base.ratio,
          language: base.translateTo,
          voiceText: base.voiceText,
        },
      });
      const ok = await prepare();
      if (ok && plan && !job && phase === 'idle') {
        await start();
      }
    });
  });

  // Cho phép bấm chọn luồng đang tương tác trên hàng ngang
  ws.streams?.forEach((st) => {
    st.unit.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.cm-stream-pick')) return;
      ws.streams.forEach((other) => other.unit.classList.toggle('cm-stream-unit--active', other === st));
    });
  });

  let batchRunning = false;
  let batchCancelled = false;

  function getCheckedReadyStreams() {
    const list = [];
    const st0 = ws.streams?.[0];
    if (st0 && !st0.unit.hidden && st0.checkInput?.checked !== false && source.ready()) {
      list.push({ idx: 1, source, slot: st0, isMain: true });
    }
    extraSources.forEach((ext) => {
      const slot = ws.streams?.[ext.idx - 1];
      if (slot && !slot.unit.hidden && slot.checkInput?.checked !== false && ext.source.ready()) {
        list.push({ idx: ext.idx, source: ext.source, slot, ext, isMain: false });
      }
    });
    return list;
  }

  function getCheckedVisibleCount() {
    const visible = (ws.streams || []).filter((st) => !st.unit.hidden);
    const checked = visible.filter((st) => st.checkInput?.checked !== false);
    return { checked: checked.length, total: visible.length || 5 };
  }

  function waitCurrentJobEnd() {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (batchCancelled || !job || ended) {
          clearInterval(timer);
          resolve();
        }
      }, 600);
    });
  }

  async function runCheckedStreams() {
    let targets = getCheckedReadyStreams();
    if (!targets.length) {
      if (source.ready()) {
        targets = [{ idx: 1, source, slot: ws.streams?.[0], isMain: true }];
      } else {
        const firstReadyExt = extraSources.find((ext) => !ws.streams?.[ext.idx - 1]?.unit.hidden && ext.source.ready());
        if (firstReadyExt) {
          targets = [{ idx: firstReadyExt.idx, source: firstReadyExt.source, slot: ws.streams?.[firstReadyExt.idx - 1], ext: firstReadyExt, isMain: false }];
        } else {
          msg.set('Vui lòng chọn đủ Video gốc và Ảnh nhân vật ở ít nhất 1 luồng trước khi bấm Tạo video.');
          return;
        }
      }
    }
    // Loại bỏ các luồng trùng hệt cùng 1 video gốc + cùng ảnh nhân vật (tránh chạy lặp 5 lần cùng 1 video khi khôi phục phiên)
    const seenKeys = new Set();
    targets = targets.filter((item) => {
      const st = item.source.get();
      const sig = `${st.video?.handle || ''}|${(st.images || []).map((im) => im.handle).join(',')}`;
      if (seenKeys.has(sig)) return false;
      seenKeys.add(sig);
      return true;
    });
    if (targets.length === 1 && targets[0].isMain) {
      await runOneClickMain();
      return;
    }

    batchRunning = true;
    batchCancelled = false;
    // Đánh dấu các luồng đã tích chọn đang xếp hàng chờ
    targets.forEach((item, pos) => {
      const lbl = item.slot.createBtn?.querySelector('.cm-stream-create-label');
      const code = String(item.idx).padStart(2, '0');
      if (lbl && pos > 0) lbl.textContent = `⏳ Chờ lượt (L${code})`;
    });

    for (let i = 0; i < targets.length; i++) {
      if (batchCancelled) break;
      const item = targets[i];
      const code = String(item.idx).padStart(2, '0');
      activeStreamIdx = item.idx;
      activeResultPanel = item.isMain ? resultPanel : (item.ext?.resultPanel || resultPanel);
      ws.streams?.forEach((st, idx) => st.unit.classList.toggle('cm-stream-unit--active', idx === item.idx - 1));
      const lbl = item.slot.createBtn?.querySelector('.cm-stream-create-label');
      if (lbl) lbl.textContent = `⚡ Đang chạy (L${code})...`;

      if (job && ended) {
        await again();
      }
      if (!item.isMain) {
        const cur = item.source.get();
        const base = source.get();
        source.restore({
          video: cur.video,
          images: cur.images,
          choices: {
            engine: base.engine,
            audioMode: base.audioMode,
            resolution: base.resolution,
            ratio: base.ratio,
            language: base.translateTo,
            voiceText: base.voiceText,
          },
        });
      }
      const sNow = source.get();
      const staleNow = !!plan && !job && keyOf(sNow) !== planKey;
      if (!plan || staleNow) {
        const ok = await prepare();
        if (batchCancelled || !ok) break;
      }
      if (plan && !job && phase === 'idle') {
        await start();
        if (job && !ended) {
          await waitCurrentJobEnd();
        }
      }
      if (latestResult && !succeeded(latestResult)) {
        break;
      }
      if (lbl && !batchCancelled) {
        lbl.textContent = `✓ Đã xong (L${code})`;
      }
    }
    batchRunning = false;
    paint();
  }

  window.addEventListener('md:motion-checks-changed', () => paint());

  const priceLine = el('p', 'cm-price', '');
  priceLine.hidden = true;
  const main = button('', 'an-btn an-btn--main cm-main-btn', () => act.run());
  ws.foot.append(priceLine, main);
  let act = { run: () => {} };

  const keyOf = (s) => `${s.video?.handle || ''}|${s.translateTo}`;
  const cancel = () => {
    batchCancelled = true;
    batchRunning = false;
    return dola.motion.cancel().catch(() => {});
  };

  function paint() {
    const s = source.get();
    const stale = !!plan && !job && keyOf(s) !== planKey;
    ws.setStage(job ? (ended && latestResult?.url ? 4 : 3) : plan ? 2 : 1);
    const screen = job && !editorUi ? 'restored' : editorUi ? 'editor' : 'empty';
    if (screen !== shown) {
      shown = screen;
      ws.setZone(screen === 'editor' ? editorUi.node : screen === 'restored' ? resultUi.clips : emptyZone.node);
      if (screen === 'editor') editorUi.fit();
    }
    emptyZone.set(phase === 'prepare');
    if (editorUi && !job && s.resolution !== shownRes) { shownRes = s.resolution; editorUi.setResolution(s.resolution); }
    if (editorUi && !job && editorLocked !== stale) { editorLocked = stale; editorUi.setLocked(stale); }
    staleNote.set('');
    stage.hidden = phase !== 'prepare';
    reAnalyzeBtn.hidden = true;
    const p = editorUi?.price();
    const isMuse = s.engine === 'muse';
    priceLine.textContent = p ? (isMuse ? t('{n} đoạn × 0 = 0 credit (Meta Muse AI) · khoảng {min} phút', { n: editorUi.segments().length, min: p.minutes }) : p.text) : '';
    priceLine.hidden = !p;
    ws.setPrice(p ? (isMuse ? t('0 credit (Muse AI) · khoảng {min} phút', { min: p.minutes }) : t('{total} credit · khoảng {min} phút', { total: p.total, min: p.minutes })) : '');
    const { checked: checkedCnt, total: totalVis } = getCheckedVisibleCount();
    const readyChecked = getCheckedReadyStreams();
    const multiChecked = checkedCnt > 1;
    const batchSub = multiChecked ? `Chạy ${checkedCnt}/${totalVis} luồng đã tích` : '';
    const isWorkingNow = (job && !ended) || batchRunning || phase === 'prepare' || phase === 'start';
    const hasFailedClip = job && ended && latestResult && !succeeded(latestResult) && latestClips.some((c) => c.state === 'failed');

    act = isWorkingNow
      ? { label: t('Huỷ'), run: cancel }
      : hasFailedClip
        ? { label: t('Thử lại đoạn lỗi'), run: runCheckedStreams, off: false }
        : multiChecked
          ? { label: `Tạo video (${batchSub})`, run: runCheckedStreams, off: readyChecked.length === 0 && !source.ready() }
          : plan && !stale && !job
            ? { label: isMuse ? t('Tạo video (Muse AI · 0 credit)') : t('Tạo video ({n} credit Flow)', { n: editorUi.total() }), run: runCheckedStreams, off: editorUi.busy() }
            : { label: t('Tạo video'), run: runCheckedStreams, off: readyChecked.length === 0 && !source.ready() };
    const m = act.label.match(/^([^(]+)\((.+)\)$/);
    if (m && act.run !== cancel) {
      main.innerHTML = `<span class="cm-btn-main-top">✨ ▷ ${m[1].trim()}</span><small class="cm-btn-main-sub">(${m[2].trim()})</small>`;
    } else if (act.run !== cancel) {
      main.innerHTML = `<span class="cm-btn-main-top">✨ ▷ ${act.label}</span>`;
    } else {
      main.textContent = act.label;
    }
    main.disabled = !!act.off;
    main.classList.toggle('an-btn--main', act.run !== cancel);

    // Đồng bộ trạng thái nút "Tạo video" riêng của từng luồng (Luồng 01 → Luồng 05)
    const btn1 = ws.streams?.[0]?.createBtn;
    if (btn1) {
      const lbl1 = btn1.querySelector('.cm-stream-create-label');
      if (lbl1) {
        lbl1.textContent = isWorkingNow ? 'Đang tạo... (Huỷ)' : hasFailedClip ? 'Thử lại đoạn lỗi (L01)' : 'Tạo video (L01)';
      }
      btn1.disabled = !isWorkingNow && !source.ready();
    }
    extraSources.forEach((ext) => {
      if (!ext.createBtn) return;
      const code = String(ext.idx).padStart(2, '0');
      const lbl = ext.createBtn.querySelector('.cm-stream-create-label');
      if (lbl) lbl.textContent = `Tạo video (L${code})`;
      ext.createBtn.disabled = isWorkingNow || !ext.source.ready();
    });

    emitMotionState();
  }

  async function readInfo() {
    try { const i = await dola.analyze?.info?.(); usable = Math.max(1, i?.usable || 1); info.set(i?.ok && i.total === 0 ? t('Cần ít nhất 1 acc Gmail ở mục Veo (Setup → Veo).') : ''); } catch { /* the line stays empty */ }
    editorUi?.setAccounts(usable);
  }

  // the screen that follows a plan, from a prepare or from a plan the core kept (drawSession)
  function showPlan(r, s, selected = -1) {
    draft.cancel();
    plan = r; planKey = keyOf(s); shownRes = s.resolution; editorLocked = false; shown = '';
    editorUi?.destroy();
    editorUi = mountEditor({
      plan, video: source.player, resolution: s.resolution, accounts: usable, videoUrl: mediaUrl.pick(s.video.handle), perClip: 20,
      replan: typeof dola.motion.replan === 'function' ? (a) => dola.motion.replan(a) : null,
      onChange: () => { paint(); if (!editorUi?.busy()) draft.schedule(); }, onEdit: () => draft.schedule(), onNote: (text) => msg.set(text), onRetry: (i) => retry(i),
      onSelect: () => { if (!restoring) draft.schedule(); },
    });
    if (selected >= 0) { restoring = true; editorUi.timeline.pick(selected, false); restoring = false; }
    if (r.transcriptError) msg.set(ct(r.transcriptError.note) || t('Không chép được lời: hãy nhập lời vào từng đoạn.'));
  }

  async function prepare() {
    if (phase !== 'idle' || job || !source.ready()) return false;
    window.dispatchEvent(new CustomEvent('md:motion-trigger', { detail: { label: 'Motion Control — Đang phân tích video & tạo chuyển động' } }));
    phase = 'prepare'; msg.set(''); source.setLocked(true); paint();
    const s = source.get();
    let ok = false;
    try {
      const r = await dola.motion.prepare({ videoHandle: s.video.handle, translateTo: s.translateTo, keepMusic: s.keepMusic });
      if (!r?.ok) { msg.set(ct(r?.note) || t('Không đọc được video này.')); return false; }
      showPlan(r, s);
      draft.schedule();
      ok = true;
      return true;
    } catch (err) {
      msg.set(t('Không đọc được video: {reason}', { reason: err.message }));
      return false;
    } finally {
      phase = 'idle';
      if (!ok) source.setLocked(false);
      stage.textContent = '';
      paint();
    }
  }

  async function start() {
    if (phase !== 'idle' || !plan || !editorUi) return;
    window.dispatchEvent(new CustomEvent('md:motion-trigger', { detail: { label: 'Motion Control — Đang tạo video chuyển động trên Google Flow (Veo)' } }));
    phase = 'start'; msg.set(''); editorUi.setLocked(true); source.setLocked(true); paint();
    const s = source.get();
    try {
      await draft.flush(); // the last words typed are kept even if the film's first call never comes back
      const r = await dola.motion.start({
        prepareId: plan.prepareId, engine: s.engine, flowModel: s.flowModel, keepMusic: s.keepMusic, imageHandles: s.images.map((i) => i.handle), lines: s.keepMusic ? [] : editorUi.lines(), resolution: s.resolution, ratio: s.ratio, voiceText: s.voiceText,
        language: s.translateTo || spokenLanguage(editorUi.segments()),
      });
      if (!r?.ok) { if (!source.dir.refuse(r)) msg.set(ct(r?.note) || t('Không bắt đầu được.')); editorUi.setLocked(false); source.setLocked(false); return; } // a folder that cannot be written is told in the sidebar box; the plan stays
      job = r; ended = false;
      const targetPanel = activeResultPanel || resultPanel;
      resultUi = mountResult({ panel: targetPanel, perClip: r.credits?.perClip || 20, compare: source.player, onRetry: (i) => retry(i), onAgain: () => again(), onOpen });
      resultUi.update({ clips: [], result: null });
      editorUi.setFlow(null); editorUi.reveal();
    } catch (err) { msg.set(t('Không bắt đầu được: {reason}', { reason: err.message })); editorUi.setLocked(false); source.setLocked(false); } finally { phase = 'idle'; paint(); }
  }
  const onOpen = () => source.dir.open();

  async function retry(i) {
    if (!job) return;
    msg.set('');
    ended = false;
    latestResult = null;
    emitMotionState();
    const s = source.get();
    try { await draft.flush(); } catch {}
    const a = await dola.motion.retry({
      jobId: job.jobId,
      i,
      engine: s.engine,
      flowModel: s.flowModel,
      keepMusic: s.keepMusic,
      imageHandles: Array.isArray(s.images) ? s.images.map((img) => img.handle).filter(Boolean) : undefined,
      lines: s.keepMusic ? [] : (editorUi ? editorUi.lines() : undefined),
    }).catch(() => null);
    if (!a?.ok) msg.set(ct(a?.note) || t('Không làm lại được đoạn này.'));
  }

  async function again() {
    draft.cancel();
    try { await dola.motion.close(); } catch { /* a film still running keeps its screen */ }
    resultUi?.destroy(); resultPanel.reset(); extraSources.forEach((ext) => ext.resultPanel?.reset()); editorUi?.destroy();
    plan = null; job = null; editorUi = null; resultUi = null; ended = false; shown = ''; msg.set('');
    latestClips = []; latestResult = null; latestStageText = '';
    showPlayers(false); source.setLocked(false); paint();
  }

  dola.motion.onProgress((e) => {
    if (e?.stage === 'prepare') { latestStageText = String(e.text || ''); stage.textContent = latestStageText; emitMotionState(); return; }
    if (job && e?.jobId === job.jobId) {
      latestClips = Array.isArray(e.clips) ? e.clips : [];
      latestResult = e.result || null;
      latestStageText = String(e.stage || '');
      resultUi?.update({ clips: e.clips, result: e.result || null, stage: e.stage }); editorUi?.setFlow(e.clips || []);
      if (e.result && !succeeded(e.result)) {
        const failedClip = latestClips.find((c) => c.state === 'failed' && c.note);
        msg.set(ct(failedClip?.note || e.result.note) || t('Tạo video không thành công. Bấm Thử lại đoạn lỗi để chạy tiếp.'));
      } else if (succeeded(e.result)) {
        msg.set('');
      }
      if (!!e.result !== ended) { ended = !!e.result; if (editorUi) source.setLocked(!ended); paint(); } else emitMotionState();
    }
  });

  // the film the core still holds, put on the screen: with a plan (withPlan) ON TOP of the step-2 screen (right player, FLOW lane, read-only timeline); without one the result panel stands alone
  function attachFilm(st, withPlan) {
    job = { jobId: st.jobId, credits: st.credits }; ended = !!st.result;
    latestClips = Array.isArray(st.clips) ? st.clips : [];
    latestResult = st.result || null;
    resultUi = mountResult({ panel: resultPanel, perClip: st.credits?.perClip || 20, compare: withPlan ? source.player : null, onRetry: (i) => retry(i), onAgain: () => again(), onOpen });
    resultUi.update({ clips: st.clips, result: st.result });
    if (withPlan) { editorUi.setLocked(true); editorUi.setFlow(st.clips || []); } else showPlayers(true);
    source.setLocked(!(withPlan && ended)); // a made film leaves the sidebar free, as the end of a live run does
    emitMotionState();
  }

  // a plan the core kept: the same screen as right after "Phân tích video", the sidebar as the person left it. -> true when it is on screen
  function drawSession(saved) {
    try {
      source.restore(saved);
      extraSources.forEach((ext) => {
        try {
          localStorage.removeItem(ext.storageKey);
        } catch {}
        ext.source.restore(saved);
      });
      showPlan(saved.plan, source.get(), saved.selected);
      return true;
    } catch { plan = null; editorUi?.destroy(); editorUi = null; shown = ''; return false; } // a plan that cannot be drawn leaves the empty screen
  }

  // a reopened tab: the plan first (step 2), then the film on top; no plan = the film alone; no film = the plan alone (or the core's sentence about a plan it dropped)
  async function restoreAll() {
    const { film, saved } = await readRestorable(dola);
    const dropped = saved?.dropped !== undefined;
    const drawn = !!saved && !dropped && drawSession(saved);
    if (film) attachFilm(film, drawn); else if (dropped) msg.set(saved.dropped || t('Video đã bị đổi hoặc xoá nên không khôi phục được kế hoạch cũ.'));
  }

  await readInfo();
  await restoreAll();
  draft.watchPage();
  paint();
  return { onShow: () => { readInfo(); source.dir.refresh(); paint(); }, onHide: () => {}, drop: (files) => { if (phase === 'idle' && !job) source.drop(files); } };
}
