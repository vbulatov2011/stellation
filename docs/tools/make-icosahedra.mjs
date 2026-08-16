/*
 * Write the fifty-nine stellations of the icosahedron.
 *
 *   node docs/tools/make-icosahedra.mjs [--dry-run]
 *
 * One document per stellation into docs/icosahedra/, plus the manifest the
 * gallery page reads. Generated rather than hand-built, because the 59 are a
 * closed mathematical list and each one is a mechanical consequence of its Du
 * Val symbol: writing them by hand would be 59 chances to fumble a cell.
 *
 * ---------------------------------------------------------------- the symbols
 *
 * Du Val (in Coxeter, Du Val, Flather and Petrie, The Fifty-Nine Icosahedra,
 * 1938) names the shells outward from the core as a, b, c, … h. Three of them
 * hold two kinds of cell, so those split: e into e₁ and e₂, f into f₁ and f₂,
 * g into g₁ and g₂. A symbol lists exactly the cells the figure is made of,
 * with one abbreviation: a figure holding a complete shell and everything
 * inside it is named after that outer shell, capitalised, and the inner ones
 * are not written. So De₁ is a + b + c + d + e₁, and H is everything.
 *
 * f₁ is the only shell whose cells come in mirror-image hands — 120 of them,
 * 60 of each. Taking both gives a reflexible figure; taking one gives a chiral
 * one, and its mirror image is not counted separately. That is the whole of
 * the difference between the two halves of the list: 1–32 are reflexible, and
 * 33–59 are the same constructions with a single hand of f₁, which is why
 * every one of them has f₁ in its symbol.
 *
 * The engine needs no special support for this. Under the full group I_h the
 * 120 f₁ cells are one orbit; under the rotations I alone that orbit splits in
 * two, one sub-cell per hand — so a chiral stellation is just a selection made
 * with the stellation symmetry set to I. Both halves of the list come out as
 * ordinary whole-orbit selections, and every document here is format release 1.
 *
 * ------------------------------------------------------------- what is checked
 *
 * The shells are identified with our orbits by the map in app.js, and that
 * identification is checked here before anything is written: the eleven orbits
 * must have exactly Du Val's cell counts (1, 20, 30, 60, 20, 60, 12, 120, 30,
 * 60, 60 — 473 in all), f₁ and only f₁ must split in two under I, and the five
 * stellations whose sizes are recorded in the literature must come out at
 * those sizes. A run that cannot confirm all of that writes nothing.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, formatCellsAtoms,
         parseCellsAny, selectedCells, extractMesh, atomKey,
         createDiagram, diagramFaces } from '../lib/core.js';
import { diagramSVG } from '../lib/diagramsvg.js';
import { writePreset } from '../app/js/preset.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DOCS, 'icosahedra');
const MANIFEST = join(DOCS, 'icosahedra.json');
const dryRun = process.argv.includes('--dry-run');

/* fitted cameras — see the header of that file for how they were arrived at */
const VIEWS = JSON.parse(
  readFileSync(join(DOCS, 'tools', 'icosahedra-views.json'), 'utf8')).views;

const die = (m) => { console.error('make-icosahedra: ' + m); process.exit(1); };

// ------------------------------------------------------------------ the solid

const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
if (!g) die('no u27 (icosahedron) in the geometry catalog');
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));

const build = (sub) => buildStellation(poly, symmetry.Ih.matrices,
                                       { subMatrices: sub, maxIntersection: DEPTH });
const REFLEXIBLE = build(symmetry.Ih.matrices);   // 1–32 live here
const CHIRAL = build(symmetry.I.matrices);        // 33–59 here

/* our (layer, orbit) pairs, as Du Val's letters — the map app.js uses */
const SHELL = {
  a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0],
  e1: [4, 0], e2: [4, 1], f2: [5, 0], f1: [5, 1],
  g1: [6, 0], g2: [6, 1], h: [7, 0],
};
/* shells inward of each capital, in order — what a capital abbreviates */
const INSIDE = {
  A: ['a'],
  B: ['a', 'b'],
  C: ['a', 'b', 'c'],
  D: ['a', 'b', 'c', 'd'],
  E: ['a', 'b', 'c', 'd', 'e1', 'e2'],
  F: ['a', 'b', 'c', 'd', 'e1', 'e2', 'f1', 'f2'],
  G: ['a', 'b', 'c', 'd', 'e1', 'e2', 'f1', 'f2', 'g1', 'g2'],
  H: ['a', 'b', 'c', 'd', 'e1', 'e2', 'f1', 'f2', 'g1', 'g2', 'h'],
};
const DU_VAL_SIZES = { a: 1, b: 20, c: 30, d: 60, e1: 20, e2: 60, f1: 120, f2: 12, g1: 30, g2: 60, h: 60 };

