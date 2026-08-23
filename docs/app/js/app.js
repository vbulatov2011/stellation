/*
 * The Stellation app: pick a polyhedron, watch its face planes cut space into
 * cells, choose cells, get a stellated solid.
 */

import {
  Renderer3D, DiagramView, CellsPanel, labelKeys,
  writeStel, facePlanes, suggestDepth,
} from '../../lib/modules.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';
import { writePreset, readDocument, newDocumentName, normalizePlaneRows,
         expandPlaneRows } from './preset.js';
import { initWorkspace } from './workspace.js';
import { getSquareThumbnailCanvas } from '../../lib/uilib/files.js';
import { initPresets } from './presets.js';
import { initDocManager } from './docmanager.js';
import { initPlanesDialog } from './planesdialog.js';
import { initExportDialog } from './exportdialog.js';
import { initExportSolid } from './exportsolid.js';
import { initColors, colorsArray, applyColorsArray } from './colors.js';
import { hasColorOverrides, setColorOverrides } from '../../lib/palette.js';
import { initAnimation } from './animation.js';

const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

/*
 * Which build you are looking at.
 *
 * Shown in the help dialog because a good part of the 6 August session went on
 * a bug that had been fixed an hour earlier — the browser was serving an old
 * app.js and there was no way to tell from the screen. `_headers` stops that
 * happening; this makes it checkable when it does.
 */
export const BUILD = '2026-08-06';

const state = {
  catalog: null, symmetry: null, geometry: null,
  current: null,
  polySym: 'Ih', stellSym: 'I',
  depth: 20,
  depthAuto: true,          // until the user moves the slider
  outline: null,
  selected: new Set(),
  planeIndex: 0,
  /*
   * Keep planes through the center in the arrangement. Off by default and
   * saved with the document (format release 4): a build that dropped the
   * d=0 rows would resolve the same cells string against a different
   * arrangement, so old builds must refuse such documents, not misread them.
   */
  centralPlanes: false,
  building: false,
  // edited since the last save or open — see touch() and confirmDiscard()
  dirty: false,
};

// ------------------------------------------------------------------ worker

let worker = null, msgId = 0;
const pending = new Map();

/*
 * Stopping a build.
 *
 * The arrangement is one long synchronous run inside the worker — clipping
 * polygons plane by plane — so there is nothing to poll and nothing to ask it
 * to stop. Terminating the worker is the only interruption there is, and it
 * takes the built arrangement with it: what the worker was holding is gone,
 * which is why this leaves the app with nothing selected rather than pretending
 * the previous figure is still there to go back to.
 *
 * Everything in flight is rejected first, so the awaits in build() and
 * refresh() unwind instead of hanging on a worker that no longer exists.
 */
function stopBuild() {
  if (!state.building) return;
  buildStopped = true;
  for (const [, p] of pending) p.reject(new Error('stopped'));
  pending.clear();
  startWorker();
}

function startWorker() {
  worker?.terminate();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const { id, ok, data, error, progress } = e.data;
    const p = pending.get(id);
    if (!p) return;
    if (progress) { p.onProgress?.(progress); return; }
    pending.delete(id);
    ok ? p.resolve(data) : p.reject(new Error(error));
  };
  worker.onerror = (e) => {
    for (const [, p] of pending) p.reject(new Error(e.message || 'worker failed'));
    pending.clear();
  };
}

function call(type, payload, onProgress) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    worker.postMessage({ id, type, payload });
  });
}

// ------------------------------------------------------------------ boot

let renderer, diagram, cells, docs, presets, workspace;
/*
 * The #doc= link this session was opened with, held so the URL stays that
 * link until the first edit — at which point the state hash below is the
 * honest description again. The state hash carries geometry only, so letting
 * it overwrite a document link threw away the coloring, the coset subgroup
 * and the edge style: open the compound of five tetrahedra from the gallery,
 * reload, and it came back gray.
 *
 * Declared here rather than beside syncHash, where it belongs by subject:
 * boot() assigns it long before the bottom of this file is evaluated, and a
 * declaration down there is in its temporal dead zone until then — which threw
 * inside the open, where the catch turned a perfectly good document link into
 * a silent fall back to the icosahedron.
 */
let docLinkHash = null;
/*
 * A palette read from a document, waiting for the figure to be built: its rows
 * line up with the groups the MESH wears, and until there is a mesh there is
 * nothing to line them up with. Consumed by the first refresh() after the
 * open, then dropped.
 */
let pendingColors = null;
let colorsDialog = null;
let catalogWin = null;
let planesWin = null;
/* set by stopBuild(), read by build()'s catch: a stop is not a failure */
let buildStopped = false;

/* ---------------------------------------------------------------- unsaved work
 *
 * `state.dirty` means: the figure has been changed since it was last saved or
 * opened, so throwing it away would throw away work. It gates the two doors
 * out of a document — opening another one, and starting a new one from a
 * solid — and the page's own unload, which is the third way to lose it.
 *
 * What counts as work is deliberately narrow: the cell selection, the colors,
 * the symmetries, the depth, and a custom plane sheet. Not the camera, and not
 * the view switches like facet opacity or edge width. Those are all saved in
 * the document too, but they are a keystroke to redo, and a confirm box that
 * fires because someone nudged a slider teaches people to click through it —
 * which would cost more than the setting it was protecting.
 */
function touch() { state.dirty = true; }
function markSaved() { state.dirty = false; }

/**
 * Ask before discarding unsaved work. `what` completes the sentence "this will
 * discard …", and the answer is true when it is safe to go on.
 */
function confirmDiscard(what) {
  if (!state.dirty) return true;
  const name = currentDocName();
  return window.confirm(
    `${name} has unsaved changes.\n\n${what} will discard them.\n\nContinue?`);
}

/*
 * How the facets are colored. `class` groups the original faces under the
 * POLYHEDRON's symmetry — a property of the solid you started from, so an
 * icosahedron has one class however you stellate it — and `stellClass` under
 * the STELLATION symmetry, which splits those faces the moment you build
 * under a subgroup that can no longer carry them onto one another.
 */
const COLOR_MODES = ['layer', 'class', 'stellClass'];

