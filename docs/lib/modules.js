/*
 * The shared layer, as one import.
 *
 * Everything under docs/lib is used by both the application (docs/app/js) and
 * the tutorial and sample pages (docs/js). Those consumers import from here
 * rather than from the individual files, so moving or splitting a module is a
 * change to this one file instead of an edit in every page.
 *
 *   import { buildStellation, Renderer3D, DiagramView } from '../lib/modules.js';
 *
 * Every name is listed explicitly. A re-export list is the public surface of
 * the shared layer, and it should be readable as one: what is here is what the
 * pages may use, and adding to it is a deliberate act. It also means a name
 * collision between two modules is a duplicate-export error at load time rather
 * than a binding that silently becomes undefined at the importer.
 *
 * One deliberate non-user: docs/app/js/worker.js imports core.js directly. It
 * runs as a module worker, and pulling the barrel in would make it fetch the
 * WebGL renderer and both DOM panels — ~90 kB it can never use — before the
 * first build starts.
 */

// ---- core.js — geometry, cells, the stellation pipeline ---------------------
export {
  // building
  buildStellation, makeArrangement, makeLayers, makeCellsBetween,
  makeSymmetricCells, makeSubCells, makeConnectivityGraph,
  facePlanes, planesFromList, planeFromPoint, suggestDepth,
  // cells and selections
  extractMesh, selectedSubCells, subCellForFacet, cellsAcrossFacet,
  cellsAcrossFace, supportSet, dependentSet, adjacent, compareCells, selKey,
  cellCenter, cellVolume, countVertices, orientFaces,
  // the 2D diagram
  createDiagram, diagramFaces, diagramExtent, facetCenter, facetArea,
  planeClasses,
  // reading and writing
  parseCells, formatCells, parseStel, writeStel, toOFF, toOBJ, toSTL,
  // vectors and matrices
  VertexPool, v3, add, sub, mul, dot, cross, len, normalize, maxOf,
  matMul, mat3mul, rotationBetween,
  // tolerances
  TOL, THRESHOLD, FACTOR, MAXVERTEX,
} from './core.js';

// ---- render3d.js — the WebGL2 view -----------------------------------------
export { Renderer3D, layerColor, LAYER_COLORS, classColor, CLASS_COLORS, ACTION } from './render3d.js';

// ---- diagram.js — the 2D stellation diagram --------------------------------
export { DiagramView } from './diagram.js';

// ---- cells.js — the cell table ---------------------------------------------
export { CellsPanel } from './cells.js';

// ---- platform.js — ctrl vs cmd, and what to call it on screen --------------
export { labelKeys, isMac, subKey, altKeyName } from './platform.js';
