/*
 * Coset coloring produces the classical pictures.
 *
 *   node docs/test/cosets.mjs
 *
 * The coloring labels PLANES: the compound of five tetrahedra is a partition
 * of the icosahedron's twenty face planes into five sets of four, and the
 * classical five-coloring paints each face by which tetrahedron its plane
 * belongs to. The decisive check is geometric, not a count: the four planes
 * of one label must be the faces of a REGULAR tetrahedron, which means every
 * pair of their normals meets at the tetrahedral angle — dot product exactly
 * -1/3 (or +1/3 where the arrangement orients a normal the other way). Five
 * arbitrary quadruples would pass a counting test; they cannot pass that.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStellation, facePlanes, suggestDepth, cosetClasses,
         facetCosetClasses, parseCellsAny, selectedCells } from '../lib/core.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const geometry = JSON.parse(readFileSync(join(DOCS, 'data', 'geometry.json'), 'utf8'));
const symmetry = JSON.parse(readFileSync(join(DOCS, 'data', 'symmetry.json'), 'utf8'));
const g = geometry.u27;
const vertices = [];
for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
const poly = { vertices, faces: g.f };
const DEPTH = suggestDepth(facePlanes(poly));

const build = (G, H) => buildStellation(poly, symmetry[G].matrices,
  { subMatrices: symmetry[H].matrices, maxIntersection: DEPTH });

const groupsOf = (stel, res) => {
  const by = new Map();
  res.planes.forEach((k, i) => {
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(stel.planes[i]);
  });
  return by;
};

// ------------------------------------------------- I / T: the five tetrahedra

{
  const stel = build('I', 'T');
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  ok(res.count === 5, `[I : T] = 5 — five colors (got ${res.count})`);
  ok(res.planes.length === 20, `twenty planes (got ${res.planes.length})`);
  const by = groupsOf(stel, res);
  ok(!by.has(-1), 'none of the twenty is gray');
  ok(by.size === 5, `five labels (got ${by.size})`);
  ok([...by.values()].every(ps => ps.length === 4), 'four planes each');

  /*
   * Each label's four normals pairwise at the tetrahedral angle. The
   * arrangement orients its normals away from the origin, so a regular
   * tetrahedron's four face normals give |dot| = 1/3 for every pair.
   */
  let tetra = true;
  for (const ps of by.values()) {
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const d = ps[i].n.x * ps[j].n.x + ps[i].n.y * ps[j].n.y + ps[i].n.z * ps[j].n.z;
        if (Math.abs(Math.abs(d) - 1 / 3) > 1e-6) tetra = false;
      }
    }
  }
  ok(tetra, 'each label is a regular tetrahedron of planes — the five-tetrahedra partition');
}

// ------------------------------- I / C5(I): stabilisers the cosets cannot hold

{
  const stel = build('I', 'C5(I)');
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry['C5(I)'].matrices);
  ok(res.count === 12, `[I : C5(I)] = 12 (got ${res.count})`);
  /*
   * A face plane's stabiliser in I is the C3 about its own axis, and no
   * conjugate of C3 fits inside C5 — no representative exists, so the whole
   * orbit is honestly gray rather than wrongly colored.
   */
  ok(res.planes.every(k => k === -1), 'every plane is gray under C5(I)');
}

// -------------------------------------------- Ih / T: reflections in the way

{
  const stel = build('Ih', 'T');
  const res = cosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices);
  ok(res.count === 10, `[Ih : T] = 10 (got ${res.count})`);
  /*
   * Inside the FULL group a face plane's stabiliser is C3v, and T holds no
   * mirror — the tetrahedral coloring cannot exist there, which is why it
   * needs the chiral groups.
   */
  ok(res.planes.every(k => k === -1), 'inside Ih, T grays every plane — the mirrors do not fit');
}

// ------------------------------------------- Ih / Ih: the degenerate index 1

{
  const stel = build('Ih', 'Ih');
  const res = cosetClasses(stel, symmetry.Ih.matrices, symmetry.Ih.matrices);
  ok(res.count === 1, '[Ih : Ih] = 1');
  ok(res.planes.every(k => k === 0),
     'the whole group over itself paints everything the one color');
}

// ------------- built under one group, colored inside another (the UI's shape)

{
  /*
   * The app builds the arrangement under the POLYHEDRON group and colors by
   * cosets inside the STELLATION group. Built under Ih, colored by T inside
   * I: the same five tetrahedra, from an arrangement whose own orbit
   * structure never mentions I.
   */
  const stel = build('Ih', 'I');
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  ok(res.count === 5, 'built under Ih, [I : T] still counts 5 cosets');
  const by = groupsOf(stel, res);
  ok(by.size === 5 && [...by.values()].every(ps => ps.length === 4),
     'and the twenty planes still fall into five tetrahedra of four');
}

