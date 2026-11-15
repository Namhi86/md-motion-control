// Bộ kiểm thử tự động cho cổng kích hoạt Viral (Facebook + Zalo) & Khóa VIP của MD Motion Control
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_FB_POST_URL,
  DEFAULT_ZALO_GROUP_URL,
  deriveActivationCode,
  deriveMasterVipKey,
  verifyVipKey,
} from '../src/md-gate-code.js';
import { scanFacebookPostForCode } from '../electron/fb-comment-scanner.js';
import { createMdViralGate } from '../electron/md-viral-gate.js';
import {
  GATE_OPEN_CHANNELS,
  GATE_LOCKED,
  createGateGuard,
} from '../electron/gate-guard.js';
import { setupGateIpc } from '../electron/gate-ipc.js';

function createTempGateFile() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-viral-gate-test-'));
  return {
    dir: tmpDir,
    file: path.join(tmpDir, 'md-viral-gate.json'),
    cleanup() {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // Bỏ qua lỗi dọn thư mục tạm
      }
    },
  };
}

test('1. Sinh mã kích hoạt MDMC_XXXXXX cố định theo seed thiết bị', () => {
  const codeA1 = deriveActivationCode('machine-alpha-001');
  const codeA2 = deriveActivationCode('machine-alpha-001');
  const codeB = deriveActivationCode('machine-beta-002');

  assert.match(codeA1, /^MDMC_[0-9A-F]{6}$/);
  assert.equal(codeA1, codeA2);
  assert.notEqual(codeA1, codeB);
  assert.equal(DEFAULT_FB_POST_URL, 'https://www.facebook.com/share/r/1HYQkzLNXk/');
  assert.equal(DEFAULT_ZALO_GROUP_URL, 'https://zalo.me/g/mdmotioncontrol');
});

test('2. Tự động mở khóa ngay khi bình luận Mã máy trên bài viết Facebook (không bắt buộc bấm Zalo)', async () => {
  const tmp = createTempGateFile();
  try {
    let scannerCalled = false;
    const gate = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-direct-fb-check',
      scanner: async () => {
        scannerCalled = true;
        return { found: true };
      },
    });

    assert.equal(gate.isUnlocked(), false);
    assert.equal(gate.gateView().post_url, 'https://www.facebook.com/share/r/1HYQkzLNXk/');

    const res = await gate.gateCheckNow();
    assert.equal(res.ok, true);
    assert.equal(res.unlocked, true);
    assert.equal(gate.isUnlocked(), true);
    assert.equal(scannerCalled, true);
  } finally {
    tmp.cleanup();
  }
});

test('3. Báo lỗi comment_not_found khi đã bấm Zalo nhưng chưa tìm thấy bình luận mã trên Facebook', async () => {
  const tmp = createTempGateFile();
  try {
    const gate = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-missing-comment',
      scanner: async ({ postUrl, code }) =>
        scanFacebookPostForCode({
          postUrl,
          code,
          fetchFn: async () => '<html><body>Bài viết Facebook chưa có bình luận nào</body></html>',
          browserScanFn: async () => false,
        }),
    });

    gate.markFbOpened();
    gate.markZaloClicked();
    assert.equal(gate.gateView().fbOpened, true);
    assert.equal(gate.gateView().zaloClicked, true);

    const res = await gate.gateCheckNow();
    assert.equal(res.ok, false);
    assert.equal(res.error, 'comment_not_found');
    assert.equal(res.reason, 'comment_not_found');
    assert.equal(gate.isUnlocked(), false);
    assert.match(res.note, new RegExp(gate.gateView().code));
  } finally {
    tmp.cleanup();
  }
});

test('4. Tự động mở khóa 100% khi đã bấm Zalo VÀ scanner tìm thấy mã MDMC_XXXXXX trên bài viết Facebook', async () => {
  const tmp = createTempGateFile();
  try {
    const fixedNow = 1_750_000_000_000;
    const gate = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-viral-success',
      now: () => fixedNow,
      scanner: async ({ postUrl, code }) =>
        scanFacebookPostForCode({
          postUrl,
          code,
          fetchFn: async () =>
            `<html><body><div class="comment">Tuyệt vời quá shop ơi! Mã kích hoạt của mình: ${code.toLowerCase()}</div></body></html>`,
        }),
    });

    gate.markFbOpened();
    gate.markZaloClicked();

    const res = await gate.gateCheckNow();
    assert.equal(res.ok, true);
    assert.equal(res.unlocked, true);
    assert.equal(res.status, 'activated');
    assert.equal(res.unlockMethod, 'viral');
    assert.equal(gate.isUnlocked(), true);
    assert.equal(await gate.ensureUnlocked(), true);
  } finally {
    tmp.cleanup();
  }
});

