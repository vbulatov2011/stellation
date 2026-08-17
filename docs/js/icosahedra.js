/*
 * The fifty-nine icosahedra.
 *
 * Reads docs/icosahedra.json — the manifest written by
 * docs/tools/make-icosahedra.mjs — and nothing else: no engine, no worker, no
 * WebGL. Every card is a thumbnail saved beside its document and a link into
 * the app by `#doc=`, so the page costs 59 images and no computation.
 *
 * The filters are the interesting part. A stellation here IS its list of
 * shells, so filtering by shell is not a tag search but the actual question
 * you would ask of the table: which of the 59 contain g₂? Which take only one
 * hand of f₁? The buttons are built from the manifest, so they cannot fall out
 * of step with it.
 */

const $ = (q) => document.querySelector(q);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/* every shell, in Du Val's order, with the size of its orbit */
const SHELLS = [
  ['a', 1], ['b', 20], ['c', 30], ['d', 60],
  ['e₁', 20], ['e₂', 60], ['f₁', 120], ['f₂', 12],
  ['g₁', 30], ['g₂', 60], ['h', 60],
];

function card(item) {
  const a = el('a', 'ic-card');
  a.href = `stellation_app.html#doc=${item.file}`;
  a.title = `${item.symbol} — ${item.shells.join(' + ')}`;

  /*
   * Two pictures of the same figure, side by side: the solid, and the
   * stellation diagram it was chosen on. Both are shown by default, because
   * the diagram is half of what these pages are about and a gallery that
   * hides it behind a control looks like a gallery that has none. The
   * `show` buttons then give either one the whole card when you want it
   * bigger — the images are both in the DOM and swapped by a class on the
   * grid, so switching costs no fetch.
   */
  const pics = el('div', 'ic-pics');
  const solid = el('img', 'pic-solid');
  solid.src = `${item.file}.png`;
  solid.alt = '';
  solid.loading = 'lazy';
  pics.appendChild(solid);
  if (item.diagram) {
    const dia = el('img', 'pic-diagram');
    dia.src = item.diagram;
    dia.alt = '';
    dia.loading = 'lazy';
    pics.appendChild(dia);
  }
  a.appendChild(pics);

  const body = el('div', 'body');
  const head = el('div', 'ic-head');
  head.appendChild(el('span', 'ic-n', item.n));
  const sym = el('b', 'ic-sym', item.symbol);
  if (item.chiral) sym.classList.add('chiral');
  head.appendChild(sym);
  body.appendChild(head);

  if (item.name) body.appendChild(el('p', 'ic-name', item.name));
  body.appendChild(el('p', 'ic-stat',
    `${item.cells} cells · ${item.f} faces` + (item.chiral ? ' · one hand' : '')));
  if (item.regions) {
    body.appendChild(el('p', 'ic-stat pic-diagram-only',
      `${item.regions} regions · ${item.onSurface} on the surface`));
  }

  const shells = el('div', 'ic-shells');
  for (const s of item.shells) shells.appendChild(el('i', null, s));
  body.appendChild(shells);

  a.appendChild(body);
  return a;
}

const FILTERS = [
  { key: null, label: 'all 59', test: () => true },
  { key: 'reflexible', label: 'reflexible', test: (i) => !i.chiral },
  { key: 'chiral', label: 'chiral', test: (i) => i.chiral },
];

function render(man, filter) {
  const host = $('#icGrid');
  const showing = host.className;      // survives a re-render after filtering
  host.innerHTML = '';
  host.className = showing || 'ic-grid pics-both';
  const items = man.items.filter(filter.test);

  $('#icCount').textContent = items.length === man.items.length
    ? `all ${man.items.length}`
    : `${items.length} of ${man.items.length} — ${filter.label}`;

  for (const it of items) host.appendChild(card(it));
  if (!items.length) host.appendChild(el('p', 'ic-empty', 'None of the 59.'));
}

function filterRow(man, onPick) {
  const host = $('#icFilter');
  host.innerHTML = '';
  const buttons = [];
  const add = (label, test, on) => {
    const b = el('button', on ? 'on' : null, label);
    b.onclick = () => {
      for (const other of buttons) other.classList.toggle('on', other === b);
      onPick({ label, test });
    };
    buttons.push(b);
    host.appendChild(b);
    return b;
  };
  for (const f of FILTERS) add(f.label, f.test, f.key === null);

  // how much of the card each picture gets
  host.appendChild(el('span', 'ic-sep', 'show'));
  const pics = [];
  for (const [label, cls] of [['both', 'pics-both'],
                              ['solid', 'pics-solid'],
                              ['diagram', 'pics-diagram']]) {
    const b = el('button', label === 'both' ? 'on' : null, label);
    b.onclick = () => {
      for (const o of pics) o.classList.toggle('on', o === b);
      document.querySelector('#icGrid').className = 'ic-grid ' + cls;
    };
    pics.push(b);
    host.appendChild(b);
  }

  host.appendChild(el('span', 'ic-sep', 'containing'));
  for (const [name] of SHELLS) {
    // only shells something actually uses — every one of them does, but the
    // manifest is the authority, not this file
    if (!man.items.some(i => i.shells.includes(name))) continue;
    add(name, (i) => i.shells.includes(name), false);
  }
}

function shellKey(man) {
  const host = $('#icShells');
  if (!host) return;
  const counts = new Map(SHELLS.map(([n]) => [n, 0]));
  for (const it of man.items) for (const s of it.shells) counts.set(s, counts.get(s) + 1);
  host.innerHTML = '';
  for (const [name, size] of SHELLS) {
    const row = el('div', 'ic-shell-row');
    row.appendChild(el('b', null, name));
    row.appendChild(el('span', 'n', `${size} cell${size === 1 ? '' : 's'}`));
    row.appendChild(el('span', 'in', `in ${counts.get(name)} of the 59`));
    host.appendChild(row);
  }
}

(async () => {
  let man;
  try {
    const r = await fetch('icosahedra.json');
    if (!r.ok) throw new Error(r.statusText);
    man = await r.json();
  } catch (err) {
    $('#icCount').textContent = 'could not load the list: ' + err.message;
    return;
  }
  man.items = (man.items || []).filter(i => i && i.file);
  shellKey(man);
  filterRow(man, (f) => render(man, f));
  render(man, FILTERS[0]);
})();
