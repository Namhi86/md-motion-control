// Cấu hình chế độ bảo vệ cổng kích hoạt (Viral Gate) cho MD Motion Control
export const gateEnforced = ({ env = {} } = {}) => env.FS_GATE_ENFORCE !== '0';

export const licenseKeyOverride = ({ testMode, env = {} } = {}) =>
  testMode === true && typeof env.FS_LICENSE_PUBLIC_KEY === 'string'
    ? env.FS_LICENSE_PUBLIC_KEY
    : '';

export const gatePollOptions = ({ testMode, env = {} } = {}) => ({
  hidden: testMode === true && env.FS_GATE_POLL_HIDDEN === '1',
  intervalMs:
    testMode === true && Number(env.FS_GATE_POLL_MS) > 0
      ? Number(env.FS_GATE_POLL_MS)
      : undefined,
});

export const licenseKeyNotice = () => '';
