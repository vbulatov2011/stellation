/*
 * Saving and loading, in the SymmHub preset shape.
 *
 * SymmHub apps all write the same envelope — a document name, an `appInfo`
 * block naming the app and the file-format release, and a `params` object of
 * nested groups — so a stellation saved here sits alongside the attractor and
 * pattern presets without looking foreign:
 *
 *   {
 *     "name": "par-26-08-05-20-13-45-123",
 *     "appInfo": { "appName": "Stellation…_v1", "fileFormatRelease": 1 },
 *     "params": { "polyhedron": {…}, "symmetry": {…}, … }
 *   }
 *
 * The old `.stel` files still load: `parseStel` in core.js reads them, and
 * `readDocument` below takes either and hands back the same shape.
 */

import { parseStel } from '../../lib/modules.js';

export const APP_NAME = 'Stellation.PolyhedronCatalog.PlaneArrangement.CellSelection_v1';
/*
 * Release 1: the selection string's [brackets] hold sub-cell indices under
 * the document's stellation symmetry — every document ever written.
 * Release 2: cells.indexing === "cells" marks a selection that is NOT whole
 * orbits of its stellation symmetry; the brackets then hold primitive-cell
 * (member) indices.
 * Release 3: a custom plane set is `planes.rows`, structured — see
 * normalizePlaneRows. Release 1 and 2 wrote `planes.text`, lines to be
 * re-parsed on every read.
 *
 * The number is the LOWEST release that can read the document correctly, so
 * anything an old build handles still says 1, and what it would misread it
 * refuses instead ("this file is format release 3…").
 */
export const FILE_FORMAT_RELEASE = 4;
/*
 * The prefix on a generated document name. SymmHub's own apps write `par`
 * (for "parameters"); this one writes `stel`, because what it saves is a
 * stellation and the name is the first thing offered in the Save As box.
 */
const PARAM_PREFIX = 'stel';

/** `-YY-MM-DD-HH-MM-SS-mmm`, the SymmHub date2s() format */
export function date2s(date = new Date(), sep = '-') {
  const p = (n, w) => String(n).padStart(w, '0');
  return sep + p(date.getFullYear() - 2000, 2) +
         sep + p(date.getMonth() + 1, 2) +
         sep + p(date.getDate(), 2) +
         sep + p(date.getHours(), 2) +
         sep + p(date.getMinutes(), 2) +
         sep + p(date.getSeconds(), 2) +
         sep + p(date.getMilliseconds(), 3);
}

export function newDocumentName(date = new Date()) {
  return PARAM_PREFIX + date2s(date);
}

/**
 * Everything needed to rebuild what is on screen. Only inputs go in `params` —
 * vertex counts and volumes are derived, so they would only ever go stale.
 */
