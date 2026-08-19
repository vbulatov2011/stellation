/*
 * Exporting the solid.
 *
 * The formats used to be a row of buttons — STL, OBJ, OFF, .stel, view PNG —
 * each of which downloaded immediately under a name you did not choose, into
 * the downloads folder whatever the browser could do. Six formats is already
 * too many buttons, and the three that were missing (3MF for a slicer, glTF
 * and GLB for anything that displays models) would have made nine.
 *
 * So: one dialog. Pick the format, say what the file is called, and — where
 * the browser has the File System Access API — say once which folder it goes
 * in and have every later export go straight there. The same three questions
 * the diagram export asks, in the same window furniture, because they are the
 * same three questions.
 *
 * The writers themselves are elsewhere and pure: OFF, OBJ and STL in core.js,
 * 3MF, glTF and GLB in lib/exportmesh.js, .stel through the worker because it
 * may need the selection re-expressed under E. Nothing here knows a file
 * format; it knows what to call the file and where to put it.
 */

import { toOFF, toOBJ, toSTL } from '../../lib/core.js';
import { to3MF, toGLTF, toGLB } from '../../lib/exportmesh.js';
import { hasFSAccess, writeFile, createFolderChooser } from '../../lib/uilib/files.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

const $ = (q) => document.querySelector(q);

/*
 * Every format in one table: what it is called, what it writes, and whether it
 * comes out as text or as bytes. `make` is given the mesh and the file's stem
 * and returns a string, a Blob, or a Uint8Array — the writing code below cares
 * only which of those, not which format produced it.
 */
const FORMATS = [
  { id: 'stl', label: 'STL — mesh for 3D printing', ext: 'stl',
    make: (mesh, stem) => toSTL(mesh, stem) },
  { id: 'obj', label: 'OBJ — Wavefront', ext: 'obj', make: (mesh) => toOBJ(mesh) },
  { id: 'off', label: 'OFF — Object File Format', ext: 'off', make: (mesh) => toOFF(mesh) },
  { id: '3mf', label: '3MF — for a modern slicer', ext: '3mf',
    make: (mesh, stem) => to3MF(mesh, stem) },
  { id: 'gltf', label: 'glTF — one JSON file', ext: 'gltf',
    make: (mesh, stem) => toGLTF(mesh, stem) },
  { id: 'glb', label: 'GLB — glTF, binary', ext: 'glb',
    make: (mesh, stem) => toGLB(mesh, stem) },
  { id: 'png', label: 'PNG — a picture of the view', ext: 'png', view: true },
  { id: 'stel', label: '.stel — for the original Java program', ext: 'stel', doc: true },
];

