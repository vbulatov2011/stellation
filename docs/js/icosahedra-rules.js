/*
 * One rule set, as a gallery.
 *
 * Every icosa-*.html page is the same page with a different `data-set` on its
 * <main>; this reads icosahedra-rules.json, finds that set, and lays out its
 * figures. The pages are generated with the rules already in the HTML, so a
 * reader with no JavaScript still sees what the list is and what defines it —
 * only the pictures need this file.
 *
 * The figures themselves are shared. A stellation admitted by five of the
 * seven lists is one document and one thumbnail, linked from all five, so the
 * lists can be compared without the site holding five copies of the same
 * solid.
 */

const $ = (q) => document.querySelector(q);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

const SHELLS = ['a', 'b', 'c', 'd', 'e₁', 'e₂', 'f₁', 'f₂', 'g₁', 'g₂', 'h'];

function card(fig, set) {
  const a = el('a', 'ic-card');
  a.href = `stellation_app.html#doc=${fig.file}`;
  a.title = `${fig.symbol} — ${fig.shells.join(' + ')}`;
  if (!fig.crennell) a.classList.add('outside');

  // the solid and its stellation diagram, side by side; the grid says how
  // much of the card each one gets
  const pics = el('div', 'ic-pics');
  const solid = el('img', 'pic-solid');
  solid.src = `${fig.file}.png`;
  solid.alt = '';
  solid.loading = 'lazy';
  pics.appendChild(solid);
  if (fig.diagram) {
    const dia = el('img', 'pic-diagram');
    dia.src = fig.diagram;
    dia.alt = '';
    dia.loading = 'lazy';
    pics.appendChild(dia);
  }
  a.appendChild(pics);

  const body = el('div', 'body');
  const head = el('div', 'ic-head');
  head.appendChild(el('span', 'ic-n', fig.code));
  const sym = el('b', 'ic-sym', fig.symbol);
  if (fig.chiral) sym.classList.add('chiral');
  head.appendChild(sym);
  body.appendChild(head);

  if (fig.name) body.appendChild(el('p', 'ic-name', fig.name));
  body.appendChild(el('p', 'ic-stat',
    `${fig.cells} cells · ${fig.f} faces` + (fig.chiral ? ' · one hand' : '')));
  if (fig.regions) {
    body.appendChild(el('p', 'ic-stat pic-diagram-only',
      `${fig.regions} regions · ${fig.onSurface} on the surface`));
  }

  const tags = el('div', 'ic-shells');
  for (const s of fig.shells) tags.appendChild(el('i', null, s));
  body.appendChild(tags);

  body.appendChild(el('span', 'ic-badge',
    fig.crennell ? `no. ${fig.crennell} of the 59` : 'not among the 59'));
  if (set.reconstructed?.includes(fig.code)) {
    body.appendChild(el('p', 'ic-stat', 'row lost in the printout — see the note'));
  }

  a.appendChild(body);
  return a;
}

function render(man, set, filter) {
  const host = $('#icGrid');
  const showing = host.className;      // survives a re-render after filtering
  host.innerHTML = '';
  host.className = showing || 'ic-grid pics-both';
  const all = set.codes.map(c => man.figures[c]).filter(Boolean);
  const items = all.filter(filter.test);

  $('#icCount').textContent = items.length === all.length
    ? `all ${all.length}`
    : `${items.length} of ${all.length} — ${filter.label}`;

  for (const f of items) host.appendChild(card(f, set));
  if (!items.length) host.appendChild(el('p', 'ic-stat', 'None in this list.'));
}

function filterRow(man, set, onPick) {
  const host = $('#icFilter');
  host.innerHTML = '';
  const figs = set.codes.map(c => man.figures[c]).filter(Boolean);
  const buttons = [];
  const add = (label, test, on) => {
    const b = el('button', on ? 'on' : null, label);
    b.onclick = () => {
      for (const o of buttons) o.classList.toggle('on', o === b);
      onPick({ label, test });
    };
    buttons.push(b);
    host.appendChild(b);
  };
  add(`all ${figs.length}`, () => true, true);
  if (figs.some(f => !f.crennell)) add('not among the 59', (f) => !f.crennell, false);
  if (figs.some(f => f.crennell)) add('among the 59', (f) => !!f.crennell, false);
  if (figs.some(f => f.chiral)) add('chiral', (f) => f.chiral, false);

  // how much of the card each picture gets
  host.appendChild(el('span', 'ic-sep', 'show'));
  const pics = [];
  for (const [label, cls] of [['both', 'pics-both'], ['solid', 'pics-solid'],
                              ['diagram', 'pics-diagram']]) {
    const b = el('button', label === 'both' ? 'on' : null, label);
    b.onclick = () => {
      for (const o of pics) o.classList.toggle('on', o === b);
      $('#icGrid').className = 'ic-grid ' + cls;
    };
    pics.push(b);
    host.appendChild(b);
  }

  host.appendChild(el('span', 'ic-sep', 'containing'));
  for (const s of SHELLS) {
    if (!figs.some(f => f.shells.includes(s))) continue;
    add(s, (f) => f.shells.includes(s), false);
  }
}

(async () => {
  const slug = document.querySelector('main')?.dataset.set;
  let man;
  try {
    const r = await fetch('icosahedra-rules.json');
    if (!r.ok) throw new Error(r.statusText);
    man = await r.json();
  } catch (err) {
    $('#icCount').textContent = 'could not load the lists: ' + err.message;
    return;
  }
  const set = man.sets.find(s => s.slug === slug);
  if (!set) { $('#icCount').textContent = `no list called "${slug}"`; return; }

  const outside = set.codes.filter(c => man.figures[c] && !man.figures[c].crennell).length;
  const tally = $('#icTally');
  if (tally) {
    tally.textContent =
      `${set.codes.length} stellations meet them` +
      (outside ? `, of which ${outside} ${outside === 1 ? 'is' : 'are'} not among the 59.` : '.') +
      (set.reconstructed?.length
        ? ` Two rows were lost from the printout and are reconstructed here: the` +
          ` tally printed with it says ${set.tally}, these rules cannot exclude G or H,` +
          ` and the stricter list that they sit inside contains both.`
        : '');
  }

  filterRow(man, set, (f) => render(man, set, f));
  render(man, set, { label: 'all', test: () => true });
})();
