/*
 * A small self-contained WebGL renderer for stellated polyhedra.
 *
 * Deliberately dependency-free: the shapes are flat-shaded polygon soups, which
 * needs far less than a general 3D engine, and a static page with no build step
 * loads instantly.
 *
 * Faces are given per-face flat normals and a per-face colour keyed to the
 * stellation layer, so you can read the structure of a stellation by eye.
 */

import { AnimatedPointer } from './AnimatedPointer.js';

const VERT = /*glsl*/`#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
in vec3 aColor;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vNormal;
out vec3 vColor;
out vec3 vEye;
void main() {
  vec4 p = uView * vec4(aPos, 1.0);
  vEye = p.xyz;
  vNormal = mat3(uView) * aNormal;
  vColor = aColor;
  gl_Position = uProj * p;
}`;

const FRAG = /*glsl*/`#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vColor;
in vec3 vEye;
uniform float uEdgeDark;
uniform float uAlpha;      // 1 for solids; mirror-plane discs draw translucent
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
  vec3 c = vColor * (0.34 + d) + spec;   // keep shadowed faces light enough that black edges still read
  // slight rim to separate touching facets
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12;
  fragColor = vec4(c + rim, uAlpha);
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
const LINE_VERT = /*glsl*/`#version 300 es
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

const LINE_FRAG = /*glsl*/`#version 300 es
precision highp float;
uniform vec4 uColor;
out vec4 fragColor;
void main() { fragColor = uColor; }`;

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
 * Colouring by class says something the layer palette cannot: this facet and
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
 * Undersides get the same colour, darkened.
 *
 * A stellation's boundary uses each plane from both sides: the outward cap of a
 * cell, and the underside of the cell resting above it. They are the same face
 * class, so they take the same hue — but telling them apart is most of what you
 * want to see in a spiky stellation, where the two alternate all over the
 * surface. Multiplying rather than shifting the hue keeps it legible as "the
 * same colour, other side" instead of reading as a ninth class.
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
 * When a new selection is allowed to re-fit the frame — see setMesh().
 *
 * `fill` is the content radius over the viewport's world half-height, so 1.0 is
 * a model whose corners exactly touch the frame. The band is deliberately wide:
 * inside it, toggling a cell moves the camera not at all, which is the point.
 *
 * The upper bound sits just under 1 because past it the model is being cut off,
 * and clipping is worse than a re-fit. The lower bound is looser — a model at a
 * third of the frame is small but perfectly readable, and only below that is it
 * worth the motion.
 */
const FILL_MAX = 0.98;
const FILL_MIN = 0.35;

/*
 * The trackball, in one place — see _pointerStep.
 *
 * DRAG_RATE converts a pixel of virtual-pointer travel into radians of turn,
 * and so is also the conversion between the simulation's units (pixels per
 * second) and the spin rate on screen.
 *
 * SPIN_CUTOFF is the release speed below which a drag counts as placing the
 * solid rather than throwing it, in radians per second. 0.3 is the value
 * notes/java-drag-fix.md arrived at for the Java app, where a careful
 * positioning drag was measured at 0.019 rad/s and a flick well above this.
 *
 * The physics is critically damped while dragging (factor 2), which settles as
 * fast as possible without ringing — overshoot on a trackball reads as the
 * model wobbling loose rather than as smoothing. Free friction is zero, so a
 * throw spins until caught.
 *
 * springForce is the one number worth understanding. Under a steady drag the
 * mass settles at a constant distance behind the pointer, and that lag has time
 * constant `dragFrictionFactor / sqrt(springForce)` — which is all the spring
 * contributes to the feel. SymmHub's default of 200 gives 141 ms, and a brisk
 * 600 px/s drag then trails the cursor by 85 pixels: not smoothing but visible
 * rubber-banding. 2500 gives 40 ms and 24 px, a shade crisper than the 55 ms
 * first-order filter this replaced, which is the right end to err on for a
 * trackball you are trying to aim.
 */
const DRAG_RATE = 0.008;
const SPIN_CUTOFF = 0.3;
const POINTER_PHYSICS = {
  springForce: 2500,
  dragFrictionFactor: 2.0,
  freeFrictionFactor: 0,
};

/*
 * One palette for the two gestures, shared by all three views.
 *
 * Adding is green and carving is red — the natural reading — and the same two
 * colours mean the same two things whether you are pointing at the solid, the
 * diagram or a box in the Cells table.
 *
 * `off` is what a modifier gets when the gesture cannot do anything from here —
 * nothing left to add, or nothing behind the face to remove. Dimming rather
 * than hiding still tells you where you are pointing, but says the click is
 * going to be a no-op before you spend it.
 */
