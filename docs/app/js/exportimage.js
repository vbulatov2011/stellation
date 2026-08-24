/*
 * A picture of the solid.
 *
 * This used to be one entry in the solid export's format list — "PNG — a
 * picture of the view", sitting under eight mesh formats — and it never
 * belonged there. A mesh and a picture are wanted for different reasons and
 * answer different questions: the mesh dialog asks about colors, edge tubes
 * and orientation, none of which a picture has any use for, because a picture
 * is simply what the view is already showing.
 *
 * So it is its own dialog, with the two questions it actually has: which of
 * the two raster formats, and how big. Everything else — the name, the
 * folder, the overwrite question — is the same as its neighbours, because
 * those are the same questions however the file was made.
 *
 * The background is not written. The renderer draws onto nothing (see
 * Renderer3D's context) and both formats carry the alpha channel, so what
 * lands in the file is the solid and the transparency around it.
 */

import { hasFSAccess, writeFile, createFolderChooser, fileExists } from '../../lib/uilib/files.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

const $ = (q) => document.querySelector(q);

/*
 * The two raster formats, and the whole difference between them. PNG is
 * exact; WebP is about half the size with the alpha channel kept just as
 * exactly and the colors very slightly lossy on the antialiased edges — a
 * canvas has no lossless WebP setting to ask for, at any quality.
 */
const FORMATS = [
  { id: 'png', label: 'PNG — exact', ext: 'png', mime: 'image/png',
    note: 'Lossless. Every pixel is the one on screen, transparency included.' },
  { id: 'webp', label: 'WebP — about half the size', ext: 'webp', mime: 'image/webp',
    quality: 1,
    note: 'Keeps transparency exactly and packs to roughly half a PNG. The colors ' +
          'are very slightly lossy on the antialiased edges — take PNG when the ' +
          'pixels have to match.' },
];

