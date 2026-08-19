/*
 * The windowed workspace: an optional layout where the app's panels float as
 * internal windows instead of sitting in the docked three-pane grid.
 *
 * THE ONE IDEA THIS FILE IS BUILT ON: windows ADOPT the live DOM. Entering
 * windowed mode moves the existing panel subtrees — the two .view divs, the
 * cells group, the three settings groups — into window interiors with
 * appendChild, and leaving moves them back to comment markers recording their
 * docked slots. Nothing is cloned and nothing is created twice, because half
 * the app is wired against these exact nodes: wireControls() grabs dozens of
 * ids once at boot, labelKeys() rewrites text once, the undo buttons are
 * class-wired once, and the canvases hold live WebGL2/2D contexts that a
 * re-creation would destroy. Moving a node keeps all of it — ids, handlers,
 * contexts, and each component's own ResizeObserver, which notices the new
 * box and re-sizes the canvas without any plumbing here.
 *
 * Docked stays the default and the source of truth for the DOM: the app boots
 * docked (every boot-time id read finds its element), and windowed mode is
 * entered only after initWorkspace() runs — which the app calls after
 * wireControls(), so nothing lazy ever races the wiring.
 *
 * Narrow screens never see windows: floating panels on a phone are a worse
 * version of scrolling. The media listener forces docked while it matches and
 * returns to the user's stored choice when it stops matching; the stored mode
 * is only changed by the toggle, so a phone rotation cannot forget it.
 */

import { createInternalWindow } from '../../lib/uilib/modules.js';

const MODE_KEY = 'stell.ui.mode';          // 'docked' | 'windows'
const NARROW = '(max-width: 780px)';       // same breakpoint as the CSS collapse

const $ = (q) => document.querySelector(q);

