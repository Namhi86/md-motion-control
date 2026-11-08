// Which sample videos of the "Kho skill" tab run. Every card has a muted looping <video>; a screen full of them would eat the RAM and CPU of the
// person's machine, so only the videos that are on screen run, and never more than `max` at once (the ones earlier in the page win: the top 3 first).
// EVERY start of a video goes through here: the observer's reports, the mouse over a card (want), a dot or the end of a sample (settle) and, as a last
// net, the video's own 'play' event (something that called video.play() by itself is stopped again if it makes more than `max`).
// A video gets its address (start(), preload=metadata: it shows its first frame) the first time it comes near the screen, whether it runs or not.
// Pure of the page except for the videos it is handed and the observer factory (tests give their own, since a test has no IntersectionObserver).
export const MAX_PLAYING = 6;

const defaultObserver = (onChange) => new IntersectionObserver(onChange, { rootMargin: '120px' });

export function createPlayback({ max = MAX_PLAYING, makeObserver = defaultObserver } = {}) {
  const items = new Map(); // video -> { order, start, started, visible, onPlay }
  const wanted = new Set(); // the videos the person points at (mouse over, a dot): they take a slot before the others
  let order = 0;
  let active = true;

  function refresh() {
    const near = active ? [...items].filter(([v, it]) => it.visible || wanted.has(v)).sort(([va, a], [vb, b]) => (wanted.has(vb) - wanted.has(va)) || a.order - b.order) : [];
    const run = new Set(near.slice(0, max).map(([v]) => v));
    for (const [video, it] of near) {
      if (!it.started) {
        it.started = true;
        it.start();
      }
      if (run.has(video) && video.paused) {
        // a refused play (the source is not ready, or it failed) is not an error of the page; a refused SOUND falls back to a muted start
        Promise.resolve(video.play()).catch(() => (video.muted ? undefined : Promise.resolve().then(() => { video.muted = true; return video.play(); }))).catch(() => {});
      }
    }
    for (const [video] of items) if (!run.has(video) && !video.paused) video.pause();
  }
  const observer = makeObserver((entries) => {
    for (const e of entries) {
      const it = items.get(e.target);
      if (it) it.visible = !!e.isIntersecting;
    }
    refresh();
  });

  return {
    // start(): sets the video's address. Called once, the first time the video is near the screen.
    watch(video, start) {
      const it = { order: order++, start, started: false, visible: false, onPlay: () => refresh() };
      items.set(video, it);
      video.addEventListener?.('play', it.onPlay);
      observer.observe(video);
    },
    // The person points at this video (the mouse is over its card, or a dot was pressed): it runs now, and the last video in line stops if that makes more than `max`.
    want(video) { wanted.add(video); refresh(); },
    unwant(video) { wanted.delete(video); refresh(); },
    // The video's own source changed (the next sample): it is paused by the browser and plays again only if it is among the ones that may run.
    settle: refresh,
    // The tab was left (false) or opened again (true): everything stops at once; opening again lets the observer's next report restart the visible ones.
    setActive(on) {
      active = !!on;
      wanted.clear();
      if (active) for (const [video, it] of items) { observer.unobserve(video); observer.observe(video); it.visible = false; } // a fresh report for each
      else refresh();
    },
    // The page is redrawn: forget every video and stop them (a removed <video> must not go on playing).
    clear() {
      for (const [video, it] of items) {
        observer.unobserve(video);
        video.removeEventListener?.('play', it.onPlay);
        if (!video.paused) video.pause();
      }
      items.clear();
      wanted.clear();
      order = 0;
    },
    playing: () => [...items.keys()].filter((v) => !v.paused).length,
  };
}
