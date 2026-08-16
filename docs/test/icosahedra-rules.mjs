/*
 * The seven rule sets still say what the printout said.
 *
 *   node docs/test/icosahedra-rules.mjs
 *
 * These lists are transcribed data, and the whole value of them is that they
 * are somebody else's answer: if our figures quietly stopped matching their
 * codes, the pages would still look like seven interesting lists and would no
 * longer be evidence of anything.
 *
 * So the codes are the thing checked. Each is decoded to cells independently
 * of the generator, and the figure it names is rebuilt and measured. The
 * relations between the lists are checked too — a list with stricter rules
 * must be contained in the list with looser ones, which is a property of what
 * the rules mean rather than of any one transcription, and would catch a
 * mis-typed row that all the per-figure checks would pass.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readDocument } from '../app/js/preset.js';
import { buildStellation, facePlanes, suggestDepth, parseCellsAny,
         selectedCells, extractMesh } from '../lib/core.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const man = JSON.parse(readFileSync(join(DOCS, 'icosahedra-rules.json'), 'utf8'));
const raw = JSON.parse(readFileSync(join(DOCS, 'tools', 'steelpillow-lists.json'), 'utf8'));

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const BITS = [[1,'a'],[2,'b'],[4,'c'],[8,'d'],[16,'e1'],[32,'e2'],
              [64,'f1d'],[128,'f1l'],[256,'f2'],[512,'g1'],[1024,'g2'],[2048,'h']];
const SIZE = { a:1, b:20, c:30, d:60, e1:20, e2:60, f1d:60, f1l:60, f2:12, g1:30, g2:60, h:60 };

ok(man.sets.length === 7, `${man.sets.length} rule sets`);

// every set holds as many figures as the printout tallied
{
  const bad = man.sets.filter(s => s.codes.length !== s.tally).map(s => s.slug);
  ok(bad.length === 0, 'each list holds as many figures as its printed tally' +
     (bad.length ? ` — off: ${bad}` : ''));
}

// the transcription still says what the manifest was built from
{
  let same = true;
  for (const s of raw.sets) {
    const mine = man.sets.find(m => m.slug === s.slug);
    const codes = [...s.entries.split(' ').map(t => +t.split('=')[0]),
                   ...(s.reconstructed || [])].sort((a, b) => a - b);
    if (!mine || String(codes) !== String([...mine.codes].sort((a, b) => a - b))) {
      same = false; console.log(`        (${s.slug}: manifest and transcription differ)`);
    }
  }
  ok(same, 'every list matches the transcription it was generated from');
}

/*
 * Stricter rules cannot admit what looser rules reject. Each pair here is one
 * list whose conditions are a superset of another's, so the first must sit
 * inside the second.
 */
{
  const by = Object.fromEntries(man.sets.map(s => [s.slug, new Set(s.codes)]));
  const pairs = [
    ['faces-subset', 'the-59'], ['edges-subset', 'the-59'], ['faces-edges-subset', 'the-59'],
    ['faces-subset', 'faces'], ['edges-subset', 'edges'], ['faces-edges-subset', 'faces-edges'],
    ['faces-edges-subset', 'faces-subset'], ['faces-edges-subset', 'edges-subset'],
    ['faces-edges', 'faces'], ['faces-edges', 'edges'],
  ];
  const broken = pairs.filter(([i, o]) => [...by[i]].some(c => !by[o].has(c)));
  ok(broken.length === 0, 'every stricter list sits inside its looser one' +
     (broken.length ? ` — broken: ${broken.map(p => p.join('⊄'))}` : ''));
}

// ------------------------------------------------------------- each figure

const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));
const built = new Map();
const arrangement = (sym) => {
  if (!built.has(sym)) {
    built.set(sym, buildStellation(poly, symmetry.Ih.matrices, {
      subMatrices: symmetry[sym].matrices, maxIntersection: DEPTH }));
  }
  return built.get(sym);
};

{
  const figs = Object.values(man.figures);
  ok(figs.length === 84, `${figs.length} distinct figures across the seven lists`);

  let files = true, holds = true, hands = true;
  for (const f of figs) {
    const path = join(DOCS, f.file);
    if (!existsSync(path) || !existsSync(path + '.png')) {
      files = false; console.log(`        (missing: ${f.file})`); continue;
    }
    const doc = readDocument(readFileSync(path, 'utf8'));
    const stel = arrangement(doc.stellSymmetry);
    const cells = selectedCells(stel, parseCellsAny(stel, doc.cells, doc.cellsIndexing));
    const mesh = extractMesh([{ cells }], stel.pool);

    // the code says which cells; the figure must hold exactly those
    const want = BITS.filter(([b]) => f.code & b).reduce((n, [, name]) => n + SIZE[name], 0);
    if (cells.length !== want || cells.length !== f.cells || mesh.faces.length !== f.f) {
      holds = false;
      console.log(`        (${f.code} ${f.symbol}: ${cells.length} cells and ${mesh.faces.length} faces, ` +
                  `code names ${want}, manifest records ${f.cells}/${f.f})`);
    }
    // one hand of f₁ means the rotation group; both hands, or none, means the full group
    const oneHand = (f.code & 192) === 64 || (f.code & 192) === 128;
    if (oneHand !== f.chiral || doc.stellSymmetry !== (oneHand ? 'I' : 'Ih')) {
      hands = false;
      console.log(`        (${f.code} ${f.symbol}: chirality and symmetry disagree with the code)`);
    }
  }
  ok(files, 'every figure has its document and its thumbnail');
  ok(holds, 'every figure holds exactly the cells its code names');
  ok(hands, 'a single hand of f₁ is built under the rotations, both hands under the full group');
}

// a figure named by several lists is one document, not several
{
  const seen = new Map();
  for (const s of man.sets) for (const c of s.codes) {
    seen.set(c, (seen.get(c) || 0) + 1);
  }
  const shared = [...seen.values()].filter(n => n > 1).length;
  const files = new Set(Object.values(man.figures).map(f => f.file));
  ok(files.size === Object.keys(man.figures).length,
     `${shared} figures appear in more than one list, and each is still one document`);
}

// the pages exist and name their set
{
  let pages = true;
  for (const s of man.sets) {
    const p = join(DOCS, `icosa-${s.slug}.html`);
    if (!existsSync(p)) { pages = false; console.log(`        (no page: icosa-${s.slug}.html)`); continue; }
    const html = readFileSync(p, 'utf8');
    if (!html.includes(`data-set="${s.slug}"`)) {
      pages = false; console.log(`        (icosa-${s.slug}.html does not name its set)`);
    }
    for (const rule of s.rules) {
      if (!html.includes(rule)) {
        pages = false; console.log(`        (icosa-${s.slug}.html omits the rule "${rule}")`);
      }
    }
  }
  ok(pages, 'every list has a page that names it and prints its rules');
  ok(existsSync(join(DOCS, 'icosa-rules.html')), 'the seven are collected on one index page');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
