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
