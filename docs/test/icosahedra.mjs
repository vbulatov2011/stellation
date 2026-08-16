/*
 * The fifty-nine icosahedra are still the fifty-nine icosahedra.
 *
 *   node docs/test/icosahedra.mjs
 *
 * The documents in docs/icosahedra/ are generated, and generated files rot
 * quietly: the engine changes how it orders orbits, or how it splits cells
 * under a subgroup, and every one of the 59 becomes a different figure with
 * no error anywhere. Nothing on the page would look wrong — they would all
 * still be stellations of the icosahedron, just not the ones they claim to be.
 *
 * So each document is rebuilt here and measured against the manifest, which
 * records what it was when it was checked. Regenerating updates both at once,
 * which is the point: this catches the engine moving under files that did not.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readDocument } from '../app/js/preset.js';
import { buildStellation, facePlanes, suggestDepth, parseCellsAny,
         selectedCells, extractMesh } from '../lib/core.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(join(DOCS, 'icosahedra.json'), 'utf8'));

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const items = man.items || [];
ok(items.length === 59, `${items.length} stellations listed`);
ok(items.filter(i => !i.chiral).length === 32, 'thirty-two reflexible');
ok(items.filter(i => i.chiral).length === 27, 'twenty-seven chiral');
ok(items.every(i => !i.chiral || i.shells.includes('f₁')),
   'every chiral one takes f₁ — the only shell with two hands');
ok(items.every((i, n) => i.n === n + 1), 'numbered 1 to 59 in order');

// ------------------------------------------------------------ the arrangement

const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));
const built = new Map();
const arrangement = (stellSym) => {
  if (!built.has(stellSym)) {
    built.set(stellSym, buildStellation(poly, symmetry.Ih.matrices, {
      subMatrices: symmetry[stellSym].matrices, maxIntersection: DEPTH,
    }));
  }
  return built.get(stellSym);
};

{
  const stel = arrangement('Ih');
  const total = stel.cellLayers.reduce((n, l) => n + l.reduce((k, o) => k + o.cells.length, 0), 0);
  ok(total === 473, `the arrangement has Du Val's 473 cells (${total})`);
  ok(stel.cellLayers.length === 8, `eight shells (${stel.cellLayers.length})`);
}

// ------------------------------------------------------- each one, as recorded

{
  let files = true, reads = true, measures = true;
  for (const it of items) {
    const path = join(DOCS, it.file);
    if (!existsSync(path) || !existsSync(path + '.png')) {
      files = false; console.log(`        (missing document or thumbnail: ${it.file})`);
      continue;
    }
    let doc;
    try { doc = readDocument(readFileSync(path, 'utf8')); }
    catch (e) { reads = false; console.log(`        (${it.file}: ${e.message})`); continue; }

    const stel = arrangement(doc.stellSymmetry);
    const atoms = parseCellsAny(stel, doc.cells, doc.cellsIndexing);
    const cells = selectedCells(stel, atoms);
    const mesh = extractMesh([{ cells }], stel.pool);
    if (cells.length !== it.cells || mesh.vertices.length !== it.v || mesh.faces.length !== it.f) {
      measures = false;
      console.log(`        (${it.n} ${it.symbol}: ${cells.length}c ${mesh.vertices.length}v ` +
                  `${mesh.faces.length}f, recorded ${it.cells}c ${it.v}v ${it.f}f)`);
    }
    const wantSym = it.chiral ? 'I' : 'Ih';
    if (doc.stellSymmetry !== wantSym) {
      measures = false;
      console.log(`        (${it.n} ${it.symbol}: stellation symmetry ${doc.stellSymmetry}, want ${wantSym})`);
    }
  }
  ok(files, 'every one has its document and its thumbnail');
  ok(reads, 'every document still reads');
  ok(measures, 'every one rebuilds to the cells, vertices and faces recorded');
}

// ------------------------------------------------- the sizes the books record

{
  const KNOWN = { 2: 21, 3: 51, 8: 473, 22: 311, 26: 341 };
  const wrong = Object.entries(KNOWN).filter(([n, cells]) => items[n - 1].cells !== cells);
  ok(wrong.length === 0,
     'the five published cell counts still hold (B 21, C 51, H 473, Ef₁ 311, Ef₁g₁ 341)' +
     (wrong.length ? ` — off: ${wrong.map(([n]) => n)}` : ''));
}

// the shells a figure names are exactly the cells it holds, so the counts add up
{
  const SIZE = { a: 1, b: 20, c: 30, d: 60, 'e₁': 20, 'e₂': 60, 'f₁': 120, 'f₂': 12, 'g₁': 30, 'g₂': 60, h: 60 };
  const bad = items.filter((it) => {
    const sum = it.shells.reduce((n, s) => n + (it.chiral && s === 'f₁' ? SIZE[s] / 2 : SIZE[s]), 0);
    return sum !== it.cells;
  });
  ok(bad.length === 0, 'each one holds exactly the cells of the shells it names' +
     (bad.length ? ` — off: ${bad.map(b => b.n)}` : ''));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
