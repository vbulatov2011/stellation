/*
 * Document format releases and the cells.indexing field.
 *
 *   node docs/test/docformat.mjs
 *
 * Release 1 is every document ever written: bracket indices are sub-cells
 * under the document's stellation symmetry. Release 2 exists ONLY for
 * selections that are not whole orbits of that symmetry — cells.indexing
 * "cells", member-indexed brackets. An old build reads every release-1
 * document exactly as before and refuses release 2 cleanly, which beats
 * misparsing it. Every shipped preset must load and stay release 1.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writePreset, readPreset, readDocument, normalizePlaneRows, FILE_FORMAT_RELEASE }
  from '../app/js/preset.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
}

const base = {
  name: 'probe', polyhedron: 'icosahedron', file: 'u22',
  polySymmetry: 'Ih', stellSymmetry: 'I', planeDepth: 8,
  diagramFace: 0, view: [0, 0, 0, 1, 2],
};

// aligned: exactly the classic envelope
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0,1,2}' }));
  ok(doc.appInfo.fileFormatRelease === 1, 'aligned selection writes release 1');
  ok(doc.params.cells.indexing === undefined, 'aligned selection writes no indexing field');
  const read = readPreset(doc);
  ok(read.cells === '{0,1,2}' && read.cellsIndexing === null,
     'release-1 document reads with sub indexing');
}

// unaligned: release 2 + the marker
{
  const doc = JSON.parse(writePreset({ ...base, cells: 'c{0,1(0[2,5])}', cellsIndexing: 'cells' }));
  ok(doc.appInfo.fileFormatRelease === 2, 'unaligned selection writes release 2');
  ok(doc.params.cells.indexing === 'cells', 'unaligned selection writes indexing: "cells"');
  const read = readPreset(doc);
  ok(read.cells === 'c{0,1(0[2,5])}' && read.cellsIndexing === 'cells',
     'release-2 document reads with member indexing');
}

// the future refuses cleanly
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  doc.appInfo.fileFormatRelease = FILE_FORMAT_RELEASE + 1;
  let refused = false;
  try { readPreset(doc); } catch (e) { refused = /format release/.test(e.message); }
  ok(refused, `release ${FILE_FORMAT_RELEASE + 1} is refused with the format message`);
}

/*
 * Every shipped preset still loads, and stays release 1.
 *
 * "Shipped" means listed in the manifest, not merely present in the folder:
 * the app's Save can land a working document in docs/presets/ when that is
 * the folder it was last pointed at, and an unlisted stray is nobody's
 * promise. The manifest is what the site serves.
 */
{
  const manifest = JSON.parse(readFileSync(join(DOCS, 'presets.json'), 'utf8'));
  const files = manifest.items.map(it => it.file);
  let all = true, allR1 = true;
  for (const f of files) {
    const text = readFileSync(join(DOCS, f), 'utf8');
    if ((JSON.parse(text).appInfo?.fileFormatRelease ?? 1) !== 1) allR1 = false;
    try {
      const d = readDocument(text);
      if (!d.cells || d.cellsIndexing !== null) all = false;
    } catch { all = false; }
  }
  ok(files.length >= 8, `${files.length} presets in the manifest`);
  ok(all, 'every shipped preset reads as sub-indexed');
  ok(allR1, 'every shipped preset is release 1');

  // and the manifest names nothing that is missing
  const missing = files.filter(f => !existsSync(join(DOCS, f)) || !existsSync(join(DOCS, f + '.png')));
  ok(missing.length === 0, 'every manifest entry has its document and thumbnail');
}

// ---------------------------------------------------------------- planes

