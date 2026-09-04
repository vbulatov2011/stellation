/*
 * The renderer's shaders (lib/render3d.js), GLSL ES 3.00 in template
 * strings: the solid's vertex and fragment programs, the diagram's preview
 * pass over the texture layer, and the screen-space line quads for edges.
 * The texture layer's mixing code they share is texmix.glsl.mjs.
 *
 * The two fragment shaders that read the texture layer take the #defines
 * the renderer sizes to the GPU's uniform budget (MAX_COPIES, MAX_DECALS,
 * MAX_RANGE), so they are functions of that text rather than strings.
 */

import { TEXMIX_GLSL } from './texmix.glsl.mjs';

export const VERT = /*glsl*/`#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
// rgbA: the fourth component is the group's own opacity. Buffers that upload
// only three (edges, cylinders, mirror discs, axes) get w = 1 by GL default.
in vec4 aColor;
// the chart coordinates, the ink tint — the texture palette's color for this
// facet's group — and which slice of the copy table is this facet's plane
// orbit. Buffers that carry none of these read zeros and the sample is
// gated off by uTexOn in the fragment shader.
in vec2 aUV;
in vec4 aTexTint;
in vec2 aTexRange;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vNormal;
out vec4 vColor;
out vec3 vEye;
out vec2 vUV;
out vec4 vTexTint;
flat out vec2 vTexRange;
void main() {
  vec4 p = uView * vec4(aPos, 1.0);
  vEye = p.xyz;
  vNormal = mat3(uView) * aNormal;
  vColor = aColor;
  vUV = aUV;
  vTexTint = aTexTint;
  vTexRange = aTexRange;
  gl_Position = uProj * p;
}`;

// the fragment shader is sized to the GL limits it is compiled under: the
// copy and decal tables are uniform arrays (see the renderer's constructor)
export const FRAG = (defs) => /*glsl*/`#version 300 es
${defs}
precision highp float;
in vec3 vNormal;
in vec4 vColor;
in vec3 vEye;
in vec2 vUV;
in vec4 vTexTint;
uniform float uEdgeDark;
uniform float uAlpha;      // the global facet opacity: a modifier over every color
// The face texture, folded into the color BEFORE lighting. The layer's
// value at this fragment comes from texMix (texmix.glsl.mjs): every copy of
// every decal on this face's plane orbit, depth-sorted and composited, with
// rgb PREMULTIPLIED by alpha, which keeps every formula one line and
// filtered glyph edges free of fringes. The ink is first colorized by its
// group's tint (the texture palette, vTexTint) and faded by the tint's own
// alpha times the texture opacity dial; then:
//   tint    — the ink multiplies the face color, transparency fading the
//             multiplier to 1: face · ((1-a) + ink)
//   stamp   — the ink lies OVER the face, source-over: face·(1-a) + ink
//   replace — the ink IS the face: what the image leaves clear is not
//             there at all, and the fragment carries the ink's coverage
// uTexOn gates it per draw call — the same program also draws tubes, axes
// and mirror discs, whose buffers carry no texture coordinates.
uniform float uTexOn;
uniform float uTexMode;    // 0 tint · 1 stamp · 2 replace
uniform float uTexAlpha;   // the texture layer's own opacity dial
${TEXMIX_GLSL}
out vec4 fragColor;
void main() {
  vec3 n = normalize(vNormal);
  // two-sided: stellation cells are open shells seen from both sides
  if (!gl_FrontFacing) n = -n;
  vec3 L1 = normalize(vec3(-0.35, 0.55, 0.9));
  vec3 L2 = normalize(vec3(0.6, -0.3, 0.4));
  float d = max(dot(n, L1), 0.0) * 0.85 + max(dot(n, L2), 0.0) * 0.25;
  vec3 V = normalize(-vEye);
  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(n, H), 0.0), 48.0) * 0.35;
  vec3 base = vColor.rgb;
  float aOut = vColor.a;
  if (uTexOn > 0.5) {
    vec4 t = texMix(vUV);                        // rgb premultiplied by t.a
    float f = vTexTint.a * uTexAlpha;
    vec3 ink = t.rgb * vTexTint.rgb * f;         // still premultiplied
    float a2 = t.a * f;
    if (uTexMode < 0.5) {
      base = vColor.rgb * (vec3(1.0 - a2) + ink);
    } else if (uTexMode < 1.5) {
      base = vColor.rgb * (1.0 - a2) + ink;
    } else {
      // straight color for the blender: the premultiplication cancels
      base = ink / max(a2, 1e-4);
      aOut = a2;
    }
  }
  vec3 c = base * (0.34 + d) + spec;   // keep shadowed faces light enough that black edges still read
  // slight rim to separate touching facets
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12;
  fragColor = vec4(c + rim, aOut * uAlpha);
}`;

/*
 * The diagram's preview of the texture layer: the same texMix, run over a
 * rectangle of one plane's chart frame into an offscreen buffer and read
 * back for the diagram to draw. One shader for the solid and the preview,
 * so the two cannot disagree about an overlap.
 */
export const PREVIEW_VERT = /*glsl*/`#version 300 es
precision highp float;
in vec2 aPos;
uniform vec4 uRect;      // x0, y0, x1, y1 of the chart frame
uniform vec2 uRange;     // the plane orbit's slice of the copy table
out vec2 vUV;
flat out vec2 vTexRange;
void main() {
  vec2 t = (aPos + 1.0) * 0.5;
  // the first row read back is the buffer's bottom, so it gets the rect's TOP
  vUV = vec2(mix(uRect.x, uRect.z, t.x), mix(uRect.w, uRect.y, t.y));
  vTexRange = uRange;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const PREVIEW_FRAG = (defs) => /*glsl*/`#version 300 es
${defs}
precision highp float;
in vec2 vUV;
${TEXMIX_GLSL}
out vec4 fragColor;
void main() {
  vec4 t = texMix(vUV);
  fragColor = vec4(t.rgb / max(t.a, 1e-4), t.a);   // straight alpha, for an ImageData
}`;

/*
 * Edges are drawn as screen-space quads, not GL_LINES.
 *
 * gl.lineWidth() is a lie on essentially every desktop GL implementation: the
 * core profile only has to support a width of 1.0, and ANGLE clamps it there,
 * so asking for thicker lines silently changes nothing. The fix is to expand
 * each edge into a quad in clip space, offsetting the corners along the screen
 * normal of the segment, which gives real, controllable thickness everywhere.
 */
export const LINE_VERT = /*glsl*/`#version 300 es
precision highp float;
in vec3 aA;          // segment start, model space
in vec3 aB;          // segment end
in float aSide;      // -1 / +1, which side of the segment this corner sits on
in float aEnd;       // 0 at A, 1 at B
uniform mat4 uProj;
uniform mat4 uView;
uniform vec2 uViewport;
uniform float uWidth;   // half-width, device pixels
void main() {
  vec4 ca = uProj * uView * vec4(aA, 1.0);
  vec4 cb = uProj * uView * vec4(aB, 1.0);
  vec2 sa = ca.xy / max(ca.w, 1e-6) * uViewport;
  vec2 sb = cb.xy / max(cb.w, 1e-6) * uViewport;
  vec2 dir = sb - sa;
  dir = length(dir) < 1e-6 ? vec2(1.0, 0.0) : normalize(dir);
  vec2 nrm = vec2(-dir.y, dir.x) * aSide * uWidth / uViewport;
  vec4 c = mix(ca, cb, aEnd);
  c.xy += nrm * c.w;
  gl_Position = c;
}`;

export const LINE_FRAG = /*glsl*/`#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;
