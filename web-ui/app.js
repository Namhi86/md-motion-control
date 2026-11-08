// Giao diện chính của ứng dụng MD Motion Control
//  - opened without the app (a plain browser: no window.dola), the page only says to open it with the app, and nothing else runs.
//  - signed out, the login screen (auth.js); the UI below starts the first time the person is signed in. Its modules are imported
//    only then, because setup.js subscribes to window.dola as soon as it is loaded.
//  - window.dola.ready() right after the first paint (the login screen's, or this UI's).
//  - the composer form is kept from submitting by a listener (the inline onsubmit="return false" is refused by the CSP).
import { applyStatic, getLang, registerStrings, t, tn, tx } from './i18n.js';
import { optionsFeed } from './core-feed.js';
import { initLangSwitch } from './lang-switch.js';
import { startAuth } from './auth.js';
import { showVersion } from './version-label.js';
import { voiceOffered } from './voice-offered.js';
import { refTextsText, tooManyImagesText } from './veo-images-text.js';
import { libraryApi } from './library-entry.js';
import { initLiveStage } from './live-stage.js';

// The page's language first (i18n.js): the static markup is translated before the login starts, and the VI / EN buttons are wired.
applyStatic();
initLangSwitch();

// startApp failing (a bridge call refused, a module that does not load) is shown by auth.js: a line with "Tải lại".
if (window.dola) startAuth({ dola: window.dola, startMain: startApp }).catch((err) => console.error('MD Motion Control: the login screen did not start', err));
else showOpenWithApp();

// A plain browser: one message instead of a UI that has nothing to talk to.
function showOpenWithApp() {
  const box = document.createElement('main');
  box.className = 'fs-gate';
  const title = document.createElement('h1');
  title.textContent = t('Hãy mở bằng app MD Motion Control');
  const note = document.createElement('p');
  note.textContent = t('Trang này là giao diện của app MD Motion Control trên máy tính và chỉ chạy bên trong app. Mở app MD Motion Control để tạo video.');
  box.append(title, note);
  document.body.replaceChildren(box);
}

