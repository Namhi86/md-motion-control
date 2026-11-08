import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const PRELOAD_PATH = path.join(ROOT, 'electron', 'preload.cjs');
const RENDERER_HTML_PATH = path.join(ROOT, 'electron', 'renderer.html');
const MOTION_CSS_PATH = path.join(ROOT, 'electron', 'motion.css');
const MOTION_UI_PATH = path.join(ROOT, 'electron', 'motion-ui.js');
const BAT_PATH = path.join(ROOT, 'CHAY-MD-MOTION-CONTROL.bat');

/**
 * Nạp preload.cjs trong môi trường giả lập Electron để lấy đối tượng `window.dola` thật.
 */
function loadPreloadDola() {
  const code = fs.readFileSync(PRELOAD_PATH, 'utf8');
  const invoked = [];
  const listeners = new Map();
  let exposedName = '';
  let exposedApi = null;

  const fakeElectron = {
    contextBridge: {
      exposeInMainWorld(name, api) {
        exposedName = name;
        exposedApi = api;
      },
    },
    ipcRenderer: {
      invoke(channel, ...args) {
        invoked.push({ channel, args });
        return Promise.resolve({ ok: true, channel, args });
      },
      on(channel, handler) {
        listeners.set(channel, handler);
      },
      removeListener(channel) {
        listeners.delete(channel);
      },
    },
    webUtils: {
      getPathForFile(file) {
        return file?.path || '';
      },
    },
  };

  const sandbox = {
    require(mod) {
      if (mod === 'electron') return fakeElectron;
      throw new Error(`Unexpected require: ${mod}`);
    },
    process: { env: {} },
    console,
  };

  vm.runInNewContext(code, sandbox, { filename: PRELOAD_PATH });
  return { exposedName, dola: exposedApi, invoked, listeners };
}

test('1. preload.cjs giữ nguyên 100% các kênh gốc và bổ sung đầy đủ kênh MD Viral Gate + Motion Control', async () => {
  const { exposedName, dola, invoked } = loadPreloadDola();
  assert.equal(exposedName, 'dola');
  assert.ok(dola && typeof dola === 'object', 'window.dola phải được expose');

  // Kiểm tra toàn bộ các kênh gốc trong window.dola
  const requiredTopKeys = [
    'ready',
    'meta',
    'options',
    'pickImages',
    'pickSkill',
    'openMdStudio',
    'auth',
    'gate',
    'admin',
    'queue',
    'library',
    'media',
    'elements',
    'skills',
    'studio',
    'studioBoards',
    'studioTemplates',
    'templates',
    'analyze',
    'accounts',
    'muse',
    'proxies',
    'elevenlabs',
    'voice',
    'motion',
    'browser',
    'update',
  ];

  for (const key of requiredTopKeys) {
    assert.ok(key in dola, `window.dola thiếu kênh gốc bắt buộc: ${key}`);
  }

  // Kiểm tra các hàm mở rộng trong window.dola.gate
  const requiredGateMethods = [
    'state',
    'claim',
    'checkNow',
    'openPost',
    'openZalo',
    'activateVip',
    'setConfig',
    'onChanged',
  ];
  for (const fnName of requiredGateMethods) {
    assert.equal(typeof dola.gate[fnName], 'function', `window.dola.gate.${fnName} phải là hàm`);
  }

  await dola.gate.openZalo();
  await dola.gate.activateVip('MDVIP_123456');
  await dola.gate.setConfig({ post_url: 'https://www.facebook.com/share/p/1/' });

  const calledChannels = invoked.map((item) => item.channel);
  assert.ok(calledChannels.includes('gate:openZalo'), 'Phải gọi kênh gate:openZalo');
  assert.ok(calledChannels.includes('gate:activateVip'), 'Phải gọi kênh gate:activateVip');
  assert.ok(calledChannels.includes('gate:setConfig'), 'Phải gọi kênh gate:setConfig');

  // Kiểm tra đầy đủ các phương thức của window.dola.motion
  const requiredMotionMethods = [
    'pickVideo',
    'dropVideo',
    'prepare',
    'replan',
    'start',
    'retry',
    'cancel',
    'status',
    'close',
    'session',
    'saveDraft',
    'discardSession',
    'onProgress',
  ];
  for (const fnName of requiredMotionMethods) {
    assert.equal(typeof dola.motion[fnName], 'function', `window.dola.motion.${fnName} phải là hàm`);
  }
  assert.equal(typeof dola.motion.dir.get, 'function');
  assert.equal(typeof dola.motion.dir.choose, 'function');
  assert.equal(typeof dola.motion.dir.open, 'function');
});

