/*
 * The Cells walkthrough — live figures embedded in the prose.
 *
 * Every figure is the real thing: the same core.js that drives the app builds
 * the icosahedron's plane arrangement once (about 25 ms), and each figure is a
 * view onto that shared structure. So the Cells table you click here behaves
 * exactly like the one in the app, because it is the same code.
 */

import {
  buildStellation, extractMesh, createDiagram, selectedSubCells,
  parseCells, formatCells, selKey, subCellForFacet, supportSet,
  Renderer3D, layerColor, DiagramView, CellsPanel, labelKeys,
} from './modules.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// ---------------------------------------------------------------- shared build

let stel = null, outline = null, symmetry = null;

function toPoly(g) {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

/** the same outline shape the worker sends the app, so CellsPanel is happy */
function makeOutline(st) {
  const key = s => `${s.layer}.${s.cellIndex}.${s.index}`;
  return st.cellLayers.map((layer, l) => ({
    layer: l,
    cells: layer.map((o, c) => ({
      index: c, primitives: o.cells.length, facets: o.nFacets,
      vertices: o.nVertices, volume: o.volume,
      subCells: o.subCells.map(s => ({
        index: s.index, primitives: s.cells.length, volume: s.volume,
        bottom: [...(s.bottom || [])].map(key), top: [...(s.top || [])].map(key),
      })),
    })),
  }));
}

// ---------------------------------------------------------------- a figure

/*
 * A figure is any combination of: a Cells table, a 3D solid, a stellation
 * diagram, and a readout. Declared entirely in the HTML so the prose stays
 * readable:  <div class="fig" data-parts="cells solid" data-cells="{0,1}">
 */
class Figure {
  constructor(el) {
    this.el = el;
    this.parts = (el.dataset.parts || 'cells solid').split(/\s+/);
    this.selected = parseCells(stel, el.dataset.cells || '{0}');
    this.locked = el.dataset.locked === 'true';
    this.build();
    this.refresh();
  }

  build() {
    const el = this.el;
    el.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'fig-grid parts-' + this.parts.length;
    el.appendChild(grid);

    if (this.parts.includes('cells')) {
      const box = pane(grid, 'Cells');
      const wrap = document.createElement('div');
      wrap.className = 'fig-cells';
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      box.appendChild(wrap);
      this.cells = new CellsPanel(cv, {
        onChange: () => this.refresh(),
        onHover: (h) => { this.info && (this.info.textContent = h ? this.cells.describe(h) : ''); },
      });
      this.cells.setOutline(outline);
      if (this.locked) cv.style.pointerEvents = 'none';
    }

    if (this.parts.includes('solid')) {
      const box = pane(grid, 'The solid');
      const wrap = document.createElement('div');
      wrap.className = 'fig-view';
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      box.appendChild(wrap);
      try {
        this.renderer = new Renderer3D(cv);
        this.renderer.autoRotate = el.dataset.spin === 'true';
        this.renderer.edgeWidth = 1;   // the figures are small — hairlines read better here
        this.renderer.start();
      } catch { wrap.textContent = 'WebGL2 unavailable'; }
    }

    if (this.parts.includes('diagram')) {
      const box = pane(grid, 'The face plane');
      const wrap = document.createElement('div');
      wrap.className = 'fig-view';
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      box.appendChild(wrap);
      this.diagram = new DiagramView(cv, {
        onToggle: (facet, mod) => {
          if (this.locked || !facet.ref) return;
          const k = facet.ref.join('.');
          if (mod.shift) for (const s of this.cells?.supportKeys(k) || [k]) this.selected.add(s);
          else this.selected.has(k) ? this.selected.delete(k) : this.selected.add(k);
          this.refresh();
        },
      });
      if (this.locked) cv.style.pointerEvents = 'none';
    }

    const foot = document.createElement('div');
    foot.className = 'fig-foot';
    this.readout = document.createElement('code');
    this.stats = document.createElement('span');
    this.stats.className = 'fig-stats';
    foot.append(this.readout, this.stats);
    el.appendChild(foot);

    this.info = document.createElement('div');
    this.info.className = 'fig-info';
    el.appendChild(this.info);
  }

  setCells(str) { this.selected = parseCells(stel, str); this.refresh(); }

  refresh() {
    const subs = selectedSubCells(stel, this.selected);
    const mesh = extractMesh(subs, stel.pool);
    this.renderer?.setMesh(mesh, mesh.facetRefs.map(f => f.layer));
    this.cells?.setSelected(this.selected);
    if (this.diagram) {
      const d = createDiagram(stel, 0, subs, 0);
      this.diagram.setData({
        planeIndex: 0, extent: d.extent,
        facets: d.facets.map(f => {
          const sc = subCellForFacet(f.facet);
          return { poly: f.poly, layer: f.layer, selected: f.selected, facing: f.facing,
                   ref: sc ? [sc.layer, sc.cellIndex, sc.index] : null };
        }),
      });
    }
    const str = formatCells(stel, this.selected);
    this.readout.textContent = str;
    const vol = subs.reduce((a, s) => a + s.volume, 0);
    this.stats.innerHTML = mesh.faces.length
      ? `<b>${mesh.vertices.length}</b> vertices · <b>${mesh.faces.length}</b> faces · volume <b>${vol.toFixed(3)}</b>`
      : 'nothing selected';
    this.el.dispatchEvent(new CustomEvent('figchange', { detail: { cells: str } }));
  }
}

function pane(parent, title) {
  const box = document.createElement('div');
  box.className = 'fig-pane';
  const h = document.createElement('h4');
  h.textContent = title;
  box.appendChild(h);
  parent.appendChild(box);
  return box;
}

// ---------------------------------------------------------------- pentagon demo

/*
 * The two-dimensional case, which is the whole idea in miniature: extend the
 * sides of a pentagon and they cross again, outlining a pentagram. Drag the
 * slider to run the lines out.
 */
function pentagonDemo(el) {
  const cv = document.createElement('canvas');
  cv.className = 'penta';
  const range = document.createElement('input');
  Object.assign(range, { type: 'range', min: 0, max: 100, value: 0 });
  range.className = 'penta-range';
  const cap = document.createElement('div');
  cap.className = 'fig-info';
  el.append(cv, range, cap);

  const ctx = cv.getContext('2d');
  const draw = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = cv.width = Math.round(cv.clientWidth * dpr);
    const h = cv.height = Math.round(cv.clientHeight * dpr);
    const t = range.value / 100;
    const R = Math.min(w, h) * 0.19;
    const cx = w / 2, cy = h / 2;
    const P = [];
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
      P.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
    }
    const dark = document.documentElement.dataset.theme !== 'light';
    ctx.clearRect(0, 0, w, h);

    // the pentagram appears at full extension: draw its filled points
    if (t > 0.995) {
      ctx.fillStyle = dark ? 'rgba(245,185,66,0.22)' : 'rgba(200,134,10,0.20)';
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + i * 2 * Math.PI / 5;
        const b = a + Math.PI / 5;
        const Rout = R / Math.cos(Math.PI / 5) * 1.618 / 1.618 * (1 / (Math.cos(Math.PI / 5) * 2 - 1));
        ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
        ctx.lineTo(cx + Rout * Math.cos(b), cy + Rout * Math.sin(b));
      }
      ctx.closePath();
      ctx.fill();
    }

    // each side, extended by t past both ends
    ctx.lineWidth = Math.max(1.5, dpr * 1.4);
    ctx.strokeStyle = dark ? 'rgba(230,235,245,0.85)' : 'rgba(20,25,40,0.85)';
    const grow = 2.9 * t;
    for (let i = 0; i < 5; i++) {
      const a = P[i], b = P[(i + 1) % 5];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      ctx.beginPath();
      ctx.moveTo(a[0] - dx * grow, a[1] - dy * grow);
      ctx.lineTo(b[0] + dx * grow, b[1] + dy * grow);
      ctx.stroke();
    }

    // the original pentagon, always
    ctx.strokeStyle = dark ? '#f5b942' : '#c8860a';
    ctx.lineWidth = Math.max(2, dpr * 2);
    ctx.beginPath();
    P.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.stroke();

    cap.textContent = t < 0.02
      ? 'a pentagon'
      : t > 0.98
        ? 'the sides, fully extended — the crossings outline a pentagram'
        : 'extending the sides…';
  };
  range.oninput = draw;
  new ResizeObserver(draw).observe(cv);
  requestAnimationFrame(draw);
  return { draw };
}

