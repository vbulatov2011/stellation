/*
 * File browser — a thumbnail window over a local folder, via the File System
 * Access API.
 *
 * By Vladimir Bulatov; adapted from SymmHub (lib/uilib/FileSelectionDialog.js).
 * The user grants one root folder; the dialog remembers its handle (files.js
 * shared store) and on the next visit needs only the lightweight permission
 * chip, not the OS picker. Navigation stays inside that root: subfolders,
 * a '..' entry, and the last-visited subfolder is re-walked from the root via
 * resolve() so every handle in play derives from the one grant.
 *
 * Documents pair by name — <name>.json with <name>.json.png beside it — the
 * same convention the server presets use, which is what makes a folder saved
 * by this app browsable with previews. Thumbnails are read eagerly through
 * FileReader into data URLs; folders of tens of documents are the design
 * point, not thousands.
 *
 * What the original hung off a dat.gui hamburger menu — re-pick root, refresh —
 * is two plain header buttons here, which severs uilib's only dependency on
 * the param system. Right-click on a document offers delete (json + png).
 *
 * Everything here assumes hasFSAccess(); the app never shows this dialog on
 * browsers without the API.
 */

import { createImageSelector, DEFAULT_THUMB, showThumbMenu, copyText } from './imageSelector.js';
import { getHandle, setHandle, restoreHandle } from './files.js';

const EXT_JSON = '.json';
const EXT_PNG = '.png';

const FOLDER_THUMB =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<path d="M8 16a4 4 0 014-4h14l6 6h24a4 4 0 014 4v26a4 4 0 01-4 4H12a4 4 0 01-4-4z" fill="#e2b45a"/>' +
    '</svg>');
const PARENT_THUMB =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<path d="M8 16a4 4 0 014-4h14l6 6h24a4 4 0 014 4v26a4 4 0 01-4 4H12a4 4 0 01-4-4z" fill="#c98d3d"/>' +
    '<path d="M36 44V30m0 0l-7 7m7-7l7 7" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/>' +
    '</svg>');

