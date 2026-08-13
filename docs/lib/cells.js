/*
 * The Cells panel — a close port of the Java "Cells" window
 * (pvs.polyhedra.stellation.ui.Selection).
 *
 * One row per layer, numbered on the left. Along each row sit the symmetric
 * cells of that layer. A cell that splits into several sub-cells (a chiral pair,
 * say) is drawn as a shaded header box carrying the cell number, followed by one
 * small box per sub-cell.
 *
 * The coloured bars are the original's cleverest touch: every bar colour stands
 * for one particular number of congruent pieces, so cells that are the "same
 * kind of thing" read alike at a glance across the whole table.
 *
 * Mouse:
 *   click              toggle this cell (a header toggles all its sub-cells)
 *   modifier + click   toggle it together with its whole supporting set —
 *                      the group operation, which lives in this table only
 *   click layer number act on the whole layer
 */

/* Geometry. The colour bar sits in its own lane at the foot of each box, with the
   digit centred in the space above it — in the original they shared the same few
   pixels and collided. */
const BOX_W    = 27;   // a cell box
const BOX_H    = 28;
const BAR_H    = 3;    // the colour bar
const BAR_INSET = 4;   // its margin from the box's left and right edges
const BAR_LIFT = 4;    // how far its top sits above the box's bottom edge
const GAP_X    = 3;    // between boxes
const GAP_Y    = 5;    // between rows
const LAYER_W  = 30;   // the layer-number column
const PAD      = 8;    // around the whole table
const GROUP_PAD = 4;   // inside a sub-cell group's container
const SUB_W    = 19;   // a sub-cell box: visibly smaller than its parent
const SUB_H    = 20;
/* The arrow and its part-count were too faint to find at the old weight, and
   there was horizontal space going spare. Widened, and drawn heavier. */