async function boot() {
  const [catalog, symmetry, geometry] = await Promise.all([
    fetch('data/catalog.json').then(r => r.json()),
    fetch('data/symmetry.json').then(r => r.json()),
    fetch('data/geometry.json').then(r => r.json()),
  ]);
  Object.assign(state, { catalog, symmetry, geometry });

  try {
    renderer = new Renderer3D($('#view3d'));
    renderer.autoRotate = false;             // still by default; spin is opt-in
    // always push, saved or not, so the renderer and the controls start out
    // agreeing rather than relying on two sets of defaults matching
    applyEdgeStyle(readJSON(localStorage.getItem('edgeStyle')) || currentEdgeStyle());
    const savedColor = localStorage.getItem('colorMode');
    if (COLOR_MODES.includes(savedColor)) {
      renderer.colorMode = savedColor;         // set before the first setMesh
      $('#colorMode').value = savedColor;
    }
    /*
     * The null check is the load-bearing part: Number(null) is 0, so without
     * it a browser with nothing stored — every first visit — read "no saved
     * opacity" as "0%" and booted into an invisible wireframe (issue #15,
     * the blank 3D view on Android; desktops only dodged it by having the
     * key left over from earlier sessions).
     */
    const storedOpacity = localStorage.getItem('faceOpacity');
    const savedOpacity = storedOpacity === null ? NaN : Number(storedOpacity);
    if (Number.isFinite(savedOpacity) && savedOpacity >= 0 && savedOpacity < 100) {
      renderer.faceOpacity = savedOpacity / 100;
      $('#faceOpacity').value = String(savedOpacity);
      $('#faceOpacityLabel').textContent = savedOpacity;
    }
    const savedElemW = Number(localStorage.getItem('elemWidth'));
    if (savedElemW > 0) {
      renderer.elemWidth = savedElemW;       // before the first setElements
      $('#elemWidth').value = String(savedElemW);
      $('#elemWidthLabel').textContent = savedElemW.toFixed(1);
    }
    const savedAxes = readJSON(localStorage.getItem('coordAxes'));
    if (savedAxes) {
      $('#showCoordAxes').checked = !!savedAxes.show;
      if (savedAxes.width > 0) {
        $('#coordAxesWidth').value = String(savedAxes.width);
        $('#coordAxesWidthLabel').textContent = Number(savedAxes.width).toFixed(1);
      }
      // the geometry is sized to the scene, so it is built after the first mesh
      renderer.showCoordAxes = !!savedAxes.show;
      renderer.coordAxesWidth = savedAxes.width > 0 ? savedAxes.width : 1;
    }
    renderer.start();
    renderer.onPick = onPick3D;
    renderer.onPickHover = onHover3D;
  } catch (err) {
    $('#view3d').replaceWith(Object.assign(document.createElement('div'), {
      className: 'nogl', textContent: '3D view needs WebGL2, which this browser did not provide.',
    }));
  }

  diagram = new DiagramView($('#diagram'), {
    onToggle: (facet, mod) => applyToFacet(facet, mod),
    onHover: (facet) => {
      // name both neighbors, since the two gestures reach one each
      $('#hover2d').textContent = facet
        ? `beneath ${facet.refBelow ? facet.refBelow.join('.') : '—'} · ` +
          `above ${facet.refAbove ? facet.refAbove.join('.') : '—'}`
        : '';
    },
  });
  diagram.colorMode = $('#colorMode').value;   // restored from storage above

  cells = new CellsPanel($('#cells'), {
    onBeforeChange: () => mark(),
    onChange: () => refresh(),
    onHover: (hit) => { $('#cellInfo').textContent = cells.describe(hit); },
  });

  labelKeys();          // name the carve modifier for this platform

  wireControls();
  startWorker();
  /*
   * The workspace comes AFTER wireControls: windowed mode reparents the very
   * nodes the wiring grabbed by id, and adoption of live DOM only works if
   * everything was found in its docked place first.
   */
  workspace = initWorkspace({ redraw: () => { renderer?.resize(); diagram?.draw(); cells?.draw(); } });
  /*
   * The preset and file browsers join the same windows menu as the panels, so
   * there is one list of every window rather than two ways to find one. Both
   * also keep their buttons in Save & export; the menu is the path that stays
   * reachable when the settings window itself is closed.
   */
  // the two pickers, listed like every other window so a closed one can come back
  workspace.register({ title: 'New', isOpen: () => !!catalogWin?.isVisible(),
                       setOpen: (v) => (v ? openCatalog() : catalogWin?.setVisible(false)) });
  if (planesWin) {
    workspace.register({ title: 'Plane set', isOpen: planesWin.isOpen, setOpen: planesWin.setOpen });
  }
  workspace.register({ title: 'Presets', isOpen: presets.isOpen, setOpen: presets.setOpen });
  /*
   * Both of these windows are built the first time they are asked for, which
   * is what kept them from coming back: internalWindow restores a window's
   * visibility when it is CREATED, and a window nobody creates is a window
   * nobody restores. So a session that left one open opens it again here.
   *
   * The Files browser gets its own restore rather than show(), because show()
   * would raise the OS folder picker when there is no root to work from, and a
   * page load is not a request for that.
   */
  if (windowWasOpen('stell.win.presets')) presets.show();
  if (windowWasOpen('stell.fileDialog')) docs.restoreBrowser();
  if (docs.canFolders) {
    workspace.register({ title: 'Files', isOpen: docs.isBrowserOpen, setOpen: docs.setBrowserOpen });
  }
  applyTheme(localStorage.getItem('theme') || 'auto');   // now that the views exist

  // handy from the console, and what the browser tests drive
  /*
   * Leaving the page — a reload, the back button, or one of the links in the
   * header — is the third way to lose a figure. A browser will not show a
   * message of ours here and has not for years; returning any value at all is
   * the whole of the API, and the wording is the browser's own.
   */
  addEventListener('beforeunload', (e) => {
    if (!state.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

  window.stellation = { state, cells, diagram, renderer, call, select, refresh, applyToCell, openDocument,
                        currentPresetText, makeThumbnail, docsOrigin: () => docs?.current() };

  /*
   * file / polyGroup / stellGroup / dDEPTH / vQX,QY,QZ,QW,ZOOM / {cells}
   *
   * The `v` segment is the camera, added so that a reload keeps the angle you
   * were looking from and so that a link shows the recipient the same picture,
   * which was the point of adding it. Every segment stays optional, so links
   * written before it existed still open.
   */
  const hash = decodeURIComponent(location.hash.slice(1));
  /*
   * `#doc=<path>` opens a document served beside the app — how the examples
   * gallery links to a particular stellation. The segments below can carry a
   * catalog solid and a selection, but not a custom plane set, and half the
   * examples ARE plane sets; naming the document instead says all of it.
   *
   * Same-origin relative paths only: a link is a thing strangers send, and
   * this one must not be able to fetch an arbitrary host.
   */
  const docLink = hash.match(/^doc=([\w./-]+\.(?:json|stel|txt))$/);
  /*
   * `file=<path>` is the same idea for a document of your own: it names a file
   * below the folder you granted, so a reload comes back to what you were
   * working on. It is not a link anyone else can follow, and it works only
   * while the browser still holds the folder permission — see reopenPath.
   */
  const fileLink = hash.match(/^file=([^?#]+\.json)$/);
  // the cells segment allows the c{…} member-indexed form — an unaligned
  // selection, which parseCellsAny recognizes by the prefix
  const m = hash.match(
    /^([\w]+)(?:\/([\w()]+))?(?:\/([\w()]+))?(?:\/d(\d+))?(?:\/v([-\d.,eE]+))?(?:\/(c?\{.*\}))?$/);
  if (fileLink && !fileLink[1].includes('..')) {
    const path = fileLink[1];
    if (await docs?.reopenPath(path, { hash })) {
      // opened, and openDocument has already put the link back in the URL
    } else {
      // the message goes AFTER the fallback build, whose own status would
      // otherwise write over the only explanation of what just happened
      await select(findItem('u27'));
      setStatus(`${path.split('/').pop()} — reopen it from Files… (the folder permission has lapsed)`, false);
    }
  } else if (docLink && !docLink[1].includes('..')) {
    try {
      const r = await fetch(docLink[1]);
      if (!r.ok) throw new Error(r.statusText);
      /*
       * The link is kept by openDocument itself, through keepLink: the load's
       * own refreshes write the state hash over it on the way, and that hash
       * describes the geometry alone — so leaving it would silently discard
       * everything the document says about how to DRAW the figure. Open the
       * compound of five tetrahedra from the gallery, reload, and it came
       * back gray.
       */
      await openDocument(await r.text(), docLink[1].split('/').pop(), { hash });
    } catch (err) {
      await select(findItem('u27'));
      setStatus(`could not open ${docLink[1]}: ${err.message}`, false);
    }
  } else if (m && geometry[m[1]]) {
    await select(findItem(m[1]) || { file: m[1], name: m[1], symmetry: m[2] || 'Ih' },
                 { polySym: m[2], stellSym: m[3], cells: m[6],
                   depth: m[4] ? Number(m[4]) : undefined,
                   view: m[5] ? m[5].split(',').map(Number) : null });
  } else {
    await select(findItem('u27'));
  }

  /*
   * The camera is not part of the app's state, it lives in the renderer and
   * changes sixty times a second while you drag. Rather than write the URL from
   * inside the draw loop, notice after the fact that it settled somewhere new.
   * replaceState, so turning the solid does not fill the back button.
   */
  const catchUp = () => {
    if (!renderer || !state.current) return;
    const v = renderer.getView().join(',');
    if (v === lastView) return;
    lastView = v;
    // the orientation menu is a readout too: it names a standard view only
    // while the solid is actually in one
    syncOrient();
    syncHash();
  };
  setInterval(catchUp, 900);
  // and immediately on the way out, so the last position is never the one lost
  addEventListener('pagehide', catchUp);
  addEventListener('visibilitychange', catchUp);
}

let lastView = '';

/** did the last session leave this window open? internalWindow stores it */
function windowWasOpen(storageId) {
  try { return localStorage.getItem(storageId + '_visible') === 'true'; }
  catch { return false; }
}

/**
 * Adopt the link that reopens the document just opened, and put it in the URL
 * now. The state hash written by syncHash() describes the geometry alone —
 * solid, groups, depth, camera, cells — so it cannot say which coloring or
 * which coset subgroup a document asked for; the document's own link can.
 * mark() drops it again at the first edit, when it stops being that document.
 */
function keepLink(hash) {
  if (!hash) return;
  docLinkHash = hash;
  syncHash();
}

function syncHash() {
  if (!state.current) return;
  // still the document that was linked: keep its link, which carries the
  // display settings the state hash has no room for. mark() drops it.
  if (docLinkHash) {
    try { history.replaceState(null, '', '#' + docLinkHash); } catch { }
    return;
  }
  const v = renderer ? `/v${renderer.getView().join(',')}` : '';
  const h = `${state.current.file}/${state.polySym}/${state.stellSym}` +
            `/d${state.depth}${v}/${state.cellsString || ''}`;
  try { history.replaceState(null, '', '#' + h); }
  catch { location.hash = h; }     // file:// URLs reject replaceState
}

function findItem(file) {
  for (const cat of state.catalog)
    for (const it of cat.items) if (it.file === file) return { ...it, category: cat.category };
  return null;
}

// ------------------------------------------------------------------ undo

/*
 * Undo and redo over the cell selection.
 *
 * Carving with ctrl takes the clicked cell's whole supporting set, which from
 * a high cell reaches all the way to the core, so one keystroke can undo a
 * quarter of an hour's building — and nothing on screen warns you first. There
 * is no way to work back to what was there from what is left, so the result is
 * not what we keep: every operation banks the selection it started from.
 *
 * Snapshots, not deltas. A selection is a set of short strings and even the
 * densest arrangement has a few thousand of them, so a hundred snapshots cost
 * less than a single rebuild — and a snapshot cannot drift out of step with the
 * thing it describes the way a replayed delta can.
 */
const undoStack = { past: [], future: [], limit: 100 };

function mark() {
  /*
   * The first edit is where a linked document stops being that document, so
   * it is where its URL gives way to the state hash. Hung on mark() because
   * mark() IS "the user is about to change the figure" — comparing cell
   * strings instead meant racing refresh(), which fills them in later.
   */
  docLinkHash = null;
  state.dirty = true;              // an edit is exactly what there is to lose
  undoStack.past.push(new Set(state.selected));
  if (undoStack.past.length > undoStack.limit) undoStack.past.shift();
  undoStack.future.length = 0;
  syncUndo();
}

/** a new arrangement is a new document: nothing before it can be restored */
function clearHistory() {
  undoStack.past.length = 0;
  undoStack.future.length = 0;
  syncUndo();
}

/*
 * Undo and redo appear in all three views, so the buttons are found by class
 * rather than by id — one pair per view, every pair driven from the one stack.
 * Anything else means a button that is grayed out in one corner of the screen
 * and live in another.
 */
function syncUndo() {
  for (const b of $$('.undo-btn')) b.disabled = !undoStack.past.length;
  for (const b of $$('.redo-btn')) b.disabled = !undoStack.future.length;
}

function undo() {
  if (!undoStack.past.length) return;
  undoStack.future.push(new Set(state.selected));
  state.selected = undoStack.past.pop();
  syncUndo();
  refresh();
}

function redo() {
  if (!undoStack.future.length) return;
  undoStack.past.push(new Set(state.selected));
  state.selected = undoStack.future.pop();
  syncUndo();
  refresh();
}

// ------------------------------------------------------------------ picking

/*
 * What a click means, per view — settled in the night session of 6 August.
 *
 * The previous round made one pair of gestures mean one thing everywhere,
 * which turned out to be MY consistency, not the design's. The design is:
 * the group operation — a cell together with everything supporting it — lives
 * in the Cells table and nowhere else («multiple cell operation only in cell
 * view»). The two graphical views work one cell at a time, because there you
 * are pointing at a *place*:
 *
 *   3-D solid   shift adds the one cell sitting on the clicked face,
 *               ctrl removes the one cell behind it. Add and remove, not
 *               toggles — the cell you add is not visible until you add it,
 *               and the one you remove stops being clickable once gone.
 *               Green and red.
 *   diagram     every region lies between two cells: shift toggles the one
 *               beneath the plane, ctrl the one resting on it. Toggles, so
 *               their own colors — gold and blue, not green and red.
 *   Cells       a bare click toggles a box; one modifier toggles it together
 *               with its whole supporting set.
 */

/*
 * The atomic selection model.
 *
 * state.selected holds ATOM keys — "layer.orbit.member", one per primitive
 * cell — which name the same piece of space under every stellation symmetry.
 * The symmetry's whole role is editorial: a click toggles the clicked atom's
 * entire orbit under the CURRENT group. These maps, rebuilt from every
 * outline, are how a click's atom finds its orbit.
 */
function indexOutline(outline) {
  state.subOf = new Map();     // atom key -> owning sub-cell key
  state.atomsOf = new Map();   // sub-cell key -> its atom keys
  for (const layer of outline) {
    for (const cell of layer.cells) {
      for (const sub of cell.subCells) {
        const subKey = `${layer.layer}.${cell.index}.${sub.index}`;
        const atoms = (sub.atoms || []).map(m => `${layer.layer}.${cell.index}.${m}`);
        state.atomsOf.set(subKey, atoms);
        for (const a of atoms) state.subOf.set(a, subKey);
      }
    }
  }
}

/** the atom keys of the editing orbit containing `key` — the click's reach */
function orbitAtoms(key) {
  const subKey = state.subOf?.get(key);
  return (subKey && state.atomsOf.get(subKey)) || [key];
}

/**
 * Toggle the editing orbit of one atom — the console/API entry point and what
 * every diagram click funnels into. Partially selected orbits fill first,
 * full ones clear: the same convention as the panel's boxes.
 */
function applyToCell(key) {
  if (!key) return;
  const atoms = orbitAtoms(key);
  mark();
  const allOn = atoms.every(k => state.selected.has(k));
  for (const k of atoms) allOn ? state.selected.delete(k) : state.selected.add(k);
  refresh();
}

/** add or remove a set of keys, returning exactly what changed, so it can be undone */
function applyChange(keys, add) {
  const sel = state.selected, changed = new Set();
  for (const k of keys) {
    if (add ? !sel.has(k) : sel.has(k)) { add ? sel.add(k) : sel.delete(k); changed.add(k); }
  }
  return changed;
}

/** a diagram click: toggle the cell beneath this region, or the one on top */
function applyToFacet(facet, mod) {
  if (!facet) return;
  const ref = mod.shift ? facet.refBelow : mod.ctrl ? facet.refAbove : null;
  if (!ref) {
    setStatus(mod.ctrl ? 'nothing rests on this region — raise the build depth'
                       : 'no cell beneath this region', false);
    return;
  }
  applyToCell(ref.join('.'));
}

function onPick3D(hit, mod) {
  const mesh = state.mesh;
  if (!mesh) return;
  const inside = mesh.faceInside[hit.face];
  const outside = mesh.faceOutside[hit.face];

  // The solid adds or removes the ORBIT of what you pointed at — under the
  // current editing symmetry, which is that group's entire job. Under E the
  // orbit is the one cell; the supporting-set walk stays the Cells table's.
  if (mod.shift) {
    if (!outside) { setStatus('nothing further out on that face — raise the build depth', false); return; }
    mark();
    applyChange(orbitAtoms(outside), true);
  } else if (mod.ctrl) {
    if (!inside) { setStatus('no cell inside that face', false); return; }
    mark();
    applyChange(orbitAtoms(inside), false);
  } else {
    return;
  }
  refresh();
}

/*
 * What a click here would do, said in color before it is spent.
 *
 * Green adds, red removes — the natural reading of the two colors. Where the
 * gesture has nothing to work on there is NO outline: the outermost facets of
 * the arrangement have nothing further out to add, and outlining them in green
 * invited a click that could only report failure. The outline was dimmed there
 * once, on the reasoning that you still want to see which face you are
 * pointing at — but a faint green outline is still a green outline, and it
 * still says "add here". Its absence is the honest answer, and the status line
 * beside it says why.
 */
function onHover3D(hit, mod) {
  const mesh = state.mesh;
  if (!hit || !mesh) {
    $('#hover3d').textContent = '';
    renderer?.setHighlight(-1);
    return;
  }
  const action = mod?.shift ? 'add' : (mod?.ctrl ? 'remove' : null);
  const key = mod?.shift ? mesh.faceOutside[hit.face] : mesh.faceInside[hit.face];
  // an action with nothing to act on gets no outline; a bare hover still
  // outlines neutrally, because pointing at a face is not a promise
  renderer?.setHighlight(action && !key ? -1 : hit.face, action);
  // name the box the panel shows, not the raw atom — that is what the click's
  // orbit expansion will actually toggle
  const shown = key && (state.subOf?.get(key) || key);
  $('#hover3d').textContent = !action ? ''
    : key ? `${mod.shift ? 'add' : 'remove'} cell ${shown}`
    : (mod.shift ? 'nothing further out on this face' : 'nothing behind this face');
}

// ------------------------------------------------------------------ catalog

/*
 * The catalog is a specimen sheet: nothing but thumbnails, densely packed, with
 * the name of whatever you are pointing at spelled out along the bottom. Names
 * under every tile would triple the height and turn 121 solids into a scroll.
 *
 * It is built the first time the picker opens rather than at start-up — 121
 * thumbnails is about half a megabyte, which has no business delaying the first
 * render of the solid. Built that late, the images can load eagerly, so the
 * sheet never shows the half-filled grid lazy loading gives you inside a dialog.
 */
let catalogBuilt = false;
function ensureCatalog() {
  if (!catalogBuilt) { buildCatalog(); catalogBuilt = true; }
  $$('.poly').forEach(b => b.classList.toggle('active', b.dataset.file === state.current?.file));
}

function buildCatalog() {
  const host = $('#catalog');
  const chips = $('#catChips');
  host.innerHTML = '';
  chips.innerHTML = '';

  for (const cat of state.catalog) {
    const slug = cat.category.replace(/\W+/g, '-');

    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = cat.category;
    chip.onclick = () => host.querySelector(`#sec-${slug}`)
      .scrollIntoView({ behavior: 'smooth', block: 'start' });
    chips.appendChild(chip);

    const section = document.createElement('section');
    section.className = 'cat';
    section.id = `sec-${slug}`;
    section.innerHTML = `<h3><span>${cat.category}</span><em>${cat.items.length}</em></h3>`;

    const grid = document.createElement('div');
    grid.className = 'grid';
    for (const item of cat.items) {
      const b = document.createElement('button');
      b.className = 'poly';
      b.dataset.file = item.file;
      b.dataset.name = item.name;
      b.dataset.sym = item.symmetry;
      b.dataset.cat = cat.category;
      b.setAttribute('aria-label', item.name);
      b.innerHTML = `<img src="img/poly/${item.file}_tmb.gif" alt="" width="46" height="46">`;
      b.onmouseenter = () => showFoot(item, cat.category);
      b.onfocus = () => showFoot(item, cat.category);
      b.onclick = () => {
        if (!confirmDiscard(`Starting a new document from ${item.name}`)) return;
        catalogWin.setVisible(false);
        state.depthAuto = true;          // a new solid gets its own suggested depth
        /*
         * Starting from a solid starts a NEW document, so it inherits
         * neither the last one's name nor its file: Save As will offer a
         * generated name rather than the name of whatever was open before,
         * and Save will not write over that file. Opening a document takes
         * the other road — openDocument sets the name first, then calls
         * select() itself.
         */
        docs?.clearOrigin(null);
        markSaved();                     // a new document has nothing in it yet
        select({ ...item, category: cat.category });
      };
      grid.appendChild(b);
    }
    section.appendChild(grid);
    host.appendChild(section);
  }

  host.onmouseleave = () => showFoot(state.current, state.current?.category);
  updateCatCount();
}

function showFoot(item, category) {
  if (!item) return;
  $('#footThumb').src = `img/poly/${item.file}_tmb.gif`;
  $('#footName').textContent = item.name;
  $('#footMeta').textContent = `${item.file} · ${item.symmetry} · ${category || ''}`;
}

function updateCatCount() {
  const vis = $$('.poly').filter(b => b.style.display !== 'none').length;
  $('#footCount').textContent = vis === 121 ? '121 solids' : `${vis} of 121`;
}

// ------------------------------------------------------------------ selection

async function select(item, opts = {}) {
  if (!item) return;
  state.customPlanes = null;         // picking a solid leaves custom-plane mode
  // a document brings its own answer; a plain pick starts plain
  state.centralPlanes = !!opts.centralPlanes;
  state.current = item;
  state.polySym = opts.polySym || item.symmetry || 'Ih';
  state.stellSym = opts.stellSym || defaultStellSym(state.polySym);

  $$('.poly').forEach(b => b.classList.toggle('active', b.dataset.file === item.file));

  if (opts.depth != null) {
    setDepth(opts.depth, false);           // an opened document or a link fixes it
  } else if (state.depthAuto) {
    setDepth(suggestDepth(facePlanes(toPoly(state.geometry[item.file]))), true);
  }

  syncSymmetrySelects();
  /*
   * A saved view carries the model scale it was framed at, and the scale is
   * baked into the vertex buffer when the mesh is uploaded — so it has to be
   * in place before the build, not after it with setView. Without this the
   * angle comes back but the size does not.
   */
  state.pendingScale = Renderer3D.viewModelScale(opts.view);
  // the result travels back to openDocument, which must not dress a figure
  // that a stopped or failed build never produced
  const ok = await build(opts.cells, opts.cellsIndexing || null);
  // after the build, so the mesh (and therefore the model scale) already exists
  if (opts.view && renderer?.setView(opts.view)) lastView = renderer.getView().join(',');
  syncOrient();
  return ok;
}

/**
 * Point the orientation menu at whatever the solid is actually facing.
 *
 * A document stores its camera as a quaternion, so a document saved while
 * looking down a named axis comes back looking down it — and the menu should
 * say so rather than sit blank until you touch it. This asks the renderer
 * which standard view the current rotation is, and -1, meaning none of them,
 * selects the hidden blank option, which is what a freely dragged angle
 * should read as.
 */
function syncOrient() {
  const sel = $('#viewOrient');
  if (sel && renderer) sel.value = String(renderer.matchStandardView());
}

const NO_LIMIT = 60;   // slider top = build every layer there is

function toPoly(g) {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

function setDepth(depth, auto) {
  state.depth = depth < 0 ? NO_LIMIT : depth;
  state.depthAuto = !!auto;
  $('#depth').value = state.depth;
  $('#depthLabel').textContent = state.depth >= NO_LIMIT ? 'every' : state.depth;
}

/** the rotation-only subgroup is the usual choice for building stellations */
function defaultStellSym(poly) {
  const map = { Ih: 'I', Oh: 'O', Td: 'T', Th: 'T', I: 'I', O: 'O', T: 'T' };
  return map[poly] || poly;
}

/*
 * Which symmetry groups may be offered.
 *
 * Not every group makes sense for every solid: asking for I (order 60) as the
 * stellation symmetry of a T-symmetric arrangement is not a lower symmetry at
 * all, and the result is meaningless. The Java applet lists, for a given solid,
 * only the subgroups of its own point group, and this reproduces that — but by
 * testing actual matrix containment rather than by carrying a hand-written
 * subgroup lattice, so it stays correct for the oriented variants (the "(O)"
 * groups are cubic-frame copies and belong to the octahedral families only).
 *
 * Cached: 85 groups against 5 parents is a few hundred thousand comparisons,
 * worth doing once rather than on every rebuild.
 */
const subgroupCache = new Map();

function matrixKey(m) {
  // quantised so that 0.9999999 and 1.0 are the same rotation
  let k = '';
  for (const v of m) k += (Math.round(v * 1e4) / 1e4 + 0) + ',';
  return k;
}

function subgroupsOf(parent) {
  if (subgroupCache.has(parent)) return subgroupCache.get(parent);
  const P = state.symmetry[parent];
  const names = Object.keys(state.symmetry).filter(n => state.symmetry[n].order > 0);
  let out;
  if (!P?.matrices?.length) {
    out = names;
  } else {
    const inParent = new Set(P.matrices.map(matrixKey));
    out = names.filter(n => {
      const G = state.symmetry[n];
      if (G.order > P.order) return false;
      return (G.matrices || []).every(m => inParent.has(matrixKey(m)));
    });
  }
  out.sort((a, b) => state.symmetry[b].order - state.symmetry[a].order || a.localeCompare(b));
  subgroupCache.set(parent, out);
  return out;
}

function fillSelect(id, names, value) {
  $(id).innerHTML = names.map(n =>
    `<option value="${n}"${n === value ? ' selected' : ''}>${n} (${state.symmetry[n].order})</option>`
  ).join('');
}

function syncSymmetrySelects() {
  // the solid's own point group bounds the polyhedron symmetry; that in turn
  // bounds the stellation symmetry, which must be a subgroup of it. A custom
  // plane set has no "own" group, so there the first choice is unrestricted.
  const own = state.customPlanes ? null : (state.current?.symmetry || 'Ih');
  const polyNames = own
    ? subgroupsOf(own)
    : Object.keys(state.symmetry).filter(n => state.symmetry[n].order > 0)
        .sort((a, b) => state.symmetry[b].order - state.symmetry[a].order || a.localeCompare(b));
  if (!polyNames.includes(state.polySym)) state.polySym = polyNames[0] || 'E';
  fillSelect('#polySym', polyNames, state.polySym);

  const stellNames = subgroupsOf(state.polySym);
  if (!stellNames.includes(state.stellSym)) state.stellSym = state.polySym;
  fillSelect('#stellSym', stellNames, state.stellSym);

  fillCosetSub();
}

/*
 * The coset coloring's own subgroup, offered beside the color menu. Its
 * candidates are the subgroups of the POLYHEDRON symmetry: the coloring is a
 * property of the whole arrangement, and deliberately not of the stellation
 * symmetry, which is the editing symmetry — switching how you edit must not
 * repaint what you made. The choice survives everything but a change of
 * polyhedron group it no longer fits.
 */
function fillCosetSub() {
  const sel = $('#cosetSub');
  const names = subgroupsOf(state.polySym);
  // a document being opened parks its subgroup here until the menu exists
  const want = sel.dataset.want && names.includes(sel.dataset.want)
    ? sel.dataset.want : null;
  if (sel.dataset.want && names.includes(sel.dataset.want)) delete sel.dataset.want;
  const kept = want || sel.value;
  fillSelect('#cosetSub', names, names.includes(kept) ? kept : state.polySym);
}

/**
 * Tell the worker which subgroup colors the cosets. The worker defaults to
 * the whole polyhedron group on every build, so this only needs sending when
 * the menu says otherwise — and after it, the next refresh() carries the new
 * coloring.
 */
async function applyCosetSub() {
  const name = $('#cosetSub').value;
  if (!name || name === state.polySym) return;
  const g = state.symmetry[name];
  // the selection goes too: it decides between enantiomorphic labellings
  if (g) await call('cosets', { subMatrices: g.matrices, selected: [...state.selected] });
}


/*
 * Draggable splitters.
 *
 * The three panes are fixed fractions of the window, which is fine until a
 * deep arrangement makes the Cells table wider than its column — with C3
 * symmetry a row can run to twenty sub-cells. Rather than guess a width that
 * suits every solid, let the panes be resized, and remember where they were put.
 */
function installSplitters() {
  const root = document.documentElement;
  for (const [id, apply] of [
    ['#splitPanel', (e) => {
      const w = Math.min(720, Math.max(240, window.innerWidth - e.clientX));
      root.style.setProperty('--panel-w', w + 'px');
      localStorage.setItem('panelW', w);
    }],
    ['#splitViews', (e) => {
      const box = $('.views').getBoundingClientRect();
      const frac = Math.min(0.85, Math.max(0.15, (e.clientX - box.left) / box.width));
      root.style.setProperty('--views-a', frac + 'fr');
      root.style.setProperty('--views-b', (1 - frac) + 'fr');
      localStorage.setItem('viewsFrac', frac);
    }],
  ]) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('dragging');
      // capture throws for a pointer the browser is not tracking; it is an
      // optimisation for dragging past the splitter, never a precondition
      try { el.setPointerCapture?.(e.pointerId); } catch { /* nothing to capture */ }
      const move = (ev) => { apply(ev); renderer?.resize(); diagram?.draw(); cells?.draw(); };
      const up = () => {
        el.classList.remove('dragging');
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }
  const w = Number(localStorage.getItem('panelW'));
  if (w >= 240) root.style.setProperty('--panel-w', w + 'px');
  const f = Number(localStorage.getItem('viewsFrac'));
  if (f > 0.1 && f < 0.9) {
    root.style.setProperty('--views-a', f + 'fr');
    root.style.setProperty('--views-b', (1 - f) + 'fr');
  }
}

/**
 * The axis of a proper rotation, from its matrix. Null for the identity.
 *
 * The axis is the eigenvector for eigenvalue 1, and the skew part gives it
 * directly as (R32-R23, R13-R31, R21-R12) = 2·sin(θ)·n. A half-turn defeats
 * that, because sin(180°) = 0; there R + I is 2·n·nᵀ, rank one with every column
 * parallel to the axis, so the longest column serves. Recovering the sign from
 * square roots of the diagonal instead loses an axis of Oh, because a zero
 * component leaves its sign undetermined and two distinct axes then collapse
 * onto each other.
 */
function rotationAxis(a, b, c, d, e, f, g, h, i) {
  if (a + e + i > 2.999) return null;              // the identity
  let v = [h - f, c - g, d - b];
  if (Math.hypot(...v) < 1e-6) {
    const cols = [[a + 1, d, g], [b, e + 1, h], [c, f, i + 1]];
    v = cols.reduce((best, col) =>
      Math.hypot(...col) > Math.hypot(...best) ? col : best, cols[0]);
  }
  const L = Math.hypot(...v);
  return L < 1e-6 ? null : v.map(x => x / L);
}

/*
 * Every symmetry element of a group, sorted into the three kinds that can be
 * drawn, and further into INEQUIVALENT CLASSES, each with its own color, so
 * that axes of different order and of different orbits can be told apart.
 *
 *   axes      proper rotations (det +1), classified by order and by orbit
 *   mirrors   reflections (det -1, trace +1), classified by orbit
 *   improper  rotoreflections S_n (det -1, other), by order and orbit
 *
 * Two elements are equivalent when some operation of the group carries one onto
 * the other — the same containment idea the subgroup test uses, applied to the
 * elements themselves. In O_h that puts the three 4-fold axes, the four 3-fold
 * and the six 2-fold in three classes; in D2, whose three half-turn axes no
 * operation exchanges, each axis is its own class and gets its own color.
 *
 * If M is improper then -M is a proper rotation, so one axis extractor serves
 * all three kinds; for a mirror, -M is the half-turn about the plane's normal.
 * The inversion center is a point, not a line or plane, and is left out: there
 * is nothing to draw, and it is present in almost every group anyway.
 */
const CLASS_PALETTE = ['#4da3f5', '#f2b23c', '#a06ef2', '#f2646c', '#3cc98f',
                       '#f28c3c', '#45d9c0', '#e058c8', '#8fd24d', '#f5d24d',
                       '#5f7df2', '#d9a45a'];

function symmetryElements(name) {
  const G = state.symmetry[name];
  const out = { axes: [], mirrors: [], improper: [], classes: [] };
  if (!G?.matrices?.length) return out;

  const three = (m) => m.length === 9
    ? m
    : [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
  const mats = G.matrices.map(three);

  // the zero threshold matches near()'s tolerance — a looser sign rule than the
  // comparison would let ±1e-8 wobble flip signs inconsistently and split an axis
  const canon = (v) => (v[0] < -1e-6 || (Math.abs(v[0]) <= 1e-6 && (v[1] < -1e-6 ||
      (Math.abs(v[1]) <= 1e-6 && v[2] < 0)))) ? v.map(x => -x) : v;
  const near = (u, v) => Math.abs(u[0] - v[0]) + Math.abs(u[1] - v[1]) + Math.abs(u[2] - v[2]) < 1e-4;
  const apply = (m, v) => canon([
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]);

  // collect unique element lines, remembering the largest order seen on each
  const collect = (list, v, order) => {
    if (!v) return;
    v = canon(v);
    const hit = list.find(x => near(x.dir, v));
    if (hit) hit.order = Math.max(hit.order, order);
    else list.push({ dir: v, order });
  };

  for (const m of mats) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    const trace = a + e + i;
    if (det > 0) {
      if (trace > 2.999) continue;                     // identity
      const th = Math.acos(Math.min(1, Math.max(-1, (trace - 1) / 2)));
      collect(out.axes, rotationAxis(a, b, c, d, e, f, g, h, i), Math.round(2 * Math.PI / th));
    } else {
      if (trace < -2.999) continue;                    // inversion center
      const n = rotationAxis(-a, -b, -c, -d, -e, -f, -g, -h, -i);
      if (Math.abs(trace - 1) < 1e-6) collect(out.mirrors, n, 2);
      else {
        const th = Math.acos(Math.min(1, Math.max(-1, (trace + 1) / 2)));
        collect(out.improper, n, Math.round(2 * Math.PI / th));
      }
    }
  }

  // orbit partition: same class iff some group element maps one line to another
  const classify = (list) => {
    const cls = [];
    for (const el of list) {
      const found = cls.find(cl => cl.some(other => mats.some(m => near(apply(m, el.dir), other.dir))));
      if (found) found.push(el);
      else cls.push([el]);
    }
    return cls;
  };

  let ci = 0;
  for (const [kind, label] of [['axes', n => `C${sub(n)}`], ['mirrors', () => 'm'],
                               ['improper', n => `S${sub(n)}`]]) {
    const groups = classify(out[kind]).sort((x, y) => y[0].order - x[0].order || y.length - x.length);
    for (const members of groups) {
      const css = CLASS_PALETTE[ci % CLASS_PALETTE.length];
      const rgb = hexRgb(css);
      for (const el of members) { el.css = css; el.rgb = rgb; }
      out.classes.push({ kind, label: label(members[0].order), count: members.length, css });
      ci++;
    }
  }
  return out;
}

const sub = n => String(n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
const hexRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);

/** the current group's elements, filtered to the checked kinds */
function shownElements() {
  const el = state.elements || symmetryElements(state.stellSym);
  return {
    axes: $('#showAxes')?.checked ? el.axes : [],
    mirrors: $('#showMirrors')?.checked ? el.mirrors : [],
    improper: $('#showImproper')?.checked ? el.improper : [],
  };
}

function refreshElements() {
  state.elements = symmetryElements(state.stellSym);
  const el = state.elements;

  // a checkbox for something the group does not have is a trap; disable it
  for (const [id, list] of [['#showAxes', el.axes], ['#showMirrors', el.mirrors],
                            ['#showImproper', el.improper]]) {
    const box = $(id);
    if (!box) continue;
    box.disabled = !list.length;
    box.closest('label')?.classList.toggle('off', !list.length);
  }

  // the color legend: one chip per inequivalent class
  const legend = $('#elemLegend');
  if (legend) {
    const shownKinds = new Set([$('#showAxes')?.checked && 'axes',
                                $('#showMirrors')?.checked && 'mirrors',
                                $('#showImproper')?.checked && 'improper'].filter(Boolean));
    const rows = el.classes.filter(c => shownKinds.has(c.kind));
    legend.innerHTML = rows.length
      ? rows.map(c => `<span class="legend-item"><i style="background:${c.css}"></i>${c.label} ×${c.count}</span>`).join('')
      : '';
  }

  if (renderer) {
    const any = ['#showAxes', '#showMirrors', '#showImproper'].some(id => $(id)?.checked);
    renderer.setElements(any ? shownElements() : null);
  }
  refreshDiagramOverlay();
}

/*
 * The same elements, marked on the 2-D diagram: the point where each axis
 * pierces the drawing plane, the line where each mirror plane crosses it —
 * what the Java applet's diagram checkboxes drew. Same colors as the solid,
 * so the dot and the cylinder read as one object.
 */
function refreshDiagramOverlay() {
  if (!diagram) return;
  const frame = state.diagramFrame;
  if (!frame || !$('#showDiagElems')?.checked) { diagram.setOverlay(null); return; }

  const R = frame.R, c = frame.center;
  const n = [R[6], R[7], R[8]];                       // the drawing plane's normal
  const nc = n[0] * c[0] + n[1] * c[1] + n[2] * c[2];
  const dotv = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const proj = (p) => {
    const q = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    return [R[0] * q[0] + R[1] * q[1] + R[2] * q[2],
            R[3] * q[0] + R[4] * q[1] + R[5] * q[2]];
  };

  const el = shownElements();
  const out = [];
  for (const a of [...(el.axes || []), ...(el.improper || [])]) {
    const nd = dotv(n, a.dir);
    if (Math.abs(nd) < 1e-9) continue;                // parallel: never crosses
    const t = nc / nd;
    out.push({ kind: 'point', p: proj([a.dir[0] * t, a.dir[1] * t, a.dir[2] * t]), color: a.css });
  }
  for (const m of (el.mirrors || [])) {
    const u = [m.dir[1] * n[2] - m.dir[2] * n[1],
               m.dir[2] * n[0] - m.dir[0] * n[2],
               m.dir[0] * n[1] - m.dir[1] * n[0]];
    if (Math.hypot(...u) < 1e-9) continue;            // the drawing plane itself
    const mm = dotv(m.dir, m.dir), mn = dotv(m.dir, n), nn = dotv(n, n);
    const det = mm * nn - mn * mn;
    if (Math.abs(det) < 1e-12) continue;
    const al = -nc * mn / det, be = mm * nc / det;
    const p0 = [al * m.dir[0] + be * n[0], al * m.dir[1] + be * n[1], al * m.dir[2] + be * n[2]];
    out.push({ kind: 'line', p: proj(p0),
               q: proj([p0[0] + u[0], p0[1] + u[1], p0[2] + u[2]]), color: m.css });
  }
  diagram.setOverlay(out);
}

// ------------------------------------------------------------------ build

async function build(cellsString, cellsIndexing = null, preserve = false) {
  if (state.building) return;
  state.building = true;
  buildStopped = false;
  $('#stopBuild').hidden = false;
  setStatus('building the plane arrangement…', true);

  const g = state.customPlanes ? null : state.geometry[state.current.file];
  /*
   * `preserve` is the stellation-symmetry switch — and ONLY that switch. The
   * arrangement it rebuilds is geometrically the one on screen (the group
   * only regroups sub-cells), so the selection's atom keys stay valid, the
   * undo history stays honest, and the camera must not jump. Every other
   * road here — new solid, new depth, new polyhedron symmetry — is a truly
   * different arrangement, where keeping any of those would corrupt them.
   */
  if (!preserve) {
    renderer?.resetScale();    // a new arrangement re-frames; edits within one do not
    // a document being reopened frames itself; see select()
    if (renderer && state.pendingScale) { renderer.modelScale = state.pendingScale; }
    state.pendingScale = 0;
    clearHistory();            // a different arrangement: nothing earlier applies
  }
  const polyM = state.symmetry[state.polySym]?.matrices || state.symmetry.E.matrices;
  const subM = state.symmetry[state.stellSym]?.matrices || null;

  try {
    const info = await call('build', {
      geometry: g, customPlanes: state.customPlanes || null,
      centralPlanes: state.centralPlanes || false,
      matrices: polyM, subMatrices: subM,
      maxIntersection: state.depth >= NO_LIMIT ? -1 : state.depth, maxLayer: 1000,
    }, ({ done, total }) => setStatus(`intersecting plane ${done} of ${total}…`, true, done / total));

    state.outline = info.outline;
    indexOutline(info.outline);
    state.diagramFrame = null;       // the old arrangement's frame is meaningless now
    cells.setOutline(info.outline);
    cells.setLabels(duValLabels());
    // fix the camera for this whole arrangement — see Renderer3D._camera
    renderer?.setFrameRadius(info.frameRadius || 0);
    fillFaceSelect(info.faces);
    refreshElements();
    renderLegend();

    if (preserve) {
      /* the selection IS the point: atom keys survive a grouping change */
    } else if (cellsString) {
      const { selected } = await call('parseCells', { cells: cellsString, indexing: cellsIndexing });
      state.selected = new Set(selected);
    } else {
      const { keys } = await call('layerKeys', { n: 1 });
      state.selected = new Set(keys);
    }

    await applyCosetSub();      // the coloring's subgroup, when it differs
    await refresh();
    state.builtStellSym = state.stellSym;   // what the grouping on screen actually is
    const slow = info.ms > 5000 && !state.depthAuto;
    setStatus(`${planeReport(info)} · ${info.facets.toLocaleString()} facets · ` +
              `${info.layers} layers · ${(info.ms / 1000).toFixed(info.ms > 5000 ? 1 : 3)} s` +
              (slow ? ' — lower the depth for a quicker rebuild' : ''), false);
    const dropped = (info.planesCentral || 0) + (info.planesDegenerate || 0);
    $('#status').title = dropped
      ? `${dropped} of this solid's ${info.planesTotal} faces have no usable plane here` +
        (info.planesCentral ? ` — ${info.planesCentral} pass exactly through the center, ` +
          'which this representation cannot hold (see notes/design/plane-representation.md)' : '')
      : '';
  } catch (err) {
    if (buildStopped) {
      /*
       * The arrangement went with the worker, so nothing on screen can be
       * trusted: the outline, the selection and the mesh all describe a
       * figure this app no longer has. Clear them and say so.
       */
      state.outline = null;
      state.selected = new Set();
      state.mesh = null;
      cells.setOutline([]);          // an empty table, not a missing one
      renderer?.setMesh({ vertices: [], faces: [] }, []);
      diagram.setData(null);
      setStatus('build stopped — choose a solid again, lowering the depth first if it was slow', false);
    } else {
      setStatus('failed: ' + err.message, false);
      startWorker();
    }
    return false;
  } finally {
    state.building = false;
    buildStopped = false;
    $('#stopBuild').hidden = true;
  }
  return true;
}

/*
 * The stellation-symmetry switch. The selection is untouched — that is the
 * feature — along with the undo history and the camera; only the grouping
 * changes. The worker regroups the sub-cells in place (no arrangement
 * rebuild, the Java applet's createSubcells), and everything grouping-shaped
 * in the UI follows: the outline and its maps, the panel, the diagram-plane
 * menu, the symmetry elements, the legend. If the worker cannot regroup —
 * restarted after a failure, nothing built — the preserve-mode rebuild is
 * the slow road to the same place. A switch during a build cannot be
 * honored at all (the worker is busy making some other arrangement), so
 * the control snaps back to what is actually built rather than lying.
 */
async function changeStellSym() {
  if (state.building) {
    state.stellSym = state.builtStellSym || state.stellSym;
    $('#stellSym').value = state.stellSym;
    setStatus('still building — change the symmetry when it finishes', false);
    return;
  }
  const subM = state.symmetry[state.stellSym]?.matrices || null;
  const polyM = state.symmetry[state.polySym]?.matrices || state.symmetry.E.matrices;
  state.building = true;
  setStatus('regrouping cells…', true);
  try {
    const info = await call('regroup', { subMatrices: subM, matrices: polyM });
    state.outline = info.outline;
    indexOutline(info.outline);
    // keep the table where the user left it — the rows are the same rows
    const scroll = [cells.scroll, cells.scrollX];
    cells.setOutline(info.outline);
    [cells.scroll, cells.scrollX] = scroll;
    cells._clampScroll();
    cells.setLabels(duValLabels());
    fillFaceSelect(info.faces);
    refreshElements();
    renderLegend();
    state.building = false;
    // the coset coloring is a property of the polyhedron group, and a
    // stellation-symmetry change is editing — nothing to recolor here
    await refresh();
    state.builtStellSym = state.stellSym;
    setStatus(`editing symmetry ${state.stellSym} — selection kept`, false);
  } catch {
    state.building = false;
    await build(null, null, true);     // the slow road to the same place
  }
}

async function refresh() {
  if (!state.outline) return;
  const selected = [...state.selected];
  const { mesh, diagram: dia } = await call('both', { selected, planeIndex: state.planeIndex,
    split: $('#colorMode')?.value === 'cosetM' });

  state.mesh = mesh;
  renderer?.setMesh(mesh, mesh.faceLayers,
    { classes: mesh.faceClasses, classesStell: mesh.faceClassesStell,
      cosets: mesh.faceCosets, cosetsL: mesh.faceCosetsL, cosetsM: mesh.faceCosetsM,
      orbitP: mesh.faceOrbitP, orbitF: mesh.faceOrbitF, orbitC: mesh.faceOrbitC,
      top: mesh.faceTop, planes: mesh.facePlanes });
  /*
   * A document's own palette, now that there is a figure to apply it to. It
   * goes on BEFORE the first paint of this mesh — setMesh above uploaded the
   * default colors, so the refresh below is what puts the document's on
   * screen, and doing it here rather than at open time is what lets the rows
   * line up with the groups actually built.
   */
  if (pendingColors) {
    applyColorsArray(mesh, $('#colorMode').value, pendingColors);
    pendingColors = null;
    renderer?.refreshColors();
    const mark = $('#colorsEdited');
    if (mark) mark.hidden = !hasColorOverrides($('#colorMode').value);
  }
  diagram.setData(dia);
  state.diagramFrame = dia?.frame || null;
  refreshDiagramOverlay();
  cells.setSelected(state.selected);
  colorsDialog?.refresh();

  const { cells: str, aligned } = await call('formatCells', { selected });
  state.cellsString = str;
  // aligned = the selection is whole orbits of the current editing symmetry,
  // so it serializes in the legacy notation old builds still read
  state.cellsAligned = aligned !== false;
  $('#cellsString').value = str;
  syncHash();
  /*
   * The header's corner moves with the solid and with either group, and a
   * document with no file of its own is named after exactly those. None of it
   * passes through the document manager — picking a solid clears the origin
   * BEFORE the new state is in place — so it is settled here, where the state
   * is finally true, as well as there.
   */
  syncDocBar();
}

/*
 * "N planes", or "N of M planes" when some of the solid's faces did not make it.
 *
 * Silently building an arrangement out of fewer planes than the solid has is the
 * worst failure this program can have, because the answer looks perfectly
 * healthy: you get a stellation, it is just a stellation of a *different* solid.
 * The hemipolyhedra lose their central planes here and there was nothing on
 * screen to say so. Now the count says it, and the tooltip says why.
 */
function planeReport(info) {
  const total = info.planesTotal ?? info.planes;
  const dropped = (info.planesCentral || 0) + (info.planesDegenerate || 0);
  const kept = info.planesCentralKept || 0;
  if (dropped) return `⚠ ${info.planes} of ${total} planes`;
  // cuts change what the same sheet builds, so the count says they are in
  if (kept) return `${info.planes} planes (${kept} central)`;
  return `${info.planes} planes`;
}

/*
 * The diagram can be drawn on any face plane, but planes the symmetry carries
 * onto one another give the same picture — so offer one of each kind rather
 * than a number to type with no upper bound. The cuboctahedron under O_h, for
 * instance, has exactly two. Each entry is named after the polygon at the
 * center of that diagram, which is the solid's own face there.
 */
const POLYGON = { 3: 'triangle', 4: 'square', 5: 'pentagon', 6: 'hexagon',
                  7: 'heptagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };

function fillFaceSelect(faces) {
  state.faces = Array.isArray(faces) ? faces : [];
  const sel = $('#planeIndex');
  if (!sel) return;
  if (!state.faces.length) {
    sel.innerHTML = '<option value="0">the only face</option>';
    state.planeIndex = 0;
    return;
  }
  if (!state.faces.some(f => f.index === state.planeIndex)) state.planeIndex = state.faces[0].index;
  sel.innerHTML = state.faces.map(f => {
    const shape = f.central ? 'central cut'
                : POLYGON[f.sides] || (f.sides ? `${f.sides}-gon` : 'face');
    return `<option value="${f.index}"${f.index === state.planeIndex ? ' selected' : ''}>` +
           `${shape} · ${f.count} plane${f.count === 1 ? '' : 's'}</option>`;
  }).join('');
}

/*
 * Du Val's letters for the icosahedron — «use Du Val's notation when possible».
 *
 * The identification is the derivation in notes/research/r1: the 20-cell orbit
 * of layer 4 is e₁ and the 60-cell orbit e₂, f₂ is the 12 trapezohedra on the
 * vertex axes and f₁ the 120 chiral tetrahedra, g₁ the 30 bipyramids on the
 * edge axes and g₂ the 60. Our orbits sort by ascending primitive count, which
 * fixes which index is which; the Ef₁ preset on the walkthrough page was
 * verified against the literature with exactly this correspondence.
 *
 * Only the icosahedron has an accepted lettering, so everything else keeps its
 * indices. That is inconsistent, but a lettering that exists for the one solid
 * everybody studies is worth more than uniformity, and it is easier to remove
 * later than to add. Valid whenever the orbits are grouped under the full I_h,
 * which is what the letters name; the sub-cell split below them can be
 * anything.
 */
const DU_VAL_U27 = {
  '0.0': 'a', '1.0': 'b', '2.0': 'c', '3.0': 'd',
  '4.0': 'e₁', '4.1': 'e₂', '5.0': 'f₂', '5.1': 'f₁',
  '6.0': 'g₁', '6.1': 'g₂', '7.0': 'h',
};

function duValLabels() {
  return (!state.customPlanes && state.current?.file === 'u27' && state.polySym === 'Ih')
    ? DU_VAL_U27 : null;
}

/** the key to the bar colors: one swatch per distinct number of congruent pieces */
function renderLegend() {
  const host = $('#cellsLegend');
  if (!host) return;
  const entries = cells.legend();
  host.innerHTML = '<span class="legend-label">pieces per cell</span>' + entries.map(e =>
    `<span class="legend-item"><i style="background:${e.color}"></i>${e.count}</span>`).join('');
}

// ------------------------------------------------------------------ controls

/*
 * The catalog: where a new document starts. It used to be the header's own
 * picker button, which showed the current solid and opened this; the header
 * carries the document now, and the way in is New... in the Files panel.
 */
function openCatalog() {
  ensureCatalog();
  /*
   * Cleared on the way IN rather than on the way out. Clearing it on close
   * would have to run while the window is being built — setVisible(false) is
   * part of construction — and at that moment the search machinery below is
   * still in its temporal dead zone. Opening unfiltered is the same promise
   * from the other end.
   */
  $('#search').value = '';
  // through the input event, because the search machinery is wireControls's
  // own and this function is not inside it
  $('#search').dispatchEvent(new Event('input'));
  catalogWin.setVisible(true);
  showFoot(state.current, state.current?.category);
  $('#search').focus();
  document.querySelector('.poly.active')?.scrollIntoView({ block: 'center' });
}

function wireControls() {
  /*
   * The New picker and the plane editor are built FIRST, because their
   * contents live in <template> elements and everything below reaches into
   * them by id — the search box, the grid, the preview canvas. Nothing that
   * is still in a template is in the document, so the windows have to be
   * cloned out before a single handler is hung on anything inside them.
   *
   * They are internal windows rather than <dialog> elements: the browser's
   * top layer cannot be moved aside to look at the figure behind it, and a
   * dismissed <dialog> leaves no entry anywhere to bring it back.
   */
  catalogWin = createInternalWindow({
    title: 'New', width: 'min(860px, 94vw)', height: 'min(600px, 88vh)',
    left: 'calc(50% - min(430px, 47vw))', top: '6%',
    canClose: true, canResize: true, modal: true, role: 'dialog',
    storageId: 'stell.catalog',
  });
  catalogWin.wnd.classList.add('transient');
  catalogWin.interior.appendChild($('#catalogBody').content.cloneNode(true));
  catalogWin.setVisible(false);

  $('#catalogClose').onclick = () => catalogWin.setVisible(false);

  /*
   * The New dialog is the one front door. Its own content is the catalog;
   * the other three sources already have their homes — the preset browser,
   * the file input, the plane editor — so it closes and hands over rather
   * than growing copies of them.
   */
  $('#newFromPreset').onclick = () => { catalogWin.setVisible(false); presets.show(); };
  $('#newFromFile').onclick = () => { catalogWin.setVisible(false); $('#loadDoc').click(); };
  $('#newFromPlanes').onclick = () => { catalogWin.setVisible(false); $('#editPlanes').click(); };

  $('#polySym').onchange = (e) => {
    touch();                       // a different grouping is a different document
    state.polySym = e.target.value;
    const allowed = subgroupsOf(state.polySym);
    if (!allowed.includes(state.stellSym)) state.stellSym = state.polySym;
    syncSymmetrySelects();
    build();
  };
  /*
   * Changing the stellation symmetry no longer touches the selection — it is
   * an EDITING symmetry: it decides how big a bite the next click takes, not
   * what is already built. Build symmetric under the full group, drop to a
   * subgroup (E takes single cells) for the asymmetric touches, come back.
   */
  $('#stellSym').onchange = (e) => { touch(); state.stellSym = e.target.value; changeStellSym(); };
  $('#depth').oninput = (e) => setDepth(Number(e.target.value), false);
  $('#depth').onchange = () => { touch(); build(); };
  $('#planeIndex').onchange = (e) => { state.planeIndex = Number(e.target.value) || 0; refresh(); };

  $('#selectCore').onclick = async () => {
    const { keys } = await call('layerKeys', { n: 1 });
    mark(); state.selected = new Set(keys); refresh();
  };
  $('#selectNone').onclick = () => { mark(); state.selected = new Set(); refresh(); };
  $('#selectAll').onclick = async () => {
    const { keys } = await call('layerKeys', { n: state.outline.length });
    mark(); state.selected = new Set(keys); refresh();
  };
  $('#growLayer').onclick = async () => {
    let n = 0;
    state.outline.forEach((layer, l) => {
      if (layer.cells.some(c => c.subCells.some(
        s => (s.atoms || []).some(m => state.selected.has(`${l}.${c.index}.${m}`))))) n = l + 1;
    });
    const { keys } = await call('layerKeys', { n: Math.min(n + 1, state.outline.length) });
    mark(); state.selected = new Set(keys); refresh();
  };
  for (const b of $$('.undo-btn')) b.onclick = undo;
  for (const b of $$('.redo-btn')) b.onclick = redo;

  /*
   * ctrl+Z everywhere, cmd+Z as well on macOS — both, rather than one per
   * platform, because a Mac keyboard has ctrl too and nobody is surprised when
   * it works. Ignored while typing in the cell string or the search box.
   */
  addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
  });

  for (const id of ['#showFaceEdges', '#faceEdgeColor', '#faceEdgeWidth', '#faceEdgeTubes',
                    '#showFacetEdges', '#facetEdgeColor', '#facetEdgeWidth', '#facetEdgeTubes']) {
    // `input` rather than `change` so dragging a slider or scrubbing the color
    // picker updates the solid as you go, which is the only way to tune a
    // weight or a shade against what you are actually looking at
    $(id).oninput = pushEdgeStyle;
  }
  let lastColorMode = $('#colorMode').value;
  $('#colorMode').onchange = async (e) => {
    const wasSplit = lastColorMode === 'cosetM';
    lastColorMode = e.target.value;
    localStorage.setItem('colorMode', e.target.value);
    renderer?.setColorMode(e.target.value);
    diagram?.setColorMode(e.target.value);
    $('#cosetSubRow').hidden =
      !(e.target.value.startsWith('coset') || e.target.value.startsWith('orbit'));
    // each mode keeps its own overrides, so the mark and the panel both
    // answer for the mode now in force
    const mark = $('#colorsEdited');
    if (mark) mark.hidden = !hasColorOverrides(e.target.value);
    colorsDialog?.refresh();
    // the mirror-split mesh has different topology, so entering or leaving
    // the split mode is the one color switch that refetches
    if (wasSplit !== (e.target.value === 'cosetM')) await refresh();
  };
  $('#cosetSubRow').hidden = !($('#colorMode').value.startsWith('coset')
    || $('#colorMode').value.startsWith('orbit'));
  $('#cosetSub').onchange = async () => {
    if (state.building) return;
    const name = $('#cosetSub').value;
    const g = state.symmetry[name];
    if (!g) return;
    // send unconditionally: unlike applyCosetSub, this IS the change
    await call('cosets', { subMatrices: g.matrices, selected: [...state.selected] });
    await refresh();
  };
  /*
   * `input`, not `change`: opacity is judged against what you are looking at,
   * so the solid has to fade under the thumb. It is only a redraw — no rebuild
   * — so dragging the slider is as cheap as turning the model.
   */
  $('#faceOpacity').oninput = (e) => {
    const pct = Number(e.target.value);
    $('#faceOpacityLabel').textContent = pct;
    localStorage.setItem('faceOpacity', String(pct));
    renderer?.setFaceOpacity(pct / 100);
  };
  const pushCoordAxes = () => {
    const w = Number($('#coordAxesWidth').value);
    $('#coordAxesWidthLabel').textContent = w.toFixed(1);
    localStorage.setItem('coordAxes', JSON.stringify({ show: $('#showCoordAxes').checked, width: w }));
    renderer?.setCoordAxes($('#showCoordAxes').checked, w);
  };
  $('#showCoordAxes').onchange = pushCoordAxes;
  $('#coordAxesWidth').oninput = pushCoordAxes;

  // like the edge widths: tuned against what you are looking at, so live
  $('#elemWidth').oninput = (e) => {
    const w = Number(e.target.value);
    $('#elemWidthLabel').textContent = w.toFixed(1);
    localStorage.setItem('elemWidth', String(w));
    renderer?.setElemWidth(w);
  };
  /*
   * The per-view gesture panels. Each ? toggles its own, and clicking the panel
   * dismisses it — the whole panel is the target, being easier to hit than a
   * close button and the first thing anyone tries.
   *
   * Opening one closes the other: they overlay their own view, and two of them
   * up at once is two-thirds of the workspace covered in instructions.
   */
  const helps = [['#help3d', '#help3dPanel'], ['#help2d', '#help2dPanel'],
                 ['#helpCells', '#helpCellsPanel']];
  const closeHelps = (except) => {
    for (const [b, p] of helps) {
      if (b === except) continue;
      $(p).hidden = true;
      $(b).setAttribute('aria-expanded', 'false');
    }
  };
  for (const [btn, panel] of helps) {
    const p = $(panel);
    $(btn).setAttribute('aria-expanded', 'false');
    $(btn).onclick = () => {
      const show = p.hidden;
      closeHelps(btn);
      p.hidden = !show;
      $(btn).setAttribute('aria-expanded', String(show));
    };
    p.onclick = () => { p.hidden = true; $(btn).setAttribute('aria-expanded', 'false'); };
  }

  // the diagram's fit, replacing the double-click that used to reset the view
  // and kept firing on two quick cell toggles
  $('#fitDiagram').onclick = () => { diagram?.resetView(); setStatus('diagram centered', false); };
  $('#fitView').onclick = () => { renderer?.fit(); setStatus('rescaled to fit', false); };
  /*
   * The orientation control is both a readout and a chooser. The menu picks
   * the direction the solid is seen from; the home button returns to
   * whichever was picked, however far the model has been dragged since.
   * Turning it by hand blanks the menu — the catchUp interval keeps that
   * honest — and home fills it in again.
   *
   * The options come from the renderer, which owns the views: one list, and
   * their order and descriptions cannot drift apart from the geometry.
   */
  const orientSel = $('#viewOrient');
  Renderer3D.STANDARD_VIEWS.forEach((v, i) => {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = v.name;
    o.title = v.title;
    orientSel.appendChild(o);
  });
  const showOrient = (view) => {
    if (!view) return;
    orientSel.value = String(view.index);
    setStatus(`seen from ${view.name}`, false);
  };
  syncOrient();          // the pose the app opens in has a name; show it
  $('#homeView').onclick = () => showOrient(renderer?.home());
  orientSel.onchange = (e) => {
    const i = Number(e.target.value);
    if (i >= 0) showOrient(renderer?.goToView(i));
  };

  for (const id of ['#showAxes', '#showMirrors', '#showImproper', '#showDiagElems']) {
    const el = $(id);
    if (el) el.onchange = refreshElements;
  }


  installSplitters();

  $('#showAllFacets').onchange = (e) => { diagram.showAll = e.target.checked; diagram.draw(); };

  $('#cellsString').onchange = async (e) => {
    try {
      const { selected } = await call('parseCells', { cells: e.target.value });
      mark();                        // a typed string replaces the whole selection
      state.selected = new Set(selected);
      refresh();
    } catch (err) { setStatus('could not read that cell string: ' + err.message, false); }
  };

  /*
   * Save routes through the document manager: over the origin file when the
   * document came from a local folder, through Save As when it did not, and
   * as a plain download on browsers without the File System Access API. The
   * two folder buttons stay hidden unless the API exists, so no dead UI.
   */
  docs = initDocManager({
    currentPresetText, makeThumbnail, openDocument, newDocumentName, download, setStatus,
    onNameChange: syncDocBar,
    onSaved: markSaved,
  });
  $('#saveJson').onclick = () => docs.save();
  $('#saveAsBtn').onclick = () => docs.saveAs();
  // the same dialog, opened on a generated name rather than this document's
  $('#saveNewBtn').onclick = () => docs.saveAs({ fresh: true });
  // New… is the solid picker, which is where every new document starts
  $('#newBtn').onclick = () => openCatalog();
  /*
   * One button for "open a document", whatever the browser can do. Given the
   * File System Access API it is the folder browser, with previews and a
   * remembered folder; without it, it falls back to the plain file picker,
   * which is the only way in there. Before this the folder button was simply
   * hidden on those browsers and opening lived under a different label.
   */
  $('#browseBtn').onclick = () => {
    if (docs.canFolders) docs.browse(); else $('#loadDoc').click();
  };
  if (docs.canFolders) {
    $('#saveAsBtn').hidden = false;
    $('#saveNewBtn').hidden = false;
  }
  syncDocBar();
  /*
   * .stel is the original program's format and cannot say "member indices".
   * An unaligned selection exports under the trivial group instead: written
   * as E sub-cells it IS whole orbits, and a legacy reader running with
   * stellation symmetry E reproduces it exactly.
   */
  /*
   * .stel is the original program's format and cannot say "member indices", so
   * a selection that does not line up with whole sub-cells of its own group has
   * to be re-expressed under E — every cell named individually — before it can
   * be written at all. That is a worker round trip, which is why this is async
   * and why it can answer "no".
   */
  const writeStelText = async () => {
    let cellsText = state.cellsString, stellSym = state.stellSym;
    if (state.cellsAligned === false) {
      const { cells: eText } = await call('formatUnder', {
        selected: [...state.selected], subMatrices: state.symmetry.E.matrices,
      });
      if (!eText) { setStatus('could not express this selection for .stel', false); return null; }
      cellsText = eText; stellSym = 'E';
    }
    return writeStel({
      polyhedron: state.current.name, polySymmetry: state.polySym,
      stellSymmetry: stellSym, cells: cellsText,
    });
  };
  /*
   * The diagrams go through a dialog now. A solid has one diagram per kind
   * of face and the old button saved whichever was on screen, in one style,
   * with nothing in the file to say what it was a picture of.
   */
  const exportDialog = initExportDialog({
    state, call, diagram, download, setStatus,
    currentName: currentDocName,
  });
  $('#exportSvg').onclick = () => exportDialog?.open();
  /*
   * And the solid goes through one of its own. Six formats were already too
   * many buttons and the three that were missing would have made nine — and
   * every one of them wrote straight to the downloads folder under a name
   * nobody chose.
   */
  /*
   * The turntable lives beside the view controls it belongs with. Wired here
   * because it needs the live renderer — it turns the same quaternion the
   * mouse does.
   */
  initAnimation({ renderer, currentName: currentDocName, setStatus });

  const solidDialog = initExportSolid({
    state, renderer, download, setStatus, writeStelText,
    currentName: currentDocName,
  });
  $('#exportSolidBtn').onclick = () => solidDialog?.open();

  $('#stopBuild').onclick = stopBuild;

  colorsDialog = initColors({ state, renderer, diagram, onChange: mark });
  $('#editColorsBtn').onclick = () => colorsDialog?.open();

  $('#loadDoc').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await openDocument(await file.text(), file.name);
    e.target.value = '';
  };

  presets = initPresets({ openDocument, setStatus });
  // Presets… has no button of its own in the Files row any more; it is opened
  // from the windows menu, which is where every panel is reachable from
  $('#showPresets')?.addEventListener('click', () => presets.show());

  /*
   * The plane-set editor wires its own controls: rows, per-row factor and
   * symmetry, orbit counts, the preview, and the three imports. After the
   * preset browser, because it borrows that browser to import from a preset.
   * It opens seeded from the current sheet in custom mode, or from the
   * current solid reduced to one row per symmetry class; Build funnels into
   * the same buildCustomPlanes every other path uses.
   */
  planesWin = initPlanesDialog({ state, toPoly, buildCustomPlanes, presets, setStatus });

  $('#help').onclick = () => {
    const b = $('#buildStamp');
    if (b) b.textContent = BUILD;
    $('#helpDialog').showModal();
  };
  $('#helpClose').onclick = () => $('#helpDialog').close();

  $('#themeBtn').onclick = cycleTheme;

  const runSearch = () => {
    const q = $('#search').value.trim().toLowerCase();
    $$('.poly').forEach(b => {
      const hay = `${b.dataset.name} ${b.dataset.file} ${b.dataset.sym} ${b.dataset.cat}`.toLowerCase();
      b.style.display = (!q || hay.includes(q)) ? '' : 'none';
    });
    $$('.cat').forEach(sec => {
      const any = [...sec.querySelectorAll('.poly')].some(b => b.style.display !== 'none');
      sec.style.display = any ? '' : 'none';
    });
    updateCatCount();
    const first = $$('.poly').find(b => b.style.display !== 'none');
    if (q && first) {
      showFoot({ name: first.dataset.name, file: first.dataset.file, symmetry: first.dataset.sym },
               first.dataset.cat);
    } else if (q && !first) {
      $('#footThumb').removeAttribute('src');
      $('#footName').textContent = 'nothing matches';
      $('#footMeta').textContent = `no solid named, filed or symmetric as “${$('#search').value.trim()}”`;
    }
  };
  $('#search').oninput = runSearch;
  $('#search').onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const first = $$('.poly').find(b => b.style.display !== 'none');
    first?.click();
  };

}

// ------------------------------------------------------------------ edit planes

/*
 * The "edit planes" dialog — the original Java program's plane-set editor,
 * ported. A plane set can be given directly instead of being taken from a
 * catalog solid: the engine has been plane-based from the start and could
 * always read such files; this is the front door the port did not have.
 *
 * A row is { normal: [x,y,z], distance, symmetry?, factor? } — structured,
 * validated by preset.js on the way in and out, and stored that way in the
 * document. The editor's text field is a view of one row's four numbers,
 * nothing more; no line format survives anywhere but the legacy reader.
 */

async function buildCustomPlanes(planeRows) {
  // a hand-built plane sheet IS the document; openDocument marks itself saved
  // again straight after, so this only catches sheets applied from the editor
  touch();
  const info = $('#planesInfo');
  let rows;
  try {
    rows = normalizePlaneRows(planeRows || []);
  } catch (err) {
    info.textContent = err.message;
    return false;
  }
  if (!rows.length) { info.textContent = 'no planes yet'; return false; }
  const unknown = rows.find(r => r.symmetry && !(state.symmetry[r.symmetry]?.order > 0));
  if (unknown) { info.textContent = `no symmetry group named "${unknown.symmetry}"`; return false; }
  const expanded = expandPlaneRows(rows, state.symmetry);
  info.textContent = '';
  const prev = { planeRows: state.planeRows, customPlanes: state.customPlanes,
                 current: state.current, centralPlanes: state.centralPlanes };
  state.planeRows = rows;
  state.customPlanes = expanded;
  state.current = { file: 'custom', name: `custom planes (${rows.length} rows → ${expanded.length})`, symmetry: null };
  syncSymmetrySelects();
  const ok = await build();
  if (!ok) {
    // a failed build must not leave the app claiming to BE the failed sheet —
    // keep the dialog open with the reason, and put the state back
    info.textContent = $('#status').textContent;
    Object.assign(state, prev);
    syncSymmetrySelects();
  }
  return ok;
}

// ------------------------------------------------------------------ theme

function cycleTheme() {
  const order = ['auto', 'light', 'dark'];
  const cur = document.documentElement.dataset.themePref || 'auto';
  const next = order[(order.indexOf(cur) + 1) % order.length];
  localStorage.setItem('theme', next);
  applyTheme(next);
}

function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = pref;
  $('#themeBtn').textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '●' : '○';
  $('#themeBtn').title = `Theme: ${pref}`;
  if (renderer) {
    renderer.background = dark ? [0.055, 0.06, 0.078] : [0.965, 0.97, 0.977];
    renderer.draw();
  }
  cells?.draw();
  diagram?.draw();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((document.documentElement.dataset.themePref || 'auto') === 'auto') applyTheme('auto');
});

// ------------------------------------------------------------------ misc

const name = () => `${state.current?.file || 'custom'}-${state.polySym}-${state.stellSym}`;

/*
 * What this document is called: the file or preset it came from if it has one,
 * and otherwise what it is made of. The same answer the export dialog names
 * its files after and the header shows, because they are the same question.
 */
const currentDocName = () => docs?.current()?.name || name();

/*
 * The header's corner: the document's name, and under it the three things that
 * decide what it can be — the solid, the symmetry its planes were laid out
 * with, and the symmetry its cells are chosen under. The last two are separate
 * facts and a figure means nothing without both: the same twenty planes under
 * Ih and under T are different documents.
 */
function syncDocBar() {
  const nameEl = $('#docName'), metaEl = $('#docMeta');
  if (!nameEl) return;
  nameEl.textContent = currentDocName();
  const solid = state.current?.name || (state.customPlanes ? 'custom planes' : '');
  metaEl.textContent = [solid, state.polySym, state.stellSym].filter(Boolean).join(' · ');
}

/*
 * Everything on screen, serialized — the one producer of document text.
 * Lifted out of the Save button so that every path that writes a document
 * (the download button, the local-folder save, the preset generator) emits
 * exactly the same envelope; two gathering sites would drift apart the first
 * time a display setting is added to one of them.
 */
function currentPresetText(docName) {
  return writePreset({
    name: docName,
    polyhedron: state.current.name, file: state.current.file,
    polySymmetry: state.polySym, stellSymmetry: state.stellSym,
    planeDepth: state.depth, cells: state.cellsString,
    // a selection that is not whole orbits of the stellation symmetry writes
    // member-indexed brackets, marked so readers know which they are holding
    cellsIndexing: state.cellsAligned === false ? 'cells' : null,
    diagramFace: state.planeIndex,
    edges: currentEdgeStyle(),
    // the master flag, for readers that predate the face/facet split
    showEdges: $('#showFaceEdges').checked || $('#showFacetEdges').checked,
    showAllFacets: $('#showAllFacets').checked,
    colorMode: $('#colorMode').value,
    // the figure's own palette, if it has one — see writePreset
    colors: hasColorOverrides($('#colorMode').value)
      ? colorsArray(state.mesh, $('#colorMode').value) : null,
    cosetSub: $('#cosetSub').value || null,
    faceOpacity: Number($('#faceOpacity').value) / 100,
    view: renderer?.getView() || null,
    planeRows: state.customPlanes ? state.planeRows : null,
    centralPlanes: state.centralPlanes || false,
  });
}

/*
 * The document thumbnail: the 3D view, rendered square.
 *
 * Rendered at a fixed size rather than cropped out of the live canvas, so the
 * picture is the same whatever shape the window was — see squareImage().
 * Two thumbnails are meant to be comparable with each other, and a framing
 * that depends on the reader's window makes them not.
 *
 * The coordinate frame and the symmetry elements come off first. A thumbnail
 * is a promise about what opening the document gives you, and those two are
 * not in the document: currentDisplay() saves the edge style, the coloring
 * and the opacity, but the frame and the elements are view preferences that
 * live in localStorage and belong to whoever is looking, not to the figure.
 * A card drawn with them shows a picture the document cannot reproduce.
 *
 * When WebGL was refused there is no renderer to ask, and the diagram canvas
 * stands in — cropped, since it is a 2-D drawing at whatever size the layout
 * gave it, so a document saved on that machine still gets a preview.
 */
function makeThumbnail(size = 256) {
  if (renderer) {
    const elements = renderer.elements;
    const axes = renderer.showCoordAxes;
    if (elements) renderer.setElements(null);
    if (axes) renderer.setCoordAxes(false);
    const out = renderer.squareImage(size);
    if (elements) renderer.setElements(elements);
    if (axes) renderer.setCoordAxes(true);
    return out;
  }
  return getSquareThumbnailCanvas($('#diagram'), size);
}

// ------------------------------------------------------------ edge styling

const readJSON = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

/** "#rrggbb" -> [r,g,b,1] in 0..1, as the renderer wants it */
const hexToRgba = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1];
};

