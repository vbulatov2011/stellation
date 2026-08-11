/*
 * BFigure — the inline live figure used by the Brückner pages.
 *
 * <div class="bfig" data-poly="u27" data-cells="{0,1,2}" data-parts="cells solid">
 *
 * A figure builds lazily (call start() when it nears the viewport): the rhombic
 * triacontahedron alone is thirteen shells deep and most readers never reach it.
 * The stellation builder is injected so that every page shares one cache.
 */

import {
  buildStellation, extractMesh, createDiagram, selectedSubCells,
  parseCells, formatCells, subCellForFacet, facePlanes, suggestDepth,
  Renderer3D, DiagramView, CellsPanel,
} from './modules.js';

const SUBGROUP = { Ih: 'I', Oh: 'O', Td: 'T', Th: 'T' };

function toPoly(g) {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

/** shared, cached stellation builder over the loaded data files */
export function makeBuilder(geometry, symmetry, catalog) {
  const built = new Map();

  function itemFor(file) {
    for (const cat of catalog) for (const it of cat.items) if (it.file === file) return it;
    return null;
  }

  function build(file, symName) {
    if (built.has(file)) return built.get(file);
    const poly = toPoly(geometry[file]);
    const sym = symName || itemFor(file)?.symmetry || 'Ih';
    const sub = SUBGROUP[sym] || sym;
    const stel = buildStellation(poly, symmetry[sym].matrices, {
      subMatrices: symmetry[sub]?.matrices,
      maxIntersection: suggestDepth(facePlanes(poly)),
    });
    const key = s => `${s.layer}.${s.cellIndex}.${s.index}`;
    const outline = stel.cellLayers.map((layer, l) => ({
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
    const rec = { stel, outline, sym, sub };
    built.set(file, rec);
    return rec;
  }

  return { build, built };
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

export class BFigure {
  constructor(el, build) {
    this.el = el;
    this.build = build;
    this.file = el.dataset.poly;
    this.parts = (el.dataset.parts || 'cells solid').split(/\s+/);
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const rec = this.build(this.file, this.el.dataset.sym);
    this.stel = rec.stel;
    this.outline = rec.outline;
    this.selected = parseCells(this.stel, this.el.dataset.cells ?? '{0}');
    this.render();
    this.refresh();
  }

  render() {
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
        onHover: (h) => { this.info.textContent = h ? this.cells.describe(h) : ''; },
      });
      this.cells.setOutline(this.outline);
    }

    if (this.parts.includes('solid')) {
      const box = pane(grid, 'The model, rebuilt');
      const wrap = document.createElement('div');
      wrap.className = 'fig-view';
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      box.appendChild(wrap);
      try {
        this.renderer = new Renderer3D(cv);
        this.renderer.autoRotate = this.el.dataset.spin === 'true';   // opt-in
        this.renderer.edgeWidth = 1;
        this.renderer.start();
      } catch { wrap.textContent = 'WebGL2 unavailable'; }
    }

    if (this.parts.includes('diagram')) {
      const box = pane(grid, 'The complete figure');
      const wrap = document.createElement('div');
      wrap.className = 'fig-view';
      const cv = document.createElement('canvas');
      wrap.appendChild(cv);
      box.appendChild(wrap);
      this.diagram = new DiagramView(cv, {
        onToggle: (facet, mod) => {
          if (!facet.ref) return;
          const k = facet.ref.join('.');
          if (mod.shift) for (const s of this.cells?.supportKeys(k) || [k]) this.selected.add(s);
          else this.selected.has(k) ? this.selected.delete(k) : this.selected.add(k);
          this.refresh();
        },
      });
      if (this.el.dataset.lines === 'true') this.diagram.lineOnly = true;
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

  setCells(str) {
    this.start();
    this.selected = parseCells(this.stel, str);
    this.refresh();
  }

  refresh() {
    const subs = selectedSubCells(this.stel, this.selected);
    const mesh = extractMesh(subs, this.stel.pool);
    this.renderer?.setMesh(mesh, mesh.facetRefs.map(f => f.layer));
    this.cells?.setSelected(this.selected);

    if (this.diagram) {
      const d = createDiagram(this.stel, 0, subs, 0);
      if (d) this.diagram.setData({
        planeIndex: 0, extent: d.extent,
        facets: d.facets.map(f => {
          const sc = subCellForFacet(f.facet);
          return { poly: f.poly, layer: f.layer, selected: f.selected,
                   ref: sc ? [sc.layer, sc.cellIndex, sc.index] : null };
        }),
      });
    }

    this.readout.textContent = formatCells(this.stel, this.selected);
    const vol = subs.reduce((a, s) => a + s.volume, 0);
    this.stats.innerHTML = mesh.faces.length
      ? `<b>${mesh.vertices.length}</b> v · <b>${mesh.faces.length}</b> f · vol <b>${vol.toFixed(3)}</b>`
      : 'nothing selected';
  }

  /** stop the render loop and empty the element (before rebuilding with another solid) */
  destroy() {
    this.renderer?.stop();
    this.el.innerHTML = '';
  }
}