// -------------------------------------------------------- is this our figure?

function checkShells() {
  const trouble = [];
  let total = 0;
  for (const [name, [li, oi]] of Object.entries(SHELL)) {
    const orbit = REFLEXIBLE.cellLayers[li]?.[oi];
    if (!orbit) { trouble.push(`${name}: no orbit at ${li}.${oi}`); continue; }
    total += orbit.cells.length;
    if (orbit.cells.length !== DU_VAL_SIZES[name]) {
      trouble.push(`${name}: ${orbit.cells.length} cells, Du Val says ${DU_VAL_SIZES[name]}`);
    }
  }
  if (total !== 473) trouble.push(`${total} cells in all, Du Val says 473`);

  // f₁ splits in two under the rotations; nothing else may split at all
  for (const [name, [li, oi]] of Object.entries(SHELL)) {
    const parts = CHIRAL.cellLayers[li][oi].subCells.map(s => s.cells.length);
    const want = name === 'f1' ? [60, 60] : [DU_VAL_SIZES[name]];
    if (parts.join() !== want.join()) {
      trouble.push(`${name} under I splits [${parts}], expected [${want}]`);
    }
  }
  return trouble;
}

// ------------------------------------------------------------ symbol -> cells

/** "De₁f₁" -> ['a','b','c','d','e1','f1'] */
function shellsOf(symbol) {
  const shells = [];
  const m = /^([A-H])/.exec(symbol);
  let rest = symbol;
  if (m) { shells.push(...INSIDE[m[1]]); rest = symbol.slice(1); }
  const tokens = rest.match(/[efg][12]/g) || [];
  if (tokens.join('') !== rest) die(`cannot read the symbol "${symbol}" (left over: "${rest}")`);
  for (const t of tokens) {
    if (shells.includes(t)) die(`"${symbol}" names ${t} twice`);
    shells.push(t);
  }
  return shells;
}

/**
 * The atoms of a stellation. Whole shells, except that a chiral figure takes
 * one hand of f₁ — the first of the two sub-cells the rotation group splits it
 * into. Which of the two is arbitrary; the mirror image is the same stellation
 * and the list counts it once.
 */
function atomsOf(stel, shells, chiral) {
  const atoms = new Set();
  for (const name of shells) {
    const [li, oi] = SHELL[name];
    const orbit = stel.cellLayers[li][oi];
    const take = (chiral && name === 'f1')
      ? orbit.subCells[0].cells
      : orbit.cells;
    for (const c of take) atoms.add(atomKey(li, oi, c.memberIndex));
  }
  return atoms;
}

// ------------------------------------------------------------------- the list

/*
 * The symbols, in the order of the book's plates — the numbering the Crennells
 * added to the 1999 edition, and the one every modern list uses. 1–32 are the
 * reflexible figures; 33–59 repeat constructions from the first half with a
 * single hand of f₁, so a symbol appearing twice in this table is not a
 * mistake: the two entries differ by chirality, which the symbol alone does
 * not carry.
 */
const SYMBOLS = [
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
  'e1', 'f1', 'g1', 'e1f1', 'e1f1g1', 'f1g1',
  'e2', 'f2', 'g2', 'e2f2', 'e2f2g2', 'f2g2',
  'De1', 'Ef1', 'Fg1', 'De1f1', 'De1f1g1', 'Ef1g1',
  'De2', 'Ef2', 'Fg2', 'De2f2', 'De2f2g2', 'Ef2g2',
  // 33 on: one hand of f₁
  'f1', 'e1f1', 'De1f1', 'f1g1', 'e1f1g1', 'De1f1g1',
  'f1g2', 'e1f1g2', 'De1f1g2', 'f1f2g2', 'e1f1f2g2', 'De1f1f2g2',
  'e2f1', 'De2f1', 'Ef1', 'e2f1g1', 'De2f1g1', 'Ef1g1',
  'e2f1f2', 'De2f1f2', 'Ef1f2', 'e2f1f2g1', 'De2f1f2g1', 'Ef1f2g1',
  'e2f1f2g2', 'De2f1f2g2', 'Ef1f2g2',
];
const FIRST_CHIRAL = 33;

