/*
 * The stellation diagram: one face plane with every other face plane's trace
 * drawn on it. This is the classic picture from Coxeter's "The Fifty-Nine
 * Icosahedra", and it is how you actually choose a stellation — each little
 * region is a cell, and clicking one adds or removes it.
 */

import { ACTION } from './render3d.js';
import { layerColor, classColor, cosetColor, faceColor } from './palette.js';
import { diagramSVG } from './diagramsvg.js';

export class DiagramView {
  constructor(canvas, { onToggle, onHover } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = null;
    this.onToggle = onToggle;
    this.onHover = onHover;
    this.hover = -1;
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.showAll = true;
    // draw the arrangement the way Brückner and Hess drew it: full plane traces,
    // no fills, no shell tinting. See _lines().
    this.lineOnly = false;
    // 'layer' | 'class' — matches the 3D view; see _color()
    this.colorMode = 'layer';

    // Drag pans, a click without meaningful movement selects. Without the
    // distinction you cannot pan at all without toggling whatever is underneath.
    let down = null, moved = 0;

    // capture can throw for a pointer the browser is not tracking; it is an
    // optimisation for dragging outside the canvas, never a precondition
    const capture = (e, on) => {
      try { on ? canvas.setPointerCapture?.(e.pointerId) : canvas.releasePointerCapture?.(e.pointerId); }
      catch { /* nothing to capture */ }
    };

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;           // secondary press is inert, never pans
      down = { x: e.clientX, y: e.clientY, pan: { ...this.pan } };
      moved = 0;
      capture(e, true);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (down) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        moved = Math.max(moved, Math.hypot(dx, dy));
        if (moved > 3) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          this.pan = { x: down.pan.x + dx * dpr, y: down.pan.y + dy * dpr };
          canvas.style.cursor = 'grabbing';
          this.draw();
        }
        return;
      }
      const i = this.hitTest(e);
      const m = mods(e);
      // both diagram gestures are toggles — of the cell beneath this region and
      // of the one resting on it — so they get their own colors, not the 3-D
      // view's add-green and remove-red
      const act = m.shift ? 'below' : m.ctrl ? 'above' : null;
      if (i !== this.hover || act !== this.hoverAction) {
        this.hover = i;
        this.hoverAction = act;
        this.canvas.style.cursor = i >= 0 ? 'pointer' : 'grab';
        this.draw();
        this.onHover?.(i >= 0 ? this.data.facets[i] : null);
      }
    });

    /*
     * The color under the pointer says what a click would do, so it has to
     * follow the modifier keys and not just the pointer — otherwise letting go
     * of shift leaves the diagram claiming a click will still add.
     */
    const replay = (e) => {
      if (!this._last || down) return;
      const act = e.shiftKey ? 'below' : (e.ctrlKey || e.metaKey || e.altKey) ? 'above' : null;
      if (act === this.hoverAction) return;
      this.hoverAction = act;
      this.draw();
    };
    addEventListener('keydown', replay);
    addEventListener('keyup', replay);
    canvas.addEventListener('pointermove', (e) => { this._last = e; });

    /*
     * A bare click does nothing here, exactly as in the 3D view — there it
     * turns the model, here it pans the diagram, and in both a modifier is
     * what says "I mean this cell". Before, a click in the 3D view orbited
     * while the same click in the diagram toggled a cell, which is the sort of
     * inconsistency you have to memorise rather than learn.
     */
    const release = (e) => {
      if (!down) return;
      const wasDrag = moved > 3;
      down = null;
      capture(e, false);
      canvas.style.cursor = 'grab';
      if (wasDrag) return;
      const m = mods(e);
      if (!m.shift && !m.ctrl) return;      // a bare click pans, nothing more
      const i = this.hitTest(e);
      if (i >= 0) this.onToggle?.(this.data.facets[i], m);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', () => { down = null; });

    canvas.addEventListener('pointerleave', () => {
      if (this.hover !== -1) { this.hover = -1; this.draw(); this.onHover?.(null); }
    });

    /*
     * No double-click handler.
     *
     * There was one, and it reset the pan and zoom. But the gestures here are
     * clicks — shift-click and ctrl-click each toggle a cell — so toggling two
     * cells in quick succession, or the same one twice, lands inside the
     * double-click interval and threw the view back to its default in the
     * middle of the work. A reset nobody asked for costs more than the
     * shortcut saved: resetView() is still called when the diagram plane
     * changes, which is when a stale pan really would be wrong.
     */

    // A real right-click does nothing. macOS ctrl-click reaches the page only
    // as this event, and is told apart by the modifier it carries.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      down = null;
      if (!e.ctrlKey) return;
      // shift wins even here, matching the hover color: a macOS ctrl+shift-click
      // arrives as this event but the user meant the shift gesture
      const i = this.hitTest(e);
      if (i >= 0) this.onToggle?.(this.data.facets[i],
        e.shiftKey ? { shift: true, ctrl: false } : { shift: false, ctrl: true });
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      // zoom about the pointer, so you can dive into a corner of the diagram
      const f = Math.min(4, Math.max(0.25, Math.exp(-e.deltaY * 0.0015)));
      const before = this.zoom;
      this.zoom = Math.min(400, Math.max(0.04, this.zoom * f));   // far enough out to see the cropped tail
      const k = this.zoom / before;
      const fr = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = (e.clientX - fr.left) * dpr, py = (e.clientY - fr.top) * dpr;
      const cx = this.canvas.width / 2 + this.pan.x, cy = this.canvas.height / 2 + this.pan.y;
      this.pan = { x: this.pan.x + (cx - px) * (k - 1), y: this.pan.y + (cy - py) * (k - 1) };
      this.draw();
    }, { passive: false });

    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  setData(data) {
    const changedPlane = this.data?.planeIndex !== data?.planeIndex;
    this.data = data;
    this.hover = -1;
    if (changedPlane) this.resetView(); else this.draw();
  }

  /** switch between coloring by shell and by face class, as the 3D view does */
  setColorMode(mode) {
    if (mode === this.colorMode) return;
    this.colorMode = mode;
    this.draw();
  }

  /**
   * The fill color for a facet, as [r,g,b] in 0..1.
   *
   * By shell: the layer palette, so the concentric rings of the arrangement
   * read as depth — which is what a stellation diagram is usually for.
   *
   * By face class: a diagram is drawn on ONE plane, and every facet in it lies
   * in that same face of the solid. So the whole picture takes one hue, and the
   * only variation left is which way a facet looks. That is deliberately flat:
   * it is the honest answer to "which face of the original solid is this?", and
   * it makes the diagram and the solid agree at a glance — the plane you are
   * drawing on is the color you see on the model.
   */
  /** either of the two face-class modes, as against coloring by shell */
  _byClass() { return this.colorMode === 'class' || this.colorMode === 'stellClass'; }

  /*
   * The group this region belongs to under the mode in force. A diagram is one
   * plane, so the two class modes read the whole picture's class; everything
   * else is per region.
   */
  _group(facet) {
    switch (this.colorMode) {
      case 'class': return this.data?.faceClass || 0;
      case 'stellClass': return this.data?.faceClassStell || 0;
      // by coset: the plane's own coset, or the region's, or its split pieces
      case 'coset': return facet.coset ?? -1;
      case 'cosetL': return facet.cosetL ?? -1;
      case 'cosetM': return facet.cosetM ?? -1;
      case 'orbitP': return facet.orbitP ?? 0;
      case 'orbitF': return facet.orbitF ?? 0;
      case 'orbitC': return facet.orbitC ?? 0;
      default: return facet.layer;
    }
  }

  /** [r, g, b, a] — overrides from the Colors panel included */
  _color(facet, outward = true) {
    return faceColor(this.colorMode, this._group(facet), outward);
  }

  /** symmetry-element marks: [{kind:'point'|'line', p:[x,y], q?, color}] or null */
  setOverlay(overlay) {
    this.overlay = overlay;
    this.draw();
  }

  resetView() {
    this.zoom = 1;
    this.pan = { x: 0, y: 0 };
    this.draw();
  }

  /** device-pixel transform from diagram coords to canvas coords */
  _frame() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    const extent = (this.data?.extent || 1);
    const scale = (Math.min(w, h) * 0.46 / extent) * this.zoom;
    return { w, h, dpr, scale, cx: w / 2 + this.pan.x, cy: h / 2 + this.pan.y };
  }

  /** a css color from [r,g,b,a?], at the alpha given */
  _rgba(c, alpha) {
    const v = c.slice(0, 3).map(x => Math.round(x * 255));
    return alpha >= 1 ? `rgb(${v.join(',')})` : `rgba(${v.join(',')},${alpha.toFixed(3)})`;
  }

  _path(ctx, poly, f) {
    ctx.beginPath();
    poly.forEach(([x, y], i) => {
      const px = f.cx + x * f.scale, py = f.cy - y * f.scale;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
  }

  /*
   * The distinct plane traces, as infinite lines ax + by + c = 0 with (a,b) a
   * unit normal. Every facet edge lies on one of them, so collecting the edges
   * and deduping recovers the lines themselves — for the icosahedron there are
   * eighteen, because the twentieth plane is parallel to the drawing plane and
   * one of the twenty is the drawing plane.
   */
  _lines() {
    if (this._lineFor === this.data) return this._lineCache;
    const extent = this.data.extent || 1;
    const angTol = 2e-3;                  // ~0.1°
    const offTol = 1e-3 * extent;
    const out = [];

    // A line and its negation are the same line, so compare both orientations
    // rather than trying to pick a canonical sign — the sign rule is unstable
    // exactly when a normal component sits near zero, which is common here.
    const same = (L, a, b, c) =>
      (Math.abs(L[0] - a) < angTol && Math.abs(L[1] - b) < angTol && Math.abs(L[2] - c) < offTol) ||
      (Math.abs(L[0] + a) < angTol && Math.abs(L[1] + b) < angTol && Math.abs(L[2] + c) < offTol);

    for (const facet of this.data.facets) {
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
    this._lineFor = this.data;
    this._lineCache = out;
    return out;
  }

  /** the traces, drawn full width — the engraved look of the printed plates */
  _drawLines(ctx, f, dark) {
    const R = Math.hypot(f.w, f.h);                 // longer than any chord
    ctx.strokeStyle = dark ? 'rgba(205,215,240,0.62)' : 'rgba(25,25,35,0.72)';
    ctx.lineWidth = Math.max(0.55, f.dpr * 0.55);
    for (const [a, b, c] of this._lines()) {
      // a point on the line, in diagram coordinates, then along its direction
      const x0 = -a * c, y0 = -b * c;
      const px = f.cx + x0 * f.scale, py = f.cy - y0 * f.scale;
      const dx = -b, dy = a;                        // direction, screen y flipped
      ctx.beginPath();
      ctx.moveTo(px - dx * R, py + dy * R);
      ctx.lineTo(px + dx * R, py - dy * R);
      ctx.stroke();
    }
  }

  draw() {
    const ctx = this.ctx;
    const f = this._frame();
    const dark = matchMedia('(prefers-color-scheme: dark)').matches ||
                 document.documentElement.dataset.theme === 'dark';

    ctx.clearRect(0, 0, f.w, f.h);
    ctx.fillStyle = dark ? '#0e1014' : '#ffffff';
    ctx.fillRect(0, 0, f.w, f.h);
    if (!this.data) return;

    const facets = this.data.facets;

    if (this.lineOnly) {
      this._drawLines(ctx, f, dark);
      // the original face, so the center of the figure is identifiable
      const core = facets.find(x => x.layer === 0);
      if (core) {
        ctx.fillStyle = dark ? 'rgba(230,180,90,0.30)' : 'rgba(200,140,40,0.28)';
        this._path(ctx, core.poly, f);
        ctx.fill();
      }
      if (this.hover >= 0 && facets[this.hover]) {
        ctx.fillStyle = dark ? 'rgba(255,255,255,0.20)' : 'rgba(0,0,0,0.13)';
        this._path(ctx, facets[this.hover].poly, f);
        ctx.fill();
      }
      return;
    }

    // 1. every facet, filled faintly by layer, so the arrangement reads as depth
    if (this.showAll) {
      for (const facet of facets) {
        if (this.colorMode === 'cosetM' && facet.pieces) {
          for (const pc of facet.pieces) {
            const c = faceColor(this.colorMode, pc.label ?? -1, true);
            ctx.fillStyle = this._rgba(c, (dark ? 0.17 : 0.13) * c[3]);
            this._path(ctx, pc.poly, f);
            ctx.fill();
          }
          continue;
        }
        const c = this._color(facet);
        ctx.fillStyle = this._rgba(c, (dark ? 0.17 : 0.13) * c[3]);
        this._path(ctx, facet.poly, f);
        ctx.fill();
      }
    }

    /*
     * 2. selected facets.
     *
     * The diagram shows the *surface* of the solid, not its volume, and a face
     * can be on that surface in two ways: looking outward, or lining a cavity
     * and looking inward. Drawing both the same invites the reading that a
     * filled region means solid material there — which is backwards, since an
     * inward-facing face means there is a hole behind it.
     *
     * The two modes say it differently, each matching what the 3D view is doing
     * beside them. By shell, hue is already spent on depth, so the difference
     * has to be carried by alpha: outward solid, inward very pale — "surface,
     * but not the outside". By face class, hue is free, so the two get the two
     * colors the solid uses — the class color and the same color darkened —
     * both fully opaque. That is the whole point of the class palette: two
     * colors for one kind of face, one seen from above and one from below.
     */
    for (const facet of facets) {
      if (!facet.selected) continue;
      const inward = facet.facing === 0;
      if (this.colorMode === 'cosetM' && facet.pieces) {
        // the mirror-split pieces, each with its own crisp color
        for (const pc of facet.pieces) {
          const c = faceColor(this.colorMode, pc.label ?? -1, !inward);
          ctx.fillStyle = this._rgba(c, (inward ? (dark ? 0.42 : 0.34) : 1) * c[3]);
          this._path(ctx, pc.poly, f);
          ctx.fill();
        }
        continue;
      }
      const c = this._color(facet, !inward);
      // inward faces were pale enough to be missed entirely at the old alpha.
      // Still clearly lighter than an outward face, but readable.
      // by class, either class, the underside already has its own darkened
      // hue — fading it as well would say the same thing twice
      const fade = (inward && !this._byClass()) ? (dark ? 0.42 : 0.34) : 1;
      ctx.fillStyle = this._rgba(c, fade * c[3]);
      this._path(ctx, facet.poly, f);
      ctx.fill();
    }

    /*
     * 3. the plane traces — every facet outline drawn thin.
     *
     * Zoomed far out the traces crowd to within a pixel of each other and the
     * bundle shimmers («aliasing … want no aliasing»). There is no extra
     * resolution to be had at that scale, so shed weight instead: below 1×
     * zoom the strokes thin and fade with the zoom, which is what the same
     * drawing printed small would do.
     */
    const crowd = Math.min(1, Math.max(0.3, this.zoom));
    ctx.strokeStyle = dark ? `rgba(190,205,235,${0.45 * crowd})` : `rgba(20,25,40,${0.42 * crowd})`;
    ctx.lineWidth = Math.max(0.5, f.dpr * 0.6 * crowd);
    for (const facet of facets) { this._path(ctx, facet.poly, f); ctx.stroke(); }

    // 4. selected outlines, heavier — dashed where the face looks inward
    ctx.lineWidth = Math.max(1, f.dpr * 1.1);
    for (const facet of facets) {
      if (!facet.selected) continue;
      const inward = facet.facing === 0;
      ctx.strokeStyle = inward
        ? (dark ? 'rgba(255,255,255,0.38)' : 'rgba(0,0,0,0.32)')
        : (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)');
      ctx.setLineDash(inward ? [4 * f.dpr, 3 * f.dpr] : []);
      this._path(ctx, facet.poly, f);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    /*
     * 4½. the symmetry elements, where they meet this plane.
     *
     * The Java original draws these on its diagram: the point where each
     * rotation axis pierces the drawing plane, and the line where each mirror
     * plane crosses it. Colors match the
     * 3-D view's, so the dot on the diagram and the cylinder in the solid
     * read as the same object.
     */
    if (this.overlay) {
      for (const el of this.overlay) {
        if (el.kind === 'line') {
          const x1 = f.cx + el.p[0] * f.scale, y1 = f.cy - el.p[1] * f.scale;
          const x2 = f.cx + el.q[0] * f.scale, y2 = f.cy - el.q[1] * f.scale;
          let dx = x2 - x1, dy = y2 - y1;
          const L = Math.hypot(dx, dy) || 1;
          dx /= L; dy /= L;
          const R = Math.hypot(f.w, f.h);
          ctx.strokeStyle = el.color;
          ctx.lineWidth = Math.max(1.1, f.dpr * 1.1);
          ctx.setLineDash([7 * f.dpr, 5 * f.dpr]);
          ctx.beginPath();
          ctx.moveTo(x1 - dx * R, y1 - dy * R);
          ctx.lineTo(x1 + dx * R, y1 + dy * R);
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const x = f.cx + el.p[0] * f.scale, y = f.cy - el.p[1] * f.scale;
          ctx.beginPath();
          ctx.arc(x, y, 4.2 * f.dpr, 0, Math.PI * 2);
          ctx.fillStyle = el.color;
          ctx.fill();
          ctx.lineWidth = 1.4 * f.dpr;
          ctx.strokeStyle = dark ? '#0e1014' : '#ffffff';
          ctx.stroke();
        }
      }
    }

    /*
     * 5. hover highlight, colored by what a click would do.
     *
     * Green for shift (add), red for the carve modifier, and a neutral wash when
     * neither is held, since a bare click here only pans. The same two colors
     * mean the same two things in the 3-D view and in the Cells table.
     */
    if (this.hover >= 0 && facets[this.hover]) {
      const a = ACTION[this.hoverAction];
      const rgb = a ? a.rgb.map(v => Math.round(v * 255)).join(',') : null;
      ctx.fillStyle = rgb ? `rgba(${rgb},0.36)`
                          : (dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.14)');
      this._path(ctx, facets[this.hover].poly, f);
      ctx.fill();
      ctx.strokeStyle = rgb ? `rgb(${rgb})` : (dark ? '#fff' : '#000');
      ctx.lineWidth = Math.max(1.5, f.dpr * (rgb ? 2.2 : 1.6));
      ctx.stroke();
    }
  }

  hitTest(e) {
    if (!this.data) return -1;
    const f = this._frame();
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * (f.w / r.width);
    const py = (e.clientY - r.top) * (f.h / r.height);
    const x = (px - f.cx) / f.scale;
    const y = -(py - f.cy) / f.scale;

    // smallest containing facet wins — inner cells are drawn on top of outer ones
    let best = -1, bestArea = Infinity;
    this.data.facets.forEach((facet, i) => {
      if (!pointInPoly(x, y, facet.poly)) return;
      const a = Math.abs(polyArea(facet.poly));
      if (a < bestArea) { bestArea = a; best = i; }
    });
    return best;
  }

  /** PNG data URL of the diagram as drawn */
  snapshot() { this.draw(); return this.canvas.toDataURL('image/png'); }

  /** standalone SVG of the diagram, for printing or laser cutting */
  /**
   * The diagram as vector art.
   *
   * The drawing itself is diagramSVG() in diagramsvg.js — a pure function, so
   * that the file you export and the pictures on the example pages come out of
   * one piece of code. What belongs to the view, and so is supplied here, is
   * only what the view happens to be showing: which coloring, and whether the
   * traces are drawn as the arrangement's facets or straight across the plane.
   * Zoom and pan are deliberately not passed — an exported diagram is always
   * the whole plane, or two of them could not be compared.
   */
  toSVG(options = {}) {
    if (!this.data) return '';
    return diagramSVG(this.data, {
      colorMode: this.colorMode,
      traces: this.lineOnly ? 'full' : 'facets',
      fill: !this.lineOnly,       // was `shading`, an option diagramSVG never read
      ...options,
    });
  }
}

/** shift adds; alt, cmd or ctrl carve — see the note in cells.js */
function mods(e) {
  const shift = e.shiftKey;
  return { shift, ctrl: !shift && (e.ctrlKey || e.metaKey || e.altKey), alt: e.altKey };
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function polyArea(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
  }
  return a / 2;
}
