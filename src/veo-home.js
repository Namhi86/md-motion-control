// Nhận diện trạng thái trang chủ Google Flow (flow.google.com & labs.google/fx/tools/flow)
const SIGN_IN_HREF =
  /accounts\.google\.com\/(?:ServiceLogin|signin|v\d+\/signin|AccountChooser|o\/oauth2)|\/auth\/(?:signin|login)/i;

export const ACCOUNT_BUTTON_LABELS = [
  'Account details',
  'Thông tin về tài khoản',
  'Google Account',
  'Tài khoản Google',
];

export const ACCOUNT_BUTTON_SELECTOR = ACCOUNT_BUTTON_LABELS.map(
  (lbl) => `[aria-label*="${lbl}"]`
).join(', ');

export const NEW_PROJECT_WORDS =
  /new project|dự án mới|create with flow|tạo bằng flow|create project|start creating/i;

const CREDITS_LINE =
  /(\d[\d.,]*)\s+(?:Google Flow credits|tín\s+dụng\s+Google\s+Flow(?!\s+mỗi\s+tháng))/i;

export function creditsInText(text) {
  const m = CREDITS_LINE.exec(String(text ?? ''));
  const num = m ? Number(m[1].replace(/\D/g, '')) : NaN;
  return Number.isFinite(num) ? num : null;
}

export const FLOW_HOME_SNAPSHOT = `(() => {
  const SIGN_IN = ${SIGN_IN_HREF};
  const ACCOUNT = ${JSON.stringify(ACCOUNT_BUTTON_LABELS)};
  const walk = (root, acc = []) => {
    for (const el of root.querySelectorAll('*')) {
      acc.push(el);
      if (el.shadowRoot) walk(el.shadowRoot, acc);
    }
    return acc;
  };
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  };
  const all = walk(document);
  const signInLinks = all.filter((e) => ['href', 'formaction', 'data-href'].some((a) => SIGN_IN.test(e.getAttribute(a) || '')) && shown(e)).length;
  const accountButton = all.some((e) => {
    const aria = String(e.getAttribute('aria-label') || '');
    return ACCOUNT.some((lbl) => aria === lbl || aria.startsWith(lbl));
  });
  return {
    url: location.href,
    text: (document.body ? document.body.innerText : '').replace(/\\s+/g, ' ').trim(),
    accountButton,
    signInLinks
  };
})()`;

const LANDING_PATH = /^\/about(?:\/|$)/;

function whereIs(url) {
  try {
    const parsed = new URL(String(url));
    return { host: parsed.hostname, path: parsed.pathname };
  } catch {
    return { host: '', path: '' };
  }
}

export function classifyFlowHome(snap) {
  if (!snap || typeof snap !== 'object') return 'not_ready';
  const { host, path } = whereIs(snap.url);
  const text = String(snap.text ?? '');
  const hasNewProject = NEW_PROJECT_WORDS.test(text);

  // Nếu đã thấy nút Tài khoản Google hoặc nút New project / Create with Flow trên trang Flow
  if (snap.accountButton) return 'ready';
  if (LANDING_PATH.test(path) || host === 'accounts.google.com') {
    return 'not_logged_in';
  }
  if (hasNewProject) return 'ready';
  if (Number(snap.signInLinks) > 0) return 'not_logged_in';
  if ((host === 'flow.google.com' || host === 'labs.google') && text.length > 40 && !/sign in|đăng nhập/i.test(text)) {
    return 'ready';
  }
  return /sign in|đăng nhập/i.test(text) && !/Google Account|Tài khoản Google/i.test(text)
    ? 'not_logged_in'
    : 'not_ready';
}
