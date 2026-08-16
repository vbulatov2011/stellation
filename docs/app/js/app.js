/*
 * The Stellation app: pick a polyhedron, watch its face planes cut space into
 * cells, choose cells, get a stellated solid.
 */

import {
  Renderer3D, DiagramView, CellsPanel, labelKeys,
  toOFF, toOBJ, toSTL, writeStel, facePlanes, suggestDepth,
} from '../../lib/modules.js';
import { writePreset, readDocument, newDocumentName, normalizePlaneRows } from './preset.js';
import { initWorkspace } from './workspace.js';
import { getSquareThumbnailCanvas } from '../../lib/uilib/files.js';
import { initPresets } from './presets.js';
import { initDocManager } from './docmanager.js';
import { initPlanesDialog } from './planesdialog.js';

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
  building: false,
};

// ------------------------------------------------------------------ worker

let worker = null, msgId = 0;
const pending = new Map();

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

let renderer, diagram, cells, docs, presets;

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
    if (savedColor === 'class' || savedColor === 'layer') {
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
      // name both neighbours, since the two gestures reach one each
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
  const workspace = initWorkspace({ redraw: () => { renderer?.resize(); diagram?.draw(); cells?.draw(); } });
  /*
   * The preset and file browsers join the same windows menu as the panels, so
   * there is one list of every window rather than two ways to find one. Both
   * also keep their buttons in Save & export; the menu is the path that stays
   * reachable when the settings window itself is closed.
   */
  workspace.register({ title: 'Presets', isOpen: presets.isOpen, setOpen: presets.setOpen });
  if (docs.canFolders) {
    workspace.register({ title: 'Documents', isOpen: docs.isBrowserOpen, setOpen: docs.setBrowserOpen });
  }
  applyTheme(localStorage.getItem('theme') || 'auto');   // now that the views exist

  // handy from the console, and what the browser tests drive
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
  // the cells segment allows the c{…} member-indexed form — an unaligned
  // selection, which parseCellsAny recognises by the prefix
  const m = hash.match(
    /^([\w]+)(?:\/([\w()]+))?(?:\/([\w()]+))?(?:\/d(\d+))?(?:\/v([-\d.,eE]+))?(?:\/(c?\{.*\}))?$/);
  if (m && geometry[m[1]]) {
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
    const sel = $('#viewOrient');
    if (sel) sel.value = String(renderer.matchStandardView());
    syncHash();
  };
  setInterval(catchUp, 900);
  // and immediately on the way out, so the last position is never the one lost
  addEventListener('pagehide', catchUp);
  addEventListener('visibilitychange', catchUp);
}

let lastView = '';

