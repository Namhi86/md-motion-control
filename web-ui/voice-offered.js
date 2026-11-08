// Whether the "Giọng nói" tab is offered in this window. Same idea as the other tabs (opts.studio, opts.analyze): the CORE says so, and a core that does not
// know the tab says nothing, so the button stays hidden and the web goes live before such an app is released. Three more ways in, for whoever builds the tab
// (the screen has no backend yet; none of them is something a person does by accident):
//   - the core offers the bridge (window.dola.voice, phase 5)
//   - the address carries ?voice=1
//   - localStorage "elx.dev" is "1" (set it once from the DevTools console of the app)
//   opts  the first window.dola.options()      dola  window.dola      search  location.search      storage  localStorage (a getter, because reading it may throw)
export function voiceOffered({ opts, dola, search = '', storage = () => globalThis.localStorage } = {}) {
  if (opts?.voice === true) return true;
  if (dola?.voice) return true;
  try {
    if (new URLSearchParams(search).get('voice') === '1') return true;
  } catch { /* a search string the browser could not read: not the flag */ }
  try {
    return storage()?.getItem('elx.dev') === '1';
  } catch {
    return false; // a blocked storage is "no flag"
  }
}
