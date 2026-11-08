// Pictures dragged onto the window. The page never sees a path: the files go (as an Array of File objects, a FileList does not cross the
// bridge) to the app, which answers with handles like a native pick does. An app without dola.elements.dropImages (an older core) ignores drops.
export const MAX_ROWS = 50; // pictures in one go (the same cap the app applies)
export const canDrop = (dola) => typeof dola?.elements?.dropImages === 'function';
const hasFiles = (ev) => [...(ev.dataTransfer?.types || [])].includes('Files');

// target lights up (class el-drop) while files are over it; onItems([{ handle, name }], skipped) gets the pictures of a drop.
export function watchDrop(target, dola, onItems) {
  if (!canDrop(dola)) return () => {};
  let depth = 0;
  const lit = (on) => target.classList.toggle('el-drop', on);
  const enter = (ev) => { if (!hasFiles(ev)) return; ev.preventDefault(); depth += 1; lit(true); };
  const over = (ev) => { if (hasFiles(ev)) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; } };
  const leave = () => { depth = Math.max(0, depth - 1); if (!depth) lit(false); };
  const drop = async (ev) => {
    if (!hasFiles(ev)) return;
    ev.preventDefault();
    ev.stopPropagation();
    depth = 0;
    lit(false);
    const files = [...ev.dataTransfer.files];
    try {
      const r = await dola.elements.dropImages(files);
      if (r?.items?.length) onItems(r.items, r.skipped || 0);
      else onItems([], files.length);
    } catch {
      onItems([], files.length);
    }
  };
  target.addEventListener('dragenter', enter);
  target.addEventListener('dragover', over);
  target.addEventListener('dragleave', leave);
  target.addEventListener('drop', drop);
  return () => ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((t, i) => target.removeEventListener(t, [enter, over, leave, drop][i]));
}

// "1-frog-onesie.jpg" -> "Frog onesie": the picture's file name as a first guess for the element's name.
export function niceName(fileName) {
  const base = String(fileName || '').replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[-_.]+/g, ' ').replace(/^[\d\s]+(?=\D)/, '').replace(/\s+/g, ' ').trim();
  return base ? base[0].toUpperCase() + base.slice(1) : '';
}
