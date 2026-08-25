/*
 * The Colors panel.
 *
 * Every coloring the app offers is a FUNCTION of a group — which shell, which
 * face class, which coset, which orbit — and that is what makes a figure's
 * coloring reproducible and a saved document reopenable. But the palettes are
 * one person's taste, and a particular figure often wants its own: this shell
 * red because the paper model is red, that coset turned to glass so the cells
 * behind it show through.
 *
 * So this window lists the groups the view is actually drawing, one row each,
 * and lets any of them take a color and an opacity of its own. It holds no
 * colors itself — the overrides live in lib/palette.js, next to the defaults
 * they replace, so the 3-D view, the diagram, the SVG export and the mesh
 * exporters all see the same answer without being told.
 *
 * The rows come from the MESH, not from the group counts: what the panel
 * offers to color is exactly what is on screen. A coset the current selection
 * never reaches has no row, because giving it a color would change nothing
 * and only make the list longer.
 */

import { createInternalWindow } from '../../lib/uilib/modules.js';
import {
  faceColor, defaultColor, setColorOverride, colorOverrides, setColorOverrides,
  hasColorOverrides, colorKey, rgbaToHex, hexToRgba,
} from '../../lib/palette.js';

const $ = (q) => document.querySelector(q);

/*
 * Which per-face array of the mesh each mode reads, and what one of its groups
 * is called. The label matters more than it looks: "coset 3" and "shell 3" are
 * different things, and a window of unlabelled swatches is a guessing game.
 */
const MODES = {
  layer:      { of: (m) => m.faceLayers,       name: 'by shell',                   one: (i) => `shell ${i}` },
  class:      { of: (m) => m.faceClasses,      name: 'by face class',              one: (i) => `class ${i}` },
  stellClass: { of: (m) => m.faceClassesStell, name: 'by stellation face class',   one: (i) => `class ${i}` },
  coset:      { of: (m) => m.faceCosets,       name: 'by cosets — per plane',      one: (i) => `coset ${i}` },
  cosetL:     { of: (m) => m.faceCosetsL,      name: 'by cosets — per facet',      one: (i) => `coset ${i}` },
  cosetM:     { of: (m) => m.faceCosetsM,      name: 'by cosets — mirror-split',   one: (i) => `coset ${i}` },
  orbitP:     { of: (m) => m.faceOrbitP,       name: 'by orbits — per plane',      one: (i) => `orbit ${i}` },
  orbitF:     { of: (m) => m.faceOrbitF,       name: 'by orbits — per facet',      one: (i) => `orbit ${i}` },
  orbitC:     { of: (m) => m.faceOrbitC,       name: 'by orbits — per cell',       one: (i) => `orbit ${i}` },
};

/**
 * The rows for `mode`: every group number from 0 up to the largest the figure
 * uses, then gray where the mode has one.
 *
 * The range matters more than it first appears. Listing only the groups the
 * current SELECTION happens to draw would make row 0 mean shell 3 in one
 * figure and shell 7 in the next — and the saved palette is an array, read
 * back by position. Numbering the rows from zero makes position and group the
 * same thing, so colors copied between two figures land on the groups they
 * were taken from, whatever either figure has selected. It also lets you
 * color a shell before you have grown it.
 *
 * A blended facet carries an ARRAY of coset indices rather than one; its
 * members are groups in their own right and each gets a row, because editing
 * one is what changes the blend.
 */
export function groupsOf(mesh, mode) {
  const spec = MODES[mode];
  const arr = spec && mesh ? spec.of(mesh) : null;
  if (!arr) return [];
  let max = -1, gray = false;
  for (const v of arr) {
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      for (const k of v) if (k > max) max = k;
      continue;
    }
    if (v == null || v < 0) { gray = true; continue; }
    if (v > max) max = v;
  }
  const out = [];
  for (let i = 0; i <= max; i++) out.push(i);
  // the coset colorings always offer gray, drawn or not: it is the answer
  // "no coset fits", and wanting it invisible is a reason to open this panel
  if (gray || mode.startsWith('coset')) out.push(-1);
  return out;
}

