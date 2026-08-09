/*
 * The shared layer as the pages see it.
 *
 * The scripts in this directory — the tutorial and the Brückner and historical
 * sample pages — import from here rather than reaching into ../lib themselves.
 * One more level of indirection, for one reason: if the shared layer moves or
 * splits again, this file is the only thing in docs/js that has to change.
 *
 *   import { buildStellation, Renderer3D, CellsPanel } from './modules.js';
 *
 * This is not all of ../lib/modules.js — only what the pages in this directory
 * actually use, listed explicitly. So the list doubles as the answer to "what
 * do the sample pages depend on?", and it is short enough to read. The cost is
 * that reaching for something new here means adding it below first; the error
 * when you forget is an immediate "does not provide an export named ...", not
 * anything subtle.
 *
 * Deliberately absent: bfigure.js. It lives in this directory and is itself a
 * consumer of this barrel, so listing it would make modules.js and bfigure.js
 * import each other. bruckner-grid.js imports it directly as the sibling it is;
 * a page module moving is not the case this file insures against.
 */

export {
  // building an arrangement
  buildStellation, facePlanes, suggestDepth,
  // cells and selections
  extractMesh, selectedSubCells, subCellForFacet, supportSet, selKey,
  // the 2D diagram
  createDiagram,
  // reading and writing selections
  parseCells, formatCells,
  // views
  Renderer3D, layerColor, DiagramView, CellsPanel,
  // platform
  labelKeys,
} from '../lib/modules.js';
