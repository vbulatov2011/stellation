/*
 * The stellation lists under different rules.
 *
 *   node docs/tools/make-icosahedra-rules.mjs [--dry-run]
 *
 * Seven lists, one page each, from docs/tools/steelpillow-lists.json. They are
 * Guy Inchbald's, computed by a program of his and printed out; each applies a
 * different set of acceptance rules to the one arrangement of twenty planes.
 * Put side by side they make a point the canonical list cannot make on its
 * own: "the 59" is 59 because of the rules, not because of the icosahedron.
 * Change one rule and you get 25, or 36, or 50.
 *
 * ------------------------------------------------------------------ the codes
 *
 * Every entry carries a number that is a bit per cell type, and that number,
 * not the printed symbol, is what is read here:
 *
 *     1 a     2 b     4 c     8 d    16 e₁    32 e₂
 *    64 f₁ (one hand)  128 f₁ (the other)   256 f₂   512 g₁  1024 g₂  2048 h
 *
 * So 63 is a+b+c+d+e₁+e₂, which their notation contracts to E, and 4095 is
 * everything. Both hands of f₁ present (192) means a reflexible figure, built
 * under I_h; one hand means a chiral one, built under I, where that orbit
 * splits in two.
 *
 * Reading the code rather than the symbol is what makes this safe. The lists
 * were OCR'd from dot-matrix printout and one symbol did not survive — entry
 * 735 of the first list prints "D,e11f1,g1" for what the other five lists
 * print as "D,e1,f1,g1" — but its code is intact, and the figure comes out
 * right. Every printed symbol is regenerated from its code and compared, so a
 * scar is reported rather than silently believed.
 *
 * -------------------------------------------------------------- what is built
 *
 * 84 distinct figures across the seven lists. 59 of them are the canonical
 * ones and already have documents, so those are reused — a figure gets one
 * document however many lists name it. The other 25 are written here, and all
 * of them come from the two lists that drop the ban on separated shells: they
 * are the figures with a shell floating free of the core, which is exactly
 * what that rule exists to forbid.
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
const dryRun = process.argv.includes('--dry-run');
const die = (m) => { console.error('make-icosahedra-rules: ' + m); process.exit(1); };

const lists = JSON.parse(readFileSync(join(DOCS, 'tools', 'steelpillow-lists.json'), 'utf8'));
const canon = JSON.parse(readFileSync(join(DOCS, 'icosahedra.json'), 'utf8'));
const VIEWS = JSON.parse(
  readFileSync(join(DOCS, 'tools', 'icosahedra-views.json'), 'utf8')).views;

// --------------------------------------------------------------- cells by bit

const BITS = [
  [1, 'a'], [2, 'b'], [4, 'c'], [8, 'd'], [16, 'e1'], [32, 'e2'],
  [64, 'f1d'], [128, 'f1l'], [256, 'f2'], [512, 'g1'], [1024, 'g2'], [2048, 'h'],
];
const CAP = { A: 1, B: 3, C: 7, D: 15, E: 63, F: 511, G: 2047, H: 4095 };
const SHELL = {
  a: [0, 0], b: [1, 0], c: [2, 0], d: [3, 0],
  e1: [4, 0], e2: [4, 1], f2: [5, 0], f1: [5, 1],
  g1: [6, 0], g2: [6, 1], h: [7, 0],
};
const SIZE = { a: 1, b: 20, c: 30, d: 60, e1: 20, e2: 60, f1d: 60, f1l: 60, f2: 12, g1: 30, g2: 60, h: 60 };
const SUB = { 1: '₁', 2: '₂' };
const pretty = (s) => s.replace(/([efg])([12])/g, (_, l, d) => l + SUB[d]).replace(/f₁d/g, 'f₁');

/** the symbol their program prints for a code — regenerated, to check theirs */
function symbolOf(code) {
  let best = null;
  for (const [letter, mask] of Object.entries(CAP)) if ((code & mask) === mask) best = [letter, mask];
  const parts = [];
  let rest = code;
  if (best) { parts.push(best[0]); rest = code & ~best[1]; }
  const both = (rest & 192) === 192;
  for (const [bit, name] of BITS) {
    if (!(rest & bit)) continue;
    if (bit === 64) parts.push(both ? 'f1' : 'f1d');
    else if (bit === 128) { if (!both) parts.push('f1d'); }
    else parts.push(name);
  }
  return parts.join(',');
}

const cellNames = (code) => BITS.filter(([b]) => code & b).map(([, n]) => n);
const isChiral = (code) => (code & 192) === 64 || (code & 192) === 128;

// ------------------------------------------------------------ the arrangement

