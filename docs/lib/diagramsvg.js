/*
 * The stellation diagram as vector art.
 *
 * Pure: geometry in, a string of SVG out. No canvas, no DOM, no renderer — so
 * the same function draws the plate you export from the app and the pictures
 * the example pages are built with, and node can call it on the command line.
 * That is the point of it being here rather than a method on DiagramView: a
 * card on a page and a file on your disk cannot drift apart if one function
 * draws both.
 *
 * `data` is what createDiagram() returns: facets with their projected polygons,
 * which shell each belongs to, and which of them the current selection puts on
 * the surface. Nothing about zoom or pan reaches this — the drawing is always
 * the whole plane at its full extent, centered, which is what makes two of them
 * comparable and one of them reproducible. `scale` frames that drawing more
 * tightly or more loosely, but it is a number stated in the options, the same
 * for every plane in an export, not wherever the view happened to be left.
 */

import { layerColor, classColor, cosetColor, faceColor } from './palette.js';

/*
 * Four kinds of ink, each switched and weighted on its own.
 *
 * A stellation diagram is not one drawing but four laid over each other, and
 * which of them you want depends entirely on what the picture is for:
 *
 *   diagram lines  the arrangement — every plane's trace across the face, the
 *                  web the stellation was chosen out of. The whole plane,
 *                  under the figure as well as around it.
 *   faces fill     the regions the figure actually takes, shaded.
 *   facet lines    the divisions INSIDE the figure: an edge where two chosen
 *                  facets meet, which is a line on the finished solid only if
 *                  the two lie in different planes.
 *   face lines     the outline of the figure: an edge with a chosen facet on
 *                  one side and nothing on the other. This is the cut line.
 *
 * The face/facet split is the same distinction the 3-D view draws with its two
 * edge settings, and it is what makes the export useful for making something:
 * a net wants the outline heavy and the internal divisions faint or absent,
 * while a plate for reading wants the arrangement and no outline at all.
 */
/*
 * Three numbers decide the picture's size, and they are deliberately separate.
 *
 *   width, height   the resolution: how many pixels the picture is. The viewBox
 *                   is tied to it one unit per pixel, which is what makes the
 *                   line weights below mean pixels and go on meaning pixels at
 *                   any resolution.
 *   scale           how much of that frame the figure fills. It multiplies the
 *                   drawing's coordinates and nothing else.
 *
 * So resolution and framing are independent — asking for a bigger file does not
 * crop the figure, and cropping in does not change the file — and a line
 * weight is an absolute width on the finished picture rather than a fraction of
 * it that has to be re-guessed every time the resolution changes.
 */
export const DIAGRAM_DEFAULTS = {
  width: 1000,          // the picture, in pixels; the viewBox matches it
  height: 1000,
  scale: 1,             // how much of the frame the figure fills; 1 = fit
  margin: 0.05,         // fraction of the extent left as air around the drawing

  /*
   * The intersections: where every other plane of the arrangement cuts this
   * one, drawn as a line right across the picture rather than chopped into
   * the little regions it bounds. That is how Brückner and Hess engraved
   * their plates, and it is a different drawing from the arrangement below,
   * not a style of it — so it is its own kind of ink, with its own switch and
   * weight, and the two can be drawn together or apart.
   */
  intersectionLines: false,
  intersectionWidth: 0.7,

  diagramLines: true,   // the arrangement, facet by facet
  diagramWidth: 0.7,    // every width is in pixels of the finished picture
  /*
   * Superseded by intersectionLines, and still read: 'full' used to mean
   * "draw the arrangement as whole-plane traces INSTEAD of facet outlines",
   * which is the two kinds above with the first on and the second off. A
   * caller that still says it gets exactly the picture it always got.
   */
  traces: 'facets',

  fill: true,           // the chosen regions, shaded
  colorMode: 'layer',   // 'layer' | 'class' | 'stellClass' | 'none'
  /*
   * The global facet opacity, the same number the 3D view applies over every
   * facet colour. It multiplies each fill's own alpha, so a figure exported
   * at half opacity is half transparent on the page it is placed on — which
   * is only visible at all when `background` is null.
   */
  faceOpacity: 1,

  facetLines: true,     // divisions inside the figure
  facetWidth: 0.7,

  faceLines: true,      // the outline of the figure
  faceWidth: 0.7,

  background: 'white',  // any CSS color, or null for transparent
  ink: '#222',          // the arrangement, where a kind names no color of its own
  figureInk: null,      // the figure's own lines; null follows `ink`
  /*
   * A color per kind of line, each null to follow ink / figureInk as before.
   * The view draws the same four kinds and lets each be colored, and an export
   * that could not say the same thing would be a different picture from the
   * one on screen.
   */
  intersectionColor: null,
  diagramColor: null,
  faceLineColor: null,
  facetLineColor: null,
  metadata: null,       // {…} describing the document, written into the file
};

