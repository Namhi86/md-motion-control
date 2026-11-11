// Trung tâm Sân khấu AI & Quản lý Phiên bản MD MEDIA
// - Chỉ chạy hiệu ứng đồ họa khi BẮT ĐẦU LÀM VIDEO (Create Video hoặc Motion Control).
// - Mô phỏng chính xác tiến độ thực tế đang làm (đồng bộ trực tiếp với hàng đợi & các đoạn clip của Google Flow Veo).
// - Tích hợp hệ thống 10 Luồng Tạo Video Hàng Ngang & Sân Khấu Kết Xuất AI Thu Nhỏ.
import { enqueueFromForm } from './queue-ui.js';
import { mediaUrl } from './shared/media-handles.js';
import { splitPrompts } from './shared/prompt-split.js';

const CREATE_STEPS = [
  { code: '01', letter: 'A', cls: 'md-mc-step--a', name: 'Chuẩn bị & Xếp hàng', desc: 'Kiểm tra tài khoản & khởi tạo lệnh' },
  { code: '02', letter: 'B', cls: 'md-mc-step--b', name: 'Kết nối Google Flow', desc: 'Mở phiên Veo & đồng bộ cấu hình' },
  { code: '03', letter: 'C', cls: 'md-mc-step--c', name: 'Gửi Kịch bản & Ảnh', desc: 'Tải nguyên liệu & phân tích Prompt' },
  { code: '04', letter: 'D', cls: 'md-mc-step--d', name: 'Kết xuất Video Veo', desc: 'Tổng hợp khung hình AI trên Flow' },
  { code: '05', letter: 'E', cls: 'md-mc-step--e', name: 'Tải về & Lưu file', desc: 'Lưu tự động vào Thư viện máy tính' },
];

const MC_STEPS = [
  { code: 'MỤC A · 01', name: 'Phân tích & Cắt đoạn' },
  { code: 'MỤC B · 02', name: 'Khóa Nhân vật AI' },
  { code: 'MỤC C · 03', name: 'Kết xuất Google Flow' },
  { code: 'MỤC D · 04', name: 'Ghép Phim Hoàn chỉnh' },
];

const CREATE_STREAMS_KEY = 'md_create_10streams_v1';
const TOTAL_CREATE_STREAMS = 10;

