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
 * the whole plane at its full extent, which is what makes two of them
 * comparable and one of them reproducible.
 */

import { layerColor, classColor } from './palette.js';

export const DIAGRAM_DEFAULTS = {
  size: 1000,           // viewBox side; the SVG scales to any display size
  margin: 0.05,         // fraction of the extent left as air around the drawing
  shading: 'fill',      // 'fill' — chosen cells shaded | 'outline' — no fills
  colorMode: 'layer',   // 'layer' | 'class' | 'stellClass' | 'none'
  traces: 'facets',     // 'facets' — the arrangement | 'full' — whole plane traces
  /*
   * Two line weights, because the drawing has two kinds of line and they are
   * wanted at different weights — often at very different weights.
   *
   * `traceWidth` is the arrangement itself: every plane's trace across the
   * face, the web of lines the stellation is chosen from. `facetWidth` is the
   * outline of the facets actually taken, the edges of the figure.
   *
   * Either may be 0, which draws none of that kind. traceWidth 0 is the
   * useful one: it leaves the chosen facets alone on the page, filled or as
   * bare outlines, which is the picture you want for cutting a net or for a
   * figure that has to read at a glance rather than be studied.
   */
  traceWidth: 0.7,      // in viewBox units at size 1000; 0 draws no traces
  facetWidth: 0.7,      // outline of the chosen facets; 0 draws none
  background: 'white',  // any CSS colour, or null for transparent
  ink: '#222',          // the traces
  facetInk: null,       // the chosen facets' outline; null follows `ink`
  metadata: null,       // {…} describing the document, written into the file
};

const fmt = (n) => (Math.abs(n) < 1e-9 ? '0' : +n.toFixed(2));
const rgb = (c) => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;

function facetColor(f, data, mode) {
  const outward = f.facing !== 0;
  if (mode === 'class') return classColor(data.faceClass || 0, outward);
  if (mode === 'stellClass') return classColor(data.faceClassStell || 0, outward);
  if (mode === 'none') return outward ? [1, 1, 1] : [0.82, 0.82, 0.82];
  return layerColor(f.layer);
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

/** would diagramSVG() draw anything at all with these options? */
export function diagramHasInk(data, options = {}) {
  if (!data || !data.facets?.length) return false;
  const o = { ...DIAGRAM_DEFAULTS, ...options };
  if (o.traceWidth > 0) return true;              // the arrangement is always there
  const chosen = data.facets.some(f => f.selected);
  return chosen && (o.shading === 'fill' || o.facetWidth > 0);
}

/** the diagram, as an SVG document */
export function diagramSVG(data, options = {}) {
  if (!data || !data.facets?.length) return '';
  const o = { ...DIAGRAM_DEFAULTS, ...options };
  // one width for both is how this was called before the two were separated
  if (options.lineWidth !== undefined) {
    if (options.traceWidth === undefined) o.traceWidth = options.lineWidth;
    if (options.facetWidth === undefined) o.facetWidth = options.lineWidth;
  }
  const S = o.size;
  const e = (data.extent || 1) * (1 + o.margin);
  const k = S / (2 * e);
  const X = (x) => fmt(S / 2 + x * k);
  const Y = (y) => fmt(S / 2 - y * k);
  const path = (p) => 'M' + p.map(([x, y]) => `${X(x)},${Y(y)}`).join('L') + 'Z';

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">`,
  ];
  const title = o.metadata?.title;
  if (title) out.push(`  <title>${esc(title)}</title>`);
  const meta = metadataBlock(o.metadata);
  if (meta) out.push(meta.replace(/\n$/, ''));
  if (o.background) out.push(`  <rect width="${S}" height="${S}" fill="${o.background}"/>`);

  if (o.shading !== 'outline') {
    for (const f of data.facets) {
      if (!f.selected) continue;
      out.push(`  <path d="${path(f.poly)}" fill="${rgb(facetColor(f, data, o.colorMode))}"/>`);
    }
  }

  /*
   * The lines over the fills, and the arrangement under the figure: traces
   * first, then the chosen facets' own outline on top of them, so an edge of
   * the figure is never broken by a trace crossing it.
   *
   * Each kind is one group, so its stroke is stated once — a deep arrangement
   * runs to thousands of paths and repeating the stroke on every one roughly
   * doubles the file for nothing.
   */
  if (o.traceWidth > 0) {
    out.push(`  <g fill="none" stroke="${o.ink}" stroke-width="${o.traceWidth}" ` +
             `stroke-linejoin="round">`);
    if (o.traces === 'full') {
      // a chord long enough to cross the box from any angle
      const R = S;
      for (const [a, b, c] of traceLines(data)) {
        const x0 = -a * c, y0 = -b * c;
        const px = S / 2 + x0 * k, py = S / 2 - y0 * k;
        const dx = -b, dy = a;
        out.push(`    <path d="M${fmt(px - dx * R)},${fmt(py + dy * R)}` +
                 `L${fmt(px + dx * R)},${fmt(py - dy * R)}"/>`);
      }
    } else {
      /*
       * The chosen facets are left to the group below when it is drawing them,
       * so no edge is stroked twice. At equal widths the two groups together
       * are exactly the outline of every facet, which is what this drew before
       * the weights were separated.
       */
      const mine = o.facetWidth > 0 ? data.facets.filter(f => !f.selected) : data.facets;
      for (const f of mine) out.push(`    <path d="${path(f.poly)}"/>`);
    }
    out.push('  </g>');
  }

  if (o.facetWidth > 0) {
    const chosen = data.facets.filter(f => f.selected);
    if (chosen.length) {
      out.push(`  <g fill="none" stroke="${o.facetInk || o.ink}" ` +
               `stroke-width="${o.facetWidth}" stroke-linejoin="round">`);
      for (const f of chosen) out.push(`    <path d="${path(f.poly)}"/>`);
      out.push('  </g>');
    }
  }

  out.push('</svg>');
  return out.join('\n');
}