const fmt = (n) => (Math.abs(n) < 1e-9 ? '0' : +n.toFixed(2));
const rgb = (c) => `rgb(${c.slice(0, 3).map(v => Math.round(v * 255)).join(',')})`;
/** the fill-opacity a group's alpha asks for, under the global one, or nothing at full */
const op = (c, g = 1) => {
  const a = (c[3] == null ? 1 : c[3]) * (g == null ? 1 : g);
  return a >= 1 ? '' : ` fill-opacity="${fmt(a)}"`;
};

function facetGroup(f, data, mode) {
  switch (mode) {
    case 'class': return data.faceClass || 0;
    case 'stellClass': return data.faceClassStell || 0;
    case 'coset': return f.coset ?? -1;
    case 'cosetL': return f.cosetL ?? -1;
    case 'cosetM': return f.cosetM ?? -1;
    case 'orbitP': return f.orbitP ?? 0;
    case 'orbitF': return f.orbitF ?? 0;
    case 'orbitC': return f.orbitC ?? 0;
    default: return f.layer;
  }
}

/** [r, g, b, a] for one region — the Colors panel's overrides included */
function facetColor(f, data, mode) {
  const outward = f.facing !== 0;
  if (mode === 'none') return outward ? [1, 1, 1, 1] : [0.82, 0.82, 0.82, 1];
  return faceColor(mode, facetGroup(f, data, mode), outward);
}

/**
 * Every distinct line the facet edges lie on.
 *
 * The printed plates draw each plane's trace right across the figure, not
 * chopped into the edges of the little regions, and the difference is the
 * whole character of the picture. Deduped by the line's own equation, with a
 * line and its negation treated as one — picking a canonical sign is unstable
 * precisely when a normal component sits near zero, which here is common.
 */
function traceLines(data) {
  const extent = data.extent || 1;
  const angTol = 2e-3, offTol = 1e-3 * extent;
  const out = [];
  const same = (L, a, b, c) =>
    (Math.abs(L[0] - a) < angTol && Math.abs(L[1] - b) < angTol && Math.abs(L[2] - c) < offTol) ||
    (Math.abs(L[0] + a) < angTol && Math.abs(L[1] + b) < angTol && Math.abs(L[2] + c) < offTol);
  for (const facet of data.facets) {
    const p = facet.poly;
    for (let i = 0; i < p.length; i++) {
      const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
      let a = y2 - y1, b = x1 - x2;
      const n = Math.hypot(a, b);
      if (n < 1e-9) continue;
      a /= n; b /= n;
      const c = -(a * x1 + b * y1);
      if (!out.some(L => same(L, a, b, c))) out.push([a, b, c]);
    }
  }
  return out;
}

/**
 * The chosen facets' edges, split into the figure's outline and its insides.
 *
 * An edge with a chosen facet on both sides is interior — a division within
 * the figure. An edge with one side only is on the boundary, and that is the
 * line you would cut. Counting how many chosen facets claim each edge decides
 * it, which needs the two endpoints in a canonical order and rounded, since
 * the same corner reached from two facets is the same projected point to
 * within floating-point noise.
 */