export function initLiveStage({ onOpenLibrary, onOpenCreate, onOpenSaveDir } = {}) {
  // Trạng thái thực tế của mục Tạo Video (từ Prompt)
  let createSubmitting = false;
  let createTasks = [];
  let createRunning = 0;
  let createQueued = 0;
  let createDone = 0;
  let createFailed = 0;
  let createBatchStart = 0;
  let lastActivePrompt = '';

  // Trạng thái thực tế của mục Motion Control
  let mcState = {
    phase: 'idle', // 'idle' | 'prepare' | 'start'
    hasPlan: false,
    segmentCount: 0,
    job: false,
    ended: false,
    clips: [],
    result: null,
    stageText: '',
  };
  let mcPhaseStart = 0;
  let mcClipStart = 0;
  let lastMakingKey = '';
  let burstEnergy = 0;

  // 1. Thanh tiến độ thực tế dưới Header (chỉ hiện khi thực sự đang làm video)
  const headerEl = document.querySelector('.qm-header');
  const liveBar = document.createElement('div');
  liveBar.id = 'md-live-bar';
  liveBar.className = 'md-live-bar';
  liveBar.hidden = true;
  liveBar.innerHTML = `
    <div class="md-live-bar__laser"></div>
    <div class="md-live-bar__left">
      <span class="md-live-bar__orb" aria-hidden="true"><i></i><i></i></span>
      <span class="md-live-bar__badge" id="md-live-bar-badge">ĐANG KẾT XUẤT VIDEO</span>
      <span class="md-live-bar__msg" id="md-live-bar-msg">Đang xử lý trên Google Flow (Veo)...</span>
    </div>
    <div class="md-live-bar__right">
      <div class="md-live-bar__eq" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
      </div>
      <span class="md-live-bar__pct" id="md-live-bar-pct">0%</span>
      <span class="md-live-bar__timer" id="md-live-bar-timer">00:00</span>
      <button type="button" class="md-live-bar__btn" id="md-live-bar-stage">Tạo video</button>
      <button type="button" class="md-live-bar__btn md-live-bar__btn--lib" id="md-live-bar-lib">Thư viện (<b id="md-live-bar-count">0</b>)</button>
    </div>
  `;
  if (headerEl && headerEl.parentNode) {
    headerEl.insertAdjacentElement('afterend', liveBar);
  }

  // 2. Thanh Quy Trình Xử Lý Video ở dưới cùng màn hình Tạo video (#cv-stage — Hiển thị giống hệt bên Motion Control, bỏ hoàn toàn Ảnh 4)
  const stageRoot = document.getElementById('cv-stage');
  if (stageRoot) {
    stageRoot.classList.add('cm-bottom-dock');
    stageRoot.innerHTML = `
      <div class="cm-flow-dock md-create-flow-dock">
        <div class="cm-flow-center">
          <div class="md-mc-steps" id="md-stage-pipeline">
            ${CREATE_STEPS.map((s, idx) => `
              <div class="md-mc-step ${s.cls}" data-step="${idx}">
                <canvas class="md-mc-box-canvas"></canvas>
                <span class="md-mc-step-name">${s.name}</span>
                <div class="md-mc-step-bar"><i style="width: 0%"></i></div>
              </div>
              ${idx < CREATE_STEPS.length - 1 ? `
                <div class="md-mc-arrow-bridge" aria-hidden="true">
                  <canvas class="md-mc-bridge-canvas" data-bridge="${idx}"></canvas>
                </div>
              ` : ''}
            `).join('')}
          </div>
          <div class="cm-flow-overall-track">
            <i id="md-create-overall-fill" style="width: 0%"></i>
          </div>
        </div>

        <div class="cm-flow-right">
          <div class="cm-flow-prog-box">
            <div class="cm-flow-prog-head">
              <span>Tiến độ:</span>
              <b id="md-hud-pct">0%</b>
            </div>
            <div class="cm-flow-prog-bar">
              <i id="md-create-mini-fill" style="width: 0%"></i>
            </div>
          </div>
          <div class="cm-side-foot cm-command-actions">
            <button type="button" class="an-btn an-btn--main cm-main-btn" id="md-cs-run-all">
              <span class="cm-btn-main-top">✨ ▷ Tạo video</span>
              <span class="cm-btn-main-sub" id="md-foot-queue-summary">Tất cả 10 luồng</span>
            </button>
            <button type="button" id="md-stage-go-lib" hidden></button>
          </div>
        </div>
      </div>
    `;
  }

  // 2.5. Khởi tạo Thanh Điều Khiển Trên Cùng + Hệ thống 10 Luồng Tạo Video Hàng Ngang (#md-create-streams-wrap) trong #view-create
  const CREATE_MODELS = [
    {
      id: 'omni-1-2-flash',
      label: 'Omni 1.2 Flash',
      badge: '✨ MỚI',
      desc: 'Bản nâng cấp mới nhất · Tối đa 7 ảnh · Thời lượng 4s/6s/8s/10s (12cr)',
      maxImages: 7,
      durations: [4, 6, 8, 10],
    },
    {
      id: 'omni-1-1-flash',
      label: 'Omni 1.1 Flash',
      badge: '⚡ OMNI',
      desc: 'Model thay thế Veo 3.1 · Tối đa 7 ảnh · Thời lượng 4s/6s/8s/10s (12cr)',
      maxImages: 7,
      durations: [4, 6, 8, 10],
    },
    {
      id: 'veo-3-1-lite',
      label: 'Veo 3.1 Lite',
      badge: '10 CR',
      desc: 'Tiết kiệm credit nhất · Tối đa 3 ảnh · Thời lượng 8s',
      maxImages: 3,
      durations: [8],
    },
    {
      id: 'veo-3-1-fast',
      label: 'Veo 3.1 Fast',
      badge: '20 CR',
      desc: 'Tốc độ kết xuất nhanh · Tối đa 3 ảnh · Thời lượng 8s',
      maxImages: 3,
      durations: [8],
    },
    {
      id: 'veo-3-1-quality',
      label: 'Veo 3.1 Quality',
      badge: '100 CR',
      desc: 'Chất lượng cao nhất · Tối đa 3 ảnh · Thời lượng 8s',
      maxImages: 3,
      durations: [8],
    },
  ];
  const getCreateModelSpec = (id) =>
    CREATE_MODELS.find((m) => m.id === id) || CREATE_MODELS[0];

  const viewCreate = document.getElementById('view-create');
  const origCol = viewCreate?.querySelector('.cv-col');
  let defaultVeoModelId = 'omni-1-2-flash';
  window.dola?.options?.().then((o) => {
    if (o?.veo?.defaults?.model) defaultVeoModelId = o.veo.defaults.model;
    else if (o?.veo?.models?.[0]?.id) defaultVeoModelId = o.veo.models[0].id;
  }).catch(() => {});

  if (viewCreate && stageRoot) {
    // Thêm Thanh Điều Khiển Trên Cùng (.md-create-top-bar) đồng bộ với Motion Control
    let createTopBar = document.getElementById('md-create-top-bar');
    if (!createTopBar) {
      createTopBar = document.createElement('div');
      createTopBar.id = 'md-create-top-bar';
      createTopBar.className = 'cm-top cm-top-stepper md-create-top-bar';
      createTopBar.innerHTML = `
        <div class="cm-pills" role="tablist">
          <span class="cm-pill cm-pill--done"><span class="cm-pill-n">✓</span><span class="cm-pill-t">Nguyên liệu &amp; Kịch bản</span></span>
          <span class="cm-step-arrow" aria-hidden="true">→</span>
          <span class="cm-pill cm-pill--on"><span class="cm-pill-n">2</span><span class="cm-pill-t" id="md-create-step2-label">10 Luồng Ngang</span></span>
          <span class="cm-step-arrow" aria-hidden="true">→</span>
          <span class="cm-pill"><span class="cm-pill-n">3</span><span class="cm-pill-t">Tạo video</span></span>
          <span class="cm-step-arrow" aria-hidden="true">→</span>
          <span class="cm-pill"><span class="cm-pill-n">4</span><span class="cm-pill-t">Kết quả</span></span>
        </div>
        <div class="cm-top-right-tools">
          <div class="cm-stream-picker-wrap" id="md-cs-count-switch">
            <button type="button" class="cm-default-cfg-btn cm-stream-picker-btn" id="md-cs-picker-btn" title="Bấm để chọn số luồng và bố cục hiển thị">
              <span id="md-cs-picker-label">⚡ 10 Hàng ngang</span>
              <span class="cm-picker-caret">▾</span>
            </button>
            <div class="cm-stream-picker-menu" id="md-cs-picker-menu" hidden>
              <button type="button" class="cm-stream-picker-opt" data-cols="1" data-layout="rows" data-label="⚡ 1 Luồng" data-step="1 Luồng">
                <span class="cm-picker-chk">✓</span>
                <span>⚡ 1 Luồng</span>
              </button>
              <button type="button" class="cm-stream-picker-opt" data-cols="2" data-layout="rows" data-label="⚡ 2 Luồng" data-step="2 Luồng">
                <span class="cm-picker-chk">✓</span>
                <span>⚡ 2 Luồng</span>
              </button>
              <button type="button" class="cm-stream-picker-opt" data-cols="3" data-layout="rows" data-label="⚡ 3 Luồng" data-step="3 Luồng">
                <span class="cm-picker-chk">✓</span>
                <span>⚡ 3 Luồng</span>
              </button>
              <button type="button" class="cm-stream-picker-opt" data-cols="5" data-layout="rows" data-label="⚡ 5 Luồng" data-step="5 Luồng">
                <span class="cm-picker-chk">✓</span>
                <span>⚡ 5 Luồng</span>
              </button>
              <button type="button" class="cm-stream-picker-opt cm-stream-picker-opt--on" data-cols="10" data-layout="rows" data-label="⚡ 10 Hàng ngang" data-step="10 Luồng Ngang">
                <span class="cm-picker-chk">✓</span>
                <span>⚡ 10 Hàng ngang</span>
              </button>
              <button type="button" class="cm-stream-picker-opt" data-cols="10" data-layout="cols" data-label="▥ 10 Cột" data-step="10 Cột">
                <span class="cm-picker-chk">✓</span>
                <span>▥ 10 Cột</span>
              </button>
            </div>
          </div>
          <button type="button" class="cm-default-cfg-btn" id="md-stage-open-cfg" title="Cài đặt mặc định Model AI, số luồng chạy, chia tài khoản & thư mục lưu video">
            <span class="cm-dcfg-ico">⚙️</span>
            <span>Cài đặt mặc định</span>
          </button>
          <button type="button" class="cm-default-cfg-btn" id="md-stage-open-folder" title="Mở thư mục lưu video trên máy tính">
            <span>📂 Mở thư mục</span>
          </button>
          <button type="button" class="cm-default-cfg-btn" id="md-stage-open-lib">
            <span>🎬 Thư viện</span>
            <b id="md-stage-lib-badge">0</b>
          </button>
        </div>
      `;
      viewCreate.insertBefore(createTopBar, viewCreate.firstChild);
    }

    // Biến .cv-col gốc thành Hộp thoại Cài đặt chung & Thư mục lưu cho cả 10 luồng
    if (origCol) {
      origCol.classList.add('md-cv-cfg-modal');
      origCol.hidden = true;
      const leftAside = origCol.querySelector('.cv-left');
      if (leftAside && !leftAside.querySelector('.md-cv-cfg-head')) {
        const cfgHead = document.createElement('div');
        cfgHead.className = 'md-cv-cfg-head';
        cfgHead.innerHTML = `
          <div class="md-cv-cfg-title">
            <span>⚙️</span>
            <b>CÀI ĐẶT CHUNG GOOGLE FLOW (VEO) &amp; THƯ MỤC LƯU</b>
          </div>
          <button type="button" class="md-cv-cfg-close" id="md-cv-cfg-close">✕ Đóng</button>
        `;
        leftAside.insertBefore(cfgHead, leftAside.firstChild);
      }
      origCol.addEventListener('click', (ev) => {
        if (ev.target === origCol) origCol.hidden = true;
      });
      document.getElementById('md-cv-cfg-close')?.addEventListener('click', () => {
        origCol.hidden = true;
      });
      document.getElementById('md-stage-open-cfg')?.addEventListener('click', () => {
        origCol.hidden = !origCol.hidden;
      });
    }

    // Đọc dữ liệu đã lưu của 10 luồng
    let savedStreams = {};
    try {
      savedStreams = JSON.parse(localStorage.getItem(CREATE_STREAMS_KEY) || '{}') || {};
    } catch {
      savedStreams = {};
    }
    const saveStreamsState = () => {
      try {
        const payload = {};
        streamStates.forEach((st) => {
          payload[st.idx] = {
            prompt: st.prompt,
            model: st.model,
            ratio: st.ratio,
            duration: st.duration,
          };
        });
        localStorage.setItem(CREATE_STREAMS_KEY, JSON.stringify(payload));
      } catch {}
    };

    const streamsWrap = document.createElement('section');
    streamsWrap.id = 'md-create-streams-wrap';
    streamsWrap.className = 'md-create-streams-wrap';
    streamsWrap.dataset.cols = '10';
    streamsWrap.dataset.layout = 'rows';

    const streamsGrid = document.createElement('div');
    streamsGrid.id = 'md-create-streams-grid';
    streamsGrid.className = 'md-create-streams-grid';
    streamsWrap.appendChild(streamsGrid);

    // Chèn #md-create-streams-wrap ở giữa và đưa #cv-stage xuống đáy màn hình (giống hệt Motion Control)
    stageRoot.insertAdjacentElement('beforebegin', streamsWrap);

    const origPromptEl = document.getElementById('prompt');
    const defaultPrompt1 = origPromptEl?.value || 'A red apple sitting on a wooden table, slow camera push-in, natural daylight.';

    const streamStates = [];

    // Menu nổi chọn nhanh Model AI cho từng luồng hoặc cả 10 luồng
    let activeModelPop = null;
    const closeModelPop = () => {
      if (activeModelPop) {
        activeModelPop.remove();
        activeModelPop = null;
      }
    };
    document.addEventListener('pointerdown', (ev) => {
      if (activeModelPop && !activeModelPop.contains(ev.target) && !ev.target.closest('.md-cs-model-pill, #md-cs-top-model-btn')) {
        closeModelPop();
      }
    });

    const applyModelToAllStreams = (modelId) => {
      const spec = getCreateModelSpec(modelId);
      streamStates.forEach((s) => s.setModel?.(spec.id));
      const topSummary = document.getElementById('md-cs-top-cfg-summary');
      if (topSummary) topSummary.textContent = `${spec.label} · Lưu file`;
      try {
        const prefsObj = JSON.parse(localStorage.getItem('prefs') || '{}') || {};
        prefsObj.mode = 'veo';
        prefsObj.veoModel = spec.id;
        localStorage.setItem('prefs', JSON.stringify(prefsObj));
        const mainModelVal = document.getElementById('model-val');
        if (mainModelVal) mainModelVal.textContent = spec.label;
      } catch {}
      saveStreamsState();
    };

    const openStreamModelMenu = (anchorBtn, targetStream = null) => {
      closeModelPop();
      const currentId = targetStream ? targetStream.model : (streamStates[0]?.model || 'omni-1-2-flash');
      const pop = document.createElement('div');
      pop.className = 'md-cs-model-pop';
      pop.innerHTML = `
        <div class="md-cs-model-pop-head">
          <span>🤖 Chọn Model Google Flow</span>
          <small>${targetStream ? `Luồng ${targetStream.code}` : 'Tất cả 10 luồng'}</small>
        </div>
        <div class="md-cs-model-pop-list">
          ${CREATE_MODELS.map((m) => `
            <button type="button" class="md-cs-model-opt${m.id === currentId ? ' md-cs-model-opt--on' : ''}" data-model-id="${m.id}">
              <div class="md-cs-model-opt-top">
                <b>${m.label}</b>
                <span class="md-cs-model-badge">${m.badge}</span>
              </div>
              <small>${m.desc}</small>
            </button>
          `).join('')}
        </div>
        ${targetStream ? `
          <div class="md-cs-model-pop-foot">
            <button type="button" class="md-cs-model-apply-all" id="md-cs-pop-apply-all">
              ⚡ Áp dụng model đang chọn cho cả 10 luồng
            </button>
          </div>
        ` : ''}
      `;
      document.body.appendChild(pop);
      activeModelPop = pop;

      const rect = anchorBtn.getBoundingClientRect();
      const popW = 310;
      const left = Math.max(12, Math.min(window.innerWidth - popW - 12, rect.right - popW));
      const spaceBelow = window.innerHeight - rect.bottom;
      const top = spaceBelow < 320 ? Math.max(12, rect.top - pop.offsetHeight - 6) : rect.bottom + 6;
      pop.style.left = `${left}px`;
      pop.style.top = `${top}px`;

      pop.querySelectorAll('.md-cs-model-opt').forEach((optBtn) => {
        optBtn.addEventListener('click', () => {
          const pickedId = optBtn.dataset.modelId;
          if (!pickedId) return;
          if (targetStream) {
            targetStream.setModel(pickedId);
            saveStreamsState();
          } else {
            applyModelToAllStreams(pickedId);
          }
          closeModelPop();
        });
      });

      pop.querySelector('#md-cs-pop-apply-all')?.addEventListener('click', () => {
        if (targetStream) {
          applyModelToAllStreams(targetStream.model);
        }
        closeModelPop();
      });
    };

    // Khi người dùng đổi Model trong hộp "⚙️ Cài đặt mặc định" (#model-val thay đổi), tự động đồng bộ sang tất cả 10 luồng
    const mainModelValEl = document.getElementById('model-val');
    if (mainModelValEl) {
      const obs = new MutationObserver(() => {
        const labelTxt = (mainModelValEl.textContent || '').trim();
        const found = CREATE_MODELS.find((m) => m.label === labelTxt);
        if (found) {
          streamStates.forEach((s) => s.setModel?.(found.id));
          const topSummary = document.getElementById('md-cs-top-cfg-summary');
          if (topSummary) topSummary.textContent = `${found.label} · Lưu file`;
          saveStreamsState();
        }
      });
      obs.observe(mainModelValEl, { childList: true, characterData: true, subtree: true });
    }

    for (let i = 1; i <= TOTAL_CREATE_STREAMS; i++) {
      const code = String(i).padStart(2, '0');
      const saved = savedStreams[i] || {};
      const initModelSpec = getCreateModelSpec(saved.model || 'omni-1-2-flash');
      const st = {
        idx: i,
        code,
        checked: true,
        prompt: saved.prompt !== undefined ? saved.prompt : (i === 1 ? defaultPrompt1 : ''),
        model: initModelSpec.id,
        ratio: saved.ratio || '9:16',
        duration: initModelSpec.durations.includes(Number(saved.duration)) ? Number(saved.duration) : 8,
        files: [], // [{ handle, name }]
        busy: false,
      };
      streamStates.push(st);

      const card = document.createElement('article');
      card.className = 'md-cs-card';
      card.dataset.stream = String(i);
      st.card = card;
      card.innerHTML = `
        <header class="md-cs-head">
          <label class="md-cs-head-left cm-stream-pick" title="Tích chọn luồng này để chạy cùng lúc">
            <input type="checkbox" class="stp-chk md-cs-chk" id="md-cs-chk-${i}" data-stream="${i}" checked />
            <span class="md-cs-badge">⚡ LUỒNG ${code}</span>
            <span class="md-cs-engine">FLOW VEO</span>
          </label>
          <span class="md-cs-status" id="md-cs-status-${i}">Sẵn sàng</span>
        </header>

        <div class="md-cs-body">
          <div class="md-cs-ref-box" id="md-cs-ref-${i}">
            <button type="button" class="md-cs-ref-add" id="md-cs-ref-btn-${i}" title="Thêm tối đa ${initModelSpec.maxImages} ảnh tham chiếu nhân vật, bối cảnh, đạo cụ cho Luồng ${code}">
              <span class="md-cs-ref-ico">🖼️</span>
              <span class="md-cs-ref-txt" id="md-cs-ref-txt-${i}">+ Thêm phần tử / Ảnh (0/${initModelSpec.maxImages})</span>
            </button>
            <div class="md-cs-ref-list" id="md-cs-ref-list-${i}" hidden></div>
          </div>

          <div class="md-cs-prompt-box">
            <div class="md-cs-prompt-top">
              <span class="md-cs-label">Mô tả video</span>
              <span class="md-cs-cmd-count" id="md-cs-cnt-${i}">0 lệnh</span>
            </div>
            <textarea class="md-cs-ta" id="md-cs-ta-${i}" placeholder="Nhập mô tả cảnh quay cho Luồng ${code}... (Cách dòng trống để tách nhiều lệnh)"></textarea>
            <div class="md-cs-prompt-foot">
              <label class="md-cs-import-btn" for="md-cs-file-${i}">📄 Nhập .txt/.csv</label>
              <input type="file" id="md-cs-file-${i}" accept=".txt,.csv" hidden />
              <button type="button" class="md-cs-clear-btn" id="md-cs-clear-${i}" title="Xóa nội dung mô tả">Xóa</button>
            </div>
          </div>

          <div class="md-cs-specs-row">
            <button type="button" class="md-cs-spec-pill md-cs-model-pill" id="md-cs-model-${i}" title="Bấm để chọn Model AI (Omni 1.2 Flash / Omni 1.1 Flash / Veo 3.1)">
              <span class="md-cs-model-val" id="md-cs-model-val-${i}">${initModelSpec.label}</span>
            </button>
            <button type="button" class="md-cs-spec-pill" id="md-cs-dur-${i}" title="Đổi thời lượng video">
              ⏱ <b id="md-cs-dur-val-${i}">${st.duration}s</b>
            </button>
            <button type="button" class="md-cs-spec-pill" id="md-cs-ratio-${i}" title="Đổi tỷ lệ khung hình (9:16 / 16:9)">
              📐 <b id="md-cs-ratio-val-${i}">${st.ratio}</b>
            </button>
          </div>
        </div>

        <footer class="md-cs-foot">
          <button type="button" class="md-cs-gen-btn" id="md-cs-gen-${i}">
            <span>Tạo video (L${code})</span>
            <span aria-hidden="true">✨</span>
          </button>
          <p class="md-cs-note" id="md-cs-note-${i}" hidden></p>
        </footer>
      `;
      streamsGrid.appendChild(card);

      const taEl = card.querySelector(`#md-cs-ta-${i}`);
      const cntEl = card.querySelector(`#md-cs-cnt-${i}`);
      const statusEl = card.querySelector(`#md-cs-status-${i}`);
      const noteEl = card.querySelector(`#md-cs-note-${i}`);
      const genBtn = card.querySelector(`#md-cs-gen-${i}`);
      const refBtn = card.querySelector(`#md-cs-ref-btn-${i}`);
      const refTxt = card.querySelector(`#md-cs-ref-txt-${i}`);
      const refList = card.querySelector(`#md-cs-ref-list-${i}`);
      const fileInp = card.querySelector(`#md-cs-file-${i}`);
      const clearBtn = card.querySelector(`#md-cs-clear-${i}`);
      const modelBtn = card.querySelector(`#md-cs-model-${i}`);
      const modelVal = card.querySelector(`#md-cs-model-val-${i}`);
      const durBtn = card.querySelector(`#md-cs-dur-${i}`);
      const durVal = card.querySelector(`#md-cs-dur-val-${i}`);
      const ratioBtn = card.querySelector(`#md-cs-ratio-${i}`);
      const ratioVal = card.querySelector(`#md-cs-ratio-val-${i}`);

      const maxImagesOfStream = () => getCreateModelSpec(st.model).maxImages;

      // Chọn ảnh tham chiếu riêng cho từng luồng
      const paintStreamRefs = () => {
        const maxImgs = maxImagesOfStream();
        if (st.files.length > maxImgs) {
          st.files = st.files.slice(0, maxImgs);
        }
        refTxt.textContent = st.files.length
          ? `+ Ảnh tham chiếu (${st.files.length}/${maxImgs})`
          : `+ Thêm phần tử / Ảnh (0/${maxImgs})`;
        refList.replaceChildren();
        refList.hidden = st.files.length === 0;
        st.files.forEach((f, fIdx) => {
          const item = document.createElement('div');
          item.className = 'md-cs-ref-thumb';
          const img = document.createElement('img');
          img.src = mediaUrl.pick(f.handle);
          img.alt = f.name || 'ref';
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'md-cs-ref-del';
          del.textContent = '✕';
          del.addEventListener('click', (ev) => {
            ev.stopPropagation();
            st.files = st.files.filter((_, k) => k !== fIdx);
            paintStreamRefs();
          });
          item.append(img, del);
          refList.appendChild(item);
        });
      };

      st.setModel = (newModelId) => {
        const spec = getCreateModelSpec(newModelId);
        st.model = spec.id;
        if (modelVal) modelVal.textContent = spec.label;
        if (!spec.durations.includes(st.duration)) {
          st.duration = spec.durations.includes(8) ? 8 : spec.durations[0];
          if (durVal) durVal.textContent = `${st.duration}s`;
        }
        paintStreamRefs();
      };

      const updateCount = () => {
        const { prompts } = splitPrompts(taEl.value || '');
        cntEl.textContent = `${prompts.length} lệnh`;
        cntEl.classList.toggle('md-cs-cmd-count--on', prompts.length > 0);
      };

      taEl.value = st.prompt;
      updateCount();

      taEl.addEventListener('input', () => {
        st.prompt = taEl.value;
        if (i === 1 && origPromptEl && origPromptEl.value !== taEl.value) {
          origPromptEl.value = taEl.value;
          origPromptEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        updateCount();
        saveStreamsState();
      });

      if (i === 1 && origPromptEl) {
        origPromptEl.addEventListener('input', () => {
          if (taEl.value !== origPromptEl.value) {
            taEl.value = origPromptEl.value;
            st.prompt = taEl.value;
            updateCount();
            saveStreamsState();
          }
        });
      }

      clearBtn?.addEventListener('click', () => {
        taEl.value = '';
        st.prompt = '';
        updateCount();
        saveStreamsState();
      });

      fileInp?.addEventListener('change', async () => {
        const f = fileInp.files?.[0];
        if (!f) return;
        try {
          const txt = await f.text();
          taEl.value = txt.trim();
          st.prompt = taEl.value;
          updateCount();
          saveStreamsState();
        } catch {}
        fileInp.value = '';
      });

      refBtn?.addEventListener('click', async () => {
        try {
          const maxImgs = maxImagesOfStream();
          const picked = await window.dola?.pickImages?.();
          if (!picked?.length) return;
          const merged = [...st.files];
          for (const p of picked) {
            if (merged.length >= maxImgs) break;
            if (!merged.some((m) => m.handle === p.handle)) merged.push(p);
          }
          st.files = merged.slice(0, maxImgs);
          paintStreamRefs();
        } catch {}
      });

      // Chọn Model / Thời lượng / Tỷ lệ
      modelBtn?.addEventListener('click', (ev) => {
        ev.stopPropagation();
        openStreamModelMenu(modelBtn, st);
      });

      durBtn?.addEventListener('click', () => {
        const durs = getCreateModelSpec(st.model).durations;
        const curIdx = durs.indexOf(st.duration);
        st.duration = durs[(curIdx + 1) % durs.length] || 8;
        durVal.textContent = `${st.duration}s`;
        saveStreamsState();
      });

      ratioBtn?.addEventListener('click', () => {
        st.ratio = st.ratio === '9:16' ? '16:9' : '9:16';
        ratioVal.textContent = st.ratio;
        saveStreamsState();
      });

      // Hàm gửi lệnh tạo video của riêng Luồng i vào hàng đợi Google Flow
      st.runStream = async () => {
        const promptText = (taEl.value || '').trim();
        if (!promptText) {
          noteEl.textContent = 'Chưa nhập mô tả video cho luồng này.';
          noteEl.className = 'md-cs-note md-cs-note--err';
          noteEl.hidden = false;
          return false;
        }
        noteEl.hidden = true;
        st.busy = true;
        genBtn.disabled = true;
        statusEl.textContent = 'Đang xếp hàng...';
        statusEl.className = 'md-cs-status md-cs-status--run';
        card.classList.add('md-cs-card--active');

        createSubmitting = true;
        burstEnergy = 1.0;
        lastActivePrompt = `[Luồng ${code}] ${promptText}`;

        try {
          let prefsObj = {};
          try { prefsObj = JSON.parse(localStorage.getItem('prefs') || '{}') || {}; } catch {}
          const mode = 'veo';
          const model = st.model || prefsObj.veoModel || defaultVeoModelId;

          const res = await enqueueFromForm({
            promptText,
            ratio: st.ratio || prefsObj.ratio || '9:16',
            duration: st.duration || prefsObj.duration || 8,
            model,
            mode,
            files: st.files,
          });

          if (!res?.ok) {
            statusEl.textContent = 'Lỗi xếp hàng';
            statusEl.className = 'md-cs-status md-cs-status--err';
            noteEl.textContent = res?.message || 'Không thêm được vào hàng đợi.';
            noteEl.className = 'md-cs-note md-cs-note--err';
            noteEl.hidden = false;
            return false;
          }

          statusEl.textContent = `Đã xếp (${res.count} lệnh)`;
          statusEl.className = 'md-cs-status md-cs-status--ok';
          noteEl.textContent = res.message || `Đã đưa ${res.count} lệnh vào hàng đợi.`;
          noteEl.className = 'md-cs-note md-cs-note--ok';
          noteEl.hidden = false;
          return true;
        } catch (err) {
          statusEl.textContent = 'Lỗi';
          statusEl.className = 'md-cs-status md-cs-status--err';
          noteEl.textContent = err?.message || 'Lỗi khi gửi lệnh.';
          noteEl.className = 'md-cs-note md-cs-note--err';
          noteEl.hidden = false;
          return false;
        } finally {
          st.busy = false;
          genBtn.disabled = false;
        }
      };

      genBtn?.addEventListener('click', () => {
        st.runStream();
      });

      const chkEl = card.querySelector(`#md-cs-chk-${i}`);
      st.chkEl = chkEl;
    }

    const syncCreateSelectAll = () => {
      const visibleStates = streamStates.filter((s) => !s.card?.hidden);
      const totalVis = visibleStates.length || 10;
      const checkedCount = visibleStates.filter((s) => s.chkEl?.checked !== false).length;
      streamStates.forEach((s) => {
        s.checked = s.chkEl ? !!s.chkEl.checked : true;
        s.card?.classList.toggle('md-cs-card--unchecked', !s.checked);
      });
      const footSum = document.getElementById('md-foot-queue-summary');
      if (footSum && createRunning + createQueued === 0) {
        footSum.textContent = `Chạy ${checkedCount}/${totalVis} luồng đã tích`;
      }
    };

    streamStates.forEach((s) => {
      s.chkEl?.addEventListener('change', syncCreateSelectAll);
    });
    syncCreateSelectAll();

    // Nút tổng: Tạo tất cả các luồng đã tích chọn và có nội dung mô tả cùng lúc
    const runAllBtn = document.getElementById('md-cs-run-all');
    runAllBtn?.addEventListener('click', async () => {
      const readyStreams = streamStates.filter(
        (s) => !s.card?.hidden && s.checked !== false && (s.prompt || '').trim().length > 0
      );
      if (!readyStreams.length) {
        const subEl = document.getElementById('md-stage-sub');
        if (subEl) subEl.textContent = '⚠️ Hãy tích chọn và nhập mô tả video vào ít nhất 1 luồng trước khi bấm Tạo video!';
        return;
      }
      runAllBtn.disabled = true;
      let queuedStreams = 0;
      for (const s of readyStreams) {
        const ok = await s.runStream();
        if (ok) queuedStreams++;
      }
      runAllBtn.disabled = false;
      const subEl = document.getElementById('md-stage-sub');
      if (subEl && queuedStreams > 0) {
        subEl.textContent = `✓ Đã kích hoạt đồng loạt ${queuedStreams}/${readyStreams.length} luồng tạo video trên Google Flow (Veo)!`;
      }
    });

    // Ô bấm chọn chế độ hiển thị 1 / 2 / 3 / 5 / 10 luồng theo hàng ngang hoặc cột
    const countSwitch = document.getElementById('md-cs-count-switch');
    const csPickerBtn = document.getElementById('md-cs-picker-btn');
    const csPickerLabel = document.getElementById('md-cs-picker-label');
    const csPickerMenu = document.getElementById('md-cs-picker-menu');
    const step2Lbl = document.getElementById('md-create-step2-label');

    csPickerBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (csPickerMenu) csPickerMenu.hidden = !csPickerMenu.hidden;
    });

    document.addEventListener('pointerdown', (e) => {
      if (csPickerMenu && !csPickerMenu.hidden && countSwitch && !countSwitch.contains(e.target)) {
        csPickerMenu.hidden = true;
      }
    });

    csPickerMenu?.addEventListener('click', (e) => {
      const opt = e.target.closest('.cm-stream-picker-opt');
      if (!opt) return;
      const cols = opt.dataset.cols || '10';
      const layoutMode = opt.dataset.layout || 'rows';
      streamsWrap.dataset.cols = cols;
      streamsWrap.dataset.layout = layoutMode;
      csPickerMenu.querySelectorAll('.cm-stream-picker-opt').forEach((b) => {
        b.classList.toggle('cm-stream-picker-opt--on', b === opt);
      });
      if (csPickerLabel && opt.dataset.label) {
        csPickerLabel.textContent = opt.dataset.label;
      }
      if (step2Lbl && opt.dataset.step) {
        step2Lbl.textContent = opt.dataset.step;
      }
      csPickerMenu.hidden = true;
      const maxVisible = Number(cols) || 10;
      streamsGrid.querySelectorAll('.md-cs-card').forEach((card) => {
        const idx = Number(card.dataset.stream) || 1;
        card.hidden = idx > maxVisible;
      });
      syncCreateSelectAll();
    });
  }

  // 3. Khung Sân khấu Motion Control (.cm-placeholder trong #view-motion)
  let mcCanvas = null;
  let mcCtx = null;

  function ensureMotionStage() {
    if (!mcCanvas || !mcCanvas.isConnected) {
      mcCanvas = document.getElementById('md-mc-canvas');
      mcCtx = mcCanvas ? mcCanvas.getContext('2d') : null;
    }
  }

  // 4. Hộp thoại Kiểm tra & Cập nhật Phiên bản MD MEDIA v2.5.0 PRO
  function openUpdateModal() {
    let modal = document.getElementById('md-update-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'md-update-modal';
    modal.className = 'md-up-backdrop';
    modal.innerHTML = `
      <div class="md-up-dialog" role="dialog" aria-modal="true" aria-labelledby="md-up-title">
        <div class="md-up-head">
          <div class="md-up-brand">
            <span class="md-brand-icon">MD</span>
            <div>
              <h3 id="md-up-title" class="md-up-title">MD MEDIA — Trung Tâm Phiên Bản & Cập Nhật</h3>
              <p class="md-up-sub">Phiên bản hiện tại: <b>v2.5.0 PRO</b> (Build 2026.11.08 · Google Flow Veo Engine)</p>
            </div>
          </div>
          <button type="button" class="md-up-close" id="md-up-close" aria-label="Đóng">✕</button>
        </div>

        <div class="md-up-status-box" id="md-up-status-box">
          <div class="md-up-spinner" id="md-up-spin"></div>
          <div class="md-up-status-text">
            <b id="md-up-state-title">Đang kiểm tra bản cập nhật mới nhất từ máy chủ MD MEDIA...</b>
            <span id="md-up-state-desc">Đang đồng bộ cấu trúc mô hình Google Flow (Veo 3.1) & giao diện Motion Studio...</span>
          </div>
        </div>

        <div class="md-up-bar"><i id="md-up-bar-fill" style="width: 18%"></i></div>

        <div class="md-up-changelog">
          <h4>✨ Các nâng cấp mới trong phiên bản MD MEDIA v2.5.0 PRO:</h4>
          <ul>
            <li><b>Nhận diện thương hiệu MD MEDIA mới:</b> Giao diện Cyber Studio sắc nét, tốc độ phản hồi cao.</li>
            <li><b>Làm mới toàn diện Motion Control Studio:</b> Bố cục 3 giai đoạn trực quan, bảng điều khiển phân tách rõ ràng, dễ nhìn.</li>
            <li><b>Tách biệt Tạo Video & Thư Viện:</b> Không gian Tạo video riêng biệt và Thư viện quản lý video toàn màn hình.</li>
            <li><b>Mô phỏng tiến độ thực tế (Real-time Progress Sync):</b> Hiệu ứng Sân khấu AI chỉ chạy khi bắt đầu làm video và bám sát đúng phần trăm tiến độ kết xuất thật của từng đoạn.</li>
          </ul>
        </div>

        <div class="md-up-foot">
          <button type="button" class="md-up-btn" id="md-up-recheck">🔍 Kiểm tra lại</button>
          <button type="button" class="md-up-btn md-up-btn--primary" id="md-up-apply">⚡ Áp dụng & Làm mới ngay</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const runCheckAnimation = () => {
      const fill = document.getElementById('md-up-bar-fill');
      const spin = document.getElementById('md-up-spin');
      const stTitle = document.getElementById('md-up-state-title');
      const stDesc = document.getElementById('md-up-state-desc');
      if (!fill) return;
      fill.style.width = '25%';
      if (spin) spin.hidden = false;
      if (stTitle) stTitle.textContent = 'Đang kiểm tra gói cập nhật MD MEDIA...';
      if (stDesc) stDesc.textContent = 'Đang xác thực phiên bản lõi & kết nối Google Flow (Veo)...';

      setTimeout(() => { if (fill) fill.style.width = '68%'; }, 350);
      setTimeout(async () => {
        let coreVer = '2.5.0';
        try {
          const meta = await window.dola?.meta?.();
          if (meta?.version) coreVer = meta.version;
        } catch {}
        if (fill) fill.style.width = '100%';
        if (spin) spin.hidden = true;
        if (stTitle) stTitle.textContent = '✓ Bạn đang sử dụng phiên bản mới nhất: MD MEDIA v2.5.0 PRO';
        if (stDesc) stDesc.textContent = `Core Engine v${coreVer} · Đã kích hoạt đầy đủ tính năng Motion Control & Tạo Video Google Flow.`;
      }, 850);
    };

    runCheckAnimation();

    document.getElementById('md-up-close')?.addEventListener('click', () => modal.remove());
    document.getElementById('md-up-recheck')?.addEventListener('click', runCheckAnimation);
    document.getElementById('md-up-apply')?.addEventListener('click', async () => {
      try {
        if (typeof window.dola?.relaunch === 'function') {
          await window.dola.relaunch();
          return;
        }
      } catch {}
      location.reload();
    });
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  }

  async function refreshHeaderLicenseBadge() {
    try {
      const st = await window.dola?.gate?.state?.();
      const lbl = document.getElementById('md-license-btn-label');
      if (!lbl || !st) return;
      if (st.unlocked) {
        const daysLeft = st.expiresAt
          ? Math.max(0, Math.ceil((st.expiresAt - Date.now()) / 86400000))
          : null;
        lbl.textContent = daysLeft != null ? `Bản quyền (${daysLeft} ngày)` : 'Bản quyền VIP';
      } else {
        lbl.textContent = 'Kích hoạt Key';
      }
    } catch {}
  }

  async function openLicenseModal() {
    let existing = document.getElementById('md-license-modal');
    if (existing) existing.remove();

    let st = {};
    try {
      st = (await window.dola?.gate?.state?.()) || {};
    } catch {}
    const hwid = st.hwid || st.code || 'MDMC-XXXX-XXXX-XXXX';
    const expStr = st.expiresAt
      ? `${new Date(st.expiresAt).toLocaleDateString('vi-VN')} (còn ${Math.max(0, Math.ceil((st.expiresAt - Date.now()) / 86400000))} ngày)`
      : st.unlocked
        ? 'Vĩnh viễn (VIP)'
        : 'Chưa kích hoạt';
    const statusText = st.unlocked
      ? `✅ Đang hoạt động (${st.planLabel || st.plan || 'VIP'})`
      : '🔒 Chưa kích hoạt hoặc đã hết hạn';

    const modal = document.createElement('div');
    modal.id = 'md-license-modal';
    modal.className = 'md-up-overlay';
    modal.innerHTML = `
      <div class="md-up-card" role="dialog" aria-modal="true" style="max-width:520px;">
        <div class="md-up-head">
          <div class="md-up-brand">
            <span class="md-up-icon">🔑</span>
            <div>
              <h3>Bản Quyền &amp; Mã Máy — MD Motion Control</h3>
              <p>Hệ thống quản lý bản quyền tập trung MD License Center (Ed25519 V2)</p>
            </div>
          </div>
          <button type="button" class="md-up-close" id="md-lic-close">✕</button>
        </div>
        <div class="md-up-body" style="display:flex;flex-direction:column;gap:12px;">
          <div style="padding:12px 14px;border-radius:12px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.35);display:flex;align-items:center;justify-content:space-between;gap:10px;">
            <div>
              <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Mã máy (HWID) của thiết bị này:</div>
              <code id="md-lic-hwid-val" style="font-size:16px;font-weight:800;color:#34d399;font-family:monospace;">${hwid}</code>
            </div>
            <button type="button" class="md-up-btn md-up-btn--ghost" id="md-lic-copy-hwid" style="padding:7px 12px;font-size:12px;">📋 Sao chép Mã máy</button>
          </div>

          <div style="padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);font-size:12.5px;line-height:1.7;color:#e2e8f0;">
            <div><strong>Trạng thái:</strong> <span id="md-lic-status-val">${statusText}</span></div>
            <div><strong>Thời hạn sử dụng:</strong> <span id="md-lic-exp-val">${expStr}</span></div>
          </div>

          <div style="display:flex;flex-direction:column;gap:8px;">
            <label style="font-size:12px;font-weight:700;color:#cbd5e1;">Nhập / Đổi Mã Kích Hoạt Bản Quyền (MDMC2....):</label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="md-lic-key-input" placeholder="Dán mã MDMC2.... vào đây" style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,0.16);background:rgba(9,13,22,0.9);color:#f8fafc;font-family:monospace;font-size:12.5px;" />
              <button type="button" class="md-up-btn md-up-btn--primary" id="md-lic-activate-btn" style="white-space:nowrap;">🔑 Kích hoạt Key</button>
            </div>
            <div id="md-lic-msg" style="font-size:12px;min-height:18px;color:#94a3b8;">
              💡 Gửi Mã máy <strong>${hwid}</strong> cho Admin hoặc nhập trên <strong>mdtool.io.vn</strong> để nhận Key tự động.
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('md-lic-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    document.getElementById('md-lic-copy-hwid')?.addEventListener('click', async () => {
      const btn = document.getElementById('md-lic-copy-hwid');
      try {
        await navigator.clipboard.writeText(hwid);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = hwid;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      if (btn) {
        btn.textContent = '✓ Đã chép Mã máy';
        setTimeout(() => { btn.textContent = '📋 Sao chép Mã máy'; }, 1800);
      }
    });

    document.getElementById('md-lic-activate-btn')?.addEventListener('click', async () => {
      const inp = document.getElementById('md-lic-key-input');
      const msg = document.getElementById('md-lic-msg');
      const btn = document.getElementById('md-lic-activate-btn');
      const rawKey = inp?.value?.trim() || '';
      if (!rawKey) {
        if (msg) {
          msg.style.color = '#fca5a5';
          msg.textContent = '⚠️ Vui lòng dán mã kích hoạt bản quyền (MDMC2....) vào ô trên.';
        }
        return;
      }
      if (btn) btn.disabled = true;
      try {
        const res = await window.dola?.gate?.activateVip?.(rawKey);
        if (res?.ok && res?.unlocked) {
          if (msg) {
            msg.style.color = '#6ee7b7';
            msg.textContent = res.note || '🎉 Đã kích hoạt Key bản quyền thành công!';
          }
          const stVal = document.getElementById('md-lic-status-val');
          const expVal = document.getElementById('md-lic-exp-val');
          if (stVal) stVal.textContent = `✅ Đang hoạt động (${res.planLabel || res.plan || 'VIP'})`;
          if (expVal) {
            expVal.textContent = res.expiresAt
              ? `${new Date(res.expiresAt).toLocaleDateString('vi-VN')} (còn ${Math.max(0, Math.ceil((res.expiresAt - Date.now()) / 86400000))} ngày)`
              : 'Vĩnh viễn (VIP)';
          }
          refreshHeaderLicenseBadge();
        } else {
          if (msg) {
            msg.style.color = '#fca5a5';
            msg.textContent = '❌ ' + (res?.note || 'Mã kích hoạt không hợp lệ hoặc đã hết hạn.');
          }
        }
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  refreshHeaderLicenseBadge();
  window.dola?.gate?.onChanged?.(() => refreshHeaderLicenseBadge());

  // Gắn sự kiện cho các nút điều hướng & nút Cập nhật
  const bindClick = (id, fn) => {
    const btn = document.getElementById(id);
    if (btn && fn) btn.addEventListener('click', fn);
  };
  bindClick('md-stage-open-lib', () => onOpenLibrary?.());
  bindClick('md-stage-go-lib', () => onOpenLibrary?.());
  bindClick('md-live-bar-lib', () => onOpenLibrary?.());
  bindClick('md-live-bar-stage', () => onOpenCreate?.());
  bindClick('md-license-btn', openLicenseModal);
  bindClick('md-update-btn', openUpdateModal);
  bindClick('md-ver-pill', openUpdateModal);
  bindClick('md-stage-open-folder', () => {
    if (onOpenSaveDir) onOpenSaveDir();
    else window.dola?.saveDir?.open?.();
  });

  // Lắng nghe tiến độ thực tế từ Tạo Video (history.js)
  window.addEventListener('md:tasks-update', (ev) => {
    const tasks = ev.detail?.tasks || [];
    createTasks = tasks;
    const totalCount = tasks.length;
    const running = tasks.filter((t) => t.status === 'running');
    const queued = tasks.filter((t) => t.status === 'queued');
    const done = tasks.filter((t) => t.status === 'done');
    const failed = tasks.filter((t) => ['failed', 'cancelled', 'interrupted'].includes(t.status));

    const wasWorking = createRunning > 0 || createQueued > 0;
    createRunning = running.length;
    createQueued = queued.length;
    createDone = done.length;
    createFailed = failed.length;
    const isWorking = createRunning > 0 || createQueued > 0;

    if (isWorking && !wasWorking) {
      createBatchStart = performance.now();
      burstEnergy = 1.0;
    } else if (!isWorking) {
      createSubmitting = false;
      createBatchStart = 0;
    }

    const activeTask = running[0] || queued[0];
    if (activeTask?.prompt) lastActivePrompt = activeTask.prompt;

    const setTxt = (id, val) => {
      const node = document.getElementById(id);
      if (node) node.textContent = String(val);
    };
    setTxt('lib-nav-badge', totalCount);
    setTxt('md-stage-lib-badge', totalCount);
    setTxt('md-live-bar-count', totalCount);
    setTxt('md-hud-running', createRunning + createQueued);
    setTxt('md-hud-done', createDone);
    if (createRunning + createQueued > 0) {
      setTxt('md-foot-queue-summary', `Đang chạy: ${createRunning} · Chờ: ${createQueued} · Hoàn tất: ${createDone}`);
    } else {
      const visCards = Array.from(document.querySelectorAll('#view-create .md-cs-card')).filter((c) => !c.hidden);
      const chkCards = visCards.filter((c) => c.querySelector('.md-cs-chk')?.checked !== false);
      setTxt('md-foot-queue-summary', `(Chạy ${chkCards.length}/${visCards.length || 10} luồng đã tích)`);
    }
  });

  // Lắng nghe tiến độ thực tế từ Motion Control (motion-view.js)
  window.addEventListener('md:motion-state', (ev) => {
    const next = ev.detail || {};
    const wasWorking = mcState.phase === 'prepare' || mcState.phase === 'start' || (mcState.job && !mcState.ended);
    const isWorking = next.phase === 'prepare' || next.phase === 'start' || (next.job && !next.ended);

    if (isWorking && !wasWorking) {
      mcPhaseStart = performance.now();
      mcClipStart = performance.now();
      burstEnergy = 1.0;
    } else if (!isWorking) {
      mcPhaseStart = 0;
    }

    // Theo dõi khi chuyển sang đoạn clip mới trong Motion Control để nội suy thời gian mượt cho đoạn đó
    const clips = Array.isArray(next.clips) ? next.clips : [];
    const makingKey = clips.map((c) => `${c.i}:${c.state}`).join('|');
    if (makingKey !== lastMakingKey) {
      lastMakingKey = makingKey;
      mcClipStart = performance.now();
    }

    mcState = { ...mcState, ...next, clips };
  });

  window.addEventListener('md:motion-trigger', () => {
    if (!mcPhaseStart) mcPhaseStart = performance.now();
    mcClipStart = performance.now();
    burstEnergy = 1.0;
  });

  // Tính toán tiến độ thực tế (0..100%, bước 0..4) cho mục Tạo Video
  function computeCreateProgress(now) {
    const running = createTasks.filter((t) => t.status === 'running');
    const queued = createTasks.filter((t) => t.status === 'queued');
    const isWorking = createSubmitting || running.length > 0 || queued.length > 0;

    if (!isWorking) {
      return {
        working: false,
        stepIdx: -1,
        stepProgress: 0,
        pct: 0,
        elapsedSec: 0,
        stateBadge: '● SẴN SÀNG KHỞI TẠO',
        headline: 'CHƯA BẮT ĐẦU — ĐANG CHỜ LỆNH TẠO VIDEO',
        detail: 'Nhập mô tả cảnh quay ở cột bên trái và bấm "Tạo video" để bắt đầu tiến trình kết xuất.',
      };
    }

    const activeTask = running[0] || queued[0];
    const startMs = activeTask?.startedAt || activeTask?.createdAt || Date.now();
    const elapsedSec = Math.max(0, (Date.now() - startMs) / 1000);

    // Nếu mới bấm nút Tạo video hoặc đang nằm trong hàng đợi chờ tới lượt
    if (!running.length) {
      const waitPct = Math.min(14, 4 + Math.floor(elapsedSec * 0.8));
      return {
        working: true,
        stepIdx: 0,
        stepProgress: Math.min(95, (waitPct / 15) * 100),
        pct: waitPct,
        elapsedSec,
        stateBadge: '● ĐANG XẾP HÀNG ĐỢI',
        headline: `BƯỚC 01/05: CHUẨN BỊ & XẾP HÀNG (${queued.length} LỆNH ĐANG CHỜ)`,
        detail: activeTask?.prompt
          ? `Đang chờ tài khoản Google Flow sẵn sàng cho lệnh: "${activeTask.prompt}"`
          : 'Đang khởi tạo lệnh và kiểm tra tài khoản Google Flow...',
      };
    }

    // Đang chạy thực tế (status === 'running')
    const rawStage = String(activeTask.stage || 'Đang xử lý trên Google Flow…');
    const sLower = rawStage.toLowerCase();
    const pctMatch = rawStage.match(/(\d{1,3})\s*%/);

    let stepIdx = 3; // Mặc định bước 04: Kết xuất
    let pct = 60;

    if (sLower.includes('mở') || sLower.includes('đăng nhập') || sLower.includes('chuẩn bị') || sLower.includes('khởi tạo') || elapsedSec < 10) {
      stepIdx = 1; // Bước 02: Kết nối Google Flow
      pct = Math.min(34, 16 + Math.floor(elapsedSec * 1.8));
    } else if (sLower.includes('ảnh') || sLower.includes('tải lên') || sLower.includes('gửi') || sLower.includes('nhập') || elapsedSec < 22) {
      stepIdx = 2; // Bước 03: Gửi kịch bản & ảnh
      pct = Math.min(54, 35 + Math.floor((elapsedSec - 10) * 1.6));
    } else if (sLower.includes('tải về') || sLower.includes('lưu') || sLower.includes('hoàn tất')) {
      stepIdx = 4; // Bước 05: Tải về & lưu file
      pct = Math.min(99, 91 + Math.floor((elapsedSec % 10) * 0.8));
    } else {
      stepIdx = 3; // Bước 04: Đang kết xuất video Veo trên Flow
      if (pctMatch) {
        const flowPct = Math.min(100, Math.max(0, Number(pctMatch[1])));
        pct = Math.round(55 + (flowPct / 100) * 35);
      } else {
        // Nội suy tiệm cận mượt theo thời gian render thực tế của Veo (~85s)
        const renderSec = Math.max(0, elapsedSec - 22);
        const ratio = 1 - Math.exp(-renderSec / 45);
        pct = Math.min(90, Math.round(55 + ratio * 35));
      }
    }

    const stepRanges = [[0, 15], [15, 35], [35, 55], [55, 90], [90, 100]];
    const [rMin, rMax] = stepRanges[stepIdx] || [0, 100];
    const stepProgress = Math.min(100, Math.max(8, Math.round(((pct - rMin) / Math.max(1, rMax - rMin)) * 100)));
    const stepInfo = CREATE_STEPS[stepIdx];
    const accText = activeTask.accountLabel ? ` · Acc: ${activeTask.accountLabel}` : '';

    return {
      working: true,
      stepIdx,
      stepProgress,
      pct,
      elapsedSec,
      stateBadge: `● ĐANG LÀM VIDEO (${pct}%)`,
      headline: `BƯỚC ${stepInfo.code}/05: ${stepInfo.name.toUpperCase()} — ${rawStage}${accText}`,
      detail: `🎬 Đang kết xuất: "${activeTask.prompt || lastActivePrompt || ''}"`,
    };
  }

  // Tính toán tiến độ thực tế (0..100%, bước 0..3) cho mục Motion Control
  function computeMotionProgress(now) {
    const { phase, hasPlan, segmentCount, job, ended, clips, result, stageText } = mcState;
    const isPreparing = phase === 'prepare';
    const isStarting = phase === 'start';
    const isJobRunning = job && !ended;
    const working = isPreparing || isStarting || isJobRunning;

    const elapsedSec = working && mcPhaseStart ? Math.max(0, (now - mcPhaseStart) / 1000) : 0;

    // 1. Đang phân tích video & lời thoại (Bước 01)
    if (isPreparing) {
      const ratio = 1 - Math.exp(-elapsedSec / 18);
      const pct = Math.min(24, Math.max(2, Math.round(ratio * 24)));
      return {
        working: true,
        stepIdx: 0,
        stepProgress: Math.min(96, Math.round((pct / 25) * 100)),
        pct,
        elapsedSec,
        badge: `● ĐANG PHÂN TÍCH (${pct}%)`,
        statusLine: stageText || 'Đang đọc video gốc, tách phân đoạn và nhận diện lời thoại...',
        stripText: `⚡ Đang phân tích video (${pct}%)`,
      };
    }

    // 2. Đang chạy tạo video Motion Control (Bước 02 -> 03 -> 04)
    if (isStarting || isJobRunning) {
      const total = Math.max(1, clips.length || segmentCount || 1);
      const doneClips = clips.filter((c) => c.state === 'done').length;
      const makingClips = clips.filter((c) => ['making', 'queued', 'cutting'].includes(c.state)).length;
      const failedClips = clips.filter((c) => ['failed', 'cancelled'].includes(c.state)).length;

      const clipElapsed = mcClipStart ? Math.max(0, (now - mcClipStart) / 1000) : elapsedSec;

      // Nếu tất cả các đoạn đã xong -> Bước 04: Ghép phim hoàn chỉnh
      if (doneClips >= total && total > 0 && clips.length > 0) {
        const joinPct = Math.min(99, 92 + Math.floor(clipElapsed * 0.8));
        return {
          working: true,
          stepIdx: 3,
          stepProgress: Math.min(98, (joinPct - 90) * 10),
          pct: joinPct,
          elapsedSec,
          badge: `● ĐANG GHÉP PHIM (${joinPct}%)`,
          statusLine: `Đã hoàn tất ${doneClips}/${total} đoạn · Đang ghép nối âm thanh & xuất video hoàn chỉnh...`,
          stripText: `⚡ Đang ghép ${doneClips}/${total} đoạn (${joinPct}%)`,
        };
      }

      // Nếu mới bắt đầu gửi ảnh nhân vật & khởi tạo (< 12s đầu của đoạn đầu tiên) -> Bước 02: Khóa Nhân vật AI
      if (doneClips === 0 && elapsedSec < 12) {
        const lockPct = Math.min(36, 26 + Math.floor(elapsedSec * 0.9));
        return {
          working: true,
          stepIdx: 1,
          stepProgress: Math.min(95, Math.round(((lockPct - 25) / 12) * 100)),
          pct: lockPct,
          elapsedSec,
          badge: `● KHÓA NHÂN VẬT (${lockPct}%)`,
          statusLine: `Đang tải ảnh nhân vật & đồng bộ khung chuyển động lên Google Flow (0/${total} đoạn)...`,
          stripText: `⚡ Đang khóa nhân vật AI (${lockPct}%)`,
        };
      }

      // Bước 03: Đang kết xuất từng đoạn trên Google Flow
      const activeClipRatio = makingClips > 0 ? Math.min(0.88, 1 - Math.exp(-clipElapsed / 50)) : 0;
      const overallClipFraction = Math.min(1, (doneClips + activeClipRatio) / total);
      const pct = Math.min(91, Math.max(37, Math.round(37 + overallClipFraction * 54)));
      const stepProgress = Math.min(98, Math.max(10, Math.round(overallClipFraction * 100)));

      return {
        working: true,
        stepIdx: 2,
        stepProgress,
        pct,
        elapsedSec,
        badge: `● ĐANG KẾT XUẤT (${pct}%)`,
        statusLine: `Google Flow đang làm đoạn ${Math.min(total, doneClips + 1)}/${total} (Đã xong: ${doneClips}/${total} · Đang chạy: ${makingClips}${failedClips ? ` · Lỗi: ${failedClips}` : ''})`,
        stripText: `⚡ Đang làm ${doneClips}/${total} đoạn (${pct}%)`,
      };
    }

    // 3. Khi đã kết thúc (ended) nhưng có đoạn lỗi
    if (job && ended && (!result || !result.url)) {
      const total = Math.max(1, clips.length || segmentCount || 1);
      const doneClips = clips.filter((c) => c.state === 'done').length;
      const failedClips = clips.filter((c) => ['failed', 'cancelled'].includes(c.state)).length;
      const pct = Math.round((doneClips / total) * 90);
      return {
        working: false,
        stepIdx: 2,
        stepProgress: Math.round((doneClips / total) * 100),
        pct,
        elapsedSec: 0,
        badge: `⚠ TẠM DỪNG (${doneClips}/${total} ĐOẠN)`,
        statusLine: `Có ${failedClips || 1} đoạn chưa tạo được. Xem lý do ở bên dưới rồi bấm "Làm lại đoạn này".`,
        stripText: `${doneClips}/${total} xong · ${failedClips || 1} lỗi`,
      };
    }

    // 4. Khi đã phân tích xong (Bước 2: Đoạn & lời) và đang chờ người dùng bấm "Tạo video"
    if (hasPlan && !job) {
      return {
        working: false,
        stepIdx: 0,
        stepProgress: 100,
        pct: 25,
        elapsedSec: 0,
        badge: `➤ MỤC A ➔ MỤC B · ĐÃ PHÂN TÍCH (${segmentCount || 1} ĐOẠN)`,
        statusLine: `Mục A hoàn tất (${segmentCount || 1} đoạn) ➔ Bấm nút "Tạo video" trên thanh trên cùng để truyền sóng sang Mục B, C, D!`,
        stripText: `Mục A ➔ Mục B (${segmentCount || 1} đoạn)`,
      };
    }

    // 5. Trạng thái Sóng Mũi Tên định hướng chạy liên tục từ Mục A sang Mục B
    return {
      working: false,
      stepIdx: -1,
      stepProgress: 0,
      pct: 0,
      elapsedSec: 0,
      badge: '➤ SÓNG MŨI TÊN: MỤC A ➔ MỤC B',
      statusLine: 'Sóng mũi tên đang truyền liên tục từ Mục A sang Mục B — Chọn nguyên liệu ở ô trái và bấm nút trên cùng để bắt đầu.',
      stripText: 'Luồng Sóng Mũi Tên A ➔ B',
    };
  }

  // Khởi tạo Dải Ngân Hà Xoay Tròn 3D (Spiral Galaxy) dùng cho Sân khấu Kết xuất AI (#md-stage-canvas)
  const canvas = document.getElementById('md-stage-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  const GALAXY_ARMS = 5;
  const GALAXY_STAR_COUNT = 440;
  const GALAXY_PALETTE = ['#ffffff', '#fde68a', '#ff9f1c', '#fb8500', '#38bdf8', '#a855f7', '#f472b6'];
  const galaxyStars = Array.from({ length: GALAXY_STAR_COUNT }, (_, i) => {
    const arm = i % GALAXY_ARMS;
    const rawR = Math.pow(Math.random(), 1.35); // Tập trung mật độ sao dày ở tâm và lan tỏa ra các nhánh xoắn
    const r = 0.04 + rawR * 0.94;
    const armOffset = (arm / GALAXY_ARMS) * Math.PI * 2;
    const spiralTwist = r * 5.2; // Độ xoắn ốc của nhánh ngân hà
    const scatter = (Math.random() - 0.5) * (0.32 + r * 0.45);
    const zOffset = (Math.random() - 0.5) * 0.14 * (1 - r * 0.5);
    const color = r < 0.22
      ? (i % 2 === 0 ? '#ffffff' : '#fde68a')
      : GALAXY_PALETTE[i % GALAXY_PALETTE.length];
    return {
      r,
      baseAngle: armOffset + spiralTwist + scatter,
      zOffset,
      size: (1 - r * 0.55) * (1.1 + Math.random() * 2.2),
      twinkleSpeed: 1.5 + Math.random() * 3.5,
      twinklePhase: Math.random() * Math.PI * 2,
      color,
      isDust: i % 6 === 0 && r > 0.15,
    };
  });

  const BG_STAR_COUNT = 95;
  const bgStars = Array.from({ length: BG_STAR_COUNT }, (_, i) => ({
    x: (Math.sin(i * 127.1) * 43758.5453) % 1,
    y: (Math.sin(i * 311.7) * 43758.5453) % 1,
    size: 0.6 + (i % 3) * 0.55,
    phase: i * 0.7,
    color: i % 4 === 0 ? '#38bdf8' : i % 5 === 0 ? '#fde68a' : '#e2e8f0',
  })).map((s) => ({ ...s, x: Math.abs(s.x), y: Math.abs(s.y) }));

  function fitCanvas(c) {
    if (!c || !c.parentElement) return false;
    const rect = c.parentElement.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const tw = Math.floor(rect.width * dpr);
    const th = Math.floor(rect.height * dpr);
    if (c.width !== tw || c.height !== th) {
      c.width = tw;
      c.height = th;
    }
    return true;
  }

  const fmtMMSS = (sec) => {
    const s = Math.max(0, Math.floor(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  // Vẽ hiệu ứng sóng & mũi tên năng lượng trong từng ô VÀ trên các cầu nối mũi tên dài giữa các ô (CHỈ CHẠY HOẠT ẢNH KHI ĐANG BẮT ĐẦU TẠO VIDEO: prog.working === true)
  function drawFlowPipelineCanvas(containerSel, now, prog) {
    const stepNodes = document.querySelectorAll(`${containerSel} .md-mc-step`);
    if (!stepNodes.length) return;

    const t = now * 0.001;
    stepNodes.forEach((stepEl, idx) => {
      const boxCanvas = stepEl.querySelector('.md-mc-box-canvas');
      if (!boxCanvas || boxCanvas.offsetParent === null) return;
      if (!fitCanvas(boxCanvas)) return;

      const bCtx = boxCanvas.getContext('2d');
      if (!bCtx) return;

      const w = boxCanvas.width;
      const h = boxCanvas.height;
      bCtx.clearRect(0, 0, w, h);

      // Khi chưa bắt đầu chạy (!prog.working), tuyệt đối không vẽ sóng/mũi tên chuyển động bên trong ô
      if (!prog.working) return;

      const cy = h * 0.5;
      const isCurrent = idx === prog.stepIdx;
      const isPassed = idx < prog.stepIdx;
      if (!isCurrent && !isPassed) return;

      const speed = isCurrent ? 92 : 52;
      const primaryColor = isCurrent ? '#ff9f1c' : '#10b981';
      const secondaryColor = isCurrent ? '#00f2fe' : '#34d399';
      const alphaMul = isCurrent ? 0.38 : 0.24;

      // Sóng năng lượng mềm bên trong lòng ô đang chạy
      bCtx.save();
      bCtx.globalAlpha = alphaMul;
      bCtx.strokeStyle = secondaryColor;
      bCtx.lineWidth = 1.5;
      bCtx.beginPath();
      for (let x = 0; x <= w; x += 6) {
        const y = cy + Math.sin(x * 0.045 - t * 4.2 + idx) * (h * 0.2);
        if (x === 0) bCtx.moveTo(x, y);
        else bCtx.lineTo(x, y);
      }
      bCtx.stroke();
      bCtx.restore();

      // Dải mũi tên ❯❯❯ chạy bên trong ô đang xử lý
      const spacing = 34;
      const travelOffset = (t * speed + idx * 12) % spacing;
      const arrowCount = Math.ceil(w / spacing) + 2;

      bCtx.save();
      for (let i = -1; i < arrowCount; i++) {
        const tipX = i * spacing + travelOffset;
        const pulse = (Math.sin(tipX * 0.03 - t * 5.0 + idx) + 1) * 0.5;
        const wingH = h * (0.22 + pulse * 0.07);
        const wingW = 7 + pulse * 2.5;

        bCtx.globalAlpha = alphaMul * (0.7 + pulse * 0.4);
        bCtx.strokeStyle = pulse > 0.55 ? primaryColor : secondaryColor;
        bCtx.lineWidth = isCurrent ? 1.8 : 1.4;
        bCtx.lineCap = 'round';
        bCtx.lineJoin = 'round';
        bCtx.beginPath();
        bCtx.moveTo(tipX - wingW, cy - wingH);
        bCtx.lineTo(tipX, cy);
        bCtx.lineTo(tipX - wingW, cy + wingH);
        bCtx.stroke();
      }
      bCtx.restore();
    });

    // Vẽ cầu nối mũi tên giữa các ô: đứng yên khi chờ (!prog.working), chỉ chạy hoạt ảnh khi bắt đầu (prog.working === true)
    const bridgeNodes = document.querySelectorAll(`${containerSel} .md-mc-bridge-canvas`);
    const bridgeColors = [
      ['#10b981', '#f59e0b'],
      ['#f59e0b', '#ff6200'],
      ['#ff6200', '#38bdf8'],
      ['#38bdf8', '#a855f7'],
    ];

    bridgeNodes.forEach((bCanvas, bIdx) => {
      if (!bCanvas || bCanvas.offsetParent === null) return;
      if (!fitCanvas(bCanvas)) return;
      const gCtx = bCanvas.getContext('2d');
      if (!gCtx) return;

      const w = bCanvas.width;
      const h = bCanvas.height;
      const cy = h * 0.5;
      const [colStart, colEnd] = bridgeColors[bIdx] || ['#ff9f1c', '#38bdf8'];

      const isActiveBridge = prog.working && bIdx <= prog.stepIdx;

      gCtx.clearRect(0, 0, w, h);

      // 1. Đường trục nối giữa 2 ô
      const lineGrad = gCtx.createLinearGradient(0, cy, w, cy);
      lineGrad.addColorStop(0, colStart);
      lineGrad.addColorStop(1, colEnd);

      gCtx.save();
      gCtx.globalAlpha = isActiveBridge ? 0.55 : 0.22;
      gCtx.strokeStyle = lineGrad;
      gCtx.lineWidth = isActiveBridge ? 2.4 : 1.5;
      gCtx.beginPath();
      gCtx.moveTo(2, cy);
      gCtx.lineTo(w - 8, cy);
      gCtx.stroke();

      // 2. Chỉ vẽ xung mũi tên chạy khi thực sự đang bắt đầu tạo video (isActiveBridge)
      if (isActiveBridge) {
        const pulseSpeed = 135;
        const spacing = 22;
        const offset = (t * pulseSpeed + bIdx * 9) % spacing;
        const count = Math.ceil(w / spacing) + 2;

        for (let i = -1; i < count; i++) {
          const x = i * spacing + offset;
          if (x < 4 || x > w - 8) continue;
          const normX = Math.max(0, Math.min(1, x / w));
          const edgeFade = Math.sin(normX * Math.PI);
          const chevW = 6;
          const chevH = 5.5;

          const tailGrad = gCtx.createLinearGradient(x - 14, cy, x, cy);
          tailGrad.addColorStop(0, 'rgba(0,0,0,0)');
          tailGrad.addColorStop(1, normX < 0.5 ? colStart : colEnd);

          gCtx.globalAlpha = 0.85 * edgeFade;
          gCtx.strokeStyle = tailGrad;
          gCtx.lineWidth = 2.2;
          gCtx.beginPath();
          gCtx.moveTo(x - 14, cy);
          gCtx.lineTo(x, cy);
          gCtx.stroke();

          gCtx.strokeStyle = normX < 0.45 ? colStart : '#fde047';
          gCtx.lineWidth = 2.1;
          gCtx.lineCap = 'round';
          gCtx.lineJoin = 'round';
          gCtx.beginPath();
          gCtx.moveTo(x - chevW, cy - chevH);
          gCtx.lineTo(x, cy);
          gCtx.lineTo(x - chevW, cy + chevH);
          gCtx.stroke();
        }
      }

      // 3. Đầu mũi tên tam giác tĩnh ở điểm chạm vào ô kế tiếp
      const headX = w - 3;
      gCtx.globalAlpha = isActiveBridge ? 0.95 : 0.45;
      gCtx.fillStyle = colEnd;
      gCtx.beginPath();
      gCtx.moveTo(headX, cy);
      gCtx.lineTo(headX - 8, cy - 5);
      gCtx.lineTo(headX - 6, cy);
      gCtx.lineTo(headX - 8, cy + 5);
      gCtx.closePath();
      gCtx.fill();
      gCtx.restore();
    });
  }

  let lastUiTick = 0;

  function renderLoop(now) {
    requestAnimationFrame(renderLoop);
    ensureMotionStage();

    const createProg = computeCreateProgress(now);
    const mcProg = computeMotionProgress(now);
    const anyWorking = createProg.working || mcProg.working;

    if (now - lastUiTick > 140) {
      lastUiTick = now;

      // 1. Đồng bộ trạng thái hoạt động toàn cục (chỉ hiện thanh #md-live-bar khi thực sự đang làm video)
      document.body.classList.toggle('md-creating-active', anyWorking);
      liveBar.hidden = !anyWorking;

      if (anyWorking) {
        const activeProg = mcProg.working ? mcProg : createProg;
        const barBadge = document.getElementById('md-live-bar-badge');
        const barMsg = document.getElementById('md-live-bar-msg');
        const barPct = document.getElementById('md-live-bar-pct');
        const barTimer = document.getElementById('md-live-bar-timer');
        if (barBadge) barBadge.textContent = mcProg.working ? 'MOTION CONTROL ĐANG CHẠY' : 'ĐANG TẠO VIDEO VEO';
        if (barMsg) barMsg.textContent = mcProg.working ? mcProg.statusLine : createProg.headline;
        if (barPct) barPct.textContent = `${activeProg.pct}%`;
        if (barTimer) barTimer.textContent = fmtMMSS(activeProg.elapsedSec);
      }

      // 2. Cập nhật giao diện Thanh Quy Trình Tạo Video (#cv-stage giống hệt Motion Control)
      const hudPct = document.getElementById('md-hud-pct');
      const createMiniFill = document.getElementById('md-create-mini-fill');
      const createOverallFill = document.getElementById('md-create-overall-fill');
      const createDisplayPct = createProg.working ? createProg.pct : 0;

      if (hudPct) hudPct.textContent = `${createDisplayPct}%`;
      if (createMiniFill) createMiniFill.style.width = `${createDisplayPct}%`;
      if (createOverallFill) createOverallFill.style.width = `${createDisplayPct}%`;

      const curModelLabel = document.getElementById('model-val')?.textContent?.trim();
      if (curModelLabel && curModelLabel !== '—') {
        document.querySelectorAll('.md-cs-model-val').forEach((el) => {
          if (el.textContent !== curModelLabel) el.textContent = curModelLabel;
        });
      }

      const createStepNodes = document.querySelectorAll('#view-create .md-mc-step');
      createStepNodes.forEach((node, idx) => {
        const isCurrent = createProg.working && idx === createProg.stepIdx;
        const isPassed = createProg.working && idx < createProg.stepIdx;
        node.classList.toggle('md-mc-step--on', isCurrent);
        node.classList.toggle('md-mc-step--done', isPassed);
        const fill = node.querySelector('.md-mc-step-bar i');
        if (fill) {
          const w = isPassed ? 100 : isCurrent ? createProg.stepProgress : 0;
          fill.style.width = `${w}%`;
        }
      });

      // 3. Cập nhật giao diện Sân khấu Motion Control (#view-motion)
      const mcLivePill = document.getElementById('md-mc-live-pill');
      const mcPctPill = document.getElementById('md-mc-pct-pill');
      const mcMiniFill = document.getElementById('md-mc-mini-fill');
      const mcOverallFill = document.getElementById('md-mc-overall-fill');
      const mcTimer = document.getElementById('md-mc-timer');
      const mcStatusEl = document.getElementById('md-mc-status-line');
      const mcStrip = document.querySelector('#view-motion .cm-panel--result .cm-strip');

      const isMcFinishedOk = !mcProg.working && mcState.job && mcState.ended && !!mcState.result?.url;
      const displayPct = mcProg.working ? mcProg.pct : (isMcFinishedOk ? 100 : 0);
      if (mcLivePill) {
        mcLivePill.textContent = mcProg.badge;
        mcLivePill.classList.toggle('md-mc-badge--live', mcProg.working);
      }
      if (mcPctPill) mcPctPill.textContent = `${displayPct}%`;
      if (mcMiniFill) mcMiniFill.style.width = `${displayPct}%`;
      if (mcOverallFill) mcOverallFill.style.width = `${displayPct}%`;
      if (mcTimer) mcTimer.textContent = fmtMMSS(mcProg.elapsedSec);
      if (mcStatusEl) mcStatusEl.textContent = mcProg.statusLine;
      if (mcStrip && !mcState.job) {
        mcStrip.textContent = mcProg.stripText;
        mcStrip.classList.toggle('cm-strip--live', mcProg.working);
      }

      const mcNodes = document.querySelectorAll('#view-motion .md-mc-step');
      mcNodes.forEach((node, idx) => {
        const isCurrent = mcProg.working && idx === mcProg.stepIdx;
        const isPassed = isMcFinishedOk || (mcProg.working && idx < mcProg.stepIdx);
        node.classList.toggle('md-mc-step--on', isCurrent);
        node.classList.toggle('md-mc-step--done', isPassed);
        const chk = node.querySelector('.md-mc-check');
        if (chk) chk.hidden = !isPassed;
        const fill = node.querySelector('.md-mc-step-bar i');
        if (fill) {
          const w = isPassed ? 100 : isCurrent ? mcProg.stepProgress : 0;
          fill.style.width = `${w}%`;
        }
      });
    }

    // Vẽ Canvas Sóng & Mũi Tên Dài cho cả Motion Control (#view-motion) và Tạo Video (#view-create)
    drawFlowPipelineCanvas('#view-motion', now, mcProg);
    drawFlowPipelineCanvas('#view-create', now, createProg);

    // Vẽ Sân Khấu Kết Xuất AI (#md-stage-canvas): Video Dải Ngân Hà Xoay Tròn 3D (Spiral Galaxy)
    if (!canvas || !ctx || canvas.offsetParent === null) return;
    if (!fitCanvas(canvas)) return;
    const w = canvas.width;
    const h = canvas.height;
    const active = createProg.working;
    const sec = now * 0.001;
    burstEnergy = Math.max(0, burstEnergy - 0.018);

    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.5;
    const cy = h * 0.44;
    const maxR = Math.min(w * 0.44, h * 0.52);

    // 1. Nền Không Gian Vũ Trụ Sâu Thẳm (Deep Cosmic Space)
    const spaceGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.max(w, h) * 0.78);
    if (active) {
      spaceGrad.addColorStop(0, 'rgba(68, 34, 14, 0.72)');
      spaceGrad.addColorStop(0.32, 'rgba(26, 22, 54, 0.65)');
      spaceGrad.addColorStop(0.65, 'rgba(10, 18, 36, 0.92)');
      spaceGrad.addColorStop(1, 'rgba(5, 8, 15, 0.99)');
    } else {
      spaceGrad.addColorStop(0, 'rgba(42, 24, 18, 0.55)');
      spaceGrad.addColorStop(0.35, 'rgba(18, 20, 44, 0.55)');
      spaceGrad.addColorStop(0.7, 'rgba(9, 14, 26, 0.92)');
      spaceGrad.addColorStop(1, 'rgba(5, 8, 14, 0.99)');
    }
    ctx.fillStyle = spaceGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Các ngôi sao xa ngoài không gian lấp lánh
    ctx.save();
    bgStars.forEach((bs) => {
      const sx = bs.x * w;
      const sy = bs.y * h;
      const twinkle = 0.25 + 0.65 * (0.5 + 0.5 * Math.sin(sec * 1.8 + bs.phase));
      ctx.globalAlpha = twinkle;
      ctx.fillStyle = bs.color;
      ctx.beginPath();
      ctx.arc(sx, sy, bs.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 3. Quầng Tinh Vân Ngân Hà Xoay Tròn (Rotating Nebula Clouds)
    const rotSpeed = active ? 0.58 + burstEnergy * 0.85 : 0.22;
    const galaxyRot = sec * rotSpeed;
    const tiltY = 0.52; // Độ nghiêng đĩa thiên hà 3D
    const tiltAngle = -0.18; // Góc nghiêng trục thiên hà

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tiltAngle);
    ctx.scale(1, tiltY);

    // Đám mây tinh vân xoắn ốc mềm mại
    for (let arm = 0; arm < GALAXY_ARMS; arm++) {
      const armBase = (arm / GALAXY_ARMS) * Math.PI * 2 - galaxyRot;
      for (let seg = 1; seg <= 6; seg++) {
        const frac = seg / 6;
        const rad = frac * maxR * 0.92;
        const ang = armBase + frac * 3.8;
        const nx = Math.cos(ang) * rad;
        const ny = Math.sin(ang) * rad;
        const nebR = maxR * (0.14 + frac * 0.16);
        const nebGrad = ctx.createRadialGradient(nx, ny, 2, nx, ny, nebR);
        const isWarm = arm % 2 === 0;
        nebGrad.addColorStop(0, isWarm
          ? (active ? 'rgba(255, 159, 28, 0.16)' : 'rgba(255, 159, 28, 0.10)')
          : (active ? 'rgba(56, 189, 248, 0.15)' : 'rgba(139, 92, 246, 0.09)'));
        nebGrad.addColorStop(0.5, isWarm
          ? 'rgba(234, 88, 12, 0.05)'
          : 'rgba(56, 189, 248, 0.04)');
        nebGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebGrad;
        ctx.beginPath();
        ctx.arc(nx, ny, nebR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Vòng quỹ đạo ánh sáng bao quanh đĩa ngân hà
    ctx.strokeStyle = active ? 'rgba(255, 159, 28, 0.22)' : 'rgba(56, 189, 248, 0.10)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, maxR * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    if (createProg.pct > 0) {
      ctx.strokeStyle = '#ff9f1c';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, maxR * 0.98, -Math.PI / 2, -Math.PI / 2 + (createProg.pct / 100) * Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // 4. Hàng trăm Ngôi Sao & Bụi Vũ Trụ Xoay Tròn trên 5 Nhánh Xoắn Ốc Dải Ngân Hà
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(tiltAngle);

    galaxyStars.forEach((st) => {
      // Các ngôi sao gần tâm quay nhanh hơn các ngôi sao ở rìa (hiệu ứng vật lý thiên hà thực tế)
      const differentialSpeed = (1.35 - st.r * 0.55) * rotSpeed;
      const curAngle = st.baseAngle - sec * differentialSpeed;
      const dist = st.r * maxR;

      const x3d = Math.cos(curAngle) * dist;
      const y3d = Math.sin(curAngle) * dist * tiltY + st.zOffset * maxR;
      const depthScale = 0.78 + 0.22 * Math.sin(curAngle);
      const twinkle = 0.55 + 0.45 * Math.sin(sec * st.twinkleSpeed + st.twinklePhase);

      if (st.isDust) {
        // Hạt bụi tinh vân phát sáng dịu
        const dustR = st.size * 3.8 * depthScale;
        const dGrad = ctx.createRadialGradient(x3d, y3d, 0, x3d, y3d, dustR);
        dGrad.addColorStop(0, st.color);
        dGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = (active ? 0.28 : 0.18) * twinkle;
        ctx.fillStyle = dGrad;
        ctx.beginPath();
        ctx.arc(x3d, y3d, dustR, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Ngôi sao sáng lấp lánh kèm vệt chuyển động khi đang kết xuất
        const starR = Math.max(0.7, st.size * depthScale * (active ? 1.18 : 1.0));
        ctx.globalAlpha = Math.min(1, (0.45 + (1 - st.r * 0.4) * 0.55) * twinkle);
        ctx.fillStyle = st.color;
        ctx.beginPath();
        ctx.arc(x3d, y3d, starR, 0, Math.PI * 2);
        ctx.fill();

        if (active && st.size > 2.1) {
          // Vệt đuôi sao xoay tròn khi đang render
          const prevAngle = curAngle + 0.09;
          const px = Math.cos(prevAngle) * dist;
          const py = Math.sin(prevAngle) * dist * tiltY + st.zOffset * maxR;
          ctx.globalAlpha = 0.32 * twinkle;
          ctx.strokeStyle = st.color;
          ctx.lineWidth = starR * 0.75;
          ctx.beginPath();
          ctx.moveTo(x3d, y3d);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
      }
    });

    // 5. Tâm Ngân Hà Rực Sáng (Galactic Core & Flare)
    const corePulse = 1 + 0.08 * Math.sin(sec * (active ? 4.5 : 2.0)) + burstEnergy * 0.25;
    const coreR = maxR * 0.28 * corePulse;
    const coreGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, coreR);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.18, '#fef08a');
    coreGrad.addColorStop(0.42, 'rgba(255, 159, 28, 0.72)');
    coreGrad.addColorStop(0.72, 'rgba(56, 189, 248, 0.22)');
    coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.globalAlpha = 1;
    ctx.save();
    ctx.scale(1, 0.68);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Tia sáng chữ thập (Starburst lens flare) tại tâm ngân hà
    const flareLen = maxR * (active ? 0.38 : 0.24) * corePulse;
    const flareGradH = ctx.createLinearGradient(-flareLen, 0, flareLen, 0);
    flareGradH.addColorStop(0, 'rgba(255, 159, 28, 0)');
    flareGradH.addColorStop(0.5, 'rgba(255, 250, 220, 0.85)');
    flareGradH.addColorStop(1, 'rgba(255, 159, 28, 0)');
    ctx.strokeStyle = flareGradH;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-flareLen, 0);
    ctx.lineTo(flareLen, 0);
    ctx.stroke();

    const flareLenV = flareLen * 0.55;
    const flareGradV = ctx.createLinearGradient(0, -flareLenV, 0, flareLenV);
    flareGradV.addColorStop(0, 'rgba(56, 189, 248, 0)');
    flareGradV.addColorStop(0.5, 'rgba(255, 255, 255, 0.75)');
    flareGradV.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.strokeStyle = flareGradV;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -flareLenV);
    ctx.lineTo(0, flareLenV);
    ctx.stroke();

    ctx.restore();
  }

  requestAnimationFrame(renderLoop);

  return {
    trigger: (promptText = '') => {
      createSubmitting = true;
      burstEnergy = 1.0;
      if (promptText && typeof promptText === 'string' && promptText.trim()) {
        lastActivePrompt = promptText.trim();
      }
    },
    stop: () => {
      createSubmitting = false;
    },
    isActive: () => createSubmitting || createRunning > 0 || createQueued > 0,
  };
}
