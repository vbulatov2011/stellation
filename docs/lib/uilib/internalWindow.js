/*
 * Internal windows — floating, draggable, resizable panels inside the page.
 *
 * By Vladimir Bulatov; adapted here from SymmHub (lib/uilib/internalWindow.js)
 * with the same API and persistence contract but rewritten internals:
 *
 *  - Dragging uses Pointer Events with setPointerCapture instead of
 *    document.onmousemove globals. The original was mouse-only — a touch drag
 *    fought page scrolling and any other code assigning document.onmousemove
 *    silently clobbered it. Capture keeps the drag alive when the pointer
 *    leaves the header, with no document-level state at all.
 *
 *  - Resizing is a corner grip driven by the same pointer pattern, instead of
 *    CSS `resize: both`. The CSS resizer has no touch support and its
 *    affordance is a faint corner texture nobody finds; the grip works with a
 *    finger and can be styled to be seen.
 *
 *  - Chrome is styled from the app's theme variables (uilib.css) rather than
 *    hard-coded greys, so windows follow light/dark like everything else. The
 *    close button is a real <button> with an inline SVG in the app's
 *    stroke-currentColor icon style — no image asset to load or recolour.
 *
 *  - Windows are clamped to a container element (params.container, default
 *    document.body) rather than the viewport, so an app can keep them out of
 *    its fixed header without measuring anything.
 *
 * What is kept exactly: the createInternalWindow(params) signature and returned
 * object, the localStorage persistence format (`<storageId>_params` for
 * geometry, `<storageId>_visible` for visibility), the window-manager z-order
 * bands (plain windows restack from Z_BASE; alwaysOnTop and modal sit in fixed
 * bands above them), and the clamp-back-into-view behaviour on resize.
 */

const Z_BASE = 5;
const Z_ALWAYS_ON_TOP = 100000;
const Z_MODAL = 100001;

const DEFAULT_SIZE = '40%';
const DEFAULT_OFFSET = '10px';

const MIN_W = 120;   // px — small enough for the toolbox case, big enough to grab
const MIN_H = 60;

// ---------------------------------------------------------------- manager

let gManager = null;

/*
 * One manager per page. It owns the stacking order — an array from bottom to
 * top — and re-clamps every visible window when the container resizes, so a
 * window left near the edge cannot be stranded off-screen by a narrower
 * viewport (or by rotating a tablet).
 */
function getWindowManager() {
  if (!gManager) gManager = createWindowManager();
  return gManager;
}

function createWindowManager() {
  const windows = [];

  function add(iw) { windows.push(iw); }

  function toTop(iw) {
    // modal and always-on-top windows live in fixed bands and never restack
    if (iw.modal) { iw.wnd.style.zIndex = Z_MODAL; return; }
    if (iw.alwaysOnTop) { iw.wnd.style.zIndex = Z_ALWAYS_ON_TOP; return; }
    const i = windows.indexOf(iw);
    if (i < 0) return;
    windows.splice(i, 1);
    windows.push(iw);
    windows.forEach((w, k) => {
      if (!w.modal && !w.alwaysOnTop) w.wnd.style.zIndex = Z_BASE + k;
    });
  }

  /** the top-most visible window that can close — what Escape acts on */
  function topClosable() {
    for (let i = windows.length - 1; i >= 0; i--) {
      const w = windows[i];
      if (w.canClose && w.isVisible()) return w;
    }
    return null;
  }

  addEventListener('resize', () => {
    for (const w of windows) if (w.isVisible()) w.clamp();
  });

  /*
   * Escape closes the top window, matching what every floating-panel UI
   * teaches. Two abstentions: native <dialog>s own Escape in the top layer
   * (cancelling their close event from here would be a fight we lose), and a
   * focused text field keeps its key — Escape there means "abandon my edit",
   * not "take my window away".
   */
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.querySelector('dialog[open]')) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    const w = topClosable();
    if (w) { e.preventDefault(); w.setVisible(false); }
  });

  return { add, toTop, count: () => windows.length };
}

// ---------------------------------------------------------------- window

