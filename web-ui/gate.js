// The "Mở khoá MD Motion Control" screen (phase-03 of plans/261018-2154-md-motion-share-gate): the person likes the post (a reminder:
// nothing checks it), copies a code, comments it under the post, shares the post publicly, presses "Tôi đã làm xong"; the core
// (dola.gate) checks it with the backend and the app opens by itself.
// This file only wires the DOM of <main id="gate"> to dola.gate; every text and every on/off is decided by gateModel() in gate-text.js.
// The web never sees a token: it asks the core (state / claim / checkNow / openPost) and listens to onChanged. The core, not this
// screen, refuses the app's calls while locked (gate_locked): hiding the screen with the dev tools unlocks nothing.
import { ackFrom, claimFault, gateModel, TIP_TEXT } from './gate-text.js';

const TICK_MS = 1000; // redraw: the cooldown countdown and the tip after 20 minutes
const tick = (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t; }; // unref: Node (the tests) is not kept alive by it; a browser's id is a number

// Copies with the page's own selection: the core denies navigator.clipboard to the page. true when the browser did it.
export function copyText(text, doc = document) {
  const box = doc.getElementById('gate-clip');
  try {
    box.value = text;
    box.select();
    return doc.execCommand('copy') === true;
  } catch (err) {
    console.error('gate: copy failed', err);
    return false;
  }
}

