/*
 * The plane-set editor — the friendly face of "make planes".
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
 * IN the plane at its foot, coloured by row, in a second Renderer3D that
 * shares the app's controls (drag to turn, wheel to zoom).
 */

import { Renderer3D, LAYER_COLORS, facePlanes, matMul } from '../../lib/modules.js';

const $ = (q) => document.querySelector(q);

export function initPlanesDialog(deps) {
  // deps: { state, toPoly, buildCustomPlanes, subgroupNames }
  const { state } = deps;
  let rows = [];               // [{ text, group }]
  let preview = null;
  let previewTimer = 0;

  // ---- plane arithmetic ---------------------------------------------------

  /** four finite numbers out of a row's text, or null */
  function parsePlane(text) {
    const parts = text.trim().split(/[\s,]+/).filter(Boolean);
    if (parts.length !== 4) return null;
    const nums = parts.map(Number);
    if (nums.some(v => !Number.isFinite(v))) return null;
    const L = Math.hypot(nums[0], nums[1], nums[2]);
    if (L < 1e-12) return null;
    return { n: [nums[0] / L, nums[1] / L, nums[2] / L], d: nums[3] };
  }

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
    const planes = facePlanes(deps.toPoly(g));
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
        out.push({ text: items[i].n.map(num).join(' ') + ' ' + num(items[i].d), group: groupName });
      }
      if (covered === items.length) return out;
    }
    return items.map(it => ({ text: it.n.map(num).join(' ') + ' ' + num(it.d), group: 'E' }));
  }

  // ---- serialization (the document's planesText, unchanged format) --------

  function toText() {
    return '# one plane per line: nx ny nz d [group to multiply it by]\n' +
           rows.map(r => `${r.text.trim()} ${r.group}`).join('\n');
  }

  function fromText(text) {
    const out = [];
    for (const line of text.split('\n')) {
      const s = line.replace(/#.*$/, '').trim();
      if (!s) continue;
      const parts = s.split(/[\s,]+/);
      const group = parts.length > 4 && state.symmetry[parts[4]] ? parts[4] : 'E';
      out.push({ text: parts.slice(0, 4).join(' '), group });
    }
    return out;
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
        `<select class="plane-group" title="The group that multiplies this plane — the plane is added together with its whole orbit">${groupOptions(row.group)}</select>` +
        `<span class="plane-orbit" title="How many distinct planes this row contributes"></span>` +
        `<button class="plane-del" title="Remove this row">✕</button>`;
      const input = el.querySelector('.plane-nums');
      input.oninput = () => { row.text = input.value; update(false); };
      /* a multi-line paste becomes multiple rows — the copy half of
         copy-and-paste already works row-wise, this is the paste half */
      input.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        if (!text.includes('\n')) return;
        e.preventDefault();
        const pasted = fromText(text);
        if (!pasted.length) return;
        row.text = pasted[0].text;
        if (state.symmetry[pasted[0].group]) row.group = pasted[0].group;
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
      const plane = parsePlane(row.text);
      const orbitEl = el.querySelector('.plane-orbit');
      el.classList.toggle('bad', !plane);
      if (!plane) { orbitEl.textContent = '—'; bad++; return; }
      const n = orbitOf(plane, row.group).length;
      orbitEl.textContent = String(n);
      total += n;
    });
    $('#planesTotal').textContent =
      rows.length === 0 ? 'no planes yet'
        : bad ? `${bad} row${bad > 1 ? 's' : ''} not readable — four numbers: nx ny nz d`
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
      const plane = parsePlane(row.text);
      if (!plane) return;
      for (const p of orbitOf(plane, row.group)) { all.push({ ri, p }); maxD = Math.max(maxD, p.d); }
    });
    if (!all.length) { preview.setMesh(mesh, []); return; }
    const spokeR = maxD * 0.012, discR = maxD * 0.16;
    for (const { ri, p } of all) addPlaneGeometry(mesh, faceRows, ri, p.n, p.d, spokeR, discR);
    preview.resetScale();                 // a changed set re-frames itself
    preview.setMesh(mesh, faceRows);      // row index -> the row's chip colour
  }

  // ---- opening, importing, building ---------------------------------------

  function open() {
    if (state.customPlanes && state.planesText) {
      rows = fromText(state.planesText);
    } else if (state.current?.file && state.geometry[state.current.file]) {
      rows = reduceSolid(state.current.file, state.current.symmetry || 'E') || [];
    } else {
      rows = [];
    }
    fillImport();
    $('#planesInfo').textContent = '';
    render();
    $('#planesDialog').showModal();
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

  $('#planesImport').onchange = (e) => {
    const opt = e.target.selectedOptions[0];
    if (!opt?.value) return;
    const imported = reduceSolid(opt.value, opt.dataset.symmetry || 'E');
    if (imported) { rows.push(...imported); render(); update(true); }
    e.target.selectedIndex = 0;                 // a verb, not a state
  };

  $('#planesAdd').onclick = () => {
    rows.push({ text: '0 0 1 1', group: 'E' });
    render(); update(true);
    const inputs = document.querySelectorAll('#planesRows .plane-nums');
    inputs[inputs.length - 1]?.select();
  };
  $('#planesClear').onclick = () => { rows = []; render(); update(true); };

  $('#planesBuild').onclick = async () => {
    if (await deps.buildCustomPlanes(toText())) $('#planesDialog').close();
  };
  $('#planesCancel').onclick = () => $('#planesDialog').close();
  $('#makePlanes').onclick = open;

  return { open };
}
