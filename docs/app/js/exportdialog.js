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

import { diagramSVG, diagramHasInk, DIAGRAM_DEFAULTS } from '../../lib/diagramsvg.js';
import { makeZip } from '../../lib/uilib/zip.js';
import { hasFSAccess, restoreHandle, setHandle, writeFile } from '../../lib/uilib/files.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

/* where the last export went — asked for once, then remembered */
const FOLDER_KEY = 'stell.exportDiagrams.folder';

const $ = (q) => document.querySelector(q);

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
  const colorBy = el('#exColor');
  const transparent = el('#exTransparent'), fullTraces = el('#exFullTraces');
  const nameOut = el('#exName'), info = el('#exInfo'), go = el('#exGo');

  /*
   * The four kinds of ink, each a switch and (for the three line kinds) a
   * weight. Kept as a table because everything below wants to walk them:
   * reading the options, writing the readouts, and deciding whether the
   * drawing would come out blank.
   */
  const KINDS = [
    { key: 'diagram', on: el('#exDiagram'), w: el('#exDiagramW'), out: el('#exDiagramOut') },
    { key: 'face', on: el('#exFace'), w: el('#exFaceW'), out: el('#exFaceOut') },
    { key: 'facet', on: el('#exFacet'), w: el('#exFacetW'), out: el('#exFacetOut') },
    { key: 'fill', on: el('#exFill') },
  ];
  const kind = (k) => KINDS.find(x => x.key === k);

  /** the distinct diagrams: one plane per class of face */
  const classes = () => (state.faces?.length ? state.faces : [{ index: 0, sides: 0, count: 1 }]);

  /**
   * The faces this export will draw.
   *
   * ONE definition, used by the export and by every readout above it. They
   * were computed separately and disagreed: the prediction looked at the first
   * face class while the export drew the one on screen, so on a solid with
   * several kinds of face the dialog could disable its own button over a
   * diagram that was perfectly good, or promise a file it would not write.
   */
  const facesToExport = () => scopeAll.checked
    ? classes()
    : [classes().find(f => f.index === state.planeIndex) || classes()[0]];

  /*
   * Every option is read from the control that shows it, so what the dialog
   * displays and what the export draws cannot disagree. There is no preset
   * layer in between: with four switches the combinations that matter are a
   * click each, and the preview says what they do better than a name could.
   */
  const options = () => ({
    ...DIAGRAM_DEFAULTS,
    diagramLines: kind('diagram').on.checked,
    diagramWidth: Number(kind('diagram').w.value) / 10,
    faceLines: kind('face').on.checked,
    faceWidth: Number(kind('face').w.value) / 10,
    facetLines: kind('facet').on.checked,
    facetWidth: Number(kind('facet').w.value) / 10,
    fill: kind('fill').on.checked,
    colorMode: colorBy.value,
    traces: fullTraces.checked ? 'full' : 'facets',
    background: transparent.checked ? null : 'white',
  });

  /**
   * What the files will be called — <document>-diagram[-<plane>].
   *
   * Slugged, because the name comes from the document and a document is called
   * whatever its author called it: "Truncated cuboctahedron under D3d" is a
   * good title and a poor filename. The plane index is only added when there
   * is more than one file, so the ordinary case stays a plain name.
   */
  const stem = (name = currentName()) => name.replace(/\.(json|stel|txt)$/i, '')
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stellation';

  const fileFor = (face, n, ext, name) =>
    `${stem(name)}-diagram${n > 1 ? '-' + String(face.index).padStart(2, '0') : ''}.${ext}`;

  function sync() {
    // the document moved under us — unless asking already failed for this one
    if (staleSince() && scanFailedFor !== signature()) scanFaces();
    const asked = facesToExport();
    const o = options();
    const ext = fmtPng.checked ? 'png' : 'svg';
    pngSize.disabled = !fmtPng.checked;
    // a kind that is switched off greys its own weight rather than hiding it
    for (const k of KINDS) {
      if (!k.w) continue;
      k.w.disabled = !k.on.checked;
      k.out.textContent = (Number(k.w.value) / 10).toFixed(1);
      k.out.classList.toggle('dim', !k.on.checked);
    }
    colorBy.disabled = !kind('fill').on.checked;

    /*
     * What will actually be written, decided by the SAME predicate the export
     * uses — diagramHasInk on the real geometry — rather than by a rule of
     * thumb about the traces. With both weights at zero and no fills, every
     * face draws a blank page, and only asking the drawing itself catches
     * that; a prediction that merely counted faces with no chosen facets said
     * "Export 5" and then wrote nothing.
     *
     * A face not yet scanned counts as drawable: the scan is a few worker
     * round trips and the button should not flicker to disabled while it runs.
     */
    const blank = asked.filter(f => scanned.has(f.index) && !diagramHasInk(scanned.get(f.index), o));
    /*
     * Two different reasons a page comes out blank, and they want different
     * words. Either the settings draw nothing whatever the figure is — both
     * weights at zero with no fill — or the settings are fine and the figure
     * simply does not reach that face.
     */
    const drawsNothing = !KINDS.some(k => k.on.checked && (!k.w || Number(k.w.value) > 0));
    el('#exEmpty').hidden = !blank.length;
    el('#exEmpty').textContent = !blank.length ? ''
      : drawsNothing
        ? 'these settings draw nothing — turn up a line weight, or fill the chosen cells'
        : `${blank.length} of ${asked.length} would be blank — nothing of the figure falls on ` +
          `${blank.length === 1 ? 'that face' : 'those faces'}, so ` +
          `${blank.length === 1 ? 'it is' : 'they are'} skipped`;

    const willWrite = asked.length - blank.length;
    el('#exWhereRow').hidden = !hasFSAccess();
    el('#exZipNote').hidden = hasFSAccess() || willWrite < 2;
    nameOut.textContent = willWrite
      ? fileFor(asked.find(f => !blank.includes(f)) || asked[0], willWrite, ext) +
        (willWrite > 1 ? `  … ${willWrite} files` : '')
      : '';
    go.textContent = `Export ${willWrite} diagram${willWrite === 1 ? '' : 's'}`;
    go.disabled = willWrite === 0 || busy;
    preview(asked, o, blank);
  }

  /*
   * The preview is the export.
   *
   * It calls diagramSVG with exactly the options the export will use, on
   * exactly the geometry the export will draw, so what you are looking at is
   * the file — not an impression of it. That is worth more than it sounds:
   * four switches and three weights make a lot of combinations, and several of
   * them differ only in ways you would never predict from the words.
   *
   * The one difference is size: the preview asks for a small viewBox so the
   * strokes are in proportion to what you see. Everything else, including the
   * background, is what will be written.
   */
  function preview(asked, o, blank) {
    const box = el('#exPreview');
    const note = el('#exPreviewNote');
    if (!box) return;
    const face = asked.find(f => !blank.includes(f)) || asked[0];
    const data = face && scanned.get(face.index);
    if (!data) {
      box.innerHTML = '';
      note.textContent = scanning ? 'reading the diagram…' : '';
      return;
    }
    box.innerHTML = diagramSVG(data, { ...o, size: 240, metadata: null });
    const chosen = data.facets.filter(f => f.selected).length;
    note.textContent = asked.length > 1
      ? `plane ${face.index}, the first of ${asked.length} — ${data.facets.length} regions, ` +
        `${chosen} on the surface`
      : `${data.facets.length} regions, ${chosen} on the surface`;
  }

  /*
   * Nothing in the app tells this window that the document moved — it floats
   * over an app that stays live — so it re-reads on the way back in. Clicking
   * anywhere in the window is the moment the reader's attention returns to it,
   * and it is exactly when a stale count would be believed.
   */
  win.wnd.addEventListener('pointerdown', () => sync(), true);

  // every control redraws the preview, which is the whole point of having one
  for (const c of [scopeAll, scopeOne, fmtSvg, fmtPng, colorBy, transparent, fullTraces,
                   ...KINDS.flatMap(k => [k.on, k.w].filter(Boolean))]) {
    c.addEventListener('input', sync);
  }
  el('#exChangeFolder').onclick = async () => {
    // chooseFolder rethrows anything that is not a dismissal — say so, rather
    // than dropping it as an unhandled rejection with the dialog unchanged
    try { await chooseFolder(true); }
    catch (err) { info.textContent = err && err.message ? err.message : String(err); }
    sync();
  };

  /*
   * The folder to write into.
   *
   * Remembered between exports, the way the app remembers where documents are
   * saved: the handle is kept in IndexedDB and restoreHandle re-checks the
   * permission, asking again only if the browser has forgotten it or the
   * folder has gone. So the second export and every one after it writes
   * straight out with no picker at all — which is the point of remembering,
   * and what makes exporting five diagrams a single click.
   *
   * `force` is the "change…" button: ask even though we have one.
   */
  let folder = null;
  async function chooseFolder(force = false) {
    if (!force) {
      // re-check after the await: the user may have picked one meanwhile
      if (!folder) {
        const restored = await restoreHandle(FOLDER_KEY, 'readwrite');
        folder ||= restored;
      }
      if (folder) return folder;
    }
    let picked;
    try {
      picked = await showDirectoryPicker({ id: 'stellation-diagrams', mode: 'readwrite' });
    } catch (err) {
      /*
       * A dismissed picker is an AbortError and means "never mind". Anything
       * else is a real failure — no permission, a browser that refuses because
       * the click that started this has gone stale — and swallowing it made
       * pressing Export do nothing at all, with no message and the drawn files
       * thrown away.
       */
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
    folder = picked;
    await setHandle(FOLDER_KEY, folder);
    showFolder();
    return folder;
  }

  async function showFolder() {
    if (!hasFSAccess()) return;
    folder ||= await restoreHandle(FOLDER_KEY, 'readwrite');
    const where = el('#exWhere');
    if (where) {
      where.textContent = folder ? folder.name : 'you will be asked once';
      where.classList.toggle('dim', !folder);
    }
  }

  /*
   * The diagrams, kept only while they are still true.
   *
   * This window floats: it does not stop you clicking a cell behind it, and
   * nothing closes it when a different document is loaded. A cache keyed by
   * plane index alone therefore goes bad two ways — the same plane after the
   * selection changed, and plane 2 of an entirely different solid — and both
   * are silent, because a file's name and metadata are built at export time
   * while its picture would come from the cache. The result is an SVG whose
   * recorded cell string does not draw the picture inside it, which is the one
   * promise the metadata exists to make.
   *
   * So everything the drawing depends on is rolled into a signature, and two
   * things guard it. The signature says WHETHER what we hold is still true.
   * The generation counter says whether a reply that is already in flight
   * still belongs to us: it is bumped whenever the cache is thrown away, and a
   * fetch that returns to find it changed neither caches its answer nor lets
   * the caller mistake it for a current one. Without that second guard a reply
   * posted for the old document lands in the new document's map and is then
   * certified as current, which is the same wrong file by a longer road.
   */
  const signature = () => JSON.stringify([
    state.current?.file, state.polySym, state.stellSym, state.depth,
    state.cellsString,
    // two custom plane sheets are both `current.file === 'custom'`, so the
    // sheet itself has to be in the signature or they are indistinguishable
    state.customPlanes ? state.planeRows : null,
  ]);

  let scanned = new Map();       // plane index -> diagram data
  let scannedSig = null;         // the signature those entries belong to
  let generation = 0;
  let scanning = null;
  let scanFailedFor = null;      // do not loop retrying a scan that threw

  /** has the document moved since what we hold was fetched? */
  const staleSince = () => scannedSig !== null && scannedSig !== signature();

  function invalidate() {
    generation++;
    scanned = new Map();
    scannedSig = null;
    scanFailedFor = null;
  }

  /**
   * One plane's regions, from the worker that owns the arrangement.
   *
   * Returns null when the answer arrived for a document that is no longer the
   * one on screen — the caller must treat that as "try again", never as a
   * diagram.
   */
  async function dataFor(face) {
    if (staleSince()) invalidate();
    if (scanned.has(face.index)) return scanned.get(face.index);

    const sig = signature();
    const mine = generation;
    const d = (diagram.data && diagram.data.planeIndex === face.index)
      ? diagram.data
      : await call('diagram', { planeIndex: face.index, selected: [...state.selected] });

    // the document may have moved while that was in flight
    if (mine !== generation || signature() !== sig) return null;
    scanned.set(face.index, d);
    scannedSig = sig;
    return d;
  }

  /*
   * Draw every face class once, so the dialog can say which of them the figure
   * does not reach before you press the button — and so the export does not
   * fetch them a second time. One scan at a time; a second request while one
   * is in flight waits for it rather than racing it.
   */
  function scanFaces() {
    if (scanning) return scanning;
    scanning = (async () => {
      try {
        if (staleSince()) invalidate();
        for (const face of classes()) {
          // a null means the document moved; the next sync starts a fresh scan
          if (await dataFor(face) === null) break;
        }
      } catch (err) {
        /*
         * Remember which document the failure was for. sync() starts a scan
         * whenever what we hold is stale, so without this a worker that
         * refuses once is asked again on every slider nudge, for ever.
         */
        scanFailedFor = signature();
        info.textContent = 'could not read the diagrams: ' + err.message;
      } finally {
        scanning = null;
      }
      sync();
    })();
    return scanning;
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
    const faces = facesToExport();
    const o = options();
    const png = fmtPng.checked;
    const size = Math.max(64, Math.min(4096, Number(pngSize.value) || 1024));

    /*
     * The folder first, before any drawing.
     *
     * showDirectoryPicker needs the page to still hold the user activation
     * from the click that started this, and drawing twenty diagrams and
     * rasterising them to PNG can outlast it — after which the browser refuses
     * the picker and the work is thrown away. Asking first also means a
     * dismissed picker costs nothing.
     */
    let dir = null;
    if (hasFSAccess()) {
      dir = await chooseFolder();
      if (!dir) { info.textContent = ''; return; }     // dismissed; not an error
    }

    info.textContent = 'drawing…';

    /*
     * One export is one document. Everything that ends up in the files — the
     * name, and every field of the metadata — is read once, here, and the
     * signature is checked after every fetch: if the document moves while this
     * is running, the export stops and says so rather than writing a set of
     * plates that came from two different figures, or a picture labelled with
     * a cell string that does not draw it.
     */
    const sig = signature();
    const doc = {
      name: currentName(),
      polyhedron: state.current?.file || 'custom',
      polySymmetry: state.polySym,
      stellSymmetry: state.stellSym,
      planeDepth: state.depth,
      cells: state.cellsString || undefined,
    };
    const moved = () => signature() !== sig;

    const drawn = [];
    let skipped = 0;
    for (const face of faces) {
      const data = await dataFor(face);
      if (moved()) throw new Error('the document changed while exporting — nothing was written');
      if (!data) continue;
      /*
       * With the traces turned off, a face with nothing chosen on it draws a
       * blank page. That is a real answer to "show me what this figure takes
       * from this face" — the answer is nothing — but it is not a file worth
       * writing, so it is skipped and counted. With the traces on there is
       * always the arrangement to draw and nothing is ever skipped.
       */
      if (!diagramHasInk(data, o)) { skipped++; continue; }
      const svg = diagramSVG(data, {
        ...o,
        metadata: {
          ...doc,
          title: `${doc.name} — diagram on plane ${face.index}`,
          plane: face.index,
          faceSides: face.sides || undefined,
        },
      });
      if (!svg) continue;
      drawn.push({ face, svg });
    }

    /*
     * Named only now. The name says which plane it is only when there is more
     * than one file, and how many files there are is not known until the blank
     * ones have been skipped — naming inside the loop used the number of faces
     * ASKED for, so a run that skipped all but one wrote a numbered name while
     * the dialog had previewed a plain one.
     */
    const files = [];
    for (const { face, svg } of drawn) {
      const name = fileFor(face, drawn.length, png ? 'png' : 'svg', doc.name);
      files.push(png ? { name, blob: await toPNG(svg, size) } : { name, text: svg });
    }
    if (moved()) throw new Error('the document changed while exporting — nothing was written');

    if (!files.length) {
      info.textContent = skipped
        ? `nothing to draw — nothing of the figure falls on ` +
          `${skipped === 1 ? 'that face' : 'those faces'}`
        : 'nothing to draw';
      return;
    }

    /*
     * Where it goes. The folder if this browser has the File System Access API,
     * whether that is one file or twenty — before this, a single file went to
     * the downloads folder however capable the browser was, so the one case
     * people do most often ignored the folder they had just chosen. Without
     * the API, one file downloads and several become one archive.
     */
    if (dir) {
      for (const f of files) await writeFile(dir, f.name, f.blob ?? f.text);
      setStatus(files.length === 1
        ? `saved ${files[0].name} in ${dir.name}`
        : `saved ${files.length} diagrams in ${dir.name}`);
    } else if (files.length === 1) {
      const f = files[0];
      if (f.blob) saveBlob(f.blob, f.name);
      else download(f.name, f.text, 'image/svg+xml');
      setStatus(`saved ${f.name}`);
    } else {
      const entries = await Promise.all(files.map(async f => f.blob
        ? { name: f.name, bytes: new Uint8Array(await f.blob.arrayBuffer()) }
        : { name: f.name, text: f.text }));
      saveBlob(await makeZip(entries), `${stem(doc.name)}-diagrams.zip`);
      setStatus(`saved ${files.length} diagrams in one archive`);
    }
    if (skipped) {
      setStatus(`${files.length} saved, ${skipped} skipped for drawing nothing`);
    }
    info.textContent = '';
    close();
  }

  function saveBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /*
   * One run at a time. Nothing disabled the button while an export was in
   * flight, so a second click started a second run over the same files — and
   * whichever finished first closed the dialog, possibly one the user had
   * since reopened.
   */
  let busy = false;
  go.onclick = async () => {
    if (busy) return;
    busy = true;
    go.disabled = true;
    try {
      await run();
    } catch (err) {
      info.textContent = err && err.message ? err.message : String(err);
    } finally {
      busy = false;
      sync();
    }
  };
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
      showFolder();
      scanFaces();          // re-reads only if the document has moved
    },
  };
}

const POLYGON = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
                  8: 'octagon', 10: 'decagon', 12: 'dodecagon' };
