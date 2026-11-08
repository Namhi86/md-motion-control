// Tham số dòng lệnh khởi chạy Chrome/Edge cho các phiên làm việc tự động
// Mặc định đặt --window-position=-32000,-32000 để mọi cửa sổ Chrome chạy ngầm đều ẩn hoàn toàn,
// chỉ khi người dùng bấm Đăng nhập thì mới đưa cửa sổ lên màn hình chính.
export const BASE_ARGS = [
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-blink-features=AutomationControlled',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-extensions',
  '--disable-component-update',
  '--disable-features=Translate,MediaRouter',
  '--mute-audio',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--disable-quic',
  '--disable-popup-blocking',
  '--window-position=-32000,-32000',
];

export const DEFAULT_LANG = 'vi-VN';

export const DEFAULT_SIZE = Object.freeze({
  width: 1280,
  height: 800,
});

const TAG = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/;

const cleanLang = (val) =>
  TAG.test(String(val || '')) ? String(val) : DEFAULT_LANG;

const cleanLangList = (val) => {
  const parts = String(val || '')
    .split(',')
    .map((s) => s.trim());
  return parts.length && parts.length <= 6 && parts.every((p) => TAG.test(p))
    ? parts.join(',')
    : DEFAULT_LANG;
};

const cleanSize = (size) => {
  const w = Number(size?.width);
  const h = Number(size?.height);
  return Number.isInteger(w) &&
    Number.isInteger(h) &&
    w >= 320 &&
    h >= 240 &&
    w <= 4000 &&
    h <= 3000
    ? { width: w, height: h }
    : DEFAULT_SIZE;
};

export function proxyArgs(proxy) {
  if (!proxy?.host || !proxy?.port) return [];
  const scheme = proxy.scheme === 'https' ? 'https' : 'http';
  return [
    `--proxy-server=${scheme}://${proxy.host}:${proxy.port}`,
    '--proxy-bypass-list=<-loopback>',
  ];
}

export function chromeArgs({
  profileDir,
  proxy = null,
  lang = DEFAULT_LANG,
  size = DEFAULT_SIZE,
  extra = [],
} = {}) {
  if (
    typeof profileDir !== 'string' ||
    (!profileDir.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(profileDir))
  ) {
    throw new TypeError('profileDir must be an absolute path');
  }
  const { width, height } = cleanSize(size);
  return [
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    ...BASE_ARGS,
    `--lang=${cleanLang(String(lang || '').split(',')[0].trim())}`,
    `--accept-lang=${cleanLangList(lang)}`,
    `--window-size=${width},${height}`,
    ...proxyArgs(proxy),
    ...extra,
    'about:blank',
  ];
}

export function parseDevToolsActivePort(raw) {
  const [portLine, pathLine] = String(raw || '')
    .split('\n')
    .map((s) => s.trim());
  if (
    !/^\d{2,5}$/.test(portLine || '') ||
    !/^\/devtools\/browser\/[\w-]+$/.test(pathLine || '')
  ) {
    return null;
  }
  return `ws://127.0.0.1:${Number(portLine)}${pathLine}`;
}

export function chromeCandidates({
  platform,
  env = {},
  home = '',
} = {}) {
  const custom = env.QS_CHROME_PATH ? [env.QS_CHROME_PATH] : [];
  if (platform === 'darwin') {
    return [
      ...custom,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      `${home}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`,
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  if (platform === 'win32') {
    const roots = [
      env.ProgramFiles || 'C:/Program Files',
      env['ProgramFiles(x86)'] || 'C:/Program Files (x86)',
      env.LOCALAPPDATA || '',
    ];
    return [
      ...custom,
      ...roots
        .filter(Boolean)
        .flatMap((root) => [
          `${root}/Google/Chrome/Application/chrome.exe`,
          `${root}/Microsoft/Edge/Application/msedge.exe`,
        ]),
    ];
  }
  return custom;
}

export const bundleOf = (binPath) =>
  /^(.*?\.app)\/Contents\/MacOS\//.exec(String(binPath || ''))?.[1] || '';

export const MAX_PROXY_ASKS = 6;
