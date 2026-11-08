import { t } from './i18n.js';
import { browserSetNote, browserSwitchView, DESC as BROWSER_DESC, TITLE as BROWSER_TITLE } from './browser-switch-text.js';
import { saySetting } from './setup-say.js';
import { errText } from './ui-text.js';

// The "Cài đặt" page of the Setup screen: the switches that hold for the whole app (the number "Số lệnh cùng lúc mỗi acc Muse" is muse-parallel-ui.js, mounted by setup.js).
// Their answers appear on this page (saySetting). Same ids, same events and same sentences as when they sat over the platform tabs.
const $ = (id) => document.getElementById(id);

// "Hiện cửa sổ đăng nhập": the same switch as the queue bar's "Hiện cửa sổ" (one setting, read here when the page opens).
export async function initShowSwitch() {
  const showBox = $('su-show-box');
  try {
    const st = await window.dola.queue.settings();
    showBox.checked = (typeof st?.loginWindows === 'boolean' ? st.loginWindows : st?.showWindows) === true; // loginWindows = the stored box (every person); an older core only has showWindows
  } catch {
    // the queue is not up yet: the switch stays off until the next time the page opens
  }
  showBox.onchange = async () => {
    try {
      await window.dola.queue.setSettings({ loginWindows: showBox.checked, showWindows: showBox.checked }); // loginWindows: this core; showWindows: an older core that only knows that key
    } catch (err) {
      showBox.checked = !showBox.checked;
      saySetting(t('Không đổi được cài đặt hiện cửa sổ: {why}', { why: errText(err) }), true);
    }
  };
}

// "Dùng Chrome thật": one switch for the whole app (the sentences are in browser-switch-text.js). Hidden when this main process does not know
// window.dola.browser (an older core under a newer web page), so a switch that does nothing is never shown.
export async function initBrowserSwitch() {
  const api = window.dola.browser;
  const label = $('su-browser');
  if (typeof api?.get !== 'function' || typeof api?.set !== 'function' || !label) return;
  const box = $('su-browser-box');
  const hint = $('su-browser-hint');
  $('su-browser-name').textContent = BROWSER_TITLE;
  $('su-browser-desc').textContent = BROWSER_DESC;
  const paint = (state) => {
    const v = browserSwitchView(state);
    box.checked = v.checked;
    box.disabled = v.disabled;
    label.classList.toggle('qs-toggle--disabled', v.disabled);
    hint.textContent = v.hint;
    hint.classList.toggle('stp-msg--bad', v.bad);
    hint.hidden = !v.hint;
  };
  const refresh = async () => {
    try {
      paint(await api.get());
      label.hidden = false;
    } catch {
      // main is not ready yet: the switch stays hidden until the next time the page opens
    }
  };
  box.onchange = async () => {
    const want = box.checked ? 'chrome' : 'electron';
    try {
      const r = await api.set(want);
      saySetting(browserSetNote(r), r?.ok !== true);
    } catch (err) {
      saySetting(t('Không đổi được chế độ cửa sổ: {why}', { why: errText(err) }), true);
    }
    await refresh(); // what main really holds now, whatever it answered
  };
  window.dola.queue.onChange(() => { refresh(); }); // a task starts or ends: the switch locks or opens
  await refresh();
}
