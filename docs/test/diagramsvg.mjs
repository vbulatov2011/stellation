/*
 * The stellation diagram as SVG: what goes in the file, and what does not.
 *
 *   node docs/test/diagramsvg.mjs
 *
 * Two things the picture has to be able to say, and one it must not say by
 * accident. It has to be able to have no background at all, so the diagram
 * can be laid over a page; and it has to carry the figure's opacity, so a
 * solid drawn half-transparent beside it does not appear here fully painted.
 * What it must not do is emit those attributes when nothing asked for them —
 * a plain opaque diagram should be exactly the file it always was.
 */

import { diagramSVG } from '../lib/diagramsvg.js';
import { setColorOverrides } from '../lib/palette.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};

/* a two-region diagram: one chosen, one not, on shells 0 and 1 */
const DATA = {
  extent: 1,
  facets: [
    { poly: [[-1, -1], [1, -1], [0, 1]], selected: true,  facing: 1, layer: 0 },
    { poly: [[-1, 1], [1, 1], [0, -1]],  selected: true,  facing: 1, layer: 1 },
    { poly: [[-1, -1], [-1, 1], [1, 0]], selected: false, facing: 1, layer: 0 },
  ],
};
const build = (o) => diagramSVG(DATA, { width: 200, height: 200, colorMode: 'layer', ...o });
const fills = (svg) => svg.match(/<path[^>]*fill="rgb\([^)]*\)"[^>]*\/>/g) || [];
const rects = (svg) => svg.match(/<rect[^>]*\/>/g) || [];
const opacityOf = (tag) => {
  const m = tag.match(/fill-opacity="([\d.]+)"/);
  return m ? Number(m[1]) : null;
};

// ------------------------------------------------------------- background

{
  const white = build({ background: 'white' });
  ok(rects(white).length === 1 && /fill="white"/.test(rects(white)[0]),
     'a background colour is one rect behind everything');

  const none = build({ background: null });
  ok(rects(none).length === 0, 'background null writes no rect at all — the page shows through');
  ok(fills(none).length === 2, `and the two chosen regions are still drawn (got ${fills(none).length})`);
}

// -------------------------------------------------- the figure's opacity

{
  const full = build({ background: null, faceOpacity: 1 });
  ok(fills(full).every(t => opacityOf(t) === null),
     'at full opacity no fill-opacity is written — the file is what it always was');
  ok(build({ background: null }) === full,
     'and omitting faceOpacity means the same as asking for 1');

  const half = build({ background: null, faceOpacity: 0.5 });
  ok(fills(half).length === 2 && fills(half).every(t => opacityOf(t) === 0.5),
     'at 0.5 every chosen region carries fill-opacity="0.5"');

  const none = build({ background: null, faceOpacity: 0 });
  ok(fills(none).length === 0, 'at 0 the fills are left out rather than written invisible');

  // the lines are the drawing, not the paint: they do not fade with it
  const lines = (svg) => (svg.match(/<g /g) || []).length;
  ok(lines(half) === lines(full) && lines(half) > 0,
     `the lines are unaffected by it (${lines(half)} groups either way)`);
}

// ------------------------------- a group's own alpha, under the global one

{
  /*
   * The Colors panel can make one shell translucent by itself. That alpha and
   * the global opacity are different things and have to multiply, or setting
   * one would quietly cancel the other.
   */
  setColorOverrides(new Map([['layer:0', [0.9, 0.2, 0.2, 0.5]]]));
  try {
    const own = build({ background: null, faceOpacity: 1 });
    const shell0 = fills(own).find(t => /rgb\(230,51,51\)/.test(t));
    ok(shell0 && opacityOf(shell0) === 0.5,
       'a group set to half in the Colors panel exports at half');

    const both = build({ background: null, faceOpacity: 0.5 });
    const shell0b = fills(both).find(t => /rgb\(230,51,51\)/.test(t));
    ok(shell0b && opacityOf(shell0b) === 0.25,
       'and at half global opacity the two multiply to a quarter');

    const other = fills(both).find(t => !/rgb\(230,51,51\)/.test(t));
    ok(other && opacityOf(other) === 0.5,
       'while a group with no alpha of its own takes the global one alone');
  } finally {
    setColorOverrides(null);
  }
}

// ------------------------------------------- intersections and arrangement
/*
 * Two kinds of ink over the same plane, and they are different drawings:
 * the intersections run right across the picture, the arrangement is the
 * facets outlined one by one. Either, both or neither, each with its own
 * weight — and the single `traces: 'full'` switch they replaced still says
 * what it always said.
 */
{
  const widths = (svg) => (svg.match(/<g fill="none"[^>]*stroke-width="[\d.]+"/g) || [])
    .map(g => Number(g.match(/stroke-width="([\d.]+)"/)[1]));
  const opts = { background: null, faceLines: false, facetLines: false, fill: false };

  const arrangementOnly = build({ ...opts });
  ok(widths(arrangementOnly).length === 1 && widths(arrangementOnly)[0] === 0.7,
     'by default the arrangement is drawn and the intersections are not');

  const both = build({ ...opts, intersectionLines: true, intersectionWidth: 2.5 });
  ok(JSON.stringify(widths(both)) === JSON.stringify([2.5, 0.7]),
     'switched on, the intersections are their own group at their own weight, drawn first');

  const traceOnly = build({ ...opts, intersectionLines: true, intersectionWidth: 2.5,
                            diagramLines: false });
  ok(JSON.stringify(widths(traceOnly)) === JSON.stringify([2.5]),
     'and the arrangement can be turned off under them');

  const neither = build({ ...opts, diagramLines: false });
  ok(widths(neither).length === 0, 'with both off there is no arrangement ink at all');

  const zeroWidth = build({ ...opts, intersectionLines: true, intersectionWidth: 0 });
  ok(widths(zeroWidth).length === 1,
     'a weight of zero is off, the same as for every other kind');

  // the switch they replaced
  const legacy = build({ ...opts, traces: 'full', diagramWidth: 1.4 });
  ok(JSON.stringify(widths(legacy)) === JSON.stringify([1.4]),
     "traces:'full' still means whole-plane traces INSTEAD of facet outlines");
  const legacyOff = build({ ...opts, traces: 'full', diagramLines: false });
  ok(widths(legacyOff).length === 0, "and traces:'full' still answers to the diagram switch");
}

// ------------------------------------------------------------- the verdict

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