const TWISTY_W = 19;   // the expand/collapse arrow beside a group
const FONT = (px, weight = 600) =>
  `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

export class CellsPanel {
  constructor(canvas, { onChange, onHover, onBeforeChange } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onChange = onChange;
    this.onHover = onHover;
    this.onBeforeChange = onBeforeChange;
    this.hoverAction = null;   // 'add' | 'remove' | null — see draw()

    this.outline = null;      // [layer][cell] = {index, subCells:[...], ...}
    this.selected = new Set();
    this.hit = [];            // hit rectangles in CSS pixels
    this.hover = null;
    this.scroll = 0;     // vertical
    this.scrollX = 0;    // horizontal — deep layers run wide
    /*
     * Sub-cell groups start collapsed.
     *
     * Under a low symmetry a single orbit can split into a hundred and twenty
     * sub-cells; expanded by default that is a row far wider than any sensible
     * panel, and it buries the layer structure the table exists to show. The
     * arrow beside a group opens it when you actually want the parts.
     */
    this.expanded = new Set();   // "layer.cell" for each opened group

    canvas.addEventListener('pointermove', (e) => {
      if (this._onDragMove && this._onDragMove(e)) return;
      this._lastMove = e;
      const h = this.hitTest(e);
      const m = modifiersOf(e);
      // one modifier here, and it means the group toggle — not add, not remove,
      // so it gets the accent rather than the 3-D view's green and red
      const act = (m.shift || m.ctrl) ? 'group' : null;
      const same = (a, b) => a === b || (a && b && a.key === b.key && a.kind === b.kind);
      if (!same(h, this.hover) || act !== this.hoverAction) {
        this.hover = h;
        this.hoverAction = act;
        canvas.style.cursor = h ? 'pointer' : 'default';
        // a real hover tooltip, as the Java window has: hold still and the
        // details appear, so the boxes themselves can stay bare numbers
        canvas.title = h ? this.describe(h) : '';
        this.draw();
        this.onHover?.(h);
      }
    });
    canvas.addEventListener('pointerleave', () => {
      this._lastMove = null;
      if (this.hover) { this.hover = null; this.hoverAction = null; this.draw(); this.onHover?.(null); }
    });
    // Deep tables are wider and taller than the panel, so the canvas pans. A drag
    // must not toggle whatever it started on, so a click counts only if the
    // pointer barely moved.
    let down = null, moved = 0;
    const capture = (e, on) => {
      try { on ? canvas.setPointerCapture?.(e.pointerId) : canvas.releasePointerCapture?.(e.pointerId); }
      catch { /* nothing to capture */ }
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return;
      // grabbing a scrollbar thumb scrolls; anywhere else pans as before
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const inBar = (bar) => bar && px >= bar.tx && px <= bar.tx + bar.tw &&
                             py >= bar.y - 3 && py <= bar.y + bar.h + 3;
      const inVBar = (bar) => bar && py >= bar.ty && py <= bar.ty + bar.th &&
                              px >= bar.x - 3 && px <= bar.x + bar.w + 3;
      const mode = inBar(this._hbar) ? 'h' : inVBar(this._vbar) ? 'v' : null;
      down = { x: e.clientX, y: e.clientY, sx: this.scrollX, sy: this.scroll, mode };
      moved = 0;
      capture(e, true);
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const wasDrag = moved > 3;
      const onBar = !!down.mode;
      down = null;
      capture(e, false);
      if (wasDrag || onBar) return;      // a scrollbar press never toggles a cell
      const h = this.hitTest(e);
      if (h) this.apply(h, modifiersOf(e));
    });
    canvas.addEventListener('pointercancel', () => { down = null; });
    this._dragState = () => down;
    this._onDragMove = (e) => {
      if (!down) return false;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      moved = Math.max(moved, Math.hypot(dx, dy));
      if (moved <= 3) return true;
      if (down.mode === 'h') {
        // dragging the thumb: content moves by the track-to-content ratio
        const k = this.contentWidth / this.canvas.clientWidth;
        this.scrollX = down.sx + dx * k;
      } else if (down.mode === 'v') {
        const k = this.contentHeight / this.canvas.clientHeight;
        this.scroll = down.sy + dy * k;
      } else {
        this.scrollX = down.sx - dx;
        this.scroll = down.sy - dy;
      }
      this._clampScroll();
      canvas.style.cursor = down.mode ? 'default' : 'grabbing';
      this.draw();
      return true;
    };
    // macOS turns ctrl-click into the secondary click, so the page is handed a
    // contextmenu event and never a ctrl-click. The event still carries ctrlKey,
    // which is how it is told apart from a real right-click — the ctrl case does
    // the group toggle, a genuine right-click does nothing, as documented.
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (!e.ctrlKey) return;
      const h = this.hitTest(e);
      if (h) this.apply(h, { shift: false, ctrl: true });
    });
    canvas.addEventListener('wheel', (e) => {
      const overY = this.contentHeight - canvas.clientHeight;
      const overX = this.contentWidth - canvas.clientWidth;
      if (overY <= 0 && overX <= 0) return;
      e.preventDefault();
      if (e.shiftKey) this.scrollX += e.deltaY;
      else { this.scroll += e.deltaY; this.scrollX += e.deltaX; }
      this._clampScroll();
      this.draw();
    }, { passive: false });

    // holding or releasing a modifier changes what a click would do, and the
    // pointer has not moved to tell us — replay the last position with the new
    // keys, so the green never outlives the shift that produced it
    const replay = (e) => {
      if (!this._lastMove) return;
      const act = (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) ? 'group' : null;
      if (act === this.hoverAction) return;
      this.hoverAction = act;
      this.draw();
    };
    addEventListener('keydown', replay);
    addEventListener('keyup', replay);
    addEventListener('blur', () => {
      if (this.hoverAction) { this.hoverAction = null; this.draw(); }
    });

    new ResizeObserver(() => this.draw()).observe(canvas);
  }

  /**
   * outline: [{layer, cells:[{index, primitives, facets, vertices, volume,
   *                           subCells:[{index, primitives, volume, atoms?:[m],
   *                                      bottom:[key], top:[key]}]}]}]
   *
   * Two selection dialects, told apart by `atoms`. The app sends it: the
   * selection is then ATOM keys ("layer.orbit.member") and a box can be
   * partially selected — the editing-symmetry model. The figure pages do
   * not, and everything behaves as it always has: the selection is sub-cell
   * keys, boxes are simply on or off.
   */
  setOutline(outline) {
    this.outline = outline;
    // both axes, or coming back from a wide table leaves a narrow one scrolled
    // out of sight — «should scroll to left automatically, otherwise cuts off»
    this.scroll = 0;
    this.scrollX = 0;
    this.palette = buildPalette(outline);
    this.byKey = new Map();
    this.atomic = false;
    this.atomKeysOf = new Map();
    for (const layer of outline)
      for (const cell of layer.cells)
        for (const sub of cell.subCells) {
          const key = `${layer.layer}.${cell.index}.${sub.index}`;
          this.byKey.set(key, { layer, cell, sub });
          if (Array.isArray(sub.atoms)) {
            this.atomic = true;
            this.atomKeysOf.set(key, sub.atoms.map(m => `${layer.layer}.${cell.index}.${m}`));
          }
        }
    this.draw();
    this.fit();
  }

  /** a sub-cell box's selection state: 2 full · 1 partial · 0 empty */
  _subState(subKey) {
    const sel = this.selected;
    if (!this.atomic) return sel.has(subKey) ? 2 : 0;
    const atoms = this.atomKeysOf.get(subKey) || [];
    let on = 0;
    for (const k of atoms) if (sel.has(k)) on++;
    return on === 0 ? 0 : on === atoms.length ? 2 : 1;
  }

  /** what a hit's sub-cell keys mean in the selection's own dialect */
  _expand(keys) {
    if (!this.atomic) return keys;
    const out = [];
    for (const k of keys) out.push(...(this.atomKeysOf.get(k) || []));
    return out;
  }

  _clampScroll() {
    const c = this.canvas;
    this.scroll  = Math.min(Math.max(0, (this.contentHeight || 0) - c.clientHeight), Math.max(0, this.scroll));
    this.scrollX = Math.min(Math.max(0, (this.contentWidth  || 0) - c.clientWidth),  Math.max(0, this.scrollX));
  }

  /** shrink the frame to the table, up to a sensible ceiling, then scroll */
  fit() {
    const wrap = this.canvas.parentElement;
    if (!wrap || !this.contentHeight) return;
    wrap.style.height = Math.min(this.contentHeight + 6, 460) + 'px';
    this.draw();
  }

  setSelected(selected) { this.selected = selected; this.draw(); }

  /** optional display names for cells — { "layer.cell": "e₁", … } or null */
  setLabels(labels) { this.labels = labels; this.draw(); }

  /** what each bar colour means: one entry per distinct piece-count */
  legend() { return this.palette?.entries ?? []; }

  // ---------------------------------------------------------------- selection

  /** every sub-cell key holding `key` up, transitively (the graph came from the worker) */
  supportKeys(key) {
    return this._closure(key, 'bottom');
  }

  /** everything resting on `key`, transitively */
  dependentKeys(key) {
    return this._closure(key, 'top');
  }

  _closure(key, dir) {
    const out = new Set([key]);
    const stack = [key];
    while (stack.length) {
      const k = stack.pop();
      for (const n of (this.byKey.get(k)?.sub[dir] || [])) {
        if (!out.has(n)) { out.add(n); stack.push(n); }
      }
    }
    return out;
  }

  apply(hit, mod) {
    // the arrow beside a group opens and closes it; it selects nothing
    if (hit.kind === 'twisty') {
      const id = `${hit.layer.layer}.${hit.cell.index}`;
      this.expanded.has(id) ? this.expanded.delete(id) : this.expanded.add(id);
      this._clampScroll();
      this.draw();
      return;
    }

    this.onBeforeChange?.();                     // bank the selection for undo

    const sel = this.selected;
    const keys = hit.keys;                       // the sub-cells this hit covers

    if (mod.shift || mod.ctrl) {
      /*
       * The group operation, and this table is the only place it lives: the
       * solid and the diagram act on a single cell. One modifier, and it is a
       * TOGGLE of the whole supporting set — a lit cell goes out together with
       * everything holding it up, an unlit one comes on the same way, and
       * pressing again reverses it. shift and ctrl both mean it, so there is
       * nothing to mis-remember. The support graph lives at the sub-cell
       * level; the expansion to what the selection actually stores comes last.
       */
      const on = this._expand(keys).every(k => sel.has(k));
      const all = new Set();
      for (const k of keys) for (const s of this.supportKeys(k)) all.add(s);
      for (const k of this._expand([...all])) on ? sel.delete(k) : sel.add(k);
    } else {
      // a partially selected box fills first, then a second click clears it
      const expanded = this._expand(keys);
      const anyOff = expanded.some(k => !sel.has(k));
      for (const k of expanded) anyOff ? sel.add(k) : sel.delete(k);
    }
    this.onChange?.(sel);
  }

  // ---------------------------------------------------------------- layout

  /** walk the table, calling back with the rect for every drawable box */
  _walk(cb) {
    if (!this.outline) return;
    const rowH = BOX_H + GAP_Y;
    let widest = 0;
    let y = PAD - this.scroll;
    const x0 = PAD - this.scrollX;

    // Bottom-up: the core is the ground floor and each shell is built on top of
    // the one below, which is how the solid actually grows and how the support
    // relation reads. Row numbers are unchanged — only the order is reversed.
    for (const layer of [...this.outline].reverse()) {
      let x = x0;
      cb({ kind: 'layer', layer, x, y, w: LAYER_W, h: BOX_H });
      x += LAYER_W + GAP_X * 2;

      for (const cell of layer.cells) {
        const n = cell.subCells.length;
        if (n > 1) {
          const open = this.expanded.has(`${layer.layer}.${cell.index}`);
          const inner = open
            ? BOX_W + TWISTY_W + n * (SUB_W + GAP_X)
            : BOX_W + TWISTY_W;
          cb({ kind: 'group', layer, cell, x: x - GROUP_PAD, y: y - GROUP_PAD,
               w: inner + 2 * GROUP_PAD, h: BOX_H + 2 * GROUP_PAD });
          cb({ kind: 'header', layer, cell, x, y, w: BOX_W, h: BOX_H });
          cb({ kind: 'twisty', layer, cell, open, n,
               x: x + BOX_W, y, w: TWISTY_W, h: BOX_H });
          if (open) {
            let sx = x + BOX_W + TWISTY_W;
            for (const sub of cell.subCells) {
              cb({ kind: 'sub', layer, cell, sub,
                   x: sx, y: y + (BOX_H - SUB_H) / 2, w: SUB_W, h: SUB_H });
              sx += SUB_W + GAP_X;
            }
          }
          x += inner + GAP_X + 2 * GROUP_PAD;
        } else {
          cb({ kind: 'cell', layer, cell, sub: cell.subCells[0], x, y, w: BOX_W, h: BOX_H });
          x += BOX_W + GAP_X;
        }
      }
      y += rowH;
      widest = Math.max(widest, x + this.scrollX);
    }
    this.contentHeight = y + this.scroll - GAP_Y + PAD;
    this.contentWidth = widest;
  }

  hitTest(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    let found = null;
    this._walk((b) => {
      if (b.kind === 'group') return;
      if (px < b.x || px > b.x + b.w || py < b.y || py > b.y + b.h) return;
      found = this._toHit(b);
    });
    return found;
  }

  _toHit(b) {
    const L = b.layer.layer;
    if (b.kind === 'twisty') {
      // the open state is part of the key so the tooltip refreshes on toggle
      return { kind: 'twisty', key: `T${L}.${b.cell.index}.${b.open ? 1 : 0}`, keys: [],
               layer: b.layer, cell: b.cell, open: b.open, n: b.n };
    }
    if (b.kind === 'layer') {
      const keys = [];
      for (const c of b.layer.cells) for (const s of c.subCells) keys.push(`${L}.${c.index}.${s.index}`);
      return { kind: 'layer', key: `L${L}`, keys, layer: b.layer };
    }
    if (b.kind === 'header') {
      const keys = b.cell.subCells.map(s => `${L}.${b.cell.index}.${s.index}`);
      return { kind: 'header', key: `${L}.${b.cell.index}`, keys, layer: b.layer, cell: b.cell };
    }
    const key = `${L}.${b.cell.index}.${b.sub.index}`;
    return { kind: b.kind, key, keys: [key], layer: b.layer, cell: b.cell, sub: b.sub };
  }

  // ---------------------------------------------------------------- painting

  draw() {
    const ctx = this.ctx;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const S = themeColors();
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = S.bg;
    ctx.fillRect(0, 0, w / dpr, h / dpr);
    if (!this.outline) return;

    const hoverKey = this.hover?.key;

    this._walk((b) => {
      const L = b.layer.layer;

      // ---- the layer number: a plain figure with an accent rule when the row is in play
      if (b.kind === 'layer') {
        // an empty layer (the depth limit cut it off) must not read as "all on":
        // `every` over nothing is true, which would light the whole row up
        const any = b.layer.cells.length > 0;
        const on = any && b.layer.cells.every(c => c.subCells.every(
          s => this._subState(`${L}.${c.index}.${s.index}`) === 2));
        const some = any && b.layer.cells.some(c => c.subCells.some(
          s => this._subState(`${L}.${c.index}.${s.index}`) > 0));

        if (hoverKey === `L${L}`) {
          roundRect(ctx, b.x, b.y, b.w, b.h, 7);
          ctx.fillStyle = this.hoverAction === 'group' ? S.accentFaint : S.rowHover;
          ctx.fill();
        }
        ctx.fillStyle = on ? S.accent : some ? S.accentSoft : S.line;
        roundRect(ctx, b.x, b.y + 4, 2.5, b.h - 8, 1.5);
        ctx.fill();

        ctx.fillStyle = !any ? S.faint : on ? S.accent : S.text;
        ctx.font = FONT(14, on ? 700 : 550);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(String(L), b.x + b.w - 6, b.y + b.h / 2);
        if (!any) {
          ctx.fillStyle = S.faint;
          ctx.font = FONT(10.5, 400);
          ctx.textAlign = 'left';
          ctx.fillText('beyond the build depth', b.x + b.w + GAP_X * 2, b.y + b.h / 2);
        }
        return;
      }

      // ---- the container behind a header and its sub-cells
      if (b.kind === 'group') {
        roundRect(ctx, b.x, b.y, b.w, b.h, 9);
        ctx.fillStyle = S.groupFill; ctx.fill();
        ctx.strokeStyle = S.groupLine; ctx.lineWidth = 1; ctx.stroke();
        return;
      }

      /*
       * ---- the expand/collapse arrow for a group of sub-cells
       *
       * The two states are opposite directions along one axis, not two
       * different axes: ▸ opens the group to the right, ◂ closes it back up
       * again. A downward arrow for "close" made the pair read as unrelated:
       * if one direction opens, the reverse of it should close.
       */
      if (b.kind === 'twisty') {
        const hov = hoverKey === `T${L}.${b.cell.index}.${b.open ? 1 : 0}`;
        ctx.strokeStyle = hov ? S.accent : S.arrow;
        ctx.lineWidth = 2.3;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const cx = b.x + b.w / 2, r = 4.2;
        const cy = b.y + b.h / 2 - (b.open ? 0 : 4);   // room for the count below
        const d = b.open ? -1 : 1;                     // ◂ closes, ▸ opens
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.6 * d, cy - r);
        ctx.lineTo(cx + r * 0.7 * d, cy);
        ctx.lineTo(cx - r * 0.6 * d, cy + r);
        ctx.stroke();
        if (!b.open) {                    // how many parts are hidden in there
          ctx.fillStyle = hov ? S.accent : S.arrow;
          ctx.font = FONT(11, 700);
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(b.n), cx, cy + r + 7);
        }
        return;
      }

      const isHeader = b.kind === 'header';
      const key = isHeader ? null : `${L}.${b.cell.index}.${b.sub.index}`;
      const hovered = hoverKey === (isHeader ? `${L}.${b.cell.index}` : key);
      /*
       * Tri-state everywhere: a header reads as "on" when all of its
       * sub-cells are, and under the atomic model a single box can itself be
       * partially selected — cells picked under a finer editing symmetry
       * than the current grouping. The faint fill says "some of this".
       */
      const st = isHeader
        ? (b.cell.subCells.every(s => this._subState(`${L}.${b.cell.index}.${s.index}`) === 2) ? 2
           : b.cell.subCells.some(s => this._subState(`${L}.${b.cell.index}.${s.index}`) > 0) ? 1 : 0)
        : this._subState(key);
      const on = st === 2;
      const part = st === 1;

      // box. Everything here is a toggle, so the hover stays in the accent —
      // green and red belong to the 3-D view, where they mean add and remove.
      // A modifier (the group toggle) draws the heavier double-weight outline.
      const group = hovered && this.hoverAction === 'group';
      roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 7);
      ctx.fillStyle = on ? S.accent : part ? S.accentFaint : S.boxFill;
      ctx.fill();
      if (group) { ctx.fillStyle = S.accentFaint; ctx.fill(); }
      ctx.strokeStyle = hovered || on ? S.accent : S.boxLine;
      ctx.lineWidth = group ? 2.4 : hovered ? 1.8 : 1;
      ctx.stroke();

      // the colour bar, in its own lane at the foot of the box — never under the digit
      const count = isHeader ? b.cell.primitives : b.sub.primitives;
      roundRect(ctx, b.x + BAR_INSET, b.y + b.h - BAR_LIFT - BAR_H,
                b.w - 2 * BAR_INSET, BAR_H, BAR_H / 2);
      ctx.fillStyle = this.palette(count);
      ctx.globalAlpha = on ? 1 : 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;

      /*
       * The digit, centred in the space above the bar.
       *
       * A single-sub-cell box shows its CELL index, not its sub-cell index —
       * the sub index is always 0 for such a box, so every plain box in a row
       * used to read "0" («everything is 0's, but it should be 0, 1, etc»).
       * Only the small boxes inside an opened group show sub indices, where
       * they mean something. Du Val letters take over where we know them.
       */
      const label = b.kind === 'sub'
        ? String(b.sub.index)
        : (this.labels?.[`${L}.${b.cell.index}`] || String(b.cell.index));
      ctx.fillStyle = on ? S.onText : S.text;
      ctx.font = FONT(isHeader || b.kind === 'cell' ? 14 : 12, isHeader || b.kind === 'cell' ? 640 : 480);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, b.x + b.w / 2, b.y + (b.h - BAR_LIFT - BAR_H) / 2 + 1);
    });

    /*
     * Scrollbars, drawn only when there is somewhere to go.
     *
     * The table already pans by drag and by wheel, but nothing on screen said
     * so, and it was not discoverable. The thumbs are draggable; their size is
     * the visible fraction, as a scrollbar's should be.
     */
    const cw = this.canvas.clientWidth, ch = this.canvas.clientHeight;
    this._hbar = this._vbar = null;
    ctx.fillStyle = S.faint;
    if ((this.contentWidth || 0) > cw + 1) {
      const track = cw - 10, y = ch - 7;
      const tw = Math.max(24, track * cw / this.contentWidth);
      const tx = 5 + (track - tw) * (this.scrollX / Math.max(1, this.contentWidth - cw));
      roundRect(ctx, tx, y, tw, 4, 2); ctx.fill();
      this._hbar = { tx, y, tw, h: 4 };
    }
    if ((this.contentHeight || 0) > ch + 1) {
      const track = ch - 10, x = cw - 7;
      const th = Math.max(24, track * ch / this.contentHeight);
      const ty = 5 + (track - th) * (this.scroll / Math.max(1, this.contentHeight - ch));
      roundRect(ctx, x, ty, 4, th, 2); ctx.fill();
      this._vbar = { x, ty, w: 4, th };
    }
  }

  /** the info line the original shows while hovering */
  describe(hit) {
    if (!hit) return '';
    if (hit.kind === 'layer') {
      const n = hit.layer.cells.reduce((a, c) => a + c.subCells.length, 0);
      const v = hit.layer.cells.reduce((a, c) => a + c.volume, 0);
      return `layer ${hit.layer.layer} · ${hit.layer.cells.length} cells, ${n} selectable · volume ${v.toFixed(5)}`;
    }
    const L = hit.layer.layer, c = hit.cell;
    if (hit.kind === 'twisty') {
      return hit.open
        ? `${L}(${c.index}) · click to collapse its ${hit.n} sub-cells`
        : `${L}(${c.index}) · ${hit.n} sub-cells hidden — click to expand`;
    }
    if (hit.kind === 'header') {
      return `${L}(${c.index}) · ${c.subCells.length} sub-cells · ${c.primitives} elem. cells ` +
             `[${c.facets}, ${c.vertices}, ${c.volume.toFixed(5)}]`;
    }
    const s = hit.sub;
    const name = c.subCells.length > 1 ? `${L}(${c.index}[${s.index}])` : `${L}(${c.index})`;
    // a partially selected box says how much of it is in — cells picked under
    // a finer editing symmetry than this box's grouping
    let partial = '';
    if (this.atomic) {
      const atoms = this.atomKeysOf.get(hit.key) || [];
      const on = atoms.filter(k => this.selected.has(k)).length;
      if (on > 0 && on < atoms.length) partial = ` · ${on} of ${atoms.length} pieces selected`;
    }
    return `${name} · ${s.primitives} elem. cells [${c.facets}, ${c.vertices}, ${s.volume.toFixed(5)}]${partial}`;
  }
}

/**
 * The modifier has to be reachable on every platform. ctrl is the obvious key
 * but on macOS ctrl-click is the secondary-click gesture and arrives only as a
 * contextmenu event (handled above, told apart from a real right-click by the
 * ctrlKey it carries); alt/option and cmd mean the same thing. A genuine
 * right-click does nothing, as documented.
 */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function modifiersOf(e) {
  const shift = e.shiftKey;
  return { shift, ctrl: !shift && (e.ctrlKey || e.metaKey || e.altKey), alt: e.altKey };
}

/**
 * One hue per distinct "number of congruent pieces", spread around the wheel in
 * increasing order — Selection.makeColors, which used HSB(hue, 0.8, 0.9).
 */
function buildPalette(outline) {
  const counts = new Set();
  for (const layer of outline)
    for (const cell of layer.cells) {
      counts.add(cell.primitives);
      for (const s of cell.subCells) counts.add(s.primitives);
    }
  const sorted = [...counts].sort((a, b) => a - b);
  const map = new Map();
  // spread the hues but keep them all at a readable weight, and skip the muddy
  // yellow-green band that the original's raw HSB sweep lands in
  sorted.forEach((c, i) => {
    const t = sorted.length > 1 ? i / (sorted.length - 1) : 0;
    map.set(c, hsb((0.02 + 0.86 * t) % 1, 0.72, 0.86));
  });
  const fn = (n) => map.get(n) || '#8b93a7';
  fn.entries = sorted.map(c => ({ count: c, color: map.get(c) }));
  return fn;
}

function hsb(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, fallback) => (cs.getPropertyValue(n).trim() || fallback);
  const dark = document.documentElement.dataset.theme !== 'light';
  const accent = v('--accent', dark ? '#f5b942' : '#c8860a');
  return {
    bg: v('--panel', dark ? '#12151c' : '#fff'),
    text: v('--text', dark ? '#e6e9f0' : '#14181f'),
    faint: dark ? 'rgba(230,233,240,0.34)' : 'rgba(20,24,31,0.34)',
    line: v('--line', dark ? '#242a36' : '#d9dee7'),
    accent,
    accentSoft: dark ? 'rgba(245,185,66,0.45)' : 'rgba(200,134,10,0.45)',
    accentFaint: dark ? 'rgba(245,185,66,0.17)' : 'rgba(200,134,10,0.15)',
    onText: dark ? '#14100a' : '#fffaf0',
    boxFill: dark ? 'rgba(255,255,255,0.035)' : 'rgba(20,30,60,0.028)',
    boxLine: dark ? 'rgba(200,212,235,0.20)' : 'rgba(40,55,85,0.20)',
    groupFill: dark ? 'rgba(111,168,255,0.09)' : 'rgba(37,99,201,0.06)',
    groupLine: dark ? 'rgba(111,168,255,0.28)' : 'rgba(37,99,201,0.22)',
    // the arrow and its count carry the same weight as the box numbers now;
    // at the old group-line opacity they simply were not findable
    arrow: dark ? 'rgba(150,192,255,0.85)' : 'rgba(30,80,170,0.80)',
    rowHover: dark ? 'rgba(255,255,255,0.05)' : 'rgba(20,30,60,0.045)',
  };
}
