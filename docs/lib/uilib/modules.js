/*
 * The uilib barrel — floating windows and the file machinery around them,
 * adapted from SymmHub's lib/uilib (see each file's header for what changed).
 *
 * Deliberately separate from ../modules.js: the tutorial and figure pages
 * import that barrel, and nothing on those pages needs a window system —
 * keeping the two apart means they never fetch a byte of this code.
 *
 * Names are listed explicitly, the same rule as the other barrels: a
 * collision between two files is a duplicate-export error at load time, not
 * a binding that quietly becomes undefined at the importer.
 */

export { createInternalWindow } from './internalWindow.js';
export {
  createImageSelector, createPresetsFilesFilter, createDefaultImageFilesFilter,
  DEFAULT_THUMB,
} from './imageSelector.js';
