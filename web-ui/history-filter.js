import { t } from './i18n.js';
import { landed } from './shared/task-landed.js';
import { isImageTask } from './muse-form.js';

// What each filter of the history list shows and which rows may be ticked for deletion. No DOM here: tests/history-filter.test.js.
// "Đang chạy" holds the queued tasks too (they wait for their turn); "Lỗi" holds the interrupted ones (the app was closed while they ran,
// and like a failed task they wait for a "Thử lại"); a cancelled task is only in "Tất cả".
export const FILTERS = [
  { key: 'all', label: t('Tất cả'), tip: t('Mọi lệnh trong lịch sử') },
  { key: 'running', label: t('Đang chạy'), tip: t('Đang chạy và đang chờ tới lượt') },
  { key: 'done', label: t('Thành công'), tip: t('Đã tạo xong video') },
  { key: 'failed', label: t('Lỗi'), tip: t('Lỗi, hoặc bị gián đoạn vì app tắt giữa chừng') },
];

const GROUP = { queued: 'running', running: 'running', done: 'done', failed: 'failed', interrupted: 'failed' };

export const matches = (status, key) => key === 'all' || GROUP[status] === key;

// The two screens of the form split the history: "Tạo ảnh" lists the picture tasks only, "Tạo video" everything that is not a picture.
// 'all' = no split (a core without the picture mode has one list, as before). The counters of the chips follow the screen.
export const onScreen = (task, screen) => screen === 'all' || (screen === 'image') === isImageTask(task);
export const screenTasks = (tasks, screen) => tasks.filter((task) => onScreen(task, screen));
// What an empty screen says (history.js): the 'image' screen speaks of pictures, every other one keeps the old text.
export const EMPTY_TEXT = {
  image: [t('Chưa có ảnh nào.'), t('Nhập mô tả rồi bấm "Tạo ảnh".')],
  video: [t('Chưa có video nào.'), t('Nhập mô tả rồi bấm "Tạo video".')],
};

// statuses -> { all, running, done, failed }
export function countByFilter(statuses) {
  const c = { all: 0, running: 0, done: 0, failed: 0 };
  for (const s of statuses) {
    c.all += 1;
    if (GROUP[s]) c[GROUP[s]] += 1;
  }
  return c;
}

// A task Dola has (chat id or video id) but whose clip is not on this machine: "Lấy lại video" can still fetch it for free, but once the
// row is deleted the ids are gone and so is the clip. The delete question warns about these rows ("Dọn task xong" used to skip them).
export const hasUnsavedClip = (task) => landed(task) && !task?.result?.file;

// What deleting these tasks costs beyond the row: a waiting task will never run, and an unsaved clip is lost with its ids.
export function deleteImpact(tasks) {
  let waiting = 0;
  let unsaved = 0;
  for (const task of tasks) {
    if (task?.status === 'queued') waiting += 1;
    if (hasUnsavedClip(task)) unsaved += 1;
  }
  return { waiting, unsaved };
}

// A running task cannot be removed (the queue refuses it): cancel it first.
export const canSelect = (status) => status !== 'running';
