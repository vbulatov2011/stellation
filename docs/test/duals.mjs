/*
 * The duals whose vertices are at infinity.
 *
 *   node docs/test/duals.mjs
 *
 * Nine of the uniform polyhedra are hemipolyhedra: some faces pass through
 * the center, so the dual has vertices at infinity and the catalog's stored
 * geometry for it is only a truncated stand-in for drawing. These tests
 * establish both halves of the argument the feature rests on — that the
 * stored geometry is unusable for planes, and that the polars of the
 * primal's vertices are exact and build an ordinary arrangement.
 *
 * The tenth solid here, the great dirhombicosidodecahedron, is not a
 * hemipolyhedron but has the same trouble: its sixty squares pass through
 * the center too.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, facePlanes, planesFromList, polarRows, suggestDepth,
  matMul, VertexPool, v3, dot, len,
} from '../lib/core.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const catalog  = JSON.parse(readFileSync(join(DOCS, 'data', 'catalog.json'), 'utf8'));

const toPoly = (g) => {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
};

const items = catalog.flatMap(c => c.items);
const polarItems = items.filter(it => it.polar);

// ------------------------------------------------- the catalog entries

ok(polarItems.length === 10, `ten catalog solids are built from a polar (got ${polarItems.length})`);
{
  let bad = null;
  for (const it of polarItems) {
    if (!geometry[it.polar]) bad ||= `${it.file}: no geometry for its primal ${it.polar}`;
    if (!items.some(x => x.file === it.polar)) bad ||= `${it.file}: primal ${it.polar} not in the catalog`;
    const primal = items.find(x => x.file === it.polar);
    if (primal && primal.symmetry !== it.symmetry)
      bad ||= `${it.file} is ${it.symmetry} but its primal is ${primal.symmetry}`;
  }
  ok(!bad, 'every one names a catalog primal, and shares its symmetry' + (bad ? ` — ${bad}` : ''));
}

// ------------------------------------- why the stored geometry cannot serve

{
  // how far a stored vertex strays from the plane of its own face
  let worstStray = 0, crossed = 0, faces = 0;
  for (const it of polarItems) {
    const poly = toPoly(geometry[it.file]);
    for (const face of geometry[it.file].f) {
      faces++;
      let n = v3();
      for (let i = 0; i < face.length; i++) {
        const a = poly.vertices[face[i]], b = poly.vertices[face[(i + 1) % face.length]];
        n = { x: n.x + (a.y - b.y) * (a.z + b.z),
              y: n.y + (a.z - b.z) * (a.x + b.x),
              z: n.z + (a.x - b.x) * (a.y + b.y) };
      }
      const L = len(n);
      if (L < 1e-9) { crossed++; continue; }   // a crossed face: no usable normal
      n = { x: n.x / L, y: n.y / L, z: n.z / L };
      let c = v3();
      for (const i of face) c = { x: c.x + poly.vertices[i].x, y: c.y + poly.vertices[i].y, z: c.z + poly.vertices[i].z };
      c = { x: c.x / face.length, y: c.y / face.length, z: c.z / face.length };
      const d = dot(n, c);
      for (const i of face) worstStray = Math.max(worstStray, Math.abs(dot(n, poly.vertices[i]) - d));
    }
  }
  ok(crossed > 0, `${crossed} of ${faces} stored faces are crossed — no normal at all`);
  ok(worstStray > 0.1,
     `and a stored vertex misses its own face's plane by up to ${worstStray.toFixed(2)} — not a plane source`);
}

// ------------------------------------------------- the polars are exact

{
  let bad = null;
  for (const it of polarItems) {
    const primal = toPoly(geometry[it.polar]);
    const rows = polarRows(primal);
    if (rows.length !== primal.vertices.length) bad ||= `${it.file}: ${rows.length} rows for ${primal.vertices.length} vertices`;
    // every primal vertex sits ON its own polar plane's far side at distance
    // 1/|v|: n·v = |v| * (1/|v|) * |v| ... check the defining relation v·x = 1
    for (let i = 0; i < rows.length; i++) {
      const v = primal.vertices[i], r = rows[i];
      const nv = r.n[0] * v.x + r.n[1] * v.y + r.n[2] * v.z;
      if (Math.abs(nv - 1 / r.d) > 1e-9) bad ||= `${it.file}: row ${i} is not the polar of its vertex`;
      if (Math.abs(Math.hypot(...r.n) - 1) > 1e-12) bad ||= `${it.file}: row ${i} normal is not unit`;
    }
  }
  ok(!bad, 'each row is the polar of one primal vertex, unit normal' + (bad ? ` — ${bad}` : ''));

  // no central planes anywhere: a polar plane through the center would need a
  // primal vertex at infinity, which no uniform polyhedron has
  let central = 0, dropped = 0;
  for (const it of polarItems) {
    const pl = planesFromList(polarRows(toPoly(geometry[it.polar])));
    central += pl.central; dropped += pl.degenerate;
  }
  ok(central === 0 && dropped === 0,
     `no polar plane passes through the center or degenerates (${central}, ${dropped})`);
}

// ------------------------------------------- the arrangements they build

{
  for (const it of polarItems) {
    const M = symmetry[it.symmetry].matrices;
    const rows = polarRows(toPoly(geometry[it.polar]));
    const depth = suggestDepth(planesFromList(rows));
    const stel = buildStellation(null, M, { planes: rows, subMatrices: M, maxIntersection: depth });

    let bad = null;
    if (!stel.cellLayers.length) bad = 'no cells';
    for (const layer of stel.cellLayers) {
      const pool = new VertexPool(1e-6);
      const ids = new Set();
      for (const o of layer) for (const c of o.cells) ids.add(pool.intern(c.center));
      for (const o of layer) {
        if (M.length % o.cells.length !== 0)
          bad ||= `orbit of ${o.cells.length} under a group of ${M.length}`;
        for (const c of o.cells)
          for (const m of M)
            if (!ids.has(pool.intern(matMul(m, c.center)))) bad ||= 'a shell does not close';
      }
    }
    const cells = stel.cellLayers.reduce((n, l) => n + l.reduce((m, o) => m + o.cells.length, 0), 0);
    ok(!bad, `${it.file} ${it.name}: ${stel.planes.length} planes, ` +
             `${stel.cellLayers.length} shells, ${cells} cells, every shell closes` + (bad ? ` — ${bad}` : ''));
  }
}

// ------------------- how few arrangements these ten actually amount to
/*
 * A dual's planes are the polars of its primal's vertices, so two solids
 * sharing a vertex arrangement have duals sharing a plane set — and among
 * these ten that collapses hard. All six of the icosahedral ones have their
 * thirty vertices on the thirty two-fold axes, so they cut ONE arrangement
 * between them, not six. Worth pinning down: it is the reason their shell
 * and orbit counts come out identical, which would otherwise look like a
 * bug, and a wrong `polar` field would break the grouping at once.
 *
 * Every plane of a set also stands at the same distance (the primals are
 * inscribed in one sphere), so each set is fixed up to scale by its
 * directions alone — and scale changes no arrangement. That is what lets
 * these be named after classical solids below.
 */
{
  const canon = (rows) => rows.map(r => {
    let n = r.n.slice();
    const s0 = Math.abs(n[0]) > 1e-6 ? n[0] : Math.abs(n[1]) > 1e-6 ? n[1] : n[2];
    if (s0 < 0) n = n.map(v => -v);
    return n.map(v => v.toFixed(6)).join(',') + '@' + r.d.toFixed(6);
  }).sort().join('|');

  const byPlaneSet = new Map();
  for (const it of polarItems) {
    const k = canon(polarRows(toPoly(geometry[it.polar])));
    if (!byPlaneSet.has(k)) byPlaneSet.set(k, []);
    byPlaneSet.get(k).push(it.file);
  }
  const groups = [...byPlaneSet.values()].map(g => g.sort().join(' ')).sort();
  ok(groups.length === 4, `the ten cut only four distinct arrangements (got ${groups.length})`);
  const want = ['d08 d20', 'd09', 'd54 d56 d67 d70 d75 d76', 'd80'].sort();
  ok(JSON.stringify(groups) === JSON.stringify(want),
     'grouped as ' + groups.map(g => '{' + g + '}').join(' '));

  // one distance per set: the arrangement is fixed by the directions alone
  let varying = null;
  for (const it of polarItems) {
    const ds = new Set(polarRows(toPoly(geometry[it.polar])).map(r => r.d.toFixed(9)));
    if (ds.size !== 1) varying ||= `${it.file} has ${ds.size} distinct plane distances`;
  }
  ok(!varying, 'every plane of a set stands at one distance — scale is the only freedom'
     + (varying ? ` — ${varying}` : ''));

  // and the directions are those of solids already in the catalog. Matched
  // numerically, as a bijection with a tolerance: printing a direction and
  // comparing the text fails on a coordinate that rounds to a signed zero.
  const matchDirs = (A, B) => {
    if (A.length !== B.length) return false;
    const used = new Array(B.length).fill(false);
    for (const a of A) {
      let hit = -1;
      for (let j = 0; j < B.length; j++) {
        if (used[j]) continue;
        if (Math.abs(a[0] * B[j][0] + a[1] * B[j][1] + a[2] * B[j][2]) > 1 - 1e-6) { hit = j; break; }
      }
      if (hit < 0) return false;
      used[hit] = true;
    }
    return true;
  };
  const polarDirs = (file) => {
    const it = polarItems.find(x => x.file === file);
    return polarRows(toPoly(geometry[it.polar])).map(r => r.n);
  };
  const faceDirs = (file) =>
    facePlanes(toPoly(geometry[file])).map(p => [p.n.x, p.n.y, p.n.z]);
  const groupOf = (file) => {
    const it = polarItems.find(x => x.file === file);
    return byPlaneSet.get(canon(polarRows(toPoly(geometry[it.polar])))).slice().sort().join(' ');
  };

  const NAMED = [
    ['d09', 'u11', 'the cube'],
    ['d08', 'd12', 'the rhombic dodecahedron'],
    ['d54', 'd29', 'the rhombic triacontahedron'],
    ['d80', 'd69', 'the great hexagonal hexecontahedron'],
  ];
  for (const [file, ref, what] of NAMED) {
    ok(matchDirs(polarDirs(file), faceDirs(ref)),
       `{${groupOf(file)}} cuts ${what} (${ref}), to scale`);
  }
}

// ------------------------------------------------------------- verdict

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