async function startApp() {
  const [
    { initHistory },
    { initSetup, readyCount },
    { initSaveDirUi },
    { initProxyUi },
    { enqueueFromForm, initQueueUi },
    { closePop, durationTrack, el, listMenu, openPop },
    { mediaUrl },
    { initElements },
    { closeDetail },
    muse,
    { imageModelPop, museDurationPop, mountMuseGuide, mountMuseRef, mountPromptHint },
    im,
    mg,
    tp,
    { mountSkill },
    veoImages,
    sk,
    sf,
    ex,
    vd,
    { veoDurationPop },
  ] = await Promise.all([
    import('./history.js'),
    import('./setup.js'),
    import('./save-dir-ui.js'),
    import('./proxy-ui.js'),
    import('./queue-ui.js'),
    import('./pop.js'),
    import('./shared/media-handles.js'),
    import('./elements-ui.js'),
    import('./video-detail.js'),
    import('./muse-form.js'), // the Muse and image modes: shown only when the core offers them (opts.muse / opts.image)
    import('./muse-ui.js'),
    import('./image-models.js'), // the models of the "Tạo ảnh" screen: Muse Image and, when the core offers it, Nano Banana
    import('./model-groups.js'), // the Model popup's families (Seedance, Veo, Muse), the header's "Tạo ảnh" and the screen split of the history
    import('./target-pills.js'), // the Model popup, the Seedance mode popup and their notes: shared with the "Phân tích video" tab (analyze-target-ui.js)
    import('./skill-ui.js'), // the "Thêm skill (.md/.txt)" row: Pro and Muse only, and only when the core offers pickSkill
    import('./shared/veo-images.js'), // how many reference images the picked mode / Veo model takes, and the notices
    import('./shared/skill-store-form.js'), // the rules of a skill of the Kho skill tab (15 s, "Dùng skill")
    import('./shared/skill-form.js'), // which modes take a skill file and whether this core offers the row
    import('./extract-skill-text.js'), // "Tách skill": the words and whether this core offers it (the window itself is imported when it opens)
    import('./veo-durations.js'), // the lengths / resolutions / prices of each Veo model, as the core says them
    import('./veo-durations-ui.js'), // the duration popover of such a model
  ]);

  const $ = (id) => document.getElementById(id);
  const promptEl = $('prompt');
  const generateBtn = $('generate');
  const warnEl = $('warn');
  const KEY = { fb: 'fbCookies', prefs: 'prefs' };

  let opts;
  // museScript: "Theo prompt" (Muse clip), its own flag: duration keeps its number. lastVideo / lastSeedance: where "Tạo video" and a Seedance model return to (model-groups.js).
  // imageModel: the model of the "Tạo ảnh" screen (Muse Image or a Nano Banana one, image-models.js); the other modes never read it.
  const prefs = { model: '', veoModel: '', veoResolution: '720p', imageModel: '', ratio: '', duration: 10, mode: 'voice', museScript: false, lastVideo: 'voice', lastSeedance: 'voice' };
  let files = []; // reference images: [{ handle, name }] (the path stays in the main process)
  let museRef = null; // the reference pictures of a Muse clip (muse-ui.js, up to opts.muse.maxImages; 1 on an older core); null in an app whose core has no Muse
  let nanoRef = null; // the reference pictures of a Nano Banana picture (the same box, up to opts.nano.maxImages); null while the core offers no Nano Banana
  let skillUi = null; // the "Thêm skill" row (skill-ui.js)
  let museGuide = null; // the "how to write a script" box under the prompt
  let elementsUi = null; // the element library in the form (elements-ui.js); null in an app whose core has no window.dola.elements
  let promptHint = null; // the "many prompts" line and placeholder of the "Tạo ảnh" screen (muse-ui.js)
  let history = null; // the history list (history.js): shows the pictures on "Tạo ảnh" and the videos on "Tạo video"
  let inSetup = false;

  // A file dropped on the window would navigate it to that file: nothing here takes drops.
  for (const type of ['dragover', 'drop']) window.addEventListener(type, (e) => e.preventDefault());
  document.querySelector('.cv-form').addEventListener('submit', (e) => e.preventDefault()); // was onsubmit="return false"

  // ── Header: Tạo video | Tạo ảnh | Setup tài khoản ──
  // "Tạo video" and "Tạo ảnh" are the same form in two modes (model-groups.js modeForNav); "Tạo ảnh" exists only when the core offers it.
  let analyzeUi = null; // the "Phân tích video" tab (analyze-view.js); null while this core does not offer it, and then its button stays hidden
  let inAnalyze = false; // the analysis screen is on: neither the form nor Setup shows, and only its nav item is lit
  let adminUi = null; // the admin screen's entry (admin-entry.js); null until the core is known to offer it
  let inAdmin = false; // the admin screen is on (opened by the header link, only for the admin): like the analysis screen, no tab is lit
  let skillsUi = null; // the "Kho skill" tab's entry (skills-entry.js); null until the core is known to offer it
  let inSkills = false; // the Kho skill screen is on: like the analysis screen, only its nav item is lit
  let inStudio = false; // the "Bàn sáng tạo" board is on: like the analysis screen, only its nav item is lit
  let studioMod = null; // the built module site/studio/studio.js, once it is loaded (the nav item shows only then)
  let studioMount = null; // the promise of the mounted board (mounted the first time the tab is shown)
  let studioPage = null; // the mounted board, once it is ready: { onShow, onHide }
  let inVoice = false; // the "Giọng nói" screen is on: like the board, only its nav item is lit
  let motionUi = null; // the "Motion control" tab (motion-view.js); null while this core does not offer it, and then its button stays hidden
  let inMotion = false; // the Motion control screen is on: like the analysis screen, only its nav item is lit
  let inLibrary = false; // tab Thư viện được tách riêng khỏi Tạo video
  let liveStage = null; // Sân khấu Hoạt động AI xuyên suốt chạy liên tục khi bấm Tạo video
  let voiceMod = null; // the built module site/voice/voice.js, once it is loaded (the nav item shows only then)
  let voiceMount = null; // the promise of the mounted screen (mounted the first time the tab is shown)
  let voicePage = null; // the mounted screen, once it is ready: { onShow, onHide }
  let guideUi = null, guideCard = null, tabCards = null; // the beginner tour + soft lock (guide-init.js; null while this core cannot list accounts) / the first-time card of this form / the ones of Tạo ảnh, Kho skill, Phân tích video
  let whatsNew = null, guideDecided = false; // "Có gì mới" (whats-new-ui.js; null until the core answers meta); the guide block below has run, so guideUi is final (null = this core has no tour)
  function paintNav() {
    const nav = mg.navState({ mode: prefs.mode, inSetup, opts });
    $('nav-image').hidden = !nav.imageShown;
    $('nav-create').classList.toggle('nav-link--on', nav.create && !inLibrary && !inAnalyze && !inAdmin && !inSkills && !inStudio && !inVoice && !inMotion);
    $('nav-library')?.classList.toggle('nav-link--on', inLibrary);
    $('nav-image').classList.toggle('nav-link--on', nav.image && !inLibrary && !inAnalyze && !inAdmin && !inSkills && !inStudio && !inVoice && !inMotion);
    $('nav-setup').classList.toggle('nav-link--on', nav.setup && !inLibrary && !inAnalyze && !inAdmin && !inSkills && !inStudio && !inVoice && !inMotion);
    $('nav-skills').classList.toggle('nav-link--on', inSkills);
    $('nav-admin').classList.toggle('fs-user-link--on', inAdmin);
    $('nav-analyze').classList.toggle('nav-link--on', inAnalyze);
    $('nav-studio').classList.toggle('nav-link--on', inStudio);
    $('nav-voice').classList.toggle('nav-link--on', inVoice);
    $('nav-motion').classList.toggle('nav-link--on', inMotion);
  }
  function showView(name) {
    if (inSkills && name !== 'skills') skillsUi?.onHide(); // the sample videos stop
    inSkills = name === 'skills';
    inAnalyze = name === 'analyze';
    inAdmin = name === 'admin';
    inSetup = name === 'setup';
    inStudio = name === 'studio';
    if (inMotion && name !== 'motion') motionUi?.onHide();
    inVoice = name === 'voice';
    inMotion = name === 'motion';
    inLibrary = name === 'library';
    $('view-create').hidden = inSetup || inAnalyze || inAdmin || inSkills || inStudio || inVoice || inMotion;
    $('view-create').dataset.subview = inLibrary ? 'library' : 'create';
    $('view-skills').hidden = !inSkills;
    $('view-setup').hidden = !inSetup;
    $('view-analyze').hidden = !inAnalyze;
    $('view-admin').hidden = !inAdmin;
    $('view-studio').hidden = !inStudio;
    $('view-voice').hidden = !inVoice;
    $('view-motion').hidden = !inMotion;
    closePop();
    elementsUi?.closePopup();
    closeDetail();
    if (name === 'studio') openStudio();
    else studioPage?.onHide(); // the board stops taking Backspace / Delete in this very turn (not a frame later)
    if (name === 'voice') openVoice();
    else voicePage?.onHide();
    if (inMotion) motionUi?.onShow();
    else if (inAnalyze) analyzeUi?.onShow(prefs);
    else if (inAdmin) adminUi?.onShow();
    else if (inSkills) skillsUi?.onShow();
    else if (!inSetup && !inStudio && !inVoice && !inMotion) {
      prefs.mode = mg.modeForNav(inLibrary ? 'create' : name, prefs, opts);
      fitToMode();
    }
    paintPrefs(); // the nav, the form and the history screen follow the mode
  }
  $('nav-create').onclick = () => showView('create');
  if ($('nav-library')) $('nav-library').onclick = () => showView('library');
  if ($('lib-go-create')) $('lib-go-create').onclick = () => showView('create');
  if ($('lib-open-folder')) $('lib-open-folder').onclick = () => window.dola?.saveDir?.open?.();
  $('nav-image').onclick = () => showView('image');
  $('nav-setup').onclick = () => showView('setup');
  $('nav-analyze').onclick = () => showView('analyze');
  $('nav-studio').onclick = () => showView('studio');
  $('nav-voice').onclick = () => showView('voice');
  $('nav-motion').onclick = () => showView('motion');
  // The "Bàn sáng tạo" tab (studio/ builds site/studio/studio.js): the module is loaded at start-up, the board is mounted the first time the tab is shown
  // (Vue Flow measures a visible box). Any failure hides the tab and leaves the rest of the app as it was.
  async function openStudio() {
    try {
      studioMount ??= studioMod.mountStudio({ root: $('view-studio'), dola: window.dola, opts, library: libraryApi() });
      studioPage = await studioMount;
      studioPage.onShow();
    } catch (err) {
      console.error('Studio: the tab did not open', err);
      studioMount = null;
      studioPage = null;
      $('nav-studio').hidden = true;
      if (inStudio) showView('create'); // a person who has gone elsewhere meanwhile stays there
    }
  }
  // The "Giọng nói" tab (voice/ builds site/voice/voice.js): loaded at start-up like the board, mounted the first time the tab is shown. Any failure hides the tab
  // and leaves the rest of the app as it was.
  async function openVoice() {
    try {
      voiceMount ??= voiceMod.mountVoice({ root: $('view-voice'), dola: window.dola, opts });
      voicePage = await voiceMount;
      voicePage.onShow();
    } catch (err) {
      console.error('Voice: the tab did not open', err);
      voiceMount = null;
      voicePage = null;
      $('nav-voice').hidden = true;
      if (inVoice) showView('create'); // a person who has gone elsewhere meanwhile stays there
    }
  }
  // "Dùng skill" of the Kho skill tab: the form opens in the mode the skill has (Pro first, else Muse video) with the chip "Kho: <tên>"; the length is cut to 15 s.
  function useStoreSkill(card) {
    const patch = sk.storeUsePatch(card, { pro: muse.modeOffered('pro', opts), muse: muse.modeOffered('muse', opts) }, prefs);
    if (!patch) return setWarn(tx(sk.STORE_TEXT.needMode));
    showView('create');
    Object.assign(prefs, patch);
    fitToMode();
    if (skillUi?.useStoreSkill(card)) setWarn(tx(sk.STORE_TEXT.durationNote), true);
    paintPrefs();
  }

  // The cookie list the previous version kept in this window's localStorage moves into the account store once.
  async function moveLegacyCookies() {
    const old = localStorage.getItem(KEY.fb);
    if (!old) return;
    const r = await window.dola.accounts.legacy(old);
    localStorage.removeItem(KEY.fb);
    if (r.added) setWarn(tn(r.added, 'Đã chuyển {n} cookie Facebook cũ sang "Setup tài khoản".', 'Moved {n} old Facebook cookie to "Accounts".', 'Moved {n} old Facebook cookies to "Accounts".'), true);
  }

  // ── Model / duration / ratio / mode ──
  // Nhanh (fast) = the fast chat Dola always had: no longer a choice (modeOffered), the label stays for the last-resort case of a core with no other mode.
  // Pro = the Pro chat of Dola: a clip of the full length and WITH sound (Nhanh clips have none),
  // but slower, it often answers "too many people" (the app sends again by itself) and it has its own free quota of 7 days.
  const MODE_LABEL = { fast: t('Nhanh'), voice: t('Nhanh + tiếng'), pro: 'Pro', veo: 'Veo (Gmail)', ...muse.MUSE_LABEL };
  const isVeo = () => prefs.mode === 'veo';
  // The images the mode / the picked Veo model takes: 10 for Seedance, a Veo model what the core says (opts.veo.models[].maxImages; a core that says
  // nothing takes none). Extra loose images are dropped with a plain notice, never silently; a command that mentions more elements than that is refused.
  const limitNow = () => veoImages.refLimit({ mode: prefs.mode, opts, veoModel: prefs.veoModel });
  let refsNote = ''; // the last "images were dropped" notice: the next change that drops nothing takes it away again, unless a newer line has replaced it
  function noteRefs(text) {
    if (text) { refsNote = text; setWarn(text); return; }
    if (refsNote && warnEl.textContent === refsNote) setWarn('');
    refsNote = '';
  }
  const isMuse = () => prefs.mode === 'muse'; // a Muse clip
  const isImage = () => prefs.mode === 'image'; // a Muse picture (a mode of this form only: the core gets mode 'muse', kind 'image')
  const museSide = () => (isImage() ? opts.image : opts.muse); // what the core listed for the Muse mode that is open
  const isNano = () => isImage() && im.imageSelection(opts, prefs.imageModel).family === 'nano'; // a Nano Banana picture: a Veo-mode task with kind 'image'
  const modelOf = (id) => opts.models.find((m) => m.id === id) || opts.models[0];
  const veoModelOf = (id) => opts.veo.models.find((m) => m.id === id) || opts.veo.models[0];
  const currentModel = () => (isImage() ? im.imageSelection(opts, prefs.imageModel).model : isMuse() ? museSide().models[0] : isVeo() ? veoModelOf(prefs.veoModel) : modelOf(prefs.model));
  const ratiosNow = () => (isNano() ? im.nanoRatios(opts) : isVeo() ? opts.veo.ratios : isMuse() || isImage() ? museSide().ratios : opts.ratios);
  const storeOn = () => (prefs.mode === 'pro' || prefs.mode === 'muse') && !!skillUi?.store()?.modes.includes(prefs.mode); // a Kho skill is attached: 15 s at most
  const durationNow = () => { const d = isVeo() ? opts.veo.duration : isMuse() ? opts.muse.duration : opts.duration; return storeOn() ? sk.storeDurationRange(prefs.mode, d) : d; }; // (a picture has none)
  // Switching mode keeps the choices the new mode has and brings the others to what it can do.
  function fitToMode() {
    if (!ratiosNow().includes(prefs.ratio)) prefs.ratio = isNano() ? im.nanoDefaultRatio(opts) : ratiosNow()[0];
    if (isImage()) return; // a picture has no length: the number on the bar stays for the next clip
    if (storeOn()) prefs.museScript = false;
    const d = durationNow();
    prefs.duration = Math.min(d.max, Math.max(d.min, prefs.duration));
    if (isVeo() && !storeOn()) Object.assign(prefs, vd.fitPrefs(veoModelOf(prefs.veoModel), prefs)); // the length THAT Veo model makes, and a resolution it has (a core that says no lengths keeps the bar)
  }
  // A Veo model whose core says its lengths gets the buttons popover (Omni 4 / 6 / 8 / 10 and 720p / 360p, Veo 3.1 only 8); every other mode and an older core keep the bar.
  const veoLengths = () => isVeo() && !storeOn() && vd.offersLengths(veoModelOf(prefs.veoModel));
  const viaMuse = () => isMuse() || isImage(); // the core gets mode 'muse' for both
  const genText = () => (isImage() ? t('Tạo ảnh') : t('Tạo video'));
  // What differs in the form while a Muse mode is open. In any other mode (and in an app whose core has no Muse) every line leaves the form as it was.
  function paintMuseForm() {
    $('dur-btn').hidden = isImage(); // a picture has no length
    $('ratio-btn').hidden = isImage() && !isNano(); // and no ratio to choose: Muse makes it 1920x1280 (a Nano Banana picture has five)
    $('dur-btn').dataset.long = String((isMuse() && prefs.museScript) || (veoLengths() && vd.hasResolutionChoice(veoModelOf(prefs.veoModel)))); // "Theo prompt" and "10s · 360p" are longer than "10s": the pill sets them smaller
    $('refs').hidden = viaMuse(); // the Dola reference box / element tray; Muse has its own box
    museRef?.show(isMuse());
    nanoRef?.show(isNano()); // Nano Banana reads no @element either: its own pictures box, not the element tray
    museGuide?.show(isMuse() && prefs.museScript);
    if (!generateBtn.disabled) $('gen-label').textContent = genText();
    document.querySelector('.cv-prompt-label').textContent = isImage() ? t('Mô tả ảnh') : t('Mô tả video');
    promptHint?.paint(prefs.mode);
    $('subtab').textContent = isImage() ? t('Tạo Ảnh') : t('Tạo Video');
    [$('card-title').textContent, $('card-sub').textContent] = mg.cardText(prefs.mode, isNano() ? 'nano' : ''); // the banner of a tall window follows the model family
  }
  function paintPrefs() {
    const dropped = fitRefs();
    $('model-val').textContent = currentModel().label;
    $('dur-val').textContent = veoLengths() ? vd.pillText(veoModelOf(prefs.veoModel), prefs) : muse.durationLabel(prefs);
    $('dur-btn').title = veoLengths() ? veoPriceTip() : ''; // the price of the chosen length / resolution, on hover
    $('ratio-val').textContent = prefs.ratio;
    $('mode-val').textContent = MODE_LABEL[prefs.mode];
    $('mode-btn').hidden = !opts.modes || !mg.SEEDANCE_MODES.includes(prefs.mode); // Nhanh + tiếng / Pro belong to the Seedance models; Veo, Muse and the picture have their own row or screen
    Object.assign(prefs, mg.rememberModes(prefs));
    skillUi?.sync(isNano() ? 'veo' : prefs.mode, opts); // drawn in Pro and Muse only; a mode with no skill drops the pick (a Nano Banana picture takes none: told as Veo)
    paintMuseForm();
    paintNav();
    guideCard?.sync(); tabCards?.sync(); // the first-time cards and their "?" follow the screen and the mode (Tạo video first: its panel closes before another card may open)
    history?.setScreen(mg.screenForMode(prefs.mode, opts));
    const changed = repaintRefs(); // the box follows the limit of the mode / Veo model (only when one of them changed)
    if (dropped || changed) noteRefs(dropped); // a change of mode / model that drops nothing takes the old notice away; the duration bar does not
    localStorage.setItem(KEY.prefs, JSON.stringify(prefs));
  }
  // The Model popup. A core with Seedance only gets the list it always had; with Veo or Muse the rows are grouped by family (model-groups.js)
  // and picking one sets the mode too (target-pills.js, shared with the "Phân tích video" tab). The picture screen lists Muse Image and, when the core
  // offers it, the Nano Banana models (muse-ui.js imageModelPop); the pick is remembered in prefs.imageModel.
  function modelPopNodes() {
    if (isImage()) return imageModelPop({ opts, picked: prefs.imageModel, close: closePop, onPick: (item) => { prefs.imageModel = im.imageModelId(item.id, opts); fitToMode(); paintPrefs(); closePop(); } });
    return tp.modelPopNodes({ opts, state: prefs, onPick: (patch) => {
      const intoVeo = patch.mode === 'veo' && prefs.mode !== 'veo' && vd.offersLengths(vd.veoModelIn(opts, patch.veoModel)); // from Seedance (10 s) to Veo: the Veo default (8 s), not a 15-credit Omni 10 s by surprise
      Object.assign(prefs, patch);
      if (intoVeo && opts.veo.duration?.def) prefs.duration = opts.veo.duration.def;
      fitToMode(); paintPrefs(); closePop();
    } });
  }
  $('model-btn').onclick = () => openPop($('model-btn'), modelPopNodes());
  const veoPriceTip = () => {
    const model = veoModelOf(prefs.veoModel);
    const price = vd.priceOf(model, { resolution: vd.resolutionToSend(model, prefs) || undefined, seconds: prefs.duration });
    return price === null ? '' : vd.priceText(price);
  };
  const veoDurationNodes = () => {
    const model = veoModelOf(prefs.veoModel);
    return veoDurationPop({
      model,
      get: () => ({ duration: prefs.duration, resolution: vd.resolutionFor(model, prefs.veoResolution) }),
      set: (patch) => { if (patch.duration !== undefined) prefs.duration = patch.duration; if (patch.resolution !== undefined) prefs.veoResolution = patch.resolution; paintPrefs(); },
    });
  };
  $('dur-btn').onclick = () => openPop($('dur-btn'), veoLengths() ? veoDurationNodes() : isMuse() && !storeOn() ? museDurationPop({ range: durationNow(), prefs, onChange: paintPrefs }) : [
    el('p', 'cv-pop-head', t('Chọn thời lượng')),
    durationTrack(durationNow(), prefs.duration, (v) => { prefs.duration = v; paintPrefs(); }),
    el('p', 'cv-pop-note', storeOn() ? tx(sk.STORE_TEXT.durationNote) : tp.DURATION_NOTE),
  ], 334);
  $('mode-btn').onclick = () => openPop($('mode-btn'), tp.seedanceModePop({ opts, mode: prefs.mode, labels: MODE_LABEL, onPick: (m) => { prefs.mode = m; fitToMode(); paintPrefs(); closePop(); } }), 334);
  $('ratio-btn').onclick = () => openPop($('ratio-btn'), [
    ...listMenu(ratiosNow(), prefs.ratio, (r) => { prefs.ratio = r; paintPrefs(); closePop(); }),
    ...(viaMuse() && !isNano() ? [el('p', 'cv-pop-note', isImage() ? muse.MUSE_NOTE.ratioImage : muse.MUSE_NOTE.ratio)] : []),
  ]);

  // ── Reference images ──
  let refsShown = false; // the loose-image box has been drawn once (before that, a core with elements is still reading its library: no flash of the old box)
  function paintRefs() {
    if (elementsUi) return; // the box belongs to the element library (elements-tray.js)
    refsShown = true;
    const box = $('refs');
    box.replaceChildren();
    const text = refTextsText(limitNow()); // Veo: its own limit; the "not measured yet" line is only the tooltip
    if (!files.length) {
      const b = el('button', 'cv-ref-tray cv-ref-tray--empty');
      b.type = 'button';
      b.title = text.tip;
      b.append(el('span', 'cv-reference-orb', '▣'), el('span', 'cv-ref-label', t('Thêm ảnh tham chiếu')), el('span', 'cv-ref-hint', text.hint));
      b.onclick = pick;
      box.append(b);
      return;
    }
    const tray = el('div', 'cv-ref-tray');
    tray.title = text.tip;
    const add = el('button', 'cv-ref-add', '+');
    add.type = 'button';
    add.onclick = pick;
    tray.append(add);
    files.forEach((f, i) => {
      const tile = el('div', 'cv-ref-tile');
      const th = el('div', 'cv-ref-thumb');
      const img = el('img');
      img.src = mediaUrl.pick(f.handle);
      th.append(img);
      const x = el('button', 'cv-ref-x', '✕');
      x.type = 'button';
      x.onclick = () => { files = files.filter((_, j) => j !== i); paintRefs(); };
      tile.append(th, x);
      tray.append(tile);
    });
    box.append(tray);
  }
  async function pick() {
    const limit = limitNow();
    if (limit.max < 1) return setWarn(refTextsText(limit).tip); // a core whose Veo takes no image: no dialog for nothing
    const picked = await window.dola.pickImages(); // images beyond 10 are dropped by main, which says so in the log
    if (!picked.length) return;
    const kept = veoImages.trimImages(veoImages.mergeImages(files, picked), limit.max);
    files = kept.files;
    paintRefs();
    noteRefs(kept.dropped ? tooManyImagesText(limit) : '');
  }
  // The loose images over the limit of the mode / Veo model are dropped -> the notice ('' = nothing was dropped); the caller says it where it fits.
  function fitRefs() {
    const limit = limitNow();
    const kept = veoImages.trimImages(files, limit.max);
    if (!kept.dropped) return '';
    files = kept.files;
    return tooManyImagesText(limit);
  }
  let refsKey = ''; // the mode and Veo model the box was last drawn for: the duration bar calls paintPrefs all the time and must not redraw the pictures
  function repaintRefs() { // -> true when the mode or the Veo model changed since the box was drawn
    const key = `${prefs.mode}|${prefs.veoModel}`;
    if (key === refsKey) return false;
    if (elementsUi) elementsUi.repaint();
    else if (refsShown) paintRefs();
    else return false; // nothing drawn yet (the library is still being read): the first draw reads the limit itself
    refsKey = key;
    return true;
  }

  // ── Tabs ──
  function showTab(name) {
    $('history').hidden = name !== 'hist';
    $('tab-hist').classList.toggle('cv-mtab--on', name === 'hist');
  }
  $('tab-hist').onclick = () => showTab('hist');

  // ── Generate: the button puts the prompt(s) into the queue; the queue (main process) runs them ──
  function setBusy(on) {
    generateBtn.disabled = on;
    $('gen-label').textContent = on ? t('Đang thêm…') : genText();
    $('gen-icon').hidden = on;
  }
  // The line under the button: a warning (red) or a confirmation (green).
  function setWarn(text, ok = false) {
    warnEl.textContent = text;
    warnEl.classList.toggle('cv-warn--ok', ok && !!text);
  }
  // "Tạo lại" on a history row: the task's settings go back into the form. Text that was typed and not queued is not thrown away on
  // the first press: the person is told, and a second press on the same row does replace it.
  let armedRerun = '';
  promptEl.addEventListener('input', () => { armedRerun = ''; });
  function rerun(task) {
    showView('create');
    if (promptEl.value.trim() && armedRerun !== task.id) {
      armedRerun = task.id;
      setWarn(t('Ô mô tả đang có chữ chưa xếp hàng. Bấm "Tạo lại" thêm một lần nữa để thay bằng lệnh này, hoặc bấm "{button}" để xếp chữ đang có.', { button: genText() }));
      return;
    }
    armedRerun = '';
    setWarn('');
    promptEl.value = task.prompt;
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
    const target = muse.modeOfTask(task); // a picture task goes back to the "Tạo ảnh" mode
    const toMuse = muse.modeOffered(target, opts) && (target === 'muse' || target === 'image'); // Muse reads no @element: the library stays out
    const gone = (!toMuse && elementsUi?.restore(task.prompt)) || []; // the elements the prompt mentions are ticked again
    const notes = [];
    if (gone.length) notes.push(t('{handles} không còn trong thư viện phần tử: giữ nguyên thành chữ.', { handles: gone.map((h) => `@${h}`).join(', ') }));
    if (elementsUi && !toMuse && task.files?.length) notes.push(tn(task.files.length, '{n} ảnh tham chiếu cũ của lệnh này không được mang theo (ô tham chiếu giờ là ô phần tử).', '{n} old reference image of this prompt was not carried over (the reference box is now the element box).', '{n} old reference images of this prompt were not carried over (the reference box is now the element box).'));
    if (notes.length) setWarn(notes.join(' '));
    prefs.mode = mg.rerunMode(target, opts); // an old Nhanh row (or any mode this core lost) opens on the fallback
    if (isImage()) prefs.imageModel = im.imageModelOfTask(task, opts); // a Nano Banana picture goes back to its Nano model, any other to Muse Image
    if (isVeo()) { if (opts.veo.models.some((m) => m.id === task.model)) prefs.veoModel = task.model; } else if (opts.models.some((m) => m.id === task.model)) prefs.model = task.model;
    prefs.ratio = task.ratio;
    if (isVeo() && vd.resolutionOfTask(task)) prefs.veoResolution = vd.resolutionOfTask(task); // a 360p Omni clip comes back at 360p
    Object.assign(prefs, muse.rerunDuration(task, prefs)); // duration 0 of a Muse clip = "Theo prompt"
    fitToMode();
    files = [];
    paintPrefs();
    paintRefs();
    if (toMuse) { // the pictures of a Muse clip come back as handles too
      museRef.set(null);
      nanoRef?.set(null);
      if ((isMuse() || isNano()) && task.files?.length) { // the pictures of a Muse clip / a Nano Banana picture come back (each into its own box)
        window.dola.queue.refs(task.id).then((refs) => {
          if (refs.length && isMuse()) museRef.set(refs);
          else if (refs.length && isNano()) nanoRef.set(refs);
        }).catch((err) => setWarn(t('Không lấy lại được ảnh tham chiếu: {why}', { why: err.message })));
      }
      return;
    }
    if (elementsUi) return; // the box shows elements, not loose images
    // the task's images come back as handles (the window never holds their paths); an image deleted since is left out
    window.dola.queue.refs(task.id).then((refs) => {
      files = refs;
      const dropped = fitRefs();
      paintRefs();
      const lost = refs.length < (task.files?.length || 0) ? tn(task.files.length - refs.length, '{n} ảnh tham chiếu của lệnh này không còn trên máy.', '{n} reference image of this prompt is no longer on this computer.', '{n} reference images of this prompt are no longer on this computer.') : '';
      if (dropped || lost) setWarn([dropped, lost].filter(Boolean).join(' '));
    }).catch((err) => setWarn(t('Không lấy lại được ảnh tham chiếu: {why}', { why: err.message })));
  }

  // "Tách skill" (the button in the detail of a finished video): the window asks the core, then hands the skill over through these. Each returns '' when it
  // is done, or a sentence the window shows (nothing was changed then).
  // Pro / Muse: the skill file the core made goes into the "Thêm skill" row of the form, in that mode (only when this core offers that mode and the row).
  function useExtractedFile({ mode, handle, name }) {
    if (!muse.modeOffered(mode, opts)) return ex.EXTRACT_TEXT.notOffered(ex.EXTRACT_TEXT.tabs[mode]);
    if (!skillUi || !sf.skillOffered(opts, window.dola)) return ex.EXTRACT_TEXT.noSkillRow;
    showView('create');
    skillUi.clear(); // an older pick or a Kho chip goes first (a Kho chip would cap the length at 15 s)
    Object.assign(prefs, { mode, museScript: false });
    fitToMode();
    paintPrefs(); // the skill row is drawn for the new mode (and a Kho chip of the old one is dropped) before the file is put in
    if (!skillUi.useFileSkill({ handle, name })) return ex.EXTRACT_TEXT.noSkillRow;
    setWarn(ex.EXTRACT_TEXT.fileDone, true);
    return '';
  }
  // Veo: it reads no skill, so the text is a prompt for one clip. Text already in the box is not thrown away on the first press (the same rule as "Tạo lại").
  function useExtractedVeo({ text }) {
    if (!muse.modeOffered('veo', opts)) return ex.EXTRACT_TEXT.notOffered(ex.EXTRACT_TEXT.tabs.veo);
    if (promptEl.value.trim() && armedRerun !== 'extract') {
      armedRerun = 'extract';
      return ex.EXTRACT_TEXT.veoReplace;
    }
    armedRerun = '';
    showView('create');
    prefs.mode = 'veo';
    fitToMode();
    paintPrefs();
    promptEl.value = text;
    promptEl.dispatchEvent(new Event('input', { bubbles: true }));
    setWarn(ex.EXTRACT_TEXT.veoWarn, true);
    return '';
  }
  async function openExtract(task) {
    const { openExtractPanel } = await import('./extract-skill-panel.js');
    openExtractPanel({
      task,
      dola: window.dola,
      closeParent: closeDetail,
      actions: {
        offered: (mode) => muse.modeOffered(mode, opts),
        useFile: useExtractedFile,
        useVeo: useExtractedVeo,
        canPublish: () => !!skillsUi?.canPublish(),
        publish: (prefill) => skillsUi.publish(prefill),
      },
    });
  }

  generateBtn.onclick = async () => {
    setWarn('');
    liveStage?.trigger(promptEl.value);
    setBusy(true);
    try {
      await elementsUi?.refresh().catch(() => {}); // a picture may have gone since the library was last read
      const stop = (!viaMuse() && elementsUi?.problems()) || []; // a prompt that mentions too many pictures is refused here, never cut (Muse reads no @element)
      if (stop.length) {
        setWarn(stop.join(' '));
        return;
      }
      const asNano = isNano(); // read once: the mode can be changed while the call is in flight
      const asMuse = viaMuse() && !asNano; // a Nano Banana picture is a Veo-mode task (image-models.js nanoTaskFields), not a Muse one
      const maxRefs = muse.museRefMax(opts);
      const picked = asMuse ? muse.clampRefs(museRef?.get() ?? [], maxRefs) : asNano ? muse.clampRefs(nanoRef?.get() ?? [], im.nanoRefMax(opts)) : null;
      const skill = skillUi?.get() ?? null; // read once: the mode can be changed while the call is in flight
      const storeSkill = skillUi?.store() ?? null; // a skill of the Kho skill tab (instead of a file); the same
      const r = await enqueueFromForm(asNano
        ? { promptText: promptEl.value, ...im.nanoTaskFields({ model: currentModel().id, ratio: prefs.ratio, files: picked.files, maxImages: im.nanoRefMax(opts) }) } // no skill: Nano Banana takes none
        : asMuse
        ? { promptText: promptEl.value, ratio: prefs.ratio, skillHandle: skill?.handle, storeSkill, ...muse.museTaskFields({ kind: isImage() ? 'image' : 'video', model: currentModel().id, museScript: prefs.museScript, duration: prefs.duration, files: picked.files, maxImages: maxRefs, range: opts.muse?.duration }) }
        : { promptText: promptEl.value, ratio: prefs.ratio, duration: prefs.duration, model: isVeo() ? prefs.veoModel : prefs.model, mode: prefs.mode, files, skillHandle: skill?.handle, storeSkill, ...(veoLengths() ? { resolution: vd.resolutionToSend(veoModelOf(prefs.veoModel), prefs) } : {}) }); // resolution: only a Veo model with a choice of resolutions (Omni); '' sends none
      if (!r.ok) {
        setWarn(r.message);
        return;
      }
      // Queued: the box is emptied, so a second press cannot queue the same batch again (every one costs a credit)
      promptEl.value = '';
      promptEl.dispatchEvent(new Event('input', { bubbles: true }));
      skillUi?.clear(); // like the box: the next batch picks its own skill
      setWarn(r.message, true);
      // The prompts are queued either way; without a ready account they wait for one.
      if (asNano) {
        const veoReady = await window.dola.accounts.list().then(im.veoReadyCount, () => 1); // a list that cannot be read is no reason to warn
        if (!veoReady) setWarn(muse.MUSE_NOTE.noAccountVeo);
      } else if (asMuse) {
        const museReady = await window.dola.accounts.list().then(muse.museReadyCount, () => 1); // a list that cannot be read is no reason to warn
        if (!museReady) setWarn(muse.MUSE_NOTE.noAccount);
      } else if (!readyCount()) setWarn(t('Chưa có acc sẵn sàng: lệnh sẽ chờ. Vào "Setup tài khoản" để thêm cookie.'));
    } finally {
      setBusy(false);
    }
  };

  opts = optionsFeed(await window.dola.options()); // model labels and tooltips come from the core: shown in the page's language
  Object.assign(prefs, { model: opts.defaults.model, veoModel: opts.veo?.defaults.model || '', imageModel: im.imageModelId('', opts), ratio: opts.defaults.ratio, duration: opts.duration.def });
  try {
    const saved = JSON.parse(localStorage.getItem(KEY.prefs) || '{}');
    if (opts.models.some((m) => m.id === saved.model)) prefs.model = saved.model;
    if (opts.veo?.models.some((m) => m.id === saved.veoModel)) prefs.veoModel = saved.veoModel; // the Veo row that was ticked
    if (saved.veoResolution === '360p' || saved.veoResolution === '720p') prefs.veoResolution = saved.veoResolution; // the Omni resolution that was ticked
    prefs.imageModel = im.imageModelId(saved.imageModel, opts); // the picture model that was ticked; one the core no longer offers falls back to Muse Image
    Object.assign(prefs, mg.savedMemory(saved, opts));
    if (opts.ratios.includes(saved.ratio)) prefs.ratio = saved.ratio;
    const keptDuration = muse.savedDuration(saved, opts); // tested against the range of the SAVED mode: 60 s of a Muse clip is not cut to 30
    if (keptDuration !== null) prefs.duration = keptDuration;
    if (typeof saved.museScript === 'boolean') prefs.museScript = saved.museScript;
    if (sk.isPeriod(saved.skillsPeriod)) prefs.skillsPeriod = saved.skillsPeriod; // the Tuần / Tháng / Tất cả of the Kho skill tab
  } catch { /* a damaged saved choice only costs the defaults */ }
  let savedMode;
  try { savedMode = JSON.parse(localStorage.getItem(KEY.prefs) || '{}').mode; } catch { /* the defaults */ }
  prefs.mode = mg.startMode(savedMode, opts); // a saved choice the core still offers is kept; no choice yet = Pro when the core offers it, else Nhanh + tiếng; a saved Nhanh moves to Nhanh + tiếng
  if (opts.muse || opts.image) { // only a core that offers Muse gets its pieces of the form
    museRef = mountMuseRef({ node: $('muse-ref'), say: (text) => setWarn(text), max: muse.museRefMax(opts) });
    museGuide = mountMuseGuide({ node: $('muse-guide'), promptEl });
  }
  if (im.nanoOffered(opts)) nanoRef = mountMuseRef({ node: $('nano-ref'), say: (text) => setWarn(text), max: im.nanoRefMax(opts), name: 'Nano Banana' }); // Nano Banana's pictures (up to opts.nano.maxImages)
  skillUi = mountSkill({ node: $('skill-row'), dola: window.dola, say: (text) => setWarn(text) });
  fitToMode();
  promptHint = mountPromptHint({ node: $('prompt-hint'), promptEl, editorEl: $('prompt-editor') });
  paintPrefs(); // also shows the mode button (hidden when the core lists no modes) and the header's "Tạo ảnh" (only when the core offers it)
  const hasElements = !!window.dola.elements;
  if (hasElements) promptEl.hidden = true; // the chip box draws it once the library is read (below)
  else paintRefs();
  showTab('hist');
  // The first screen is drawn: tell the core the web is up (without it the core shows its fallback page after 15 s). Called directly,
  // not from requestAnimationFrame: a window that is not drawn (minimized, covered, hidden) never runs one, and would get the fallback.
  window.dola.ready().catch((err) => console.error('dola.ready() failed', err));
  // "v<app version>" under the logo (window.dola.meta), web version in its tooltip. It resolves to the version shown ('' = none): then the label also gets "Có gì mới" (a failure there leaves the plain label).
  showVersion().catch(() => '').then(async (installed) => {
    if (!installed) return;
    const { initWhatsNew } = await import('./whats-new-ui.js');
    const tour = () => ({ settled: guideDecided && (!guideUi || !guideUi.isBlocked() || guideUi.isOpen()), open: !!guideUi?.isOpen() }); // settled = the tour has decided whether it asks its question
    whatsNew = initWhatsNew({ dola: window.dola, installed, tour });
  }).catch((err) => console.error('WhatsNew: it did not start', err));
  // After ready(): reading the library must never keep the core waiting (past 15 s it would show its fallback page).
  elementsUi = hasElements ? await initElements({ promptEl, limit: limitNow, picked: () => files.map((f) => f.handle) }).catch((err) => { console.error('Elements: the library UI did not start', err); return null; }) : null;
  if (hasElements && !elementsUi) {
    promptEl.hidden = false;
    paintRefs(); // the library could not be read: the old reference box
  }
  // Chỉ giữ lại 2 chức năng chính: Motion control và Tạo video (từ prompt) trên Google Flow
  try {
    const { initMotion } = await import('./motion-view.js');
    motionUi = await initMotion({ root: $('view-motion'), opts });
    $('nav-motion').hidden = !motionUi;
  } catch (err) {
    console.error('Motion control: the tab did not start', err);
  }
  liveStage = initLiveStage({
    onOpenLibrary: () => showView('library'),
    onOpenCreate: () => showView('create'),
    onOpenSaveDir: () => window.dola?.saveDir?.open?.(),
  });
  history = await initHistory({ screen: mg.screenForMode(prefs.mode, opts), mount: $('history'), mounts: { filters: $('mount-history-filters'), view: $('mount-history-view'), bar: $('mount-history-bar') }, onRerun: rerun, onExtract: undefined });
  await initSetup();
  initQueueUi();
  initSaveDirUi();
  initProxyUi();
  guideDecided = true;
  await moveLegacyCookies();
  if (motionUi) showView('motion');
}