export function initExportImage({ state, renderer, currentName, download, setStatus }) {
  const template = $('#exportImageBody');
  if (!template) return null;

  const win = createInternalWindow({
    title: 'Export solid — 2D',
    // a stated size, for the reason the solid dialog states one: a resizable
    // window persists what it measures, and an empty hidden one measures its
    // own border
    width: '380px', height: '440px',
    left: 'calc(50% - 190px)', top: '12%',
    canClose: true, canResize: true, modal: true, role: 'dialog',
    storageId: 'stell.exportImage',
  });
  win.wnd.classList.add('transient');
  win.interior.appendChild(template.content.cloneNode(true));
  win.setVisible(false);

  const dlg = win.interior;
  const el = (id) => dlg.querySelector(id);
  const fmtSel = el('#eiFormat'), nameIn = el('#eiName');
  const square = el('#eiSquare'), sizeIn = el('#eiSize');
  const info = el('#eiInfo'), go = el('#eiGo');
  let busy = false;
  // the name this dialog last offered, and the document it was offered for —
  // a typed name is the user's and survives closing, but only for its own figure
  let offeredFor = null;

  for (const f of FORMATS) {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.label;
    fmtSel.appendChild(o);
  }

  const folders = createFolderChooser({
    key: 'stell.exportImage.folder', pickerId: 'stellation-pictures',
  });

  const format = () => FORMATS.find(f => f.id === fmtSel.value) || FORMATS[0];

  /* the same slug the other two exports use: a title is not a filename */
  const slug = (s) => s.replace(/\.(json|stel|txt)$/i, '')
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stem = () => slug(nameIn.value || '') || slug(currentName() || '') || 'stellation';

  /** what the picture will measure, which is the view unless a size is asked for */
  const pixels = () => {
    if (square.checked) {
      const n = Math.max(16, Math.min(4096, Math.round(Number(sizeIn.value) || 1024)));
      return { w: n, h: n };
    }
    const c = renderer?.canvas;
    return { w: c?.width || 0, h: c?.height || 0 };
  };

  function sync() {
    const f = format();
    el('#eiNote').textContent = f.note;
    sizeIn.disabled = !square.checked;
    const { w, h } = pixels();
    el('#eiSizeOut').textContent = square.checked
      ? `${w} × ${h} px`
      : `${w} × ${h} px — the view as it is on screen`;
    el('#eiFile').textContent = `${stem()}.${f.ext}`;
    el('#eiWhereRow').hidden = !hasFSAccess();
    go.disabled = busy || !renderer;
  }

  /** the chosen folder's name, asked for rather than remembered here */
  async function showFolder() {
    if (!hasFSAccess()) return;
    const folder = await folders.current();
    const where = el('#eiWhere');
    if (!where) return;
    where.textContent = folder ? folder.name : 'you will be asked once';
    where.classList.toggle('dim', !folder);
  }

  /**
   * The picture, as bytes.
   *
   * Square asks the renderer for its own square image at that size — which
   * resizes the drawing buffer, draws, and puts it back — and otherwise the
   * live canvas is taken as it stands. Either way the encoding happens in the
   * same task as the drawing, because the context keeps no drawing buffer
   * between tasks.
   */
  async function bytes(f) {
    const { w } = pixels();
    const canvas = square.checked ? renderer.squareImage(w) : null;
    const url = canvas
      ? canvas.toDataURL(f.mime, f.quality)
      : renderer.snapshot(f.mime, f.quality);
    const blob = await (await fetch(url)).blob();
    /*
     * A browser that cannot encode the type hands back a PNG under the name
     * it was asked for, without a word. Say so rather than write a file whose
     * bytes disagree with its extension.
     */
    if (blob.type !== f.mime) {
      throw new Error(`this browser cannot write ${f.ext.toUpperCase()} — choose PNG`);
    }
    return blob;
  }

  async function run() {
    const f = format();
    const name = `${stem()}.${f.ext}`;

    /*
     * The folder first, before any drawing: showDirectoryPicker needs the
     * page to still hold the user activation from the click that started
     * this, and a 4096px render can outlast it.
     */
    let dir = null;
    if (hasFSAccess()) {
      dir = await folders.choose();
      if (!dir) { info.textContent = ''; return; }      // dismissed; not an error
      if (await fileExists(dir, name) &&
          !window.confirm(`${name} already exists in ${dir.name} — overwrite it?`)) {
        info.textContent = 'not written — give it another name';
        return;
      }
    }

    info.textContent = 'drawing…';
    const data = await bytes(f);

    if (dir) {
      await writeFile(dir, name, data);
      showFolder();
      info.textContent = `written to ${dir.name}/${name}`;
      setStatus?.(`exported ${name}`, false);
    } else {
      download(name, data, f.mime);
      info.textContent = `saved ${name}`;
      setStatus?.(`exported ${name}`, false);
    }
  }

  go.onclick = async () => {
    if (busy) return;
    busy = true; sync();
    try { await run(); }
    catch (err) { info.textContent = err && err.message ? err.message : String(err); }
    finally { busy = false; sync(); }
  };
  el('#eiCancel').onclick = () => win.setVisible(false);
  el('#eiChangeFolder').onclick = async () => {
    try { await folders.choose(true); }
    catch (err) { info.textContent = err && err.message ? err.message : String(err); }
    showFolder();
    sync();
  };
  for (const c of [fmtSel, square, sizeIn, nameIn]) c.addEventListener('input', sync);

  function open() {
    const doc = currentName();
    // a name typed for THIS document is kept; a different document gets its own
    if (offeredFor !== doc || !nameIn.value) { nameIn.value = slug(doc || ''); offeredFor = doc; }
    info.textContent = '';
    sync();
    showFolder();
    win.setVisible(true);
  }

  return { open, isOpen: () => win.isVisible(),
           setOpen: (v) => (v ? open() : win.setVisible(false)) };
}
