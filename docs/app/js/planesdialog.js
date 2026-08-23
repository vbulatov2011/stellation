/*
 * The plane-set editor — the "edit planes" dialog.
 *
 * One ROW is one plane and the symmetry group that multiplies it: a text
 * field holding exactly four numbers (normal and distance, full double
 * precision, so a row copies and pastes as plain text), a group choice, and
 * the computed orbit size. Rows with different groups combine freely — the
 * planes of an icosahedron alongside the planes of a cube — which is the
 * whole reason the group sits on the row and not on the sheet.
 *
 * The document format is untouched: rows serialize to the same
 * "nx ny nz d GROUP" lines the textarea always held (params.planes.text),
 * so every existing document round-trips. Numbers print with String(), the
 * shortest form that parses back to the identical double — never a rounded
 * decimal.
 *
 * The preview draws each plane as a spoke from the origin with a disc lying
 * IN the plane at its foot, colored by row, in a second Renderer3D that
 * shares the app's controls (drag to turn, wheel to zoom).
 */

import { Renderer3D, LAYER_COLORS, facePlanes, matMul } from '../../lib/modules.js';
import { readDocument } from './preset.js';
import { createInternalWindow } from '../../lib/uilib/modules.js';

const $ = (q) => document.querySelector(q);

export function initPlanesDialog(deps) {
  // deps: { state, toPoly, buildCustomPlanes, presets, setStatus }
  const { state } = deps;

  /*
   * The plane editor is an internal window, like every other panel here. As a
   * <dialog> it sat in the browser's top layer, where it could not be moved
   * aside to watch the preview against the figure behind it, and once
   * dismissed there was no entry anywhere to bring it back.
   */
  const win = createInternalWindow({
    title: 'Plane set', width: 'min(880px, 94vw)', height: 'min(640px, 88vh)',
    left: 'calc(50% - min(440px, 47vw))', top: '6%',
    canClose: true, canResize: true, modal: true, role: 'dialog',
    storageId: 'stell.planes',
  });
  win.wnd.classList.add('transient');
  win.interior.appendChild($('#planesBody').content.cloneNode(true));
  win.setVisible(false);

  let rows = [];               // [{ text, group, factor }]
  let preview = null;
  let previewTimer = 0;

  // ---- plane arithmetic ---------------------------------------------------

  /**
   * The plane a row describes: four finite numbers, then the factor. The
   * factor scales the distance — the plane slides along its own normal,
   * keeping its direction — so one row can be re-used at another depth
   * without retyping the normal, and the typed numbers stay exactly as
   * pasted. Returns null if the row does not read.
   */
  function parsePlane(text, factor = 1) {
    const parts = text.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 4) return null;
    const nums = parts.map(Number);
    if (nums.some(v => !Number.isFinite(v))) return null;
    const f = Number(factor);
    if (!Number.isFinite(f)) return null;
    const L = Math.hypot(nums[0], nums[1], nums[2]);
    if (L < 1e-12) return null;
    return { n: [nums[0] / L, nums[1] / L, nums[2] / L], d: nums[3] * f };
  }

  const rowPlane = (row) => parsePlane(row.text, row.factor);

  /**
   * The distinct images of one plane under one group — the row's orbit.
   * The same dedup rule the engine applies (planesFromList): same distance,
   * normals within a hair of parallel. Sign-canonical like the engine too,
   * so a mirrored image with a negated normal is the same plane.
   */
  function orbitOf(plane, group) {
    const M = state.symmetry[group]?.matrices || state.symmetry.E.matrices;
    const out = [];
    for (const m of M) {
      const v = matMul(m, { x: plane.n[0], y: plane.n[1], z: plane.n[2] });
      let n = [v.x, v.y, v.z], d = plane.d;
      if (d < 0) { n = [-n[0], -n[1], -n[2]]; d = -d; }
      if (d < 1e-9) {
        // a plane through the center: its mirror image has the negated
        // normal and IS the same plane — orient it the way the engine does,
        // or the row would count every central plane twice
        const s = Math.abs(n[0]) > 1e-6 ? n[0] : Math.abs(n[1]) > 1e-6 ? n[1] : n[2];
        if (s < 0) n = [-n[0], -n[1], -n[2]];
      }
      const dup = out.some(p => Math.abs(p.d - d) < 1e-6 &&
        p.n[0] * n[0] + p.n[1] * n[1] + p.n[2] * n[2] > 1 - 1e-7);
      if (!dup) out.push({ n, d });
    }
    return out;
  }

  /** shortest text that parses back to the identical double; -0 flattened */
  const num = (v) => String(Math.abs(v) < 5e-16 ? 0 : v);

  /**
   * A catalog solid's face planes, reduced to one row per orbit under its
   * own group — the icosahedron imports as ONE row with symmetry Ih, orbit
   * 20, not twenty rows. If the reduction does not reproduce every plane
   * (a group name the data lacks, an orientation mismatch), each plane
   * becomes its own E row instead: never wrong, merely verbose.
   */
  function reduceSolid(file, groupName) {
    const g = state.geometry[file];
    if (!g) return null;
    // central faces come along as rows — whether they join the arrangement
    // is the checkbox's decision, but the sheet must show what the solid has
    const planes = facePlanes(deps.toPoly(g), { central: true });
    if (!planes.length) return null;
    const items = planes.map(p => ({ n: [p.n.x, p.n.y, p.n.z], d: p.d }));
    const M = state.symmetry[groupName]?.matrices;
    if (M) {
      const used = new Array(items.length).fill(false);
      const out = [];
      let covered = 0;
      for (let i = 0; i < items.length; i++) {
        if (used[i]) continue;
        const orbit = orbitOf(items[i], groupName);
        for (const img of orbit) {
          for (let j = 0; j < items.length; j++) {
            if (used[j]) continue;
            if (Math.abs(items[j].d - img.d) < 1e-6 &&
                items[j].n[0] * img.n[0] + items[j].n[1] * img.n[1] + items[j].n[2] * img.n[2] > 1 - 1e-7) {
              used[j] = true; covered++;
            }
          }
        }
        out.push({ text: items[i].n.map(num).join(' ') + ' ' + num(items[i].d), group: groupName, factor: 1 });
      }
      if (covered === items.length) return out;
    }
    return items.map(it => ({ text: it.n.map(num).join(' ') + ' ' + num(it.d), group: 'E', factor: 1 }));
  }

  const itemFor = (file) => {
    for (const cat of state.catalog) for (const it of cat.items) if (it.file === file) return it;
    return null;
  };

  /**
   * The rows a saved document contributes. A document built from a plane
   * sheet hands over its sheet verbatim — groups, factors and all — and one
   * built from a catalog solid hands over that solid's planes, reduced.
   * Either way what arrives is rows, so a preset and a local file import
   * exactly like the catalog does.
   */
  function rowsFromDocument(text) {
    const doc = readDocument(text);
    if (doc.planeRows) return fromRows(doc.planeRows);
    if (doc.file && state.geometry[doc.file]) {
      // the SOLID's own symmetry, not the document's chosen subgroup: the
      // planes belong to the polyhedron, and the fullest group reduces them
      // to the fewest rows
      return reduceSolid(doc.file, itemFor(doc.file)?.symmetry || doc.polySymmetry || 'E');
    }
    return null;
  }

  // ---- the editor's rows <-> the document's rows ---------------------------

  /*
   * The document holds structured rows; the editor holds a text buffer per
   * row, because a half-typed normal is not a number triple yet. These two
   * convert between them, and `toRows` is only ever called when every row
   * reads — Build is disabled otherwise, so a malformed sheet cannot reach
   * the document.
   */
  function toRows() {
    return rows.map((r) => {
      const parts = r.text.trim().split(/[\s,]+/).filter(Boolean).map(Number);
      const out = { normal: [parts[0], parts[1], parts[2]], distance: parts[3] };
      if (r.group && r.group !== 'E') out.symmetry = r.group;
      const f = Number(r.factor);
      if (f !== 1) out.factor = f;
      return out;
    });
  }

  function fromRows(list) {
    return (list || []).map((r) => ({
      text: r.normal.map(num).join(' ') + ' ' + num(r.distance),
      group: r.symmetry || 'E',
      factor: r.factor ?? 1,
    }));
  }

  // ---- the rows -----------------------------------------------------------

  function groupOptions(selected) {
    const names = Object.keys(state.symmetry)
      .filter(n => state.symmetry[n].order > 0)
      .sort((a, b) => state.symmetry[b].order - state.symmetry[a].order || a.localeCompare(b));
    return names.map(n =>
      `<option value="${n}"${n === selected ? ' selected' : ''}>${n} · ${state.symmetry[n].order}</option>`).join('');
  }

  function render() {
    const host = $('#planesRows');
    host.innerHTML = '';
    rows.forEach((row, i) => {
      const el = document.createElement('div');
      el.className = 'plane-row';
      const c = LAYER_COLORS[i % LAYER_COLORS.length];
      const chip = `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;
      el.innerHTML =
        `<span class="plane-chip" style="background:${chip}"></span>` +
        `<input class="plane-nums mono" spellcheck="false" ` +
          `title="The plane as four numbers: normal x y z, then the distance from the origin — copy and paste it as text" ` +
          `value="${row.text.replace(/"/g, '&quot;')}">` +
        `<input class="plane-factor mono" spellcheck="false" ` +
          `title="Scale the distance by this factor — the plane slides along its own normal, keeping its direction. 1 leaves it where it was typed." ` +
          `value="${String(row.factor ?? 1).replace(/"/g, '&quot;')}">` +
        `<select class="plane-group" title="The group that multiplies this plane — the plane is added together with its whole orbit">${groupOptions(row.group)}</select>` +
        `<span class="plane-orbit" title="How many distinct planes this row contributes"></span>` +
        `<button class="plane-del" title="Remove this row">✕</button>`;
      const input = el.querySelector('.plane-nums');
      input.oninput = () => { row.text = input.value; update(false); };
      const fac = el.querySelector('.plane-factor');
      fac.oninput = () => { row.factor = fac.value; update(false); };
      /* a multi-line paste becomes multiple rows — the copy half of
         copy-and-paste already works row-wise, this is the paste half.
         Tolerant on purpose: this is the clipboard, not the file format,
         and a bad line simply makes a row that reads as bad. */
      input.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        if (!text.includes('\n')) return;
        e.preventDefault();
        const pasted = text.split('\n')
          .map(line => line.replace(/#.*$/, '').trim())
          .filter(Boolean)
          .map((line) => {
            const parts = line.split(/[\s,]+/);
            const f = parts.length > 5 ? Number(parts[5]) : 1;
            return {
              text: parts.slice(0, 4).join(' '),
              group: parts.length > 4 && state.symmetry[parts[4]] ? parts[4] : 'E',
              factor: Number.isFinite(f) ? f : 1,
            };
          });
        if (!pasted.length) return;
        row.text = pasted[0].text;
        if (state.symmetry[pasted[0].group]) row.group = pasted[0].group;
        row.factor = pasted[0].factor;
        rows.splice(i + 1, 0, ...pasted.slice(1));
        render(); update(true);
      });
      el.querySelector('.plane-group').onchange = (e) => { row.group = e.target.value; update(false); };
      el.querySelector('.plane-del').onclick = () => { rows.splice(i, 1); render(); update(true); };
      host.appendChild(el);
    });
    update(false);
  }

  /** everything derived from the rows: orbit counts, the total, the preview */
  function update(structural) {
    let total = 0, bad = 0;
    document.querySelectorAll('#planesRows .plane-row').forEach((el, i) => {
      const row = rows[i];
      const plane = rowPlane(row);
      const orbitEl = el.querySelector('.plane-orbit');
      el.classList.toggle('bad', !plane);
      if (!plane) { orbitEl.textContent = '—'; bad++; return; }
      const n = orbitOf(plane, row.group).length;
      orbitEl.textContent = String(n);
      total += n;
    });
    $('#planesTotal').textContent =
      rows.length === 0 ? 'no planes yet'
        : bad ? `${bad} row${bad > 1 ? 's' : ''} not readable — four numbers, then a factor`
        : `${rows.length} row${rows.length > 1 ? 's' : ''} → ${total} planes`;
    $('#planesBuild').disabled = bad > 0 || rows.length === 0;
    clearTimeout(previewTimer);
    previewTimer = setTimeout(drawPreview, structural ? 0 : 120);
  }

  // ---- the preview --------------------------------------------------------

  /* a spoke from the origin and a disc lying in the plane at its foot */
  function addPlaneGeometry(mesh, faceRows, ri, n, d, spokeR, discR) {
    const { vertices, faces } = mesh;
    const V = (x, y, z) => vertices.push({ x, y, z }) - 1;
    // a stable frame around n
    const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
    const ul = Math.hypot(...u); u = u.map(x => x / ul);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const c = [n[0] * d, n[1] * d, n[2] * d];
    // the spoke: an octagonal prism origin -> c
    const S = 8, ring0 = [], ring1 = [];
    for (let i = 0; i < S; i++) {
      const t = i / S * Math.PI * 2, x = Math.cos(t) * spokeR, y = Math.sin(t) * spokeR;
      const off = [u[0] * x + v[0] * y, u[1] * x + v[1] * y, u[2] * x + v[2] * y];
      ring0.push(V(off[0], off[1], off[2]));
      ring1.push(V(c[0] + off[0], c[1] + off[1], c[2] + off[2]));
    }
    for (let i = 0; i < S; i++) {
      faces.push([ring0[i], ring0[(i + 1) % S], ring1[(i + 1) % S], ring1[i]]);
      faceRows.push(ri);
    }
    // the disc: one polygon in the plane itself
    const D = 24, disc = [];
    for (let i = 0; i < D; i++) {
      const t = i / D * Math.PI * 2, x = Math.cos(t) * discR, y = Math.sin(t) * discR;
      disc.push(V(c[0] + u[0] * x + v[0] * y, c[1] + u[1] * x + v[1] * y, c[2] + u[2] * x + v[2] * y));
    }
    faces.push(disc);
    faceRows.push(ri);
  }

  function drawPreview() {
    const canvas = $('#planesPreview');
    if (!canvas) return;
    if (!preview) {
      try {
        preview = new Renderer3D(canvas);
        preview.showEdges = false;
        preview.start();
        if (window.stellation) window.stellation.planesPreview = preview;  // for the tests
      } catch { canvas.hidden = true; return; }   // no WebGL: the numbers still work
    }
    const mesh = { vertices: [], faces: [] };
    const faceRows = [];
    let maxD = 0;
    const all = [];
    rows.forEach((row, ri) => {
      const plane = rowPlane(row);
      if (!plane) return;
      for (const p of orbitOf(plane, row.group)) { all.push({ ri, p }); maxD = Math.max(maxD, p.d); }
    });
    if (!all.length) { preview.setMesh(mesh, []); return; }
    const spokeR = maxD * 0.012, discR = maxD * 0.16;
    for (const { ri, p } of all) addPlaneGeometry(mesh, faceRows, ri, p.n, p.d, spokeR, discR);
    preview.resetScale();                 // a changed set re-frames itself
    preview.setMesh(mesh, faceRows);      // row index -> the row's chip color
  }

  // ---- opening, importing, building ---------------------------------------

  function open() {
    if (state.customPlanes && state.planeRows) {
      rows = fromRows(state.planeRows);
    } else if (state.current?.file && state.geometry[state.current.file]) {
      rows = reduceSolid(state.current.file, state.current.symmetry || 'E') || [];
    } else {
      rows = [];
    }
    fillImport();
    $('#planesCentral').checked = !!state.centralPlanes;
    $('#planesInfo').textContent = '';
    render();
    win.setVisible(true);
  }

  function fillImport() {
    const sel = $('#planesImport');
    if (sel.options.length > 1) return;         // built once; the catalog is static
    for (const cat of state.catalog) {
      const og = document.createElement('optgroup');
      og.label = cat.category;
      for (const it of cat.items) {
        const o = document.createElement('option');
        o.value = it.file;
        o.textContent = `${it.name} (${it.symmetry})`;
        o.dataset.symmetry = it.symmetry;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
  }

  /* every import lands here: append rows, redraw, say what arrived */
  function importRows(imported, what) {
    if (!imported || !imported.length) {
      $('#planesInfo').textContent = `nothing to import from ${what}`;
      return;
    }
    rows.push(...imported);
    render(); update(true);
    $('#planesInfo').textContent =
      `imported ${imported.length} row${imported.length > 1 ? 's' : ''} from ${what}`;
  }

  $('#planesImport').onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;
    importRows(reduceSolid(opt.value, opt.dataset.symmetry || 'E'), opt.textContent.trim());
    e.target.selectedIndex = 0;                 // a verb, not a state
  };

  /*
   * The same three sources the New dialog offers, minus the plane editor
   * itself: a shipped preset, or a document from disk. Both arrive as
   * document text and go through rowsFromDocument, so a document holding a
   * plane sheet contributes its sheet and one holding a solid contributes
   * that solid's planes.
   */
  $('#planesFromPreset').onclick = () => {
    if (!deps.presets) return;
    deps.presets.pick((text, name) => {
      try { importRows(rowsFromDocument(text), name); }
      catch (err) { $('#planesInfo').textContent = 'could not read that preset: ' + err.message; }
    }, 'Presets — pick one to import its planes');
  };

  $('#planesFromFile').onclick = () => $('#planesFile').click();
  $('#planesFile').onchange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try { importRows(rowsFromDocument(await file.text()), file.name); }
    catch (err) { $('#planesInfo').textContent = `could not read ${file.name}: ${err.message}`; }
  };

  $('#planesAdd').onclick = () => {
    rows.push({ text: '0 0 1 1', group: 'E', factor: 1 });
    render(); update(true);
    const inputs = document.querySelectorAll('#planesRows .plane-nums');
    inputs[inputs.length - 1]?.select();
  };
  $('#planesClear').onclick = () => { rows = []; render(); update(true); };

  $('#planesBuild').onclick = async () => {
    state.centralPlanes = $('#planesCentral').checked;
    if (await deps.buildCustomPlanes(toRows())) win.setVisible(false);
  };
  $('#planesCancel').onclick = () => win.setVisible(false);
  $('#editPlanes').onclick = open;

  // the window handles go back to the app, which registers them in the
  // windows menu once the workspace exists
  return { open, isOpen: () => win.isVisible(),
           setOpen: (v) => (v ? open() : win.setVisible(false)) };
}