/**
 * The edge controls as a plain object — what gets saved, in the form it is
 * saved in. Hex strings rather than the renderer's float triples, because that
 * is what an <input type="color"> speaks and what survives a JSON round trip
 * legibly.
 */
function currentEdgeStyle() {
  return {
    face: {
      show: $('#showFaceEdges').checked,
      color: $('#faceEdgeColor').value,
      width: Number($('#faceEdgeWidth').value),
      // this kind drawn as thin lit cylinders instead of flat lines
      tubes: $('#faceEdgeTubes').checked,
    },
    facet: {
      show: $('#showFacetEdges').checked,
      color: $('#facetEdgeColor').value,
      width: Number($('#facetEdgeWidth').value),
      tubes: $('#facetEdgeTubes').checked,
    },
  };
}

/** put a saved style on the controls, then hand it to the renderer */
function applyEdgeStyle(style) {
  if (!style) return;
  for (const [kind, ids] of [['face', ['#showFaceEdges', '#faceEdgeColor', '#faceEdgeWidth', '#faceEdgeTubes']],
                             ['facet', ['#showFacetEdges', '#facetEdgeColor', '#facetEdgeWidth', '#facetEdgeTubes']]]) {
    const s = style[kind];
    if (!s) continue;
    if (typeof s.show === 'boolean') $(ids[0]).checked = s.show;
    if (hexToRgba(s.color)) $(ids[1]).value = s.color;
    if (s.width > 0) $(ids[2]).value = s.width;
    // per kind since the two are often best drawn differently; a document
    // from the brief spell when this was one flag sets both below
    if (typeof s.tubes === 'boolean') $(ids[3]).checked = s.tubes;
  }
  if (typeof style.tubes === 'boolean') {
    $('#faceEdgeTubes').checked = style.tubes;
    $('#facetEdgeTubes').checked = style.tubes;
  }
  pushEdgeStyle();
}

