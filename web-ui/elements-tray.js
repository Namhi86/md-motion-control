import { t } from './i18n.js';
import { el } from './pop.js';
import { thumbUrl } from './elements-pool.js';
import { trayTexts } from './elements-tray-text.js';

// The reference box of the form (#refs, the one that used to say "Thêm ảnh tham chiếu") now shows the element pool: empty, one big button that
// opens the library; with ticked elements, a "+" tile (opens the library) and a 48 px tile per element (✕ unticks it). Same look as the
// old tray. Repaints on every change of the pool or the library. limit(): what the picked mode / Veo model takes ({ name, max, veo }, veo-images.js):
// Veo says its limit per command on the small line and in the tooltip. -> { repaint() } for a change of mode or model.
export function mountElementsTray({ node, pool, open, limit = () => ({ name: '', max: 10, veo: false }) }) {
  function paint() {
    const picked = pool.selected();
    const text = trayTexts(limit());
    node.replaceChildren();
    if (!picked.length) {
      const b = Object.assign(el('button', 'cv-ref-tray cv-ref-tray--empty'), { type: 'button', title: text.tip });
      b.append(el('span', 'cv-reference-orb', '▣'), el('span', 'cv-ref-label', t('Thêm phần tử')), el('span', 'cv-ref-hint', text.hint));
      b.onclick = open;
      node.append(b);
      return;
    }
    const tray = el('div', 'cv-ref-tray');
    tray.title = text.tip;
    const add = Object.assign(el('button', 'cv-ref-add', '+'), { type: 'button', title: t('Mở thư viện phần tử ({n} đã chọn)', { n: picked.length }) });
    add.setAttribute('aria-label', t('Mở thư viện phần tử'));
    add.onclick = open;
    tray.append(add);
    for (const e of picked) {
      const tile = el('div', `cv-ref-tile${e.missing ? ' cv-ref-tile--miss' : ''}`);
      tile.title = e.missing ? t('@{handle} (mất ảnh)', { handle: e.handle }) : `@${e.handle}`;
      const th = el('div', 'cv-ref-thumb');
      if (!e.missing) th.append(Object.assign(el('img'), { src: thumbUrl(e), alt: e.name }));
      const x = Object.assign(el('button', 'cv-ref-x', '✕'), { type: 'button', title: t('Bỏ chọn {name}', { name: e.name }) });
      x.setAttribute('aria-label', t('Bỏ chọn {name}', { name: e.name }));
      x.onclick = () => pool.deselect([e.id]);
      tile.append(th, x);
      tray.append(tile);
    }
    node.append(tray);
  }
  pool.onChange(paint);
  paint();
  return { repaint: paint };
}
