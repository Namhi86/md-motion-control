// The picture of every clip on the timeline: one frame of the source video taken a moment after the clip starts (start + 0.15 s: a seek to exactly 0 fires no `seeked` event when the helper
// already sits at 0, which is why clip 1 used to have no picture). A hidden second <video> seeks to the starts one after another, waits for `seeked`, and the frame is drawn on a canvas
// (the playing video is never touched). A seek that does not answer is tried once more; anything that still goes wrong (no canvas, a video that will not seek) leaves the canvas empty,
// and the card shows its soft gradient with the clip number behind it.
// -> { canvasFor(seconds) -> <canvas>, stop() }. The same canvas comes back for the same start, so a redraw of the timeline does not decode again.
const WIDTH = 160; // 2 x the 80 px picture of a card, so it stays sharp on a dense screen
const HEIGHT = 108;
const OFFSET = 0.15;
const SEEK_TIMEOUT_MS = 4000;
const TRIES = 2;

export function createFrames({ url, make = (tag) => document.createElement(tag) }) {
  const cache = new Map(); // start (0.1 s) -> canvas
  const queue = [];
  let helper = null;
  let running = false;
  let stopped = false;

  // resolves when `type` fires on the helper, or after the timeout (never rejects: a silent video must not block the queue)
  const once = (type) => new Promise((resolve) => {
    const done = () => { clearTimeout(timer); helper?.removeEventListener?.(type, done); resolve(); };
    const timer = setTimeout(done, SEEK_TIMEOUT_MS);
    helper.addEventListener?.(type, done);
  });

  // cover-crop the video frame into the canvas
  function draw(ctx, canvas) {
    const vw = helper.videoWidth;
    const vh = helper.videoHeight;
    if (!(vw > 0 && vh > 0)) return false;
    const scale = Math.max(canvas.width / vw, canvas.height / vh);
    const sw = canvas.width / scale;
    const sh = canvas.height / scale;
    ctx.drawImage(helper, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
    return true;
  }

  async function capture({ at, canvas }) {
    const ctx = canvas.getContext?.('2d');
    if (!ctx) return;
    for (let attempt = 0; attempt < TRIES && !stopped; attempt += 1) {
      helper ||= Object.assign(make('video'), { src: url, muted: true, preload: 'auto' });
      if (!(helper.readyState >= 1)) await once('loadedmetadata');
      const end = Number.isFinite(helper.duration) && helper.duration > 0 ? helper.duration - 0.05 : Infinity;
      const target = Math.min(end, at + OFFSET + attempt * 0.05); // the second try moves a hair: the same time again would fire no `seeked`
      const seeked = once('seeked');
      helper.currentTime = target;
      await seeked;
      try { if (draw(ctx, canvas)) return; } catch { /* no frame: the card keeps its gradient */ }
    }
  }

  async function pump() {
    if (running || stopped) return;
    running = true;
    try {
      while (queue.length && !stopped) await capture(queue.shift());
    } catch { /* the helper video is optional */ } finally { running = false; }
  }

  return {
    canvasFor(seconds) {
      const key = Math.round(seconds * 10) / 10;
      let canvas = cache.get(key);
      if (!canvas) {
        canvas = make('canvas');
        canvas.className = 'cm-frame';
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        cache.set(key, canvas);
        queue.push({ at: key, canvas });
        pump();
      }
      return canvas;
    },
    stop() { stopped = true; queue.length = 0; if (helper) { helper.src = ''; helper = null; } },
  };
}
