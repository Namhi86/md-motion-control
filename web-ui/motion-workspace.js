import { el } from './pop.js';
import { button } from './analyze-controls.js';
import { t } from './i18n.js';

// Bố cục Motion Control Studio v6:
// 1. TRÊN CÙNG (.cm-top-stepper): Thanh 4 bước + Nút chuyển 2/3 Luồng ngang + Nút ⚙️ Cài đặt mặc định (gom Ảnh 2 & Ảnh 3).
// 2. KHU VỰC GIỮA (.cm-layout.cm-streams-grid): Các luồng tạo video (như Ảnh 4) nằm chung 1 tab và xếp theo hàng ngang,
//    thu nhỏ kích cỡ từng luồng cân đối (mỗi luồng gồm cột trái Video gốc + Ảnh nhân vật và cột phải Màn hình Video gốc).
// 3. HỘP CÀI ĐẶT MẶC ĐỊNH (.cm-default-modal): Lưu trữ mặc định Ảnh 2 (Google Flow Veo, Giữ nhạc gốc, 4K 20cr, Giống gốc, Thư mục lưu)
//    và Ảnh 3 (Motion Control: Giữ gốc, Cường độ 50%, Độ mượt 70%, Bám theo nhân vật 90%).
// 4. DƯỚI CÙNG (.cm-bottom-dock): Bỏ hiệu ứng chạy chìm dưới nền, đưa hiệu ứng sóng mũi tên chạy trực tiếp vào bên trong từng ô A, B, C, D.
export function buildWorkspace() {
  const node = el('div', 'cm-ws cm-ws--studio-v5 cm-ws--multi-stream');

  // ── 1. THANH 4 BƯỚC Ở TRÊN CÙNG + NÚT CÀI ĐẶT MẶC ĐỊNH (.cm-top-stepper) ──
  const top = el('header', 'cm-top cm-top-stepper');
  const stepNames = [
    t('Nguyên liệu'),
    t('Kịch bản & Đoạn'),
    t('Tạo video'),
    t('Kết quả'),
  ];
  const pillBar = el('nav', 'cm-pills');
  const pills = stepNames.map((name, i) => {
    const pill = el('span', 'cm-pill');
    const badge = el('b', 'cm-pill-n', String(i + 1));
    pill.append(badge, el('span', 'cm-pill-label', name));
    if (i > 0) {
      const arrow = el('span', 'cm-step-arrow', '→');
      pillBar.append(arrow);
    }
    pillBar.append(pill);
    return pill;
  });

  const topRight = el('div', 'cm-top-right-tools');

  // Nút chọn số luồng hiển thị ở chế độ Motion Control (1 Luồng, 2 Luồng, 3 Luồng, 5 Luồng)
  const streamCountSwitch = el('div', 'cm-stream-count-switch');
  streamCountSwitch.innerHTML = `
    <button type="button" class="cm-sc-btn" data-cols="1" title="Hiển thị 1 luồng tạo video toàn khung">⚡ 1 Luồng</button>
    <button type="button" class="cm-sc-btn" data-cols="2" title="Hiển thị 2 luồng tạo video song song">⚡ 2 Luồng</button>
    <button type="button" class="cm-sc-btn" data-cols="3" title="Hiển thị 3 luồng tạo video song song">⚡ 3 Luồng</button>
    <button type="button" class="cm-sc-btn cm-sc-btn--on" data-cols="5" title="Hiển thị 5 luồng tạo video song song">⚡ 5 Luồng</button>
  `;

  // Ô tích chọn tất cả 5 luồng cùng chạy
  const selectAllWrap = el('label', 'cm-select-all-pill');
  selectAllWrap.title = 'Tích chọn hoặc bỏ chọn tất cả các luồng để chạy đồng loạt';
  selectAllWrap.innerHTML = `
    <input type="checkbox" class="stp-chk" id="cm-select-all-chk" checked />
    <span id="cm-select-all-label">Chọn cả 5 luồng (5/5)</span>
  `;

  // Nút mở Cài đặt mặc định (Ảnh 2 & Ảnh 3)
  const defaultSettingsBtn = el('button', 'cm-default-cfg-btn');
  defaultSettingsBtn.type = 'button';
  defaultSettingsBtn.innerHTML = `
    <span class="cm-dcfg-ico">⚙️</span>
    <span>Cài đặt mặc định: <b id="cm-dcfg-summary">Omni 1.2 Flash · 4K · Giữ nhạc gốc · Motion AI (50/70/90%)</b></span>
  `;

  const priceChip = el('span', 'cm-top-price', '');
  priceChip.hidden = true;
  topRight.append(streamCountSwitch, selectAllWrap, defaultSettingsBtn, priceChip);
  top.append(pillBar, topRight);

  // ── 2. KHU VỰC GIỮA: 5 LUỒNG MOTION CONTROL (MỖI LUỒNG NHƯ ẢNH 4 THU NHỎ) ──
  const layout = el('div', 'cm-layout cm-streams-grid');
  layout.dataset.cols = '5';

  function createStreamUnit(index) {
    const unit = el('article', 'cm-stream-unit');
    unit.dataset.stream = String(index);
    if (index === 1) unit.classList.add('cm-stream-unit--active');

    const code = String(index).padStart(2, '0');
    // Cột trái của luồng: NGUYÊN LIỆU & CẤU HÌNH AI (Chỉ gồm Video gốc + Ảnh nhân vật như Ảnh 4)
    const side = el('aside', 'cm-side');
    const sideHeader = el('div', 'cm-side-header');
    sideHeader.innerHTML = `
      <div class="cm-side-header-left">
        <span class="cm-side-header-ico">🥞</span>
        <span>NGUYÊN LIỆU &amp; AI</span>
      </div>
      <label class="cm-stream-pick" title="Tích chọn luồng này để chạy cùng lúc">
        <input type="checkbox" class="stp-chk cm-stream-chk" data-stream="${index}" checked />
        <span class="cm-stream-badge">LUỒNG ${code}</span>
      </label>
    `;
    const checkInput = sideHeader.querySelector('.cm-stream-chk');

    const sideTabs = el('div', 'cm-side-tabs');
    sideTabs.innerHTML = `
      <button type="button" class="cm-side-tab cm-side-tab--on" data-target="video">
        <span>📥</span><span>Video gốc</span>
      </button>
      <button type="button" class="cm-side-tab" data-target="image">
        <span>👤</span><span>Ảnh nhân vật</span>
      </button>
    `;

    const sideScroll = el('div', 'cm-side-scroll');
    const streamActionBar = el('div', 'cm-stream-action-bar');
    const createBtn = el('button', 'cm-stream-create-btn');
    createBtn.type = 'button';
    createBtn.dataset.stream = String(index);
    createBtn.innerHTML = `<span>✨</span><span class="cm-stream-create-label">Tạo video (L${code})</span>`;
    streamActionBar.append(createBtn);
    side.append(sideHeader, sideTabs, sideScroll, streamActionBar);

    sideTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.cm-side-tab');
      if (!btn) return;
      sideTabs.querySelectorAll('.cm-side-tab').forEach((b) => b.classList.toggle('cm-side-tab--on', b === btn));
      const targetType = btn.dataset.target;
      const cards = sideScroll.querySelectorAll('.cm-source > div');
      const targetEl = targetType === 'image' ? cards[1] : cards[0];
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        const clickable = targetEl.querySelector('.cm-add, .cm-drop, button');
        if (targetType === 'image' && clickable && clickable.classList.contains('cm-add')) {
          clickable.focus();
        }
      }
    });

    // Cột phải của luồng: Màn hình VIDEO GỐC kèm sóng nhạc vàng cam 2 bên (như Ảnh 4)
    const centerStage = el('section', 'cm-center-stage');
    const goldenBackdrop = el('div', 'cm-golden-backdrop');
    goldenBackdrop.setAttribute('aria-hidden', 'true');
    goldenBackdrop.innerHTML = `
      <div class="cm-golden-eq cm-golden-eq--left">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
      <div class="cm-golden-rings">
        <span class="cm-golden-ring cm-golden-ring--outer"></span>
        <span class="cm-golden-ring cm-golden-ring--inner"></span>
      </div>
      <div class="cm-golden-eq cm-golden-eq--right">
        <i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i>
      </div>
    `;
    const players = el('div', 'cm-players');
    centerStage.append(goldenBackdrop, players);

    unit.append(side, centerStage);
    return { unit, side: sideScroll, players, centerStage, createBtn, checkInput };
  }

  const allStreams = Array.from({ length: 5 }, (_, idx) => {
    const st = createStreamUnit(idx + 1);
    st.unit.hidden = false; // Mặc định hiển thị đủ 5 luồng ở chế độ Motion Control
    layout.append(st.unit);
    return st;
  });
  const stream1 = allStreams[0];

  const selectAllChk = selectAllWrap.querySelector('#cm-select-all-chk');
  const selectAllLabel = selectAllWrap.querySelector('#cm-select-all-label');

  function syncSelectAllState() {
    const visibleStreams = allStreams.filter((st) => !st.unit.hidden);
    const checkedCount = visibleStreams.filter((st) => st.checkInput?.checked).length;
    const totalVisible = visibleStreams.length || 5;
    if (selectAllChk) {
      selectAllChk.checked = checkedCount === totalVisible && totalVisible > 0;
      selectAllChk.indeterminate = checkedCount > 0 && checkedCount < totalVisible;
    }
    if (selectAllLabel) {
      selectAllLabel.textContent = `Chọn cả ${totalVisible} luồng (${checkedCount}/${totalVisible})`;
    }
    allStreams.forEach((st) => {
      st.unit.classList.toggle('cm-stream-unit--unchecked', !st.checkInput?.checked);
    });
    window.dispatchEvent(new CustomEvent('md:motion-checks-changed'));
  }

  selectAllChk?.addEventListener('change', () => {
    const checked = !!selectAllChk.checked;
    allStreams.forEach((st) => {
      if (!st.unit.hidden && st.checkInput) {
        st.checkInput.checked = checked;
      }
    });
    syncSelectAllState();
  });

  allStreams.forEach((st) => {
    st.checkInput?.addEventListener('change', syncSelectAllState);
  });

  streamCountSwitch.addEventListener('click', (e) => {
    const btn = e.target.closest('.cm-sc-btn');
    if (!btn) return;
    const cols = btn.dataset.cols || '5';
    const maxCols = Number(cols) || 5;
    streamCountSwitch.querySelectorAll('.cm-sc-btn').forEach((b) => b.classList.toggle('cm-sc-btn--on', b === btn));
    layout.dataset.cols = cols;
    allStreams.forEach((st, idx) => {
      st.unit.hidden = idx >= maxCols;
    });
    syncSelectAllState();
  });

  // ── 3. HỘP CÀI ĐẶT MẶC ĐỊNH (GOM ẢNH 2 & ẢNH 3 VÀO CÀI ĐẶT MẶC ĐỊNH) ──
  const settingsModal = el('div', 'cm-default-modal');
  settingsModal.hidden = true;

  const settingsCard = el('div', 'cm-default-modal-card');
  const settingsHead = el('div', 'cm-default-modal-head');
  settingsHead.innerHTML = `
    <div class="cm-default-modal-title">
      <span>⚙️</span>
      <div>
        <b>CÀI ĐẶT MẶC ĐỊNH — GOOGLE FLOW &amp; MOTION CONTROL</b>
        <small>Các thông số dưới đây được áp dụng mặc định cho mọi luồng tạo video</small>
      </div>
    </div>
    <button type="button" class="cm-default-modal-close" id="cm-close-default-cfg">✓ Đóng &amp; Áp dụng</button>
  `;

  const settingsBody = el('div', 'cm-default-modal-body');
  // Cột trái của hộp Cài đặt mặc định: Chứa Ảnh 2 (Nền tảng tạo, Chế độ âm thanh, Chất lượng 4K, Khung hình Giống gốc, Thư mục lưu phim)
  const defaultLeftPane = el('div', 'cm-default-pane cm-default-pane--left');

  // Cột phải của hộp Cài đặt mặc định: Chứa Ảnh 3 (Motion Control: Giữ gốc, 50%, 70%, 90%)
  const rightCard = el('aside', 'cm-motion-ctrl-card');
  rightCard.innerHTML = `
    <div class="cm-mctrl-head">
      <div class="cm-mctrl-title-wrap">
        <span class="cm-mctrl-ico">🏃</span>
        <div class="cm-mctrl-titles">
          <b>Motion Control</b>
          <span>(Điều khiển chuyển động)</span>
        </div>
      </div>
      <label class="cm-mctrl-switch" title="Bật/tắt điều khiển chuyển động thông minh">
        <input type="checkbox" checked id="cm-mctrl-toggle" />
        <span class="cm-mctrl-slider"></span>
      </label>
    </div>

    <div class="cm-mctrl-section">
      <span class="cm-mctrl-label">Kiểu chuyển động</span>
      <div class="cm-mctrl-modes" id="cm-mctrl-modes">
        <button type="button" class="cm-mctrl-mode cm-mctrl-mode--on" data-mode="original" data-s1="50" data-s2="70" data-s3="90">
          <span class="cm-mctrl-mode-ico">▶️</span>
          <span>Giữ gốc</span>
        </button>
        <button type="button" class="cm-mctrl-mode" data-mode="segment" data-s1="65" data-s2="75" data-s3="85">
          <span class="cm-mctrl-mode-ico">🔀</span>
          <span>Theo đoạn</span>
        </button>
        <button type="button" class="cm-mctrl-mode" data-mode="custom" data-s1="80" data-s2="65" data-s3="92">
          <span class="cm-mctrl-mode-ico">🎚️</span>
          <span>Tùy chỉnh</span>
        </button>
        <button type="button" class="cm-mctrl-mode" data-mode="ai" data-s1="60" data-s2="88" data-s3="95">
          <span class="cm-mctrl-mode-ico">✨</span>
          <span>AI đề xuất</span>
        </button>
      </div>
    </div>

    <div class="cm-mctrl-sliders">
      <div class="cm-mctrl-srow">
        <div class="cm-mctrl-stop">
          <span>Cường độ chuyển động</span>
          <b id="cm-val-intensity">50%</b>
        </div>
        <input type="range" min="10" max="100" value="50" class="cm-mctrl-range" id="cm-rng-intensity" style="--val: 50%" />
      </div>

      <div class="cm-mctrl-srow">
        <div class="cm-mctrl-stop">
          <span>Độ mượt</span>
          <b id="cm-val-smooth">70%</b>
        </div>
        <input type="range" min="10" max="100" value="70" class="cm-mctrl-range" id="cm-rng-smooth" style="--val: 70%" />
      </div>

      <div class="cm-mctrl-srow">
        <div class="cm-mctrl-stop">
          <span>Bám theo nhân vật</span>
          <b id="cm-val-track">90%</b>
        </div>
        <input type="range" min="10" max="100" value="90" class="cm-mctrl-range" id="cm-rng-track" style="--val: 90%" />
      </div>
    </div>

    <button type="button" class="cm-mctrl-opt-btn" id="cm-mctrl-opt-btn">
      <span>✨</span>
      <span id="cm-mctrl-opt-text">Tự động tối ưu (AI)</span>
    </button>
  `;

  settingsBody.append(defaultLeftPane, rightCard);
  settingsCard.append(settingsHead, settingsBody);
  settingsModal.append(settingsCard);

  defaultSettingsBtn.addEventListener('click', () => {
    settingsModal.hidden = !settingsModal.hidden;
  });
  settingsHead.querySelector('#cm-close-default-cfg')?.addEventListener('click', () => {
    settingsModal.hidden = true;
  });
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.hidden = true;
  });

  // Tương tác cho các nút Kiểu chuyển động & Thanh trượt trong bảng Motion Control
  const syncSlider = (input, badgeId) => {
    if (!input) return;
    const v = `${input.value}%`;
    input.style.setProperty('--val', v);
    const badge = rightCard.querySelector(`#${badgeId}`);
    if (badge) badge.textContent = v;
  };
  const rng1 = rightCard.querySelector('#cm-rng-intensity');
  const rng2 = rightCard.querySelector('#cm-rng-smooth');
  const rng3 = rightCard.querySelector('#cm-rng-track');
  rng1?.addEventListener('input', () => syncSlider(rng1, 'cm-val-intensity'));
  rng2?.addEventListener('input', () => syncSlider(rng2, 'cm-val-smooth'));
  rng3?.addEventListener('input', () => syncSlider(rng3, 'cm-val-track'));

  rightCard.querySelector('#cm-mctrl-modes')?.addEventListener('click', (e) => {
    const mBtn = e.target.closest('.cm-mctrl-mode');
    if (!mBtn) return;
    rightCard.querySelectorAll('.cm-mctrl-mode').forEach((b) => b.classList.toggle('cm-mctrl-mode--on', b === mBtn));
    if (rng1 && mBtn.dataset.s1) { rng1.value = mBtn.dataset.s1; syncSlider(rng1, 'cm-val-intensity'); }
    if (rng2 && mBtn.dataset.s2) { rng2.value = mBtn.dataset.s2; syncSlider(rng2, 'cm-val-smooth'); }
    if (rng3 && mBtn.dataset.s3) { rng3.value = mBtn.dataset.s3; syncSlider(rng3, 'cm-val-track'); }
  });

  rightCard.querySelector('#cm-mctrl-opt-btn')?.addEventListener('click', () => {
    const aiModeBtn = rightCard.querySelector('.cm-mctrl-mode[data-mode="ai"]');
    if (aiModeBtn) aiModeBtn.click();
    const optTxt = rightCard.querySelector('#cm-mctrl-opt-text');
    if (optTxt) {
      optTxt.textContent = 'Đã tối ưu thông số AI ✓';
      setTimeout(() => { optTxt.textContent = 'Tự động tối ưu (AI)'; }, 2200);
    }
  });

  // Ẩn khung Timeline phụ nhưng giữ trong DOM để logic đoạn & giá hoạt động
  const zone = el('div', 'cm-zone cm-zone--hidden');
  zone.hidden = true;
  layout.append(zone);

  // ── 4. THANH DƯỚI CÙNG: BỎ HIỆU ỨNG CHẠY CHÌM Ở DƯỚI, ĐƯA HIỆU ỨNG VÀO TỪNG Ô A - B - C - D ──
  const bottomDock = el('section', 'cm-bottom-dock');
  const status = el('div', 'cm-status cm-status-floating');
  const flowBar = el('div', 'cm-flow-dock');
  flowBar.innerHTML = `
    <div class="cm-flow-center">
      <div class="md-mc-steps" id="md-mc-steps">
        <div class="md-mc-step md-mc-step--a" data-mc-step="0">
          <canvas class="md-mc-box-canvas" width="240" height="44"></canvas>
          <span class="md-mc-step-name">Phân tích &amp; Cắt đoạn <i class="md-mc-check" hidden>✓</i></span>
          <div class="md-mc-step-bar"><i></i></div>
        </div>
        <div class="md-mc-arrow-bridge" aria-hidden="true">
          <canvas class="md-mc-bridge-canvas" width="160" height="28"></canvas>
        </div>

        <div class="md-mc-step md-mc-step--b" data-mc-step="1">
          <canvas class="md-mc-box-canvas" width="240" height="44"></canvas>
          <span class="md-mc-step-name">Khóa Nhân vật AI <i class="md-mc-check" hidden>✓</i></span>
          <div class="md-mc-step-bar"><i></i></div>
        </div>
        <div class="md-mc-arrow-bridge" aria-hidden="true">
          <canvas class="md-mc-bridge-canvas" width="160" height="28"></canvas>
        </div>

        <div class="md-mc-step md-mc-step--c" data-mc-step="2">
          <canvas class="md-mc-box-canvas" width="240" height="44"></canvas>
          <span class="md-mc-step-name">Kết xuất Google Flow <i class="md-mc-check" hidden>✓</i></span>
          <div class="md-mc-step-bar"><i></i></div>
        </div>
        <div class="md-mc-arrow-bridge" aria-hidden="true">
          <canvas class="md-mc-bridge-canvas" width="160" height="28"></canvas>
        </div>

        <div class="md-mc-step md-mc-step--d" data-mc-step="3">
          <canvas class="md-mc-box-canvas" width="240" height="44"></canvas>
          <span class="md-mc-step-name">Ghép Phim Hoàn chỉnh <i class="md-mc-check" hidden>✓</i></span>
          <div class="md-mc-step-bar"><i></i></div>
        </div>
      </div>
      <div class="cm-flow-overall-track">
        <i id="md-mc-overall-fill" style="width: 0%"></i>
      </div>
    </div>

    <div class="cm-flow-right">
      <div class="cm-flow-prog-box">
        <div class="cm-flow-prog-head">
          <span>Tiến độ:</span>
          <b id="md-mc-pct-pill">0%</b>
        </div>
        <div class="cm-flow-prog-bar">
          <i id="md-mc-mini-fill" style="width: 0%"></i>
        </div>
      </div>
      <div class="cm-side-foot cm-command-actions" id="cm-bottom-actions"></div>
    </div>
  `;
  const foot = flowBar.querySelector('#cm-bottom-actions');
  bottomDock.append(status, flowBar);

  node.append(top, layout, settingsModal, bottomDock);

  return {
    node,
    side: stream1.side,
    players: stream1.players,
    streams: allStreams,
    defaultLeftPane,
    settingsModal,
    foot,
    bottomDock,
    status,
    zone,
    setStage: (step) => pills.forEach((p, i) => {
      const isDone = step > i + 1;
      const isOn = step === i + 1;
      p.className = `cm-pill${isOn ? ' cm-pill--on' : isDone ? ' cm-pill--done' : ''}`;
      const b = p.querySelector('.cm-pill-n');
      if (b) b.textContent = isDone ? '✓' : String(i + 1);
      if (isOn) p.setAttribute('aria-current', 'step');
      else p.removeAttribute?.('aria-current');
    }),
    setPrice: (text) => {
      priceChip.textContent = text;
      priceChip.hidden = !text;
    },
    setZone: (child) => zone.replaceChildren(child),
    setRestored: (on) => node.classList.toggle('cm-ws--restored', on),
  };
}
