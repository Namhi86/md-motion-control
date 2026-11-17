import { SESSION_GONE_NOTE } from './google-session.js';

export const sessionGone = () => ({
  ok: false,
  reason: 'cookie_dead',
  note: SESSION_GONE_NOTE,
  sessionGone: true,
});

const NOTHING_SPENT = '(chưa gửi gì, chưa tốn credit)';

export async function runInFlowSession({
  sync,
  refresh,
  run,
  legacy = async () => false,
  notReady = 'veo_page_not_ready',
  signal,
  log = () => {},
}) {
  const syncRes = await sync();
  if (signal?.aborted || syncRes?.reason === 'cancelled') {
    return { ok: false, reason: 'cancelled' };
  }
  if (!syncRes?.ok) {
    if (syncRes?.reason !== 'no_session') {
      return {
        ok: false,
        reason: notReady,
        note:
          (syncRes?.note ||
            'Không lấy được phiên Google của acc từ Chrome thật.') +
          ' ' +
          NOTHING_SPENT,
      };
    }
    if (!(await legacy())) return sessionGone();
    log(
      'Chrome thật của acc chưa có phiên Google: thử phiên cũ trong cửa sổ Flow (Flow không nhận thì acc cần đăng nhập lại bằng nút Kiểm tra)'
    );
  }

  let runRes = await run();
  if (
    runRes?.reason === 'not_logged_in' &&
    typeof refresh === 'function' &&
    !signal?.aborted
  ) {
    log('Flow báo chưa nhận phiên đăng nhập: tự động làm mới token từ Chrome thật và thử lại...');
    const refreshed = await refresh().catch(() => null);
    if (refreshed?.ok && !signal?.aborted) {
      runRes = await run();
    }
  }
  return runRes?.reason === 'not_logged_in' ? sessionGone() : runRes;
}
