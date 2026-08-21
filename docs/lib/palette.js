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
 * past the last, which never repeats and keeps neighbors far apart, however
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

/*
 * Mixing is done in Oklab, not RGB: golden-angle hues averaged in RGB drift
 * toward mud, where Oklab keeps the mix at the perceptual midpoint of its
 * parents. sRGB in and out; the matrices are Ottosson's.
 */
function rgbOklab([r, g, b]) {
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [x, y, z] = [lin(r), lin(g), lin(b)];
  const l = Math.cbrt(0.4122214708 * x + 0.5363325363 * y + 0.0514459929 * z);
  const m = Math.cbrt(0.2119034982 * x + 0.6806995451 * y + 0.1073969566 * z);
  const s = Math.cbrt(0.0883024619 * x + 0.2817188376 * y + 0.6299787005 * z);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
          1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
          0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
}
function oklabRgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
  const x = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const y = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const z = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const un = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  return [x, y, z].map((c) => Math.min(1, Math.max(0, un(c))));
}

/**
 * The color of coset i — or gray for -1/null, the cells outside the story.
 * An ARRAY of indices is a blend: a piece no single coset can label but a
 * small set can (its own symmetry straddles them), colored as the Oklab
 * average of the members — crisp colorings pass numbers and cost nothing.
 */
export function cosetColor(i, top = true) {
  if (Array.isArray(i) || ArrayBuffer.isView(i)) {
    let L = 0, A = 0, B = 0;
    for (const k of i) {
      const [l, a, b] = rgbOklab(hslRgb((k * 137.508) % 360, 0.60, 0.55));
      L += l; A += a; B += b;
    }
    const n = i.length || 1;
    const rgb = oklabRgb([L / n, A / n, B / n]);
    return top ? rgb : rgb.map(v => v * UNDERSIDE);
  }
  if (i == null || i < 0) {
    const g = top ? COSET_GRAY : COSET_GRAY * UNDERSIDE;
    return [g, g, g];
  }
  const rgb = hslRgb((i * 137.508) % 360, 0.60, 0.55);
  return top ? rgb : rgb.map(v => v * UNDERSIDE);
}