/* sizes recorded in the literature — the arithmetic has to land on these */
const KNOWN_CELLS = { 2: 21, 3: 51, 8: 473, 22: 311, 26: 341 };

/*
 * Which symbol each named entry is supposed to be. A name is attached by
 * number, and a number means nothing without the list it indexes — so if the
 * table above is ever reordered, this catches it rather than letting "the
 * great icosahedron" slide quietly onto a different solid.
 */
const NAME_IS = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 7: 'G', 8: 'H',
                  22: 'Ef1', 23: 'Fg1', 26: 'Ef1g1', 28: 'Ef2', 47: 'Ef1' };

/*
 * The ones with names, taken from the Brückner commentary already in this
 * repository (data/bruckner-plates.json), which sourced them one at a time.
 * Only these. Most of the 59 have no name but their symbol, and inventing one
 * — or guessing which famous solid a number belongs to — would put a wrong
 * label under a correct picture, which is worse than no label at all.
 */
const NAMES = {
  1: 'the icosahedron itself',
  2: 'first stellation — the small triambic icosahedron',
  3: 'compound of five octahedra',
  4: 'the nonagon-faced solid',
  7: 'the great icosahedron',
  8: 'the final stellation',
  22: 'compound of ten tetrahedra',
  23: 'sixth stellation of the icosahedron',
  26: 'excavated dodecahedron — third stellation',
  28: 'the solid Brückner presented as new',
  47: 'compound of five tetrahedra',
};

const SUB = { 1: '₁', 2: '₂' };
const pretty = (s) => s.replace(/([efg])([12])/g, (_, l, d) => l + SUB[d]);

// ------------------------------------------------------------------- generate

const trouble = checkShells();
if (trouble.length) {
  die('this is not Du Val\'s arrangement:\n       ' + trouble.join('\n       '));
}
console.log(`icosahedron u27: ${REFLEXIBLE.planes.length} planes, ` +
            `${REFLEXIBLE.cellLayers.length} shells, 473 cells — matches Du Val`);

if (SYMBOLS.length !== 59) die(`${SYMBOLS.length} symbols, expected 59`);
for (const [n, want] of Object.entries(NAME_IS)) {
  if (SYMBOLS[n - 1] !== want) {
    die(`entry ${n} is ${SYMBOLS[n - 1]}, but a name is pinned to it as ${want}`);
  }
  if (!NAMES[n]) die(`entry ${n} is pinned as ${want} but has no name`);
}
for (const n of Object.keys(NAMES)) {
  if (!NAME_IS[n]) die(`entry ${n} has a name but nothing says which symbol it should be`);
}

