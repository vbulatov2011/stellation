/*
 * Brückner 1900, interactive edition.
 *
 * Three things have to line up on this page: the scanned plate, the printed
 * pages that discuss it, and the same solid built live by the stellation
 * engine. The first two come from the Internet Archive scan of the University
 * of Toronto copy; the third is the same code the app runs.
 *
 * Page addressing. The Archive's reader indexes *images*, not printed pages,
 * so every reference here is a 0-based image index ("leaf"). The map from
 * printed page to leaf was taken from the scan's own scandata.xml, and the
 * plate sheets were checked by eye against the plate captions and the running
 * foot, so these numbers are checked rather than guessed. See PLATES and PAGES.
 */

import {
  buildStellation, extractMesh, createDiagram, selectedSubCells,
  parseCells, formatCells, subCellForFacet, facePlanes, suggestDepth,
  Renderer3D, DiagramView, CellsPanel, labelKeys,
} from './modules.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const IA = 'vieleckeundvielf00bruoft';
const img = (leaf, size = 'medium') =>
  `https://archive.org/download/${IA}/page/n${leaf}_${size}.jpg`;
const readerSrc = leaf =>
  `https://archive.org/embed/${IA}?ui=embed#page/n${leaf}/mode/2up`;

/* Printed page → leaf, for the pages this page links to. */
const PAGES = {
  131: 144, 169: 182, 183: 196, 184: 197, 188: 201, 191: 204, 193: 206,
  200: 213, 201: 214, 206: 219, 207: 220, 208: 221, 209: 222, 210: 223,
  211: 224, 217: 230,
};

/* The twelve plates. `leaf` is the plate's FIRST sheet — for I–VII, XI and XII
   that sheet also carries the "Tafel N" caption, but for VIII, IX and X the
   caption is on the second sheet (257, 259, 263) and the first carries the
   running foot instead. `sheets` lists every sheet the plate runs across. */
const PLATES = [
  { n: 'I',    kind: 'litho', leaf: 242, sheets: [242, 243], note: 'Polygons: construction figures.' },
  { n: 'II',   kind: 'litho', leaf: 245, sheets: [244, 245],
    note: 'Carries Fig. 17, the complete figure of the planes of the icosahedron — the stellation diagram this program draws. Fig. 16 is the dodecahedron’s.' },
  { n: 'III',  kind: 'litho', leaf: 247, sheets: [246, 247], note: 'Nets and spherical nets.' },
  { n: 'IV',   kind: 'litho', leaf: 249, sheets: [248, 249], note: 'Nets and spherical nets.' },
  { n: 'V',    kind: 'litho', leaf: 251, sheets: [250, 251], note: 'Nets and spherical nets.' },
  { n: 'VI',   kind: 'litho', leaf: 253, sheets: [252, 253], note: 'Elementary and spherical nets, then perspective drawings of the semiregular solids.' },
  { n: 'VII',  kind: 'litho', leaf: 255, sheets: [254, 255], note: 'Perspective drawings of the polyhedra of higher kind, each with its boundary face lettered on the solid.' },
  { n: 'VIII', kind: 'photo', leaf: 256, sheets: [256, 257], note: 'Models 1–20 on the first sheet. No. 3 is two cubes on a common 3-fold axis; no. 12 the compound of three octahedra — both in Escher’s <i>Stars</i>.' },
  { n: 'IX',   kind: 'photo', leaf: 258, sheets: [258, 259], note: 'The compound plate: nos. 3, 6 and 11 on the first sheet, nos. 20 and 23 on the second. Escher cited this plate twice by number.' },
  { n: 'X',    kind: 'photo', leaf: 260, sheets: [260, 263], note: 'Models 1–21, then 22–33. No. 13 is the first stellation of the rhombic dodecahedron — Escher’s solid.' },
  { n: 'XI',   kind: 'photo', leaf: 265, sheets: [264, 265], note: 'Models 1–12, then 13–24. No. 14 is the final stellation of the icosahedron; no. 24 the great icosahedron.' },
  { n: 'XII',  kind: 'photo', leaf: 267, sheets: [266, 267], note: 'One-sided polyhedra and the last of the higher-kind forms.' },
];

// ------------------------------------------------------------------ engine

let geometry = null, symmetry = null, catalog = null;
const built = new Map();
const SUBGROUP = { Ih: 'I', Oh: 'O', Td: 'T', Th: 'T' };

function toPoly(g) {
  const vertices = [];
  for (let i = 0; i < g.v.length; i += 3) vertices.push({ x: g.v[i], y: g.v[i + 1], z: g.v[i + 2] });
  return { vertices, faces: g.f };
}

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

// ------------------------------------------------------------------ figure

/*
 * <div class="bfig" data-poly="u27" data-cells="{0,1,2}" data-parts="cells solid">
 *
 * Built the first time it comes near the viewport: the rhombic triacontahedron
 * alone is thirteen shells deep and most readers never scroll to it.
 */