// ---------------------------------------------------------------- boot

async function boot() {
  const [geometry, sym] = await Promise.all([
    fetch('data/geometry.json').then(r => r.json()),
    fetch('data/symmetry.json').then(r => r.json()),
  ]);
  symmetry = sym;

  stel = buildStellation(toPoly(geometry.u27), sym.Ih.matrices, { subMatrices: sym.I.matrices });
  outline = makeOutline(stel);

  const figs = new Map();
  $$('.fig').forEach(el => figs.set(el.id, new Figure(el)));
  $$('.penta').forEach(() => {});
  $$('[data-penta]').forEach(el => pentagonDemo(el));

  // "try it" buttons drive a named figure
  $$('[data-target]').forEach(btn => {
    btn.onclick = () => {
      const f = figs.get(btn.dataset.target);
      if (!f) return;
      if (btn.dataset.cells) f.setCells(btn.dataset.cells);
      if (btn.dataset.spin) f.renderer && (f.renderer.autoRotate = btn.dataset.spin === 'true');
      $$(`[data-target="${btn.dataset.target}"]`).forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      f.el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
  });

  // theme toggle, shared with the app
  const applyTheme = (pref) => {
    const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
    $('#themeBtn').textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '●' : '○';
    for (const f of figs.values()) {
      if (f.renderer) { f.renderer.background = dark ? [0.055, 0.06, 0.078] : [0.965, 0.97, 0.977]; f.renderer.draw(); }
      f.cells?.draw(); f.diagram?.draw();
    }
    $$('[data-penta]').forEach(el => el.dispatchEvent(new Event('redraw')));
  };
  $('#themeBtn').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = document.documentElement.dataset.themePref || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  };
  applyTheme(localStorage.getItem('theme') || 'auto');

  // the key to the bar colours, drawn from the real palette
  const legendHost = $('#barLegend');
  if (legendHost) {
    const entries = figs.get('figLayers')?.cells?.legend() || [];
    legendHost.innerHTML = entries.map(e =>
      `<span class="legend-item"><i style="background:${e.color}"></i>${e.count} ${e.count === 1 ? 'piece' : 'pieces'}</span>`).join('');
    const rare = entries[entries.length - 1];
    const rareEl = $('#barRare');
    if (rare && rareEl) {
      rareEl.innerHTML = `<i class="swatch" style="background:${rare.color}"></i> the ${rare.count}-piece colour`;
    }
  }

  // the layer legend swatches
  $$('[data-layerswatch]').forEach(el => {
    const c = layerColor(Number(el.dataset.layerswatch)).map(v => Math.round(v * 255));
    el.style.background = `rgb(${c})`;
  });

  labelKeys();          // name the carve modifier for this platform
  $('#loading')?.remove();

  // progress rail
  const secs = $$('section[id]');
  const rail = $('#rail');
  if (rail) {
    secs.forEach(s => {
      const a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.dataset.short || s.querySelector('h2')?.textContent || s.id;
      rail.appendChild(a);
    });
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) {
        rail.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(s => io.observe(s));
  }

  window.walkthrough = { stel, figs, outline, supportSet };
}

boot();