const items = [];
const problems = [];
SYMBOLS.forEach((symbol, i) => {
  const n = i + 1;
  const chiral = n >= FIRST_CHIRAL;
  const stel = chiral ? CHIRAL : REFLEXIBLE;
  const shells = shellsOf(symbol);
  const atoms = atomsOf(stel, shells, chiral);
  /*
   * Whole shells, and one whole hand of f₁ when chiral — so every selection
   * here is aligned with the sub-cells of its own stellation symmetry, and
   * writes as the classic cell string. If one ever came out unaligned the
   * document would silently need format release 2, so it is asserted.
   */
  const { text: cells, aligned } = formatCellsAtoms(stel, atoms);
  if (!aligned) problems.push(`${n} ${symbol}: selection is not aligned with its own group`);

  // it has to read back as what we wrote
  const reread = parseCellsAny(stel, cells, null);
  const same = reread.size === atoms.size && [...atoms].every(a => reread.has(a));
  const picked = selectedCells(stel, atoms);
  const mesh = extractMesh([{ cells: picked }], stel.pool);
  if (!same) problems.push(`${n} ${symbol}: does not read back as written`);
  if (!mesh.faces.length) problems.push(`${n} ${symbol}: empty mesh`);
  if (KNOWN_CELLS[n] && picked.length !== KNOWN_CELLS[n]) {
    problems.push(`${n} ${symbol}: ${picked.length} cells, the literature says ${KNOWN_CELLS[n]}`);
  }

  const slug = String(n).padStart(2, '0') + '-' +
    symbol.toLowerCase().replace(/[^a-z0-9]/g, '') + (chiral ? '-chiral' : '');
  /*
   * Every one must have a fitted camera, and every rotation must be the same
   * +z — the whole point of writing them down is that the set is comparable,
   * and one figure quietly turned a different way is exactly the defect this
   * replaced.
   */
  /*
   * The stellation diagram, drawn straight to SVG — no browser anywhere in
   * this. The icosahedron's twenty faces are one symmetry class, so it has
   * exactly one diagram and the representative plane is the only one there is;
   * a solid with several kinds of face would have several, which is what
   * diagramFaces() is for.
   *
   * Coloured by shell, the same as the solid beside it: the two pictures of a
   * figure should agree about what colour its shells are.
   */
  const faces = diagramFaces(stel, symmetry[chiral ? 'I' : 'Ih'].matrices);
  if (faces.length !== 1) problems.push(`${n} ${symbol}: ${faces.length} distinct diagrams, expected 1`);
  const dia = faces.length ? createDiagram(stel, faces[0].index, [{ cells: picked }], 0) : null;
  if (!dia) problems.push(`${n} ${symbol}: no diagram`);

  const view = VIEWS[slug];
  if (!view) problems.push(`${n} ${symbol}: no camera for "${slug}" in icosahedra-views.json`);
  else if (view.length !== 8) problems.push(`${n} ${symbol}: camera is not eight numbers`);
  else if (view[0] || view[1] || view[2] || view[3] !== 1) {
    problems.push(`${n} ${symbol}: camera is not the +z view [0,0,0,1]`);
  }
  items.push({
    file: `icosahedra/${slug}.json`,
    diagram: `icosahedra/${slug}.svg`,
    n,
    symbol: pretty(symbol),
    name: NAMES[n] || null,
    chiral,
    shells: shells.map(pretty),
    cells: picked.length,
    v: mesh.vertices.length,
    f: mesh.faces.length,
    regions: dia ? dia.facets.length : 0,
    onSurface: dia ? dia.facets.filter(f => f.selected).length : 0,
    svg: dia ? diagramSVG(dia, {
      colorMode: 'layer',
      metadata: {
        title: `${n}. ${pretty(symbol)} — stellation diagram`,
        polyhedron: 'u27', polySymmetry: 'Ih', stellSymmetry: chiral ? 'I' : 'Ih',
        planeDepth: DEPTH, plane: faces[0].index, cells,
      },
    }) : '',
    document: writePreset({
      name: `${n}. ${pretty(symbol)}${NAMES[n] ? ' — ' + NAMES[n] : ''}`,
      polyhedron: 'icosahedron', file: 'u27',
      polySymmetry: 'Ih', stellSymmetry: chiral ? 'I' : 'Ih',
      planeDepth: DEPTH, cells, diagramFace: 0,
      colorMode: 'layer',        // colour by shell: the letters, made visible
      /*
       * The camera, from icosahedra-views.json: the same +z rotation for all
       * 59, and a zoom fitted so each fills the frame. Written into the
       * document rather than left to the app's own framing, because without it
       * the angle a figure opens at is whatever was last on screen — which is
       * how the first set of these pictures came out in three different
       * orientations. A document that names its own camera opens the same way
       * every time, and its thumbnail is a picture of what you will actually
       * see.
       */
      view: VIEWS[slug] || null,
    }),
  });
});

if (problems.length) die('generated figures do not check out:\n       ' + problems.join('\n       '));

console.log(`59 stellations, ${items.filter(i => !i.chiral).length} reflexible and ` +
            `${items.filter(i => i.chiral).length} chiral`);
for (const n of Object.keys(KNOWN_CELLS)) {
  const it = items[n - 1];
  console.log(`  ${String(n).padStart(2)} ${it.symbol.padEnd(10)} ${it.cells} cells — as published`);
}

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }

mkdirSync(OUT, { recursive: true });
for (const it of items) {
  writeFileSync(join(DOCS, it.file), it.document);
  writeFileSync(join(DOCS, it.diagram), it.svg);
}

const manifest = {
  $comment: 'Generated by docs/tools/make-icosahedra.mjs — edit that, not this.',
  source: {
    work: 'The Fifty-Nine Icosahedra',
    who: 'H. S. M. Coxeter, P. Du Val, H. T. Flather and J. F. Petrie',
    year: 1938,
    note: 'Symbols and ordering as in the book; the numbering is the Crennells\', added to the 1999 third edition.',
  },
  solid: { file: 'u27', name: 'icosahedron', planes: REFLEXIBLE.planes.length, cells: 473 },
  items: items.map(({ document, svg, ...rest }) => rest),
};
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

console.log(`\nwrote ${items.length} documents to icosahedra/ and the manifest.` +
            '\nthumbnails are a separate step — they need a browser to render.');
