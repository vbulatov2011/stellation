/*
 * The photographic plates, clickable.
 *
 * Every model on Brückner's ten collotype sheets carries a hotspot whose
 * coordinates were segmented out of the scan and checked against the printed
 * figure numbers. Clicking a stellation rebuilds it in a live figure under the
 * sheet, set to the verified cell selection; clicking anything else explains
 * what the model is, from the book's own text.
 */

import { makeBuilder, BFigure } from './bfigure.js';
import { labelKeys } from './modules.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const IA = 'vieleckeundvielf00bruoft';
/* The sheets are served locally: they are the page's working surface, and the
   Archive's image service is too slow and too rate-limited to hang the UI on.
   Everything that OPENS the scan still points at the Archive itself. */
const sheetImg = leaf => `img/plates/n${leaf}.jpg`;
const pageUrl = printed => `https://archive.org/details/${IA}/page/n${printed + 13}`;

const SUB = { Ih: 'I', Oh: 'O', Td: 'T', Th: 'T' };

const BLURB = {
  VIII: 'Forty-one models across two sheets: prisms and antiprisms of higher kind, ' +
        'vertex-and-face combinations, and — among them — the first stellation of the ' +
        'icosahedron (no. 2) and the excavated dodecahedron (no. 26).',
  IX:   'The compound plate: five octahedra, five and ten tetrahedra, the three cubes ' +
        'Escher copied out, two of the four Kepler–Poinsot solids, and two icosahedron ' +
        'stellations, one of which Brückner presents as new.',
  X:    'Thirty-three models, mostly the polar (isohedral) mates of the uniform star ' +
        'polyhedra on the other plates. No. 5 is the small stellated dodecahedron; ' +
        'no. 13 is Escher’s solid; no. 3 the sixth stellation of the icosahedron.',
  XI:   'Twenty-four models: more polars and uniform star polyhedra — and, top centre ' +
        'of the second sheet, the final stellation of the icosahedron, with the great ' +
        'icosahedron closing the plate at no. 24.',
  XII:  'The last plate: one-sided polyhedra, the solids Brückner derives from the ' +
        'complete figure of the rhombic triacontahedron, and the compound of five ' +
        'cubes as no. 24.',
};

const figs = new Set();          // active BFigures, for theme switches
let build = null;                // shared stellation builder

// ------------------------------------------------------------------ helpers

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

