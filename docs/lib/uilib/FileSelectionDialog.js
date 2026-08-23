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
 * What the original hung off a dat.gui hamburger menu — re-pick root, reload —
 * is two plain header buttons here, which severs uilib's only dependency on
 * the param system. Right-click on a document offers delete (json + png).
 *
 * Everything here assumes hasFSAccess(); the app never shows this dialog on
 * browsers without the API.
 */

import { createImageSelector, DEFAULT_THUMB } from './imageSelector.js';
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
      title: options.title || 'Documents',
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
    mkBtn('reload', 'Re-read the current folder', () => populate());
  }

  function setTitle() {
    selector?.setTitle((options.title || 'Documents') + ' — /' + curPath.join('/'));
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

  function showItemMenu(data, event) {
    if (data.isFolder) return;
    document.querySelector('.iw-menu')?.remove();
    const menu = document.createElement('div');
    menu.className = 'iw-menu';
    menu.style.left = event.clientX + 'px';
    menu.style.top = event.clientY + 'px';
    const del = document.createElement('button');
    del.textContent = 'delete ' + data.fileName + '…';
    del.onclick = async () => {
      menu.remove();
      if (!confirm(`Delete ${data.fileName} and its thumbnail?`)) return;
      try {
        await curHandle.removeEntry(data.fileName);
        if (data.tmbHandle) await curHandle.removeEntry(data.fileName + EXT_PNG);
        selector.removeItem(data);
      } catch (e) { options.onError?.('could not delete: ' + e.message); }
    };
    menu.appendChild(del);
    document.body.appendChild(menu);
    setTimeout(() => addEventListener('pointerdown', function dismiss(e) {
      if (!menu.contains(e.target)) menu.remove();
      removeEventListener('pointerdown', dismiss);
    }));
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
   * Saving over a document that is already listed touches exactly one tile, so
   * that is all this re-reads. It used to call populate() for every save, which
   * empties the grid, re-enumerates the folder, re-reads EVERY thumbnail into a
   * data URL and rebuilds every tile — a folder of fifty documents did fifty
   * file reads and threw away fifty elements to put back forty-nine identical
   * ones, and the grid visibly blinked each time you pressed Save.
   *
   * The full pass is still right when the folder itself changed, and when the
   * name is new: a new document has to take its place in the sorted order, and
   * the grid is built in one shot rather than by insertion.
   */
  async function reload(name, folderHandle) {
    if (!selector) return;
    const sameFolder = !folderHandle || folderHandle === curHandle ||
      (curHandle && await folderHandle.isSameEntry?.(curHandle).catch(() => false));
    if (folderHandle) curHandle = folderHandle;

    const existing = sameFolder ? selector.findItem({ getName: () => name }, true) : null;
    if (existing && await refreshOne(name)) {
      selector.selectItem(existing);
      return;
    }

    await populate();
    const item = selector.findItem({ getName: () => name }, true);
    if (item) selector.selectItem(item);
  }

  /**
   * Re-read one document's pair and update its tile in place. Returns false if
   * the document is not where it should be, which puts the caller back on the
   * full pass rather than leaving a stale tile behind.
   *
   * The new thumbnail is decoded BEFORE it is handed over: an <img> given a
   * fresh source paints nothing until it has decoded one, and swapping the
   * source of a visible tile without waiting is its own small flash.
   */
  async function refreshOne(name) {
    const jsonName = name + EXT_JSON;
    let jsonHandle = null, tmbHandle = null, tmb = DEFAULT_THUMB;
    try { jsonHandle = await curHandle.getFileHandle(jsonName); } catch { return false; }
    try {
      tmbHandle = await curHandle.getFileHandle(jsonName + EXT_PNG);
      tmb = await fileToDataUrl(tmbHandle);
      /*
       * Decoding is a courtesy, not a requirement, so it is given a moment and
       * no more: decode() is not obliged to settle promptly for an image that
       * is never painted — a window put away, a tab in the background — and a
       * save must not wait on it.
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
    selector.updateItem({ tmb, data: { getName: () => name, jsonHandle, tmbHandle, fileName: jsonName } });
    return true;
  }

  return {
    show,
    setVisible: (v) => selector?.setVisible(v),
    isVisible: () => !!selector && selector.isVisible(),
    selectFolder,
    reload,
    loadRootHandle,
    getRootHandle: () => rootHandle,
    getWriteHandle: () => curHandle,
    getWriteHandlePath: () => '/' + curPath.join('/'),
  };
}