export function initExportSolid({ state, renderer, currentName, download, setStatus, writeStelText }) {
  const template = $('#exportSolidBody');
  if (!template) return null;

  const win = createInternalWindow({
    title: 'Export solid',
    /*
     * A real height, not `auto`. A resizable window persists the size it
     * measures, and this one is built empty and hidden — so `auto` measured
     * two pixels of border, saved that, and every later session restored a
     * two-pixel sliver: the dialog opened, correctly, and there was nothing to
     * see. internalWindow now refuses a size that small at both ends, but a
     * window that says what size it is never gets into the argument.
     */
    width: '380px', height: '460px',
    left: 'calc(50% - 190px)', top: '12%',
    canClose: true, canResize: true, modal: true, role: 'dialog',
    storageId: 'stell.exportSolid',
  });
  win.wnd.classList.add('transient');
  win.interior.appendChild(template.content.cloneNode(true));
  win.setVisible(false);

  const dlg = win.interior;
  const el = (id) => dlg.querySelector(id);
  const fmtSel = el('#esFormat'), nameIn = el('#esName');
  const info = el('#esInfo'), go = el('#esGo');
  let busy = false;
  /*
   * The name the dialog last offered. A name the user typed is theirs and
   * survives the window closing and opening again — but only for the document
   * it was typed for: open on a different one and it offers that one's name
   * instead, rather than quietly writing the new figure under the old title.
   */
  let offeredFor = null;

  for (const f of FORMATS) {
    const o = document.createElement('option');
    o.value = f.id; o.textContent = f.label;
    fmtSel.appendChild(o);
  }

  const folders = createFolderChooser({
    key: 'stell.exportSolid.folder', pickerId: 'stellation-models',
  });

  const format = () => FORMATS.find(f => f.id === fmtSel.value) || FORMATS[0];

  /*
   * The stem, slugged the way the diagram export slugs its own: a document is
   * called whatever its author called it, and "Truncated cuboctahedron under
   * D3d" is a good title and a poor filename.
   */
  const slug = (s) => s.replace(/\.(json|stel|txt)$/i, '')
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stellation';

  const stem = () => slug(nameIn.value || currentName());

  async function showFolder() {
    if (!hasFSAccess()) return;
    const folder = await folders.current();
    const where = el('#esWhere');
    if (where) {
      where.textContent = folder ? folder.name : 'you will be asked once';
      where.classList.toggle('dim', !folder);
    }
  }

  function sync() {
    const f = format();
    el('#esFile').textContent = `${stem()}.${f.ext}`;
    el('#esWhereRow').hidden = !hasFSAccess();
    /*
     * What each format actually gets. A PNG is the view as it stands — its
     * angle, its colours, its zoom — where every other format is the mesh,
     * which carries none of that; and .stel is the document rather than the
     * solid. Saying so here saves exporting one to find out.
     */
    el('#esNote').textContent = f.view
      ? 'the 3-D view exactly as it stands — angle, colours and all'
      : f.doc
        ? 'the document in the original Java program’s format, not a mesh'
        : `the mesh: ${state.mesh ? state.mesh.stats.vertices : 0} vertices, ` +
          `${state.mesh ? state.mesh.stats.faces : 0} faces`;
    go.disabled = busy || (!f.view && !f.doc && !state.mesh);
  }

  for (const c of [fmtSel, nameIn]) c.addEventListener('input', sync);

  el('#esChangeFolder').onclick = async () => {
    try { await folders.choose(true); }
    catch (err) { info.textContent = err && err.message ? err.message : String(err); }
    showFolder();
  };
  el('#esCancel').onclick = () => win.setVisible(false);

  /** the picture, as bytes rather than a data URL, so it writes like the rest */
  async function viewPNG() {
    const url = renderer.snapshot();
    return await (await fetch(url)).blob();
  }

  async function run() {
    const f = format();
    const name = `${stem()}.${f.ext}`;

    /*
     * The folder first, before any work: showDirectoryPicker needs the page to
     * still hold the user activation from the click that started this, and
     * building a mesh file can outlast it — after which the browser refuses the
     * picker and the work is thrown away.
     */
    let dir = null;
    if (hasFSAccess()) {
      dir = await folders.choose();
      if (!dir) { info.textContent = ''; return; }      // dismissed; not an error
    }

    info.textContent = 'writing…';
    let data;
    if (f.view) data = await viewPNG();
    else if (f.doc) {
      data = await writeStelText();
      if (!data) return;                  // the caller has already said why
    } else {
      if (!state.mesh) { info.textContent = 'there is no mesh to write'; return; }
      data = await f.make(state.mesh, stem());
    }

    if (dir) {
      await writeFile(dir, name, data);
      setStatus(`saved ${name} in ${dir.name}`);
    } else if (typeof data === 'string') {
      download(name, data, 'application/octet-stream');
      setStatus(`saved ${name}`);
    } else {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setStatus(`saved ${name}`);
    }
    info.textContent = '';
    win.setVisible(false);
  }

  go.onclick = async () => {
    if (busy) return;
    busy = true; go.disabled = true;
    try { await run(); }
    catch (err) { info.textContent = err && err.message ? err.message : String(err); }
    finally { busy = false; sync(); }
  };

  return {
    open() {
      const offer = slug(currentName());
      if (offeredFor !== offer) { nameIn.value = offer; offeredFor = offer; }
      info.textContent = '';
      sync();
      win.setVisible(true);
      showFolder();
    },
  };
}