const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));
const build = (sub) => buildStellation(poly, symmetry.Ih.matrices,
                                       { subMatrices: sub, maxIntersection: DEPTH });
const REFLEXIBLE = build(symmetry.Ih.matrices);
const CHIRAL = build(symmetry.I.matrices);

/**
 * Atoms for a code. Whole orbits, except f₁: with both bits set the figure
 * takes all 120 and the orbit is used whole, and with one bit it takes that
 * hand — which only exists as a sub-cell in the arrangement built under the
 * rotations, where the orbit splits in two.
 */
function atomsOf(stel, code) {
  const atoms = new Set();
  const both = (code & 192) === 192;
  for (const name of cellNames(code)) {
    const hand = name === 'f1d' || name === 'f1l';
    const [li, oi] = SHELL[hand ? 'f1' : name];
    const orbit = stel.cellLayers[li][oi];
    if (hand && both && name === 'f1l') continue;      // counted with the other bit
    const take = (hand && !both)
      ? orbit.subCells[name === 'f1d' ? 0 : 1].cells
      : orbit.cells;
    for (const c of take) atoms.add(atomKey(li, oi, c.memberIndex));
  }
  return atoms;
}

// ------------------------------------- which codes the canonical documents are

const CANON_BIT = { a: 1, b: 2, c: 4, d: 8, 'e₁': 16, 'e₂': 32, 'f₂': 256, 'g₁': 512, 'g₂': 1024, h: 2048 };
const canonByCode = new Map(canon.items.map(it => [
  it.shells.reduce((n, s) => n | (s === 'f₁' ? (it.chiral ? 64 : 192) : CANON_BIT[s]), 0), it]));
if (canonByCode.size !== 59) die(`the canonical manifest gives ${canonByCode.size} distinct codes, not 59`);

// ------------------------------------------------------------------- generate

const sets = lists.sets.map((s) => {
  const rows = s.entries.split(' ').map((tok) => {
    const [c, printed] = tok.split('=');
    return { code: +c, printed };
  });
  for (const c of s.reconstructed || []) rows.push({ code: c, printed: null, reconstructed: true });
  rows.sort((a, b) => a.code - b.code);
  return { ...s, rows };
});

const scars = [];
for (const s of sets) {
  for (const r of s.rows) {
    if (r.printed && symbolOf(r.code) !== r.printed) {
      scars.push(`${s.slug} ${r.code}: printed "${r.printed}", its code says "${symbolOf(r.code)}"`);
    }
  }
  const n = s.rows.length;
  if (n !== s.tally) die(`${s.slug}: ${n} entries but the printout tallies ${s.tally}`);
}

const figures = new Map();     // code -> figure
const problems = [];
const wanted = [...new Set(sets.flatMap(s => s.rows.map(r => r.code)))].sort((a, b) => a - b);

