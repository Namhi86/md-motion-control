import { t } from './i18n.js';
import { hasError } from './setup-filter-model.js';
import { PLATFORMS, accountsOf, tabCount } from './setup-platforms.js';

// The left sidebar of the Setup screen: which groups and rows it has, the numbers on them, which row is current and where the arrow keys go.
// Pure (no DOM, no Electron): setup-side.js draws, tests/setup-side-model.test.js tests. Built like the sidebar of the studio home
// (studio/src/studio-home-side-model.js): groups with a small label, a current row, Up / Down between rows.

export const SIDE_TEXT = {
  accounts: t('Tài khoản'),
  proxy: 'Proxy',
  settings: t('Cài đặt'),
  proxyRow: t('Kho proxy'),
  settingsRow: t('Cửa sổ & trình duyệt'),
  errorDot: t('Có acc lỗi cần bạn xử lý'),
};

// The pages: 'platform' (the accounts of the open platform), 'proxy' (the proxy pool), 'settings'.
export const currentKey = (page, platform) => (page === 'platform' ? `platform:${platform}` : page);

// -> [{ id, label, rowsId?, items: [{ key, page, platform?, elId?, label, n: [first, second] | null, error, title }] }]
//   offered  the platforms to list (platformsOffered)     view  the public view of the account list     proxy  { alive, total }
// n = the two numbers on a row ("2 / 8" = ready / listed, "26 / 28" = alive / all proxies); null = none (no proxy yet, the settings row).
export function sideGroups({ offered, view, proxy, now = Date.now() }) {
  const platforms = offered.map((id) => {
    const { ready, total } = tabCount(id, view, now);
    return {
      key: `platform:${id}`, page: 'platform', platform: id, label: PLATFORMS[id].label, n: [ready, total],
      error: hasError(accountsOf(id, view), now),
      title: t('{ready} acc sẵn sàng trên tổng {total} acc dùng được cho {platform}', { ready, total, platform: PLATFORMS[id].label }),
    };
  });
  const pool = { key: 'proxy', page: 'proxy', elId: 'su-tab-proxy', label: SIDE_TEXT.proxyRow, n: proxy.total ? [proxy.alive, proxy.total] : null, error: false, title: proxy.total ? t('{alive} proxy dùng được trên tổng {total} proxy', { alive: proxy.alive, total: proxy.total }) : t('Kho proxy') };
  const set = { key: 'settings', page: 'settings', elId: 'su-tab-settings', label: SIDE_TEXT.settingsRow, n: null, error: false, title: SIDE_TEXT.settingsRow };
  return [
    { id: 'accounts', label: SIDE_TEXT.accounts, rowsId: 'su-plats', items: platforms },
    { id: 'proxy', label: SIDE_TEXT.proxy, items: [pool] },
    { id: 'settings', label: SIDE_TEXT.settings, items: [set] },
  ];
}

// Up / Down: the next / previous row, round the ends. -1 (focus is not on a row) enters at the first row going down and at the last going up. null for any other key.
export function nextRow(index, count, key) {
  if (!count || (key !== 'ArrowDown' && key !== 'ArrowUp')) return null;
  const step = key === 'ArrowDown' ? 1 : -1;
  if (index < 0) return step === 1 ? 0 : count - 1;
  return (index + step + count) % count;
}
