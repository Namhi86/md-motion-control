// The "Thư viện" button of the header, and the one handle the rest of the page uses to open the library (the Bàn sáng tạo gets it through mountStudio, the element window imports it).
// Shown only for an app that says options().media.version >= 1 AND has dola.media.list: an older app has neither, the button stays hidden and every caller falls back to the
// system dialog. The window itself (library-popup.js and what it imports) is loaded when it is first opened, not at start-up.
//   initLibraryEntry({ dola, opts, button }) -> { open(options) } | null          libraryApi() -> { open(options) } | null          pickOneHandle() -> see below
export const libraryOffered = (opts, dola) => Number(opts?.media?.version) >= 1 && typeof dola?.media?.list === 'function';

let shared = null;
export const libraryApi = () => shared;

export function initLibraryEntry({ dola = window.dola, opts, button, loadPopup = () => import('./library-popup.js') }) {
  shared = null;
  button.hidden = true;
  if (!libraryOffered(opts, dola)) return null;
  shared = { open: async (options = {}) => (await loadPopup()).openLibrary({ dola, ...options }) };
  button.hidden = false;
  button.onclick = () => { shared.open({ mode: 'browse' }).catch((err) => console.error('Thư viện: không mở được', err)); };
  return shared;
}

// One picture for a window that used to open the system dialog (the element window): undefined = no library here, use the old dialog;
// null = closed without choosing, or the app could not turn the choice into a file; { handle, name } = the picture.
export async function pickOneHandle(dola = window.dola) {
  if (!shared) return undefined;
  const [item] = await shared.open({ mode: 'pick', multi: false, accept: ['image'] });
  if (!item) return null;
  const r = await dola.media.handleOf(item.ref);
  return r?.ok === true && typeof r.handle === 'string' ? { handle: r.handle, name: String(r.name || item.name || '') } : null;
}
