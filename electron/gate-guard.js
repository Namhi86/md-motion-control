// Bộ bảo vệ kênh IPC (Gate Guard) cho MD Motion Control
// Chặn các tác vụ nghiệp vụ khi ứng dụng chưa được kích hoạt qua cổng Viral hoặc mã VIP

export const GATE_OPEN_CHANNELS = Object.freeze([
  'auth:state',
  'auth:login',
  'auth:logout',
  'gate:state',
  'gate:claim',
  'gate:checkNow',
  'gate:openPost',
  'gate:openZalo',
  'gate:activateVip',
  'gate:deactivate',
  'gate:setConfig',
  'voice:gateState',
  'voice:gateClaim',
  'voice:gateCheckNow',
  'voice:gateOpenPost',
  'app:meta',
  'app:ready',
  'app:relaunch',
  'app:openMdStudio',
  'updater:check',
  'updater:install',
  'offline:retry',
  'offline:stats',
  'offline:pauseQueue',
  'studioBoards:save',
  'studioBoards:flushed',
  'studioBoards:list',
  'dola:options',
  'queue:list',
  'queue:stats',
  'queue:settings',
  'accounts:list',
  'proxies:list',
  'elements:list',
  'library:getDir',
  'media:list',
  'muse:status',
  'browser:get',
  'elevenlabs:settings',
  'elevenlabs:captchaProviders',
  'motion:status',
  'motion:getDir',
  'motion:session',
]);

export const GATE_THROW_CHANNELS = Object.freeze([
  'queue:setSettings',
  'queue:refs',
  'elements:pickImage',
  'elements:pickImages',
  'elements:dropImages',
  'dola:pickImages',
  'dola:pickSkill',
  'skills:pickSample',
  'voice:history',
  'voice:quota',
  'voice:voices',
  'voice:languages',
  'voice:getDir',
]);

export const GATE_LOCKED = 'gate_locked';

const LOCKED_MESSAGE =
  'Cần kích hoạt MD Motion Control: Bình luận mã của bạn vào bài viết Facebook, chia sẻ bài viết và tham gia nhóm Zalo để mở khóa ứng dụng.';

const NOTES = {
  locked: LOCKED_MESSAGE,
  expired:
    'Giấy phép của app đã hết hạn và chưa làm mới được. Kiểm tra kết nối mạng rồi thử lại.',
  signed_out: LOCKED_MESSAGE,
};

/**
 * Tạo phản hồi chuẩn khi kênh IPC bị khóa bởi cổng kích hoạt
 * @param {string} [why='locked']
 */
export const gateLockedAnswer = (why = 'locked') => ({
  ok: false,
  error: GATE_LOCKED,
  reason: GATE_LOCKED,
  why,
  note: NOTES[why] || NOTES.locked,
});

/**
 * Bọc một hàm xử lý IPC bằng kiểm tra trạng thái mở khóa
 * @param {Function} getAuth - Hàm trả về đối tượng quản lý cổng kích hoạt
 * @param {Function} handler - Hàm xử lý IPC gốc
 * @param {object} [options]
 * @param {boolean} [options.throws=false] - Ném lỗi Error thay vì trả về object lỗi
 */
export function guarded(getAuth, handler, { throws = false } = {}) {
  return async (event, ...args) => {
    const auth = getAuth();
    if (!(await auth.ensureUnlocked())) {
      const why = auth.lockReason?.() || 'locked';
      if (throws) {
        throw Object.assign(new Error(`${GATE_LOCKED}: ${NOTES[why] || NOTES.locked}`), {
          code: GATE_LOCKED,
          why,
        });
      }
      return gateLockedAnswer(why);
    }
    return handler(event, ...args);
  };
}

/**
 * Khởi tạo đối tượng GateGuard dùng để bọc các kênh ipcMain.handle
 */
export function createGateGuard() {
  let boundAuth = null;
  const fallbackAuth = {
    ensureUnlocked: async () => false,
    isUnlocked: () => false,
    lockReason: () => 'locked',
  };
  const getAuth = () => boundAuth || fallbackAuth;

  return {
    bind(authInstance) {
      boundAuth = authInstance;
    },
    wrap: (channel, handler) =>
      GATE_OPEN_CHANNELS.includes(channel)
        ? handler
        : guarded(getAuth, handler, { throws: GATE_THROW_CHANNELS.includes(channel) }),
    isUnlocked: () => getAuth().isUnlocked(),
  };
}