/**
 * Create a floating internal window.
 *
 * params:
 *   width, height, left, top  CSS strings ('40%', '320px'); geometry
 *   title                     header text
 *   canClose                  show the close button; Escape can close it
 *   canResize                 show the corner grip
 *   onResize(entries)         called whenever the window box changes
 *   onClose(win, visible)     called on every visibility change
 *   storageId                 persist geometry + visibility under this key
 *   modal / alwaysOnTop       fixed z-bands above normal windows
 *   alwaysVisible             setVisible(false) is ignored
 *   container                 element the window lives in and is clamped to
 *                             (default document.body)
 *   role                      ARIA role ('dialog' for transient pickers,
 *                             'region' for workspace panels)
 *
 * returns { wnd, interior, header, button, titleDiv,
 *           setTitle, setVisible, isVisible, clamp, onMove,
 *           canClose, modal, alwaysOnTop, alwaysVisible }
 */
export function createInternalWindow(params = {}) {
  const manager = getWindowManager();
  const container = params.container || document.body;
  const storageId = params.storageId || null;
  const geomKey = storageId ? storageId + '_params' : null;
  const visKey = storageId ? storageId + '_visible' : null;

  const canClose = !!params.canClose;
  const canResize = !!params.canResize;
  const modal = !!params.modal;
  const alwaysOnTop = !!params.alwaysOnTop;
  const alwaysVisible = !!params.alwaysVisible;

  // ---- DOM ------------------------------------------------------------
  const wnd = document.createElement('div');
  wnd.className = 'iw';
  wnd.setAttribute('role', params.role || 'dialog');
  if (params.title) wnd.setAttribute('aria-label', params.title);

  const header = document.createElement('div');
  header.className = 'iw-header';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'iw-title';
  titleDiv.textContent = params.title || '';
  header.appendChild(titleDiv);

  const button = document.createElement('button');
  button.className = 'iw-close';
  button.setAttribute('aria-label', 'Close');
  button.innerHTML =
    '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';
  if (canClose) header.appendChild(button);

  const interior = document.createElement('div');
  interior.className = 'iw-interior';

  wnd.appendChild(header);
  wnd.appendChild(interior);

  let grip = null;
  if (canResize) {
    grip = document.createElement('div');
    grip.className = 'iw-grip';
    // three diagonal strokes, the familiar resize texture
    grip.innerHTML =
      '<svg class="ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M14 6L6 14M14 10l-4 4M14 14h.01"/></svg>';
    wnd.appendChild(grip);
  }

  // ---- geometry -------------------------------------------------------
  wnd.style.width = params.width || DEFAULT_SIZE;
  wnd.style.height = params.height || DEFAULT_SIZE;
  wnd.style.left = params.left || DEFAULT_OFFSET;
  wnd.style.top = params.top || DEFAULT_OFFSET;

  /*
   * Restore the persisted geometry. Width/height are only honoured for
   * resizable windows — a fixed-size window keeps whatever the code says, so
   * a layout change in a new version is not vetoed by an old localStorage
   * entry (the SymmHub rule, kept).
   */
  if (geomKey) {
    try {
      const saved = JSON.parse(localStorage.getItem(geomKey) || 'null');
      if (saved) {
        wnd.style.left = Math.max(0, parseInt(saved.left) || 0) + 'px';
        wnd.style.top = Math.max(0, parseInt(saved.top) || 0) + 'px';
        if (canResize) {
          if (saved.width) wnd.style.width = saved.width;
          if (saved.height) wnd.style.height = saved.height;
        }
      }
    } catch { /* corrupted entry: fall back to the given geometry */ }
  }

  // ---- visibility -----------------------------------------------------
  let startVisible = true;
  if (!alwaysVisible && visKey) {
    try { if (localStorage.getItem(visKey) === 'false') startVisible = false; }
    catch { /* storage unavailable: stay visible */ }
  }
  if (!startVisible) wnd.style.visibility = 'hidden';

  if (modal) wnd.style.zIndex = Z_MODAL;
  else if (alwaysOnTop) wnd.style.zIndex = Z_ALWAYS_ON_TOP;
  else wnd.style.zIndex = Z_BASE + manager.count();

  container.appendChild(wnd);

  // ---- behaviour ------------------------------------------------------

  function containerBox() {
    // body height can be 0 in a flex layout; the viewport is the safe floor
    const w = container.clientWidth || innerWidth;
    const h = container.clientHeight || innerHeight;
    return { w, h };
  }

  /** keep at least the header reachable: never above/left of 0, never fully past the right/bottom */
  function clamp() {
    const box = containerBox();
    const left = Math.min(Math.max(0, wnd.offsetLeft), Math.max(0, box.w - wnd.offsetWidth));
    const top = Math.min(Math.max(0, wnd.offsetTop), Math.max(0, box.h - header.offsetHeight));
    if (left !== wnd.offsetLeft) wnd.style.left = left + 'px';
    if (top !== wnd.offsetTop) wnd.style.top = top + 'px';
  }

  function saveGeometry() {
    if (!geomKey) return;
    const entry = {
      left: Math.max(0, wnd.offsetLeft) + 'px',
      top: Math.max(0, wnd.offsetTop) + 'px',
    };
    if (canResize) {
      entry.width = wnd.offsetWidth + 'px';
      entry.height = wnd.offsetHeight + 'px';
    }
    try { localStorage.setItem(geomKey, JSON.stringify(entry)); }
    catch { /* storage full or blocked: geometry just won't persist */ }
  }

  /*
   * One pointer-capture drag helper serves both the header (move) and the
   * grip (resize). Capture means the gesture cannot be lost to the interior,
   * an iframe, or the page — and needs no document-level listeners to clean
   * up. The header/grip carry touch-action:none in CSS, so a finger drags the
   * window instead of scrolling the page; the interior deliberately does not,
   * so its content still scrolls.
   */
  function pointerDrag(el, onMove) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      manager.toTop(myself);
      const x0 = e.clientX, y0 = e.clientY;
      const start = onMove(null);          // null = "give me the start state"
      const move = (ev) => onMove({ dx: ev.clientX - x0, dy: ev.clientY - y0, start });
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        saveGeometry();
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      try { el.setPointerCapture(e.pointerId); } catch { /* untracked pointer */ }
      e.preventDefault();
    });
  }

  pointerDrag(header, (m) => {
    if (!m) return { left: wnd.offsetLeft, top: wnd.offsetTop };
    const box = containerBox();
    const left = Math.min(Math.max(0, m.start.left + m.dx), Math.max(0, box.w - wnd.offsetWidth));
    const top = Math.min(Math.max(0, m.start.top + m.dy), Math.max(0, box.h - header.offsetHeight));
    wnd.style.left = left + 'px';
    wnd.style.top = top + 'px';
    myself.onMove();
  });

  if (grip) {
    pointerDrag(grip, (m) => {
      if (!m) return { w: wnd.offsetWidth, h: wnd.offsetHeight };
      const box = containerBox();
      const w = Math.min(Math.max(MIN_W, m.start.w + m.dx), box.w - wnd.offsetLeft);
      const h = Math.min(Math.max(MIN_H, m.start.h + m.dy), box.h - wnd.offsetTop);
      wnd.style.width = w + 'px';
      wnd.style.height = h + 'px';
    });
  }

  // clicking anywhere in a window raises it, not just the header — capture
  // phase, so it wins even when the target stops propagation
  wnd.addEventListener('pointerdown', () => manager.toTop(myself), true);

  // close button: pointerdown must not start a header drag
  button.addEventListener('pointerdown', (e) => e.stopPropagation());
  button.addEventListener('click', (e) => { e.preventDefault(); setVisible(false); });

  /*
   * The ResizeObserver is the one notifier for size changes however they
   * happen — the grip, a stylesheet, a programmatic set — which is exactly
   * how consumers rely on onResize (a GUI panel re-syncing its width, a
   * canvas re-fitting). It also persists, so geometry survives without every
   * code path remembering to save.
   */
  if (params.onResize || geomKey) {
    new ResizeObserver((entries) => {
      params.onResize?.(entries);
      saveGeometry();
    }).observe(wnd);
  }

  // ---- API ------------------------------------------------------------

  function setTitle(text) {
    titleDiv.textContent = text;
    titleDiv.title = text;              // tooltip carries the full text when truncated
    wnd.setAttribute('aria-label', text);
  }

  function isVisible() { return wnd.style.visibility !== 'hidden'; }

  function setVisible(visible) {
    if (alwaysVisible) visible = true;
    wnd.style.visibility = visible ? 'visible' : 'hidden';
    if (visible) { manager.toTop(myself); clamp(); }
    if (visKey) {
      try { localStorage.setItem(visKey, visible ? 'true' : 'false'); }
      catch { /* not persisted */ }
    }
    params.onClose?.(myself, visible);
  }

  const myself = {
    wnd, interior, header, button, titleDiv,
    setTitle, setVisible, isVisible, clamp,
    onMove: () => saveGeometry(),
    canClose, modal, alwaysOnTop, alwaysVisible,
  };

  manager.add(myself);
  clamp();
  return myself;
}
