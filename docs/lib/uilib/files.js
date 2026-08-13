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