const esc = s => String(s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function romanId(plate) { return 'taf-' + plate.toLowerCase(); }

// ------------------------------------------------------------------ viewer

function openViewer(sheetEl, sheet, fig, hs) {
  const box = sheetEl.querySelector('.gviewer');
  box.hidden = false;
  sheetEl.querySelectorAll('.hs.on').forEach(h => h.classList.remove('on'));
  hs.classList.add('on');

  // keep an existing figure if the same polyhedron is asked for again
  const keep = fig.status === 'build' && box._bf && box._poly === fig.poly;
  if (!keep && box._bf) { box._bf.destroy(); box._bf = null; figs.delete(box._bf); }
  const bfEl = keep ? box.querySelector('.bfig') : null;
  box.querySelectorAll(':scope > *' + (bfEl ? ':not(.bfig)' : '')).forEach(n => {
    if (n !== bfEl) n.remove();
  });

  // ---- header
  const head = el('div', 'gviewer-head');
  head.appendChild(el('span', 'gref', `Taf. ${sheet.plate}, Fig. ${fig.fig}`));
  head.appendChild(el('h3', null, esc(fig.name || (fig.status === 'tbd'
    ? 'Not yet identified' : 'From the book'))));
  head.appendChild(el('div', 'spacer'));
  if (fig.status === 'build') {
    head.appendChild(el('code', null, esc(fig.cells)));
    const app = el('a', null, 'open in the app ↗');
    app.href = `stellation_app.html#${fig.poly}/${fig.sym}/${SUB[fig.sym] || fig.sym}/${fig.cells}`;
    head.appendChild(app);
  }
  const p0 = fig.page || fig.pages?.[0];
  if (p0) {
    const rd = el('a', null, `read p. ${p0} ↗`);
    rd.href = pageUrl(p0); rd.target = '_blank'; rd.rel = 'noopener';
    head.appendChild(rd);
  }
  const close = el('button', 'gclose', '×');
  close.title = 'Close';
  close.onclick = () => { box.hidden = true; hs.classList.remove('on'); };
  head.appendChild(close);
  box.insertBefore(head, box.firstChild);

  // ---- the live figure
  if (fig.status === 'build' && !keep) {
    const bf = el('div', 'bfig');
    bf.dataset.poly = fig.poly;
    bf.dataset.sym = fig.sym;
    bf.dataset.cells = fig.cells;
    bf.dataset.parts = 'cells solid';
    bf.innerHTML = '<div class="fig-info">building the plane arrangement…</div>';
    box.appendChild(bf);
    box._poly = fig.poly;
    setTimeout(() => {                            // let the note paint first
      const f = new BFigure(bf, build);
      f.start();
      box._bf = f;
      figs.add(f);
      applyThemeTo(f);
    }, 30);
  } else if (fig.status === 'build' && keep) {
    box._bf.setCells(fig.cells);
  }

  // ---- what the book says
  if (fig.german || fig.desc) {
    const cite = [fig.section ? `§${fig.section}` : '', p0 ? `p. ${p0}` : '']
      .filter(Boolean).join(', ');
    box.appendChild(el('div', 'gviewer-quote',
      (fig.german ? `<i>${esc(fig.german)}</i>` : '') +
      `<cite>${esc(fig.desc || '')}${cite ? ' — ' + cite : ''}</cite>`));
  }

  // ---- the info section
  const info = el('div', 'gviewer-info');
  if (fig.status === 'known' && fig.why) {
    info.appendChild(el('h4', null, 'Why it cannot be rebuilt here'));
    info.appendChild(el('p', null, esc(fig.why)));
  }
  if (fig.status === 'tbd') {
    info.appendChild(el('p', null,
      'No passage naming this figure has been found yet — neither the book’s text ' +
      'nor the modern literature pins it down. It stays grey until it can be read.'));
  }
  const extra = fig.info;
  if (extra) {
    if (extra.aka?.length) {
      info.appendChild(el('h4', null, 'Also known as'));
      info.appendChild(el('p', 'aka',
        extra.aka.map(a => `<span>${esc(a)}</span>`).join('')));
    }
    if (extra.catalog_ids) {
      info.appendChild(el('p', 'ids', esc(extra.catalog_ids)));
    }
    if (extra.history?.length) {
      info.appendChild(el('h4', null, 'History'));
      for (const para of extra.history) info.appendChild(el('p', null, esc(para)));
    }
    if (extra.bruckner_context) {
      info.appendChild(el('h4', null, 'In this book'));
      info.appendChild(el('p', null, esc(extra.bruckner_context)));
    }
    if (extra.refs?.length) {
      info.appendChild(el('p', 'refs', 'Sources: ' + extra.refs.map(r =>
        `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.label)}</a>`).join(' · ')));
    }
  }
  if (info.childNodes.length) box.appendChild(info);

  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ------------------------------------------------------------------ sheets

function renderSheet(sheet) {
  const wrap = el('div', 'gsheet');
  wrap.id = 'sheet-' + sheet.leaf;

  const frame = el('div', 'gsheet-frame');
  const im = el('img');
  im.loading = 'lazy';
  im.src = sheetImg(sheet.leaf);
  im.alt = `Tafel ${sheet.plate}, ${sheet.range}`;
  frame.appendChild(im);

  const nBuild = sheet.figs.filter(f => f.status === 'build').length;

  for (const fig of sheet.figs) {
    const hs = el('button', 'hs hs-' + (fig.status || 'tbd'));
    hs.type = 'button';
    hs.style.left = (fig.x0 * 100).toFixed(2) + '%';
    hs.style.top = (fig.y0 * 100).toFixed(2) + '%';
    hs.style.width = ((fig.x1 - fig.x0) * 100).toFixed(2) + '%';
    hs.style.height = ((fig.y1 - fig.y0) * 100).toFixed(2) + '%';
    if (fig.y0 < 0.16) hs.classList.add('tip-below');
    if (fig.x1 > 0.72) hs.classList.add('tip-right');

    const label = fig.name || (fig.status === 'tbd' ? 'not yet identified'
      : (fig.desc || '').slice(0, 90) + ((fig.desc || '').length > 90 ? '…' : ''));
    hs.setAttribute('aria-label', `Figure ${fig.fig}: ${label}`);
    hs.appendChild(el('span', 'hs-tip',
      `<b>Fig. ${fig.fig}</b> ${esc(label)}${fig.status === 'build' ? ' — click to rebuild' : ''}`));
    hs.onclick = () => openViewer(wrap, sheet, fig, hs);
    frame.appendChild(hs);
  }
  wrap.appendChild(frame);

  wrap.appendChild(el('div', 'gsheet-cap',
    `<b>Tafel ${sheet.plate}</b> <span>${sheet.range}</span>` +
    `<span>${nBuild ? `${nBuild} of ${sheet.figs.length} can be rebuilt — ` +
      'click a gold-outlined model' : `${sheet.figs.length} models`}</span>`));

  const viewer = el('div', 'gviewer');
  viewer.hidden = true;
  wrap.appendChild(viewer);
  return wrap;
}

// ------------------------------------------------------------------ theme

function applyThemeTo(f) {
  const dark = document.documentElement.dataset.theme === 'dark';
  if (f.renderer) {
    f.renderer.background = dark ? [0.055, 0.06, 0.078] : [0.965, 0.97, 0.977];
    f.renderer.draw();
  }
  f.cells?.draw();
  f.diagram?.draw();
}

function applyTheme(pref) {
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.themePref = pref;
  $('#themeBtn').textContent = pref === 'auto' ? '◐' : pref === 'dark' ? '●' : '○';
  figs.forEach(applyThemeTo);
}

// ------------------------------------------------------------------- boot

async function boot() {
  const [geometry, symmetry, catalog, plates] = await Promise.all([
    fetch('data/geometry.json').then(r => r.json()),
    fetch('data/symmetry.json').then(r => r.json()),
    fetch('data/catalog.json').then(r => r.json()),
    fetch('data/bruckner-plates.json').then(r => r.json()),
  ]);
  ({ build } = makeBuilder(geometry, symmetry, catalog));

  const root = $('#platesRoot');
  // ?only=IX — render a single plate, for development and deep links
  const only = new URLSearchParams(location.search).get('only');
  const shown = only ? plates.sheets.filter(s => s.plate === only.toUpperCase()) : plates.sheets;
  const byPlate = new Map();
  for (const s of shown) {
    if (!byPlate.has(s.plate)) byPlate.set(s.plate, []);
    byPlate.get(s.plate).push(s);
  }
  for (const [plate, sheets] of byPlate) {
    const sec = el('section');
    sec.id = romanId(plate);
    sec.dataset.short = 'Tafel ' + plate;
    sec.appendChild(el('h2', null, `Tafel ${plate}`));
    if (BLURB[plate]) sec.appendChild(el('p', null, BLURB[plate]));
    for (const s of sheets) sec.appendChild(renderSheet(s));
    root.appendChild(sec);
  }

  // one-time pulse on the buildable hotspots when a sheet first scrolls in
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      [...e.target.querySelectorAll('.hs-build')].forEach((h, i) => {
        setTimeout(() => {
          h.classList.add('pulse');
          h.addEventListener('animationend', () => h.classList.remove('pulse'), { once: true });
        }, 350 + i * 140);
      });
    }
  }, { threshold: 0.25 });
  $$('.gsheet-frame').forEach(f => io.observe(f));

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

  // deep link from bruckner.html: #f-<leaf>-<fig> opens that model's viewer
  const m = location.hash.match(/^#f-(\d+)-(\d+)$/);
  if (m) {
    const sheet = shown.find(s => s.leaf === +m[1]);
    const fig = sheet?.figs.find(f => f.fig === +m[2]);
    const sheetEl = document.getElementById('sheet-' + m[1]);
    const hs = sheetEl && [...sheetEl.querySelectorAll('.hs')]
      .find(h => h.getAttribute('aria-label')?.startsWith(`Figure ${m[2]}:`));
    if (sheet && fig && hs) {
      openViewer(sheetEl.closest('.gsheet') || sheetEl, sheet, fig, hs);
      setTimeout(() => hs.scrollIntoView({ block: 'center' }), 80);
    }
  }

  window.brucknerGrid = { plates, figs, build };
}

boot();