export function writePreset({
  name, polyhedron, file, polySymmetry, stellSymmetry,
  planeDepth, cells, cellsIndexing = null, diagramFace,
  showEdges = true, showAllFacets = true, colorMode = 'layer',
  cosetSub = null, cosetPlanes = null, colorMerge = null, cosetPaint = null,
  texture = null,
  faceOpacity = 1, edges = null, colors = null,
  view = null, planeRows = null, centralPlanes = false,
  exportLengthUnit = 0.01,
}) {
  const planes = planeRows?.length ? normalizePlaneRows(planeRows) : null;
  return JSON.stringify({
    name: name || newDocumentName(),
    /*
     * The lowest release that reads this document correctly — see the
     * constant. Central planes force release 4: a build without them would
     * quietly drop the d=0 rows, rebuild a different arrangement, and then
     * resolve the same cells string against it — the exact silent-wrong-
     * figure failure the release check exists to refuse.
     */
    appInfo: { appName: APP_NAME,
               fileFormatRelease: centralPlanes ? 4
                 : planes ? 3 : cellsIndexing === 'cells' ? 2 : 1 },
    params: {
      polyhedron: { name: polyhedron, file },
      symmetry: { polyhedron: polySymmetry, stellation: stellSymmetry },
      arrangement: centralPlanes ? { planeDepth, centralPlanes: true }
                                 : { planeDepth },
      cells: cellsIndexing === 'cells'
        ? { selection: cells, indexing: 'cells' }
        : { selection: cells },
      /*
       * `camera` is the orientation quaternion followed by the zoom distance.
       * Saved so that reopening a document, or sending someone a link, shows the
       * solid from the angle it was chosen at rather than from the default one.
       */
      /*
       * `edges` carries the two kinds separately. `showEdges` is still written
       * beside it, as the master "any edges at all", so a document saved now
       * still opens sensibly in a build that predates the split.
       */
      /*
       * `colors` is the figure's own palette, when it has one: the color of
       * each group under `colorMode`, as hex with alpha, in the panel's row
       * order — numbered groups ascending, then gray. Written flat so it can
       * be lifted out of one document and pasted into another, which is what
       * the Colors panel's copy box is for. Absent when nothing was edited,
       * so a document that never touched colors reads exactly as before.
       */
      /*
       * `cosetPlanes` records which labeling the coset coloring wears, one
       * integer per plane, when the coloring's subgroup leaves that choice
       * open. The compound of five tetrahedra with both hands selected is
       * the case: the two candidate labelings score identically, the live
       * app resolves the tie by whatever was on screen, and without this
       * field a reopened document resolves it from nothing — so the saved
       * figure could come back in the other hand's colors. Only a tie is
       * ever decided by it; a selection that strictly demands a labeling
       * overrides it on open, so a hand-edited document cannot be forced
       * into the wrong colors. No release bump: a reader without the field
       * builds the same figure and merely resolves the tie the old way.
       */
      display: { diagramFace, showEdges, showAllFacets, colorMode, cosetSub,
                 cosetPlanes: cosetPlanes?.length ? cosetPlanes : undefined,
                 /*
                  * `colorMerge` is the merge-neighbors dial: { on, colors }.
                  * No release bump — a reader without it shows the raw
                  * per-facet confetti of the same figure, which is the same
                  * picture with the smoothing off, not a different figure.
                  */
                 colorMerge: colorMerge?.on
                   ? { on: true, colors: colorMerge.colors ?? 1 } : undefined,
                 /*
                  * `cosetPaint` is the hand-painted labeling: region ->
                  * coset, blend array, or -1, keyed 'plane.facetIndex' in
                  * the arrangement's own deterministic order — the same
                  * stability cosetPlanes already leans on. No release bump:
                  * a reader without it shows the computed labeling of the
                  * same figure.
                  */
                 cosetPaint: cosetPaint && Object.keys(cosetPaint).length
                   ? cosetPaint : undefined,
                 /*
                  * `texture` is the face image: { file, scale }, the file a
                  * name under img/textures/. Multiplied under the group
                  * colors, laid over every face through symmetry-transported
                  * charts. No release bump: a reader without it draws the
                  * same figure in plain colors.
                  */
                 texture: texture?.file
                   ? { file: texture.file, scale: texture.scale ?? 1 } : undefined,
                 faceOpacity, edges, colors: colors?.length ? colors : undefined },
      camera: view ? { view } : undefined,
      /*
       * A custom arrangement's plane set, structured: one object per row,
       * numbers as numbers. Releases 1 and 2 wrote the editor's text here
       * instead and re-parsed it on every read, which put a hand-rolled
       * tokenizer between the file and the geometry — silent on a missing
       * field, wrong on a stray one. This says what it is.
       */
      planes: planes ? { rows: planes } : undefined,
      export: { lengthUnit: exportLengthUnit },
    },
  }, null, 4) + '\n';
}

/*
 * A plane row, checked.
 *
 *   { normal: [nx, ny, nz], distance: d, symmetry: "Ih", factor: 1 }
 *
 * `symmetry` defaults to E (the plane alone) and `factor` to 1, and both are
 * written only when they carry information — so a plain sheet of planes is a
 * plain list of normals and distances. Everything else is an error rather
 * than a default: a plane set with a mistyped field would otherwise build a
 * different solid with no sign that anything was wrong, which is exactly the
 * failure the old text format could not rule out. The check runs on the way
 * out as well as in, so a malformed sheet cannot even be written.
 */
