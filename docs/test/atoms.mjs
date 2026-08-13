/*
 * The atomic selection model: identity, regrouping, serialization.
 *
 *   node docs/test/atoms.mjs
 *
 * The model rests on one claim: a primitive cell's (layer, orbit, member)
 * triple names the same piece of space under EVERY stellation symmetry,
 * because nothing before makeSubCells ever consults it. These tests hold the
 * claim down:
 *
 *   1. stability   — builds differing only in stellation symmetry produce
 *                    identical orbit structure and per-atom centers
 *   2. regroup     — regroupSubCells changes the grouping in place, and the
 *                    mesh of a fixed atom set is IDENTICAL before and after
 *   3. closure     — every sub-cell is closed under its group: mapping any
 *                    member's center by any matrix lands inside the sub
 *   4. round trips — aligned atom selections format byte-identically to the
 *                    legacy formatCells; unaligned ones survive c{…} parse;
 *                    legacy strings expand to the same atoms either way
 *   5. under E     — formatCellsUnder(E) writes a legacy-notation string
 *                    that a genuine E build parses back to the same atoms
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, extractMesh, matMul,
  atomKey, atomKeyOf, regroupSubCells, selectedCells, subKeysToAtoms,
  atomsAsSubKeys, formatCellsAtoms, parseCellsAny, formatCellsUnder,
  formatCells, parseCells, selKey, selectedSubCells,
} from '../lib/modules.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const geometry = JSON.parse(readFileSync(join(DATA, 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));

function loadPoly(key) {
  const g = geometry[key];
  if (!g) throw new Error('no such polyhedron: ' + key);
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
}

const build = (poly, polySym, stellSym, maxLayer = 5) =>
  buildStellation(loadPoly(poly), symmetry[polySym].matrices,
                  { subMatrices: stellSym ? symmetry[stellSym].matrices : null, maxLayer });

/*
 * Same containment test the app runs (app.js subgroupsOf): a named group is a
 * subgroup only if its matrices are literally inside the parent's — names lie
 * about axis orientation (the json's C5 spins about z; an icosahedron's C5
 * axes need not). Tests must pick editing groups the app would actually offer.
 */
const mKey = (m) => m.map(v => Math.round(v * 1e4) / 1e4 + 0).join(',');
function isSubgroup(sub, parent) {
  const inParent = new Set(symmetry[parent].matrices.map(mKey));
  return symmetry[sub].matrices.every(m => inParent.has(mKey(m)));
}
function properSubgroups(parent) {
  return Object.keys(symmetry)
    .filter(n => symmetry[n].order > 1 && symmetry[n].order < symmetry[parent].order
                 && isSubgroup(n, parent))
    .sort((a, b) => symmetry[b].order - symmetry[a].order);
}

/** a printable fingerprint of the symmetry-independent structure */
function structure(stel) {
  return stel.cellLayers.map(layer =>
    layer.map(o => o.cells.map(c =>
      `${c.center.x.toFixed(9)},${c.center.y.toFixed(9)},${c.center.z.toFixed(9)}`).join('|'))
      .join(' / ')).join('\n');
}

const meshPrint = (mesh) => JSON.stringify({
  v: mesh.vertices.map(v => [v.x, v.y, v.z]),
  f: mesh.faces,
});

// ---------------------------------------------------------------- 1. stability

console.log('1. atom identity is stable across stellation symmetries');
for (const [poly, polySym, subs] of [['u22', 'Ih', ['I', 'C5', 'E']],
                                     ['u27', 'Ih', ['I', 'Th', 'E']],
                                     ['u07', 'Td', ['T', 'C3', 'E']]]) {
  const prints = subs.map(s => structure(build(poly, polySym, s)));
  ok(prints.every(p => p === prints[0]),
     `${poly} ${polySym}: identical orbits and member order under {${subs.join(', ')}}`);
}

// every orbit's subCells partition its members exactly
{
  const stel = build('u22', 'Ih', 'I');
  let good = true;
  for (const layer of stel.cellLayers) {
    for (const o of layer) {
      const seen = new Set();
      for (const s of o.subCells) for (const c of s.cells) {
        if (seen.has(c) || c.orbit !== o) good = false;
        seen.add(c);
      }
      if (seen.size !== o.cells.length) good = false;
    }
  }
  ok(good, 'u22 Ih/I: subCells partition each orbit, backlinks consistent');
}

// ---------------------------------------------------------------- 2. regroup

console.log('2. regroupSubCells preserves the mesh of a fixed atom set');
{
  const stel = build('u22', 'Ih', 'I');
  // a deliberately asymmetric selection: layers 0-1 whole, then one atom of
  // the biggest orbit of layer 2
  const atoms = new Set();
  stel.cellLayers.slice(0, 2).forEach((layer, l) =>
    layer.forEach((o, c) => o.cells.forEach((_, m) => atoms.add(atomKey(l, c, m)))));
  const big = stel.cellLayers[2].reduce((a, b) => (a.cells.length >= b.cells.length ? a : b));
  atoms.add(atomKeyOf(big.cells[0]));

  const meshOf = () => meshPrint(extractMesh([{ cells: selectedCells(stel, atoms) }], stel.pool));
  const before = meshOf();
  const subCountI = stel.cellLayers.map(l => l.reduce((s, o) => s + o.subCells.length, 0)).join(',');

  const mid = properSubgroups('Ih').find(n => symmetry[n].order > 2 && symmetry[n].order < 60);
  regroupSubCells(stel, symmetry[mid].matrices);
  ok(meshOf() === before, `u22: mesh identical after regroup I -> ${mid}`);
  regroupSubCells(stel, symmetry.E.matrices);
  ok(meshOf() === before, `u22: mesh identical after regroup ${mid} -> E`);
  // under E each sub is one atom
  ok(stel.cellLayers.every(l => l.every(o => o.subCells.every(s => s.cells.length === 1))),
     'u22: E splits every orbit into single atoms');
  regroupSubCells(stel, symmetry.I.matrices);
  ok(meshOf() === before, 'u22: mesh identical after regroup E -> I');
  const subCountBack = stel.cellLayers.map(l => l.reduce((s, o) => s + o.subCells.length, 0)).join(',');
  ok(subCountBack === subCountI, 'u22: regrouping back restores the I sub-cell counts');
  // owner backlinks and support graph reference only current subs
  let owners = true, graph = true;
  const current = new Set();
  for (const l of stel.cellLayers) for (const o of l) for (const s of o.subCells) current.add(s);
  for (const l of stel.cellLayers) for (const o of l) for (const c of o.cells)
    if (!current.has(c.owner)) owners = false;
  for (const s of current) {
    for (const t of s.top) if (!current.has(t)) graph = false;
    for (const b of s.bottom) if (!current.has(b)) graph = false;
  }
  ok(owners, 'u22: every atom owner is a current sub-cell');
  ok(graph, 'u22: support graph references only current sub-cells');
}

