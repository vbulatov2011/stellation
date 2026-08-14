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

import { readFileSync, readdirSync } from 'node:fs';
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

// every shipped preset still loads, and stays release 1
{
  const dir = join(DOCS, 'presets');
  const files = readdirSync(dir).filter(n => n.endsWith('.json'));
  let all = true, allR1 = true;
  for (const f of files) {
    const raw = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    if ((raw.appInfo?.fileFormatRelease ?? 1) !== 1) allR1 = false;
    try {
      const d = readDocument(readFileSync(join(dir, f), 'utf8'));
      if (!d.cells || d.cellsIndexing !== null) all = false;
    } catch { all = false; }
  }
  ok(files.length >= 8, `${files.length} shipped presets found`);
  ok(all, 'every shipped preset reads as sub-indexed');
  ok(allR1, 'every shipped preset is release 1');
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