// structured rows: written as given, read back as given, release 3
{
  const planeRows = [
    { normal: [0, 0, 1], distance: 1 },
    { normal: [1, 0, 0], distance: 0.5773502691896257, symmetry: 'Oh', factor: 1.6 },
  ];
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}', planeRows }));
  ok(doc.appInfo.fileFormatRelease === 3, 'a plane set writes release 3');
  ok(Array.isArray(doc.params.planes.rows) && doc.params.planes.rows.length === 2,
     'planes.rows is a list of objects');
  ok(doc.params.planes.text === undefined, 'no text form is written any more');
  const first = doc.params.planes.rows[0];
  ok(first.symmetry === undefined && first.factor === undefined,
     'a plain row writes neither symmetry nor factor');
  ok(doc.params.planes.rows[1].factor === 1.6 &&
     doc.params.planes.rows[1].normal[1] === 0,
     'numbers stay numbers — no decimal rounding, no re-parsing');
  const read = readPreset(doc);
  ok(read.planeRows.length === 2 && read.planeRows[1].symmetry === 'Oh' &&
     read.planeRows[1].factor === 1.6 && read.planeRows[0].distance === 1,
     'the rows read back exactly');
  // full double precision survives
  const d = 0.7946544722917651;
  const rt = readPreset(JSON.parse(writePreset({ ...base, cells: '{0}',
    planeRows: [{ normal: [0.3568220897730899, 0.9341723589627157, 0], distance: d }] })));
  ok(rt.planeRows[0].distance === d && rt.planeRows[0].normal[0] === 0.3568220897730899,
     'seventeen significant digits round-trip bit-exactly');
}

// central planes: the flag rides in arrangement, forces release 4, reads back
{
  const planeRows = [
    { normal: [0, 0, 1], distance: 1, symmetry: 'Oh' },
    { normal: [1, 0, 0], distance: 0, symmetry: 'Oh' },
  ];
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}', planeRows, centralPlanes: true }));
  ok(doc.appInfo.fileFormatRelease === 4, 'keeping central planes writes release 4');
  ok(doc.params.arrangement.centralPlanes === true, 'the flag rides in arrangement');
  ok(readPreset(doc).centralPlanes === true, 'and reads back true');
  const off = JSON.parse(writePreset({ ...base, cells: '{0}', planeRows }));
  ok(off.appInfo.fileFormatRelease === 3 && off.params.arrangement.centralPlanes === undefined,
     'without it nothing changes: release 3, no flag written');
  ok(readPreset(off).centralPlanes === false, 'absent reads as false');
}

// the old text form still opens, and migrates to rows
{
  const legacy = {
    name: 'legacy', appInfo: { appName: 'x', fileFormatRelease: 1 },
    params: {
      polyhedron: { name: 'custom', file: null },
      symmetry: { polyhedron: 'Ih', stellation: 'I' },
      cells: { selection: '{0}' },
      planes: { text: '# a comment\n0 0 1 1\n1 0 0 0.5 Oh 2\n' },
    },
  };
  const read = readPreset(legacy);
  ok(read.planeRows?.length === 2, 'a release-1 planes.text document still reads');
  ok(read.planeRows[0].normal[2] === 1 && read.planeRows[0].distance === 1 &&
     read.planeRows[0].symmetry === undefined,
     'a bare legacy line becomes a plain row');
  ok(read.planeRows[1].symmetry === 'Oh' && read.planeRows[1].factor === 2,
     'the legacy group and factor tokens migrate');
  // and re-saving it lands in the new form
  const again = JSON.parse(writePreset({ ...base, cells: '{0}', planeRows: read.planeRows }));
  ok(again.params.planes.rows.length === 2 && again.params.planes.text === undefined,
     're-saving a migrated document writes rows, not text');
}

