/*
 * The examples catalog keeps its promises.
 *
 *   node docs/test/examples.mjs
 *
 * The gallery is hand-edited data, and hand-edited data rots: an entry
 * outlives its file, a tag is invented in one place and never declared, a
 * document stops parsing. None of that shows up until someone opens the
 * page, so it is checked here instead — every entry has its document AND its
 * thumbnail, every document still reads, and every tag is one the catalog
 * declares.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readDocument } from '../app/js/preset.js';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(join(DOCS, 'examples.json'), 'utf8'));

let passed = 0, failed = 0;
function ok(cond, label) {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
}

const items = catalog.items || [];
const tags = catalog.tags || {};

ok(items.length > 0, `${items.length} examples in the catalog`);
ok(Object.keys(tags).length > 0, `${Object.keys(tags).length} tags declared`);

// every declared tag says what it is
{
  const bad = Object.entries(tags).filter(([, v]) => !v || !v.title || !v.blurb).map(([k]) => k);
  ok(bad.length === 0, 'every declared tag has a title and a blurb' + (bad.length ? ` — ${bad}` : ''));
}

// every entry: files present, document readable, tags declared, prose there
{
  let files = true, docs = true, tagged = true, named = true, unique = true;
  const seen = new Set();
  for (const it of items) {
    const where = it.name || it.file;
    if (!existsSync(join(DOCS, it.file)) || !existsSync(join(DOCS, it.file + '.png'))) {
      files = false; console.log(`        (missing document or thumbnail: ${it.file})`);
      continue;
    }
    if (seen.has(it.file)) { unique = false; console.log(`        (listed twice: ${it.file})`); }
    seen.add(it.file);
    if (!it.name || !it.note) { named = false; console.log(`        (no name or note: ${it.file})`); }
    const unknown = (it.tags || []).filter(t => !tags[t]);
    if (!it.tags?.length || unknown.length) {
      tagged = false;
      console.log(`        (${where}: ${unknown.length ? 'undeclared tag ' + unknown : 'no tags'})`);
    }
    try {
      const doc = readDocument(readFileSync(join(DOCS, it.file), 'utf8'));
      // a document is one or the other: a catalog solid, or its own planes
      if (!doc.file && !doc.planeRows && !doc.polyhedron) {
        docs = false; console.log(`        (${where}: names neither a solid nor a plane set)`);
      }
    } catch (e) {
      docs = false; console.log(`        (${where}: ${e.message})`);
    }
  }
  ok(files, 'every entry has its document and its thumbnail');
  ok(unique, 'no document is listed twice');
  ok(named, 'every entry has a name and a note');
  ok(tagged, 'every tag used is one the catalog declares');
  ok(docs, 'every document still reads');
}

// Both document folders hold only what their manifest lists. Either one can
// pick up a stray, because either can be the folder the app last saved into,
// and a document nothing points at is invisible: it ships, and no page ever
// offers it. Catching it here is the difference between "not cataloged yet"
// and "cataloged, one line above".
{
  const { readdirSync } = await import('node:fs');
  const patrol = (folder, listed) => {
    const stray = readdirSync(join(DOCS, folder))
      .filter(n => n.endsWith('.json') && !listed.has(n));
    ok(stray.length === 0,
       `no unlisted documents loose in ${folder}/` + (stray.length ? ` — ${stray}` : ''));
  };
  const manifest = JSON.parse(readFileSync(join(DOCS, 'presets.json'), 'utf8'));
  patrol('presets', new Set(manifest.items.map(i => i.file.split('/').pop())));
  patrol('examples', new Set(items.map(i => i.file.split('/').pop())));
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
