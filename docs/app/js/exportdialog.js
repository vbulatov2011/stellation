/*
 * Exporting stellation diagrams.
 *
 * A diagram is one face plane with every other plane's trace on it, and a
 * solid has as many distinct diagrams as it has kinds of face — one for the
 * icosahedron, three for the truncated cuboctahedron. Before this there was a
 * single button that saved whichever one happened to be on screen, in one
 * style, with nothing in the file to say what it was a picture of. This asks
 * what you want and can save the lot.
 *
 * Three things it is careful about:
 *
 * Reproducibility. Every SVG carries a metadata block naming the solid, both
 * symmetry groups, the plane depth, the cell string and which plane it is
 * drawn on — which is the whole document, so the picture can be rebuilt.
 * Nothing about the on-screen zoom or pan reaches the file: an exported
 * diagram is always the whole plane at its full extent, so two of them can be
 * compared and one of them can be redrawn.
 *
 * All the distinct ones. Faces of the same kind give the same picture, so the
 * dialog offers one per class rather than one per plane, and asks the worker
 * for each in turn. Classed under the STELLATION symmetry, because that is the
 * symmetry the figure was actually built under: drop to a subgroup and faces
 * that were interchangeable stop being so, and the diagrams genuinely differ.
 *
 * Somewhere to put them. With the File System Access API the files go into a
 * folder you pick. Without it, several files mean several download prompts, so
 * they go into one zip instead.
 */

import { diagramSVG, DIAGRAM_DEFAULTS } from '../../lib/diagramsvg.js';
import { makeZip } from '../../lib/uilib/zip.js';
import { hasFSAccess } from '../../lib/uilib/files.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

const $ = (q) => document.querySelector(q);

/*
 * Two ways a diagram is usually wanted. "Plate" is the printed look — the
 * plane's traces drawn right across the figure, no fills, black on white, as
 * Brückner and Hess and Coxeter's book all draw them. "As shown" reproduces
 * what is on screen, chosen cells filled in the colours the app is using.
 */
const PRESETS = {
  plate: { shading: 'outline', traces: 'full', colorMode: 'none',
           background: 'white', lineWidth: 0.7 },
  screen: { shading: 'fill', traces: 'facets', background: 'white', lineWidth: 0.7 },
};

