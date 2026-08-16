/*
 * The examples gallery.
 *
 * It reads docs/examples.json and nothing else — no engine, no worker, no
 * WebGL. The pictures are the thumbnails saved beside each document, so a
 * gallery of two hundred costs two hundred images and no computation, and
 * every card links into the app by `#doc=`, which opens that document
 * whatever it is made of. A catalog solid and a plane set are the same kind
 * of link here, which is the point of linking to the document rather than
 * describing it in the URL.
 *
 * Sections come from the FIRST tag of each entry; the filter row offers
 * every tag. Both are read from the catalog, so adding a tag to the
 * `tags` block and using it is the whole of adding a section.
 */

const $ = (q) => document.querySelector(q);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/** provenance, in the one line a card has room for */
function sourceLine(src) {
  if (!src) return null;
  if (src.book === 'brueckner-1900') {
    const bits = ['Brückner 1900'];
    if (src.plate) bits.push(`Taf. ${src.plate}`);
    if (src.figure != null) bits.push(`fig. ${src.figure}`);
    if (src.page != null) bits.push(`p. ${src.page}`);
    return bits.join(' · ');
  }
  return [src.who, src.year, src.work].filter(Boolean).join(' · ') || null;
}

function card(item) {
  const a = el('a', 'ex-card');
  a.href = `stellation_app.html#doc=${item.file}`;
  const img = el('img');
  img.src = `${item.file}.png`;
  img.alt = '';
  img.loading = 'lazy';
  a.appendChild(img);

  const body = el('div', 'body');
  body.appendChild(el('b', null, item.name));
  if (item.note) body.appendChild(el('p', 'note', item.note));
  const src = sourceLine(item.source);
  if (src) body.appendChild(el('p', 'src', src));
  if (item.tags?.length) {
    const tags = el('div', 'ex-tags');
    for (const t of item.tags) tags.appendChild(el('i', null, t));
    body.appendChild(tags);
  }
  a.appendChild(body);
  return a;
}

function render(catalog, active) {
  const host = $('#exSections');
  host.innerHTML = '';
  const items = active ? catalog.items.filter(i => i.tags?.includes(active)) : catalog.items;

  $('#exCount').textContent =
    `${items.length} of ${catalog.items.length} example${catalog.items.length === 1 ? '' : 's'}` +
    (active ? ` tagged ${active}` : '');

  // grouped by first tag, in the order the tags block declares them
  const order = Object.keys(catalog.tags || {});
  const groups = new Map();
  for (const it of items) {
    const key = it.tags?.[0] || 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }
  const keys = [...groups.keys()].sort((a, b) => {
    const ia = order.indexOf(a), ib = order.indexOf(b);
    return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
  });

  for (const key of keys) {
    const meta = catalog.tags?.[key] || {};
    const sec = el('section', 'ex-section');
    sec.appendChild(el('h2', null, meta.title || key));
    if (meta.blurb) sec.appendChild(el('p', 'blurb', meta.blurb));
    const grid = el('div', 'ex-grid');
    for (const it of groups.get(key)) grid.appendChild(card(it));
    sec.appendChild(grid);
    host.appendChild(sec);
  }

  if (!items.length) {
    host.appendChild(el('p', 'note', 'Nothing with that tag yet.'));
  }
}

function filterRow(catalog, onPick) {
  const host = $('#exFilter');
  host.innerHTML = '';
  // only tags something actually carries — a filter that finds nothing is noise
  const used = new Set(catalog.items.flatMap(i => i.tags || []));
  const all = el('button', 'on', 'everything');
  host.appendChild(all);
  const buttons = [all];
  for (const t of Object.keys(catalog.tags || {})) {
    if (!used.has(t)) continue;
    const b = el('button', null, catalog.tags[t].title || t);
    b.dataset.tag = t;
    host.appendChild(b);
    buttons.push(b);
  }
  for (const b of buttons) {
    b.onclick = () => {
      for (const other of buttons) other.classList.toggle('on', other === b);
      onPick(b.dataset.tag || null);
    };
  }
}

(async () => {
  let catalog;
  try {
    const r = await fetch('examples.json');
    if (!r.ok) throw new Error(r.statusText);
    catalog = await r.json();
  } catch (err) {
    $('#exCount').textContent = 'could not load the catalog: ' + err.message;
    return;
  }
  catalog.items = (catalog.items || []).filter(i => i && i.file && i.name);
  filterRow(catalog, (tag) => render(catalog, tag));
  render(catalog, null);
})();
