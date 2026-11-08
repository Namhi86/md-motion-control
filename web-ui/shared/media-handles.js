// Copied from dola-seedance-client/src/media-handles.js (smit-corp). Keep the two in step: change both, run both tests.
// How the window names a local file without ever holding its path (RT-10). The window only sees:
//   fs-media://task/<id>          the saved video of a task
//   fs-media://task/<id>/ref/<n>  the n-th reference image of a task
//   fs-media://pick/<handle>      an image (or a video to analyze: .mp4 / .mov) the person picked in this session (the handle is opaque; the path stays in main)
//   fs-media://el/<id>            the thumbnail of an element of the library (main makes it; the id is opaque, the path stays in main)
//   fs-media://studio/<sha256>.<ext>  a picture the person put on a board of the studio, copied into <userData>/studio/media (src/studio-media.js); the name is a content hash
//   fs-media://lib/<id>           a file of the shared library (src/media-index.js; the id is m_ + 16 hex, a hash of the path that only main can turn back into a file)
//   fs-media://lib/<id>/thumb     its small picture (jpg, at most 320 px; electron/media-thumbs.js)
// The main process turns such an address back into a file it already knows (electron/media-protocol.js). Nothing in the address
// is ever used as a path, so there is no traversal, symlink or drive-letter trick to check. Browser-safe: the window imports the
// URL builders from here too.
export const SCHEME = 'fs-media';
const HANDLE_RE = /^[a-f0-9]{32}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_REF = 10; // Dola takes at most 10 reference images
const STUDIO_NAME_RE = /^[a-f0-9]{64}\.(png|jpe?g|webp)$/;
const LIB_ID_RE = /^m_[a-f0-9]{16}$/;

const TYPES = { '.mp4': 'video/mp4', '.mov': 'video/\x71uicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' }; // .mp3: the voices of the "Giọng nói" tab (same as the core's src/media-handles.js)

export const isHandle = (h) => typeof h === 'string' && HANDLE_RE.test(h);
export const isStudioName = (n) => typeof n === 'string' && STUDIO_NAME_RE.test(n);
export const isLibId = (id) => typeof id === 'string' && LIB_ID_RE.test(id);

// Addresses for the window. `v` (optional) changes the task address when its file changes, so a player reloads a re-fetched clip.
export const mediaUrl = {
  task: (id, v) => `${SCHEME}://task/${encodeURIComponent(id)}${v ? `?v=${encodeURIComponent(String(v))}` : ''}`,
  ref: (id, n) => `${SCHEME}://task/${encodeURIComponent(id)}/ref/${n}`,
  pick: (handle) => `${SCHEME}://pick/${handle}`,
  el: (id, v) => `${SCHEME}://el/${encodeURIComponent(id)}${v ? `?v=${encodeURIComponent(String(v))}` : ''}`, // v: the image's mtime, so an edited image reloads
  studio: (name) => `${SCHEME}://studio/${name}`, // name: <sha256>.<ext>; the name never changes for the same bytes
  lib: (id) => `${SCHEME}://lib/${id}`, // id: m_ + 16 hex
  libThumb: (id, v) => `${SCHEME}://lib/${id}/thumb${v ? `?v=${encodeURIComponent(String(v))}` : ''}`, // v: the file's mtime, so a changed file loads its small picture again
};

// fs-media address -> { kind: 'task', id } | { kind: 'ref', id, n } | { kind: 'pick', handle } | { kind: 'el', id } | { kind: 'studio', name } | { kind: 'lib', id, thumb: boolean } | null (anything else).
export function parseMediaUrl(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return null;
  }
  if (u.protocol !== `${SCHEME}:` || u.username || u.password || u.port) return null;
  const parts = u.pathname.split('/').slice(1);
  if (u.hostname === 'pick') return parts.length === 1 && isHandle(parts[0]) ? { kind: 'pick', handle: parts[0] } : null;
  if (u.hostname === 'el') return parts.length === 1 && ID_RE.test(parts[0]) ? { kind: 'el', id: parts[0] } : null;
  if (u.hostname === 'studio') return parts.length === 1 && isStudioName(parts[0]) ? { kind: 'studio', name: parts[0] } : null;
  if (u.hostname === 'lib') {
    if (!isLibId(parts[0])) return null;
    if (parts.length === 1) return { kind: 'lib', id: parts[0], thumb: false };
    return parts.length === 2 && parts[1] === 'thumb' ? { kind: 'lib', id: parts[0], thumb: true } : null;
  }
  if (u.hostname !== 'task' || !ID_RE.test(parts[0] || '')) return null;
  if (parts.length === 1) return { kind: 'task', id: parts[0] };
  if (parts.length === 3 && parts[1] === 'ref' && /^\d{1,2}$/.test(parts[2]) && Number(parts[2]) < MAX_REF) return { kind: 'ref', id: parts[0], n: Number(parts[2]) };
  return null;
}

const randomHex = (bytes) => [...globalThis.crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

// The handles of this session: path -> handle (the same path always gets the same handle) and back. Kept in memory only:
// a handle means nothing after a restart.
export function createHandles() {
  const byHandle = new Map();
  const byPath = new Map();
  return {
    add(file) {
      if (typeof file !== 'string' || !file) throw new TypeError('a handle needs a path');
      if (byPath.has(file)) return byPath.get(file);
      const h = randomHex(16);
      byHandle.set(h, file);
      byPath.set(file, h);
      return h;
    },
    resolve: (h) => (isHandle(h) ? byHandle.get(h) ?? null : null),
  };
}

// The file an address names, or null (= 404). taskOf(id) -> task | null; handles from createHandles(); studioMediaFile(name) -> path | null
// (src/studio-media.js; it refuses anything but a well-formed name); libFile(id) -> path | null (the library index of main, src/media-index.js). An element address names no file of its own: its thumbnail is made
// by main (electron/elements-thumb.js). The small picture of a library file (`thumb`) is made by main too (electron/media-thumbs.js), so it names no file here either.
export function fileForMedia(parsed, { taskOf, handles, studioMediaFile = () => null, libFile = () => null }) {
  if (!parsed || parsed.kind === 'el') return null;
  if (parsed.kind === 'pick') return handles.resolve(parsed.handle);
  if (parsed.kind === 'studio') return studioMediaFile(parsed.name) ?? null;
  if (parsed.kind === 'lib') return parsed.thumb ? null : libFile(parsed.id) ?? null; // never fall through: a library id is not a task id
  const task = taskOf(parsed.id);
  const file = parsed.kind === 'task' ? task?.result?.file : Array.isArray(task?.files) ? task.files[parsed.n] : null;
  return typeof file === 'string' && file ? file : null;
}

// The content type served for a file; null for anything that is not a video or an image of ours (served as 404).
export function contentTypeOf(file) {
  const m = /\.[A-Za-z0-9]+$/.exec(String(file));
  return (m && TYPES[m[0].toLowerCase()]) || null;
}
