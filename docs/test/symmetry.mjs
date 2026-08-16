/*
 * The symmetry data is sound, and complete for the solids we ship.
 *
 *   node docs/test/symmetry.mjs
 *
 * Two things are checked. First that every named group IS a group: closed
 * under multiplication, containing the identity and an inverse for each
 * element, with `order` telling the truth. Second — the reason this file
 * exists — that for every symmetry the catalog uses, EVERY subgroup of it is
 * reachable under some name.
 *
 * That second one is not automatic. A named group is stored in one fixed
 * orientation, and the app offers it as a stellation symmetry only when its
 * matrices are literally inside the parent's. D3d is a subgroup of Ih — a
 * triangular antiprism sits inside an icosahedron — but the stored D3d has
 * its 3-fold axis along z, where the icosahedron's run along body diagonals,
 * so it was invisible. Groups in the parent's own frame carry the frame in
 * brackets: D3d(I), C5(I), S6(O).
 *
 * Subgroups are found by cyclic extension — close each known subgroup with
 * one more element, to a fixpoint — which finds all of them. Closing over
 * pairs of generators would miss any group needing three, and D2h ⊂ Ih needs
 * three. They are named by signature: order plus the multiset of
 * (determinant, trace), both unchanged by conjugation, so a subgroup is
 * named for whichever stored group it is a rotated copy of.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const S = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(DATA, 'catalog.json'), 'utf8'));

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
}

const R4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
const key = (m) => m.map(R4).join(',');
const mul = (a, b) => {
  const o = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return o;
};
const det = (m) => m[0] * (m[4] * m[8] - m[5] * m[7])
                 - m[1] * (m[3] * m[8] - m[5] * m[6])
                 + m[2] * (m[3] * m[7] - m[4] * m[6]);
const trace = (m) => m[0] + m[4] + m[8];
const sig = (ms) => ms.length + '|' + ms.map(m => `${R4(det(m))}:${R4(trace(m))}`).sort().join(' ');
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1];

// ---------------------------------------------------------------- real groups

console.log('1. every named group is a group');
{
  const names = Object.keys(S);
  let closed = true, ident = true, counted = true, orthogonal = true, distinct = true;
  for (const n of names) {
    const ms = S[n].matrices;
    if (!ms?.length) continue;
    if (S[n].order !== ms.length) { counted = false; console.log(`        (${n}: order ${S[n].order} vs ${ms.length} matrices)`); }
    const set = new Set(ms.map(key));
    if (set.size !== ms.length) { distinct = false; console.log(`        (${n}: repeated matrices)`); }
    if (!set.has(key(ID))) { ident = false; console.log(`        (${n}: no identity)`); }
    for (const a of ms) {
      // orthogonal with determinant ±1 — a point-group operation
      const d = Math.abs(det(a));
      if (Math.abs(d - 1) > 1e-9) { orthogonal = false; console.log(`        (${n}: |det| = ${d})`); break; }
      for (const b of ms) if (!set.has(key(mul(a, b)))) {
        closed = false; console.log(`        (${n}: not closed)`); break;
      }
    }
  }
  ok(names.length > 90, `${names.length} named groups`);
  ok(counted, 'every group\'s `order` matches its matrix count');
  ok(distinct, 'no group repeats a matrix');
  ok(ident, 'every group contains the identity');
  ok(orthogonal, 'every matrix is a rotation or a reflection');
  ok(closed, 'every group is closed under multiplication');
}

// ------------------------------------------------------- the subgroup lattice

/** every subgroup of `parent`, as index lists, by cyclic extension */
function subgroupTypes(parent) {
  const n = parent.length;
  const index = new Map(parent.map((m, i) => [key(m), i]));
  const T = new Int32Array(n * n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    T[i * n + j] = index.get(key(mul(parent[i], parent[j])));
  const id = index.get(key(ID));
  const closure = (members, extra) => {
    const have = new Uint8Array(n), list = [];
    const add = (x) => { if (!have[x]) { have[x] = 1; list.push(x); } };
    add(id); for (const m of members) add(m); add(extra);
    for (let a = 0; a < list.length; a++)
      for (let b = 0; b < list.length; b++) add(T[list[a] * n + list[b]]);
    return list.sort((x, y) => x - y);
  };
  const subs = new Map([[String(id), [id]]]);
  let frontier = [[id]];
  while (frontier.length) {
    const next = [];
    for (const H of frontier) {
      const has = new Uint8Array(n);
      for (const h of H) has[h] = 1;
      for (let p = 0; p < n; p++) {
        if (has[p]) continue;
        const K = closure(H, p), k = K.join(',');
        if (!subs.has(k)) { subs.set(k, K); next.push(K); }
      }
    }
    frontier = next;
  }
  const types = new Map();
  for (const idx of subs.values()) {
    const ms = idx.map(i => parent[i]);
    const s = sig(ms);
    if (!types.has(s)) types.set(s, { ms, count: 0 });
    types.get(s).count++;
  }
  return { types, total: subs.size };
}

console.log('\n2. every subgroup of every catalog symmetry is reachable');
{
  const parents = [...new Set(catalog.flatMap(c => c.items.map(i => i.symmetry)))].sort();
  console.log(`   (the catalog uses ${parents.join(', ')})`);
  for (const p of parents) {
    if (!S[p]?.matrices?.length) { ok(false, `${p} is in the data`); continue; }
    const parent = S[p].matrices;
    const universe = new Set(parent.map(key));
    const reachable = Object.keys(S).filter(n =>
      S[n].matrices?.length && S[n].matrices.every(m => universe.has(key(m))));
    const bySig = new Map();
    for (const n of reachable) bySig.set(sig(S[n].matrices), n);
    const { types, total } = subgroupTypes(parent);
    const missing = [...types.keys()].filter(s => !bySig.has(s));
    ok(missing.length === 0,
       `${p}: ${total} subgroups, ${types.size} types, ${reachable.length} names offered` +
       (missing.length ? ` — ${missing.length} unreachable` : ''));
  }
}

// the specific gap that prompted all this
console.log('\n3. the antiprism inside the icosahedron');
{
  const universe = new Set(S.Ih.matrices.map(key));
  const inIh = (n) => S[n]?.matrices?.length && S[n].matrices.every(m => universe.has(key(m)));
  ok(inIh('D3d(I)'), 'D3d(I) is a subgroup of Ih');
  ok(S['D3d(I)'].order === 12, 'D3d has order 12');
  ok(!inIh('D3d'), 'the canonical D3d is NOT — it is stored about z, hence the (I) copy');
  for (const n of ['C5(I)', 'D5(I)', 'D5d(I)', 'S10(I)', 'C5v(I)', 'D3(I)', 'C3v(I)']) {
    ok(inIh(n), `${n} is a subgroup of Ih`);
  }
  ok(inIh('S6(O)'), 'S6 needs no (I) copy — S6(O) is already inside Ih');
}

/*
 * Every copy of a group inside a parent is an equally good subgroup, so which
 * one is stored is a choice — and it should be the one that lines up with the
 * frames already in use, or switching between two symmetries spins the model's
 * axes for no reason.
 */
console.log('\n4. the icosahedral frames line up with the cubic ones');
{
  /** the axis of the highest-order proper rotation, sign-canonicalised */
  const principal = (ms) => {
    let best = null, bo = 0;
    for (const m of ms) {
      if (det(m) < 0) continue;
      const ang = Math.acos(Math.max(-1, Math.min(1, (trace(m) - 1) / 2)));
      if (ang < 1e-6) continue;
      const k = Math.round(2 * Math.PI / ang);
      if (k > bo) { bo = k; best = [m[7] - m[5], m[2] - m[6], m[3] - m[1]]; }
    }
    const L = Math.hypot(...best) || 1;
    let v = best.map(x => x / L);
    if (v[0] < -1e-9 || (Math.abs(v[0]) < 1e-9 && (v[1] < -1e-9 ||
        (Math.abs(v[1]) < 1e-9 && v[2] < 0)))) v = v.map(x => -x);
    return v;
  };
  const along = (a, b) => Math.abs(Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2]) - 1) < 1e-6;
  const diag = [1, 1, 1].map(v => v / Math.sqrt(3));

  // the cube diagonal IS a 3-fold axis of the icosahedron — which is why the
  // cubic-frame C3 and S6 fit inside Ih at all
  for (const n of ['C3(O)', 'S6(O)', 'D3d(O)', 'D3d(I)', 'D3(I)', 'C3v(I)']) {
    ok(along(principal(S[n].matrices), diag), `${n} turns about the cube diagonal`);
  }
  // and the five-fold family shares one icosahedral axis between them
  const five = ['C5(I)', 'D5(I)', 'D5d(I)', 'C5v(I)', 'S10(I)'];
  const ax = principal(S[five[0]].matrices);
  ok(five.every(n => along(principal(S[n].matrices), ax)),
     `the five-fold groups share one axis (${ax.map(v => +v.toFixed(4))})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