export const ACTION = {
  add:    { rgb: [0.29, 0.80, 0.44], css: '#4acb70', off: 'rgba(74,203,112,0.30)' },
  remove: { rgb: [0.94, 0.33, 0.33], css: '#f05454', off: 'rgba(240,84,84,0.30)' },
  none:   { rgb: [1.00, 0.93, 0.30], css: '#ffee4d', off: 'rgba(255,238,77,0.30)' },
  /*
   * The diagram's two gestures are TOGGLES — of the cell beneath the plane and
   * of the cell resting on it — not an add and a remove, so green and red would
   * lie there: «don't use the red and green because it's confusing; in 3D view
   * those colors mean deleting and adding». Gold for beneath (toward the core's
   * warm end of the layer palette), blue for above (the cool end).
   */
  below:  { rgb: [0.96, 0.82, 0.30], css: '#f5d24d', off: 'rgba(245,210,77,0.30)' },
  above:  { rgb: [0.30, 0.64, 0.96], css: '#4da3f5', off: 'rgba(77,163,245,0.30)' },
};

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error('link: ' + gl.getProgramInfoLog(p));
  }
  return p;
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser');

    this.prog = program(gl, VERT, FRAG);
    this.lineProg = program(gl, LINE_VERT, LINE_FRAG);

    this.vao = gl.createVertexArray();
    this.posBuf = gl.createBuffer();
    this.normBuf = gl.createBuffer();
    this.colBuf = gl.createBuffer();
    this.count = 0;

    /*
     * Edges come in two kinds, drawn from two buffers — see setMesh.
     *
     * Every facet of the surface lies in one of the original face planes. Where
     * two facets of DIFFERENT planes meet there is a real crease, an edge of the
     * solid: a "face edge". Where two facets of the SAME plane meet the surface
     * is flat across the join and the line is pure subdivision, an artefact of
     * how the plane arrangement was cut up: a "facet edge". Drawing both in one
     * colour, as this used to, buries the shape of the solid in the arrangement
     * that produced it.
     */
    const segBufs = () => ({ a: gl.createBuffer(), b: gl.createBuffer(), side: gl.createBuffer(), end: gl.createBuffer() });
    this.faceLineVao = gl.createVertexArray();
    this.faceLineBufs = segBufs();
    this.faceLineCount = 0;
    this.facetLineVao = gl.createVertexArray();
    this.facetLineBufs = segBufs();
    this.facetLineCount = 0;
    this.edgeWidth = 1.0;   // CSS pixels of total line width, scaled by dpr at draw

    this.modelScale = 0;   // sticky; see setMesh() and fit()
    this.rotation = quatFromEuler(-0.42, 0.6, 0);
    this.distance = 1.0;   // relative zoom; the fit distance is computed per frame
    /*
     * Spin is opt-in. A model turning by itself is motion the reader did not
     * ask for: it moves while you are trying to read it, it never settles on
     * the view you want, and on a page of figures several of them turn at once.
     * The app has always set this false; the figure pages each defaulted it on
     * and had to be told otherwise, which is the wrong way round.
     */
    this.autoRotate = false;
    this.showEdges = true;
    this.colorMode = 'layer';  // 'layer' | 'class' — see setColorMode
    this.lastFaceClass = null;
    this.elements = null;      // symmetry axes / mirrors / Sn axes, see setElements
    this.elemCount = 0;
    this.discCount = 0;
    this.background = [0.055, 0.06, 0.078];
    this.edgeColor = [0.0, 0.0, 0.0, 1.0];

    /*
     * Per-kind overrides. `color: null` and `width: null` mean "follow
     * edgeColor / edgeWidth", which is what keeps the figure pages working
     * unchanged — they set edgeWidth and know nothing about the two kinds.
     *
     * Facet edges default to a grey rather than black: they are the subdivision
     * of the arrangement, and reading them as quieter than the solid's own
     * edges is the point of separating them at all. Blending is only enabled
     * around the mirror discs, so these stay opaque and the distinction is
     * carried by colour and width, not alpha.
     */
    this.faceEdges = { show: true, color: null, width: null };
    this.facetEdges = { show: true, color: [0.42, 0.44, 0.50, 1.0], width: null };

    this._installControls();
    this._raf = null;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /**
   * The symmetry elements of the current group, as solid geometry.
   *
   *   elements.axes    [{dir}]  proper rotation axes      → teal tubes
   *   elements.improper[{dir}]  rotoreflection (Sn) axes  → violet tubes
   *   elements.mirrors [{dir}]  mirror-plane normals      → translucent discs
   *
   * Everything is depth-tested against the solid, so an element behind a cell is
   * hidden by it and you can read which way it actually runs.
   */
  setElements(elements) {
    this.elements = elements || null;
    this._buildElements();
    this.draw();
  }

  _buildElements() {
    const gl = this.gl;
    const el = this.elements;
    const tubes = { pos: [], norm: [], col: [] };
    const discs = { pos: [], norm: [], col: [] };
    if (el) {
      /*
       * Sized to the current selection, reaching a little past it. They do
       * rescale when the selection's extent changes. That was looked at and
       * left alone: sizing them to the whole arrangement instead keeps them
       * still but makes them dwarf a small selection, which is worse.
       */
      const R = Math.max(1e-3, (this.lastMaxR || 1) * (this.modelScale || 1));
      const ext = R * 1.12;
      const rad = R * 0.014;
      // every element carries its own colour: inequivalent elements differ
      for (const a of (el.axes || [])) tube(tubes, a.dir, ext, rad, a.rgb || [0.25, 0.72, 0.95]);
      for (const a of (el.improper || [])) tube(tubes, a.dir, ext * 0.94, rad * 0.9, a.rgb || [0.72, 0.45, 0.95]);
      /*
       * A mirror plane's rim is a thin TORUS of the same thickness as the axis
       * cylinders, so the two kinds of element match. The flat annulus it
       * replaces vanished when seen edge-on, collapsing to an infinitely thin
       * line; a torus reads from every direction. The faint translucent fill
       * stays — it makes the plane itself legible without hiding the solid.
       */
      for (const m of (el.mirrors || [])) {
        torus(tubes, m.dir, ext * 0.92, rad, m.rgb || [0.42, 0.90, 0.80]);
        disc(discs, m.dir, ext * 0.92, m.rgb || [0.42, 0.88, 0.80]);
      }
    }
    const put = (which, data, count) => {
      if (!this[which + 'Vao']) {
        this[which + 'Vao'] = gl.createVertexArray();
        this[which + 'Bufs'] = { p: gl.createBuffer(), n: gl.createBuffer(), c: gl.createBuffer() };
      }
      const b = this[which + 'Bufs'];
      gl.bindVertexArray(this[which + 'Vao']);
      for (const [buf, arr, name] of [[b.p, data.pos, 'aPos'], [b.n, data.norm, 'aNormal'], [b.c, data.col, 'aColor']]) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
        const l = gl.getAttribLocation(this.prog, name);
        if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); }
      }
      this[count] = data.pos.length / 3;
    };
    put('elem', tubes, 'elemCount');
    put('disc', discs, 'discCount');
    gl.bindVertexArray(null);
  }

  /**
   * Canonical orientation: x to the right, y up, z toward the viewer — the
   * frame the symmetry groups' matrices are written in, so a subgroup's axes
   * point where the group says they do.
   */
  home() {
    this._ease({ rotation: [0, 0, 0, 1], distance: 1.0 });
  }

  /*
   * Ease `distance` (and optionally the orientation) to a target.
   *
   * Snapping is disorienting: the solid you were looking at is replaced by a
   * differently-sized one and you have to find your place again, so fit and
   * home ease rather than jump. Any drag, wheel or second press cancels it, so
   * the animation never fights the pointer.
   */
  _ease(target, ms = 420) {
    if (this._anim) cancelAnimationFrame(this._anim);
    this._pointerReset();          // an easing view must not be fought by a spin
    const d0 = this.distance;
    const q0 = this.rotation.slice();
    const q1 = target.rotation;
    const d1 = target.distance ?? d0;
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // easeInOutCubic
      this.distance = d0 + (d1 - d0) * k;
      if (q1) this.rotation = slerp(q0, q1, k);
      this.draw();
      if (u < 1) this._anim = requestAnimationFrame(step);
      else this._anim = null;
    };
    this._anim = requestAnimationFrame(step);
  }

  /** stop any easing — called when the pointer takes over */
  cancelEase() { if (this._anim) { cancelAnimationFrame(this._anim); this._anim = null; } }

  /** ease the zoom until the whole selection is framed */
  fit() {
    if (!this.mesh) return;
    // screen size goes as R / (distance * fit), so distance = R frames it
    const R = Math.max(1e-6, (this.lastMaxR || 1) * (this.modelScale || 1));
    this._ease({ distance: Math.min(40, Math.max(0.05, R)) });
  }

  /** forget the scale so the next mesh sets it — used when the solid changes */
  resetScale() { this.modelScale = 0; this.frameR = 0; }

  /*
   * The view as five numbers — orientation and zoom — so it can be put in a URL
   * and in a saved document, and a link shows the recipient the same picture.
   * Four decimals is well inside what the eye can tell apart and keeps the hash
   * short.
   */
  getView() {
    return [...this.rotation, this.distance].map(v => Math.round(v * 1e4) / 1e4);
  }

  setView(v) {
    if (!Array.isArray(v) || v.length < 5 || v.some(x => !Number.isFinite(x))) return false;
    const n = Math.hypot(v[0], v[1], v[2], v[3]);
    if (!(n > 1e-6)) return false;
    this.rotation = [v[0] / n, v[1] / n, v[2] / n, v[3] / n];
    this.distance = Math.min(40, Math.max(0.05, v[4]));
    this._pointerReset();
    this.draw();
    return true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.draw();
  }

  /**
   * upload a mesh: {vertices:[{x,y,z}], faces:[[i,...]]} plus a layer per face.
   *
   * `faceClass` is optional and carries the other colouring: {classes, top},
   * one entry per face — which symmetry class of original face the facet lies
   * in, and whether it is an outward cap or an underside. Callers that do not
   * have it (the walkthrough and the Brückner and historical figures) simply
   * get the layer palette, whatever colorMode says.
   */
  setMesh(mesh, faceLayers, faceClass = null) {
    const gl = this.gl;
    const pos = [], norm = [], col = [];
    this.pickTris = [];      // {a,b,c, face} in model space, for ray picking
    this.mesh = mesh;
    this.lastFaceLayers = faceLayers;
    this.lastFaceClass = faceClass;
    const byClass = this.colorMode === 'class' && faceClass;
    /*
     * key -> {a, b, plane, uses, crease}. A Set of seen keys was enough when
     * every edge was drawn the same; telling the two kinds apart needs to know
     * which planes met there, so the first sighting records the plane and later
     * ones compare against it.
     */
    const edges = new Map();
    const planes = faceClass?.planes || null;

    /*
     * The model scale is sticky.
     *
     * Renormalising to the current mesh on every change means adding one shell
     * shrinks everything already on screen, so the solid you are working on
     * jumps about while you build it and the core never stays put. Instead the
     * scale is fixed when the arrangement is built and left alone; `fit()`
     * rescales on demand.
     */
    let maxR = 1e-9;
    for (const v of mesh.vertices) maxR = Math.max(maxR, Math.hypot(v.x, v.y, v.z));
    this.lastMaxR = maxR;
    const firstMesh = !this.modelScale;
    if (firstMesh) this.modelScale = 1 / maxR;

    /*
     * Framing, for callers that did not pin one with setFrameRadius().
     *
     * The app pins it, so that adding a shell never rescales what is already on
     * screen. Nobody else does: the walkthrough and the Brückner and historical
     * figures all leave it unset, and it used to fall back to the constant 1 —
     * the first mesh's radius, since modelScale normalises it. A figure that
     * opened on the core therefore stayed framed for the core forever, and
     * selecting a cell in an outer layer drew it seven times outside the
     * viewport.
     *
     * `distance` is what actually sets apparent size (see _camera: the F in
     * `dist` cancels against the F in `zoom`, so only distance survives), so it
     * is the thing that has to follow the content, not frameR alone.
     *
     * But it must not follow it on every toggle. Refitting each time means the
     * whole model changes size whenever an outer cell goes on or off, and the
     * jump reads as the model changing rather than the selection. So the frame
     * is left alone while the content still sits comfortably inside it, and is
     * only re-fitted — eased, never snapped — when the content has grown enough
     * to be cut off, or shrunk enough to be a speck. Between those, toggling a
     * cell moves nothing.
     *
     * Reframing is safe here in a way it would not have been before: under the
     * parallel projection it is a flat 2-D scale and cannot alter the shape of
     * anything, which is precisely why the old camera went to such lengths to
     * hold its distance constant.
     */
    if (!this._frameWorldR) {
      const contentR = maxR * this.modelScale;
      this.frameR = contentR;                 // depth bracket follows the content
      if (firstMesh) {
        this.distance = contentR;             // opening view: nothing on screen to jar
      } else {
        const W = this.canvas.width || this.canvas.clientWidth || 1;
        const H = this.canvas.height || this.canvas.clientHeight || 1;
        const fill = contentR / this._camera(W, H).halfH;   // 1.0 touches the frame edge
        if (fill > FILL_MAX || fill < FILL_MIN) this._ease({ distance: contentR }, 300);
      }
    }
    const s = this.modelScale;

    mesh.faces.forEach((face, fi) => {
      const c = byClass
        ? classColor(faceClass.classes[fi] || 0, faceClass.top ? faceClass.top[fi] !== false : true)
        : layerColor(faceLayers ? faceLayers[fi] : 0);
      const p = face.map(i => mesh.vertices[i]);
      // flat normal from the first non-degenerate corner
      let nx = 0, ny = 0, nz = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        nx += (a.y - b.y) * (a.z + b.z);
        ny += (a.z - b.z) * (a.x + b.x);
        nz += (a.x - b.x) * (a.y + b.y);
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      for (let i = 1; i < p.length - 1; i++) {
        const tri = [p[0], p[i], p[i + 1]];
        for (const v of tri) {
          pos.push(v.x * s, v.y * s, v.z * s);
          norm.push(nx, ny, nz);
          col.push(c[0], c[1], c[2]);
        }
        this.pickTris.push({
          a: [tri[0].x * s, tri[0].y * s, tri[0].z * s],
          b: [tri[1].x * s, tri[1].y * s, tri[1].z * s],
          c: [tri[2].x * s, tri[2].y * s, tri[2].z * s],
          face: fi,
        });
      }
      for (let i = 0; i < p.length; i++) {
        const ia = face[i], ib = face[(i + 1) % face.length];
        const key = ia < ib ? `${ia}_${ib}` : `${ib}_${ia}`;
        const seen = edges.get(key);
        if (seen === undefined) {
          const a = p[i], b = p[(i + 1) % p.length];
          edges.set(key, {
            a: [a.x * s, a.y * s, a.z * s],
            b: [b.x * s, b.y * s, b.z * s],
            plane: planes ? planes[fi] : -1,
            uses: 1,
            crease: false,
          });
        } else {
          seen.uses++;
          if (!planes || seen.plane !== planes[fi]) seen.crease = true;
        }
      }
    });

    /*
     * Split the edges into the two buckets.
     *
     * An edge is a face edge when the facets meeting along it lie in different
     * planes — a genuine crease — and a facet edge when they share a plane and
     * the surface runs flat across it.
     *
     * An edge used by only ONE facet is a face edge too. The boundary surface
     * is normally closed, so this is rare, but where it happens the line is the
     * open rim of the surface and unmistakably part of the solid's outline, not
     * an internal subdivision.
     *
     * With no plane data — the figure pages do not send it — everything lands
     * in the face bucket, which draws exactly what this used to.
     */
    const faceLines = [], facetLines = [];
    for (const e of edges.values()) {
      const bucket = (!planes || e.crease || e.uses === 1) ? faceLines : facetLines;
      bucket.push(e.a, e.b);
    }

    const upload = (vao, buf, loc, data, size, prog) => {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(prog, loc);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); }
    };

    upload(this.vao, this.posBuf, 'aPos', pos, 3, this.prog);
    upload(this.vao, this.normBuf, 'aNormal', norm, 3, this.prog);
    upload(this.vao, this.colBuf, 'aColor', col, 3, this.prog);
    this.count = pos.length / 3;

    this.faceLineCount = this._uploadSegments(this.faceLineVao, this.faceLineBufs, faceLines);
    this.facetLineCount = this._uploadSegments(this.facetLineVao, this.facetLineBufs, facetLines);

    gl.bindVertexArray(null);
    // the elements are sized to the arrangement, so they follow it as it grows
    if (this.elements) this._buildElements();
    this.draw();
  }

  /**
   * Switch between colouring by shell and by face class.
   *
   * Re-uploads from the mesh already held rather than asking the worker for it
   * again: nothing about the geometry changes, only the colour attribute. The
   * rebuild costs what one selection toggle costs, and it happens once per menu
   * change, so it is not worth a separate colour-only path through setMesh.
   *
   * Framing is untouched because the content is identical — the fill fraction
   * setMesh tests against is exactly what it was, so no re-fit is triggered.
   */
  setColorMode(mode) {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    if (this.mesh) this.setMesh(this.mesh, this.lastFaceLayers, this.lastFaceClass);
  }

  /** expand [[x,y,z],[x,y,z], …] segment pairs into two triangles each */
  _uploadSegments(vao, bufs, segs) {
    const gl = this.gl;
    const n = segs.length / 2;
    const A = new Float32Array(n * 6 * 3);
    const B = new Float32Array(n * 6 * 3);
    const S = new Float32Array(n * 6);
    const E = new Float32Array(n * 6);
    //  corners:  (A,-1) (A,+1) (B,-1)   (B,-1) (A,+1) (B,+1)
    const SIDE = [-1, 1, -1, -1, 1, 1];
    const END  = [0, 0, 1, 1, 0, 1];
    for (let i = 0; i < n; i++) {
      const a = segs[i * 2], b = segs[i * 2 + 1];
      for (let k = 0; k < 6; k++) {
        const o = (i * 6 + k) * 3;
        A[o] = a[0]; A[o + 1] = a[1]; A[o + 2] = a[2];
        B[o] = b[0]; B[o + 1] = b[1]; B[o + 2] = b[2];
        S[i * 6 + k] = SIDE[k];
        E[i * 6 + k] = END[k];
      }
    }
    gl.bindVertexArray(vao);
    const bind = (buf, data, name, size) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const l = gl.getAttribLocation(this.lineProg, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); }
    };
    bind(bufs.a, A, 'aA', 3);
    bind(bufs.b, B, 'aB', 3);
    bind(bufs.side, S, 'aSide', 1);
    bind(bufs.end, E, 'aEnd', 1);
    gl.bindVertexArray(null);
    return n * 6;
  }

  draw() {
    const gl = this.gl;
    const W = this.canvas.width, H = this.canvas.height;
    gl.viewport(0, 0, W, H);
    gl.clearColor(...this.background, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);          // shells are visible from both sides
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.count) return;

    const cam = this._camera(W, H);
    // A parallel projection has no eye to fall behind, so the near plane may sit
    // behind the origin: bracket the scene symmetrically and nothing can clip.
    const proj = orthographic(cam.halfH, cam.aspect, cam.dist - cam.depth, cam.dist + cam.depth);
    const view = mat4mul(translation(0, 0, -cam.dist), quatToMat4(this.rotation));

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uProj'), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uView'), false, view);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
    gl.bindVertexArray(this.vao);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.2, 1.2);      // sink the faces so edges sit cleanly on top
    gl.drawArrays(gl.TRIANGLES, 0, this.count);
    gl.disable(gl.POLYGON_OFFSET_FILL);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const drawLines = (vao, count, rgba, cssWidth) => {
      gl.useProgram(this.lineProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uProj'), false, proj);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.lineProg, 'uView'), false, view);
      gl.uniform4f(gl.getUniformLocation(this.lineProg, 'uColor'), ...rgba);
      gl.uniform2f(gl.getUniformLocation(this.lineProg, 'uViewport'), W, H);
      gl.uniform1f(gl.getUniformLocation(this.lineProg, 'uWidth'), cssWidth * dpr);
      gl.bindVertexArray(vao);
      gl.drawArrays(gl.TRIANGLES, 0, count);
    };

    /*
     * Facet edges first, face edges over them: where the two would contend for
     * the same pixels the solid's own edges should win.
     */
    const drawEdges = (spec, vao, count) => {
      if (!this.showEdges || !spec.show || !count) return;
      drawLines(vao, count, spec.color || this.edgeColor, spec.width ?? this.edgeWidth);
    };
    drawEdges(this.facetEdges, this.facetLineVao, this.facetLineCount);
    drawEdges(this.faceEdges, this.faceLineVao, this.faceLineCount);
    /*
     * Symmetry elements are real geometry, drawn into the same depth buffer as
     * the solid, so an axis that runs behind a cell is hidden by it. Drawn as
     * overlaid lines they were close to useless, because nothing occluded them:
     * you could not tell which side of the solid an axis came out of. Building
     * them as convex segments means the existing viewer handles them.
     */
    if (this.elemCount) {
      gl.useProgram(this.prog);
      gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
      gl.bindVertexArray(this.elemVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.elemCount);
    }
    // mirror planes last: translucent, so they must read over what is behind
    // them without writing depth, or the discs would hide each other
    if (this.discCount) {
      gl.useProgram(this.prog);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      // faint, because they stack: fifteen planes at 0.06 still reach ~0.6
      gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 0.06);
      gl.bindVertexArray(this.discVao);
      gl.drawArrays(gl.TRIANGLES, 0, this.discCount);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
    }

    if (this.hlCount) {
      gl.disable(gl.DEPTH_TEST);
      drawLines(this.hlVao, this.hlCount, this.hlColor || [1.0, 0.93, 0.3, 1.0], 3.2);
      gl.enable(gl.DEPTH_TEST);
    }
    gl.bindVertexArray(null);
  }

  /**
   * The camera. Orthographic.
   *
   * The projection is parallel, so there is no eye point to be swallowed and no
   * foreshortening to keep constant. That removes a whole class of bug rather
   * than balancing it: a cell in the outermost layer of a deep arrangement is
   * far larger than the fitted camera distance, so under perspective the eye
   * ended up *inside* the selected cell and the view turned inside out — the
   * walkthrough's first figure, selecting in layer 7.
   *
   * It also settles the problems logged on 6 August, which were all the same
   * problem: perspective that depended on something other than the solid.
   *
   *  - `fit` from `min(fovy, fovx)` meant fovx, and so the camera, depended on
   *    the aspect ratio — vertical lines visibly bent while dragging the
   *    splitter.
   *  - `R` floored at 1 left the camera too far back for a small selection, so
   *    toggling the core on and off changed the foreshortening.
   *  - Any camera move changes the perspective of everything that did *not*
   *    change, which is why toggling one cell appeared to distort the rest.
   *
   * Under a parallel projection none of those can happen: shape does not depend
   * on distance, so zooming cannot change it, and framing is pure 2-D scale.
   * `dist` survives only to place the view along -Z and to centre the depth
   * range; it no longer affects what anything looks like.
   *
   * `halfH` is the world half-height the viewport shows, and is the only thing
   * that sets apparent size. It keeps the framing the previous perspective
   * camera produced (`dist * tan(fovy/2) / zoom`), so `fit()`, the wheel and
   * saved view hashes all carry over unchanged.
   *
   * `depth` half-brackets the scene for near/far, and is also how far back
   * `pick()` starts its ray — with no eye point, the ray must simply begin
   * outside the solid.
   */
  _camera(W, H) {
    const fovy = Math.PI / 4.5;                     // retained: sets the framing constant
    const aspect = W / H;
    const fit = 1.13 / Math.sin(fovy / 2);          // constant: no aspect, no zoom
    const F = Math.max(1e-3, this.frameR || (this.lastMaxR || 1) * (this.modelScale || 1));
    const meshR = Math.max(1e-3, (this.lastMaxR || 1) * (this.modelScale || 1));
    // A canvas narrower than it is tall sees less sideways than fovy allows;
    // scale the projection down to compensate.
    const narrow = Math.min(1, aspect / Math.cos(fovy / 2));
    const dist = fit * F;
    const zoom = (F / this.distance) * narrow;
    return { fovy, aspect, fit, R: F, meshR, dist, zoom,
             halfH: dist * Math.tan(fovy / 2) / zoom,
             depth: Math.max(F, meshR) * 3 + 10 };
  }

  /**
   * Radius of the whole buildable arrangement, in world units, set once per
   * build. Everything the user can ever select fits inside it, so a camera
   * placed for it is never inside the solid and never needs to move.
   */
  setFrameRadius(worldR) {
    this._frameWorldR = worldR > 0 ? worldR : 0;
    if (this.modelScale && this._frameWorldR) this.frameR = this._frameWorldR * this.modelScale;
  }

  // ---------------------------------------------------------------- picking

  /**
   * Which face of the solid is under the pointer.
   *
   * The camera sits at the origin of view space looking down -Z, so the ray
   * through a pixel is trivial there; we push it back into model space with the
   * inverse of the view transform (a rotation, so its transpose) and hit-test
   * the triangles directly. A few thousand triangles is nothing per click, and
   * this keeps picking exact rather than reading back pixel ids.
   */
  pick(e) {
    if (!this.pickTris?.length) return null;
    const r = this.canvas.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = 1 - ((e.clientY - r.top) / r.height) * 2;

    const cam = this._camera(this.canvas.width, this.canvas.height);
    // Parallel projection: every ray runs down -Z and it is the *origin* that
    // moves with the pointer, the reverse of a perspective pick. cam.halfH is
    // the same value the projection was built from, so picking and drawing
    // cannot disagree at any zoom.
    const originView = [nx * cam.halfH * cam.aspect, ny * cam.halfH, cam.dist + cam.depth];
    const dirView = [0, 0, -1];

    const R = quatToMat4(this.rotation);
    const origin = rotT(R, originView);
    const dir = rotT(R, dirView);

    let best = null;
    for (const tri of this.pickTris) {
      const hit = rayTriangle(origin, dir, tri.a, tri.b, tri.c);
      if (hit !== null && (best === null || hit < best.t)) best = { t: hit, face: tri.face };
    }
    return best;
  }

  /**
   * Outline one face, or clear with -1.
   *
   * `action` is 'add' | 'remove' | null and picks the colour; `enabled` false
   * dims it, meaning "you are pointing at this, but the click would do nothing".
   */
  setHighlight(faceIndex, action = null, enabled = true) {
    const want = `${faceIndex}|${action}|${enabled ? 1 : 0}`;
    const a = ACTION[action] || ACTION.none;
    this.hlColor = enabled ? [...a.rgb, 1.0] : [...a.rgb, 0.34];
    if (this._hl === want) { this.draw(); return; }
    this._hl = want;
    const gl = this.gl;
    const pts = [];
    if (faceIndex >= 0 && this.mesh) {
      // must be the same scale the mesh was uploaded at, or the outline floats
      // away from the face it is meant to mark
      const s = this.modelScale || 1;
      const face = this.mesh.faces[faceIndex];
      if (face) {
        for (let i = 0; i < face.length; i++) {
          const a = this.mesh.vertices[face[i]], b = this.mesh.vertices[face[(i + 1) % face.length]];
          pts.push([a.x * s, a.y * s, a.z * s], [b.x * s, b.y * s, b.z * s]);
        }
      }
    }
    if (!this.hlVao) {
      this.hlVao = gl.createVertexArray();
      this.hlBufs = { a: gl.createBuffer(), b: gl.createBuffer(), side: gl.createBuffer(), end: gl.createBuffer() };
    }
    this.hlCount = this._uploadSegments(this.hlVao, this.hlBufs, pts);
    gl.bindVertexArray(null);
    this.draw();
  }

  /*
   * Pointer smoothing and momentum: AnimatedPointer drives the trackball.
   *
   * A mouse reports in uneven jumps — three pixels, then five — and applying
   * each jump directly makes the solid stutter. So the solid does not follow
   * the real pointer at all. It follows a virtual one, a unit mass on a spring
   * whose far end is the real pointer, damped by fluid friction. What we turn
   * the model by each frame is how far that mass moved.
   *
   * This replaced a first-order filter that banked the motion and spent a fixed
   * fraction of it per frame. That could not overshoot, which was its virtue,
   * but momentum had to be bolted on separately at release — and it arrived as
   * two different behaviours either side of a speed threshold: a hard flick got
   * a constant-rate spin at a capped speed, a soft one got a fixed 0.11 s of
   * glide. A throw twice as hard produced exactly the same spin as one just
   * over the line.
   *
   * The spring has no such seam. Releasing the button only switches the spring
   * off; the mass keeps whatever speed it had, so the spin is as fast as the
   * throw was, with no cap and no second code path. It also costs no extra
   * state: drag smoothing and free spin are the same two lines of physics with
   * one term present or absent.
   *
   * `freeFrictionFactor: 0` is the deliberate choice. Undamped free motion is
   * how the Java applet behaved and what notes/java-drag-fix.md settled on —
   * "a real flick keeps the solid spinning until you catch it". Raise it if you
   * want a spin that dies out on its own.
   */
  _pointerStep(nowMs) {
    const ap = this._ap;
    if (!ap || !ap.isPlaced()) return false;
    ap.calculate(nowMs);
    const [x, y] = ap.getPnt();
    const last = this._apLast;
    if (!last) { this._apLast = { x, y }; return false; }
    const dx = (x - last.x) * DRAG_RATE, dy = (y - last.y) * DRAG_RATE;
    last.x = x; last.y = y;
    if (dx === 0 && dy === 0) return false;
    this.rotation = quatMul(
      quatMul(quatFromAxis([0, 1, 0], dx), quatFromAxis([1, 0, 0], dy)),
      this.rotation);
    return true;
  }

  /** drop any momentum and re-anchor, so an animation is not fought by a spin */
  _pointerReset() {
    this._ap?.stop();
    this._ap?.synchronize();
    this._apLast = null;
  }

  start() {
    if (this._raf) return;
    let last = performance.now();
    const tick = (t) => {
      const dt = Math.min((t - last) / 1000, 0.05); last = t;
      if (this.autoRotate && !this.dragging) {
        this.rotation = quatMul(quatFromAxis([0, 1, 0], dt * 0.35), this.rotation);
      }
      this._pointerStep(t);
      this.draw();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  stop() { if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; } }

  _installControls() {
    const c = this.canvas;

    // A modifier means "I am pointing at a cell", not "turn the model" — that is
    // what keeps picking and orbiting out of each other's way. The same two
    // gestures mean the same two things in all three views: shift adds a cell
    // with everything holding it up, the carve modifier removes it with
    // everything resting on it. On Windows and Linux that modifier is ctrl; on
    // macOS ctrl-click is the OS secondary click and never arrives as a click,
    // so option and cmd stand in for it there (and see the contextmenu handler).
    const picking = (e) => e.shiftKey || e.ctrlKey || e.metaKey || e.altKey;
    const mods = (e) => {
      const shift = e.shiftKey;
      return { shift, ctrl: !shift && (e.ctrlKey || e.metaKey || e.altKey), alt: e.altKey };
    };

    this._ap = AnimatedPointer(POINTER_PHYSICS);
    this._apLast = null;

    const down = (e) => {
      if (picking(e) || e.button === 2) return;
      this.cancelEase();
      this.dragging = true;
      const p = point(e, c);
      // Catching the solid stops it: put the mass on the pointer with no
      // momentum, so the grab is where you grabbed and not where a spin had
      // carried the lag to.
      this._ap.setMouse(p.x, p.y);
      this._ap.synchronize();
      this._ap.stop();
      this._apLast = { x: p.x, y: p.y };
      this._ap.setDragState(true);
      c.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!this.dragging) {
        this._lastMove = e;
        const hit = picking(e) ? this.pick(e) : null;
        c.style.cursor = hit ? 'crosshair' : 'grab';
        // the app knows whether the gesture can actually do anything here, so it
        // owns the highlight colour; without it, fall back to a plain outline
        if (this.onPickHover) this.onPickHover(hit, mods(e));
        else this.setHighlight(hit ? hit.face : -1);
        return;
      }
      // Trackball: the drag direction turns the solid about the perpendicular
      // axis. Only the far end of the spring is set here — the rotation itself
      // happens in _pointerStep, off the simulated mass.
      const p = point(e, c);
      this._ap.setMouse(p.x, p.y);
      if (!this._raf) { this._pointerStep(performance.now()); this.draw(); }
    };
    const up = (e) => {
      if (this.dragging) {
        /*
         * Let go of the spring and the mass carries on by itself. All that is
         * left to decide is whether this was a throw or a placement.
         *
         * Without a floor, it is always a throw: a careful one-pixel
         * positioning drag leaves a few pixels per second on the mass and the
         * solid creeps away from the view you just set up. That is exactly the
         * fault notes/java-drag-fix.md diagnosed in the Java app, where the
         * cutoff was so low that every drag left it turning. The threshold here
         * is that note's tuned value, converted from radians back to pixels.
         */
        const [vx, vy] = this._ap.getSpeed();
        if (Math.hypot(vx, vy) * DRAG_RATE < SPIN_CUTOFF) this._ap.stop();
        this._ap.setDragState(false);
      }
      this.dragging = false;
      c.releasePointerCapture?.(e.pointerId);
    };

    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', () => {
      this._lastMove = null;
      this.setHighlight(-1); this.onPickHover?.(null);
    });

    /*
     * Pressing or releasing a modifier changes what a click would do, so it has
     * to change the highlight too — without it the green stays on the face after
     * you let go of shift and the picture lies about what a click will do.
     * The pointer has not moved,
     * so replay the last move event with the new modifier state.
     */
    const replay = (e) => {
      if (!this._lastMove || this.dragging) return;
      const m = this._lastMove;
      move({ clientX: m.clientX, clientY: m.clientY, shiftKey: e.shiftKey,
             ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey });
    };
    addEventListener('keydown', replay);
    addEventListener('keyup', replay);
    addEventListener('blur', () => { this.setHighlight(-1); this.onPickHover?.(null); });

    c.addEventListener('click', (e) => {
      if (!picking(e) || !this.onPick) return;
      const hit = this.pick(e);
      if (hit) this.onPick(hit, mods(e));
    });

    /*
     * A plain right-click is meant to do nothing at all here. But on macOS a
     * ctrl-click IS the secondary click: the OS swallows it and the page only
     * ever sees `contextmenu`. Both requirements are satisfiable at once,
     * because the two cases are distinguishable — a ctrl-click carries
     * ctrlKey, a real right-click does not. So: swallow the menu either way,
     * and only carve when the modifier was actually held.
     */
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!this.onPick || !e.ctrlKey) return;
      const hit = this.pick(e);
      if (hit) this.onPick(hit, { shift: false, ctrl: true });
    });

    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cancelEase();
      // wide range: a deep arrangement can be a hundred times the core's radius
      this.distance = Math.min(40, Math.max(0.05, this.distance * Math.exp(e.deltaY * 0.0012)));
      this.draw();
    }, { passive: false });
  }

  /** a PNG data URL of the current view */
  snapshot() {
    this.draw();
    return this.canvas.toDataURL('image/png');
  }
}