export function initExportDialog({ state, call, diagram, currentName, download, setStatus }) {
  const template = $('#exportBody');
  if (!template) return null;

  /*
   * An internal window, not a <dialog>, so it looks and behaves like the rest
   * of the app's floating panels — same chrome, same close button, same
   * drag and resize, and it follows the theme. Built on first use and kept:
   * the geometry then persists under its storageId, so it reopens where it
   * was left.
   */
  const win = createInternalWindow({
    title: 'Export diagrams',
    // tall enough that the buttons are not below the fold in the widest case,
    // five face classes with the destination row showing; the manager clamps
    // it down on a short viewport and the interior scrolls
    width: '420px', height: '690px',
    left: 'calc(50% - 210px)', top: '4%',
    canClose: true, canResize: true, modal: true, role: 'dialog',
    storageId: 'stell.exportDiagrams',
  });
  win.wnd.classList.add('transient');
  win.interior.appendChild(template.content.cloneNode(true));
  win.setVisible(false);

  const dlg = win.interior;
  const el = (id) => dlg.querySelector(id);
  const close = () => win.setVisible(false);
  const scopeAll = el('#exAll'), scopeOne = el('#exOne');
  const fmtSvg = el('#exSvg'), fmtPng = el('#exPng'), pngSize = el('#exPngSize');
  const preset = el('#exPreset'), shading = el('#exShading'), colorBy = el('#exColor');
  const traces = el('#exTraces'), lineW = el('#exLine'), lineOut = el('#exLineOut');
  const transparent = el('#exTransparent');
  const destFolder = el('#exFolder'), destZip = el('#exZip');
  const nameOut = el('#exName'), info = el('#exInfo'), go = el('#exGo');

  /** the distinct diagrams: one plane per class of face */
  const classes = () => (state.faces?.length ? state.faces : [{ index: 0, sides: 0, count: 1 }]);

  const options = () => {
    const base = PRESETS[preset.value] || {};
    const o = { ...DIAGRAM_DEFAULTS, ...base };
    if (preset.value === 'custom') {
      o.shading = shading.value;
      o.colorMode = colorBy.value;
      o.traces = traces.value;
    }
    o.lineWidth = Number(lineW.value) / 10;
    if (transparent.checked) o.background = null;
    return o;
  };

  /**
   * What the files will be called — <document>-diagram[-<plane>].
   *
   * Slugged, because the name comes from the document and a document is called
   * whatever its author called it: "Truncated cuboctahedron under D3d" is a
   * good title and a poor filename. The plane index is only added when there
   * is more than one file, so the ordinary case stays a plain name.
   */
  const stem = () => currentName().replace(/\.(json|stel|txt)$/i, '')
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stellation';

  const fileFor = (face, n, ext) =>
    `${stem()}-diagram${n > 1 ? '-' + String(face.index).padStart(2, '0') : ''}.${ext}`;

  function sync() {
    const n = scopeAll.checked ? classes().length : 1;
    const ext = fmtPng.checked ? 'png' : 'svg';
    pngSize.disabled = !fmtPng.checked;
    const custom = preset.value === 'custom';
    for (const c of [shading, colorBy, traces]) c.disabled = !custom;
    if (!custom) {
      const o = PRESETS[preset.value];
      shading.value = o.shading;
      traces.value = o.traces;
      colorBy.value = o.colorMode ?? diagram.colorMode;
    }
    lineOut.textContent = (Number(lineW.value) / 10).toFixed(1);
    // one file needs no folder and no archive; it is just a download
    dlg.querySelector('.ex-where').hidden = n < 2;
    destFolder.parentElement.hidden = !hasFSAccess();
    if (!hasFSAccess()) destZip.checked = true;
    nameOut.textContent = fileFor(classes()[0], n, ext) + (n > 1 ? `  … ${n} files` : '');
    go.textContent = `Export ${n} diagram${n === 1 ? '' : 's'}`;
  }

  for (const c of [scopeAll, scopeOne, fmtSvg, fmtPng, preset, shading, colorBy,
                   traces, lineW, transparent, destFolder, destZip]) {
    c.addEventListener('input', sync);
  }

  /*
   * The diagram for one plane. The one on screen is already here; the others
   * have to be asked for, because the worker owns the arrangement and only
   * ever sends the app the plane it is showing.
   */
  async function dataFor(face) {
    if (diagram.data && diagram.data.planeIndex === face.index) return diagram.data;
    return call('diagram', { planeIndex: face.index, selected: [...state.selected] });
  }

  /** an SVG string rasterised at a fixed square size — never the live canvas */
  function toPNG(svg, size) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('could not encode the PNG')), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('could not draw the diagram')); };
      img.src = url;
    });
  }

  async function run() {
    const faces = scopeAll.checked ? classes()
                                   : [classes().find(f => f.index === state.planeIndex) || classes()[0]];
    const o = options();
    const png = fmtPng.checked;
    const size = Math.max(64, Math.min(4096, Number(pngSize.value) || 1024));
    info.textContent = 'drawing…';

    const files = [];
    for (const face of faces) {
      const data = await dataFor(face);
      if (!data) continue;
      const svg = diagramSVG(data, {
        ...o,
        metadata: {
          title: `${currentName()} — diagram on plane ${face.index}`,
          polyhedron: state.current?.file || 'custom',
          polySymmetry: state.polySym,
          stellSymmetry: state.stellSym,
          planeDepth: state.depth,
          plane: face.index,
          faceSides: face.sides || undefined,
          cells: state.cellsString || undefined,
        },
      });
      if (!svg) continue;
      const name = fileFor(face, faces.length, png ? 'png' : 'svg');
      files.push(png ? { name, blob: await toPNG(svg, size) } : { name, text: svg });
    }

    if (!files.length) { info.textContent = 'nothing to draw'; return; }

    // one file is a plain download whatever the browser can do
    if (files.length === 1) {
      const f = files[0];
      if (f.blob) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url; a.download = f.name; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        download(f.name, f.text, 'image/svg+xml');
      }
      setStatus(`saved ${f.name}`);
      close();
      return;
    }

    if (destFolder.checked && hasFSAccess()) {
      let dir;
      try {
        dir = await showDirectoryPicker({ id: 'stellation-diagrams', mode: 'readwrite' });
      } catch { info.textContent = ''; return; }        // the picker was dismissed
      for (const f of files) {
        const handle = await dir.getFileHandle(f.name, { create: true });
        const w = await handle.createWritable();
        await w.write(f.blob ?? f.text);
        await w.close();
      }
      setStatus(`saved ${files.length} diagrams`);
    } else {
      const entries = await Promise.all(files.map(async f => f.blob
        ? { name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) }
        : { name: f.name, text: f.text }));
      const zip = await makeZip(entries);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${stem()}-diagrams.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(`saved ${files.length} diagrams in one archive`);
    }
    info.textContent = '';
    close();
  }

  go.onclick = () => run().catch(err => { info.textContent = err.message; });
  el('#exCancel').onclick = () => close();

  return {
    open() {
      const n = classes().length;
      el('#exAllCount').textContent =
        `${n} for this solid` + (n === 1 ? '' : ' — one per kind of face');
      const cur = classes().find(f => f.index === state.planeIndex);
      el('#exOneCount').textContent = cur?.sides
        ? `${POLYGON[cur.sides] || cur.sides + '-gon'}, ${cur.count} plane${cur.count === 1 ? '' : 's'}`
        : 'the one on screen';
      /*
       * Set both radios, not just the disabled flag. A solid with one kind of
       * face leaves "only the one shown" checked, and opening the dialog on a
       * solid with five afterwards would otherwise inherit that and offer to
       * save one of the five.
       */
      scopeAll.disabled = n < 2;
      scopeAll.checked = n >= 2;
      scopeOne.checked = n < 2;
      info.textContent = '';
      sync();
      win.setVisible(true);
    },
  };
}

const POLYGON = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
                  8: 'octagon', 10: 'decagon', 12: 'dodecagon' };
