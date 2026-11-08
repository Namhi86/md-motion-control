import { loadSession } from './motion-session.js';

// What a reopened Motion control tab can draw, read once each: the film the core still holds (motion.status: running or made, null when none) and the plan it keeps (loadSession: see motion-session.js).
// Neither call may break the tab: a failed status is "no film".
export async function readRestorable(dola) {
  let film = null;
  try { const st = await dola.motion.status(); if (st && typeof st === 'object') film = st; } catch { /* no film to show */ }
  return { film, saved: await loadSession(dola) };
}