// ---------------- coherence: the labels are one partition, not one per shell

{
  /*
   * The bug this construction replaced: coloring cells orbit by orbit, each
   * orbit choosing its own representative, so the five colors shuffled
   * between shells. Plane labels cannot shuffle — every facet at every depth
   * lies in one of the twenty planes — but pin it anyway: the label map is a
   * single global function of the plane, so two runs agree exactly, and the
   * four planes of label 0 stay the four planes of label 0.
   */
  const stel = build('I', 'T');
  const a = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  const b = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  ok(a.planes.every((k, i) => k === b.planes[i]), 'deterministic across runs');
}

// -------------------- the hand: the selection decides between enantiomorphs

{
  /*
   * The twenty planes carry the five-tetrahedra partition TWICE — the two
   * chiral compounds of five tetrahedra share them — and which hand a
   * coloring should use is the figure's property, not the group's. The
   * compound document (Crennell 47, Ef₁) is one specific hand: with its cells
   * passed in, every selected spike cell must have all its upper facets in
   * planes of ONE label — its own tetrahedron — where the wrong hand gives
   * every spike three labels.
   */
  const stel = build('Ih', 'I');
  const doc = JSON.parse(readFileSync(join(DOCS, 'icosahedra', '47-ef1-chiral.json'), 'utf8'));
  const cells = selectedCells(stel, parseCellsAny(stel, doc.params.cells.selection));
  const res = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices, cells);

  const outermost = Math.max(...cells.map(c => c.layer));
  const spikes = cells.filter(c => c.layer === outermost);
  ok(spikes.length === 60, `sixty outermost cells — three to a visual spike (got ${spikes.length})`);
  let clean = 0;
  for (const c of spikes) {
    const labels = new Set();
    for (const f of c.top || []) {
      const k = res.planes[f.plane];
      if (k !== undefined) labels.add(k);
    }
    if (labels.size === 1) clean++;
  }
  ok(clean === 60, `every one of them wears one color (got ${clean} of 60)`);

  // the other hand really is different, and really is worse
  const blind = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices, null);
  const flipped = !blind.planes.every((k, i) => k === res.planes[i]);
  if (flipped) {
    let cleanBlind = 0;
    for (const c of spikes) {
      const labels = new Set();
      for (const f of c.top || []) labels.add(blind.planes[f.plane]);
      if (labels.size === 1) cleanBlind++;
    }
    ok(cleanBlind < 60, `the unguided hand mixes (only ${cleanBlind} clean) — the selection was needed`);
  } else {
    ok(true, 'the unguided pick happened to land on the right hand this time');
  }
}



// --------------------------- the same cosets, per facet instead of per plane

{
  /*
   * Facets are what you are actually looking at, and the only piece small
   * enough to separate two hands lying in the same plane. Three claims, on the case the
   * owner reported: the icosahedron under Ih colored by cosets of I.
   */
  const stel = build('Ih', 'Ih');
  const res = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.I.matrices);
  ok(res.count === 2, `[Ih : I] = 2 — two colors (got ${res.count})`);
  const used = new Set([...res.of.values()].filter(k => k >= 0));
  ok(used.size === 2, 'and both are actually used on the facets');
  const gray = [...res.of.values()].filter(k => k === -1).length;
  ok(gray > 0, `${gray} facets are gray — those a mirror of Ih holds still`);
  /*
   * The planes cannot say any of that: every face plane's stabiliser in Ih is
   * C₃ᵥ, whose mirrors I lacks, so the whole plane coloring grays. This is
   * the difference the smaller piece buys.
   */
  const byPlane = cosetClasses(stel, symmetry.Ih.matrices, symmetry.I.matrices);
  ok(byPlane.planes.every(k => k === -1), 'where the plane coloring grays entirely');
}

{
  // and where the planes DO work, the facets agree with them: I / T, five
  // tetrahedra, no gray either way
  const stel = build('I', 'T');
  const f = facetCosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  ok(f.count === 5, `[I : T] = 5 per facet (got ${f.count})`);
  ok([...f.of.values()].every(k => k >= 0), 'no facet is gray');
  /*
   * Every facet of a plane wears that plane's own label — the smaller piece
   * refines the larger one, it does not contradict it.
   */
  const byPlane = cosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices);
  let agree = true;
  for (const plane of stel.arrangement) {
    for (const facet of plane) {
      if (f.of.get(facet) !== byPlane.planes[facet.plane]) agree = false;
    }
  }
  ok(agree, 'and each facet agrees with the plane it lies in');
}

// -------------- coherence: the facet fallback shares one frame across orbits

