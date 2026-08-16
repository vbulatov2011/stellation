/*
 * Put a saved document into the examples gallery.
 *
 *   node docs/tools/catalog.mjs <document.json> --name "…" --tags a,b [--note "…"]
 *
 * The app saves a document and its thumbnail under a generated name, in
 * whichever folder it last wrote to. Getting from there into the gallery is
 * four mechanical steps and one that needs a person: rename the pair to a
 * slug, put the display name inside the document, move both into examples/,
 * append an entry to examples.json — and then say why the thing is worth
 * looking at. This does the four.
 *
 * The note it writes is a stub of measurements: the solid, the group, how
 * many planes and shells the arrangement has, how many pieces were taken and
 * out of how many, the size of the mesh. Digging those out by hand is the
 * tedious half of writing a caption and they are what a caption is mostly
 * made of, so they are gathered here and left in the file for you to write
 * around. Pass --note to skip that and write the whole thing yourself.
 *
 * Nothing is written until every check has passed: an unreadable document, an
 * undeclared tag, a missing thumbnail, or a name already in the catalog all
 * stop the run before the first rename. --dry-run prints what it would do.
 */

import { readFileSync, writeFileSync, existsSync, copyFileSync, unlinkSync,
         mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, relative } from 'node:path';
import { readDocument, normalizePlaneRows, expandPlaneRows } from '../app/js/preset.js';
import { buildStellation, facePlanes, suggestDepth, parseCellsAny, selectedCells,
         extractMesh } from '../lib/core.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(DOCS, 'examples.json');
const EXAMPLES = join(DOCS, 'examples');

// ----------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const opts = { _: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--dry-run') opts.dryRun = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else opts._.push(a);
}

const die = (msg) => { console.error('catalog: ' + msg); process.exit(1); };

/*
 * The catalog as it is meant to be read. JSON.stringify alone puts every tag
 * on a line of its own, which turns a two-word list into four lines and a
 * one-entry addition into a diff across the whole file. So a list of plain
 * strings is folded back onto one line — but only when it fits on one, which
 * is what keeps a `tags` pair together without also running a paragraph of
 * prose off the right edge. The file is hand-edited most of the time; a tool
 * that rewrites it should hand it back in roughly the shape it found it.
 */
const FITS = 96;
function formatCatalog(cat) {
  return JSON.stringify(cat, null, 4)
    .replace(/( *)("[^"]*": )?\[\n\s+((?:"(?:[^"\\]|\\.)*",?\n\s+)+)\]/g,
             (whole, indent, key, body) => {
               const one = indent + (key || '') +
                 '[' + body.trim().split(/,\s*\n\s*/).join(', ') + ']';
               return one.length <= FITS ? one : whole;
             }) + '\n';
}

if (!opts._.length || opts.help !== undefined) {
  console.log(`usage: node docs/tools/catalog.mjs <document.json> --name "…" --tags a,b

  --name   what the gallery calls it — short, and its own, not the solid's
  --tags   comma separated; the first is the section it files under
  --note   the caption; omitted, a stub of measurements is written for you
  --slug   the filename to use; omitted, one is made from --name
  --dry-run  say what would happen, touch nothing

tags declared in examples.json: ${Object.keys(JSON.parse(readFileSync(CATALOG, 'utf8')).tags).join(' ')}`);
  process.exit(opts._.length ? 1 : 0);
}

const src = opts._[0];
if (!existsSync(src)) die(`no such file: ${src}`);
if (!existsSync(src + '.png')) {
  die(`no thumbnail beside it: ${basename(src)}.png\n` +
      '       the gallery draws a card per entry and a card needs a picture.\n' +
      '       Save again from the app — it writes the pair.');
}
if (!opts.name) die('--name is required: the gallery needs something to call it');

const catalog = JSON.parse(readFileSync(CATALOG, 'utf8'));
const declared = Object.keys(catalog.tags);
const tags = String(opts.tags || '').split(',').map(s => s.trim()).filter(Boolean);
if (!tags.length) die(`--tags is required; declared: ${declared.join(' ')}`);
const unknown = tags.filter(t => !declared.includes(t));
if (unknown.length) {
  die(`undeclared tag: ${unknown.join(' ')}\n` +
      `       declared: ${declared.join(' ')}\n` +
      '       A new one is fine — add it to the `tags` block of examples.json,\n' +
      '       with a title and a blurb, and run this again.');
}

const slug = (opts.slug || opts.name)
  .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
if (!slug) die('--name has nothing a filename can be made of; pass --slug');

const destName = slug + '.json';
const dest = join(EXAMPLES, destName);
const entryFile = 'examples/' + destName;

