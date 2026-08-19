/*
 * File helpers for the uilib layer.
 *
 * By Vladimir Bulatov; adapted from SymmHub (lib/uilib/files.js and pieces of
 * utils.js). Everything touching the File System Access API sits behind one
 * feature gate, because the API exists only in Chromium — Firefox, Safari and
 * every mobile browser lack it, and the app must degrade to plain open/save
 * there rather than throw.
 */

/** the single gate for every folder-based feature */
export function hasFSAccess() {
  return 'showDirectoryPicker' in window;
}

/**
 * Write data (string or Blob) into a file inside a directory handle,
 * creating the file if needed. (SymmHub files.js writeFile.)
 */
export async function writeFile(dirHandle, fname, data) {
  const fh = await dirHandle.getFileHandle(fname, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

/*
 * One IndexedDB store for every remembered directory handle in the app.
 *
 * SymmHub grew three parallel databases (FileSelectionDialog, SaveAsDialog,
 * and a hard-coded key inside FolderPickerDialog that had drifted out of sync
 * with its writer). Handles are opaque values — there is nothing dialog-
 * specific about storing them — so one db with explicit keys removes the
 * whole class of key-mismatch bugs.
 */
const DB_NAME = 'stellation.files';
const DB_STORE = 'handles';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(DB_STORE);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function getHandle(key) {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch { return null; }
}

export async function setHandle(key, handle) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(handle, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* not persisted; the user will just be asked again */ }
}

/**
 * Bring a stored handle back to life: silent permission query first, then the
 * lightweight permission chip — never the OS picker. Returns null when there
 * is nothing stored or the user said no; MUST be called from a user gesture,
 * or requestPermission is denied out of hand by the browser.
 */
export async function restoreHandle(key, mode = 'readwrite') {
  const handle = await getHandle(key);
  if (!handle) return null;
  try {
    if (await handle.queryPermission({ mode }) === 'granted') return handle;
    if (await handle.requestPermission({ mode }) === 'granted') return handle;
  } catch { /* stale handle (folder gone, device removed) */ }
  return null;
}

/**
 * Centre-crop a canvas to a square thumbnail of the given size.
 * (SymmHub utils.js getSquareThumbnailCanvas, unchanged in spirit: the
 * shorter side is kept whole, the longer one is cropped symmetrically.)
 */
export function getSquareThumbnailCanvas(src, size = 256) {
  const out = document.createElement('canvas');
  out.width = size;
  out.height = size;
  const s = Math.min(src.width, src.height);
  const sx = (src.width - s) / 2;
  const sy = (src.height - s) / 2;
  out.getContext('2d').drawImage(src, sx, sy, s, s, 0, 0, size, size);
  return out;
}

/**
 * A remembered export folder.
 *
 * Every dialog that writes files wants the same thing: ask once, remember it,
 * and offer a way to change it. The handle lives in IndexedDB and
 * restoreHandle re-checks the permission, asking again only if the browser has
 * forgotten it or the folder has gone — so the second export and every one
 * after it writes straight out with no picker at all, which is the point of
 * remembering and what makes exporting a set of files a single click.
 *
 * `key` is the storage key; `pickerId` is the browser's own hint for which
 * folder to open the picker in, so different kinds of export can start in
 * different places.
 */
export function createFolderChooser({ key, pickerId }) {
  let folder = null;

  /** the folder, asking for one only if we have none — or if `force` says so */
  async function choose(force = false) {
    if (!force) {
      // re-check after the await: the user may have picked one meanwhile
      if (!folder) {
        const restored = await restoreHandle(key, 'readwrite');
        folder ||= restored;
      }
      if (folder) return folder;
    }
    let picked;
    try {
      picked = await showDirectoryPicker({ id: pickerId, mode: 'readwrite' });
    } catch (err) {
      /*
       * A dismissed picker is an AbortError and means "never mind". Anything
       * else is a real failure — no permission, a browser that refuses because
       * the click that started this has gone stale — and swallowing it left
       * the caller looking at a dialog that had silently done nothing.
       */
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
    if (!picked) return null;
    folder = picked;
    await setHandle(key, folder);
    return folder;
  }

  return {
    choose,
    /** whatever we already hold, restoring it from storage without a prompt */
    async current() {
      if (!hasFSAccess()) return null;
      folder ||= await restoreHandle(key, 'readwrite');
      return folder;
    },
  };
}