function point(e, el) {
  const r = el.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

// ------------------------------------------------- symmetry-element geometry

/** two unit vectors perpendicular to `d` and to each other */
function basis(d) {
  const n = Math.hypot(...d) || 1;
  const w = [d[0] / n, d[1] / n, d[2] / n];
  // pick the world axis least aligned with w, so the cross product is stable
  const a = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  let u = [w[1] * a[2] - w[2] * a[1], w[2] * a[0] - w[0] * a[2], w[0] * a[1] - w[1] * a[0]];
  const ul = Math.hypot(...u) || 1;
  u = u.map(x => x / ul);
  const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  return { w, u, v };
}

function push(o, p, n, c) {
  o.pos.push(p[0], p[1], p[2]);
  o.norm.push(n[0], n[1], n[2]);
  o.col.push(c[0], c[1], c[2]);
}

/** a capped n-gonal prism along `dir`, from -ext to +ext, as flat triangles */
function tube(o, dir, ext, rad, col, sides = 10) {
  const { w, u, v } = basis(dir);
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    ring.push({ n: [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s] });
  }
  const at = (r, k) => [r.n[0] * rad + w[0] * k * ext, r.n[1] * rad + w[1] * k * ext, r.n[2] * rad + w[2] * k * ext];
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[(i + 1) % sides];
    const A = at(a, -1), B = at(b, -1), C = at(b, 1), D = at(a, 1);
    push(o, A, a.n, col); push(o, B, b.n, col); push(o, C, b.n, col);
    push(o, A, a.n, col); push(o, C, b.n, col); push(o, D, a.n, col);
  }
  // flat caps, so an axis pointing at the viewer is a disc rather than a hole
  for (const k of [-1, 1]) {
    const nrm = [w[0] * k, w[1] * k, w[2] * k];
    const hub = [w[0] * k * ext, w[1] * k * ext, w[2] * k * ext];
    for (let i = 0; i < sides; i++) {
      const a = ring[i], b = ring[(i + 1) % sides];
      push(o, hub, nrm, col);
      push(o, at(k > 0 ? a : b, k), nrm, col);
      push(o, at(k > 0 ? b : a, k), nrm, col);
    }
  }
}