export function normalizePlaneRows(rows) {
  if (!Array.isArray(rows)) throw new Error('planes.rows must be a list');
  return rows.map((r, i) => {
    const where = `plane ${i + 1}`;
    if (!r || typeof r !== 'object') throw new Error(`${where}: not an object`);
    const n = r.normal;
    if (!Array.isArray(n) || n.length !== 3 || n.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
      throw new Error(`${where}: normal must be three finite numbers`);
    }
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) throw new Error(`${where}: normal has no direction`);
    const d = r.distance;
    if (typeof d !== 'number' || !Number.isFinite(d)) throw new Error(`${where}: distance must be a number`);
    const f = r.factor === undefined ? 1 : r.factor;
    if (typeof f !== 'number' || !Number.isFinite(f)) throw new Error(`${where}: factor must be a number`);
    const g = r.symmetry === undefined ? 'E' : r.symmetry;
    if (typeof g !== 'string' || !g) throw new Error(`${where}: symmetry must be a group name`);
    const out = { normal: [n[0], n[1], n[2]], distance: d };
    if (g !== 'E') out.symmetry = g;
    if (f !== 1) out.factor = f;
    return out;
  });
}

/*
 * Rows to planes: each row multiplied by its group and scaled by its factor.
 * The engine dedupes, so a row whose normal already lies on a symmetry axis
 * costs nothing extra.
 *
 * `symmetry` is the whole table, passed in rather than reached for, because
 * this file is imported by the tests and the catalog tool as well as by the
 * app — and those have no `state`. It lives next to normalizePlaneRows for
 * the same reason that reader does: a plane sheet has exactly one meaning,
 * and two implementations of it would eventually disagree.
 */