export function figureEdges(facets) {
  const seen = new Map();
  const q = (v) => Math.round(v * 1e6) / 1e6 + 0;
  for (const f of facets) {
    const p = f.poly;
    const out = f.facing !== 0;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      const A = [q(a[0]), q(a[1])], B = [q(b[0]), q(b[1])];
      const flip = A[0] > B[0] || (A[0] === B[0] && A[1] > B[1]);
      const key = flip ? `${B}|${A}` : `${A}|${B}`;
      const e = seen.get(key);
      /*
       * `out` remembers whether anything facing OUTWARD claims this edge. A
       * boundary edge claimed only by an inward-facing region is the rim of a
       * cavity rather than the outside of the solid, and the screen draws it
       * dashed to say so. The SVG reads neither field and is unaffected.
       */
      if (e) { e.n++; if (out) e.out = true; }
      else seen.set(key, { a, b, n: 1, out });
    }
  }
  const border = [], inside = [];
  for (const e of seen.values()) (e.n === 1 ? border : inside).push(e);
  return { border, inside };
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * What the picture was made from, written into the file.
 *
 * An SVG of a stellation diagram is otherwise anonymous: you can see it but
 * you cannot get back to it. These few fields — the solid, the two groups, the
 * depth, the cell string, which plane — are exactly the document that produced
 * it, so the drawing can be rebuilt, checked, or opened again years later.
 */
function metadataBlock(meta) {
  if (!meta) return '';
  const rows = Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `      <stel:${k}>${esc(v)}</stel:${k}>`);
  if (!rows.length) return '';
  return `  <metadata>\n    <stel:stellation xmlns:stel="https://vbulatov2011.github.io/stellation/ns">\n` +
         rows.join('\n') + `\n    </stel:stellation>\n  </metadata>\n`;
}

/** a kind of ink is drawn when it is switched on and has a width to draw with */
const on = (o, kind) => o[`${kind}Lines`] && o[`${kind}Width`] > 0;

/*
 * `traces: 'full'` is the old single switch, and it said two things at once:
 * draw the whole-plane traces, and do not draw the facet outlines. Split in
 * two so the picture can have either, both or neither, with the legacy value
 * still meaning exactly what it meant.
 */
const drawTraces = (o) => (o.traces === 'full' ? on(o, 'diagram') : on(o, 'intersection'));
const drawArrangement = (o) => o.traces !== 'full' && on(o, 'diagram');

/**
 * Would diagramSVG() draw anything at all with these options?
 *
 * Exact, not optimistic: it asks the same questions the drawing does. Turning
 * on the facet outlines is not enough to guarantee ink, because those are the
 * edges WHERE TWO CHOSEN FACETS MEET, and a figure whose regions on this plane
 * do not touch each other has none — which is common, and which would
 * otherwise have the dialog offer to write a blank page.
 */
export function diagramHasInk(data, options = {}) {
  if (!data || !data.facets?.length) return false;
  const o = { ...DIAGRAM_DEFAULTS, ...options };
  // the arrangement and the intersections are there whatever is chosen
  if (drawTraces(o) || drawArrangement(o)) return true;
  // everything else is the figure, so with nothing chosen there is nothing
  const chosen = data.facets.filter(f => f.selected);
  if (!chosen.length) return false;
  if (o.fill) return true;
  if (!on(o, 'facet') && !on(o, 'face')) return false;
  const { border, inside } = figureEdges(chosen);
  return (on(o, 'face') && border.length > 0) || (on(o, 'facet') && inside.length > 0);
}