/**
 * A thin torus in the plane through the origin with normal `dir` — the rim of a
 * mirror plane. Major radius `rad`, tube radius `tr`; unlike a flat annulus it
 * has volume, so seen edge-on it is a bar rather than nothing.
 */
function torus(o, dir, rad, tr, col, sides = 56, ring = 8) {
  const { w, u, v } = basis(dir);
  const P = (t, s) => {
    // centre circle point + tube offset in the (radial, normal) frame
    const c = Math.cos(t), sn = Math.sin(t);
    const radial = [u[0] * c + v[0] * sn, u[1] * c + v[1] * sn, u[2] * c + v[2] * sn];
    const rr = rad + tr * Math.cos(s), h = tr * Math.sin(s);
    return {
      p: [radial[0] * rr + w[0] * h, radial[1] * rr + w[1] * h, radial[2] * rr + w[2] * h],
      n: [radial[0] * Math.cos(s) + w[0] * Math.sin(s),
          radial[1] * Math.cos(s) + w[1] * Math.sin(s),
          radial[2] * Math.cos(s) + w[2] * Math.sin(s)],
    };
  };
  for (let i = 0; i < sides; i++) {
    const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2;
    for (let j = 0; j < ring; j++) {
      const s0 = (j / ring) * Math.PI * 2, s1 = ((j + 1) / ring) * Math.PI * 2;
      const A = P(t0, s0), B = P(t1, s0), C = P(t1, s1), D = P(t0, s1);
      push(o, A.p, A.n, col); push(o, B.p, B.n, col); push(o, C.p, C.n, col);
      push(o, A.p, A.n, col); push(o, C.p, C.n, col); push(o, D.p, D.n, col);
    }
  }
}