class BFigure {
  constructor(el) {
    this.el = el;
    this.file = el.dataset.poly;
    this.parts = (el.dataset.parts || 'cells solid').split(/\s+/);
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const rec = build(this.file, this.el.dataset.sym);
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
          return { poly: f.poly, layer: f.layer, selected: f.selected, facing: f.facing,
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

// ------------------------------------------------------------------ reader

/* One embedded Archive reader, driven by every "read the page" button. Loading
   the iframe is deferred until first use — it is a heavy third-party page. */
const reader = {
  open(leaf, label) {
    const box = $('#reader');
    const frame = $('#readerFrame');
    if (frame.dataset.leaf !== String(leaf)) {
      frame.innerHTML = `<iframe src="${readerSrc(leaf)}" allowfullscreen
        title="Vielecke und Vielflache, Internet Archive scan"></iframe>`;
      frame.dataset.leaf = String(leaf);
    }
    box.classList.add('open');
    $('#readerWhere').textContent = label;
    $('#readerToggle').textContent = 'hide';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  close() {
    $('#reader').classList.remove('open');
    $('#readerToggle').textContent = 'show';
  },
};

function openPage(printed) {
  const leaf = PAGES[printed];
  if (leaf == null) return;
  reader.open(leaf, `p. ${printed}`);
}

// ------------------------------------------------------------------- boot

function renderPlates() {
  const box = $('#plates');
  if (!box) return;
  for (const p of PLATES) {
    const el = document.createElement('button');
    el.className = 'plate';
    el.type = 'button';
    el.innerHTML =
      `<img loading="lazy" alt="Plate ${p.n}" src="${img(p.leaf, 'small')}">` +
      `<span class="${p.kind === 'photo' ? 'tag-photo' : 'tag-litho'}">` +
      `${p.kind === 'photo' ? 'collotype' : 'lithograph'}</span>` +
      `<b>Tafel ${p.n}</b><span>${p.note}</span>`;
    el.onclick = () => reader.open(p.sheets[0], `Tafel ${p.n}`);
    box.appendChild(el);
  }
}

async function boot() {
  [geometry, symmetry, catalog] = await Promise.all([
    fetch('data/geometry.json').then(r => r.json()),
    fetch('data/symmetry.json').then(r => r.json()),
    fetch('data/catalog.json').then(r => r.json()),
  ]);

  renderPlates();

  const figs = new Map();
  $$('.bfig').forEach(el => figs.set(el.id, new BFigure(el)));
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      figs.get(e.target.id)?.start();
      io.unobserve(e.target);
    }
  }, { rootMargin: '300px 0px' });
  figs.forEach((f, id) => io.observe(document.getElementById(id)));

  // fill in every plate thumbnail and page/plate button declared in the markup
  $$('[data-leaf-img]').forEach(el => { el.src = img(+el.dataset.leafImg); });
  $$('[data-page]').forEach(b => { b.onclick = () => openPage(+b.dataset.page); });
  $$('[data-leaf]').forEach(b => {
    b.onclick = () => reader.open(+b.dataset.leaf, b.dataset.leafLabel || 'the plate');
  });
  $$('[data-target]').forEach(btn => {
    btn.onclick = () => {
      const f = figs.get(btn.dataset.target);
      if (!f) return;
      f.start();
      if (btn.dataset.lines && f.diagram) {
        f.diagram.lineOnly = btn.dataset.lines === 'true';
        f.diagram.draw();
      }
      if (btn.dataset.cells) f.setCells(btn.dataset.cells);
      $$(`[data-target="${btn.dataset.target}"]`).forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
    };
  });

  $('#readerToggle').onclick = () => {
    const box = $('#reader');
    if (box.classList.contains('open')) reader.close();
    else if ($('#readerFrame').dataset.leaf) reader.open(+$('#readerFrame').dataset.leaf, $('#readerWhere').textContent);
    else reader.open(7, 'title page');
  };
  $('#readerGo').onclick = () => {
    const v = parseInt($('#readerPage').value, 10);
    if (Number.isFinite(v)) {
      const leaf = PAGES[v] ?? (v >= 1 && v <= 227 ? v + 13 : null);
      if (leaf != null) reader.open(leaf, `p. ${v}`);
    }
  };
  $('#readerPage').onkeydown = e => { if (e.key === 'Enter') $('#readerGo').click(); };

  // click any plate image to see it full size
  const lb = $('#lightbox');
  document.addEventListener('click', e => {
    const im = e.target.closest('.entry-plate img, .compare img');
    if (!im) return;
    lb.querySelector('img').src = im.dataset.full || im.src.replace('_medium', '');
    lb.classList.add('on');
  });
  lb.onclick = () => lb.classList.remove('on');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') lb.classList.remove('on'); });

  const applyTheme = (pref) => {
    const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.themePref = pref;
    $('#themeBtn').textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '●' : '○';
    for (const f of figs.values()) {
      if (f.renderer) { f.renderer.background = dark ? [0.055, 0.06, 0.078] : [0.965, 0.97, 0.977]; f.renderer.draw(); }
      f.cells?.draw(); f.diagram?.draw();
    }
  };
  $('#themeBtn').onclick = () => {
    const order = ['auto', 'light', 'dark'];
    const cur = document.documentElement.dataset.themePref || 'auto';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem('theme', next);
    applyTheme(next);
  };
  applyTheme(localStorage.getItem('theme') || 'auto');

  const rail = $('#rail');
  const secs = $$('section[id]');
  if (rail) {
    secs.forEach(s => {
      const a = document.createElement('a');
      a.href = '#' + s.id;
      a.textContent = s.dataset.short || s.id;
      rail.appendChild(a);
    });
    const obs = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) {
        rail.querySelectorAll('a').forEach(a =>
          a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id));
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    secs.forEach(s => obs.observe(s));
  }

  labelKeys();
  $('#loading')?.remove();
  window.bruckner = { figs, built, build, reader, PLATES, PAGES };
}

boot();