export function initWorkspace({ redraw } = {}) {
  const narrow = matchMedia(NARROW);

  /*
   * The four regions. Each records the live subtree (or subtrees — settings
   * is three sibling <details>) and a comment marker placed where the docked
   * slot is, so restoration is exact regardless of what else moved.
   */
  const views = document.querySelectorAll('.views > .view');
  const regions = [
    {
      id: 'stell.win.view3d', title: 'Solid',
      nodes: [views[0]],
      geo: { left: '8px', top: '8px', width: '46%', height: '58%' },
    },
    {
      id: 'stell.win.diagram', title: 'Diagram',
      nodes: [views[1]],
      geo: { left: '48%', top: '8px', width: '46%', height: '58%' },
    },
    {
      id: 'stell.win.cells', title: 'Cells',
      nodes: [$('.cells-group')],
      geo: { left: '8px', top: 'calc(58% + 16px)', width: '400px', height: '38%' },
    },
    {
      id: 'stell.win.settings', title: 'Settings',
      nodes: [...document.querySelectorAll('.panel.right > details.group')],
      geo: { left: 'calc(100% - 356px)', top: 'calc(58% + 16px)', width: '348px', height: '38%' },
    },
  ].filter((r) => r.nodes.every(Boolean));

  for (const r of regions) {
    r.markers = r.nodes.map((node) => {
      const marker = document.createComment('dock: ' + r.title);
      node.parentNode.insertBefore(marker, node);
      return marker;
    });
    r.win = null;
  }

  let stored = localStorage.getItem(MODE_KEY) === 'windows' ? 'windows' : 'docked';
  let active = 'docked';

  /*
   * Windows that are not part of the layout: the preset browser and the local
   * file browser. They float over either mode, they come and go on their own
   * schedule (nothing exists until first opened), and their owners register
   * them here so that one menu covers every window in the app. A registration
   * is just three functions — this file never learns what they are.
   */
  const extras = [];

  // ---- adoption ---------------------------------------------------------

  /*
   * The settings window wears the document's name.
   *
   * It is the window the document is edited through, and a floating panel
   * with no name on it is the one thing a windowed layout takes away from a
   * docked one — the footer says which document you are in, and a window can
   * be dragged clear of it. Kept here rather than pushed in from outside, so
   * the name survives the window being created, destroyed and recreated as
   * the layout changes; app.js only ever says what the name is.
   */
  let docName = '';
  const titleOf = (r) => (r.id === 'stell.win.settings' && docName)
    ? `${docName} - ${r.title.toLowerCase()}` : r.title;

  function setDocName(text) {
    const next = text || '';
    if (next === docName) return;
    docName = next;
    for (const r of regions) if (r.win) r.win.setTitle(titleOf(r));
  }

  function ensureWindow(r) {
    if (r.win) return r.win;
    r.win = createInternalWindow({
      ...r.geo,
      title: titleOf(r),
      canClose: true,
      canResize: true,
      storageId: r.id,
      container: $('main'),
      role: 'region',
    });
    return r.win;
  }

  function enterWindows() {
    document.body.classList.add('windowed');
    for (const r of regions) {
      const win = ensureWindow(r);
      for (const node of r.nodes) win.interior.appendChild(node);
      /*
       * Visibility is per window and persists across sessions — a window the
       * user closed stays closed. Re-read the flag on every entry, because
       * setVisible(false) at exit time would overwrite it.
       */
      let vis = true;
      try { vis = localStorage.getItem(r.id + '_visible') !== 'false'; } catch { }
      win.setVisible(vis);
    }
    /*
     * One forced pass after adoption: the ResizeObservers fire on box
     * changes, but a window sized exactly like the docked slot would leave a
     * canvas stale for a frame, and the first entry deserves a clean one.
     * Synchronous, because layout already is — appendChild + setVisible have
     * settled by the time clientWidth is read — with an rAF follow-up for
     * anything the observers deliver late.
     */
    redraw?.();
    requestAnimationFrame(() => redraw?.());
  }

  function exitWindows() {
    for (const r of regions) {
      if (!r.win) continue;
      // hide directly rather than through setVisible — exiting the mode must
      // not overwrite each window's own persisted visibility choice
      r.win.wnd.style.visibility = 'hidden';
      r.nodes.forEach((node, i) => {
        const m = r.markers[i];
        m.parentNode.insertBefore(node, m.nextSibling);
      });
    }
    document.body.classList.remove('windowed');
    redraw?.();
    requestAnimationFrame(() => redraw?.());
  }

  function apply() {
    const want = narrow.matches ? 'docked' : stored;
    if (want === active) return;
    active = want;
    if (want === 'windows') enterWindows(); else exitWindows();
    syncButtons();
  }

  // ---- header controls --------------------------------------------------

  const modeBtn = $('#modeBtn');
  const winMenuBtn = $('#winMenu');

  function syncButtons() {
    modeBtn?.setAttribute('aria-pressed', String(active === 'windows'));
  }

  if (modeBtn) {
    modeBtn.onclick = () => {
      stored = stored === 'windows' ? 'docked' : 'windows';
      try { localStorage.setItem(MODE_KEY, stored); } catch { }
      apply();
    };
  }

  /*
   * The windows menu is the recovery path: closing a window would otherwise
   * leave no way back short of DevTools. A small popup under the button lists
   * every window there is, each with a checkmark, and clicking one toggles it.
   *
   * The panel windows are listed only in windowed mode, because docked they
   * are not windows at all; the registered ones are always listed, since they
   * float over either mode. When both blocks are present a rule separates
   * them — the layout above, the things you open below.
   */
  if (winMenuBtn) {
    winMenuBtn.onclick = () => {
      const old = document.querySelector('.iw-menu');
      if (old) { old.remove(); return; }
      const menu = document.createElement('div');
      menu.className = 'iw-menu';
      const b = winMenuBtn.getBoundingClientRect();
      menu.style.top = (b.bottom + 4) + 'px';
      menu.style.right = Math.max(8, innerWidth - b.right) + 'px';

      const add = (title, isOpen, setOpen) => {
        const item = document.createElement('button');
        item.className = isOpen() ? 'checked' : 'unchecked';
        item.textContent = title;
        item.onclick = () => { setOpen(!isOpen()); menu.remove(); };
        menu.appendChild(item);
      };

      const layout = active === 'windows' ? regions : [];
      for (const r of layout) {
        add(r.title, () => !!r.win?.isVisible(), (v) => r.win?.setVisible(v));
      }
      if (layout.length && extras.length) menu.appendChild(document.createElement('hr'));
      for (const x of extras) add(x.title, x.isOpen, x.setOpen);

      document.body.appendChild(menu);
      // any press outside the menu dismisses it; deferred so this click survives
      setTimeout(() => {
        addEventListener('pointerdown', function dismiss(e) {
          if (!menu.contains(e.target)) menu.remove();
          removeEventListener('pointerdown', dismiss);
        });
      });
    };
  }

  // a phone rotation or window shrink forces docked; growing back restores
  narrow.addEventListener('change', apply);

  syncButtons();
  apply();   // restores a persisted 'windows' choice on boot (unless narrow)

  return {
    mode: () => active,
    setMode: (m) => { stored = m; try { localStorage.setItem(MODE_KEY, m); } catch { } apply(); },
    /** register a free-floating window: { title, isOpen(), setOpen(v) } */
    register: (entry) => { extras.push(entry); },
    setDocName,
  };
}