function syncHash() {
  if (!state.current) return;
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
 * Anything else means a button that is greyed out in one corner of the screen
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
 *               their own colours — gold and blue, not green and red.
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
 * What a click here would do, said in colour before it is spent.
 *
 * Green adds, red removes — the natural reading of the two colours. When the
 * gesture has nothing to work on the outline is dimmed rather than dropped: a
 * highlight should mean the click will do something, but you still want to see
 * which face you are pointing at, so it stays visible and stops looking like a
 * live target.
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
  const live = !!key && !!action;
  renderer?.setHighlight(hit.face, action, live || !action);
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
        $('#catalogDialog').close();
        state.depthAuto = true;          // a new solid gets its own suggested depth
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
  state.current = item;
  state.polySym = opts.polySym || item.symmetry || 'Ih';
  state.stellSym = opts.stellSym || defaultStellSym(state.polySym);

  $$('.poly').forEach(b => b.classList.toggle('active', b.dataset.file === item.file));
  $('#pickName').textContent = item.name;
  $('#pickThumb').src = `img/poly/${item.file}_tmb.gif`;

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
  await build(opts.cells, opts.cellsIndexing || null);
  // after the build, so the mesh (and therefore the model scale) already exists
  if (opts.view && renderer?.setView(opts.view)) lastView = renderer.getView().join(',');
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
 * drawn, and further into INEQUIVALENT CLASSES, each with its own colour, so
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
 * operation exchanges, each axis is its own class and gets its own colour.
 *
 * If M is improper then -M is a proper rotation, so one axis extractor serves
 * all three kinds; for a mirror, -M is the half-turn about the plane's normal.
 * The inversion centre is a point, not a line or plane, and is left out: there
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
      if (trace < -2.999) continue;                    // inversion centre
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

  // the colour legend: one chip per inequivalent class
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
 * what the Java applet's diagram checkboxes drew. Same colours as the solid,
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

    await refresh();
    state.builtStellSym = state.stellSym;   // what the grouping on screen actually is
    const slow = info.ms > 5000 && !state.depthAuto;
    setStatus(`${planeReport(info)} · ${info.facets.toLocaleString()} facets · ` +
              `${info.layers} layers · ${(info.ms / 1000).toFixed(info.ms > 5000 ? 1 : 3)} s` +
              (slow ? ' — lower the depth for a quicker rebuild' : ''), false);
    const dropped = (info.planesCentral || 0) + (info.planesDegenerate || 0);
    $('#status').title = dropped
      ? `${dropped} of this solid's ${info.planesTotal} faces have no usable plane here` +
        (info.planesCentral ? ` — ${info.planesCentral} pass exactly through the centre, ` +
          'which this representation cannot hold (see notes/design/plane-representation.md)' : '')
      : '';
  } catch (err) {
    setStatus('failed: ' + err.message, false);
    startWorker();
    return false;
  } finally {
    state.building = false;
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
 * honoured at all (the worker is busy making some other arrangement), so
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
  const { mesh, diagram: dia } = await call('both', { selected, planeIndex: state.planeIndex });

  state.mesh = mesh;
  renderer?.setMesh(mesh, mesh.faceLayers,
    { classes: mesh.faceClasses, top: mesh.faceTop, planes: mesh.facePlanes });
  diagram.setData(dia);
  state.diagramFrame = dia?.frame || null;
  refreshDiagramOverlay();
  cells.setSelected(state.selected);

  $('#stats').innerHTML =
    `<b>${mesh.stats.vertices}</b> v · <b>${mesh.stats.faces}</b> f · ` +
    `<b>${mesh.stats.cells}</b> cells · vol <b>${mesh.stats.volume.toFixed(4)}</b>`;

  const { cells: str, aligned } = await call('formatCells', { selected });
  state.cellsString = str;
  // aligned = the selection is whole orbits of the current editing symmetry,
  // so it serializes in the legacy notation old builds still read
  state.cellsAligned = aligned !== false;
  $('#cellsString').value = str;
  syncHash();
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
  if (!dropped) return `${info.planes} planes`;
  return `⚠ ${info.planes} of ${total} planes`;
}

/*
 * The diagram can be drawn on any face plane, but planes the symmetry carries
 * onto one another give the same picture — so offer one of each kind rather
 * than a number to type with no upper bound. The cuboctahedron under O_h, for
 * instance, has exactly two. Each entry is named after the polygon at the
 * centre of that diagram, which is the solid's own face there.
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
    const shape = POLYGON[f.sides] || (f.sides ? `${f.sides}-gon` : 'face');
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

/** the key to the bar colours: one swatch per distinct number of congruent pieces */
function renderLegend() {
  const host = $('#cellsLegend');
  if (!host) return;
  const entries = cells.legend();
  host.innerHTML = '<span class="legend-label">pieces per cell</span>' + entries.map(e =>
    `<span class="legend-item"><i style="background:${e.color}"></i>${e.count}</span>`).join('');
}

// ------------------------------------------------------------------ controls