/**
 * How each group is actually used by the figure on screen: for group i,
 * `crisp` is how many facets wear it alone, `mixed` how many wear it inside a
 * blend, and `mixes` the distinct blends it belongs to, each as its full
 * sorted member list. Both counts zero means the group exists in the
 * arithmetic and nowhere in the picture.
 *
 * Naming the blends is affordable because there are few of them per group.
 * Counted across the catalogue a group belongs to one to four distinct mixes,
 * and the mixes themselves run from pairs to ten-way — so "with 5, 10" is
 * usually the whole truth about a row, and where it is not, the count and the
 * tooltip carry the rest.
 *
 * The rows are a contiguous 0..max because POSITION IS GROUP NUMBER — that is
 * what lets a palette be pasted from one figure onto another, and what
 * applyColorsArray relies on — so the list cannot be trimmed to the groups in
 * use without breaking every saved palette. What it can do is say which is
 * which, and it needs to: a cube under C4 has twelve cosets, wears not one of
 * them crisply, mixes eight of them across its four non-axis faces, and never
 * mentions the other four. Twelve rows over a six-faced solid is a fair
 * question, and this is the answer to it.
 */
export function groupUsage(mesh, mode) {
  const spec = MODES[mode];
  const arr = spec && mesh ? spec.of(mesh) : null;
  const use = new Map();
  if (!arr) return use;
  const at = (k) => {
    let e = use.get(k);
    if (!e) { e = { crisp: 0, mixed: 0, mixes: new Map() }; use.set(k, e); }
    return e;
  };
  for (const v of arr) {
    if (Array.isArray(v) || ArrayBuffer.isView(v)) {
      const members = Array.from(v).filter(k => k >= 0).sort((a, b) => a - b);
      if (!members.length) continue;
      const key = members.join(',');
      for (const k of members) {
        const e = at(k);
        e.mixed++;
        if (!e.mixes.has(key)) e.mixes.set(key, members);
      }
    } else if (v >= 0) at(v).crisp++;
  }
  return use;
}

/** the label a group wears in the list */
const labelOf = (mode, i) =>
  (i < 0 ? 'gray — no coset fits' : (MODES[mode]?.one(i) ?? `group ${i}`));

/**
 * The colors of `mode` as an array of hex strings, in row order — what the
 * document saves and what the copy box shows.
 */
export function colorsArray(mesh, mode) {
  return groupsOf(mesh, mode).map(i => rgbaToHex(faceColor(mode, i, true)));
}

/**
 * Take an array of hex strings as the colors of `mode`, in row order. Anything
 * unreadable is skipped rather than failing the lot: a pasted array from a
 * figure with more groups should still color the ones it lines up with.
 * Returns how many were applied.
 */
export function applyColorsArray(mesh, mode, list) {
  const groups = groupsOf(mesh, mode);
  if (!groups.length || !list.length) return 0;
  /*
   * Position is group number, so a palette lines up by index however many
   * groups either figure has. Gray is the exception — it has no number — and
   * rides at the end, so it is read from the end rather than from a position
   * that would move with the group count.
   */
  const pairs = [];
  const hasGray = groups[groups.length - 1] < 0;
  const numbered = hasGray ? groups.length - 1 : groups.length;
  const bodyLen = hasGray && list.length > 1 ? list.length - 1 : list.length;
  for (let k = 0; k < numbered && k < bodyLen; k++) pairs.push([groups[k], list[k]]);
  if (hasGray && list.length > 1) pairs.push([-1, list[list.length - 1]]);

  let n = 0;
  for (const [group, hex] of pairs) {
    const rgba = hexToRgba(hex);
    if (!rgba) continue;
    // a color equal to the palette's own is not an override; storing it would
    // freeze today's palette into the document for no reason
    const d = defaultColor(mode, group);
    const same = Math.abs(d[0] - rgba[0]) < 0.002 && Math.abs(d[1] - rgba[1]) < 0.002
              && Math.abs(d[2] - rgba[2]) < 0.002 && Math.abs(d[3] - rgba[3]) < 0.002;
    setColorOverride(mode, group, same ? null : rgba);
    n++;
  }
  return n;
}

