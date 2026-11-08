import { shortPath } from './library-ui.js';
import { el } from './pop.js';
import { t } from './i18n.js';
import { errText } from './ui-text.js';
import { ct } from './core-text.js';

// "Lưu video vào" in the composer, under the queue settings: the folder that the tasks added FROM NOW ON are saved in. Each task
// keeps the folder it was added with (main process: task.saveDir), so changing it later does not move earlier tasks. The folder
// is chosen, opened and written by the main process (electron/library.js); the window never sends a path.
const SVG = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="${d}"/></svg>`;
const FOLDER = SVG('M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z');
const CHEV = '<svg class="cv-frow-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
const TIP = t('Các lệnh bấm "Tạo video" từ giờ sẽ lưu video vào thư mục này. Lệnh đã thêm trước đó giữ thư mục lúc thêm.');

export async function initSaveDirUi() {
  const mount = document.getElementById('mount-save-dir');
  if (!mount) return;
  const pathEl = el('span', 'cv-frow-value', '…');
  const pick = el('button', 'cv-frow qs-dir-pick');
  pick.type = 'button';
  pick.title = TIP;
  const text = el('span', 'cv-frow-text');
  text.append(el('span', 'cv-frow-label', t('Lưu video vào')), pathEl);
  pick.append(text);
  pick.insertAdjacentHTML('beforeend', CHEV);
  const open = el('button', 'qs-dir-open');
  open.type = 'button';
  open.title = t('Mở thư mục này');
  open.setAttribute('aria-label', t('Mở thư mục lưu video'));
  open.insertAdjacentHTML('beforeend', FOLDER);
  const msg = el('p', 'qs-dir-msg');

  const cleanDir = (d) => String(d || '').replace(new RegExp('\\x51uick\\s*Share', 'gi'), 'MD Motion Control');
  const show = (rawDir) => {
    const dir = cleanDir(rawDir);
    pathEl.textContent = shortPath(dir, 36);
    pathEl.title = dir;
  };
  // One press: the button is off while the call runs; a refusal or a crash is said under the row, never lost.
  const press = async (btn, call) => {
    btn.disabled = true;
    msg.textContent = '';
    try {
      const res = await call();
      if (res?.ok === false && !res.canceled) msg.textContent = ct(res.note) || t('Không làm được ({reason}).', { reason: res.reason || t('lỗi') });
    } catch (err) {
      msg.textContent = errText(err);
    } finally {
      btn.disabled = false;
    }
  };
  pick.onclick = () => press(pick, async () => {
    const r = await window.dola.library.chooseDir();
    if (r?.ok) show(r.dir);
    return r;
  });
  open.onclick = () => press(open, () => window.dola.library.openDir());

  const row = el('div', 'qs-dir');
  row.append(pick, open);
  mount.replaceChildren(row, msg);
  try {
    show(await window.dola.library.getDir());
  } catch (err) {
    pathEl.textContent = t('không đọc được');
    msg.textContent = errText(err);
  }
}
