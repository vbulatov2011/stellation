/*
 * A small self-contained WebGL renderer for stellated polyhedra.
 *
 * Deliberately dependency-free: the shapes are flat-shaded polygon soups, which
 * needs far less than a general 3D engine, and a static page with no build step
 * loads instantly.
 *
 * Faces are given per-face flat normals and a per-face color keyed to the
 * stellation layer, so you can read the structure of a stellation by eye.
 */

import { AnimatedPointer } from './AnimatedPointer.js';

const VERT = /*glsl*/`#version 300 es
precision highp float;
in vec3 aPos;
in vec3 aNormal;
// rgbA: the fourth component is the group's own opacity. Buffers that upload
// only three (edges, cylinders, mirror discs, axes) get w = 1 by GL default.
in vec4 aColor;
uniform mat4 uProj;
uniform mat4 uView;
out vec3 vNormal;
out vec4 vColor;
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
in vec4 vColor;
in vec3 vEye;
uniform float uEdgeDark;
uniform float uAlpha;      // the global facet opacity: a modifier over every color
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
  vec3 c = vColor.rgb * (0.34 + d) + spec;   // keep shadowed faces light enough that black edges still read
  // slight rim to separate touching facets
  float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0) * 0.12;
  fragColor = vec4(c + rim, vColor.a * uAlpha);
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

/*
 * The palettes live in palette.js so that the diagram's SVG export can color
 * a facet without loading a renderer. Re-exported here because that is where
 * every caller has always imported them from.
 */
export { LAYER_COLORS, layerColor, CLASS_COLORS, UNDERSIDE, classColor } from './palette.js';
import { layerColor, classColor, cosetColor, faceColor } from './palette.js';

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
 * colors mean the same two things whether you are pointing at the solid, the
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

/**
 * Source-over onto a buffer that may be transparent.
 *
 * The color channels take the familiar src*a + dst*(1-a), which leaves them
 * premultiplied by the coverage so far — what this context is declared to
 * hold. The alpha channel needs its own rule, and it is the one a plain
 * blendFunc cannot express: coverage ACCUMULATES, a + dst_a*(1-a), so two
 * half-transparent facets over empty space leave a pixel that is three
 * quarters covered rather than half. With the single blendFunc this used to
 * use, the alpha channel was blended as if it were a color — src_a*src_a —
 * and every translucent pixel came out thinner than it should, which does
 * not show at all while the background is opaque and shows immediately once
 * it is not.
 */
function blendOver(gl) {
  gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
                       gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
}

export class Renderer3D {
  constructor(canvas) {
    this.canvas = canvas;
    /*
     * The drawing buffer carries alpha, and the figure is drawn ONTO NOTHING:
     * the clear is fully transparent, so what the buffer holds is the solid
     * and only the solid. Every pixel it does not cover stays at alpha 0, and
     * a facet drawn at partial opacity leaves a partly transparent pixel —
     * which is what makes toDataURL() and drawImage() hand out an image that
     * can be laid over anything.
     *
     * `premultipliedAlpha` is left at its default of true, and the blending
     * below is set up to match: the color channels accumulate multiplied by
     * coverage, which is what the compositor and the PNG encoder expect of
     * this context. Asking for false instead would mean un-premultiplying in
     * the shader and would darken every translucent pixel by its own alpha a
     * second time.
     *
     * The backdrop you actually SEE is the canvas element's CSS background —
     * see the `background` accessor — so nothing on screen changes, while an
     * exported image has no backdrop baked into it at all.
     */
    const gl = this.gl = canvas.getContext('webgl2',
      { antialias: true, alpha: true, premultipliedAlpha: true });
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
     * is flat across the join and the line is pure subdivision, an artifact of
     * how the plane arrangement was cut up: a "facet edge". Drawing both in one
     * color, as this used to, buries the shape of the solid in the arrangement
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
    /*
     * The opening pose is the isometric, ISO_Q — a named view, not an
     * arbitrary tilt. It used to be a bare Euler triple (-0.42, 0.6, 0), a
     * perfectly good three-quarter angle but is not any of the views the menu
     * offers, so the app started in an orientation it could not name and the
     * readout beside the home button sat blank until you picked something. The
     * isometric is the same kind of picture and has a name: +o3.
     */
    this.rotation = [...ISO_Q];
    this.distance = 1.0;   // relative zoom; the fit distance is computed per frame
    /*
     * Sideways shift of the view, in world units on the camera's own axes.
     *
     * Zooming in to look at one spike puts the rest of the solid outside the
     * frame, and orbiting to reach it turns the thing you were looking at. Pan
     * is the missing degree of freedom: it slides the picture without changing
     * the shape or the orientation of anything.
     *
     * Held here rather than folded into `rotation` because it is not a rotation
     * — under the parallel projection it is a flat translation of the image, so
     * it can never alter what the solid looks like, only which part is on
     * screen.
     */
    this.pan = { x: 0, y: 0 };
    /*
     * Spin is opt-in. A model turning by itself is motion the reader did not
     * ask for: it moves while you are trying to read it, it never settles on
     * the view you want, and on a page of figures several of them turn at once.
     * The app has always set this false; the figure pages each defaulted it on
     * and had to be told otherwise, which is the wrong way round.
     */
    this.autoRotate = false;
    this.showEdges = true;
    this.colorMode = 'layer';  // 'layer' | 'class' | 'stellClass' — setColorMode
    this.faceOpacity = 1;      // 1 solid … 0 wireframe — see draw()
    this.lastFaceClass = null;
    this.elements = null;      // symmetry axes / mirrors / Sn axes, see setElements
    this.elemWidth = 1;        // thickness multiplier for them — see setElemWidth
    /*
     * The coordinate frame: x, y, z as arrows through the origin. In the
     * home orientation x points right, y up and z toward the viewer, which
     * is the frame the symmetry groups' matrices are written in — so the
     * arrows say which way a group's axes are meant to run.
     */
    this.showCoordAxes = false;
    this.coordAxesWidth = 1;
    this.coordAxesCount = 0;
    this.elemCount = 0;
    this.discCount = 0;
    this.background = [0.055, 0.06, 0.078];   // through the accessor below
    this.edgeColor = [0.0, 0.0, 0.0, 1.0];

    /*
     * Per-kind overrides. `color: null` and `width: null` mean "follow
     * edgeColor / edgeWidth", which is what keeps the figure pages working
     * unchanged — they set edgeWidth and know nothing about the two kinds.
     *
     * Facet edges default to a gray rather than black: they are the subdivision
     * of the arrangement, and reading them as quieter than the solid's own
     * edges is the point of separating them at all. Blending is only enabled
     * around the mirror discs, so these stay opaque and the distinction is
     * carried by color and width, not alpha.
     */
    // `tubes` swaps that kind's lines for thin lit cylinders — see _ensureTubes.
    // Per kind, because the two want different treatment: face edges are the
    // solid's outline and carry a cylinder well; facet edges are usually
    // hairlines, and a sub-pixel cylinder shimmers where a line stays clean.
    this.faceEdges = { show: true, color: null, width: null, tubes: false };
    this.facetEdges = { show: true, color: [0.42, 0.44, 0.50, 1.0], width: null, tubes: false };

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

  /**
   * The three coordinate axes, each a cylinder spanning the scene with an
   * arrowhead at its positive end. The cone has a 60° apex and a base twice
   * the cylinder's radius, so its height is r·2·√3 — slender enough to read
   * as a direction rather than a lump.
   *
   * They reach a little past the symmetry elements (AXES_EXT against
   * ELEM_EXT), so where both are shown the frame reads as the outermost
   * thing and the two sets of lines do not end together in a way that makes
   * them look like one another's continuation.
   */
  _buildCoordAxes() {
    const gl = this.gl;
    const o = { pos: [], norm: [], col: [] };
    if (this.showCoordAxes) {
      /*
       * Sized to the SELECTION, not to the whole buildable arrangement:
       * frameR spans everything the planes could ever produce, so on a small
       * selection the arrows shot far past the solid and dwarfed it. The
       * mesh's own radius keeps them the size of what is actually on screen,
       * at the cost of their re-scaling as cells are added — which is what
       * the symmetry elements already do, for the same reason.
       */
      const R = Math.max(1e-3, (this.lastMaxR || 1) * (this.modelScale || 1)) * AXES_EXT;
      const rad = R * 0.006 * (this.coordAxesWidth > 0 ? this.coordAxesWidth : 1);
      const coneR = rad * 2;
      const coneH = coneR * Math.sqrt(3);        // 60° apex: tan(30°) = r / h
      const AXES = [
        [[1, 0, 0], [0.90, 0.28, 0.28]],         // x — red
        [[0, 1, 0], [0.36, 0.78, 0.36]],         // y — green
        [[0, 0, 1], [0.36, 0.55, 0.95]],         // z — blue
      ];
      /*
       * The shaft stops INSIDE the arrowhead rather than running the whole
       * span. A cone tapers to nothing at its tip, so it is only wider than
       * the shaft over the half of its height nearest the base — a shaft
       * carried to the tip bursts out through the cone's surface for the
       * last half. Ending it three quarters of the way in puts the cap where
       * the cone is 1.5× the shaft, comfortably swallowed, and clear of the
       * base plane so the two caps cannot z-fight.
       */
      const shaftEnd = R - coneH * 0.75;
      for (const [dir, col] of AXES) {
        segTube(o, [-dir[0] * R, -dir[1] * R, -dir[2] * R],
                [dir[0] * shaftEnd, dir[1] * shaftEnd, dir[2] * shaftEnd], rad, col, 12);
        cone(o, dir, R, coneH, coneR, col);      // the arrowhead, tip at +R
      }
    }
    if (!this.coordVao) {
      this.coordVao = gl.createVertexArray();
      this.coordBufs = { p: gl.createBuffer(), n: gl.createBuffer(), c: gl.createBuffer() };
    }
    gl.bindVertexArray(this.coordVao);
    const b = this.coordBufs;
    for (const [buf, arr, name] of [[b.p, o.pos, 'aPos'], [b.n, o.norm, 'aNormal'], [b.c, o.col, 'aColor']]) {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(this.prog, name);
      if (l >= 0) { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, 3, gl.FLOAT, false, 0, 0); }
    }
    gl.bindVertexArray(null);
    this.coordAxesCount = o.pos.length / 3;
  }

  /** show or hide the coordinate frame */
  setCoordAxes(on, width) {
    const w = Number(width);
    if (Number.isFinite(w) && w > 0) this.coordAxesWidth = w;
    this.showCoordAxes = !!on;
    this._buildCoordAxes();
    this.draw();
  }

  /** thickness multiplier for the elements; a rebuild, but a cheap one */
  setElemWidth(v) {
    const w = Number(v);
    if (!Number.isFinite(w) || w <= 0 || w === this.elemWidth) return;
    this.elemWidth = w;
    if (this.elements) this._buildElements();
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
      const ext = R * ELEM_EXT;
      // the slider scales the thickness; the extent stays put, so a thicker
      // axis is a fatter tube reaching exactly as far as the thin one did
      const rad = R * 0.014 * (this.elemWidth > 0 ? this.elemWidth : 1);
      // every element carries its own color: inequivalent elements differ
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

  /*
   * Edges as thin cylinders — real geometry with a world-space radius, lit
   * by the same lights as the solid, instead of screen-space quads of
   * constant pixel width. The width sliders set the radius, scaled to the
   * mesh so the same number reads the same on any model; zooming in makes
   * them thicker on screen, which is what real geometry does.
   */
  _tubeStyle() {
    const R = Math.max(1e-3, (this.lastMaxR || 1) * (this.modelScale || 1));
    const wF = this.faceEdges.width ?? this.edgeWidth;
    const wT = this.facetEdges.width ?? this.edgeWidth;
    const cF = this.faceEdges.color || this.edgeColor;
    const cT = this.facetEdges.color || this.edgeColor;
    return { radF: wF * R / 600, radT: wT * R / 600, cF, cT,
             key: R.toFixed(5) + '|' + wF + '|' + wT + '|' + cF.join() + '|' + cT.join() };
  }

  /**
   * The edge tubes as data, for anything that is not the GPU.
   *
   * Returns one entry per edge kind currently drawn as cylinders — its
   * segments, the world radius the sliders came to, and its color — or an
   * empty list when the view is drawing lines, which have no geometry to
   * give. Deliberately data rather than triangles: the export builds its own
   * cylinders, indexed and per-face-colored, where _ensureTubes builds a
   * flat soup with baked normals because that is what a vertex buffer wants.
   */
  edgeTubeSpec() {
    if (!this.showEdges) return [];
    const st = this._tubeStyle();
    const out = [];
    if (this.faceEdges.show && this.faceEdges.tubes && this._faceSegs?.length) {
      out.push({ kind: 'face', segs: this._faceSegs, radius: st.radF, color: st.cF });
    }
    if (this.facetEdges.show && this.facetEdges.tubes && this._facetSegs?.length) {
      out.push({ kind: 'facet', segs: this._facetSegs, radius: st.radT, color: st.cT });
    }
    return out;
  }

  /**
   * Everything drawn AROUND the solid, as data: the symmetry elements and the
   * coordinate frame, each with the size and color the view is giving it.
   *
   * Only what is actually on screen — `elements` already holds just the kinds
   * the panel has switched on, and the frame answers to its own flag. The
   * numbers are recomputed here exactly as _buildElements and _buildCoordAxes
   * compute them, so an exported axis is the length and thickness of the one
   * you are looking at.
   */
  annotationSpec() {
    const R = Math.max(1e-3, (this.lastMaxR || 1) * (this.modelScale || 1));
    const el = this.elements;
    const out = { axes: [], improper: [], mirrors: [], coord: [] };
    if (el) {
      const ext = R * ELEM_EXT;
      const rad = R * 0.014 * (this.elemWidth > 0 ? this.elemWidth : 1);
      for (const a of (el.axes || [])) {
        out.axes.push({ dir: a.dir, extent: ext, radius: rad, color: a.rgb || [0.25, 0.72, 0.95] });
      }
      for (const a of (el.improper || [])) {
        out.improper.push({ dir: a.dir, extent: ext * 0.94, radius: rad * 0.9,
                            color: a.rgb || [0.72, 0.45, 0.95] });
      }
      /*
       * A mirror exports as its rim alone. On screen it is a torus plus a
       * translucent fill, and the fill is what makes the plane legible over
       * the solid — but a file has no compositing, and a disc dropped into a
       * mesh is an opaque wall through the middle of the figure.
       */
      for (const m of (el.mirrors || [])) {
        out.mirrors.push({ dir: m.dir, ring: ext * 0.92, radius: rad,
                           color: m.rgb || [0.42, 0.90, 0.80] });
      }
    }
    if (this.showCoordAxes) {
      const AR = R * AXES_EXT;
      const rad = AR * 0.006 * (this.coordAxesWidth > 0 ? this.coordAxesWidth : 1);
      const coneR = rad * 2, coneH = coneR * Math.sqrt(3);
      const AXES = [
        [[1, 0, 0], [0.90, 0.28, 0.28]],
        [[0, 1, 0], [0.36, 0.78, 0.36]],
        [[0, 0, 1], [0.36, 0.55, 0.95]],
      ];
      for (const [dir, color] of AXES) {
        out.coord.push({ dir, extent: AR, radius: rad, color,
                         shaftEnd: AR - coneH * 0.75, coneH, coneR });
      }
    }
    return out;
  }

  /**
   * The view's rotation as a plain 3×3, row by row — what to multiply a model
   * point by to get where it sits on screen. Pan and zoom are deliberately not
   * in it: they are where the camera is standing, not which way the figure is
   * facing, and an exported model wants only the second.
   */
  viewRotation3() {
    const m = quatToMat4(this.rotation);         // column-major
    return [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
  }

  /**
   * Build (or reuse) the cylinder geometry for both edge kinds. Cached
   * against a key of everything baked into the vertices — widths, colors,
   * the mesh scale — so dragging a style slider rebuilds and everything
   * else redraws what is already on the GPU.
   */
  _ensureTubes() {
    const st = this._tubeStyle();
    if (this._tubeArrays?.key === st.key) return;
    const gl = this.gl;
    const build = (segs, rad, col) => {
      const o = { pos: [], norm: [], col: [] };
      for (let i = 0; i < segs.length; i += 2) segTube(o, segs[i], segs[i + 1], rad, col);
      return o;
    };
    const face = build(this._faceSegs || [], st.radF, st.cF);
    const facet = build(this._facetSegs || [], st.radT, st.cT);
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
    put('faceTube', face, 'faceTubeCount');
    put('facetTube', facet, 'facetTubeCount');
    gl.bindVertexArray(null);
    this._tubeArrays = { key: st.key };
  }

  /**
   * Turn to a standard view (see VIEW_SPECS), easing there, and remember it
   * as the orientation this model is being looked at from.
   *
   * Orientation and pan only: home used to send `distance` to 1 as well, but
   * distance is a world radius, so 1 frames a model of scaled radius 1 — the
   * original polyhedron, whatever is actually selected. On anything
   * stellated that is a hidden zoom-in, and the solid overflowed the frame.
   * Sizing is `fit()`'s job; this only turns the model.
   */
  goToView(i) {
    const n = STANDARD_VIEWS.length;
    const k = ((Math.round(i) % n) + n) % n;
    this._chosenView = k;
    this._ease({ rotation: STANDARD_VIEWS[k].q, pan: { x: 0, y: 0 } });
    return { index: k, name: STANDARD_VIEWS[k].name };
  }

  /**
   * The home button: back to the orientation you chose, whatever the drag
   * since. It does NOT step to the next one — a button that moved somewhere
   * new each press could not put you back where you were, which is the one
   * thing "home" should do. Choosing a different orientation is the menu's
   * job. Until something is chosen, home means the canonical `+z` frame.
   */
  home() { return this.goToView(this._chosenView ?? DEFAULT_VIEW); }

  /**
   * Which standard view the model is in, or -1 for none — so a control that
   * shows the orientation stops claiming one the moment the model is dragged
   * off it. Quaternions double-cover rotations, so q and -q are the same
   * orientation: compare the absolute dot product.
   */
  matchStandardView(tol = 0.9995) {
    const r = this.rotation;
    for (let i = 0; i < STANDARD_VIEWS.length; i++) {
      const q = STANDARD_VIEWS[i].q;
      if (Math.abs(r[0] * q[0] + r[1] * q[1] + r[2] * q[2] + r[3] * q[3]) > tol) return i;
    }
    return -1;
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
    const p0 = { ...this.pan };
    const p1 = target.pan ?? p0;
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / ms);
      const k = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;   // easeInOutCubic
      this.distance = d0 + (d1 - d0) * k;
      this.pan = { x: p0.x + (p1.x - p0.x) * k, y: p0.y + (p1.y - p0.y) * k };
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
    // fit means "show me all of it", so it undoes the pan as well as the zoom —
    // a fit that left the model shoved off to one side would not be a fit
    this._ease({ distance: Math.min(40, Math.max(0.05, R)), pan: { x: 0, y: 0 } });
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
    const v = [...this.rotation, this.distance];
    /*
     * `distance` alone does not determine what you see. Apparent size is
     * modelScale / halfH, and halfH follows distance — so the same distance
     * frames the solid differently depending on the model scale in force, and
     * that scale is set by the FIRST mesh drawn after an arrangement is built
     * (see setMesh). Build up from the core and it is one over the core's
     * radius; load the same selection whole and it is one over the whole
     * spiky thing's radius. Saving distance without the scale therefore
     * reproduces the angle but not the size — a document opened from a folder
     * came back several times smaller than the picture it was saved with.
     *
     * So the scale travels with the view. The trailing numbers are optional
     * and positional, oldest first, which keeps every link ever shared valid:
     * five numbers is a pre-pan view, seven adds the pan, eight the scale.
     */
    const scale = this.modelScale || 0;
    if (this.pan.x || this.pan.y || scale) v.push(this.pan.x, this.pan.y);
    if (scale) v.push(scale);
    return v.map(x => Math.round(x * 1e6) / 1e6);
  }

  setView(v) {
    if (!Array.isArray(v) || v.length < 5 || v.some(x => !Number.isFinite(x))) return false;
    const n = Math.hypot(v[0], v[1], v[2], v[3]);
    if (!(n > 1e-6)) return false;
    this.rotation = [v[0] / n, v[1] / n, v[2] / n, v[3] / n];
    this.distance = Math.min(40, Math.max(0.05, v[4]));
    // five numbers is a view from before panning existed, and means no pan
    this.pan = { x: v[5] || 0, y: v[6] || 0 };
    /*
     * Adopt the scale so later re-uploads (toggling a cell) keep this framing.
     * The mesh on screen was uploaded with the scale baked into its vertex
     * buffer, so this alone cannot resize it — the caller applies
     * viewModelScale(v) BEFORE the build for that. This only stops the next
     * mesh from disagreeing with the view it is drawn under.
     */
    if (v[7] > 0) this.modelScale = v[7];
    this._pointerReset();
    this.draw();
    return true;
  }

  /** the model scale a saved view carries, if any — see getView */
  static viewModelScale(v) {
    return Array.isArray(v) && v[7] > 0 ? v[7] : 0;
  }

  resize() {
    /*
     * A recording owns the canvas size for its duration: it renders at the
     * video's own resolution and letterboxes the element to show the video's
     * framing, and the ResizeObserver fires on exactly that CSS change — so
     * without the lock, starting a recording would immediately undo its own
     * canvas.
     */
    if (this.lockSize) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.draw();
  }

  /**
   * Draw once into a square buffer of the given side and return the pixels as
   * a fresh canvas. The live canvas is restored before returning.
   *
   * The point is that the result does not depend on the window. _camera()
   * takes the aspect ratio into account — it has to, or a narrow canvas would
   * cut the sides off — so the same solid at the same zoom fills a different
   * fraction of a wide canvas than of a tall one. Cropping a square out of
   * whatever shape the canvas happens to be therefore produces a picture whose
   * framing depends on the reader's window at the moment they pressed save,
   * and two such pictures cannot be compared with each other. Rendering at a
   * fixed square size makes the framing a property of the document alone.
   *
   * Copy out immediately: the context has no preserveDrawingBuffer, so the
   * pixels exist only within the frame that drew them — hence the drawImage
   * here rather than handing back the live canvas.
   *
   * Distinct from snapshot() below, which hands back the live view as a data
   * URL for "save image" — there, matching what is on screen IS the point.
   */
  squareImage(size = 256) {
    const { canvas } = this;
    const w0 = canvas.width, h0 = canvas.height;
    const out = document.createElement('canvas');
    out.width = out.height = size;
    try {
      canvas.width = canvas.height = size;
      this.draw();
      out.getContext('2d').drawImage(canvas, 0, 0);
    } finally {
      canvas.width = w0; canvas.height = h0;
      this.draw();
    }
    return out;
  }

  /**
   * upload a mesh: {vertices:[{x,y,z}], faces:[[i,...]]} plus a layer per face.
   *
   * `faceClass` is optional and carries the other colorings:
   * {classes, classesStell, top}, one entry per face — which symmetry class
   * of original face the facet lies in, under the polyhedron's group and
   * under the stellation group, and whether it is an outward cap or an
   * underside. Callers that do not have it (the walkthrough and the Brückner
   * and historical figures) simply get the layer palette, whatever colorMode
   * says.
   */
  setMesh(mesh, faceLayers, faceClass = null) {
    const gl = this.gl;
    const pos = [], norm = [], col = [];
    this.pickTris = [];      // {a,b,c, face} in model space, for ray picking
    this.mesh = mesh;
    this.lastFaceLayers = faceLayers;
    this.lastFaceClass = faceClass;
    // which of the two class maps this mode wants, if either
    const classes = this.colorMode === 'class' ? faceClass?.classes
                  : this.colorMode === 'stellClass' ? faceClass?.classesStell
                  : null;
    const byClass = !!classes;
    // coset coloring reads its own map and its own palette — golden-angle
    // hues, one per class, gray where the cosets cannot label. Right cosets
    // ride on the planes, left cosets on the cells' H-orbits.
    const cosets = this.colorMode === 'coset' ? faceClass?.cosets
                 : this.colorMode === 'cosetL' ? faceClass?.cosetsL
                 : this.colorMode === 'cosetM' ? faceClass?.cosetsM
                 : this.colorMode === 'orbitP' ? faceClass?.orbitP
                 : this.colorMode === 'orbitF' ? faceClass?.orbitF
                 : this.colorMode === 'orbitC' ? faceClass?.orbitC
                 : null;
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
     * the first mesh's radius, since modelScale normalizes it. A figure that
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

    /*
     * Which group each facet belongs to, under the mode in force. The color
     * itself comes from faceColor(), which is where a group's override — if
     * the Colors panel gave it one — stands in for the palette's own answer.
     */
    const groupOf = cosets ? (fi) => cosets[fi] ?? -1
      : byClass ? (fi) => classes[fi] || 0
      : (fi) => (faceLayers ? faceLayers[fi] : 0);
    this._anyFaceAlpha = false;

    mesh.faces.forEach((face, fi) => {
      const top = faceClass?.top ? faceClass.top[fi] !== false : true;
      const c = faceColor(this.colorMode, groupOf(fi), top);
      /*
       * A group at zero opacity is invisible, not absent. Its triangles are
       * still built and still uploaded — they simply composite to nothing —
       * so its edges go on being drawn and the structure keeps its shape as
       * you take the fill away. Dropping the facets instead, which this did
       * at first, made the edges vanish with them: the whole figure changed
       * appearance at the last step of the slider rather than fading to a
       * wireframe of itself. The same reasoning keeps them pickable, so a
       * click behaves the same at 0 as it does at 0.01.
       */
      if (c[3] < 1) this._anyFaceAlpha = true;
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
          col.push(c[0], c[1], c[2], c[3]);
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
    upload(this.vao, this.colBuf, 'aColor', col, 4, this.prog);
    this.count = pos.length / 3;
    this._sortData = null;         // new geometry: the translucency order tables are stale
    // kept for the cylinder edges, built lazily so line mode never pays for them
    this._faceSegs = faceLines; this._facetSegs = facetLines;
    this._tubeArrays = null;

    this.faceLineCount = this._uploadSegments(this.faceLineVao, this.faceLineBufs, faceLines);
    this.facetLineCount = this._uploadSegments(this.facetLineVao, this.facetLineBufs, facetLines);

    gl.bindVertexArray(null);
    // the elements are sized to the arrangement, so they follow it as it grows
    if (this.elements) this._buildElements();
    if (this.showCoordAxes) this._buildCoordAxes();      // and so is the frame
    this.draw();
  }

  /**
   * Switch between coloring by shell and by face class.
   *
   * Re-uploads from the mesh already held rather than asking the worker for it
   * again: nothing about the geometry changes, only the color attribute. The
   * rebuild costs what one selection toggle costs, and it happens once per menu
   * change, so it is not worth a separate color-only path through setMesh.
   *
   * Framing is untouched because the content is identical — the fill fraction
   * setMesh tests against is exactly what it was, so no re-fit is triggered.
   */
  setColorMode(mode) {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    if (this.mesh) this.setMesh(this.mesh, this.lastFaceLayers, this.lastFaceClass);
  }

  /**
   * Re-read the palette without changing mode — what the Colors panel calls
   * after every edit. Same rebuild as a mode switch, for the same reason:
   * only the color attribute changes, and the geometry it rides on is
   * identical, so the framing is untouched.
   */
  refreshColors() {
    if (this.mesh) this.setMesh(this.mesh, this.lastFaceLayers, this.lastFaceClass);
  }

  /**
   * How solid the facets are, 1 down to 0. Costs nothing but a redraw — the
   * geometry and its colors are untouched, only how they are blended.
   */
  setFaceOpacity(v) {
    const a = Math.max(0, Math.min(1, Number(v)));
    if (!Number.isFinite(a) || a === this.faceOpacity) return;
    this.faceOpacity = a;
    this.draw();
  }

  /*
   * Depth order for translucent facets — the original applet's algorithm,
   * ported from card_shuffle() in the Java source (pvs/g3d/Stellation3D.java).
   *
   * The textbook painter's algorithm — sort faces by mean depth — is wrong
   * for exactly the meshes a stellation produces: long thin facets at steep
   * angles overlap on screen while their depth averages say otherwise. The
   * Java code kept that sort commented out and used the structure of the
   * model instead. A stellation is cut from a fixed set of planes, so every
   * facet lies IN one of them and no facet crosses any of them — which means
   * the planes themselves can order the facets. For each plane, stably move
   * the facets on the viewer's far side before those on the near side,
   * keeping the relative order inside each group (the "card shuffle"). One
   * pass over all the planes leaves a correct back-to-front order.
   *
   * Why that is enough: if facet F occludes facet G, the ray from the eye
   * hits F before it reaches G, so F sits wholly on the viewer's side of the
   * plane CONTAINING G — facets never straddle planes, so "wholly" is free.
   * That plane's pass therefore places G before F. And no later pass can
   * swap them back: it would need some plane with F on the far side and G on
   * the near side, which would put G's hit before F's — contradicting F
   * occluding G. Every occluding pair is settled by the occluded facet's own
   * plane, and settled for good.
   *
   * The cost is planes × triangles sign tests per frame — no comparison
   * sort, and the signs are looked up, not computed: sidedness is a property
   * of the model, not the view, so the table is built once per mesh (the
   * Java facePlaneDist). The view enters only through one number per plane —
   * the eye-space z of its normal, which says which of its sides the viewer
   * is on.
   */
  _buildSortData() {
    const tris = this.pickTris;
    const T = tris ? tris.length : 0;
    if (!T) return null;
    /*
     * The facet -> plane map comes from the worker when the app is driving
     * (faceClass.planes); the figure pages do not send it, so they recover
     * the planes geometrically — facets bucketed by their plane equation,
     * canonicalised to d >= 0 so a facet and the underside it backs onto
     * land in the same bucket. Quantisation errors can only split one plane
     * into two buckets, and a duplicate plane just costs one redundant pass.
     */
    const workerPlanes = this.lastFaceClass?.planes || null;
    const ids = new Map();
    const eqs = [];                    // [nx, ny, nz, d] per plane, d >= 0
    const triPlane = new Int32Array(T);
    const cx = new Float64Array(T), cy = new Float64Array(T), cz = new Float64Array(T);
    for (let t = 0; t < T; t++) {
      const { a, b, c } = tris[t];
      cx[t] = (a[0] + b[0] + c[0]) / 3;
      cy[t] = (a[1] + b[1] + c[1]) / 3;
      cz[t] = (a[2] + b[2] + c[2]) / 3;
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-12) { triPlane[t] = -1; continue; }     // degenerate sliver
      nx /= nl; ny /= nl; nz /= nl;
      let d = nx * a[0] + ny * a[1] + nz * a[2];
      if (d < 0) { nx = -nx; ny = -ny; nz = -nz; d = -d; }
      const key = workerPlanes
        ? 'w' + workerPlanes[tris[t].face]
        : Math.round(nx * 1e4) + ',' + Math.round(ny * 1e4) + ','
          + Math.round(nz * 1e4) + ',' + Math.round(d * 1e4);
      let p = ids.get(key);
      if (p === undefined) { p = eqs.length; ids.set(key, p); eqs.push([nx, ny, nz, d]); }
      triPlane[t] = p;
    }
    const P = eqs.length;
    // -1 behind / 0 on / +1 in front, for every (plane, facet) pair
    const side = new Int8Array(P * T);
    for (let p = 0; p < P; p++) {
      const [nx, ny, nz, d] = eqs[p];
      const eps = 1e-7 * (1 + d);
      const row = p * T;
      for (let t = 0; t < T; t++) {
        if (triPlane[t] === p) continue;                 // its own plane: on it
        const s = nx * cx[t] + ny * cy[t] + nz * cz[t] - d;
        side[row + t] = s > eps ? 1 : (s < -eps ? -1 : 0);
      }
    }
    return {
      T, eqs, side,
      order: Uint32Array.from({ length: T }, (_, i) => i),
      far: new Uint32Array(T), near: new Uint32Array(T),
      elements: new Uint32Array(T * 3),
    };
  }

  /**
   * The card shuffle itself: partition the running order once per plane,
   * write the result into the element buffer, and return the index count.
   * `order` persists between frames — any starting order is correct (every
   * pair is settled by its own plane's pass), so last frame's order is as
   * good a start as any and most passes barely move anything.
   */
  _sortedTriangles() {
    const sd = this._sortData ||= this._buildSortData();
    if (!sd) return 0;
    const { T, eqs, side, order, far, near, elements } = sd;
    const R = quatToMat4(this.rotation);        // column-major; row 2 is eye z
    for (let p = 0; p < eqs.length; p++) {
      const [nx, ny, nz] = eqs[p];
      const zc = R[2] * nx + R[6] * ny + R[10] * nz;
      // edge-on: its half-spaces project to disjoint half-planes, no occlusion
      if (zc > -1e-6 && zc < 1e-6) continue;
      const sign = zc > 0 ? 1 : -1;
      const row = p * T;
      let nf = 0, nn = 0;
      for (let i = 0; i < T; i++) {
        const t = order[i];
        if (side[row + t] * sign > 0) near[nn++] = t;
        else far[nf++] = t;                     // the far side and the plane's own facets
      }
      order.set(far.subarray(0, nf), 0);
      order.set(near.subarray(0, nn), nf);
    }
    for (let i = 0; i < T; i++) {
      const b = order[i] * 3, e = i * 3;
      elements[e] = b; elements[e + 1] = b + 1; elements[e + 2] = b + 2;
    }
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (!this.sortEbo) this.sortEbo = gl.createBuffer();
    // the element binding is VAO state, so this rides along with this.vao
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sortEbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.DYNAMIC_DRAW);
    return T * 3;
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
    // nothing behind the figure: see the note on the context
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);          // shells are visible from both sides
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.count) return;

    const cam = this._camera(W, H);
    // A parallel projection has no eye to fall behind, so the near plane may sit
    // behind the origin: bracket the scene symmetrically and nothing can clip.
    const proj = orthographic(cam.halfH, cam.aspect, cam.dist - cam.depth, cam.dist + cam.depth);
    // the pan rides in the view translation, so it shifts the image on the
    // camera's own axes whatever the model's orientation
    const view = mat4mul(translation(-this.pan.x, -this.pan.y, -cam.dist), quatToMat4(this.rotation));

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uProj'), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.prog, 'uView'), false, view);
    gl.bindVertexArray(this.vao);
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
    const drawEdges = (spec, vao, count) => {
      if (!this.showEdges || !spec.show || !count) return;
      drawLines(vao, count, spec.color || this.edgeColor, spec.width ?? this.edgeWidth);
    };

    /*
     * All the opaque ink in one place: the edges — screen-space lines, or
     * thin lit cylinders when that kind's `tubes` flag is on — and the
     * symmetry elements.
     * Depth writes stay on throughout, so the ink occludes itself correctly
     * from whichever pipeline calls it.
     *
     * Facet edges first, face edges over them: where the two contend for the
     * same pixels the solid's own edges should win. The elements are real
     * geometry in the same depth buffer, so an axis running behind a cell is
     * hidden by it — drawn as overlaid lines they were close to useless,
     * because nothing occluded them.
     */
    const drawInk = () => {
      if (this.showEdges &&
          ((this.faceEdges.show && this.faceEdges.tubes) ||
           (this.facetEdges.show && this.facetEdges.tubes))) {
        this._ensureTubes();
      }
      // each kind draws its own way — mixing cylinders and lines is the point
      const kind = (spec, lineVao, lineCount, tubeVao, tubeCount) => {
        if (!this.showEdges || !spec.show) return;
        if (spec.tubes && tubeCount) {
          gl.useProgram(this.prog);
          gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
          gl.bindVertexArray(tubeVao);
          gl.drawArrays(gl.TRIANGLES, 0, tubeCount);
        } else if (!spec.tubes && lineCount) {
          drawLines(lineVao, lineCount, spec.color || this.edgeColor, spec.width ?? this.edgeWidth);
        }
      };
      kind(this.facetEdges, this.facetLineVao, this.facetLineCount, this.facetTubeVao, this.facetTubeCount);
      kind(this.faceEdges, this.faceLineVao, this.faceLineCount, this.faceTubeVao, this.faceTubeCount);
      if (this.elemCount) {
        gl.useProgram(this.prog);
        gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
        gl.bindVertexArray(this.elemVao);
        gl.drawArrays(gl.TRIANGLES, 0, this.elemCount);
      }
      if (this.showCoordAxes && this.coordAxesCount) {
        gl.useProgram(this.prog);
        gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
        gl.bindVertexArray(this.coordVao);
        gl.drawArrays(gl.TRIANGLES, 0, this.coordAxesCount);
      }
    };

    /*
     * Two pipelines, chosen by opacity.
     *
     * SOLID is the classic order: fill with depth, sunk by polygon offset,
     * then the ink on top.
     *
     * TRANSLUCENT draws the OPAQUE INK FIRST — the pipeline suggested by the
     * original author. Edges, cylinders and elements write real depth; the
     * glass then composites back-to-front (the card shuffle,
     * _sortedTriangles) with depth TEST on and depth writes off. Per pixel
     * that is exact: glass in front of a cylinder dims it once per layer,
     * glass behind it is culled at precisely the pixels it covers, and the
     * polygon offset sinks each facet just behind its own coplanar ink so
     * edges stay crisp on the surface they mark. (The first attempt drew the
     * ink last onto an empty depth buffer, which put every edge and axis at
     * full strength on top of the glass — an x-ray, not a translucent
     * solid.) At 0 the glass is skipped and the ink alone is a wireframe.
     */
    const alpha = Math.max(0, Math.min(1, this.faceOpacity ?? 1));
    // per-face alpha needs the same back-to-front compositing the global
    // opacity does, so one translucent group puts the whole pass on that path
    if (alpha >= 1 && !this._anyFaceAlpha) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.2, 1.2);    // sink the faces so the ink sits cleanly on top
      gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
      gl.drawArrays(gl.TRIANGLES, 0, this.count);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      drawInk();
    } else {
      drawInk();
      if (alpha > 0) {
        const n = this._sortedTriangles();     // binds this.vao and its elements
        gl.useProgram(this.prog);
        if (!n) gl.bindVertexArray(this.vao);
        gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), alpha);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(1.2, 1.2);
        gl.enable(gl.BLEND);
        blendOver(gl);
        gl.depthMask(false);
        if (n) gl.drawElements(gl.TRIANGLES, n, gl.UNSIGNED_INT, 0);
        else gl.drawArrays(gl.TRIANGLES, 0, this.count);   // no mesh tables: unsorted
        gl.depthMask(true);
        gl.disable(gl.BLEND);
        gl.disable(gl.POLYGON_OFFSET_FILL);
        gl.uniform1f(gl.getUniformLocation(this.prog, 'uAlpha'), 1.0);
      }
    }
    // mirror planes last: translucent, so they must read over what is behind
    // them without writing depth, or the discs would hide each other
    if (this.discCount) {
      gl.useProgram(this.prog);
      gl.enable(gl.BLEND);
      blendOver(gl);
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
   * `dist` survives only to place the view along -Z and to center the depth
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
    // + pan, because the view translation shifted the world by -pan: picking and
    // drawing have to agree about where the model is, or a panned view picks the
    // face that would have been under the pointer before the pan
    const originView = [nx * cam.halfH * cam.aspect + this.pan.x,
                        ny * cam.halfH + this.pan.y,
                        cam.dist + cam.depth];
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
   * `action` is 'add' | 'remove' | null and picks the color. An outline in an
   * action color is a promise that the click will do that thing; a neutral one
   * says only "this is the face you are pointing at". The caller keeps that
   * promise by asking for no outline at all where the gesture has nothing to
   * act on — see onHover3D.
   */
  setHighlight(faceIndex, action = null) {
    const want = `${faceIndex}|${action}`;
    const a = ACTION[action] || ACTION.none;
    this.hlColor = [...a.rgb, 1.0];
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
   * two different behaviors either side of a speed threshold: a hard flick got
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

    /*
     * Panning: sliding the picture without turning it.
     *
     * Zoomed in on one spike, the rest of the solid is off-frame, and orbiting
     * to reach it turns the very thing you were looking at. So there are three
     * ways in, one per input device, and none of them collides with a gesture
     * that already means something:
     *
     *   mouse    right-button drag — the button that otherwise does nothing
     *            here, since the context menu is already suppressed
     *   touch    two fingers — drag to pan, spread to zoom. One finger stays
     *            the trackball, which is what a phone user reaches for first
     *   trackpad two-finger drag arrives as a wheel event with deltaX, so a
     *            Mac gets panning with no button at all; see the wheel handler
     *
     * A right-drag carrying ctrl is left alone: on macOS that IS the secondary
     * click, and the contextmenu handler below already reads it as "carve this
     * cell". Panning it too would make one gesture do two things.
     */
    const pointers = new Map();          // active pointers, id -> {x, y}
    let gesture = null;                  // pan / pinch in progress

    /*
     * Pointer capture throws NotFoundError for a pointer the browser is not
     * tracking, and it is only an optimisation — it keeps a drag alive when it
     * leaves the canvas, and nothing depends on it. So it is guarded, and it is
     * done last: called before the state was set up, a throw skipped the setup
     * and the gesture silently never began. diagram.js has had this guard from
     * the start; this view was using a bare `?.`, which only covers the method
     * being absent, not the call failing.
     */
    const capture = (e, on) => {
      try { on ? c.setPointerCapture?.(e.pointerId) : c.releasePointerCapture?.(e.pointerId); }
      catch { /* nothing to capture */ }
    };

    /** world units per CSS pixel — isotropic, since the projection is parallel */
    const worldPerPixel = () => {
      const r = c.getBoundingClientRect();
      const cam = this._camera(this.canvas.width || 1, this.canvas.height || 1);
      return r.height ? (2 * cam.halfH) / r.height : 0;
    };

    const twoFingerState = () => {
      const [a, b] = [...pointers.values()];
      return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, spread: Math.hypot(a.x - b.x, a.y - b.y) };
    };

    /** begin a pan; `pinch` also tracks the finger spread for zoom */
    const startGesture = (kind) => {
      this.cancelEase();
      this._ap.setDragState(false);
      this._ap.stop();
      this.dragging = true;
      const s = kind === 'pinch' ? twoFingerState() : [...pointers.values()][0];
      gesture = {
        kind,
        x: kind === 'pinch' ? s.cx : s.x,
        y: kind === 'pinch' ? s.cy : s.y,
        spread: kind === 'pinch' ? s.spread : 0,
        pan: { ...this.pan },
        distance: this.distance,
        k: worldPerPixel(),
      };
    };

    const stepGesture = () => {
      if (!gesture) return;
      const s = gesture.kind === 'pinch' ? twoFingerState() : [...pointers.values()][0];
      if (!s) return;
      const x = gesture.kind === 'pinch' ? s.cx : s.x;
      const y = gesture.kind === 'pinch' ? s.cy : s.y;
      // drag right and the model goes right: the view translation is -pan, so
      // pan runs against the pointer on x and with it on y (screen y points down)
      this.pan = {
        x: gesture.pan.x - (x - gesture.x) * gesture.k,
        y: gesture.pan.y + (y - gesture.y) * gesture.k,
      };
      if (gesture.kind === 'pinch' && gesture.spread > 8 && s.spread > 8) {
        // spread apart to enlarge, which means a smaller distance
        this.distance = Math.min(40, Math.max(0.05, gesture.distance * (gesture.spread / s.spread)));
      }
      this.draw();
    };

    const endGesture = () => { gesture = null; this.dragging = false; };

    const down = (e) => {
      pointers.set(e.pointerId, point(e, c));
      if (pointers.size === 2) {           // a second finger takes over from the trackball
        this._ap.setDragState(false);
        this._ap.stop();
        startGesture('pinch');
        capture(e, true);
        return;
      }
      if (e.button === 2 && !e.ctrlKey) {  // right-drag pans; ctrl-right is macOS carve
        startGesture('pan');
        capture(e, true);
        return;
      }
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
      capture(e, true);
    };
    const move = (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, point(e, c));
      if (gesture) { stepGesture(); return; }
      if (!this.dragging) {
        this._lastMove = e;
        const hit = picking(e) ? this.pick(e) : null;
        c.style.cursor = hit ? 'crosshair' : 'grab';
        // the app knows whether the gesture can actually do anything here, so it
        // owns the highlight color; without it, fall back to a plain outline
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
      pointers.delete(e.pointerId);
      if (gesture) {
        // lifting one of two fingers ends the gesture rather than silently
        // handing the model back to the trackball mid-motion
        endGesture();
        capture(e, false);
        return;
      }
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
      capture(e, false);
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
      /*
       * A trackpad's two-finger swipe arrives here, not as pointer events, so
       * this is where a Mac gets panning without a right button: shift-scroll
       * for the deliberate case, and a plain sideways swipe, which carries
       * deltaX and which a mouse wheel never produces.
       *
       * ctrlKey means a pinch — the browser synthesises a wheel event with it —
       * so that stays zoom, which is what a pinch should do.
       */
      const sideways = !e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY));
      if (sideways) {
        const k = worldPerPixel();
        this.pan = { x: this.pan.x - e.deltaX * k, y: this.pan.y + e.deltaY * k };
      } else {
        // wide range: a deep arrangement can be a hundred times the core's radius
        this.distance = Math.min(40, Math.max(0.05, this.distance * Math.exp(e.deltaY * 0.0012)));
      }
      this.draw();
    }, { passive: false });
  }

  /**
   * The color BEHIND the figure.
   *
   * It is no longer what the drawing buffer is cleared to — the buffer is
   * cleared to nothing, so that an exported image carries the solid alone —
   * but the canvas element's own CSS background, which sits behind the
   * transparent pixels and is therefore what a person looking at the screen
   * sees. Callers set it exactly as they always did, once per theme, and the
   * view looks the same as before; toDataURL() and drawImage() read the
   * drawing buffer and never see it.
   */
  set background(rgb) {
    this._background = rgb;
    const b = (v) => Math.max(0, Math.min(255, Math.round((v ?? 0) * 255)));
    this.canvas.style.backgroundColor = `rgb(${b(rgb?.[0])}, ${b(rgb?.[1])}, ${b(rgb?.[2])})`;
  }

  get background() { return this._background; }

  /** a PNG data URL of the current view, transparent where the figure is not */
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
 * A cone along `dir`, its tip at distance `tip` from the origin and its base
 * `height` back along the axis — the arrowhead on a coordinate axis. Side
 * normals lean out by the half-angle (radial·h + axial·r, normalized), so it
 * shades as a cone rather than as a faceted fan.
 */
function cone(o, dir, tip, height, rad, col, sides = 18) {
  const { w, u, v } = basis(dir);
  const at = (t) => [w[0] * t, w[1] * t, w[2] * t];
  const T = at(tip), B = at(tip - height);
  const nl = Math.hypot(height, rad) || 1;
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    const radial = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
    ring.push({
      p: [B[0] + radial[0] * rad, B[1] + radial[1] * rad, B[2] + radial[2] * rad],
      n: [(radial[0] * height + w[0] * rad) / nl,
          (radial[1] * height + w[1] * rad) / nl,
          (radial[2] * height + w[2] * rad) / nl],
    });
  }
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[(i + 1) % sides];
    // the apex takes the average of its two edge normals — a single normal
    // there would tilt the whole facet one way
    const an = [(a.n[0] + b.n[0]) / 2, (a.n[1] + b.n[1]) / 2, (a.n[2] + b.n[2]) / 2];
    push(o, T, an, col); push(o, a.p, a.n, col); push(o, b.p, b.n, col);
  }
  const back = [-w[0], -w[1], -w[2]];
  for (let i = 0; i < sides; i++) {
    const a = ring[i], b = ring[(i + 1) % sides];
    push(o, B, back, col); push(o, b.p, back, col); push(o, a.p, back, col);
  }
}

/** a capped prism between two points — an edge drawn as a thin lit cylinder */
function segTube(o, a, b, rad, col, sides = 6) {
  const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  if (Math.hypot(...dir) < 1e-12) return;
  const { w, u, v } = basis(dir);
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const t = (i / sides) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    ring.push([u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]);
  }
  const at = (n, e) => [e[0] + n[0] * rad, e[1] + n[1] * rad, e[2] + n[2] * rad];
  // sides, with radial normals so the cylinder shades round
  for (let i = 0; i < sides; i++) {
    const p = ring[i], q = ring[(i + 1) % sides];
    const A = at(p, a), B = at(q, a), C = at(q, b), D = at(p, b);
    push(o, A, p, col); push(o, B, q, col); push(o, C, q, col);
    push(o, A, p, col); push(o, C, q, col); push(o, D, p, col);
  }
  // flat caps, so an edge seen end-on is a disc rather than a hole
  for (const [e, k] of [[a, -1], [b, 1]]) {
    const nrm = [w[0] * k, w[1] * k, w[2] * k];
    for (let i = 0; i < sides; i++) {
      const p = ring[i], q = ring[(i + 1) % sides];
      push(o, e, nrm, col);
      push(o, at(k > 0 ? p : q, e), nrm, col);
      push(o, at(k > 0 ? q : p, e), nrm, col);
    }
  }
}

/**
 * A thin torus in the plane through the origin with normal `dir` — the rim of a
 * mirror plane. Major radius `rad`, tube radius `tr`; unlike a flat annulus it
 * has volume, so seen edge-on it is a bar rather than nothing.
 */
function torus(o, dir, rad, tr, col, sides = 224, ring = 8) {
  const { w, u, v } = basis(dir);
  const P = (t, s) => {
    // center circle point + tube offset in the (radial, normal) frame
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
function disc(o, dir, rad, col, sides = 192) {
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

/*
 * The named viewpoints.
 *
 * Each is given as the model direction that should face the viewer, plus a
 * hint at which way is up; the quaternion is derived. Writing them out by
 * hand was fine for four and would be eight chances to fumble a sign for
 * eight — and the derivation states the intent, which a quaternion literal
 * never does. `up` only needs to be non-parallel to `dir`: it is
 * orthogonalised against it.
 *
 * The signed pairs are the same axis seen from opposite sides, so +z and -z
 * are front and back, +y and -y are top and bottom.
 */
const TAU = (1 + Math.sqrt(5)) / 2;          // the golden section

/*
 * The isometric pose. -45° about y, then the 35.264° about x that lands
 * (1,1,1) exactly on the line of sight — atan(1/√2). Written out rather than
 * derived like the rest, because isometric is a pose and not merely a
 * direction: this roll is what stands y upright, which the shortest turn to
 * the same corner misses by 1.9°, and an isometric with a tilted vertical is
 * not what anybody means by one.
 */
const ISO_Q = quatMul(quatFromAxis([1, 0, 0], Math.atan(Math.SQRT1_2)),
                      quatFromAxis([0, 1, 0], -Math.PI / 4));

/*
 * A view is nothing but the direction brought to face the viewer: the turn
 * that gets there is always the SHORTEST one from the canonical +z frame.
 *
 * That settles the roll, which is otherwise an arbitrary choice, and settles
 * it the way a hand would: to see a solid down its (0,1,1) edge you tip it
 * 45° about x and nothing else, so x stays across the screen where it
 * started. Every view is then one turn from home about one axis, and none of
 * them spins the model on the way.
 *
 * The axes worth looking down: the coordinate axes; the body diagonal, which
 * is a cube's 3-fold; (1, 0, τ), an icosahedron's vertex and so a 5-fold;
 * (0, 1/τ, τ), a face center and so a 3-fold; (0, 1, 1), a cube's edge
 * midpoint and so a 2-fold. Down those last the solids look like what they
 * are — an icosahedral stellation seen down its 5-fold axis is five-fold on
 * the screen.
 *
 * These four are not just directions, they are where the symmetry data puts
 * the groups named for them: D5(I) and its family turn about (1, 0, τ), the
 * (I) 3-folds about (0, 1/τ, τ), the (O) 3-folds about the body diagonal and
 * the (O) 2-folds about (0, 1, 1). So choosing D5 and pressing +i5 looks
 * straight down the axis that group turns about. Change a direction here and
 * data/symmetry.json has to move with it — docs/test/symmetry.mjs fails if the
 * two ever disagree.
 */
/*
 * Every direction you can face the solid from, in the order the menu lists
 * them: the coordinate axes, then the cube's symmetry axes, then the
 * icosahedron's — and all of the near sides before any of the far ones. Nine
 * directions, each from both ends.
 *
 * The symmetry views are named for the axis and its order, i for the
 * icosahedron and o for the cube and octahedron, and each name is also the
 * axis the frame-tagged groups of that name turn about: choose D5, press +i5,
 * and you are looking straight down that group's own axis. Down these a solid
 * looks like what it is — an icosahedral stellation seen down its 5-fold axis
 * is five-fold on the screen.
 *
 * i2 and o4 are the z axis under two more names. z is a 2-fold of the
 * icosahedron and a 4-fold of the cube, and though the direction is the same
 * one either way, being able to ask for it by what it IS saves working that
 * out — which is the whole point of naming a direction after its symmetry.
 *
 * Nothing keys off position in this list. The default view is found by name,
 * a document stores its camera as a quaternion, and the tests pair the signs
 * by name — so the order here is the menu's business alone.
 */
const VIEW_SPECS = [
  // ---- the near side ----
  ['+x', [1, 0, 0], 'from +x — y up, z to the left'],
  ['+y', [0, 1, 0], 'from above — x to the right, z down'],
  ['+z', [0, 0, 1], 'from +z — x to the right, y up (the canonical frame)'],
  ['+o2', [0, 1, 1], 'down a cubic 2-fold axis, (0, 1, 1) — an edge, a 45° tip about x'],
  /*
   * o3 is the body diagonal, and it is a pose rather than merely a direction —
   * which is why it carries its own quaternion. Rolled so that y stands
   * upright, which the shortest turn misses by 1.9°, the three axes come off
   * the origin at 120° to one another with one of them vertical: the isometric
   * picture, and the whole point of looking down this axis. The classic
   * construction is -45° about y, then the atan(1/√2) = 35.264° about x that
   * lands (1,1,1) exactly on the line of sight.
   */
  ['+o3', [1, 1, 1],
   'down the body diagonal, a cubic 3-fold — isometric: the axes 120° apart, y upright',
   ISO_Q],
  ['+o4', [0, 0, 1], 'down a cubic 4-fold axis — the z axis, named for what it is'],
  ['+i2', [0, 0, 1], 'down an icosahedral 2-fold axis — the z axis, named for what it is'],
  ['+i3', [0, 1 / TAU, TAU], 'down an icosahedral 3-fold axis, (0, 1/τ, τ) — a face center'],
  ['+i5', [1, 0, TAU], 'down an icosahedral 5-fold axis, (1, 0, τ) — a vertex'],

  // ---- and the same nine from the far side ----
  ['-x', [-1, 0, 0], 'from -x — y up, z to the right'],
  ['-y', [0, -1, 0], 'from below — x to the right, z up'],
  ['-z', [0, 0, -1], 'from behind — y up, x to the left'],
  ['-o2', [0, -1, -1], 'the opposite 2-fold edge'],
  /*
   * The far corner is the near one turned around, not a different tilt: a
   * half turn about the screen's own vertical, which swaps the direction it
   * looks down and leaves y standing.
   */
  ['-o3', [-1, -1, -1], 'the opposite corner',
   quatMul(quatFromAxis([0, 1, 0], Math.PI), ISO_Q)],
  ['-o4', [0, 0, -1], 'the opposite 4-fold'],
  ['-i2', [0, 0, -1], 'the opposite 2-fold'],
  ['-i3', [0, -1 / TAU, -TAU], 'the opposite 3-fold face'],
  ['-i5', [-1, 0, -TAU], 'the opposite 5-fold vertex'],
];

// the shortest turn, unless a spec names the pose it wants instead
const STANDARD_VIEWS = VIEW_SPECS.map(([name, dir, title, q]) => ({
  name, title, q: q || quatBringToViewer(dir),
}));

/** the default: the frame the symmetry groups' matrices are written in */
/*
 * Where home goes before you have chosen anything: the pose the app opens in,
 * so the button returns you to the picture you started from rather than to a
 * different one.
 */
const DEFAULT_VIEW = STANDARD_VIEWS.findIndex(v => v.name === '+o3');

/*
 * How far past the selection's own radius the two sets of scaffolding
 * reach. The symmetry elements clear the solid enough to be followed; the
 * coordinate axes clear THEM, by 5%, so the frame is unmistakably the
 * outermost thing when both are drawn.
 */
const ELEM_EXT = 1.12;
const AXES_EXT = ELEM_EXT * 1.05;

// named orientations, for callers that want to jump straight to one
Renderer3D.STANDARD_VIEWS = STANDARD_VIEWS;

/**
 * The SHORTEST rotation bringing model direction `dir` round to face the
 * viewer — the standard half-way-vector construction: the axis is dir × z
 * and the scalar part 1 + dir·z, normalized.
 *
 * Straight back (dir = -z) is the one direction with no shortest turn: every
 * half turn about every axis in the screen plane does it. That one is chosen
 * rather than derived — about y, which keeps y upright and swings the model
 * left to right, the way a hand would turn it over.
 */
function quatBringToViewer(dir) {
  const l = Math.hypot(...dir) || 1;
  const [x, y, z] = dir.map(v => v / l);
  const w = 1 + z;
  if (w < 1e-9) return [0, 1, 0, 0];             // straight back: a half turn about y
  const q = [y, -x, 0, w];
  const n = Math.hypot(...q);
  return q.map(v => v / n);
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