export function initColors({ state, renderer, diagram, onChange }) {
  const template = $('#colorsBody');
  if (!template) return null;

  const win = createInternalWindow({
    title: 'Colors',
    // a real height for the same reason the export dialog gives one: a
    // resizable window that measures itself while hidden and empty persists
    // the sliver it measured
    width: '340px', height: '440px',
    left: 'calc(50% - 170px)', top: '12%',
    canClose: true, canResize: true, modal: false, role: 'dialog',
    storageId: 'stell.colors',
  });
  win.wnd.classList.add('transient');
  win.interior.appendChild(template.content.cloneNode(true));
  win.setVisible(false);

  const dlg = win.interior;
  const el = (id) => dlg.querySelector(id);
  const list = el('#colList'), modeLabel = el('#colMode');
  const hexBox = el('#colHex'), info = el('#colInfo');

  const mode = () => $('#colorMode')?.value || 'layer';

  /* the view, the diagram and the "edited" mark, after any change */
  const repaint = () => {
    renderer?.refreshColors();
    diagram?.draw();
    const mark = $('#colorsEdited');
    if (mark) mark.hidden = !hasColorOverrides(mode());
    onChange?.();
  };

  function build() {
    const m = mode();
    const groups = groupsOf(state.mesh, m);
    const usage = groupUsage(state.mesh, m);
    /*
     * Say how many rows are doing nothing before the reader counts them and
     * wonders. Only worth saying when some are: on an ordinary figure every
     * group is worn and the label reads as it always did.
     */
    const numbered = groups.filter(i => i >= 0);
    const onlyMixed = numbered.filter(i => { const u = usage.get(i); return u && !u.crisp && u.mixed; });
    const unused = numbered.filter(i => !usage.get(i));
    const extra = [];
    if (onlyMixed.length) extra.push(`${onlyMixed.length} only in mixes`);
    if (unused.length) extra.push(`${unused.length} unused here`);
    modeLabel.textContent = MODES[m]
      ? `${MODES[m].name} · ${groups.length} group${groups.length === 1 ? '' : 's'}`
        + (extra.length ? ` · ${extra.join(', ')}` : '')
      : 'no colorable groups';
    list.textContent = '';

    if (!groups.length) {
      const p = document.createElement('p');
      p.className = 'note';
      p.textContent = state.mesh
        ? 'This coloring has no groups on screen yet.'
        : 'Nothing built yet.';
      list.appendChild(p);
      hexBox.value = '';
      return;
    }

    for (const i of groups) {
      const row = document.createElement('div');
      row.className = 'col-row';

      const c = faceColor(m, i, true);
      const sw = document.createElement('input');
      sw.type = 'color';
      sw.value = rgbaToHex(c).slice(0, 7);       // <input type=color> is rgb only
      sw.title = labelOf(m, i);
      sw.setAttribute('aria-label', labelOf(m, i));

      const name = document.createElement('span');
      name.className = 'col-name';
      name.textContent = labelOf(m, i);
      /*
       * What this row is doing. A group worn only inside blends still matters
       * — its color is an ingredient of the mix, so changing it changes the
       * picture — which is exactly why it stays in the list and exactly why it
       * has to say so, or it reads as a color that does nothing.
       */
      const u = i >= 0 ? usage.get(i) : null;
      if (i >= 0) {
        const note = document.createElement('i');
        note.className = 'col-use';
        /*
         * Who it is mixed WITH, which is the question a mixed row provokes.
         * The partners are the other members of the blend; the group itself is
         * dropped, since a row does not need telling that it is in its own mix.
         * One small mix is named outright, because that is the common case and
         * "with 5, 10" says everything; more than one, or a wide one, would
         * outgrow the row, so it keeps the count and the tooltip carries the
         * list.
         */
        const mixes = u ? [...u.mixes.values()] : [];
        const partnersOf = (m) => m.filter(k => k !== i);
        const short = (ks, cap) => ks.length <= cap
          ? ks.join(', ')
          : `${ks.slice(0, cap).join(', ')} and ${ks.length - cap} more`;
        if (!u) { note.textContent = 'unused here'; row.classList.add('col-idle'); }
        else if (!u.crisp) {
          const only = mixes.length === 1 ? partnersOf(mixes[0]) : null;
          note.textContent = only && only.length <= 3
            ? `with ${only.join(', ')}`
            : `in ${mixes.length} mix${mixes.length === 1 ? '' : 'es'}`;
        } else note.textContent = `${u.crisp} facet${u.crisp === 1 ? '' : 's'}`;
        const mixList = mixes.length
          ? mixes.slice(0, 8).map(m => `with ${short(partnersOf(m), 12)}`).join('; ')
            + (mixes.length > 8 ? `; and ${mixes.length - 8} more` : '')
          : '';
        note.title = !u
          ? 'No facet wears this group, on its own or in a mix: changing it changes nothing here'
          : (!u.crisp
            ? `No facet wears this alone. It is an ingredient of ${u.mixed} mixed `
              + `facet${u.mixed === 1 ? '' : 's'}, so changing its color changes `
              + `${u.mixed === 1 ? 'it' : 'them'} — ${mixList}`
            : `${u.crisp} facet${u.crisp === 1 ? '' : 's'} wear this group`
              + (u.mixed ? `, and ${u.mixed} more have it mixed in — ${mixList}` : ''));
        name.appendChild(note);
      }

      const alpha = document.createElement('input');
      alpha.type = 'range';
      alpha.min = '0'; alpha.max = '100'; alpha.step = '1';
      alpha.value = String(Math.round(c[3] * 100));
      alpha.className = 'col-alpha';
      alpha.title = 'Opacity of this group — 0 hides it entirely';

      const pct = document.createElement('b');
      pct.className = 'col-pct';
      pct.textContent = alpha.value;

      /*
       * Read both controls on every edit: the swatch carries rgb and the
       * slider carries alpha, and writing one must not drop the other.
       */
      const push = () => {
        const rgba = hexToRgba(sw.value);
        if (!rgba) return;
        rgba[3] = Number(alpha.value) / 100;
        pct.textContent = alpha.value;
        const d = defaultColor(m, i);
        const same = Math.abs(d[0] - rgba[0]) < 0.002 && Math.abs(d[1] - rgba[1]) < 0.002
                  && Math.abs(d[2] - rgba[2]) < 0.002 && Math.abs(d[3] - rgba[3]) < 0.002;
        setColorOverride(m, i, same ? null : rgba);
        hexBox.value = colorsArray(state.mesh, m).join(' ');
        repaint();
      };
      sw.oninput = push;
      alpha.oninput = push;

      row.append(sw, name, alpha, pct);
      list.appendChild(row);
    }
    hexBox.value = colorsArray(state.mesh, m).join(' ');
    info.textContent = '';
  }

  el('#colReset').onclick = () => {
    const m = mode();
    for (const i of groupsOf(state.mesh, m)) setColorOverride(m, i, null);
    build();
    repaint();
    info.textContent = 'back to the palette';
  };

  el('#colApply').onclick = () => {
    const m = mode();
    const parts = hexBox.value.split(/[\s,]+/).filter(Boolean);
    if (!parts.length) { info.textContent = 'nothing to apply'; return; }
    const n = applyColorsArray(state.mesh, m, parts);
    build();
    repaint();
    const rows = groupsOf(state.mesh, m).length;
    info.textContent = n
      ? `${n} of ${rows} row${rows === 1 ? '' : 's'} colored` +
        (parts.length > rows ? ` — ${parts.length - rows} spare ignored` : '')
      : 'none of those read as colors';
  };

  el('#colClose').onclick = () => win.setVisible(false);

  return {
    open() { build(); win.setVisible(true); },
    /** the panel follows the mode menu and every rebuild of the figure */
    refresh() { if (win.isVisible()) build(); },
    isOpen: () => win.isVisible(),
  };
}
