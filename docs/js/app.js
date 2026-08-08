/*
 * The Stellation app: pick a polyhedron, watch its face planes cut space into
 * cells, choose cells, get a stellated solid.
 */

import { Renderer3D } from './render3d.js';
import { DiagramView } from './diagram.js';
import { CellsPanel } from './cells.js';
import { labelKeys } from './platform.js';
import { toOFF, toOBJ, toSTL, writeStel, facePlanes, suggestDepth } from './core.js';
import { writePreset, readDocument, newDocumentName } from './preset.js';

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

let renderer, diagram, cells;

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
    const savedEdge = Number(localStorage.getItem('edgeWidth'));
    if (savedEdge > 0) {
      renderer.edgeWidth = savedEdge;
      $('#edgeWidth').value = savedEdge;
      $('#edgeWidthLabel').textContent = savedEdge.toFixed(1);
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

  cells = new CellsPanel($('#cells'), {
    onBeforeChange: () => mark(),
    onChange: () => refresh(),
    onHover: (hit) => { $('#cellInfo').textContent = cells.describe(hit); },
  });

  labelKeys();          // name the carve modifier for this platform

  wireControls();
  startWorker();
  applyTheme(localStorage.getItem('theme') || 'auto');   // now that the views exist

  // handy from the console, and what the browser tests drive
  window.stellation = { state, cells, diagram, renderer, call, select, refresh, applyToCell, openDocument };

  /*
   * file / polyGroup / stellGroup / dDEPTH / vQX,QY,QZ,QW,ZOOM / {cells}
   *
   * The `v` segment is the camera, added so that a reload keeps the angle you
   * were looking from and so that a link shows the recipient the same picture,
   * which was the point of adding it. Every segment stays optional, so links
   * written before it existed still open.
   */
  const hash = decodeURIComponent(location.hash.slice(1));
  const m = hash.match(
    /^([\w]+)(?:\/([\w()]+))?(?:\/([\w()]+))?(?:\/d(\d+))?(?:\/v([-\d.,eE]+))?(?:\/(\{.*\}))?$/);
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

function syncUndo() {
  const u = $('#undoBtn'), r = $('#redoBtn');
  if (u) u.disabled = !undoStack.past.length;
  if (r) r.disabled = !undoStack.future.length;
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

/** toggle a single sub-cell — the console/API entry point */
function applyToCell(key) {
  if (!key) return;
  mark();
  state.selected.has(key) ? state.selected.delete(key) : state.selected.add(key);
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

  // One cell at a time here: the solid adds or removes exactly what you
  // pointed at. The group walk belongs to the Cells table alone.
  if (mod.shift) {
    if (!outside) { setStatus('nothing further out on that face — raise the build depth', false); return; }
    mark();
    applyChange([outside], true);
  } else if (mod.ctrl) {
    if (!inside) { setStatus('no cell inside that face', false); return; }
    mark();
    applyChange([inside], false);
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
  $('#hover3d').textContent = !action ? ''
    : key ? `${mod.shift ? 'add' : 'remove'} cell ${key}`
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
  state.customPlanes = null;         // picking a solid leaves make-planes mode
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
  await build(opts.cells);
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

async function build(cellsString) {
  if (state.building) return;
  state.building = true;
  setStatus('building the plane arrangement…', true);

  const g = state.customPlanes ? null : state.geometry[state.current.file];
  renderer?.resetScale();      // a new arrangement re-frames; edits within one do not
  clearHistory();              // a different arrangement: nothing earlier applies
  const polyM = state.symmetry[state.polySym]?.matrices || state.symmetry.E.matrices;
  const subM = state.symmetry[state.stellSym]?.matrices || null;

  try {
    const info = await call('build', {
      geometry: g, customPlanes: state.customPlanes || null,
      matrices: polyM, subMatrices: subM,
      maxIntersection: state.depth >= NO_LIMIT ? -1 : state.depth, maxLayer: 1000,
    }, ({ done, total }) => setStatus(`intersecting plane ${done} of ${total}…`, true, done / total));

    state.outline = info.outline;
    state.diagramFrame = null;       // the old arrangement's frame is meaningless now
    cells.setOutline(info.outline);
    cells.setLabels(duValLabels());
    // fix the camera for this whole arrangement — see Renderer3D._camera
    renderer?.setFrameRadius(info.frameRadius || 0);
    fillFaceSelect(info.faces);
    refreshElements();
    renderLegend();

    if (cellsString) {
      const { selected } = await call('parseCells', { cells: cellsString });
      state.selected = new Set(selected);
    } else {
      const { keys } = await call('layerKeys', { n: 1 });
      state.selected = new Set(keys);
    }

    await refresh();
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

async function refresh() {
  if (!state.outline) return;
  const selected = [...state.selected];
  const { mesh, diagram: dia } = await call('both', { selected, planeIndex: state.planeIndex });

  state.mesh = mesh;
  renderer?.setMesh(mesh, mesh.faceLayers);
  diagram.setData(dia);
  state.diagramFrame = dia?.frame || null;
  refreshDiagramOverlay();
  cells.setSelected(state.selected);

  $('#stats').innerHTML =
    `<b>${mesh.stats.vertices}</b> v · <b>${mesh.stats.faces}</b> f · ` +
    `<b>${mesh.stats.cells}</b> cells · vol <b>${mesh.stats.volume.toFixed(4)}</b>`;

  const { cells: str } = await call('formatCells', { selected });
  state.cellsString = str;
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

  $('#polySym').onchange = (e) => {
    state.polySym = e.target.value;
    const allowed = subgroupsOf(state.polySym);
    if (!allowed.includes(state.stellSym)) state.stellSym = state.polySym;
    syncSymmetrySelects();
    build();
  };
  $('#stellSym').onchange = (e) => { state.stellSym = e.target.value; build(); };
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
      if (layer.cells.some(c => c.subCells.some(s => state.selected.has(`${l}.${c.index}.${s.index}`)))) n = l + 1;
    });
    const { keys } = await call('layerKeys', { n: Math.min(n + 1, state.outline.length) });
    mark(); state.selected = new Set(keys); refresh();
  };
  $('#undoBtn').onclick = undo;
  $('#redoBtn').onclick = redo;

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
  $('#showEdges').onchange = (e) => { if (renderer) { renderer.showEdges = e.target.checked; renderer.draw(); } };
  $('#fitView').onclick = () => { renderer?.fit(); setStatus('rescaled to fit', false); };
  $('#homeView').onclick = () => { renderer?.home(); setStatus('canonical orientation', false); };

  for (const id of ['#showAxes', '#showMirrors', '#showImproper', '#showDiagElems']) {
    const el = $(id);
    if (el) el.onchange = refreshElements;
  }

  $('#makePlanes').onclick = () => {
    $('#planesText').value = seedPlanesText();
    $('#planesInfo').textContent = '';
    $('#planesDialog').showModal();
  };
  $('#planesSeed').onclick = () => {
    // re-seed from the current catalog solid. In custom mode there is no solid
    // to seed from — wiping the sheet (and with it the saved document's source)
    // would be the only possible outcome, so refuse with a reason instead.
    if (!state.geometry[state.current?.file]) {
      $('#planesInfo').textContent = 'nothing to seed from — pick a catalog solid first';
      return;
    }
    state.planesText = null;
    $('#planesText').value = seedPlanesText();
    $('#planesInfo').textContent = '';
  };
  $('#planesCancel').onclick = () => $('#planesDialog').close();
  $('#planesBuild').onclick = async () => {
    if (await buildCustomPlanes($('#planesText').value)) $('#planesDialog').close();
  };

  installSplitters();

  $('#edgeWidth').oninput = (e) => {
    const w = Number(e.target.value);
    $('#edgeWidthLabel').textContent = w.toFixed(1);
    localStorage.setItem('edgeWidth', w);
    if (renderer) { renderer.edgeWidth = w; renderer.draw(); }
  };
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
  $('#saveJson').onclick = () => {
    const docName = newDocumentName();
    download(`${docName}.json`, writePreset({
      name: docName,
      polyhedron: state.current.name, file: state.current.file,
      polySymmetry: state.polySym, stellSymmetry: state.stellSym,
      planeDepth: state.depth, cells: state.cellsString,
      diagramFace: state.planeIndex,
      showEdges: $('#showEdges').checked,
      showAllFacets: $('#showAllFacets').checked,
      spin: $('#autoRotate').checked,
      view: renderer?.getView() || null,
      planesText: state.customPlanes ? state.planesText : null,
    }), 'application/json');
  };
  $('#exportStel').onclick = () => download(`${name()}.stel`, writeStel({
    polyhedron: state.current.name, polySymmetry: state.polySym,
    stellSymmetry: state.stellSym, cells: state.cellsString,
  }));
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

  $$('.sample').forEach(b => {
    b.onclick = async () => openDocument(await fetch(`samples/${b.dataset.file}`).then(r => r.text()), b.dataset.file);
  });

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

// ------------------------------------------------------------------ make planes

/*
 * The "make planes" dialog — the original Java program's plane-set editor,
 * ported. Each line is one plane and, optionally, the group that multiplies
 * it, so a plane set can be given directly instead of being taken from a
 * catalog solid. The engine has been plane-based from the start and could
 * always read such files; this is the front door the port did not have.
 *
 * Line format:  nx ny nz d [GROUP]
 * The seed button fills the sheet from the current solid's own face planes,
 * which is exactly what the Java dialog used as its starting values.
 */
function parsePlaneRows(text) {
  const rows = [];
  const errors = [];
  text.split('\n').forEach((line, li) => {
    const s = line.replace(/#.*$/, '').trim();
    if (!s) return;
    const parts = s.split(/[\s,]+/);
    const nums = parts.slice(0, 4).map(Number);
    const group = parts[4] || 'E';
    if (parts.length < 4 || nums.some(v => !Number.isFinite(v))) {
      errors.push(`line ${li + 1}: expected "nx ny nz d [group]", got "${s}"`);
      return;
    }
    if (parts[4] && !(state.symmetry[group]?.order > 0)) {
      errors.push(`line ${li + 1}: no symmetry group named "${group}"`);
      return;
    }
    rows.push({ n: [nums[0], nums[1], nums[2]], d: nums[3], group });
  });
  return { rows, errors };
}

/** each row multiplied by its group — the worker dedupes and counts */
function expandPlaneRows(rows) {
  const out = [];
  for (const r of rows) {
    const M = state.symmetry[r.group]?.matrices || state.symmetry.E.matrices;
    for (const m of M) {
      const [a, b, c, d, e, f, g, h, i] = m.length === 9
        ? m : [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]];
      out.push({
        n: [a * r.n[0] + b * r.n[1] + c * r.n[2],
            d * r.n[0] + e * r.n[1] + f * r.n[2],
            g * r.n[0] + h * r.n[1] + i * r.n[2]],
        d: r.d,
      });
    }
  }
  return out;
}

function seedPlanesText() {
  if (state.customPlanes && state.planesText) return state.planesText;
  const g = state.geometry[state.current?.file];
  if (!g) return '';
  const planes = facePlanes(toPoly(g));
  const f = v => (Math.abs(v) < 1e-12 ? 0 : v).toFixed(6);
  return `# one plane per line: nx ny nz d [group to multiply it by]\n` +
         `# seeded from ${state.current.name} — ${planes.length} planes\n` +
         planes.map(p => `${f(p.n.x)} ${f(p.n.y)} ${f(p.n.z)} ${f(p.d)} E`).join('\n');
}

async function buildCustomPlanes(text) {
  const { rows, errors } = parsePlaneRows(text);
  const info = $('#planesInfo');
  if (errors.length) { info.textContent = errors.slice(0, 3).join(' · '); return false; }
  if (!rows.length) { info.textContent = 'no planes yet — one per line: nx ny nz d [group]'; return false; }
  const expanded = expandPlaneRows(rows);
  info.textContent = '';
  const prev = { planesText: state.planesText, customPlanes: state.customPlanes, current: state.current };
  state.planesText = text;
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

/** open either our JSON preset or an original .stel file */
async function openDocument(text, filename = '') {
  let doc;
  try {
    doc = readDocument(text);
  } catch (err) {
    setStatus(`could not read ${filename || 'that file'}: ${err.message}`, false);
    return;
  }

  // a make-planes document rebuilds from its own plane sheet, no catalog item
  if (doc.planesText) {
    if (doc.polySymmetry) state.polySym = doc.polySymmetry;
    if (doc.stellSymmetry) state.stellSym = doc.stellSymmetry;
    if (doc.planeDepth != null) setDepth(doc.planeDepth, false);
    // the display settings save the same way for custom documents as for
    // catalog ones, so they restore the same way too
    state.planeIndex = doc.diagramFace || 0;
    if (doc.source === 'json') {
      for (const [id, val] of [['#showEdges', doc.showEdges], ['#showAllFacets', doc.showAllFacets], ['#autoRotate', doc.spin]]) {
        $(id).checked = !!val;
        $(id).dispatchEvent(new Event('change'));
      }
    }
    const ok = await buildCustomPlanes(doc.planesText);
    if (ok && doc.cells) {
      const { selected } = await call('parseCells', { cells: doc.cells });
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

  if (doc.source === 'json') {
    for (const [id, val] of [['#showEdges', doc.showEdges], ['#showAllFacets', doc.showAllFacets], ['#autoRotate', doc.spin]]) {
      $(id).checked = !!val;
      $(id).dispatchEvent(new Event('change'));
    }
  }

  await select(item, { polySym: doc.polySymmetry, stellSym: doc.stellSymmetry, cells: doc.cells,
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
