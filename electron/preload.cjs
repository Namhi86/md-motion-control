const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);
const on = (channel) => (fn) => {
  const h = (_e, payload) => fn(payload);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

// The whole surface of the control window (bridge v1). Contracts: the queue contract (task shape, createTaskStore) and
// plans/261014-1510-free-seedance-web-shell/phase-01-core-packaging.md. No token crosses it (the login is held by main), and the
// window never SENDS a file path: reference images are handles ({ handle, name }), media is shown through fs-media:// addresses
// (src/media-handles.js), folders are chosen by main's own dialog. (Task rows still CARRY their paths, for the "Đã lưu: …" line.)
// Test mode only (a throwaway profile + FS_FAKE_NO_MEDIA=1, the same pair main.js checks): window.dola.media is left out, as in a core that has no shared library (tests/e2e "web new, app old").
const NO_MEDIA = typeof process !== 'undefined' && process.env?.FS_FAKE_NO_MEDIA === '1' && !!process.env?.FS_USER_DATA;

const studioBoardsApi = {
  list: call('studioBoards:list'), // -> { ok, projects: [{ id, name, createdAt }], boards: [{ id, name, projectId, updatedAt, nodeCount?, thumb?, migratedFrom? }], lastBoardId } (thumb = an fs-media:// address, never a path)
  createProject: call('studioBoards:createProject'), // (name) -> { ok, project } | bad_name | too_many (100 projects)
  renameProject: call('studioBoards:renameProject'), // (id, name) -> { ok } | bad_name | not_found
  deleteProject: call('studioBoards:deleteProject'), // (id) -> { ok, deletedBoards } | not_found
  create: call('studioBoards:create'), // (projectId, name) -> { ok, board } | bad_name | not_found | too_many (500 boards) | write_failed
  rename: call('studioBoards:rename'), // (id, name) -> { ok } | bad_name | not_found
  duplicate: call('studioBoards:duplicate'), // (id) -> { ok, board }: the copy has NEW node and wire ids, only `completed` statuses, the name "<name> (bản sao)"
  move: call('studioBoards:move'), // (id, projectId) -> { ok } | not_found
  remove: call('studioBoards:remove'), // (id) -> { ok } | not_found; the pictures stay until the next start sweeps the unused ones
  importLegacy: call('studioBoards:importLegacy'), // (raw: the text of localStorage['qs.studio.board.v1']) -> { ok, board, sha } | { ok, board, already: true } (same text, same board) | bad_board | too_big
  load: call('studioBoards:load'), // (id) -> { ok, board: the board JSON, recovered?: true (the file was damaged, board = its .prev copy) } | not_found | damaged; remembers the board as lastBoardId
  save: call('studioBoards:save'), // (id, board, { allowEmpty? }) -> { ok, updatedAt } | not_found | bad_board | too_big (5 MB) | write_failed | emptied (the save would take the board from >0 nodes to 0)
  adoptMedia: call('studioBoards:adoptMedia'), // (handle) -> { ok, ref, url } for a png/jpg/webp (copied once, named by its content) | { ok, videoRef } for an mp4/mov (not copied) | bad_handle | not_media | too_big | write_failed
  mediaHandle: call('studioBoards:mediaHandle'), // (ref: a picture name or a videoRef) -> { ok, handle } the queue and the runners accept | gone | bad_ref
  onFlush: on('studio:flush'), // the app is leaving: save every board now, then call flushed() (the app waits 1 s at most)
  flushed: call('studioBoards:flushed'), // () -> { ok }: the answer to onFlush
};

const studioTemplatesApi = {
  list: call('studioTemplates:list'), // -> { ok, templates: [{ id, title, createdAt, nodeCount, costsVeo, thumbUrl?, shareCode?, shareId? }] } newest first
  get: call('studioTemplates:get'), // (id) -> { ok, template: { id, title, createdAt, nodes, wires, costsVeo, share? } } | not_found | damaged; nodes { type, position, data }, wires { from, to, source_handle?, target_handle? } (from/to are indexes)
  save: call('studioTemplates:save'), // ({ title, nodes, wires }) -> { ok, id, dropped } | bad_name | empty | too_many (> 100 nodes, > 300 wires or 200 templates) | too_big (2 MB) | write_failed; the core filters the graph, pictures stay as `ref`
  rename: call('studioTemplates:rename'), // (id, title) -> { ok } | bad_name | not_found
  remove: call('studioTemplates:remove'), // (id) -> { ok, share?: { id, code } } | not_found: the code stays valid on the server until it is revoked; the pictures stay until the next start sweeps them
};

contextBridge.exposeInMainWorld('dola', {
  meta: call('app:meta'), // -> { coreVersion, bridgeVersion: 1 }
  ready: call('app:ready'), // the web is up (without it, the fallback page comes after 15 s)
  relaunch: call('app:relaunch'),
  updater: {
    check: call('updater:check'),
    install: call('updater:install'),
    onProgress: on('updater:progress'),
  },
  auth: {
    state: call('auth:state'), // -> { status: 'signed-in' | 'signed-out' | 'pending', email?, name? }
    login: call('auth:login'),
    logout: call('auth:logout'),
    onChange: on('auth:changed'),
  },
  // Cổng kích hoạt ("Mở khoá": bình luận + chia sẻ mã MDMC_XXXXXX).
  // other channel answers { ok: false, error: 'gate_locked' } (or rejects with it) until the core's licence says unlocked, whatever this page does.
  gate: {
    state: call('gate:state'), // -> { ok, unlocked, exempt, code, status: 'none'|'issued'|'commented'|'completed'|'activated'|'rejected', reject_reason, post_url, zalo_url, fb_opened, zalo_joined } | { ok: false, error: 'signed_out'|'network'|…, ...last known }
    claim: call('gate:claim'), // gives the person a code (asking again returns the same one); same answer as state()
    checkNow: call('gate:checkNow'), // "Tôi đã làm xong": same answer; { ok: false, error: 'rate_limited', retry_after } when asked too soon
    openPost: call('gate:openPost'), // -> { ok } opens the post in the person's browser; the address is the core's own (the backend's post_url, Facebook https only)
    openZalo: call('gate:openZalo'), // mở link nhóm Zalo và đánh dấu đã bấm tham gia Zalo
    activateVip: call('gate:activateVip'), // kích hoạt bằng mã VIP
    deactivate: call('gate:deactivate'), // khóa lại công cụ / gỡ key hiện tại
    setConfig: call('gate:setConfig'), // cập nhật URL bài viết Facebook và URL nhóm Zalo
    onChanged: on('gate:changed'), // the gate (same fields as state()), whenever `unlocked` or the gate changed
  },
  // The admin screen (electron/admin-ipc.js; the web draws it only when options().admin === true). Gated like every feature; each call also answers
  // { ok: false, error: 'not_admin' } at once for any e-mail but the admin's, and the server decides in the end (its 403 is 'forbidden'). No token crosses it.
  admin: {
    gatePost: {
      get: call('admin:gatePostGet'), // (arg?: { app: 'voice' }) -> { ok, url, campaign_id } (url null while no unlock campaign is open; with { app: 'voice' } also app: 'voice') | { ok: false, error }; any other app is { ok: false, error: 'bad_app' }; a backend that does not know `app` is 'unsupported'
      set: call('admin:gatePostSet'), // (url, arg?: { app: 'voice' }) -> same; a bad address is { ok: false, error: 'bad_url' } and never leaves the machine; 'no_open_campaign' | 'post_unresolved' | 'forbidden' | 'network' | 'rate_limited' | 'server' | 'signed_out'
    },
    windowEmails: {
      get: call('admin:windowEmailsGet'), // -> { ok, emails }
      set: call('admin:windowEmailsSet'), // (emails: string[] <= 200) -> { ok, emails } (the server's cleaned list) | { ok: false, error: 'bad_emails', reason, index? }
    },
    logs: {
      list: call('admin:logsList'), // ({ email, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', limit?: 1..1000 }) -> { ok, rows: [{ id, ts, received_at, app_version, os, level, code, step, kind, acc_hash }], count } newest first | { ok: false, error: 'bad_email' | 'bad_from' | 'bad_to' | 'bad_range' | 'bad_limit' | 'user_not_found' | … }
    },
    chatText: call('admin:chatText'), // ({ accountId, convId: string of digits }) -> { ok, messages: [{ index, role, text, tools: [{ name, args }], ext }] } | { ok: false, error: 'not_admin' | 'bad_conv_id' | 'bad_account' | 'not_dola' | 'busy' | 'gate_locked' | …, note }: the TEXT of a chat of an idle Dola account (diagnostic, nothing is sent)
  },
  // The Kho skill (electron/skills-ipc.js; the web draws the tab only when options().skills === true). Gated like every feature. The window sends ids, text and handles; the
  // core makes the calls with the session's token and answers Cards (no body, no e-mail) and short error words. A failure is { ok: false, error, reason?, retryAfter?, canChangeAt? }
  // with error one of: signed_out | skills_disabled | server | rate_limited | forbidden | not_found | nickname_taken | too_soon | daily_limit | bad_input | bad_file | network | busy | not_admin | ...
  skills: {
    list: call('skills:list'), // (scope: 'system' | 'community', period: 'week' | 'month' | 'all') -> { ok, skills: [Card] }; Card = { id, title, description, modes, author: { kind, label }, reviewed, uses, uses_all, samples: [{ id, url (https), duration }], mine, created_at }
    // ({ title, description?, modes: ['pro'|'muse'], body | bodyHandle, bodyMuse? (admin + system only), system? (admin only), samples: [{ taskId } | { handle }] (1..3) })
    //   -> { ok, id, samples: { sent, failed: [{ index, error, reason? }] } }: the skill is made first, then the samples go one after the other; a sample that fails leaves the skill made (a draft until one sample is in)
    publish: call('skills:create'),
    addSamples: call('skills:addSamples'), // (skillId, samples: [{ taskId } | { handle }]) -> same answer; sends more samples to a skill already made (retry a failed one)
    pickSample: call('skills:pickSample'), // -> { handle, name, size } | null (native dialog, ONE .mp4 of at most 50 MB)
    onPublish: on('skills:publish'), // { phase: 'create' | 'upload' | 'done', index? } while publish / addSamples works
    nickname: {
      get: call('skills:nicknameGet'), // -> { ok, nickname, label, canChangeAt }
      set: call('skills:nicknameSet'), // (name 3..30 characters) -> { ok, nickname, label } | { ok: false, error: 'nickname_taken' | 'too_soon' (+canChangeAt) | 'bad_nickname' (+reason) | ... }
    },
    admin: { // admin only (the signed licence says `a: 1`): { ok: false, error: 'not_admin' } at once for anybody else; the server decides again ('forbidden')
      body: call('skills:adminBody'), // (id) -> { ok, id, title, body, body_muse } - the ONE place a body reaches the window
      remove: call('skills:adminRemove'), // (id) -> { ok }: removed for good, the sample files are deleted
      uses: call('skills:adminUses'), // (id) -> { ok, rows: [{ user_id, email, counted, voided, last_at }] }
      void: call('skills:adminVoid'), // (id, userId) -> { ok, voided }
    },
  },
  // The shared board templates (electron/templates-ipc.js; contracts.md section 5 of plans/261023-1846-studio-projects-templates-share): a template of "Mẫu của tôi" goes to the backend WITHOUT
  // its pictures and comes back to other people by a 10-character code. The window sends a template id, a code or a share id, never a graph; the core cleans the graph again both ways. Gated like
  // every feature. A failure is { ok: false, error, reason?, retryAfter? } with error one of: signed_out | gate_locked | templates_disabled | rate_limited | daily_limit | not_found | bad_title |
  // bad_graph (+reason empty | too_many | too_big) | bad_code | forbidden | network | server | not_admin | busy | damaged.
  templates: {
    share: call('templates:share'), // (templateId: a "Mẫu của tôi" id) -> { ok, id, code, dropped, reused? }: the code of the server's copy (a template that already has a live code gets it back, reused: true); one at a time ('busy')
    byCode: call('templates:byCode'), // (code: dashes / spaces / lower case are fine) -> { ok, template: { title, nodes, wires, costsVeo, mine, createdAt, dropped } }: a graph with no picture (a picture box is a hint), cleaned again here
    mine: call('templates:mine'), // -> { ok, templates: [{ id, title, code, status: 'active' | 'revoked', uses_all, created_at }] }: every code this person made, also of templates deleted or made on another machine
    revoke: call('templates:revoke'), // (id: the server's id of a code, from share / mine) -> { ok }: the code stops opening at once; asking twice is fine; the share is dropped from the template files
    admin: {
      remove: call('templates:adminRemove'), // (code) -> { ok }: the template stops opening for good; admin only
    },
  },
  openMdStudio: call('app:openMdStudio'),
  options: call('dola:options'),
  pickImages: call('dola:pickImages'), // -> [{ handle, name }]
  pickSkill: call('dola:pickSkill'), // -> { handle, name } | null (native dialog, ONE .md / .txt note <= 200 KB; null = cancelled or refused); the handle goes to queue.add as `skillHandle` (Pro and Muse only)
  accounts: {
    list: call('accounts:list'),
    add: call('accounts:add'),
    addGoogle: call('accounts:addGoogle'), // (text of email|pass|2fa lines, platform = 'seedance' | 'veo') -> { ok, added, updated, invalid }; Gmail accounts, ready at once
    addCredentials: call('accounts:addCredentials'), // (text of id|pass|2fa lines) -> { ok, added, updated, invalid }; the cookies come later
    addMuse: call('accounts:addMuse'), // (text of e-mail lines) -> { ok, added, updated, duplicates, invalid }; each waits for a login code, one window at a time
    addMuseCookie: call('accounts:addMuseCookie'), // (text of cookie lines) -> { ok, added, updated, duplicates, invalid, expired }; each cookie is checked first
    loginMuse: call('accounts:loginMuse'), // (id) -> { ok } | { ok: false, reason, note }; "log in again" on one Muse account
    registerElevenlabs: call('accounts:registerElevenlabs'), // (count?) -> { ok, started } | { ok: false, reason, note }; the app MAKES the accounts itself (a real Chrome, one at a time); count 1-20, default = the setting
    proxies: call('accounts:proxies'),
    remove: call('accounts:remove'),
    removeMany: call('accounts:removeMany'), // (ids) -> { ok, removed, skipped } | { ok: false, note }; one question for all
    legacy: call('accounts:legacy'),
    setEnabled: call('accounts:setEnabled'),
    onChange: on('accounts:changed'),
  },
  muse: {
    add: call('accounts:addMuse'),
    addCookie: call('accounts:addMuseCookie'),
    login: call('accounts:loginMuse'),
  },
  queue: {
    add: call('queue:add'),
    list: call('queue:list'),
    pause: call('queue:pause'),
    resume: call('queue:resume'),
    cancel: call('queue:cancel'),
    retry: call('queue:retry'),
    remove: call('queue:remove'),
    clearFinished: call('queue:clearFinished'),
    settings: call('queue:settings'),
    setSettings: call('queue:setSettings'),
    stats: call('queue:stats'),
    checkAccount: call('queue:checkAccount'),
    readCredits: call('queue:readCredits'), // (accountId) -> { ok, left } | { ok: false, note }; the Flow credits of a Veo account, read while it has no job (stored in its public view as `credits`)
    resetAccount: call('queue:resetAccount'), // acc -> Sẵn sàng ngay (bỏ nghỉ tạm / hết lượt / hỏng), refused while it runs a task
    refs: call('queue:refs'), // (taskId) -> [{ handle, name }]: the images of a task, for "Tạo lại"
    onChange: on('queue:changed'),
    onStats: on('queue:stats'),
  },
  library: {
    getDir: call('library:getDir'),
    chooseDir: call('library:chooseDir'),
    openDir: call('library:openDir'),
    reveal: call('library:reveal'),
    retrieve: call('library:retrieve'),
    // Chuyển tiếp clip sang studio
    sendToMdStudio: call('library:sendToMdStudio'),
    copyPrompt: call('library:copyPrompt'), // (taskId) -> { ok } | { ok: false, reason }; main copies the task's own prompt, the window sends no text
    onHandoff: on('library:handoff'), // { taskId, phase: 'hash' | 'upload' | 'finish' | 'open' }
  },
  elements: {
    list: call('elements:list'), // -> [{ id, name, handle, category, description, addedAt, imageName, missing, v }] (no path)
    pickImage: call('elements:pickImage'), // -> { handle, name } | null (native dialog); the handle goes to add / update
    pickImages: call('elements:pickImages'), // -> [{ handle, name }] (native dialog, several images at once; [] = cancelled)
    // Pictures dropped on the window: an ARRAY of File objects ([...event.dataTransfer.files]; a FileList does not cross the bridge, measured
    // 2026-10-15). The path of each is read HERE, in the preload, and goes straight to main;
    // the page only gets handles back, never a path (RT-10). A File made by the page itself has no path and is skipped.
    dropImages: (files) => {
      const paths = Array.from(files || []).slice(0, 200).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean);
      return ipcRenderer.invoke('elements:dropImages', paths); // -> { items: [{ handle, name }], skipped }
    },
    add: call('elements:add'), // ({ name, description?, category?, image: handle }) -> { ok, element } | { ok: false, reason, note }
    update: call('elements:update'), // ({ id, name?, description?, category?, image?: handle }) -> same; the @handle never changes
    remove: call('elements:remove'), // (ids) -> { ok, removed }
    onChange: on('elements:changed'),
  },
  // The shared library of the app (electron/media-ipc.js; the web draws "Thư viện" only when options().media.version >= 1 and media.list exists): every picture and video the app made or was given.
  // Contract: plans/261025-1900-studio-prompt-bar-and-library/contracts.md sections 4-5. Entries are AssetRefs (ref `lib:<id>` / `el:<id>`, fs-media addresses): NEVER a path. Every call can also answer { ok: false, error: 'gate_locked' }.
  ...(NO_MEDIA ? {} : {
    media: {
      list: call('media:list'), // ({ tab: 'all'|'uploads'|'created'|'favorites'|'elements', type?: 'image'|'video', q?, folderId?, pinned?, sort?: 'new'|'old', cursor?, limit?: 1..60 }) -> { ok, items: [AssetRef], next_cursor, counts: { uploads, created, favorites, elements, pinned }, user_data: 'ok'|'busy', scanning } | { ok: false, reason: 'bad_query'|'bad_cursor'|'failed' }
      favorite: call('media:favorite'), // (id, on: boolean) -> { ok } | { ok: false, reason: 'not_found'|'busy'|'bad_args' }
      pin: call('media:pin'), // (id, on: boolean) -> same
      import: call('media:import'), // ([handle], at most 50: from pickImages or dropFiles) -> { ok, items: [AssetRef], skipped }: a picture is copied into the app (named by its content), a video is not copied
      handleOf: call('media:handleOf'), // (ref: `lib:<id>` | `el:<id>`) -> { ok, handle, name, media_type, studio_name? } | { ok: false, reason: 'bad_ref'|'gone'|'busy' }: the entry as a handle the queue and the boards take
      // Files dropped on the window ([...event.dataTransfer.files]: an ARRAY of File objects). The path of each is read HERE, in the preload, and goes straight to main (like elements.dropImages); a File made by the page itself has no path and is skipped.
      dropFiles: (files) => {
        const paths = Array.from(files || []).slice(0, 200).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean);
        return ipcRenderer.invoke('media:dropFiles', paths); // -> { ok, items: [AssetRef], skipped }
      },
      // Names, folders and removal. A name is only what the card shows (the file keeps its name). Removal ALWAYS asks the person first (the web draws "Chỉ gỡ khỏi thư viện" / "Xoá cả file"); without { alsoDeleteFile: true } no file is touched.
      rename: call('media:rename'), // (id, name 1..120) -> { ok } | { ok: false, reason: 'bad_name'|'not_found'|'busy' }
      folders: call('media:folders'), // () -> { ok, folders: [{ id, name, createdAt }] }
      createFolder: call('media:createFolder'), // (name 1..80) -> { ok, folder } | bad_name | too_many (200) | busy
      renameFolder: call('media:renameFolder'), // (id, name) -> { ok } | bad_name | not_found | busy
      removeFolder: call('media:removeFolder'), // (id) -> { ok, moved }: its entries go back to "no folder"; no entry or file is removed
      moveToFolder: call('media:moveToFolder'), // (ids: at most 500, folderId | null) -> { ok, moved } | not_found | bad_args | busy
      remove: call('media:remove'), // (ids: at most 200, { alsoDeleteFile?: true }) -> { ok, removed, trashed, refused: [{ id, reason: 'in_use'|'outside_app'|'element'|'trash_failed'|'busy', note }] }: with the flag only a file inside the app's own folders and not in use goes to the system Trash (never unlinked)
      onChanged: on('media:changed'), // { reason: 'scan'|'task'|'edit' }, at most once a second
    },
  }),
  // The "Phân tích video" tab (electron/analyze-ipc.js): a video in, N prompts out. Like the elements, the window holds handles, never paths (RT-10).
  analyze: {
    pickVideo: call('analyze:pickVideo'), // -> { ok: true, handle, name, bytes, meta: { seconds, hasAudio, width, height } } | { ok: false, note } | null (native dialog; null = cancelled)
    // A video dropped on the window ([...event.dataTransfer.files]: an ARRAY of File objects, a FileList does not cross the bridge; only the first is used).
    // The path is read HERE, in the preload; the page gets a handle back (same answer as pickVideo). A File made by the page itself has no path and is skipped.
    dropVideo: (files) => {
      const paths = Array.from(files || []).slice(0, 1).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean);
      return ipcRenderer.invoke('analyze:dropVideo', paths);
    },
    run: call('analyze:run'), // ({ videoHandle, kind, dialogue, language, styles, styleText, products: [@handle], target: { mode, duration, ratio }, count 1-50 }) -> { ok: true, summary, prompts, accountLabel, ms, shortfall } | { ok: false, reason, note, prompts?, summary? }
    // "Tách skill" of the video detail (electron/extract-skill-handlers.js): the window names a finished task, a skill text it edited, or the skill to save; never a path.
    // ({ taskId }) -> { ok: true, skill: { title, description, pro, muse, veo, weak }, problems: string[], accountLabel, ms } | { ok: false, reason, note }: ONE AI Studio call (Gmail Veo account) with the video of that task;
    //   `problems` = what is still wrong after the one repair turn (the person edits it, it is not a failure). Shares the one-at-a-time slot of run (reason 'busy'); analyze.cancel() ends it; the stage lines come on onStage.
    extractSkill: call('analyze:extractSkill'),
    // ({ mode: 'pro' | 'muse', text }) -> { ok: true, handle, name } | { ok: false, reason: 'bad_input' | 'bad_length' | 'write_failed', note }: the text (pro 50-8000, muse 50-BODY_MUSE_MAX chars) as a skill note; pass `handle` to queue.add as `skillHandle`.
    useSkill: call('analyze:useSkill'),
    // ({ skill: { title, description, pro, muse, veo } }) -> { ok: true, file } | { ok: false, reason: 'cancelled' | 'bad_input' | 'bad_path' | 'write_failed', note? }: the save dialog, then one .md (## Pro / ## Muse / ## Veo).
    saveSkill: call('analyze:saveSkill'),
    cancel: call('analyze:cancel'), // -> { ok: true }
    info: call('analyze:info'), // -> { ok: true, total, usable, busy, limits }: the Gmail accounts that could read a video now, and the length each mode may have ({ fast: { min, max }, ... })
    onStage: on('analyze:stage'), // { text, account }
    onCards: on('analyze:cards'), // { summary, prompts, call, calls }: the prompts found so far (a count above 10 is asked in several calls)
  },
  // The "Flow Studio" board (electron/studio-ipc.js): finished tasks in, one picture handle or one joined mp4 out. Handles only, never paths (RT-10).
  studio: {
    handleOfTask: call('studio:handleOfTask'), // (taskId) -> { ok: true, handle, name } | { ok: false, reason: 'no_task'|'not_done'|'no_file'|'not_image', note }: a DONE task's saved picture as a reference-image handle for queue.add
    videoOfTask: call('studio:videoOfTask'), // (taskId) -> { ok: true, handle, name, seconds } | { ok: false, reason: 'no_task'|'not_done'|'no_file'|'not_video', note }: a DONE task's saved mp4/mov as a reference-video handle for queue.add (`refVideo`) (options().veo.refVideo)
    lastFrameOfTask: call('studio:lastFrameOfTask'), // (taskId) -> { ok: true, handle, name } | { ok: false, reason: 'no_task'|'not_done'|'no_file'|'not_video'|'no_ffmpeg'|'ffmpeg_failed', note }: the last picture of a DONE mp4 task as a reference-image handle (options().studio.frames)
    splitGrid: call('studio:splitGrid'), // ({ taskId | handle (exactly one), rows: 2..5, cols: 2..5 }) -> { ok: true, items: [{ handle, name }] row by row } | { ok: false, reason: 'bad_args'|'no_task'|'not_done'|'no_file'|'not_image'|'no_ffmpeg'|'ffmpeg_failed', note }: a picture cut into equal cells (options().studio.grid)
    // ({ taskIds: string[] (2..200, played in this order), trimSeconds?: 0 | 0.5..60 (keep the first N seconds of every clip), ratio?: '9:16' (default) | '16:9' | '1:1' | '3:4' | '4:3', name? })
    //   -> { ok: true, jobId, handle, name, bytes, seconds } | { ok: false, reason: 'bad_args'|'no_task'|'not_done'|'no_file'|'not_video'|'no_ffmpeg'|'busy'|'ffmpeg_failed'|'cancelled'|'dir_unwritable', note, jobId? }
    // One join at a time. The mp4 lands in the library folder; the handle plays as fs-media://pick/<handle>.
    stitch: call('studio:stitch'),
    cancelStitch: call('studio:cancelStitch'), // (jobId) -> { ok: true } | { ok: false, reason: 'no_job' }: stops the join, no partial file stays
    reveal: call('studio:reveal'), // (handle of a stitch result) -> { ok: true } | { ok: false, reason }: shows the file in the folder
    onProgress: on('studio:progress'), // { jobId, percent: 0..100, stage: 'prepare'|'encode'|'done' }
    // The "Trợ lý" node: ONE chat turn on AI Studio through a Gmail account of the app (a real Chrome, like the video analysis), with up to 10 pictures named by handle.
    // ({ text (1..20000 chars), imageHandles?: [handle of a png/jpg/webp picked in this session, <= 10], format: 'text'|'list', count?: 1..10 (format 'list' only, default 3) })
    //   -> { ok: true, text, items?: [string] (format 'list': at most `count`, fewer is still ok), accountLabel }
    //    | { ok: false, reason: 'bad_args'|'busy'|'limit'|'no_access'|'login_failed'|'needs_person'|'page_changed'|'upload_failed'|'no_answer'|'timeout'|'cancelled'|'needs_real_chrome'|'no_account'|'stopped'|'bad_task'|'failed', note }
    // One turn at a time (a second call answers 'busy'). The pictures are uploaded to the account's AI Studio chat, which is deleted once the answer is read.
    assist: call('studio:assist'),
    cancelAssist: call('studio:cancelAssist'), // -> { ok: true }: the running turn ends as 'cancelled'
    onAssistStage: on('studio:assistStage'), // { text, account }: what the turn is doing now and the short name of the account that holds the window
    boards: studioBoardsApi,
    templates: studioTemplatesApi,
  },
  studioBoards: studioBoardsApi,
  studioTemplates: studioTemplatesApi,
  proxies: {
    list: call('proxies:list'),
    add: call('proxies:add'),
    remove: call('proxies:remove'), // (id) -> { ok }; the accounts that hold this proxy lose it
    removeMany: call('proxies:removeMany'), // (ids) -> { ok, removed, cleared } | { ok: false, reason: 'bad_args' }; accounts using a removed proxy lose it
    check: call('proxies:check'),
    autoAssign: call('proxies:autoAssign'),
    reassign: call('proxies:reassign'), // (ids) -> { ok, changed, skippedBusy, kept, shared }; each ticked account moves to another proxy
    onChange: on('proxies:changed'),
  },
  // The ElevenLabs section of Setup (electron/elevenlabs-ipc.js). The accounts are made and kept on this machine; the window sees '***' for each, never an e-mail or password.
  elevenlabs: {
    settings: call('elevenlabs:settings'), // -> { proxyCount, regCount, captchaMode: 'self' | 'solver', captchaProvider, hasCaptchaKey }   (no proxy line, never the key)
    setSettings: call('elevenlabs:setSettings'), // ({ proxies?: text (empty = no proxy), regCount?: 1-20, captchaMode?, captchaProvider?, captchaKey?: one way, '' deletes }) -> { ok, proxyCount, regCount, captchaMode, captchaProvider, hasCaptchaKey } | { ok: false, reason, note }
    solveCaptcha: call('elevenlabs:solveCaptcha'), // (id) -> { ok } | { ok: false, reason, note }; the Chrome window of an account in status 'captcha' comes to the front
    captchaProviders: call('elevenlabs:captchaProviders'), // -> [{ id, label, owner, signupUrl, keyUrl, keyHint, docsUrl, freeNote, priceNote, warning, needsProxy, verified }]: the platforms that may be chosen
    testCaptchaKey: call('elevenlabs:testCaptchaKey'), // -> { ok: true, balance } | { ok: null, code: 'captcha_no_balance_api' } | { ok: false, code }; costs nothing
  },
  // The "Giọng nói" tab (electron/voice-ipc.js): text -> mp3 made by the backend (POST /v1/tts, through the signed-in session), cut and joined on THIS machine. The window never gets a path (handles only) or a token.
  voice: {
    gen: call('voice:gen'), // (also { ok: false, reason: 'voice_quota_locked', note, quota: { limit, used, remaining, post_url, voice_code } } when nothing could be made under the day's cap, and { ok: true, partial: true, quota, doneParts, totalParts (an SRT: doneCues, totalCues), ... } when the cap stopped it half way and the part that was made is saved) ({ blocks: [{ voice: { voice_id, name? }, text }], speed?: 0.5..2, model?, settings?, outputFormat?: 'mp3_44100_128', jobId?, folder? }) -> { ok: true, jobId, historyId, files: [{ url: fs-media://, seconds, bytes }], chars, seconds, parts, accounts: 0 } | { ok: false, reason, note, jobId? }; model / settings are accepted and ignored; no limit on the text, the core cuts and joins it; [nghỉ 1s] / [pause 1s] tags in the text become silence (never sent), speed and loudness are done on this machine
    cancel: call('voice:cancel'), // (jobId?) -> { ok: true } | { ok: false, reason: 'no_job' }: the job ends as cancelled, nothing is saved
    history: call('voice:history'), // ({ cursor?, q?, voice?, model?, date?: { mode: 'before'|'after', day }, pageSize? }) -> { history: [shape of elevenlabs.io history[] + audio_url (fs-media://), seconds, parts, bytes], has_more, next_cursor, total }
    quota: call('voice:quota'), // -> { accounts: 0, ready: 0, spent: 0, flagged: 0, creating: 0, dead: 0, chars: 0, largest: 0, unlimited: true }: numbers only (the CapCut engine has no accounts)
    voices: call('voice:voices'), // ({ language?: 2-5 letters, gender?, q?, limit?: 1..1000, offset? }) -> { total, items: [{ voice_id, name, language, gender, accent, use_case, description, preview_url (https), platform }], limit, offset } | { ok: false, reason, note }: the catalog of the backend
    languages: call('voice:languages'), // () -> { ok: true, total, items: [{ language: 2-5 lowercase letters, count }] } | { ok: false, reason, note }: the languages the backend catalog really has, most voices first. An older core has no such function
    onProgress: on('voice:progress'), // { jobId, phase: 'queued'|'generating'|'merging'|'done'|'failed', part, parts, charsDone, charsTotal }: numbers and a word, never a word of the text
    // Where the voices are saved (electron/voice-dir.js): its OWN folder, chosen like "Lưu video vào" and remembered apart from the video folder. The window sends no path: it only calls these three.
    dir: {
      get: call('voice:getDir'), // () -> the folder voices are saved in now (a string). Until the person picks one it is <the video folder>/Giọng nói and follows the video folder
      choose: call('voice:chooseDir'), // () -> { ok: true, dir } | { ok: false, canceled: true } | { ok: false, reason: 'dir_unwritable' | 'failed', note }: native folder dialog; older voices stay where they were made, only NEW ones go to the new folder
      open: call('voice:openDir'), // () -> { ok: true } | { ok: false, reason: 'open_failed' | 'failed', note }: opens that folder (made first when it is not there yet)
    },
    // The Voice share gate (electron/voice-gate-ipc.js): the server caps the characters a person may make per day until they comment + share the Voice post. The channels are OPEN (they work while the app gate is locked) and only DISPLAY
    // the state; the cap itself is decided by the server on every voice.gen call (reason 'voice_quota_locked', or a result with partial: true). An older backend answers { ok: false, error: 'unsupported' }.
    gate: {
      state: call('voice:gateState'), // () -> { ok, unlocked, exempt, code ('MDMC_voice_XXXX' | null), status: 'none'|'issued'|'commented'|'completed'|'activated'|'rejected', reject_reason, post_url, limit, used, remaining (null = no limit), gate: 'on'|'off'|null } | { ok: false, error: 'signed_out'|'network'|'rate_limited'|'server'|'unsupported'|…, ...last known }
      claim: call('voice:gateClaim'), // () -> the same; gives the person a code (asking again returns the same one)
      checkNow: call('voice:gateCheckNow'), // () -> the same ("Tôi đã làm xong"); { ok: false, error: 'rate_limited', retry_after } when asked too soon
      openPost: call('voice:gateOpenPost'), // () -> { ok } opens the Voice post in the person's browser; the address is the core's own (the backend's post_url, Facebook https only)
      onChanged: on('voice:gateChanged'), // { why: 'claim'|'checkNow'|'quota' }: the task moved or the day's cap was hit; ask state() again
    },
  },
  // The "Motion control" tab (electron/motion-ipc.js): a long video cut into clips of 4-10 s, each made on Google Flow (Omni) or Meta Muse AI from the person's picture saying the same words, joined into one film. The window holds handles only (never a path).
  motion: {
    pickVideo: call('motion:pickVideo'), // () -> null (cancelled) | { ok: true, handle, name, bytes } | { ok: false, note }: a video of ANY length (the video analysis stops at 60 s; Motion control reads it with ffmpeg)
    dropVideo: (files) => { // a file dropped on the tab -> the same answer; main checks the path again
      const paths = Array.from(files || []).slice(0, 1).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ''; } }).filter(Boolean);
      return ipcRenderer.invoke('motion:dropVideo', paths);
    },
    prepare: call('motion:prepare'), // ({ videoHandle, translateTo? }) -> { ok: true, prepareId, duration, hasAudio, width, height, segments: [{ i, start, end, seconds, step, lostSeconds, stretch, cutAt, has_speech, text, translated, lang, gender }], voice, price: { perSegment, total }, snaps: { pauses: [s...], scenes: [s...] } (where a cut mark snaps to), transcriptError? } | { ok: false, reason, note }; no credit is spent
    replan: call('motion:replan'), // ({ prepareId, cuts: [seconds...] (strictly increasing, 0 < t < duration, <= 600), lines?: [{ start, end, text, translated? }] }) -> { ok: true, segments: [as in prepare], price, transcriptError? } | { ok: false, reason: 'bad_args'|'no_prepare'|'busy'|'bad_piece'|'cancelled'|'failed', note, at? }: rebuilds the plan on the person's cut marks (pieces of 4..10.5 s); a line that matches a piece is kept, new pieces are transcribed; no credit is spent
    start: call('motion:start'), // ({ prepareId, imageHandles (1..5), engine?: 'veo-ref'|'muse', lines?: [{ i, text, translated? }], resolution?: '360p'|'720p', ratio?: 'auto'|'9:16'|'16:9', voiceText?, subject?, scene?, language?, name? }) -> { ok: true, jobId, credits: { perClip, clips, total } } | { ok: false, reason, note }
    retry: call('motion:retry'), // ({ jobId, i }) -> { ok: true } | { ok: false, reason, note }: the person's own new request for ONE clip that failed or was cancelled (it can spend its credits again)
    cancel: call('motion:cancel'), // () -> { ok: true } | { ok: false, reason: 'no_job' }: reading the video stops at once; a running film stops its waiting clips (a clip already at Flow finishes and stays in the queue)
    status: call('motion:status'), // () -> null | { jobId, done, clips: [{ i, state, reason, note }], credits, result: { url (fs-media://), name, seconds } | { reason, note } | null }
    close: call('motion:close'), // () -> { ok: true } | { ok: false, reason: 'busy' }: forgets a finished film and its temp files
    session: call('motion:session'), // () -> null | { ok: true, prepareId, duration, hasAudio, width, height, envelope, snaps, segments, voice, price, video: { handle, name, bytes }, images: [{ handle, name }], choices, selected, transcriptError?, restored: true } | { ok: false, dropped: 'video_changed'|'video_missing', note }: the work kept by the core (page reload: memory; app restart: file); fresh handles, never a path; a film is motion.status's
    saveDraft: call('motion:saveDraft'), // ({ prepareId, lines?: [{ start, end, text, translated? }], choices?: { resolution, ratio, language, voiceText, subject?, scene?, engine? }, imageHandles?: [handle], selected? }) -> { ok: true } | { ok: false, reason: 'no_prepare'|'bad_args', note }: debounce ~600 ms; keeps the typed words so a reload or a later replan brings them back; no ffmpeg, no AI, no credit
    discardSession: call('motion:discardSession'), // () -> { ok: true } | { ok: false, reason: 'busy' }: forgets the kept plan and its file (the person changes the video / starts over)
    // Where the finished films are saved (electron/motion-dir.js): its OWN folder, remembered apart from the video folder. The window sends no path: it only calls these three.
    dir: {
      get: call('motion:getDir'), // () -> the folder films are saved in now (a string). Until the person picks one it is <the video folder>/Motion control and follows the video folder
      choose: call('motion:chooseDir'), // () -> { ok: true, dir } | { ok: false, canceled: true } | { ok: false, reason: 'dir_unwritable' | 'failed', note }: native folder dialog; films already made stay where they are, only NEW ones go to the new folder
      open: call('motion:openDir'), // () -> { ok: true } | { ok: false, reason: 'open_failed' | 'failed', note }: opens that folder (made first when it is not there yet)
    },
    onProgress: on('motion:progress'), // { stage: 'prepare', text } | { jobId, stage: 'start'|'join'|'done'|'ended', clips: [{ i, state, reason, note }], credits, result? }: states 'waiting'|'cutting'|'queued'|'making'|'done'|'failed'|'cancelled'; never a path
  },
  // The window kind of the whole app: 'electron' (fake Chrome) or 'chrome' (the real one). electron/browser-ipc.js
  browser: { get: call('browser:get'), set: call('browser:set') }, // get -> { mode, chromeInstalled, busy, ignored, fellBack }; set(mode) -> { ok, mode } | { ok: false, reason, note }
  update: {
    check: call('update:check'),
    onStatus: on('update:status'),
  },
});