test('5. Lưu và khôi phục trạng thái mở khóa bền vững từ file JSON', async () => {
  const tmp = createTempGateFile();
  try {
    const nowTime = 1_750_000_000_000;
    const gate1 = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-persistence',
      now: () => nowTime,
      scanner: async () => ({ found: true, note: 'Đã xác thực bình luận thành công.' }),
    });

    gate1.markZaloClicked();
    const checkRes = await gate1.gateCheckNow();
    assert.equal(checkRes.ok, true);
    assert.equal(gate1.isUnlocked(), true);

    // Khởi tạo instance thứ 2 đọc cùng file JSON
    const gate2 = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-persistence',
      now: () => nowTime + 3600_000,
    });

    assert.equal(gate2.isUnlocked(), true);
    assert.equal(gate2.gateView().status, 'activated');
    assert.equal(gate2.gateView().unlockMethod, 'viral');
    assert.equal(gate2.gateView().zaloClicked, true);
  } finally {
    tmp.cleanup();
  }
});

test('6. Mở khóa bằng mã VIP hợp lệ qua activateVipKey (cả token MDMC2. và Master Key MDVIP_)', () => {
  const tmp = createTempGateFile();
  try {
    const gate = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-vip-test',
    });

    const invalidRes = gate.activateVipKey('WRONG_KEY_123');
    assert.equal(invalidRes.ok, false);
    assert.equal(invalidRes.reason, 'invalid_key');
    assert.equal(gate.isUnlocked(), false);

    // Mở khóa bằng token chuẩn MDMC2.<payload>.<sig>
    const tokenKey = 'MDMC2.eyJ1c2VyIjoidmlwIn0.c2lnbmF0dXJlX2hhc2g';
    assert.equal(verifyVipKey(tokenKey, gate.gateView().code), true);

    const vipRes = gate.activateVipKey(tokenKey);
    assert.equal(vipRes.ok, true);
    assert.equal(vipRes.unlocked, true);
    assert.equal(vipRes.unlockMethod, 'vip');
    assert.equal(gate.isUnlocked(), true);

    // Kiểm tra thêm mã Master Admin MDVIP_XXXXXX
    const masterKey = deriveMasterVipKey(gate.gateView().code);
    assert.equal(verifyVipKey(masterKey, gate.gateView().code), true);
  } finally {
    tmp.cleanup();
  }
});

test('7. Kiểm tra createGateGuard và setupGateIpc mở cho gate:openZalo và chặn kênh nghiệp vụ khi chưa mở khóa', async () => {
  const tmp = createTempGateFile();
  try {
    const gate = createMdViralGate({
      file: tmp.file,
      deviceSeed: 'seed-guard-ipc',
      scanner: async () => ({ found: true }),
    });

    const guard = createGateGuard();
    guard.bind(gate);

    // Các kênh mới phải nằm trong GATE_OPEN_CHANNELS
    assert.equal(GATE_OPEN_CHANNELS.includes('gate:openZalo'), true);
    assert.equal(GATE_OPEN_CHANNELS.includes('gate:activateVip'), true);
    assert.equal(GATE_OPEN_CHANNELS.includes('gate:setConfig'), true);

    // Khi chưa mở khóa: gate:openZalo vẫn được phép gọi, còn kênh nghiệp vụ bị chặn
    const handlers = new Map();
    const fakeIpc = {
      handle(channel, fn) {
        handlers.set(channel, guard.wrap(channel, fn));
      },
    };

    const openedUrls = [];
    setupGateIpc({
      ipc: fakeIpc,
      auth: gate,
      openExternal: async (url) => {
        openedUrls.push(url);
      },
    });

    // Đăng ký thử 1 kênh nghiệp vụ thông thường và 1 kênh throw
    fakeIpc.handle('motion:runJob', async () => ({ ok: true, job: 'started' }));
    fakeIpc.handle('dola:pickImages', async () => ({ ok: true, status: 'ready' }));

    // Chưa mở khóa -> kênh nghiệp vụ trả về gate_locked hoặc throw
    const blockedRes = await handlers.get('motion:runJob')({});
    assert.equal(blockedRes.ok, false);
    assert.equal(blockedRes.error, GATE_LOCKED);

    await assert.rejects(
      async () => handlers.get('dola:pickImages')({}),
      (err) => err.code === GATE_LOCKED
    );

    // Nhưng gate:openZalo vẫn chạy bình thường và đánh dấu zaloClicked = true
    const openZaloRes = await handlers.get('gate:openZalo')({});
    assert.equal(openZaloRes.ok, true);
    assert.equal(openZaloRes.zaloClicked, true);
    assert.equal(openedUrls.includes(DEFAULT_ZALO_GROUP_URL), true);

    // Sau khi bấm Zalo và gọi gate:checkNow thành công -> kênh nghiệp vụ hoạt động bình thường
    const checkNowRes = await handlers.get('gate:checkNow')({});
    assert.equal(checkNowRes.ok, true);
    assert.equal(guard.isUnlocked(), true);

    const allowedRes = await handlers.get('motion:runJob')({});
    assert.equal(allowedRes.ok, true);
    assert.equal(allowedRes.job, 'started');
  } finally {
    tmp.cleanup();
  }
});
