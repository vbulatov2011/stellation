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
import { to3MF, toGLTF, toGLB, toVRML, toX3D, faceColors, tubesToMesh,
         annotationsToMesh, orientMesh, mergeMeshes } from '../../lib/exportmesh.js';
import { hasFSAccess, writeFile, createFolderChooser, fileExists } from '../../lib/uilib/files.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

const $ = (q) => document.querySelector(q);

/*
 * Every format in one table: what it is called, what it writes, and whether it
 * can carry colour. `make` is given the mesh, the file's stem and the face
 * colours — null when the format cannot take them or the user does not want
 * them — and returns a string, a Blob, or a Uint8Array; the writing code below
 * cares only which of those, not which format produced it.
 */
const FORMATS = [
  { id: 'stl', label: 'STL — mesh for 3D printing', ext: 'stl',
    make: (mesh, stem) => toSTL(mesh, stem) },
  { id: 'obj', label: 'OBJ — Wavefront', ext: 'obj', make: (mesh) => toOBJ(mesh) },
  { id: 'off', label: 'OFF — Object File Format', ext: 'off', color: true,
    make: (mesh, stem, colors) => toOFF(mesh, colors) },
  { id: '3mf', label: '3MF — for a modern slicer', ext: '3mf', color: true,
    make: (mesh, stem, colors) => to3MF(mesh, stem, colors) },
  { id: 'gltf', label: 'glTF — one JSON file', ext: 'gltf', color: true,
    make: (mesh, stem, colors) => toGLTF(mesh, stem, colors) },
  { id: 'glb', label: 'GLB — glTF, binary', ext: 'glb', color: true,
    make: (mesh, stem, colors) => toGLB(mesh, stem, colors) },
  { id: 'wrl', label: 'VRML 2 — scene graph', ext: 'wrl', color: true,
    make: (mesh, stem, colors) => toVRML(mesh, stem, colors) },
  { id: 'x3d', label: 'X3D — scene graph, XML', ext: 'x3d', color: true,
    make: (mesh, stem, colors) => toX3D(mesh, stem, colors) },
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
  const wantColor = el('#esColor'), wantTubes = el('#esTubes');
  const wantElements = el('#esElements'), wantOrient = el('#esOrient');
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

  /** the edge tubes the view is drawing, if it is drawing any */
  const tubeSpec = () => (renderer?.edgeTubeSpec?.() || []);
  /** the symmetry elements and coordinate frame the view is drawing */
  const annotations = () => (renderer?.annotationSpec?.()
    || { axes: [], improper: [], mirrors: [], coord: [] });
  const annotationCount = (a) =>
    (a.axes?.length || 0) + (a.improper?.length || 0) +
    (a.mirrors?.length || 0) + (a.coord?.length || 0);

  /**
   * What actually goes into the file: the solid, the edge tubes and the
   * symmetry elements when the view is drawing them and they are wanted, a
   * colour per face when the format can hold one, and the view's own
   * orientation when that is asked for. Built here rather than in each writer
   * so that every format is given the same figure.
   *
   * The colouring is the view's, read from the renderer rather than kept
   * separately: the menu that changes it is the 3-D view's menu, and an export
   * that always said "by shell" while the screen said "by face class" was
   * answering a question nobody had asked.
   */
  function content() {
    const f = format();
    const colored = f.color && wantColor.checked;
    let mesh = state.mesh;
    let colors = colored ? faceColors(mesh, renderer?.colorMode || 'layer') : null;

    const add = (part) => {
      const merged = mergeMeshes(mesh, colors, part, part.colors);
      mesh = merged.mesh;
      colors = colored ? merged.colors : null;
    };

    const specs = wantTubes.checked ? tubeSpec() : [];
    if (specs.length) add(tubesToMesh(specs));

    const anno = wantElements.checked ? annotations() : null;
    const nAnno = anno ? annotationCount(anno) : 0;
    if (nAnno) add(annotationsToMesh(anno));

    if (wantOrient.checked && renderer?.viewRotation3) {
      mesh = orientMesh(mesh, renderer.viewRotation3());
    }
    return { mesh, colors, tubes: specs.length, elements: nAnno };
  }

  function sync() {
    const f = format();
    el('#esFile').textContent = `${stem()}.${f.ext}`;
    el('#esWhereRow').hidden = !hasFSAccess();

    /*
     * Both switches say what they can do rather than vanishing when they
     * cannot: a greyed box with a reason beside it answers "why is this file
     * grey" before it is asked, where a missing one leaves the question.
     */
    const drawn = tubeSpec();
    wantColor.disabled = !f.color;
    el('#esColorWhy').textContent = f.color ? ''
      : f.id === 'stl' ? 'STL has nowhere to put it'
      : f.id === 'obj' ? 'OBJ would need a second file beside it'
      : 'not for this format';
    wantTubes.disabled = !drawn.length;
    el('#esTubesWhy').textContent = drawn.length
      ? `${drawn.map(d => d.kind).join(' and ')} edges, as the view draws them`
      : 'the view is drawing edges as lines, which have no thickness';

    const anno = annotations();
    const kinds = [
      anno.axes.length && `${anno.axes.length} axes`,
      anno.improper.length && `${anno.improper.length} rotoreflection axes`,
      anno.mirrors.length && `${anno.mirrors.length} mirror rims`,
      anno.coord.length && 'the coordinate frame',
    ].filter(Boolean);
    wantElements.disabled = !kinds.length;
    el('#esElementsWhy').textContent = kinds.length
      ? kinds.join(', ') : 'none are shown in the view';
    /*
     * What each format actually gets. A PNG is the view as it stands — its
     * angle, its colours, its zoom — where every other format is the mesh,
     * which carries none of that; and .stel is the document rather than the
     * solid. Saying so here saves exporting one to find out.
     */
    if (f.view || f.doc || !state.mesh) {
      el('#esNote').textContent = f.view
        ? 'the 3-D view exactly as it stands — angle, colours and all'
        : f.doc
          ? 'the document in the original Java program’s format, not a mesh'
          : 'there is no mesh to write';
    } else {
      // the real count, everything included, because that is what will be written
      const { mesh, tubes, elements } = content();
      const extra = [tubes && 'the edge tubes', elements && 'the symmetry elements']
        .filter(Boolean).join(' and ');
      el('#esNote').textContent =
        `${mesh.vertices.length} vertices, ${mesh.faces.length} faces` +
        (extra ? `, ${extra} among them` : '');
    }
    go.disabled = busy || (!f.view && !f.doc && !state.mesh);
  }

  for (const c of [fmtSel, nameIn, wantColor, wantTubes, wantElements, wantOrient]) {
    c.addEventListener('input', sync);
  }

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
      // a name already in the folder is a question, never a silent replacement
      if (await fileExists(dir, name) &&
          !window.confirm(`${name} already exists in ${dir.name} — overwrite it?`)) {
        info.textContent = 'not written — give it another name';
        return;
      }
    }

    info.textContent = 'writing…';
    let data;
    if (f.view) data = await viewPNG();
    else if (f.doc) {
      data = await writeStelText();
      if (!data) return;                  // the caller has already said why
    } else {
      if (!state.mesh) { info.textContent = 'there is no mesh to write'; return; }
      const { mesh, colors } = content();
      data = await f.make(mesh, stem(), colors);
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
