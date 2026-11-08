import { el } from './pop.js';
import { button, noteLine } from './analyze-controls.js';
import { TARGET_CHANGED_NOTE, accountsLine, analyzeOffered, buildRunRequest, defaultSettings, failText, modelFor, targetDiffers, targetFromPrefs } from './analyze-form.js';
import { targetModels } from './analyze-target.js';
import { queueState, queueTasks, singleFlight } from './analyze-cards.js';
import { mountResults } from './analyze-results.js';
import { mountSettings } from './analyze-settings.js';
import { mountVideoBox, watchVideoDrop } from './analyze-video-box.js';
import { errText } from './ui-text.js';
import { t, tn } from './i18n.js';
import { ct } from './core-text.js';

// The "Phân tích video" tab (section #view-analyze): the frame that joins the three sections. A video in, N prompts out (AI Studio, through a Gmail account
// of the app), then the ticked prompts go to the SAME queue the "Tạo video" form uses (window.dola.queue.add): the core finds each @tag in the prompt
// and attaches the image itself. Nothing is saved: the result lives in this page until "Phân tích lại" or a reload.
// The prompts are written for the destination (mode / length / ratio) the run was asked with: that one is kept with the cards (runTarget) and is what the queue
// gets, whatever the settings say later; a change after the cards exist only shows a line asking for "Phân tích lại". While a run is on, the settings and the video are locked.
// Returns null when this core does not offer the tab (opts.analyze !== true, or no window.dola.analyze): the caller then leaves the button hidden.
//   opts   window.dola.options()          prefs   the form's choices {mode, duration, ratio, model, veoModel} (read when the tab opens)
//   showView(name)   switches the screen  say(line)   the app's log line
export async function initAnalyze({ dola = window.dola, root, opts, prefs, showView, say = () => {} }) {
  if (!analyzeOffered(opts, dola)) return null;
  let limits = {};
  let info = null;
  const readInfo = async () => {
    try { info = await dola.analyze.info(); limits = info?.limits || limits; } catch { info = null; }
  };
  await readInfo();

  const settings = defaultSettings(prefs, opts);
  Object.assign(settings, targetFromPrefs(prefs, limits, opts), targetModels(prefs, opts)); // the form's own mode and models, even Veo / Muse: choosing a product then explains why it cannot go with them
  let busy = false;
  let sending = false; // a queue.add is in flight (queueNow)
  let lastVideo = null;
  let runTarget = null; // { mode, duration, ratio } of the request the cards were written for

  // ── layout ──
  const wrap = el('div', 'an-wrap');
  root.replaceChildren(wrap);
  wrap.append(el('h1', 'an-title', t('Phân tích video')), el('p', 'an-sub', t('Thả một video mẫu, chọn sản phẩm của bạn: AI Studio viết các prompt Seedance để tạo video tương tự với sản phẩm của bạn.')));
  const left = el('section', 'an-col an-col--left');
  const right = el('section', 'an-col an-col--right');
  const body = el('div', 'an-body');
  body.append(left, right);
  wrap.append(body);

  const video = mountVideoBox({ dola, onChange: (v) => { lastVideo = v; refreshRun(); } });
  const settingsUi = mountSettings({ dola, settings, limits, opts, anchor: left, onChange: () => { refreshRun(); results.setHandles(settings.products); } });
  const runLine = noteLine('an-note');
  const runMsg = noteLine('an-err');
  runMsg.node.setAttribute('role', 'alert');
  const staleLine = noteLine('an-err an-stale'); // the settings no longer match the cards
  const runBtn = button(t('Phân tích'), 'an-btn an-btn--main an-run', () => start());
  const cancelBtn = button(t('Huỷ'), 'an-btn', () => dola.analyze.cancel().catch(() => {}));
  cancelBtn.hidden = true;
  const progress = el('div', 'an-progress');
  progress.hidden = true;
  const stageLine = el('p', 'an-stage', '');
  const cards$ = el('p', 'an-note', '');
  progress.append(el('span', 'an-spin'), stageLine, cancelBtn);
  const runRow = el('div', 'an-runrow');
  runRow.append(runBtn, progress);
  left.append(video.node, settingsUi.node, runLine.node, runRow, runMsg.node, cards$);

  const results = mountResults({ onQueue: () => queueNow() });
  results.onRerun(() => start());
  const empty = el('div', 'an-empty');
  empty.append(el('p', 'an-empty-title', t('Kết quả sẽ hiện ở đây')), el('p', 'an-note', t('Mỗi prompt là một thẻ: bạn sửa được chữ, bỏ chọn thẻ không ưng, rồi đưa các thẻ đã chọn vào hàng đợi để tạo video.')));
  right.append(empty, results.node, staleLine.node);

  // A video dropped anywhere on the screen counts (the window itself ignores drops, app.js).
  watchVideoDrop(wrap, (files) => video.drop(files), () => busy);

  function refreshRun() {
    runBtn.disabled = busy || !lastVideo;
    runBtn.textContent = results.cards().length ? t('Phân tích lại') : t('Phân tích');
    runLine.set(busy ? '' : accountsLine(info));
    runLine.node.classList.toggle('an-err', !busy && !!info?.ok && info.usable === 0);
    staleLine.set(results.cards().length && targetDiffers(runTarget, settings) ? TARGET_CHANGED_NOTE : '');
  }

  function setBusy(on) {
    busy = on;
    progress.hidden = !on;
    cancelBtn.hidden = !on;
    runBtn.hidden = on;
    settingsUi.setLocked(on);
    video.setLocked(on);
    refreshRun();
  }

  // ── run ──
  async function start() {
    if (busy || sending) return;
    runMsg.set('');
    const built = buildRunRequest(settings, lastVideo);
    if (!built.ok) { runMsg.set(ct(built.note)); return; }
    runTarget = { ...built.request.target };
    results.clear();
    empty.hidden = false;
    results.setHandles(settings.products);
    setBusy(true);
    stageLine.textContent = t('Đang bắt đầu…');
    const stopStage = dola.analyze.onStage((s) => { stageLine.textContent = s?.account ? t('{text} (acc {account})', { text: s.text, account: s.account }) : String(s?.text ?? ''); });
    const stopCards = dola.analyze.onCards((c) => {
      results.add(c.prompts || [], c.summary);
      empty.hidden = results.cards().length > 0;
      cards$.textContent = c.calls > 1 ? t('Đã có {what} (lượt {call}/{calls})…', { what: tn(c.prompts.length, '{n} prompt', '{n} prompt', '{n} prompts'), call: c.call, calls: c.calls }) : '';
    });
    try {
      const r = await dola.analyze.run(built.request);
      results.add(r.prompts || [], r.summary); // the answer repeats the cards already shown: only what is new is added
      empty.hidden = results.cards().length > 0;
      if (r.ok) {
        const done = {
          what: tn(r.prompts.length, '{n} prompt', '{n} prompt', '{n} prompts'),
          secs: tn(Math.round((r.ms || 0) / 1000), '{n} giây', '{n} second', '{n} seconds'),
          account: r.accountLabel, plan: r.accountPlan ? r.accountPlan.toUpperCase() : '',
        };
        say(!r.accountLabel ? t('Phân tích xong {what} ({secs}).', done)
          : r.accountPlan ? t('Phân tích xong {what} bằng acc {account} · gói {plan} ({secs}).', done)
            : t('Phân tích xong {what} bằng acc {account} ({secs}).', done));
        if (r.shortfall) runMsg.set(t('AI Studio chỉ trả {what}, thiếu {missing} so với số bạn xin.', { what: done.what, missing: r.shortfall }));
        results.say('');
      } else {
        await readInfo(); // the sentence for 'no account' depends on whether there are accounts that are only resting
        runMsg.set(failText(r, results.cards().length, info));
      }
    } catch (err) {
      runMsg.set(t('Không phân tích được: {reason}', { reason: errText(err) }));
    } finally {
      stopStage();
      stopCards();
      cards$.textContent = '';
      setBusy(false);
      readInfo().then(refreshRun);
    }
  }

  // ── hand-off to the queue ──
  // The destination is the one the cards were written for (runTarget); only the model comes from the model rows of this tab as they are now. A double click queues once (singleFlight).
  const queueBtn = results.node.querySelector('.an-queue');
  const queueNow = singleFlight(async () => {
    const asked = runTarget || { mode: settings.mode, duration: settings.duration, ratio: settings.ratio };
    const target = { ...asked, model: modelFor(asked.mode, settings, opts) };
    const tasks = queueTasks(results.cards(), settings.products, target);
    if (!tasks.length) { results.say(t('Chưa có prompt nào hợp lệ để đưa vào hàng đợi.')); return; }
    const went = new Set(results.cards().filter((c) => c.ticked).map((c) => c.id));
    try {
      const r = await dola.queue.add(tasks);
      if (r?.ok === false) { results.say(ct(r.note) || t('Không thêm được vào hàng đợi ({reason}).', { reason: r.reason || t('không rõ') })); return; }
    } catch (err) {
      results.say(t('Không thêm được vào hàng đợi: {reason}', { reason: errText(err) }));
      return;
    }
    results.markQueued(went);
    results.say(tn(tasks.length, 'Đã thêm {n} lệnh vào hàng đợi.', 'Added {n} prompt to the queue.', 'Added {n} prompts to the queue.'));
    say(t('{what} từ tab Phân tích video vào hàng đợi ({mode}, {duration}s, {ratio}).', { what: tn(tasks.length, 'Đã thêm {n} lệnh', 'Added {n} prompt', 'Added {n} prompts'), mode: target.mode, duration: target.duration, ratio: target.ratio }));
    showView('create'); // the person sees the queue and the history at once
  }, (on) => {
    sending = on;
    queueBtn.disabled = on || queueState(results.cards(), settings.products).disabled; // off while sending; after it, what the cards say (all queued = off)
  });

  results.setHandles(settings.products);
  refreshRun();
  return {
    // The tab was opened: the form may have changed its mode / length / ratio since, and an account may have been added or have rested.
    async onShow(nextPrefs) {
      if (busy) return;
      Object.assign(prefs, nextPrefs || {});
      await readInfo();
      if (!results.cards().length && !lastVideo) Object.assign(settings, targetFromPrefs(prefs, limits, opts), targetModels(prefs, opts));
      settingsUi.repaint();
      settingsUi.refresh();
      refreshRun();
    },
  };
}
