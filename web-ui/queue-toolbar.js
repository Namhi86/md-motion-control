import { el } from './pop.js';
import { t } from './i18n.js';
import { errText } from './ui-text.js';

// The queue's pause / resume button, on the right of the Lịch sử tab. (The counters of the tab line are the filter buttons
// of history-view.js; deleting finished tasks is done there too, by ticking them.) The caller places the node.
const ICON = {
  pause: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M7 4.8v14.4a.8.8 0 0 0 1.2.7l11.5-7.2a.8.8 0 0 0 0-1.4L8.2 4.1A.8.8 0 0 0 7 4.8Z"/></svg>',
};
const PAUSE_TIP = t('Ngừng lấy lệnh mới; việc đang chạy vẫn chạy tiếp');
const RESUME_TIP = t('Đang tạm dừng: không lấy lệnh mới, việc đang chạy vẫn chạy tiếp. Bấm để chạy tiếp');

// The text is the label; in a narrow window only the icon shows, so the label also goes to aria-label and the tooltip.
function button(icon, text, title) {
  const b = el('button', 'qt-btn');
  b.type = 'button';
  b.title = title;
  b.setAttribute('aria-label', text);
  b.insertAdjacentHTML('beforeend', icon);
  b.append(el('span', '', text));
  return b;
}

// say(text, bad) shows a short message under the bar. The button is off while its own call is running.
export function createToolbar({ onPause, say }) {
  const pauseBtn = button(ICON.pause, t('Tạm dừng'), PAUSE_TIP);
  const actions = el('div', 'qt-actions');
  actions.append(pauseBtn);

  pauseBtn.onclick = async () => {
    pauseBtn.disabled = true;
    try {
      await onPause();
    } catch (err) {
      say(`${pauseBtn.textContent}: ${errText(err)}`, true);
    } finally {
      pauseBtn.disabled = false;
    }
  };

  return {
    actions,
    setPaused(paused) {
      pauseBtn.classList.toggle('qt-btn--accent', paused);
      pauseBtn.replaceChildren();
      pauseBtn.insertAdjacentHTML('beforeend', paused ? ICON.play : ICON.pause);
      const word = paused ? t('Tiếp tục') : t('Tạm dừng');
      pauseBtn.append(el('span', '', word));
      pauseBtn.setAttribute('aria-label', word);
      pauseBtn.title = paused ? RESUME_TIP : PAUSE_TIP;
    },
  };
}