export function expandPlaneRows(rows, symmetry) {
  const out = [];
  for (const r of rows) {
    const M = symmetry[r.symmetry || 'E']?.matrices || symmetry.E.matrices;
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

/*
 * The releases that wrote `planes.text`: one plane per line,
 * "nx ny nz d [group [factor]]", comments after #. Kept so those documents
 * still open — and kept HERE, next to the format it belongs to, rather than
 * in the app where it used to sit.
 */
function planeRowsFromText(text) {
  const rows = [];
  text.split('\n').forEach((line, li) => {
    const s = line.replace(/#.*$/, '').trim();
    if (!s) return;
    const parts = s.split(/[\s,]+/);
    const nums = parts.slice(0, 4).map(Number);
    if (parts.length < 4 || nums.some(v => !Number.isFinite(v))) {
      throw new Error(`planes.text line ${li + 1}: expected "nx ny nz d [group [factor]]"`);
    }
    const row = { normal: [nums[0], nums[1], nums[2]], distance: nums[3] };
    if (parts[4] && parts[4] !== 'E') row.symmetry = parts[4];
    if (parts[5] !== undefined) {
      const f = Number(parts[5]);
      if (!Number.isFinite(f)) throw new Error(`planes.text line ${li + 1}: "${parts[5]}" is not a number`);
      if (f !== 1) row.factor = f;
    }
    rows.push(row);
  });
  return rows;
}

/** the plane set of a document, whichever way its release wrote it */
function readPlanes(planes) {
  if (!planes) return null;
  if (Array.isArray(planes.rows)) {
    const rows = normalizePlaneRows(planes.rows);
    return rows.length ? rows : null;
  }
  if (typeof planes.text === 'string') {
    const rows = planeRowsFromText(planes.text);
    return rows.length ? rows : null;
  }
  return null;
}

/**
 * Read a saved document. Accepts our JSON, and the original program's `.stel`,
 * and is forgiving about which of the two you hand it — the caller should not
 * have to sniff the file itself.
 */
export function readDocument(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('{') && looksLikeJSON(trimmed)) {
    return readPreset(JSON.parse(text));
  }
  const spec = parseStel(text);
  return {
    source: 'stel',
    name: null,
    polyhedron: spec.polyhedron,
    file: null,
    polySymmetry: spec.polySymmetry,
    stellSymmetry: spec.stellSymmetry,
    cells: spec.cells,
    planeDepth: null,
    diagramFace: 0,
    exportLengthUnit: spec.exportLengthUnit ? Number(spec.exportLengthUnit) : 0.01,
  };
}

/*
 * A `.stel` file also starts with `{` once its comments are stripped — the cell
 * string itself is braced. So test for a real JSON object, not just the brace.
 */
function looksLikeJSON(s) {
  try {
    const o = JSON.parse(s);
    return o && typeof o === 'object' && !Array.isArray(o);
  } catch {
    return false;
  }
}

export function readPreset(doc) {
  const p = doc.params || {};
  const release = doc.appInfo?.fileFormatRelease ?? 0;
  if (release > FILE_FORMAT_RELEASE) {
    throw new Error(`this file is format release ${release}; this build reads up to ${FILE_FORMAT_RELEASE}`);
  }
  return {
    source: 'json',
    name: doc.name || null,
    polyhedron: p.polyhedron?.name ?? null,
    file: p.polyhedron?.file ?? null,
    polySymmetry: p.symmetry?.polyhedron ?? null,
    stellSymmetry: p.symmetry?.stellation ?? null,
    cells: p.cells?.selection ?? null,
    // "cells" = member-indexed brackets (an unaligned selection); anything
    // else is the classic sub-index notation under the stellation symmetry
    cellsIndexing: p.cells?.indexing === 'cells' ? 'cells' : null,
    planeDepth: p.arrangement?.planeDepth ?? null,
    // keep planes through the center in the arrangement (release 4)
    centralPlanes: p.arrangement?.centralPlanes === true,
    diagramFace: p.display?.diagramFace ?? 0,
    showEdges: p.display?.showEdges ?? true,
    showAllFacets: p.display?.showAllFacets ?? true,
    /*
     * The saved palette, kept as written. It cannot be applied until the
     * figure is built — the rows it lines up with are the groups the mesh
     * actually wears — so the app parks it and applies it after the build.
     */
    colors: Array.isArray(p.display?.colors)
      ? p.display.colors.filter(c => typeof c === 'string') : null,
    /*
     * Documents written before face-class coloring existed have no setting;
     * they were all drawn by shell, so that is what they should reopen as.
     * An unknown value falls back the same way rather than being trusted:
     * the coloring is a view of the geometry, and the wrong one is better
     * than a mode this build cannot draw.
     */
    colorMode: ['class', 'stellClass', 'coset', 'cosetL', 'cosetM',
                 'orbitP', 'orbitF', 'orbitC'].includes(p.display?.colorMode)
      ? p.display.colorMode : 'layer',
    // the coset colorings carry their subgroup, or they reopen colorless
    cosetSub: typeof p.display?.cosetSub === 'string' ? p.display.cosetSub : null,
    // and the labeling the coloring wore, used only to break ties on reopen
    colorMerge: p.display?.colorMerge?.on
      ? { on: true,
          colors: Number.isFinite(p.display.colorMerge.colors)
            ? Math.max(1, Math.round(p.display.colorMerge.colors)) : 1 }
      : null,
    cosetPaint: (() => {
      const raw = p.display?.cosetPaint;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
      const out = {};
      for (const [k, v] of Object.entries(raw)) {
        if (!/^\d+\.\d+$/.test(k)) continue;
        if (Number.isInteger(v)) out[k] = v;
        else if (Array.isArray(v) && v.length && v.every(Number.isInteger)) out[k] = v.slice();
      }
      return Object.keys(out).length ? out : null;
    })(),
    /*
     * The face image, held to a plain file NAME — a texture is looked up
     * under the app's own img/textures/, and a path that climbs out of it
     * is dropped rather than fetched.
     */
    texture: (() => {
      const raw = p.display?.texture;
      const file = raw && typeof raw.file === 'string' ? raw.file : '';
      if (!file || file.includes('/') || file.includes('\\') || file.includes('..')) return null;
      const scale = Number.isFinite(raw.scale) && raw.scale > 0
        ? Math.min(100, Math.max(0.01, raw.scale)) : 1;
      return { file, scale };
    })(),
    cosetPlanes: Array.isArray(p.display?.cosetPlanes)
        && p.display.cosetPlanes.every(Number.isInteger)
      ? p.display.cosetPlanes : null,
    // written since translucency existed; anything older was drawn solid
    faceOpacity: clamp01(p.display?.faceOpacity, 1),
    /*
     * Documents written before the face/facet split have no `edges`, only the
     * one `showEdges` flag — and that flag drew every edge alike. So fall back
     * to both kinds following it, which reproduces what those documents looked
     * like rather than silently turning half their edges off.
     */
    edges: p.display?.edges ?? null,
    view: Array.isArray(p.camera?.view) ? p.camera.view : null,
    planeRows: readPlanes(p.planes),
    exportLengthUnit: p.export?.lengthUnit ?? 0.01,
  };
}

/** a 0..1 setting from a file, which may hold anything at all */
function clamp01(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
}