export function createFileSelectionDialog(options = {}) {
  const storageId = options.storageId || 'stell.fileDialog';
  const ROOT_KEY = storageId + '.root';
  const SUB_KEY = storageId + '.sub';

  let selector = null;
  let rootHandle = null;
  let curHandle = null;       // the folder currently shown = the write folder
  let curPath = [];           // segments below the root

  // ---- window -----------------------------------------------------------

  function ensureSelector() {
    if (selector) return;
    selector = createImageSelector({
      title: options.title || 'Files',
      width: options.width || '520px', height: options.height || '420px',
      left: options.left || '60px', top: options.top || '60px',
      storageId,
      container: options.container,
      role: 'dialog',
      transient: true,
      onSelect: (data) => {
        if (data.isFolder) { openFolder(data.handle); return; }
        options.onSelect?.(data);
      },
      // opening takes a double click and a single one selects — the module's
      // default, shared with the presets sheet so the two identical-looking
      // shelves of tiles behave identically
      onContextMenu: showItemMenu,
    });
    const mkBtn = (label, title, fn) => {
      const b = document.createElement('button');
      b.className = 'iw-hbtn';
      b.textContent = label;
      b.title = title;
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', fn);
      selector.getHeader().insertBefore(b, selector.getHeader().lastChild);
    };
    mkBtn('folder…', 'Choose a different root folder', () => selectFolder());
    mkBtn('refresh', 'Re-read the current folder, sorting it afresh', () => populate());
  }

  function setTitle() {
    selector?.setTitle((options.title || 'Files') + ' — /' + curPath.join('/'));
  }

  // ---- the folder listing -------------------------------------------------

  async function fileToDataUrl(handle) {
    const file = await handle.getFile();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  async function populate() {
    if (!curHandle || !selector) return;
    selector.clear();
    setTitle();

    // one pass over the folder, so json/png pairing is O(1) lookups
    const entries = {};
    try {
      for await (const [name, handle] of curHandle.entries()) entries[name] = handle;
    } catch (e) {
      options.onError?.('could not read the folder: ' + e.message);
      return;
    }

    const items = [];
    if (curPath.length) {
      items.push({ tmb: PARENT_THUMB, data: { getName: () => '..', isFolder: true, handle: 'PARENT' } });
    }
    for (const [name, handle] of Object.entries(entries)) {
      if (handle.kind === 'directory') {
        items.push({ tmb: FOLDER_THUMB, data: { getName: () => name, isFolder: true, handle } });
      }
    }
    const jsonNames = Object.keys(entries)
      .filter((n) => n.endsWith(EXT_JSON) && entries[n].kind === 'file').sort();
    const withThumbs = await Promise.all(jsonNames.map(async (n) => {
      const tmbHandle = entries[n + EXT_PNG];
      let tmb = DEFAULT_THUMB;
      if (tmbHandle) { try { tmb = await fileToDataUrl(tmbHandle); } catch { } }
      const base = n.slice(0, -EXT_JSON.length);
      return { tmb, data: { getName: () => base, jsonHandle: entries[n], tmbHandle, fileName: n } };
    }));
    items.push(...withThumbs);
    selector.addItems(items, { noSort: true });   // '..', folders, then documents
  }

  async function openFolder(handle) {
    if (handle === 'PARENT') {
      curPath.pop();
      let h = rootHandle;
      for (const seg of curPath) h = await h.getDirectoryHandle(seg);
      curHandle = h;
    } else {
      curHandle = handle;
      curPath.push(handle.name);
    }
    setHandle(SUB_KEY, curHandle);                // fire and forget
    options.onFolderChange?.(curHandle, '/' + curPath.join('/'));
    await populate();
  }

  /** re-enter the folder the user was in last time, walking from the root */
  async function restoreSubfolder() {
    curHandle = rootHandle;
    curPath = [];
    try {
      const sub = await getHandle(SUB_KEY);
      if (!sub) return;
      const rel = await rootHandle.resolve(sub);
      if (!rel) return;
      let h = rootHandle;
      for (const seg of rel) h = await h.getDirectoryHandle(seg);
      curHandle = h;
      curPath = rel;
    } catch { /* the subfolder is gone: the root is always right */ }
  }

  // ---- root selection -----------------------------------------------------

  async function selectFolder() {
    try {
      const handle = await showDirectoryPicker({ mode: 'readwrite' });
      rootHandle = handle;
      setHandle(ROOT_KEY, handle);
      setHandle(SUB_KEY, handle);
      curHandle = handle;
      curPath = [];
      options.onFolderChange?.(curHandle, '/');
      await populate();
      return handle;
    } catch (e) {
      if (e.name !== 'AbortError') options.onError?.(e.message);
      return null;
    }
  }

  /** stored root -> permission chip -> null. Must run inside a user gesture. */
  async function loadRootHandle() {
    if (rootHandle) return rootHandle;
    rootHandle = await restoreHandle(ROOT_KEY);
    return rootHandle;
  }

  // ---- context menu -------------------------------------------------------

  /**
   * The right-button menu, for a document, a folder, or the empty space
   * between them — `data` is null for the last. New folder is offered
   * everywhere, because it is about the folder you are IN rather than about
   * whatever the pointer happened to be over; delete is offered only over a
   * document, which is the only thing here that can be deleted.
   */
  /**
   * Where a document sits, as far as this app can honestly say.
   *
   * The File System Access API never hands out a real filesystem path — that
   * is the point of it — so the most that can be said is the granted folder's
   * own name and the way down from it. That is what a person needs to find the
   * file again, and it is not a lie about being an absolute path.
   */
  function pathOf(data) {
    return [rootHandle?.name, ...curPath, data.fileName || data.getName()]
      .filter(Boolean).join('/');
  }

  function showItemMenu(data, event) {
    const isDoc = data && !data.isFolder;
    showThumbMenu([
      isDoc && {
        label: 'delete ' + data.fileName + '…',
        run: async () => {
          if (!confirm(`Delete ${data.fileName} and its thumbnail?`)) return;
          try {
            await curHandle.removeEntry(data.fileName);
            if (data.tmbHandle) await curHandle.removeEntry(data.fileName + EXT_PNG);
            selector.removeItem(data);
          } catch (e) { options.onError?.('could not delete: ' + e.message); }
        },
      },
      data && {
        label: 'copy path',
        run: async () => {
          const path = pathOf(data);
          const ok = await copyText(path);
          (ok ? notice : options.onError)?.(ok ? 'copied ' + path : 'could not reach the clipboard');
        },
      },
      { label: 'new folder…', run: newFolder },
    ], event);
  }

  /** a plain message, distinct from an error; falls back to the error channel */
  const notice = (msg) => (options.onNotice || options.onError)?.(msg);

  /**
   * Make a folder here, under a name the user types.
   *
   * The listing is redrawn rather than added to: a folder does not go at the
   * end like a saved document — folders come before documents — so there is no
   * place to append it to that would be the place it belongs.
   */
  async function newFolder() {
    if (!curHandle) return;
    const raw = prompt('Name for the new folder:', 'new folder');
    if (raw == null) return;
    const name = raw.trim();
    if (!name) return;
    // the characters a folder name cannot carry on the platforms this runs on
    if (/[\\/:*?"<>|]/.test(name)) {
      options.onError?.('a folder name cannot contain \\ / : * ? " < > |');
      return;
    }
    try {
      await curHandle.getDirectoryHandle(name, { create: true });
      await populate();
    } catch (e) {
      options.onError?.('could not create the folder: ' + e.message);
    }
  }

  // ---- API ---------------------------------------------------------------

  /** open the dialog: restore the stored root (permission chip) or ask for one */
  async function show() {
    ensureSelector();
    if (!rootHandle && !(await loadRootHandle())) {
      if (!(await selectFolder())) return;       // user canceled the picker
      selector.setVisible(true);
      return;
    }
    if (!curHandle) await restoreSubfolder();
    selector.setVisible(true);
    await populate();
  }

  /**
   * Refresh after a save, selecting the saved document.
   *
   * A save touches one document, so this touches one tile. It used to call
   * populate() every time, which empties the grid, re-enumerates the folder,
   * re-reads EVERY thumbnail into a data URL and rebuilds every tile — fifty
   * documents meant fifty file reads and fifty elements thrown away to put
   * back forty-nine identical ones. That is what blinked, and what threw the
   * scroll position back to the top.
   *
   * A document already listed has its own tile repainted where it stands. A
   * new one is APPENDED, at the end, and scrolled to — deliberately not
   * sorted into place: a file that appears where you are looking is easier to
   * find than one that has been filed away correctly somewhere off-screen,
   * and the grid re-sorts on the next `refresh`. Only a save into a different
   * folder redraws the lot, because then the lot really is different.
   */
  async function refresh(name, folderHandle) {
    if (!selector) return;
    const sameFolder = !folderHandle || folderHandle === curHandle ||
      (curHandle && await folderHandle.isSameEntry?.(curHandle).catch(() => false));

    if (sameFolder) {
      if (folderHandle) curHandle = folderHandle;
      const existing = selector.findItem({ getName: () => name }, true);
      if (existing) {
        if (await refreshOne(name)) { revealItem(existing); return; }
      } else {
        const added = await appendOne(name);
        if (added) { revealItem(added); return; }
      }
    }

    if (folderHandle) curHandle = folderHandle;
    await populate();
    const item = selector.findItem({ getName: () => name }, true);
    if (item) revealItem(item);
  }

  /*
   * Select a tile and bring it into view, without moving the page itself.
   * NOT called show(): this module already has a show(), the one that opens
   * the window, and a second declaration of that name in the same scope
   * quietly replaces it.
   */
  function revealItem(item) {
    selector.selectItem(item);
    item?.elem?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** read one document's pair: { tmb, data } for the selector, or null */
  async function readPair(name) {
    const jsonName = name + EXT_JSON;
    let jsonHandle = null, tmbHandle = null, tmb = DEFAULT_THUMB;
    try { jsonHandle = await curHandle.getFileHandle(jsonName); } catch { return null; }
    try {
      tmbHandle = await curHandle.getFileHandle(jsonName + EXT_PNG);
      tmb = await fileToDataUrl(tmbHandle);
      /*
       * Decoding is a courtesy, not a requirement, so it is given a moment and
       * no more, and skipped for a window nobody is painting: decode() is not
       * obliged to settle for an image that is never drawn — in a window put
       * away it does not — and a save must not wait on it.
       */
      if (!document.hidden) {
        const img = new Image();
        img.src = tmb;
        if (img.decode) {
          await Promise.race([
            img.decode().catch(() => { }),
            new Promise((r) => setTimeout(r, 250)),
          ]);
        }
      }
    } catch { /* a document may have no thumbnail; the pictogram stands in */ }
    return { tmb, data: { getName: () => name, jsonHandle, tmbHandle, fileName: jsonName } };
  }

  /**
   * Repaint the tile of a document already listed. False if it is not where it
   * should be, which puts the caller back on the full pass rather than leaving
   * a stale tile behind.
   */
  async function refreshOne(name) {
    const pair = await readPair(name);
    if (!pair) return false;
    selector.updateItem(pair);
    return true;
  }

  /** add a newly saved document to the end of the grid; the tile, or null */
  async function appendOne(name) {
    const pair = await readPair(name);
    if (!pair) return null;
    selector.addItems([pair], { noSort: true });
    return selector.findItem({ getName: () => name }, true);
  }

  return {
    show,
    setVisible: (v) => selector?.setVisible(v),
    isVisible: () => !!selector && selector.isVisible(),
    selectFolder,
    refresh,
    loadRootHandle,
    getRootHandle: () => rootHandle,
    getWriteHandle: () => curHandle,
    getWriteHandlePath: () => '/' + curPath.join('/'),
  };
}