// malformed data is refused, not guessed at
{
  const bad = [
    [[{ normal: [0, 0], distance: 1 }], 'a two-number normal'],
    [[{ normal: [0, 0, 'z'], distance: 1 }], 'a normal with a string in it'],
    [[{ normal: [0, 0, 1] }], 'a missing distance'],
    [[{ normal: [0, 0, 0], distance: 1 }], 'a zero normal'],
    [[{ normal: [0, 0, 1], distance: 1, factor: 'big' }], 'a non-numeric factor'],
    [[{ normal: [0, 0, 1], distance: 1, symmetry: 7 }], 'a non-string symmetry'],
    [['0 0 1 1'], 'a row that is a string'],
    ['not a list', 'rows that are not a list'],
  ];
  let allRefused = true, allNamed = true;
  for (const [rows, what] of bad) {
    let msg = null;
    try { normalizePlaneRows(rows); } catch (e) { msg = e.message; }
    if (!msg) { allRefused = false; console.log('        (accepted ' + what + ')'); }
    else if (Array.isArray(rows) && rows.length && !/plane 1/.test(msg)) allNamed = false;
  }
  ok(allRefused, 'every malformed plane row is refused');
  ok(allNamed, 'the error names which row is at fault');
  // and a document carrying one fails to open rather than building something else
  let refused = false;
  try {
    readPreset({ appInfo: { fileFormatRelease: 3 },
                 params: { planes: { rows: [{ normal: [1, 0], distance: 1 }] } } });
  } catch (e) { refused = /normal must be/.test(e.message); }
  ok(refused, 'a document with a malformed plane refuses to open');
}

/*
 * The coset labeling round-trips, and its absence costs nothing.
 *
 * cosetPlanes records which labeling the coloring wore when the steering tie
 * could not decide — both compounds of five tetrahedra selected at once is
 * the case. It is a preference, not geometry: a reader without it builds the
 * same figure and resolves the tie the old way, so it must ride in release 1
 * and vanish when it has nothing to say.
 */
{
  const labels = [4, 2, 0, 1, 3, 2, 1, 0, 3, 1, 4, 3, 2, 4, 0, 4, 2, 3, 0, 1];
  const doc = JSON.parse(writePreset({ ...base, cells: '{5(1,2)}',
    colorMode: 'coset', cosetSub: 'T', cosetPlanes: labels }));
  ok(doc.appInfo.fileFormatRelease === 1, 'cosetPlanes does not bump the release');
  ok(Array.isArray(doc.params.display.cosetPlanes)
     && doc.params.display.cosetPlanes.join() === labels.join(),
     'the labeling is written, one integer per plane');
  const read = readPreset(doc);
  ok(Array.isArray(read.cosetPlanes) && read.cosetPlanes.join() === labels.join(),
     'and reads back exactly');
  ok(read.cosetSub === 'T', 'beside the subgroup it belongs to');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}',
    colorMode: 'coset', cosetSub: 'T' }));
  ok(doc.params.display.cosetPlanes === undefined,
     'no labeling, no field — the classic envelope is untouched');
  ok(readPreset(doc).cosetPlanes === null, 'and reads back as none');
}

