/*
 * The two ways a stellation is colored, and nothing else.
 *
 * These lived in render3d.js, next to the shaders that use them. They moved
 * here when the diagram's SVG export became a pure function that node can
 * call: coloring a facet is arithmetic, and a program that writes an SVG on
 * the command line should not have to load a WebGL renderer to do it.
 *
 * render3d.js re-exports both, so `import { layerColor } from './render3d.js'`
 * still means what it always did.
 */

// layer palette — warm at the core, cool further out
export const LAYER_COLORS = [
  [0.98, 0.76, 0.32], [0.95, 0.55, 0.30], [0.88, 0.38, 0.38],
  [0.78, 0.35, 0.55], [0.58, 0.40, 0.72], [0.38, 0.50, 0.80],
  [0.30, 0.65, 0.78], [0.32, 0.72, 0.62], [0.45, 0.75, 0.45],
  [0.68, 0.75, 0.35], [0.85, 0.70, 0.35], [0.70, 0.55, 0.45],
];
export const layerColor = i => LAYER_COLORS[i % LAYER_COLORS.length];

/*
 * The other way to read a stellation: by which face of the original solid a
 * facet lies in.
 *
 * Every facet of the arrangement lies in one of the original face planes, and
 * those planes fall into symmetry classes — the "kinds" of face the solid has.
 * Coloring by class says something the layer palette cannot: this facet and
 * that one, far apart in the model, are the same face of the icosahedron seen
 * twice. An icosahedron has one class, a cuboctahedron two.
 *
 * Hues are spread wide rather than run along a scale, because the classes are
 * unordered — there is no sense in which the squares come "after" the triangles.
 */
export const CLASS_COLORS = [
  [0.42, 0.62, 0.88], [0.92, 0.62, 0.30], [0.45, 0.74, 0.48],
  [0.85, 0.45, 0.52], [0.62, 0.52, 0.82], [0.38, 0.72, 0.74],
  [0.86, 0.76, 0.36], [0.70, 0.58, 0.46],
];

/*
 * Undersides get the same color, darkened.
 *
 * A stellation's boundary uses each plane from both sides: the outward cap of a
 * cell, and the underside of the cell resting above it. They are the same face
 * class, so they take the same hue — but telling them apart is most of what you
 * want to see in a spiky stellation, where the two alternate all over the
 * surface. Multiplying rather than shifting the hue keeps it legible as "the
 * same color, other side" instead of reading as a ninth class.
 *
 * The factor has to clear the shading: the fragment shader already spans a
 * range of brightness with its two lights, so too gentle a step is lost among
 * facets simply tilted away from the key light.
 */
export const UNDERSIDE = 0.55;
export const classColor = (i, top = true) => {
  const c = CLASS_COLORS[i % CLASS_COLORS.length];
  return top ? c : [c[0] * UNDERSIDE, c[1] * UNDERSIDE, c[2] * UNDERSIDE];
};

/*
 * Coset coloring needs as many colors as the subgroup has cosets — two for
 * an index-2 subgroup, five for the five-tetrahedra coloring, ten, sixty —
 * so a fixed list cannot serve. The golden angle can: each hue lands 137.5°
 * past the last, which never repeats and keeps neighbours far apart, however
 * many are asked for. Gray is the non-answer: a cell the subgroup holds
 * invariant, or an orbit the cosets cannot label at all.
 */
export const COSET_GRAY = 0.62;

/** hsl in [0,360),[0,1],[0,1] to rgb triple — the small standard formula */
function hslRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
                  : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m];
}

/** the color of coset i — or gray for -1/null, the cells outside the story */
export function cosetColor(i, top = true) {
  if (i == null || i < 0) {
    const g = top ? COSET_GRAY : COSET_GRAY * UNDERSIDE;
    return [g, g, g];
  }
  const rgb = hslRgb((i * 137.508) % 360, 0.60, 0.55);
  return top ? rgb : rgb.map(v => v * UNDERSIDE);
}