function wireControls() {
  $('#pickPoly').onclick = () => {
    ensureCatalog();
    $('#catalogDialog').showModal();
    showFoot(state.current, state.current?.category);
    $('#search').focus();
    document.querySelector('.poly.active')?.scrollIntoView({ block: 'center' });
  };
  $('#catalogClose').onclick = () => $('#catalogDialog').close();

  /*
   * The New dialog is the one front door. Its own content is the catalog;
   * the other three sources already have their homes — the preset browser,
   * the file input, the plane editor — so it closes and hands over rather
   * than growing copies of them.
   */
  $('#newFromPreset').onclick = () => { $('#catalogDialog').close(); presets.show(); };
  $('#newFromFile').onclick = () => { $('#catalogDialog').close(); $('#loadDoc').click(); };
  $('#newFromPlanes').onclick = () => { $('#catalogDialog').close(); $('#editPlanes').click(); };

  $('#polySym').onchange = (e) => {
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
  $('#stellSym').onchange = (e) => { state.stellSym = e.target.value; changeStellSym(); };
  $('#depth').oninput = (e) => setDepth(Number(e.target.value), false);
  $('#depth').onchange = () => build();
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

  $('#autoRotate').onchange = (e) => { if (renderer) renderer.autoRotate = e.target.checked; };
  for (const id of ['#showFaceEdges', '#faceEdgeColor', '#faceEdgeWidth', '#faceEdgeTubes',
                    '#showFacetEdges', '#facetEdgeColor', '#facetEdgeWidth', '#facetEdgeTubes']) {
    // `input` rather than `change` so dragging a slider or scrubbing the colour
    // picker updates the solid as you go, which is the only way to tune a
    // weight or a shade against what you are actually looking at
    $(id).oninput = pushEdgeStyle;
  }
  $('#colorMode').onchange = (e) => {
    localStorage.setItem('colorMode', e.target.value);
    renderer?.setColorMode(e.target.value);
    diagram?.setColorMode(e.target.value);
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
  $('#fitDiagram').onclick = () => { diagram?.resetView(); setStatus('diagram centred', false); };
  $('#fitView').onclick = () => { renderer?.fit(); setStatus('rescaled to fit', false); };
  /*
   * The orientation control is both a readout and a chooser: the button
   * steps through the standard views and the menu jumps to one, and either
   * way the menu ends up showing where the solid is now. Turning the model
   * by hand blanks it — see syncOrient, called from the same interval that
   * watches the camera.
   */
  const showOrient = (view) => {
    if (!view) return;
    $('#viewOrient').value = String(view.index);
    setStatus(`${view.name} view`, false);
  };
  $('#homeView').onclick = () => showOrient(renderer?.home());
  $('#viewOrient').onchange = (e) => {
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

  $('#exportOff').onclick = () => download(`${name()}.off`, toOFF(state.mesh));
  $('#exportObj').onclick = () => download(`${name()}.obj`, toOBJ(state.mesh));
  $('#exportStl').onclick = () => download(`${name()}.stl`, toSTL(state.mesh, name()));
  /*
   * Save routes through the document manager: over the origin file when the
   * document came from a local folder, through Save As when it did not, and
   * as a plain download on browsers without the File System Access API. The
   * two folder buttons stay hidden unless the API exists, so no dead UI.
   */
  docs = initDocManager({
    currentPresetText, makeThumbnail, openDocument, newDocumentName, download, setStatus,
  });
  $('#saveJson').onclick = () => docs.save();
  $('#saveAsBtn').onclick = () => docs.saveAs();
  $('#browseBtn').onclick = () => docs.browse();
  if (docs.canFolders) {
    $('#saveAsBtn').hidden = false;
    $('#browseBtn').hidden = false;
  }
  /*
   * .stel is the original program's format and cannot say "member indices".
   * An unaligned selection exports under the trivial group instead: written
   * as E sub-cells it IS whole orbits, and a legacy reader running with
   * stellation symmetry E reproduces it exactly.
   */
  $('#exportStel').onclick = async () => {
    let cellsText = state.cellsString, stellSym = state.stellSym;
    if (state.cellsAligned === false) {
      const { cells: eText } = await call('formatUnder', {
        selected: [...state.selected], subMatrices: state.symmetry.E.matrices,
      });
      if (!eText) { setStatus('could not express this selection for .stel', false); return; }
      cellsText = eText; stellSym = 'E';
    }
    download(`${name()}.stel`, writeStel({
      polyhedron: state.current.name, polySymmetry: state.polySym,
      stellSymmetry: stellSym, cells: cellsText,
    }));
  };
  $('#exportSvg').onclick = () => download(`${name()}-diagram.svg`, diagram.toSVG(), 'image/svg+xml');
  $('#exportPng').onclick = () => {
    const a = document.createElement('a');
    a.download = `${name()}.png`;
    a.href = renderer.snapshot();
    a.click();
  };

  $('#loadDoc').onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await openDocument(await file.text(), file.name);
    e.target.value = '';
  };

  presets = initPresets({ openDocument, setStatus });
  $('#showPresets').onclick = () => presets.show();

  /*
   * The plane-set editor wires its own controls: rows, per-row factor and
   * symmetry, orbit counts, the preview, and the three imports. After the
   * preset browser, because it borrows that browser to import from a preset.
   * It opens seeded from the current sheet in custom mode, or from the
   * current solid reduced to one row per symmetry class; Build funnels into
   * the same buildCustomPlanes every other path uses.
   */
  initPlanesDialog({ state, toPoly, buildCustomPlanes, presets, setStatus });

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

  $('#catalogDialog').addEventListener('close', () => { $('#search').value = ''; runSearch(); });
  $('#catalogDialog').addEventListener('cancel', () => { $('#search').value = ''; });
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

/** each row multiplied by its group, scaled by its factor — the engine dedupes */
function expandPlaneRows(rows) {
  const out = [];
  for (const r of rows) {
    const M = state.symmetry[r.symmetry || 'E']?.matrices || state.symmetry.E.matrices;
    const n0 = r.normal, d = r.distance * (r.factor ?? 1);
    for (const m of M) {
      const [a, b, c, e, f, g, h, i, j] = m.length === 9
        ? m : [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
      out.push({
        n: [a * n0[0] + b * n0[1] + c * n0[2],
            e * n0[0] + f * n0[1] + g * n0[2],
            h * n0[0] + i * n0[1] + j * n0[2]],
        d,
      });
    }
  }
  return out;
}

async function buildCustomPlanes(planeRows) {
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
  const expanded = expandPlaneRows(rows);
  info.textContent = '';
  const prev = { planeRows: state.planeRows, customPlanes: state.customPlanes, current: state.current };
  state.planeRows = rows;
  state.customPlanes = expanded;
  state.current = { file: 'custom', name: `custom planes (${rows.length} rows → ${expanded.length})`, symmetry: null };
  $('#pickName').textContent = 'custom planes';
  $('#pickThumb').removeAttribute('src');
  syncSymmetrySelects();
  const ok = await build();
  if (!ok) {
    // a failed build must not leave the app claiming to BE the failed sheet —
    // keep the dialog open with the reason, and put the state back
    info.textContent = $('#status').textContent;
    Object.assign(state, prev);
    if (state.current) {
      $('#pickName').textContent = state.current.name;
      if (state.current.file !== 'custom') $('#pickThumb').src = `img/poly/${state.current.file}_tmb.gif`;
    }
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

const name = () => `${state.current.file}-${state.polySym}-${state.stellSym}`;

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
    spin: $('#autoRotate').checked,
    colorMode: $('#colorMode').value,
    faceOpacity: Number($('#faceOpacity').value) / 100,
    view: renderer?.getView() || null,
    planeRows: state.customPlanes ? state.planeRows : null,
  });
}

/*
 * The document thumbnail: the 3D view, centre-cropped square. Drawn
 * immediately before reading — the WebGL context has no preserveDrawingBuffer,
 * so the pixels only exist in the same frame as a draw (the same rule
 * snapshot() follows). When WebGL was refused, the diagram canvas stands in,
 * so a document saved on that machine still gets a preview.
 */
function makeThumbnail(size = 256) {
  if (renderer) {
    renderer.draw();
    return getSquareThumbnailCanvas(renderer.canvas, size);
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
  if (doc.source !== 'json') return;
  for (const [id, val] of [['#showAllFacets', doc.showAllFacets],
                           ['#autoRotate', doc.spin]]) {
    $(id).checked = !!val;
    $(id).dispatchEvent(new Event('change'));
  }
  $('#colorMode').value = doc.colorMode || 'layer';
  $('#colorMode').dispatchEvent(new Event('change'));
  $('#faceOpacity').value = String(Math.round((doc.faceOpacity ?? 1) * 100));
  $('#faceOpacity').dispatchEvent(new Event('input'));
  // a pre-split document has only `showEdges`, which drew both kinds alike
  applyEdgeStyle(doc.edges || {
    face: { ...currentEdgeStyle().face, show: !!doc.showEdges },
    facet: { ...currentEdgeStyle().facet, show: !!doc.showEdges },
  });
}

/** open either our JSON preset or an original .stel file */
async function openDocument(text, filename = '') {
  let doc;
  try {
    doc = readDocument(text);
  } catch (err) {
    setStatus(`could not read ${filename || 'that file'}: ${err.message}`, false);
    return;
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
    if (doc.planeDepth != null) setDepth(doc.planeDepth, false);
    // the display settings save the same way for custom documents as for
    // catalog ones, so they restore the same way too
    state.planeIndex = doc.diagramFace || 0;
    applyDisplaySettings(doc);
    const ok = await buildCustomPlanes(doc.planeRows);
    if (ok && doc.cells) {
      const { selected } = await call('parseCells', { cells: doc.cells, indexing: doc.cellsIndexing || null });
      state.selected = new Set(selected);
      await refresh();
    }
    if (ok && doc.view) renderer?.setView(doc.view);
    setStatus(ok ? `opened ${doc.name || filename} (custom planes)` : 'could not build that plane sheet', false);
    return;
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
    return;
  }

  state.planeIndex = doc.diagramFace || 0;
  $('#planeIndex').value = state.planeIndex;

  applyDisplaySettings(doc);

  await select(item, { polySym: doc.polySymmetry, stellSym: doc.stellSymmetry, cells: doc.cells,
                       cellsIndexing: doc.cellsIndexing || null,
                       depth: doc.planeDepth ?? undefined, view: doc.view });
  setStatus(`opened ${doc.name || filename} (${doc.source === 'json' ? 'JSON' : '.stel'})`, false);
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