test('2. renderer.html giữ nguyên 100% ID của MD Motion Control gốc và có đầy đủ ID của view-motion + md-gate-overlay', () => {
  const html = fs.readFileSync(RENDERER_HTML_PATH, 'utf8');

  assert.match(html, /MD Motion Control\s*·\s*AI Video Studio/, 'Phải có thương hiệu MD Motion Control · AI Video Studio');
  assert.match(html, /<link\s+rel="stylesheet"\s+href="motion\.css"\s*\/?>/, 'Phải nhúng motion.css');
  assert.match(html, /<script\s+type="module"\s+src="renderer\.js"><\/script>/, 'Phải giữ script renderer.js');
  assert.match(html, /<script\s+type="module"\s+src="motion-ui\.js"><\/script>/, 'Phải thêm script motion-ui.js');

  // Danh sách các ID gốc của MD Motion Control (view-create, view-setup, popups)
  const originalMdMotionIds = [
    'nav-create',
    'nav-setup',
    'nav-badge',
    'view-create',
    'card-sub',
    'refs',
    'skill-row',
    'prompt',
    'import-file',
    'prompt-count',
    'model-btn',
    'model-val',
    'dur-btn',
    'dur-val',
    'ratio-btn',
    'ratio-val',
    'mode-btn',
    'mode-val',
    'mount-queue-settings',
    'mount-save-dir',
    'generate',
    'gen-label',
    'gen-icon',
    'warn',
    'qm-open',
    'tab-hist',
    'hist-badge',
    'mount-queue-stats',
    'mount-queue-actions',
    'mount-queue',
    'history',
    'hist-empty',
    'view-setup',
    'su-tab-accounts',
    'su-tab-proxy',
    'su-tab-proxy-n',
    'su-types',
    'su-accounts',
    'su-show',
    'su-show-box',
    'su-browser',
    'su-browser-name',
    'su-browser-desc',
    'su-browser-box',
    'su-browser-hint',
    'su-form-title',
    'su-cookies',
    'su-add',
    'su-msg',
    'su-hint',
    'su-kinds',
    'su-table-count',
    'su-table',
    'mount-proxies',
    'backdrop',
    'pop',
  ];

  for (const id of originalMdMotionIds) {
    assert.match(html, new RegExp(`id="${id}"`), `renderer.html thiếu ID gốc của MD Motion Control: #${id}`);
  }

  // Danh sách các ID bắt buộc của Motion Control & MD Viral Gate
  const motionAndGateIds = [
    'nav-motion',
    'gate-status-btn',
    'view-motion',
    'mc-video-drop',
    'mc-video-pick-btn',
    'mc-translate-select',
    'mc-prepare-btn',
    'mc-engine-select',
    'mc-pick-images-btn',
    'mc-images-grid',
    'mc-subject-input',
    'mc-scene-input',
    'mc-language-input',
    'mc-voice-input',
    'mc-ratio-select',
    'mc-resolution-select',
    'mc-name-input',
    'mc-dir-choose-btn',
    'mc-dir-open-btn',
    'mc-cost-summary',
    'mc-start-btn',
    'mc-cancel-btn',
    'mc-waveform',
    'mc-replan-btn',
    'mc-discard-btn',
    'mc-segments-list',
    'mc-result-box',
    'mc-result-video',
    'md-gate-overlay',
    'gate-code-val',
    'gate-copy-btn',
    'gate-fb-btn',
    'gate-fb-status',
    'gate-zalo-btn',
    'gate-zalo-status',
    'gate-check-btn',
    'gate-msg',
    'gate-vip-input',
    'gate-vip-btn',
    'gate-cfg-fb',
    'gate-cfg-zalo',
    'gate-cfg-save',
  ];

  for (const id of motionAndGateIds) {
    assert.match(html, new RegExp(`id="${id}"`), `renderer.html thiếu ID mới: #${id}`);
  }
});

test('3. motion-ui.js, motion.css và CHAY-MD-MOTION-CONTROL.bat đồng bộ với contract', () => {
  assert.ok(fs.existsSync(MOTION_CSS_PATH), 'motion.css phải tồn tại');
  assert.ok(fs.existsSync(MOTION_UI_PATH), 'motion-ui.js phải tồn tại');
  assert.ok(fs.existsSync(BAT_PATH), 'CHAY-MD-MOTION-CONTROL.bat phải tồn tại');

  const uiCode = fs.readFileSync(MOTION_UI_PATH, 'utf8');

  // Kiểm tra motion-ui.js gọi đầy đủ các API của window.dola.motion & window.dola.gate
  const expectedCalls = [
    'pickVideo',
    'dropVideo',
    'prepare',
    'replan',
    'start',
    'retry',
    'cancel',
    'status',
    'close',
    'session',
    'saveDraft',
    'discardSession',
    'onProgress',
    'openPost',
    'openZalo',
    'checkNow',
    'activateVip',
    'setConfig',
  ];

  for (const method of expectedCalls) {
    assert.ok(uiCode.includes(method), `motion-ui.js phải kết nối phương thức ${method}`);
  }

  const batContent = fs.readFileSync(BAT_PATH, 'utf8');
  assert.ok(
    batContent.includes('MD Motion Control.exe') || batContent.includes('electron'),
    'File .bat phải có lệnh khởi chạy Electron / MD Motion Control.exe'
  );
});