/** the diagram, as an SVG document */
export function diagramSVG(data, options = {}) {
  if (!data || !data.facets?.length) return '';
  const o = { ...DIAGRAM_DEFAULTS, ...options };
  const W = o.width, H = o.height;
  /*
   * The figure is fitted to the SHORTER side and centered in both, so a picture
   * that is not square is the same drawing with air added, never a squashed
   * one. `scale` then multiplies the fit: above 1 the figure fills more of the
   * frame and eventually runs past it, which the viewBox crops — that is what
   * asking to fill more of the frame means.
   */
  const e = (data.extent || 1) * (1 + o.margin);
  const k = Math.min(W, H) * o.scale / (2 * e);
  const X = (x) => fmt(W / 2 + x * k);
  const Y = (y) => fmt(H / 2 - y * k);
  const path = (p) => 'M' + p.map(([x, y]) => `${X(x)},${Y(y)}`).join('L') + 'Z';

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
    `width="${W}" height="${H}">`,
  ];
  const title = o.metadata?.title;
  if (title) out.push(`  <title>${esc(title)}</title>`);
  const meta = metadataBlock(o.metadata);
  if (meta) out.push(meta.replace(/\n$/, ''));
  if (o.background) out.push(`  <rect width="${W}" height="${H}" fill="${o.background}"/>`);

  const chosen = data.facets.filter(f => f.selected);
  const gA = Math.max(0, Math.min(1, o.faceOpacity ?? 1));

  // the fill first, so every line lies over it
  if (o.fill && gA > 0) {
    for (const f of chosen) {
      if (o.colorMode === 'cosetM' && f.pieces) {
        for (const pc of f.pieces) {
          const c = faceColor(o.colorMode, pc.label ?? -1, f.facing !== 0);
          if (c[3] <= 0) continue;
          out.push(`  <path d="${path(pc.poly)}" fill="${rgb(c)}"${op(c, gA)}/>`);
        }
        continue;
      }
      const c = facetColor(f, data, o.colorMode);
      if (c[3] > 0) out.push(`  <path d="${path(f.poly)}" fill="${rgb(c)}"${op(c, gA)}/>`);
    }
  }

  /*
   * Then the arrangement, then the figure's own lines over it, so an edge of
   * the figure is never broken by a trace crossing it. Each kind is one group,
   * so its stroke is stated once: a deep arrangement runs to thousands of
   * paths and repeating the stroke on every one roughly doubles the file.
   */
  // the intersections, and the arrangement — see legacyFull
  if (drawTraces(o)) {
    /*
     * Each trace is drawn as a chord about its own closest point to the
     * center, long enough to leave the box from there whatever its angle:
     * that distance plus the half-diagonal is an upper bound on the way out
     * to any corner. A single fixed length was enough only while the picture
     * was square and the figure always fitted it.
     */
    const width = o.traces === 'full' ? o.diagramWidth : o.intersectionWidth;
    const stroke = (o.traces === 'full' ? o.diagramColor : o.intersectionColor) || o.ink;
    out.push(`  <g fill="none" stroke="${stroke}" stroke-width="${width}" ` +
             `stroke-linejoin="round">`);
    const half = Math.hypot(W, H) / 2;
    for (const [a, b, c] of traceLines(data)) {
      const x0 = -a * c, y0 = -b * c;
      const px = W / 2 + x0 * k, py = H / 2 - y0 * k;
      const R = Math.hypot(px - W / 2, py - H / 2) + half;
      const dx = -b, dy = a;
      out.push(`    <path d="M${fmt(px - dx * R)},${fmt(py + dy * R)}` +
               `L${fmt(px + dx * R)},${fmt(py - dy * R)}"/>`);
    }
    out.push('  </g>');
  }
  if (drawArrangement(o)) {
    out.push(`  <g fill="none" stroke="${o.diagramColor || o.ink}" ` +
             `stroke-width="${o.diagramWidth}" stroke-linejoin="round">`);
    /*
     * Facet by facet — and the chosen ones are left out whenever the figure
     * is drawing its own edges below, so nothing is stroked twice. At equal
     * widths the groups together are the outline of every facet, which is
     * what this drew before the kinds were separated.
     */
    const mine = (on(o, 'facet') || on(o, 'face'))
      ? data.facets.filter(f => !f.selected)
      : data.facets;
    for (const f of mine) out.push(`    <path d="${path(f.poly)}"/>`);
    out.push('  </g>');
  }

  // the figure: its insides, then its outline on top
  if (chosen.length && (on(o, 'facet') || on(o, 'face'))) {
    const { border, inside } = figureEdges(chosen);
    const seg = (e) => `    <path d="M${X(e.a[0])},${Y(e.a[1])}L${X(e.b[0])},${Y(e.b[1])}"/>`;
    const base = o.figureInk || o.ink;
    for (const [kind, edges] of [['facet', inside], ['face', border]]) {
      if (!on(o, kind) || !edges.length) continue;
      const stroke = o[kind + 'LineColor'] || base;
      out.push(`  <g fill="none" stroke="${stroke}" stroke-width="${o[kind + 'Width']}" ` +
               `stroke-linecap="round" stroke-linejoin="round">`);
      for (const e of edges) out.push(seg(e));
      out.push('  </g>');
    }
  }

  out.push('</svg>');
  return out.join('\n');
}