/** controls -> renderer, and remember it for next time */
function pushEdgeStyle() {
  const style = currentEdgeStyle();
  $('#faceEdgeWidthLabel').textContent = style.face.width.toFixed(1);
  $('#facetEdgeWidthLabel').textContent = style.facet.width.toFixed(1);
  localStorage.setItem('edgeStyle', JSON.stringify(style));
  if (!renderer) return;
  renderer.faceEdges = { show: style.face.show, color: hexToRgba(style.face.color),
                         width: style.face.width, tubes: !!style.face.tubes };
  renderer.facetEdges = { show: style.facet.show, color: hexToRgba(style.facet.color),
                          width: style.facet.width, tubes: !!style.facet.tubes };
  renderer.draw();
}

/**
 * Put the document's display settings back on the controls.
 *
 * Driving the inputs and firing `change` rather than setting the underlying
 * objects directly means the document restores through exactly the same path a
 * click takes, so there is only one place where each setting is applied — and
 * the control on screen cannot disagree with what is drawn.
 *
 * Only our own JSON carries these; a .stel file has no display section, and
 * forcing defaults on one would throw away whatever the user has set up.
 */
function applyDisplaySettings(doc) {
  if (doc.source !== 'json') return () => {};
  /*
   * STAGED here, COMMITTED by the function this returns.
   *
   * A document's look used to be applied the moment the file was read, which
   * meant it landed on the figure still on screen: open a 120-plane document
   * and the OLD solid would restyle itself instantly, then sit there wearing
   * the new document's colors until the arrangement finished — seconds later
   * on a deep one — before finally becoming the right figure. The picture was
   * never wrong for long, but it was wrong, and it looked like the app had
   * misread the file.
   *
   * So the two halves are separated. Staged below is only what the BUILD has
   * to see: values the worker's answers depend on, pushed the way boot pushes
   * them — straight onto the objects, drawing nothing. Everything that changes
   * what is on screen waits for the returned commit, which the caller runs once
   * the new figure is there to receive it.
   */
  const mode = doc.colorMode || 'layer';
  $('#showAllFacets').checked = !!doc.showAllFacets;
  $('#colorMode').value = mode;
  // set before the first setMesh, exactly as boot does with a stored mode
  if (renderer) renderer.colorMode = mode;
  if (diagram) diagram.colorMode = mode;
  $('#cosetSubRow').hidden = !(mode.startsWith('coset') || mode.startsWith('orbit'));
  /*
   * The coset subgroup cannot be set yet — its menu is refilled for the
   * document's polyhedron group later in the open — so the wish is parked on
   * the element and fillCosetSub() honors it when the options exist.
   */
  if (doc.cosetSub) $('#cosetSub').dataset.want = doc.cosetSub;
  /*
   * The palette is parked for the same reason the coset subgroup is: its rows
   * are the groups the built figure wears, and nothing is built yet. A
   * document that carries no colors CLEARS whatever the last one set, or its
   * figure would open wearing the previous document's palette.
   */
  setColorOverrides(null);
  pendingColors = doc.colors && doc.colors.length ? doc.colors.slice() : null;
  const opacity = Math.round((doc.faceOpacity ?? 1) * 100);
  $('#faceOpacity').value = String(opacity);
  // a pre-split document has only `showEdges`, which drew both kinds alike
  const edges = doc.edges || {
    face: { ...currentEdgeStyle().face, show: !!doc.showEdges },
    facet: { ...currentEdgeStyle().facet, show: !!doc.showEdges },
  };

  return () => {
    $('#faceOpacity').dispatchEvent(new Event('input'));
    diagram.showAll = $('#showAllFacets').checked;
    applyEdgeStyle(edges);
    try { localStorage.setItem('colorMode', mode); } catch { }
    colorsDialog?.refresh();
    diagram.draw();
  };
}