/*
 * The merge-neighbors dial round-trips the same way: a display preference
 * riding in release 1, absent when off, and junk-proof on the way in —
 * a reader without it shows the same figure with the smoothing off.
 */
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}',
    colorMode: 'cosetL', cosetSub: 'O', colorMerge: { on: true, colors: 14 } }));
  ok(doc.appInfo.fileFormatRelease === 1, 'colorMerge does not bump the release');
  ok(doc.params.display.colorMerge
     && doc.params.display.colorMerge.on === true
     && doc.params.display.colorMerge.colors === 14,
     'the dial is written as { on, colors }');
  const read = readPreset(doc);
  ok(read.colorMerge && read.colorMerge.on === true && read.colorMerge.colors === 14,
     'and reads back exactly');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}', colorMode: 'cosetL' }));
  ok(doc.params.display.colorMerge === undefined,
     'merge off, no field — the classic envelope is untouched');
  ok(readPreset(doc).colorMerge === null, 'and reads back as off');
}
/*
 * The hand-painted labeling rides the same way: display-only, release 1,
 * junk-proof. Keys are 'plane.facetIndex'; values a coset, a blend array,
 * or -1 for gray.
 */
{
  const paint = { '0.5': 2, '3.1': [0, 2], '7.4': -1 };
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}',
    colorMode: 'cosetL', cosetSub: 'O', cosetPaint: paint }));
  ok(doc.appInfo.fileFormatRelease === 1, 'cosetPaint does not bump the release');
  ok(JSON.stringify(doc.params.display.cosetPaint) === JSON.stringify(paint),
     'the painted labels are written as given');
  const read = readPreset(doc);
  ok(JSON.stringify(read.cosetPaint) === JSON.stringify(paint), 'and read back exactly');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}', colorMode: 'cosetL' }));
  ok(doc.params.display.cosetPaint === undefined,
     'no paint, no field — the classic envelope is untouched');
  ok(readPreset(doc).cosetPaint === null, 'and reads back as none');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  doc.params.display.cosetPaint = { 'x.y': 1, '2.3': 1.5, '4.5': ['a'], '6.7': 3, '8.9': [1, 2] };
  const read = readPreset(doc);
  ok(read.cosetPaint && Object.keys(read.cosetPaint).length === 2
     && read.cosetPaint['6.7'] === 3 && JSON.stringify(read.cosetPaint['8.9']) === '[1,2]',
     'junk entries are dropped, honest ones survive');
  doc.params.display.cosetPaint = 'painted, honest';
  ok(readPreset(doc).cosetPaint === null, 'junk for the whole field reads as none');
}

{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  doc.params.display.colorMerge = { on: true, colors: 'many' };
  const read = readPreset(doc);
  ok(read.colorMerge && read.colorMerge.on === true && read.colorMerge.colors === 1,
     'a junk colors count falls to 1 — the fewest, never a crash');
  doc.params.display.colorMerge = 'yes please';
  ok(readPreset(doc).colorMerge === null, 'junk for the whole field reads as off');
}
/*
 * The face texture rides the same way: display-only, release 1, absent when
 * none. The file is a bare name into img/textures/ — anything that walks a
 * path is dropped, since a document must not send the app fetching outside
 * its own texture folder.
 */
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}',
    texture: { file: 'checker.png', scale: 2.5 } }));
  ok(doc.appInfo.fileFormatRelease === 1, 'texture does not bump the release');
  ok(doc.params.display.texture
     && doc.params.display.texture.file === 'checker.png'
     && doc.params.display.texture.scale === 2.5,
     'the texture is written as { file, scale }');
  const read = readPreset(doc);
  ok(read.texture && read.texture.file === 'checker.png' && read.texture.scale === 2.5,
     'and reads back exactly');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  ok(doc.params.display.texture === undefined,
     'no texture, no field — the classic envelope is untouched');
  ok(readPreset(doc).texture === null, 'and reads back as none');
}
{
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  doc.params.display.texture = { file: '../../../etc/passwd', scale: 1 };
  ok(readPreset(doc).texture === null, 'a path-walking file name is dropped');
  doc.params.display.texture = { file: 'img/other.png', scale: 1 };
  ok(readPreset(doc).texture === null, 'a path of any kind is dropped');
  doc.params.display.texture = { file: 'checker.png', scale: 'big' };
  const read = readPreset(doc);
  ok(read.texture && read.texture.scale === 1, 'a junk scale falls to 1');
  doc.params.display.texture = 'checker please';
  ok(readPreset(doc).texture === null, 'junk for the whole field reads as none');
}
{
  // a file is anything at all: junk must read as absent, not as a labeling
  const doc = JSON.parse(writePreset({ ...base, cells: '{0}' }));
  doc.params.display.cosetPlanes = ['a', 1, 2];
  ok(readPreset(doc).cosetPlanes === null, 'non-integer labels read as absent');
  doc.params.display.cosetPlanes = 'nonsense';
  ok(readPreset(doc).cosetPlanes === null, 'a stray string reads as absent');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
