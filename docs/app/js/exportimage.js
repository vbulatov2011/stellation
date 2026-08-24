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
 * The three raster formats, and the whole difference between them.
 *
 * PNG is exact. WebP is about half the size, with the alpha channel kept just
 * as exactly and the colors very slightly lossy on the antialiased edges — a
 * canvas has no lossless WebP setting to ask for, at any quality. JPEG has no
 * alpha channel at all, so a picture written as one has to be given something
 * to stand on: `opaque` marks it, and the background painted behind it is the
 * one currently behind the view, so the file looks like the screen it came
 * from rather than like the black a canvas would default to.
 */
const FORMATS = [
  { id: 'png', label: 'PNG — exact, transparent', ext: 'png', mime: 'image/png',
    note: 'Lossless. Every pixel is the one on screen, transparency included.' },
  { id: 'webp', label: 'WebP — transparent, about half the size', ext: 'webp',
    mime: 'image/webp', quality: 1,
    note: 'Keeps transparency exactly and packs to roughly half a PNG. The colors ' +
          'are very slightly lossy on the antialiased edges — take PNG when the ' +
          'pixels have to match.' },
  { id: 'jpg', label: 'JPEG — smallest, no transparency', ext: 'jpg',
    mime: 'image/jpeg', quality: 0.92, opaque: true,
    note: 'JPEG cannot hold transparency, so the picture is laid on the background ' +
          'the view has now. Smallest of the three, and lossy everywhere.' },
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
  const widthIn = el('#eiWidth'), heightIn = el('#eiHeight');
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

  /** the size the view is on screen, which is what the boxes open at */
  const viewSize = () => ({ w: renderer?.canvas?.width || 0, h: renderer?.canvas?.height || 0 });

  /** what the picture will measure: whatever the two boxes say, within reason */
  const clamp = (v, fallback) =>
    Math.max(16, Math.min(8192, Math.round(Number(v) || fallback || 16)));
  const pixels = () => {
    const view = viewSize();
    return { w: clamp(widthIn.value, view.w), h: clamp(heightIn.value, view.h) };
  };

  function sync() {
    const f = format();
    el('#eiNote').textContent = f.note;
    const { w, h } = pixels();
    const view = viewSize();
    /*
     * The camera takes the aspect ratio into account, so a picture written at
     * a different shape from the window is not the window cropped — it is the
     * same solid framed for that shape. Worth saying, because asking for a
     * square from a wide view and getting more of the figure rather than less
     * looks like a bug until you know it.
     */
    const same = w === view.w && h === view.h;
    el('#eiSizeOut').textContent = same
      ? `${w} × ${h} px — the view as it is on screen`
      : `${w} × ${h} px — the view is ${view.w} × ${view.h}; ` +
        (w * view.h === h * view.w
          ? 'the same shape, so the same framing'
          : 'a different shape, so the figure is framed for it');
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
   * The colour behind the view, as the screen has it.
   *
   * Read off the canvas element rather than kept here: the renderer paints no
   * background of its own any more, it sets one on its element (see
   * Renderer3D's `background`), and that is precisely "the background
   * currently visible". Falls back to white, which is a better guess than the
   * black a canvas composites onto when asked for a JPEG.
   */
  function backdrop() {
    const el2 = renderer?.canvas;
    const c = el2 && getComputedStyle(el2).backgroundColor;
    return (c && c !== 'transparent' && !/^rgba\(0, 0, 0, 0\)$/.test(c)) ? c : '#ffffff';
  }

  /**
   * The picture, as bytes.
   *
   * Drawn at the asked-for size through the renderer, which resizes its
   * drawing buffer, draws, copies the pixels out and puts the buffer back —
   * the copy has to happen in the same task, because the context keeps no
   * drawing buffer between them.
   *
   * A format with no alpha channel is laid on the background first. Without
   * that, `toDataURL('image/jpeg')` composites onto black, and a figure that
   * looked right on a pale screen comes back on a black square.
   */
  async function bytes(f) {
    const { w, h } = pixels();
    let canvas = renderer.image(w, h);
    if (f.opaque) {
      const flat = document.createElement('canvas');
      flat.width = w; flat.height = h;
      const ctx = flat.getContext('2d');
      ctx.fillStyle = backdrop();
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(canvas, 0, 0);
      canvas = flat;
    }
    const url = canvas.toDataURL(f.mime, f.quality);
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
  for (const c of [fmtSel, widthIn, heightIn, nameIn]) c.addEventListener('input', sync);
  el('#eiFitView').onclick = () => {
    const { w, h } = viewSize();
    widthIn.value = w; heightIn.value = h;
    sync();
  };

  function open() {
    const doc = currentName();
    // a name typed for THIS document is kept; a different document gets its own
    if (offeredFor !== doc || !nameIn.value) { nameIn.value = slug(doc || ''); offeredFor = doc; }
    // the boxes open at the size the view is, every time: the window is the
    // one thing that has certainly moved since this was last opened
    const { w, h } = viewSize();
    if (w && h) { widthIn.value = w; heightIn.value = h; }
    info.textContent = '';
    sync();
    showFolder();
    win.setVisible(true);
  }

  return { open, isOpen: () => win.isVisible(),
           setOpen: (v) => (v ? open() : win.setVisible(false)) };
}
