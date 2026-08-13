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
import { writePreset, readPreset, readDocument, FILE_FORMAT_RELEASE }
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
