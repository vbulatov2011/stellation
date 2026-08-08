/*
 * Load the four .stel sample files the repo ships and rebuild each stellation.
 *   node docs/test/samples.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  buildStellation, extractMesh, parseStel, parseCells, formatCells,
  selectedSubCells, toOFF,
} from '../js/core.js';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..', '..');
const DATA = join(here, '..', 'data');
const SAMPLES = join(here, '..', 'samples');

const geometry = JSON.parse(readFileSync(join(DATA, 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(DATA, 'catalog.json'), 'utf8'));

function findByName(name) {
  for (const cat of catalog)
    for (const item of cat.items)
      if (item.name.toLowerCase() === name.toLowerCase()) return item;
  return null;
}

function loadPoly(key) {
  const g = geometry[key];
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

const cache = new Map();
function build(file, polySym, stellSym) {
  const k = `${file}|${polySym}|${stellSym}`;
  if (cache.has(k)) return cache.get(k);
  const stel = buildStellation(loadPoly(file), symmetry[polySym].matrices, {
    subMatrices: symmetry[stellSym].matrices,
  });
  cache.set(k, stel);
  return stel;
}

for (const fn of readdirSync(SAMPLES).sort()) {
  if (!fn.endsWith('.stel')) continue;
  const text = readFileSync(join(SAMPLES, fn), 'utf8');
  const spec = parseStel(text);
  console.log(`\n=== ${fn}`);
  console.log(`    polyhedron="${spec.polyhedron}"  symmetry=${spec.polySymmetry}/${spec.stellSymmetry}  cells=${spec.cells}`);

  const item = findByName(spec.polyhedron);
  if (!item) { console.log('    !! not in catalog'); continue; }

  const stel = build(item.file, spec.polySymmetry, spec.stellSymmetry);
  console.log(`    -> ${item.file}: ${stel.cellLayers.length} layers, ` +
    `orbits/layer=[${stel.cellLayers.map(l => l.length)}], ` +
    `subcells/layer=[${stel.cellLayers.map(l => l.reduce((s, o) => s + o.subCells.length, 0))}]`);

  const sel = parseCells(stel, spec.cells);
  const subs = selectedSubCells(stel, sel);
  const mesh = extractMesh(subs, stel.pool);
  const roundTrip = formatCells(stel, sel);

  console.log(`    selection: ${sel.size} subcells -> mesh ${mesh.vertices.length} vertices / ${mesh.faces.length} faces`);
  console.log(`    round-trip: ${roundTrip}  ${roundTrip === spec.cells ? 'IDENTICAL' : '(differs from "' + spec.cells + '")'}`);
}