/** a flat disc through the origin with normal `dir` — one mirror plane */
function disc(o, dir, rad, col, sides = 48) {
  const { w, u, v } = basis(dir);
  const at = (t) => {
    const c = Math.cos(t) * rad, s = Math.sin(t) * rad;
    return [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
  };
  for (let i = 0; i < sides; i++) {
    const t0 = (i / sides) * Math.PI * 2, t1 = ((i + 1) / sides) * Math.PI * 2;
    push(o, [0, 0, 0], w, col); push(o, at(t0), w, col); push(o, at(t1), w, col);
  }
}

// ---------------------------------------------------------------- tiny math

/** shortest-arc interpolation between two orientations */
function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { bb = [-b[0], -b[1], -b[2], -b[3]]; d = -d; }   // take the short way round
  if (d > 0.9995) {                                          // nearly aligned: lerp
    const o = [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t,
               a[2] + (bb[2] - a[2]) * t, a[3] + (bb[3] - a[3]) * t];
    const n = Math.hypot(...o) || 1;
    return o.map(v => v / n);
  }
  const th = Math.acos(d), s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return [a[0] * wa + bb[0] * wb, a[1] * wa + bb[1] * wb,
          a[2] * wa + bb[2] * wb, a[3] * wa + bb[3] * wb];
}