// dola.gate must exist (auth.js only shows this screen then). onUnlocked(): the screen saw `unlocked` - auth.js reads the login again.
// Returns { show(), hide() }: show() starts a visit (loads, claims a code once when there is none, listens), hide() ends it.
export function initGate({ dola, doc = document, now = Date.now, onUnlocked = () => {}, copy = (text) => copyText(text, doc), every = tick, stop = clearInterval }) {
  const gate = dola.gate;
  const $ = (id) => doc.getElementById(id);
  const canOpenPost = typeof gate.openPost === 'function'; // an older core cannot open the browser: the button then copies the link
  const blank = () => ({ view: null, fault: '', ack: '', cooldownUntil: 0, busy: false, copy: null, shownAt: now(), canOpenPost });
  let s = blank();
  let shown = false;
  let claimed = false; // a code was asked for in this visit
  let seq = 0; // a load that is not the latest (or the visit ended) is dropped
  let ticker = null;
  let off = null;

  function render() {
    const m = gateModel({ ...s, now: now() });
    $('gate').dataset.mode = m.mode;
    $('gate-notice').textContent = m.notice.text;
    $('gate-notice').dataset.tone = m.notice.tone;
    $('gate-code').textContent = m.code || s.view?.code || 'MDMC_XXXXXX';
    $('gate-copy').textContent = m.copyLabel;
    $('gate-copy').disabled = !m.code;
    $('gate-open').textContent = s.view?.fbOpened ? '✓ Đã mở bài viết Facebook ↗' : m.openLabel;
    $('gate-open').disabled = m.openDisabled;
    $('gate-done').textContent = m.done.label;
    $('gate-done').disabled = m.done.disabled;
    $('gate-ack').textContent = m.ack;
    $('gate-tip').textContent = TIP_TEXT;
    $('gate-tip').hidden = !m.tip;
    $('gate-retry').hidden = !m.retry;

    const codeVal = m.code || s.view?.code || 'MDMC_XXXXXX';
    const hwidVal = s.view?.hwid || codeVal;
    const hwidEl = $('gate-hwid');
    if (hwidEl) hwidEl.textContent = hwidVal;
    const hwidInlineEl = $('gate-hwid-inline');
    if (hwidInlineEl) hwidInlineEl.textContent = codeVal;

    const fbStateEl = $('gate-fb-state');
    if (fbStateEl) {
      if (s.view?.fbOpened) {
        fbStateEl.textContent = '✓ Đã bấm mở bài viết';
        fbStateEl.style.color = '#34d399';
      } else {
        fbStateEl.textContent = '';
      }
    }

    const zaloBtn = $('gate-zalo');
    const zaloStateEl = $('gate-zalo-state');
    if (s.view?.zaloClicked) {
      if (zaloBtn) {
        zaloBtn.textContent = '✓ Đã tham gia nhóm Zalo ↗';
        zaloBtn.style.borderColor = 'rgba(16,185,129,0.5)';
        zaloBtn.style.color = '#6ee7b7';
      }
      if (zaloStateEl) {
        zaloStateEl.textContent = '✓ Đã xác nhận tham gia nhóm Zalo';
        zaloStateEl.style.color = '#34d399';
      }
    } else {
      if (zaloBtn) {
        zaloBtn.textContent = '💬 Tham gia nhóm Zalo ↗';
        zaloBtn.style.borderColor = '';
        zaloBtn.style.color = '';
      }
      if (zaloStateEl) {
        zaloStateEl.textContent = '(Bắt buộc bấm tham gia)';
        zaloStateEl.style.color = '#94a3b8';
      }
    }

    const cfgFbEl = $('gate-cfg-fb');
    if (cfgFbEl && doc.activeElement !== cfgFbEl && s.view?.post_url) {
      cfgFbEl.value = s.view.post_url;
    }
    const cfgZaloEl = $('gate-cfg-zalo');
    if (cfgZaloEl && doc.activeElement !== cfgZaloEl && s.view?.zalo_url) {
      cfgZaloEl.value = s.view.zalo_url;
    }

    const statusEl = $('gate-status-val');
    const expEl = $('gate-exp-val');
    if (statusEl) {
      if (s.view?.revoked) {
        statusEl.textContent = '⛔ Đã bị thu hồi';
        statusEl.style.color = '#f87171';
      } else if (s.view?.unlocked) {
        statusEl.textContent = `✅ Đang hoạt động (${s.view?.planLabel || s.view?.plan || 'Cộng đồng'})`;
        statusEl.style.color = '#34d399';
      } else {
        statusEl.textContent = '🔒 Chưa kích hoạt';
        statusEl.style.color = '#fbbf24';
      }
    }
    if (expEl) {
      if (s.view?.revoked && s.view?.reject_reason) {
        expEl.textContent = s.view.reject_reason;
        expEl.style.color = '#fca5a5';
      } else if (s.view?.unlocked) {
        expEl.textContent = s.view?.expiresAt
          ? `${new Date(s.view.expiresAt).toLocaleDateString('vi-VN')}`
          : 'Vĩnh viễn (VIP)';
        expEl.style.color = '#6ee7b7';
      } else {
        expEl.textContent = 'Tự động mở khóa 14 ngày / VIP';
        expEl.style.color = '#94a3b8';
      }
    }
  }

  async function load() {
    const mine = ++seq;
    const live = () => shown && mine === seq;
    s.fault = '';
    try {
      s.view = await gate.state();
      if (!live()) return;
      if (s.view && !s.view.unlocked && !s.view.error && !s.view.code && s.view.status === 'none' && !claimed) {
        claimed = true;
        const answer = await gate.claim();
        if (!live()) return;
        s.fault = claimFault(answer);
        if (!s.fault) s.view = answer;
      }
    } catch (err) {
      if (!live()) return;
      console.error('gate: the core refused', err);
      s.fault = 'other';
    }
    render();
    if (s.view?.unlocked) onUnlocked();
  }

  async function pressDone() {
    if (s.busy) return;
    s.busy = true;
    s.ack = '';
    render();
    let answer;
    try {
      answer = await gate.checkNow();
      if (answer && typeof answer === 'object' && answer.code) {
        s.view = answer;
      }
    } catch (err) {
      console.error('gate: checkNow failed', err);
      answer = { ok: false };
    }
    const a = ackFrom(answer, now());
    s.busy = false;
    s.ack = a.ack;
    s.cooldownUntil = a.until;
    render();
    if (s.view?.unlocked) onUnlocked();
  }

  async function pressOpen() {
    let opened = false;
    if (canOpenPost) {
      try {
        const res = await gate.openPost();
        opened = res?.ok !== false;
        if (res && typeof res === 'object' && res.code) {
          s.view = res;
        }
      } catch (err) {
        console.error('gate: openPost failed', err);
      }
    }
    if (!opened && s.view?.post_url) s.copy = { of: 'link', ok: copy(s.view.post_url) };
    render();
  }

  const logged = (name, fn) => () => { fn().catch((err) => console.error(`gate: ${name} failed`, err)); };
  $('gate-copy').addEventListener('click', () => { s.copy = { of: 'code', ok: copy(s.view?.code || '') }; render(); });
  if ($('gate-copy-hwid')) {
    $('gate-copy-hwid').addEventListener('click', () => {
      const hwidVal = s.view?.hwid || s.view?.code || '';
      const ok = copy(hwidVal);
      const btn = $('gate-copy-hwid');
      if (btn) btn.textContent = ok ? '✓ Đã sao chép Mã máy' : 'Bôi đen để sao chép';
      setTimeout(() => {
        if ($('gate-copy-hwid')) $('gate-copy-hwid').textContent = '📋 Sao chép Mã máy';
      }, 2000);
    });
  }
  if ($('gate-vip-btn') && typeof gate.activateVip === 'function') {
    $('gate-vip-btn').addEventListener('click', logged('activateVip', async () => {
      const inp = $('gate-vip-input');
      const msgEl = $('gate-vip-msg');
      const key = inp?.value?.trim() || '';
      if ($('gate-vip-btn')) $('gate-vip-btn').disabled = true;
      try {
        if (!key) {
          const remoteRes = await gate.checkNow?.();
          if (remoteRes?.unlocked) {
            s.view = remoteRes;
            if (msgEl) {
              msgEl.hidden = false;
              msgEl.style.color = '#6ee7b7';
              msgEl.textContent = remoteRes.note || '🎉 Đã đồng bộ kích hoạt bản quyền từ xa thành công!';
            }
            render();
            onUnlocked();
            return;
          }
          if (msgEl) {
            msgEl.hidden = false;
            msgEl.style.color = '#fca5a5';
            msgEl.textContent = '⚠️ Vui lòng dán mã kích hoạt (MDMC2....) vào ô trên hoặc nhờ Admin cấp Key từ xa.';
          }
          return;
        }
        const res = await gate.activateVip(key);
        if (res?.ok && res?.unlocked) {
          s.view = res;
          if (msgEl) {
            msgEl.hidden = false;
            msgEl.style.color = '#6ee7b7';
            msgEl.textContent = res.note || '🎉 Kích hoạt bản quyền thành công! Đang mở khóa...';
          }
          render();
          onUnlocked();
        } else {
          if (msgEl) {
            msgEl.hidden = false;
            msgEl.style.color = '#fca5a5';
            msgEl.textContent = '❌ ' + (res?.note || 'Mã kích hoạt không hợp lệ hoặc đã hết hạn.');
          }
        }
      } finally {
        if ($('gate-vip-btn')) $('gate-vip-btn').disabled = false;
      }
    }));
    $('gate-vip-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('gate-vip-btn')?.click();
      }
    });
  }
  if ($('gate-cfg-save') && typeof gate.setConfig === 'function') {
    $('gate-cfg-save').addEventListener('click', logged('setConfig', async () => {
      const fbVal = $('gate-cfg-fb')?.value?.trim() || '';
      const zaloVal = $('gate-cfg-zalo')?.value?.trim() || '';
      const res = await gate.setConfig({
        fbPostUrl: fbVal,
        post_url: fbVal,
        zaloGroupUrl: zaloVal,
        zalo_url: zaloVal,
      });
      if (res && typeof res === 'object' && res.code) {
        s.view = res;
      }
      const msgEl = $('gate-vip-msg');
      if (msgEl) {
        msgEl.hidden = false;
        msgEl.style.color = '#6ee7b7';
        msgEl.textContent = '✓ Đã lưu cấu hình đường dẫn Bài viết FB & Nhóm Zalo!';
      }
      render();
    }));
  }
  $('gate-open').addEventListener('click', logged('open', pressOpen));
  if ($('gate-zalo') && typeof gate.openZalo === 'function') {
    $('gate-zalo').addEventListener('click', logged('zalo', async () => {
      const next = await gate.openZalo();
      if (next && typeof next === 'object') s.view = next;
      render();
    }));
  }
  $('gate-done').addEventListener('click', logged('done', pressDone));
  $('gate-retry').addEventListener('click', () => { claimed = false; load().catch((err) => console.error('gate: reload failed', err)); });

  function show() {
    if (shown) return;
    shown = true;
    s = blank();
    claimed = false;
    off = gate.onChanged?.((view) => {
      if (!shown || !view || typeof view !== 'object') return;
      s.view = view;
      s.fault = '';
      render();
      if (view.unlocked) onUnlocked();
    });
    ticker = every(render, TICK_MS);
    render();
    load().catch((err) => console.error('gate: load failed', err));
  }

  function hide() {
    shown = false;
    seq += 1;
    if (typeof off === 'function') off();
    off = null;
    if (ticker !== null) stop(ticker);
    ticker = null;
  }

  return { show, hide };
}