{
  /*
   * Ih / T on the compound of five tetrahedra. The planes gray entirely (the
   * mirrors do not fit in T), so the facets are labeled orbit by orbit — and
   * the orbits must AGREE where the figure joins them: every spike of the
   * compound is one tetrahedron's corner, so its cap must be monochrome.
   * Before the caps stitched the orbits together, ten colors appeared and
   * not one of the sixty spikes wore a single one.
   */
  const stel = build('Ih', 'I');
  const doc = JSON.parse(readFileSync(join(DOCS, 'icosahedra', '47-ef1-chiral.json'), 'utf8'));
  const cells = selectedCells(stel, parseCellsAny(stel, doc.params.cells.selection));
  const outermost = Math.max(...cells.map(c => c.layer));
  const spikes = cells.filter(c => c.layer === outermost);

  const spikeReport = (F) => {
    let mono = 0;
    const worn = new Set();
    for (const c of spikes) {
      const seen = new Set();
      for (const f of c.top || []) seen.add(F.of.get(f));
      if (seen.size === 1 && [...seen][0] >= 0) { mono++; worn.add([...seen][0]); }
    }
    return { mono, worn };
  };

  const F = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices, cells);
  ok(F.count === 10, `[Ih : T] = 10 at the facets (got ${F.count})`);
  const r = spikeReport(F);
  ok(r.mono === 60, `every spike monochrome under Ih/T (got ${r.mono} of 60)`);
  ok(r.worn.size === 5, `the five selected tetrahedra wear five of the ten colors (got ${r.worn.size})`);

  // the ten-tetrahedra pairing: Th is the stabiliser of one stella octangula
  const F2 = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.Th.matrices, cells);
  ok(F2.count === 5, `[Ih : Th] = 5 (got ${F2.count})`);
  const r2 = spikeReport(F2);
  ok(r2.mono === 60 && r2.worn.size === 5,
     `and under Th every spike wears its pair's color (${r2.mono} of 60, ${r2.worn.size} colors)`);

  // the steering rides through the plane-anchored path too: per facet under
  // I/T must inherit the HAND the selection chose, not an arbitrary one
  const F3 = facetCosetClasses(stel, symmetry.I.matrices, symmetry.T.matrices, cells);
  const r3 = spikeReport(F3);
  ok(r3.mono === 60, `I/T per facet inherits the steered hand (${r3.mono} of 60 spikes clean)`);

  // deterministic
  const Fb = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices, cells);
  let same = Fb.of.size === F.of.size;
  for (const [f, k] of F.of) if (Fb.of.get(f) !== k) { same = false; break; }
  ok(same, 'the labeling is deterministic across runs');

  // and the flagship regression: Ih / I keeps its two hands and honest gray
  const FI = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.I.matrices, cells);
  const used = new Set(), grays = [...FI.of.values()].filter(k => k === -1).length;
  for (const k of FI.of.values()) if (k >= 0) used.add(k);
  ok(used.size === 2 && grays === 380,
     `Ih / I still gives two hands + 380 mirror-fixed gray (got ${used.size}, ${grays})`);
}

// ---------------- blends: the canonical mix where no crisp labeling exists

{
  /*
   * Ih / T is the case the whole blend exists for: crisply it grays (§ the
   * mirrors), but each plane is contained in exactly one right-handed and
   * one left-handed tetrahedron of the ten translates, so it wears the mix
   * of those two cosets — twenty distinct duotones, and both chiral
   * compounds of five legible on one figure.
   */
  const stel = build('Ih', 'I');
  const r = cosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices);
  ok(r.planes.every(k => k === -1), 'Ih/T: no plane takes a crisp label');
  ok(r.blends.every(b => b && b.length === 2), 'and every plane blends exactly 2 of the 10');
  const sigs = new Set(r.blends.map(b => b.join('+')));
  ok(sigs.size === 20, `all twenty duotones are distinct (got ${sigs.size})`);
  const appear = new Map();
  for (const b of r.blends) for (const k of b) appear.set(k, (appear.get(k) || 0) + 1);
  ok(appear.size === 10 && [...appear.values()].every(n => n === 4),
     'each of the ten cosets shows on exactly its tetrahedron\'s 4 planes');

  // where the mix is total the blend stands down: Ih / I stays honest gray
  const rI = cosetClasses(stel, symmetry.Ih.matrices, symmetry.I.matrices);
  ok(rI.blends.every(b => b === null), 'Ih/I mixes totally — no blend, gray remains');

  // and the facet fallback blends its own gray the same way: the 380
  // mirror-straddling facets under Ih/T each mix a pair of cosets
  const F = facetCosetClasses(stel, symmetry.Ih.matrices, symmetry.T.matrices);
  let pairs = 0, sized = true;
  for (const [f, k] of F.of) {
    if (k !== -1) continue;
    const b = F.blends.get(f);
    if (b) { pairs++; if (b.length !== 2) sized = false; }
  }
  ok(pairs === 380 && sized, `the 380 gray facets blend in pairs (got ${pairs})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