/*
 * Parallel projection. `halfH` is the world half-height the viewport shows;
 * `near` and `far` are distances along -Z and, unlike the perspective case, may
 * be negative — nothing is divided by z, so a near plane behind the origin is
 * well defined and simply widens the depth range.
 */
function orthographic(halfH, aspect, near, far) {
  const halfW = halfH * aspect, nf = 1 / (near - far);
  return new Float32Array([
    1 / halfW, 0, 0, 0,
    0, 1 / halfH, 0, 0,
    0, 0, 2 * nf, 0,
    0, 0, (far + near) * nf, 1,
  ]);
}

function translation(x, y, z) {
  return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
}

function mat4mul(a, b) {
  const o = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
  return o;
}

function quatFromAxis(axis, angle) {
  const l = Math.hypot(...axis) || 1;
  const s = Math.sin(angle / 2);
  return [axis[0] / l * s, axis[1] / l * s, axis[2] / l * s, Math.cos(angle / 2)];
}

function quatFromEuler(x, y, z) {
  let q = quatFromAxis([1, 0, 0], x);
  q = quatMul(quatFromAxis([0, 1, 0], y), q);
  return quatMul(quatFromAxis([0, 0, 1], z), q);
}

function quatMul(a, b) {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}

/** apply the transpose (= inverse, for a rotation) of a column-major mat4's 3x3 part */
function rotT(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
  ];
}

/** Möller–Trumbore; returns the ray parameter of the hit, or null. Two-sided. */
function rayTriangle(o, d, a, b, c) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const p = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * p[0] + e1[1] * p[1] + e1[2] * p[2];
  if (Math.abs(det) < 1e-12) return null;
  const inv = 1 / det;
  const t0 = [o[0] - a[0], o[1] - a[1], o[2] - a[2]];
  const u = (t0[0] * p[0] + t0[1] * p[1] + t0[2] * p[2]) * inv;
  if (u < -1e-6 || u > 1 + 1e-6) return null;
  const q = [t0[1] * e1[2] - t0[2] * e1[1], t0[2] * e1[0] - t0[0] * e1[2], t0[0] * e1[1] - t0[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < -1e-6 || u + v > 1 + 1e-6) return null;
  const t = (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
  return t > 1e-6 ? t : null;
}

function quatToMat4(q) {
  const [x, y, z, w] = q;
  return new Float32Array([
    1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
    2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
    2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0,
    0, 0, 0, 1,
  ]);
}
