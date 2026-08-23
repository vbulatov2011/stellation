/*
 * Run the stellation pipeline over every polyhedron in the catalog and report
 * timing, size and any failures. This is what decides which entries the web UI
 * can offer without a wait, and which need a guard.
 *
 *   node docs/test/sweep.mjs [timeBudgetMs]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, extractMesh, facePlanes, suggestDepth } from '../lib/modules.js';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = join(here, '..', 'data');
const geometry = JSON.parse(readFileSync(join(DATA, 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DATA, 'symmetry.json'), 'utf8'));
const catalog = JSON.parse(readFileSync(join(DATA, 'catalog.json'), 'utf8'));

const BUDGET = Number(process.argv[2] || 20000);

function loadPoly(key) {
  const g = geometry[key];
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

const rows = [];
for (const cat of catalog) {
  for (const item of cat.items) {
    if (!geometry[item.file]) { rows.push({ ...item, category: cat.category, error: 'no geometry' }); continue; }
    const poly = loadPoly(item.file);
    const sym = symmetry[item.symmetry];
    if (!sym) { rows.push({ ...item, category: cat.category, error: 'unknown symmetry ' + item.symmetry }); continue; }

    const t0 = Date.now();
    try {
      /*
       * The classic solids build to their full depth, as they always have.
       * A solid marked central needs its cuts — without them this would
       * sweep a different polyhedron — and cuts slice every cell they
       * cross, so those build at the depth the app itself would suggest,
       * which is also what a user picking the solid actually gets.
       */
      const stel = item.central
        ? buildStellation(poly, sym.matrices, { maxLayer: 1000, central: true,
            maxIntersection: suggestDepth(facePlanes(poly, { central: true })) })
        : buildStellation(poly, sym.matrices, { maxLayer: 1000 });
      const ms = Date.now() - t0;
      const layer0 = stel.cellLayers[0] || [];
      const mesh = extractMesh(layer0, stel.pool);
      const totalOrbits = stel.cellLayers.reduce((s, l) => s + l.length, 0);
      rows.push({
        ...item, category: cat.category, ms,
        planes: stel.planes.length,
        facets0: stel.arrangement[0].length,
        totalFacets: stel.arrangement.reduce((s, a) => s + a.length, 0),
        layers: stel.cellLayers.length,
        orbits: totalOrbits,
        coreV: mesh.vertices.length, coreF: mesh.faces.length,
      });
    } catch (e) {
      rows.push({ ...item, category: cat.category, ms: Date.now() - t0, error: String(e.message || e) });
    }
  }
}

rows.sort((a, b) => (b.ms || 0) - (a.ms || 0));
const errs = rows.filter(r => r.error);
const ok = rows.filter(r => !r.error);

console.log(`total ${rows.length}   ok ${ok.length}   errors ${errs.length}`);
console.log(`\nslowest 15:`);
for (const r of rows.slice(0, 15)) {
  console.log(`  ${String(r.ms).padStart(7)}ms  ${r.file}  ${r.symmetry.padEnd(4)} planes=${String(r.planes ?? '-').padStart(3)} facets/plane=${String(r.facets0 ?? '-').padStart(5)} layers=${String(r.layers ?? '-').padStart(3)} orbits=${String(r.orbits ?? '-').padStart(4)}  ${r.name}${r.error ? '  ERROR: ' + r.error : ''}`);
}
if (errs.length) {
  console.log(`\nerrors:`);
  for (const r of errs) console.log(`  ${r.file} ${r.symmetry} (${r.name}) -> ${r.error}`);
}
const slow = ok.filter(r => r.ms > BUDGET);
console.log(`\nover ${BUDGET}ms budget: ${slow.length}`);
for (const r of slow) console.log(`  ${r.ms}ms ${r.file} ${r.name}`);

writeFileSync(join(here, 'sweep-report.json'), JSON.stringify(rows, null, 1));
console.log('\nwrote docs/test/sweep-report.json');
