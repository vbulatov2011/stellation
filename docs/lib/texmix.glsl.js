/*
 * The texture layer's fragment code, shared by the solid's shader and the
 * diagram's preview so the two can never disagree.
 *
 * A fragment on a plane samples every COPY the decals of its plane orbit
 * make — one per (decal, stabilizer element), see lib/decals.js — through a
 * uniform affine map from the chart frame into the image, so a drag moves
 * the picture by re-uploading a few vec4s and nothing else. The copies are
 * then ordered by depth: each decal has a stack level and a tilt, a
 * direction in its own image space, so the depth of a copy at a pixel is
 *   z = level + tilt · dot(direction, imagePoint)
 * and two symmetric copies that overlap weave over and under each other
 * (the tilt travels with the copies, so the rule is equivariant and no draw
 * order sneaks in). Copies at exactly the same depth — the flat copies of a
 * single decal — cannot be ordered, and are mixed the way coset colors are
 * mixed: alpha-weighted in Oklab, with the union of their coverages.
 *
 * Texels are premultiplied throughout; the result is premultiplied too.
 *
 * Expects MAX_COPIES, MAX_DECALS and MAX_RANGE defined, and the varying
 * vTexRange = (start, count): the slice of uCopy that is this face's orbit.
 */
export const TEXMIX_GLSL = /*glsl*/`
uniform highp sampler2DArray uTexArr;
// per copy: (a, b, tx, decal index) (c, d, ty, -) — chart uv ↦ image uv
uniform vec4 uCopy[2 * MAX_COPIES];
// per decal: (layer, level, tilt.x, tilt.y) (tilt amount, tile, opacity, -)
uniform vec4 uDecal[2 * MAX_DECALS];
flat in vec2 vTexRange;

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// Ottosson's matrices, the same numbers palette.js mixes the cosets with
vec3 rgbToOklab(vec3 rgb) {
  vec3 c = srgbToLinear(clamp(rgb, 0.0, 1.0));
  vec3 lms = vec3(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b,
                  0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b,
                  0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b);
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return vec3(0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
              1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
              0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}
vec3 oklabToRgb(vec3 lab) {
  vec3 lms = vec3(lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z,
                  lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z,
                  lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z);
  lms = lms * lms * lms;
  vec3 c = vec3( 4.0767416621 * lms.x - 3.3077115913 * lms.y + 0.2309699292 * lms.z,
                -1.2684380046 * lms.x + 2.6097574011 * lms.y - 0.3413193965 * lms.z,
                -0.0041960863 * lms.x - 0.7034186147 * lms.y + 1.7076147010 * lms.z);
  return clamp(linearToSrgb(clamp(c, 0.0, 1.0)), 0.0, 1.0);
}

vec4 texMix(vec2 uv) {
  int start = int(vTexRange.x + 0.5);
  int count = min(int(vTexRange.y + 0.5), MAX_RANGE);
  // the screen-space footprint of uv, mapped through each copy for the
  // mip level — explicit, so neither the loop nor fract() disturbs it
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  vec4 col[MAX_RANGE];
  float zs[MAX_RANGE];
  int n = 0;
  for (int i = 0; i < MAX_RANGE; i++) {
    if (i >= count) break;
    int ci = 2 * (start + i);
    vec4 c0 = uCopy[ci], c1 = uCopy[ci + 1];
    int di = 2 * int(c0.w + 0.5);
    vec4 d0 = uDecal[di], d1 = uDecal[di + 1];
    vec2 q = vec2(c0.x * uv.x + c0.y * uv.y + c0.z, c1.x * uv.x + c1.y * uv.y + c1.z);
    bool tile = d1.y > 0.5;
    float inside = tile ? 1.0
      : step(0.0, q.x) * step(q.x, 1.0) * step(0.0, q.y) * step(q.y, 1.0);
    vec2 gx = vec2(c0.x * dx.x + c0.y * dx.y, c1.x * dx.x + c1.y * dx.y);
    vec2 gy = vec2(c0.x * dy.x + c0.y * dy.y, c1.x * dy.x + c1.y * dy.y);
    vec4 t = textureGrad(uTexArr, vec3(tile ? fract(q) : q, d0.x), gx, gy) * (d1.z * inside);
    if (t.a > 0.0005) {
      vec2 tc = vec2(2.0 * q.x - 1.0, 1.0 - 2.0 * q.y);   // image space, y up
      col[n] = t;
      zs[n] = d0.y + d1.x * dot(d0.zw, tc);
      n++;
    }
  }
  // insertion sort, back-most first
  for (int i = 1; i < MAX_RANGE; i++) {
    if (i >= n) break;
    vec4 kc = col[i];
    float kz = zs[i];
    int j = i - 1;
    for (int k = 0; k < MAX_RANGE; k++) {
      if (j < 0 || zs[j] <= kz) break;
      col[j + 1] = col[j];
      zs[j + 1] = zs[j];
      j--;
    }
    col[j + 1] = kc;
    zs[j + 1] = kz;
  }
  // composite back to front; a run of equal depths is one mixed contribution
  vec4 acc = vec4(0.0);
  int i = 0;
  for (int guard = 0; guard < MAX_RANGE; guard++) {
    if (i >= n) break;
    int j = i + 1;
    for (int k = 0; k < MAX_RANGE; k++) {
      if (j >= n || zs[j] - zs[i] > 1e-4) break;
      j++;
    }
    vec4 grp = col[i];
    if (j > i + 1) {
      vec3 lab = vec3(0.0);
      float aSum = 0.0, clear = 1.0;
      for (int k = 0; k < MAX_RANGE; k++) {
        int m = i + k;
        if (m >= j) break;
        vec4 t = col[m];
        lab += rgbToOklab(t.rgb / t.a) * t.a;
        aSum += t.a;
        clear *= 1.0 - t.a;
      }
      float U = 1.0 - clear;
      grp = vec4(oklabToRgb(lab / aSum) * U, U);
    }
    acc = grp + acc * (1.0 - grp.a);
    i = j;
  }
  return acc;
}
`;