/** open either our JSON preset or an original .stel file */
/**
 * Open a document. TRUE only if the figure on screen is now that document.
 *
 * The return value is load-bearing, not decoration. The file browser follows
 * an open by pointing the save target at the file it just opened, and it used
 * to do that whatever happened in here: decline the "discard your changes?"
 * prompt and the open stopped, but the browser still re-aimed Save at the
 * file that was merely CLICKED. The next Save then wrote the document you had
 * kept over the document you had not opened — losing the file you clicked by
 * accident. Anything that changes where Save goes must ask first whether the
 * open actually happened.
 *
 * `opts.hash` is the URL fragment that would open this document again — the
 * whole point of which is that a reload lands you back where you were. A
 * preset and a gallery link carry `doc=<path>`, which anyone can follow; a
 * document from your own folder carries `file=<path below the root>`, which
 * only this browser on this machine can follow, and which is honest about
 * that by failing gracefully rather than fetching something wrong.
 */
async function openDocument(text, filename = '', opts = {}) {
  let doc;
  try {
    doc = readDocument(text);
  } catch (err) {
    setStatus(`could not read ${filename || 'that file'}: ${err.message}`, false);
    return false;
  }

  /*
   * Asked here rather than at each button, because every road into another
   * document — the file picker, a preset, the folder browser, a #doc= link —
   * arrives at this one function. Asked AFTER the file parses, so a mistyped
   * name never costs a prompt about work it was never going to touch.
   */
  if (!confirmDiscard(`Opening ${doc.name || filename || 'another document'}`)) {
    setStatus('kept the current document', false);
    return false;
  }

  /*
   * Every open severs the tie to any previously-saved file: a preset or a
   * .stel must not silently overwrite whatever happened to be saved before
   * it. The one caller that DOES want an origin — the folder browser — sets
   * it right after this returns, which is why clearing comes first.
   */
  docs?.clearOrigin(doc.name || filename.replace(/\.(json|stel|txt)$/, ''));

  // a plane-set document rebuilds from its own sheet, with no catalog item
  if (doc.planeRows) {
    if (doc.polySymmetry) state.polySym = doc.polySymmetry;
    if (doc.stellSymmetry) state.stellSym = doc.stellSymmetry;
    state.centralPlanes = !!doc.centralPlanes;
    if (doc.planeDepth != null) setDepth(doc.planeDepth, false);
    // the display settings save the same way for custom documents as for
    // catalog ones, so they restore the same way too
    state.planeIndex = doc.diagramFace || 0;
    const commit = applyDisplaySettings(doc);
    const ok = await buildCustomPlanes(doc.planeRows);
    if (ok && doc.cells) {
      const { selected } = await call('parseCells', { cells: doc.cells, indexing: doc.cellsIndexing || null });
      state.selected = new Set(selected);
      /*
       * The build sent the cosets message with the default selection, but
       * the selection is the steering: it decides between enantiomorphic
       * labelings. Now that the document's own cells are in, send it again
       * so a chiral figure reopens in its own hand, exactly as the catalog
       * path does by passing the cells into build().
       */
      await applyCosetSub();
      await refresh();
    }
    if (ok) commit();          // the look, once the figure is there to wear it
    if (ok) markSaved();       // freshly opened: nothing to lose yet
    if (ok) keepLink(opts.hash);
    if (ok && doc.view) renderer?.setView(doc.view);
    syncOrient();
    setStatus(ok ? `opened ${doc.name || filename} (custom planes)` : 'could not build that plane sheet', false);
    return !!ok;
  }

  // JSON records the catalog file id; .stel only has the human name
  let item = doc.file ? findItem(doc.file) : null;
  if (!item && doc.polyhedron) {
    for (const cat of state.catalog)
      for (const it of cat.items)
        if (it.name.toLowerCase() === doc.polyhedron.toLowerCase()) item = { ...it, category: cat.category };
  }
  if (!item) {
    setStatus(`${filename || 'that file'} names "${doc.polyhedron}", which is not in the catalog`, false);
    return false;
  }

  state.planeIndex = doc.diagramFace || 0;
  $('#planeIndex').value = state.planeIndex;

  const commit = applyDisplaySettings(doc);

  const built = await select(item, { polySym: doc.polySymmetry, stellSym: doc.stellSymmetry,
                       cells: doc.cells, cellsIndexing: doc.cellsIndexing || null,
                       centralPlanes: doc.centralPlanes,
                       depth: doc.planeDepth ?? undefined, view: doc.view });
  if (built === false) return false;   // stopped or failed: its own status stands
  commit();
  markSaved();                      // what is on screen IS the file on disk
  keepLink(opts.hash);
  setStatus(`opened ${doc.name || filename} (${doc.source === 'json' ? 'JSON' : '.stel'})`, false);
  return true;
}

function download(filename, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function setStatus(text, busy, frac) {
  $('#status').textContent = text;
  $('#status').classList.toggle('busy', !!busy);
  const bar = $('#progress');
  bar.style.display = busy ? '' : 'none';
  bar.style.setProperty('--frac', frac == null ? 0 : frac);
}

applyTheme(localStorage.getItem('theme') || 'auto');
boot();