// ---------------------------------------------------------------- 3. closure

console.log('3. every sub-cell is closed under its group');
{
  // a genuine mid-sized subgroup of Ih, as the app would offer it
  const g = properSubgroups('Ih').find(n => symmetry[n].order > 2 && symmetry[n].order < 60);
  ok(!!g, `found a proper mid-sized subgroup of Ih to test with (${g})`);
  const stel = build('u22', 'Ih', g);
  const M = symmetry[g].matrices;
  let closed = true;
  for (const layer of stel.cellLayers) {
    for (const o of layer) {
      for (const s of o.subCells) {
        const centers = s.cells.map(c => c.center);
        for (const c of s.cells) {
          for (const m of M) {
            const t = matMul(m, c.center);
            if (!centers.some(x => Math.hypot(x.x - t.x, x.y - t.y, x.z - t.z) < 1e-6)) closed = false;
          }
        }
      }
    }
  }
  ok(closed, `u22 Ih/${g}: mapping any member by any group matrix stays inside its sub`);
}

// ---------------------------------------------------------------- 4. round trips

console.log('4. serialization round trips');
{
  const stel = build('u22', 'Ih', 'I');

  // aligned: full layers plus one whole sub-cell
  const subKeys = new Set();
  stel.cellLayers.slice(0, 2).forEach((layer, l) =>
    layer.forEach((o, c) => o.subCells.forEach(s => subKeys.add(selKey(l, c, s.index)))));
  const someOrbit = stel.cellLayers[3][0];
  subKeys.add(selKey(3, 0, someOrbit.subCells[0].index));
  const atoms = subKeysToAtoms(stel, subKeys);

  const { text, aligned } = formatCellsAtoms(stel, atoms);
  ok(aligned, 'aligned selection detected as aligned');
  ok(text === formatCells(stel, subKeys), 'aligned text is byte-identical to legacy formatCells');
  const backAtoms = parseCellsAny(stel, text);
  ok(backAtoms.size === atoms.size && [...atoms].every(k => backAtoms.has(k)),
     'legacy text parses back to the same atoms');

  // legacy parse equivalence: old parse + expand === new parse
  const legacy = subKeysToAtoms(stel, parseCells(stel, text));
  ok(legacy.size === atoms.size && [...atoms].every(k => legacy.has(k)),
     'parseCells + expansion agrees with parseCellsAny');

  // unaligned: drop one atom out of a multi-cell sub
  const bigSub = (() => {
    for (const l of stel.cellLayers) for (const o of l)
      for (const s of o.subCells) if (s.cells.length > 1 && [...atoms].some(k => k === atomKeyOf(s.cells[0]))) return s;
    return null;
  })();
  const holed = new Set(atoms);
  holed.delete(atomKeyOf(bigSub.cells[0]));
  const un = formatCellsAtoms(stel, holed);
  ok(!un.aligned && un.text.startsWith('c{'), 'unaligned selection writes the c{…} member form');
  ok(atomsAsSubKeys(stel, holed) === null, 'alignment test rejects the holed selection');
  const holedBack = parseCellsAny(stel, un.text);
  ok(holedBack.size === holed.size && [...holed].every(k => holedBack.has(k)),
     'member form round-trips the unaligned selection');
  const holedBack2 = parseCellsAny(stel, un.text.slice(1), 'cells');   // no prefix, explicit indexing
  ok(holedBack2.size === holed.size && [...holed].every(k => holedBack2.has(k)),
     'indexing="cells" reads the member form without the prefix');

  // the unaligned mesh differs from the aligned one (the hole is real)
  const m1 = meshPrint(extractMesh([{ cells: selectedCells(stel, atoms) }], stel.pool));
  const m2 = meshPrint(extractMesh([{ cells: selectedCells(stel, holed) }], stel.pool));
  ok(m1 !== m2, 'the dropped atom changes the mesh');

  // 5. formatCellsUnder(E): legacy notation an E build understands
  console.log('5. transient export under E');
  const eText = formatCellsUnder(stel, holed, symmetry.E.matrices);
  ok(typeof eText === 'string' && !eText.startsWith('c'),
     'unaligned selection exports as plain legacy notation under E');
  const eStel = build('u22', 'Ih', 'E');
  const eAtoms = subKeysToAtoms(eStel, parseCells(eStel, eText));
  ok(eAtoms.size === holed.size && [...holed].every(k => eAtoms.has(k)),
     'a genuine E build parses the export back to the same atoms');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