if (catalog.items.some(i => i.file === entryFile)) {
  die(`already in the catalog: ${entryFile}\n` +
      '       Edit the entry in examples.json, or pass a different --slug.');
}
if (existsSync(dest) && relative(dest, src) !== '') {
  die(`would overwrite ${entryFile}, which is not the file given`);
}
if (catalog.items.some(i => i.name === opts.name)) {
  console.warn(`catalog: note — another entry is also called "${opts.name}"`);
}

// ------------------------------------------------------------- measuring it

const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));

const text = readFileSync(src, 'utf8');
let doc;
try { doc = readDocument(text); } catch (e) { die(`${basename(src)}: ${e.message}`); }

/** what the worker does on 'build', minus the worker */
function measure(doc) {
  const group = symmetry[doc.polySymmetry]?.matrices;
  if (!group) return { error: `unknown polyhedron symmetry "${doc.polySymmetry}"` };
  const subMatrices = symmetry[doc.stellSymmetry]?.matrices || group;

  let poly = null, planes = null;
  if (doc.planeRows) {
    planes = expandPlaneRows(normalizePlaneRows(doc.planeRows), symmetry);
  } else {
    const g = geometry[doc.file];
    if (!g) return { error: `unknown solid "${doc.file}"` };
    const vertices = [];
    for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
    poly = { vertices, faces: g.f };
  }
  const depth = doc.planeDepth ?? suggestDepth(planes || facePlanes(poly));
  const stel = buildStellation(poly, group, { planes, subMatrices, maxIntersection: depth });

  const atoms = parseCellsAny(stel, doc.cells || '{0}', doc.cellsIndexing);
  const cells = selectedCells(stel, atoms);
  const mesh = extractMesh([{ cells }], stel.pool);
  const whole = stel.cellLayers.reduce(
    (n, l) => n + l.reduce((k, o) => k + o.cells.length, 0), 0);

  return {
    planes: stel.planes.length,
    layers: stel.cellLayers.length,
    depth,
    pieces: cells.length,
    whole,
    v: mesh.vertices.length,
    f: mesh.faces.length,
    polyOrder: group.length,
    stellOrder: subMatrices.length,
  };
}

const m = measure(doc);
if (m.error) die(`${basename(src)}: ${m.error}`);

const solid = doc.planeRows
  ? `a plane set of ${doc.planeRows.length} row${doc.planeRows.length === 1 ? '' : 's'}`
  : `the ${doc.polyhedron || doc.file}`;
const under = doc.stellSymmetry && doc.stellSymmetry !== doc.polySymmetry
  ? `, but the cells were picked under ${doc.stellSymmetry} — ` +
    `${m.stellOrder} operation${m.stellOrder === 1 ? '' : 's'} out of ${m.polyOrder}`
  : ` and stellated with all ${m.polyOrder} of them`;

const note = opts.note ||
  `TODO — say what is worth looking at. The measurements: ${solid}, ` +
  `${m.planes} planes to depth ${m.depth}, ${m.layers} shells. ` +
  `Grouped under ${doc.polySymmetry}${under}. ` +
  `${m.pieces} of the arrangement's ${m.whole} pieces taken; ` +
  `the mesh is ${m.v} vertices and ${m.f} faces.`;

// --------------------------------------------------------------- writing it

const entry = { file: entryFile, name: opts.name, tags, note };
const moving = relative(dest, src) !== '';

console.log(`  ${moving ? basename(src) + ' -> ' : ''}${entryFile}`);
console.log(`  name    ${opts.name}`);
console.log(`  tags    ${tags.join(', ')}  (files under "${catalog.tags[tags[0]].title}")`);
console.log(`  note    ${note}`);
if (!opts.note) console.log('          ^ a stub — rewrite it in examples.json');

if (opts.dryRun) { console.log('\n  --dry-run: nothing written'); process.exit(0); }

/*
 * Copy in, then update the catalog, then remove the originals. Copy rather
 * than rename because the two are routinely on different drives — the app
 * saves wherever it last saved, often a downloads folder on another volume,
 * and rename cannot cross one. Removing last means an interrupted run leaves
 * the source where it was: a stray pair in examples/ is caught by the test,
 * and a document deleted from under you is not.
 */
const parsed = JSON.parse(text);
parsed.name = opts.name;   // the document carries the display name; the slug is the filename's
mkdirSync(EXAMPLES, { recursive: true });
writeFileSync(dest, JSON.stringify(parsed, null, 1) + '\n');
if (moving) copyFileSync(src + '.png', dest + '.png');

catalog.items.push(entry);
writeFileSync(CATALOG, formatCatalog(catalog));

if (moving) { unlinkSync(src + '.png'); unlinkSync(src); }

console.log(`\n  catalogued — ${catalog.items.length} examples\n` +
            '  check it:  node docs/test/examples.mjs');