for (const code of wanted) {
  const chiral = isChiral(code);
  const stel = chiral ? CHIRAL : REFLEXIBLE;
  const atoms = atomsOf(stel, code);
  const { text: cells, aligned } = formatCellsAtoms(stel, atoms);
  if (!aligned) problems.push(`${code}: selection not aligned with its own group`);
  const picked = selectedCells(stel, atoms);
  const mesh = extractMesh([{ cells: picked }], stel.pool);
  const reread = parseCellsAny(stel, cells, null);
  if (reread.size !== atoms.size) problems.push(`${code}: does not read back as written`);
  if (!mesh.faces.length) problems.push(`${code}: empty mesh`);

  // the cells the code names must be the cells the figure holds
  const want = cellNames(code).reduce((n, x) => n + SIZE[x], 0);
  if (picked.length !== want) {
    problems.push(`${code}: ${picked.length} cells, its bits name ${want}`);
  }

  const known = canonByCode.get(code);
  const symbol = symbolOf(code);
  const slug = known
    ? known.file.replace('icosahedra/', '').replace('.json', '')
    : `c${String(code).padStart(4, '0')}-${symbol.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

  /*
   * The stellation diagram. A figure already among the 59 has one drawn by the
   * other generator, and this reuses it rather than drawing a second copy of
   * the same picture; the rest are drawn here.
   */
  const faces = diagramFaces(stel, symmetry[chiral ? 'I' : 'Ih'].matrices);
  const dia = faces.length ? createDiagram(stel, faces[0].index, [{ cells: picked }], 0) : null;
  if (!dia) problems.push(`${code}: no diagram`);

  figures.set(code, {
    code, symbol: pretty(symbol), slug, chiral,
    file: `icosahedra/${slug}.json`,
    diagram: `icosahedra/${slug}.svg`,
    crennell: known ? known.n : null,
    name: known ? known.name : null,
    cells: picked.length, v: mesh.vertices.length, f: mesh.faces.length,
    regions: dia ? dia.facets.length : 0,
    onSurface: dia ? dia.facets.filter(f => f.selected).length : 0,
    shells: cellNames(code).map(pretty),
    svg: known ? null : (dia ? diagramSVG(dia, {
      colorMode: 'layer',
      metadata: {
        title: `${pretty(symbol)} — stellation diagram`,
        polyhedron: 'u27', polySymmetry: 'Ih', stellSymmetry: chiral ? 'I' : 'Ih',
        planeDepth: DEPTH, plane: faces[0].index, cells, code,
      },
    }) : ''),
    document: known ? null : writePreset({
      name: `${pretty(symbol)} — stellation of the icosahedron`,
      polyhedron: 'icosahedron', file: 'u27',
      polySymmetry: 'Ih', stellSymmetry: chiral ? 'I' : 'Ih',
      planeDepth: DEPTH, cells, diagramFace: 0,
      colorMode: 'layer',
      view: VIEWS[slug] || null,
    }),
  });
}

if (problems.length) die('figures do not check out:\n       ' + problems.join('\n       '));

const fresh = [...figures.values()].filter(f => f.document);
const unfitted = fresh.filter(f => !VIEWS[f.slug]).map(f => f.slug);
for (const f of [...figures.values()]) {
  const v = VIEWS[f.slug];
  if (v && (v.length !== 8 || v[0] || v[1] || v[2] || v[3] !== 1)) {
    die(`${f.slug}: camera is not the +z view [0,0,0,1]`);
  }
}

console.log(`${sets.length} lists, ${wanted.length} distinct figures`);
console.log(`  ${wanted.length - fresh.length} already have documents as part of the 59`);
console.log(`  ${fresh.length} are new — all from the lists that allow separated shells`);
console.log(scars.length
  ? `\n${scars.length} printed symbol(s) disagree with their own code — the code was used:\n   ` + scars.join('\n   ')
  : '\nevery printed symbol agrees with its code');
if (unfitted.length) {
  console.log(`\n${unfitted.length} figure(s) have no fitted camera yet:\n   ` + unfitted.join(' '));
}

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }

mkdirSync(OUT, { recursive: true });
for (const f of fresh) {
  writeFileSync(join(DOCS, f.file), f.document);
  writeFileSync(join(DOCS, f.diagram), f.svg);
}

const manifest = {
  $comment: 'Generated by docs/tools/make-icosahedra-rules.mjs — edit that, not this.',
  source: lists.source,
  figures: Object.fromEntries([...figures.values()].map(f => {
    const { document, svg, ...rest } = f;
    return [f.code, rest];
  })),
  sets: sets.map(s => ({
    slug: s.slug, title: s.title, blurb: s.blurb, rules: s.rules, tally: s.tally,
    codes: s.rows.map(r => r.code),
    reconstructed: s.reconstructed || [],
  })),
};
writeFileSync(join(DOCS, 'icosahedra-rules.json'), JSON.stringify(manifest, null, 2) + '\n');

writePages(manifest);
console.log(`\nwrote ${fresh.length} documents, the manifest, and ${sets.length} pages`);

// ---------------------------------------------------------------- the pages

function writePages(man) {
  for (const s of man.sets) {
    const others = man.sets.filter(o => o.slug !== s.slug);
    writeFileSync(join(DOCS, `icosa-${s.slug}.html`), page(s, others));
  }
  writeFileSync(join(DOCS, 'icosa-rules.html'), indexPage(man));
}

/** the page that holds the seven together — the comparison is the point */
function indexPage(man) {
  const cards = man.sets.map((s) => {
    const outside = s.codes.filter(c => man.figures[c] && !man.figures[c].crennell).length;
    return `    <a class="ic-set" href="icosa-${s.slug}.html">
      <span class="count">${s.tally}</span>
      <b>${esc(s.title)}</b>
      <p>${esc(s.blurb)}</p>
      <ul>
${s.rules.map(r => `        <li>${esc(r)}</li>`).join('\n')}
      </ul>
${outside ? `      <p>${outside} of them are not among the 59.</p>\n` : ''}    </a>`;
  }).join('\n');

  return shell({
    title: 'Stellations under different rules',
    crumb: 'Under different rules',
    description: 'Seven lists of icosahedron stellations, each from a different set of acceptance rules.',
    nav: `  <a class="ghost optional" href="icosahedra.html">The 59</a>
  <a class="ghost optional" href="examples.html">Examples</a>`,
    body: `  <h1>Stellations under different rules</h1>
  <p class="standfirst">
    "The fifty-nine icosahedra" is not a count of what the icosahedron has. It
    is a count of what survives a particular set of rules — Miller's — about
    what a stellation is allowed to be. Change one rule and the number changes
    with it.
  </p>

  <p>
    These seven lists are Guy Inchbald's, each computed by applying a different
    set of acceptance conditions to the same arrangement of twenty planes. The
    canonical 59 is the first. The others tighten it, by demanding that a face
    plane not be broken or an edge not be segmented, or loosen it, by dropping
    Miller's rule (v) — the ban on shells separated from the core — and putting
    a continuity rule in its place.
  </p>
  <p>
    Between them they name ${Object.keys(man.figures).length} distinct figures,
    ${Object.values(man.figures).filter(f => !f.crennell).length} of which the
    canonical list rejects. Every one is a document: click it and the app opens
    with those cells chosen.
  </p>

  <div class="ic-sets">
${cards}
  </div>

  <p class="colophon">
    The lists come from
    <a href="${esc(lists.source.url)}">Stellation Lists under Different Rules</a>
    by ${esc(lists.source.who)}, read on ${esc(lists.source.read)}. They were
    computed by a program of his, printed on a dot-matrix printer and later
    scanned, and each entry carries a numeric cell code as well as a printed
    symbol. The figures here are built from the codes; every symbol was
    regenerated from its code and checked against the printed one, which found
    one casualty of the scanning (entry 735 of the first list) and no
    disagreement anywhere else. Generated by
    <code>docs/tools/make-icosahedra-rules.mjs</code>.
  </p>`,
    script: '',
  });
}

// a declaration, not a const: writePages runs above this line
function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function page(s, others) {
  return shell({
    title: s.title,
    crumb: s.title,
    description: s.blurb,
    dataSet: s.slug,
    nav: `  <a class="ghost optional" href="icosa-rules.html">All seven lists</a>
  <a class="ghost optional" href="icosahedra.html">The 59</a>`,
    body: `  <h1>${esc(s.title)}</h1>
  <p class="standfirst">${esc(s.blurb)}</p>

  <h2>The rules</h2>
  <p>A cell set is accepted when all of these hold:</p>
  <ol class="ic-rules">
${s.rules.map(r => `    <li>${esc(r)}</li>`).join('\n')}
  </ol>
  <p id="icTally" class="ic-tally"></p>

  <div id="icFilter" class="ic-filter"></div>
  <p id="icCount"></p>
  <div id="icGrid" class="ic-grid pics-solid"></div>

  <h2>The other lists</h2>
  <ul class="ic-others">
${others.map(o => `    <li><a href="icosa-${o.slug}.html">${esc(o.title)}</a> — ${o.tally}</li>`).join('\n')}
  </ul>

  <p class="colophon">
    The list is Guy Inchbald's, from
    <a href="${esc(lists.source.url)}">Stellation Lists under Different Rules</a>,
    computed by a program of his and printed out; the figures here are built
    from the cell codes it gives, and every printed symbol was regenerated from
    its code and checked against it. Generated by
    <code>docs/tools/make-icosahedra-rules.mjs</code>.
  </p>`,
    script: '<script type="module" src="js/icosahedra-rules.js"></script>',
  });
}

/** the page furniture every one of these shares */
function shell({ title, crumb, description, body, nav = '', script = '', dataSet = null }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Stellation</title>
<meta name="description" content="${esc(description)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
<link rel="stylesheet" href="css/style.css">
<link rel="stylesheet" href="css/walkthrough.css">
<link rel="stylesheet" href="css/icosahedra.css">
<style>@media (max-width: 650px) { .doc-head .optional { display: none; } }</style>
<script>
  (() => {
    const saved = localStorage.getItem('theme') || 'auto';
    const dark = saved === 'dark' || (saved === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = saved;
  })();
</script>
</head>
<body class="doc">

<header class="doc-head">
  <a class="brand" href="index.html">✦ Stellation</a>
  <span class="crumb">${esc(crumb)}</span>
  <div class="spacer"></div>
${nav}
  <a class="ghost" href="stellation_app.html">Open the app →</a>
  <button id="themeBtn" class="ghost icon" title="Light / dark">◐</button>
</header>

<main class="doc-body narrow"${dataSet ? ` data-set="${esc(dataSet)}"` : ''}>
${body}
</main>

${script}
<script type="module">
  const btn = document.querySelector('#themeBtn');
  const apply = (pref) => {
    const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
    btn.textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '●' : '○';
  };
  btn.onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = document.documentElement.dataset.themePref || 'auto';
    apply(order[(order.indexOf(cur) + 1) % order.length]);
    localStorage.setItem('theme', document.documentElement.dataset.themePref);
  };
  apply(localStorage.getItem('theme') || 'auto');
</script>
</body>
</html>
`;
}
