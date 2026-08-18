# Architecture

A map of the repository as it stands on 10 August 2026, for someone opening it
cold. Counts and test results below were measured, not estimated.

The project stellates polyhedra: take a solid, extend every face plane to
infinity, let the planes cut space into bounded cells, then choose a symmetric
set of those cells. The 2D version of the same idea is extending the sides of a
pentagon until they meet again, giving a pentagram.

There are **two complete implementations of the same mathematics**. The Java one
is the original applet, from 1998–2001, which still builds and runs as a desktop
app. The JavaScript one in `docs/` is a hand port — written against the Java as
reference rather than translated from it — and is what the live site serves.

---

## Layout

```
src/main/java     83 .java   the portable core: Stellation, SCell, SSCell, Symmetry, Jama
src/ui/java       28 .java   the AWT front end: StellationMain, Canvas3D, dialogs
src/test/java      2 .java   AppTest, DragProbe — see "loose ends"
build.xml                    Ant; compiles the 111 files of main+ui into cls/
ant-build.bat …              wrappers that find a JDK and an Ant for you

docs/                        the published site (GitHub Pages, .nojekyll)
  lib/          4,000 loc    engine and views, framework-free
  lib/uilib/    1,300 loc    windows + file handling, ported from SymmHub
  app/js/       2,300 loc    the application (app, worker, preset, workspace,
                             presets, docmanager)
  js/           1,600 loc    scripts for the essay pages
  data/           710 KB     catalog, geometry, symmetry, Brückner plates
  presets/                   shipped documents: <name>.json + <name>.json.png
  presets.json               the manifest listing them (paths relative to it)
  test/           350 loc    four Node harnesses
  index.html                 the landing page: a card per page, nothing else
  stellation_app.html        the app
  *.html        5,300 loc    eight documentation pages and essays

resources/       307 files   .off polyhedra and thumbnails, read by the Java app
stellation.jar               the 2001 build, package PVS — historical, still runs
stellation-app.jar           what build.xml produces today, package pvs
```

No build step for the web side, no dependencies, no framework. The file served
is the file you edit.

---

## The JavaScript engine

`docs/lib/core.js` (1,354 lines) is the entire mathematical pipeline, in
labelled sections that read in dependency order:

| line | section | what it does |
|---|---|---|
| 31 | constants | `THRESHOLD`, `FACTOR`, `MAXVERTEX`, `TOL` — all traceable to the Java |
| 38 | vector math | plain `{x,y,z}` objects, no classes |
| 73 | vertex pool | interning by position, so identity is shared and exact |
| 122 | planes | `facePlanes`, `planesFromList`, `orientFaces`, `suggestDepth` |
| 351 | arrangement | `makeArrangement` — the expensive step |
| 464 | facet helpers | centre, vector area, oriented adjacency |
| 503 | layers & cells | `makeLayers`, `makeCellsBetween` |
| 627 | symmetry orbits | `makeSymmetricCells`, `makeSubCells`, `planeClasses` |
| 750 | mesh extraction | `extractMesh` — selection to boundary surface |
| 805 | the pipeline | `buildStellation` ties it together |
| 967 | connectivity | support and dependent sets |
| 1029 | selection | `selKey`, `parseCells`, `formatCells` |
| 1159 | 2D diagram | `createDiagram`, `diagramFaces` |
| 1321 | export | `toOFF`, `toOBJ`, `toSTL` (`writeStel` at 1147) |

**The arrangement is the thing to understand first.** For each face plane, seed
a polygon far larger than the model, then clip it against every other plane. A
facet's `layer` is how many planes it ended up outside of, which is what makes
the shells fall out of the clipping rather than needing a separate pass. For the
dense duals this clips millions of polygons.

Two facts about facets carry most of the UI. A facet knows its `plane`, which is
what face-class colouring keys off. And `extractMesh` returns `facetTop` — for
each boundary face, whether the solid is below it (an outward cap) or above it
(an underside lining a cavity). That flag is what turns a click into "add" or
"remove", and what the class palette darkens.

---

## Off the main thread

`docs/app/js/worker.js` owns the built structure and answers nine messages:

```
build       the expensive one; keeps `stel` and the plane→class map
regroup     re-split sub-cells under a new stellation symmetry, in place
mesh        boundary surface for a selection
diagram     one plane's regions for a selection
both        the two above in one round trip — what the app actually uses
parseCells  a selection string (either notation) to atom keys
formatCells atom keys back to a string, with an `aligned` verdict
formatUnder the selection under some other grouping (.stel export via E)
layerKeys   every atom key in the first n layers
```

Selection changes are cheap, so only `build` rebuilds. Everything else reads
the structure already in the worker.

### The atomic selection model (editing symmetry)

A selection is a set of **atom keys** — `"layer.orbit.member"`, one per
primitive cell. That triple depends only on the polyhedron, the depth and the
polyhedron symmetry, never on the stellation symmetry: the arrangement and the
orbit grouping are computed before `subMatrices` is ever consulted, and
`makeSubCells` never reorders `orbit.cells`. So an atom key names the same
piece of space under every stellation symmetry — which is what lets the
selection **survive a symmetry switch**. The stellation group's whole role is
editorial: a click toggles the clicked atom's entire orbit under the *current*
group (`orbitAtoms` in app.js), so building at full symmetry and refining
under a subgroup — down to `E`, one cell per click — compose freely.

Switching the stellation symmetry is therefore a `regroup`, not a rebuild
(the Java applet's `createSubcells`): sub-cells re-split in place, ~50 ms on
the deepest preset, with the selection, the undo history and the camera
untouched, and the mesh provably bit-identical. The panel's boxes are the
orbits of the current group, tri-state — empty, **partially selected**
(faint; cells picked under a finer group), full. A click fills a partial box,
then clears it.

Serialization keeps two dialects. Whole-orbit selections — everything the app
could produce before this model — write exactly the classic sub-index string
under the document's stellation symmetry, `fileFormatRelease` 1, byte-stable.
A selection that is *not* whole orbits writes member-indexed brackets with a
`c{…}` prefix, `params.cells.indexing: "cells"`, release 2 — old builds
refuse it cleanly instead of misparsing. The `.stel` export of such a
selection is written under `E` (where it *is* whole orbits) so the original
Java program reproduces it. The tutorial pages drive the same `CellsPanel` in
the legacy sub-key dialect; `atoms` in the outline is what switches it.

### The document's plane set

A custom arrangement saves its planes as **structured rows** under
`params.planes.rows`, release 3:

```json
{ "normal": [0, 0.8506508083520423, 0.5257311121191299],
  "distance": 0.838505147445722, "symmetry": "Ih", "factor": 1.6 }
```

`symmetry` (default `E`) and `factor` (default 1) are written only when they
carry information. Releases 1 and 2 wrote `params.planes.text` — the editor's
own lines, re-tokenized on every read, which put a hand-rolled parser between
the file and the geometry: silent on a missing field, wrong on a stray one,
and lossy the moment a number was formatted. `normalizePlaneRows` in
`preset.js` now validates on the way **in and out**, naming the offending
row, so a malformed sheet cannot be written or opened — where before it would
quietly build a different solid. Documents that used `text` still open: it is
parsed once into rows and saved back structured. The editor keeps a text
buffer per row because a half-typed normal is not a number triple yet, but
that buffer reaches no file.

---

## Three linked views

- **3D** — `lib/render3d.js`, 1,310 lines of hand-written WebGL2. GLSL 300 es in
  four tagged template literals, flat-shaded, deliberately two-sided because
  stellation cells are open shells. Ray-picked triangles give click-to-toggle.
  Parallel projection since `eac477c`.
- **Diagram** — `lib/diagram.js`, canvas, drawn on one face plane.
- **Cells** — `lib/cells.js`, the orbit tree as a table.

All three share one gesture palette (`ACTION` in `render3d.js`) and toggle the
same selection, so green means add and red means remove everywhere.

### Three colourings

Chosen in the View panel, saved under `params.display.colorMode`:

- **by shell** (`layer`) — a hue per layer outward from the core.
- **by face class** (`class`) — a hue per symmetry class of original face
  under the POLYHEDRON's group, undersides darkened. "The same kind of face"
  is a property of the solid you started from, so an icosahedron has one
  class however you stellate it.
- **by stellation face class** (`stellClass`) — the same, under the
  STELLATION group. Those two coincide at full symmetry and part company
  below it: the icosahedron's twenty faces are one class under I, two under
  Th, and twenty under E, because that is how many kinds the chosen symmetry
  can still tell apart.

The worker keeps both plane→class maps (`faceClass`, `faceClassStell`) and
sends both arrays with every mesh, so switching the menu is a re-upload of
the colour attribute and never another build. The stellation one is
recomputed by `regroup` as well as `build`, since the group that defines it
is exactly what a regroup changes. The diagram follows the same choice — it
is drawn on one plane, so by either class it takes that plane's colour and
the only variation left is the above/below split.

### Facet opacity

`params.display.faceOpacity`, 1 down to 0, is a blend setting and nothing more —
no rebuild, only a redraw. Below 1 the pipeline inverts, **opaque ink first** —
the architecture suggested by the original author:

1. The opaque ink — the edges (lines or cylinders), the symmetry axes and
   mirror rims — draws first, depth test and depth writes on, exactly as
   geometry among itself.
2. The glass then composites back-to-front in card-shuffle order, blending,
   depth TEST on but writes off, polygon-offset sunk just behind the ink.

Per pixel that is exact: glass in front of an edge or axis dims it once per
layer, glass behind it is culled at precisely the pixels it covers, and the
offset keeps each facet from fighting its own coplanar ink, so front-surface
edges stay crisp. (Two rejected designs: drawing the ink last onto the empty
depth buffer put everything at full strength over the glass — an x-ray — and
threading the edges through the sorted stream itself needed per-frame
adjacency juggling and still only approximated what the depth buffer gives
for free.) At 0 the glass is skipped and the ink alone remains, a wireframe.

**Edges as cylinders** (`params.display.edges.face.tubes` / `.facet.tubes`):
each edge kind can independently be drawn as thin capped prisms — real
geometry with a world-space radius, lit by the same lights as the solid —
instead of screen-space quads of constant pixel width. Per kind because the
two want different treatment: face edges are the solid's outline and carry a
cylinder well, while facet edges are usually hairlines, and a sub-pixel
cylinder aliases where a line stays clean. The width sliders (0.1 steps) set
the radius, scaled to the mesh radius so the same number reads alike on any
model; being geometry, they thicken as you zoom. Built lazily and cached
against a key of everything baked into the vertices (widths, colours, mesh
scale), so line mode never pays for them.

Blending is order-dependent, and the order is exact: the facets draw
back-to-front in the order produced by the original applet's **card shuffle**
(`card_shuffle()` in the Java `pvs/g3d/Stellation3D.java`, ported as
`_buildSortData`/`_sortedTriangles` in `render3d.js`). A depth sort is wrong
for these meshes — long thin facets at steep angles overlap on screen while
their depth averages disagree — but a stellation is cut from a fixed set of
planes, so every facet lies IN one plane and crosses none. That makes the
planes themselves the sort: for each plane, stably move the facets on the
viewer's far side before those on the near side. If facet F occludes facet G,
F sits wholly on the viewer's side of the plane containing G, so that plane's
pass puts G first — and no later pass can undo it. Sidedness is a property of
the model, precomputed once per mesh; the view enters only as one sign per
plane. Cost per frame: planes × triangles sign tests (~0.2 ms at 2,500
triangles × 32 planes), an element-buffer upload, one draw call.

### Two kinds of edge

Also drawn from two buffers, each with its own toggle, colour and width, saved
under `params.display.edges`. Where two facets of DIFFERENT planes meet there is
a real crease, an edge of the solid: a **face edge**. Where two facets of the
SAME plane meet, the surface runs flat across the join and the line only records
how the arrangement was cut up: a **facet edge**. `setMesh` tells them apart from
the `facePlanes` the worker sends; callers that supply none — the figure pages —
put everything in the face bucket.

Worth knowing before you conclude the classifier is broken: whole consecutive
shells produce **no facet edges at all**, their per-plane surface regions being
disjoint. Real stellations are full of them — `sample_02` is 240 face and 240
facet edges, `sample_04` 690 and 480. The icosahedron core is 30 face edges and
no facet edges, which is the count an icosahedron should have.

### The trackball

The solid does not follow the pointer; it follows `lib/AnimatedPointer.js`, a
unit mass on a spring whose far end is the real pointer, ported from SymmHub.
Dragging smooths through the spring, and releasing switches the spring off so
the mass keeps its speed — one mechanism for both, and a throw spins as fast as
it was thrown. `POINTER_PHYSICS` at the top of `render3d.js` holds the three
numbers; `springForce` is the one that matters, since the lag time constant is
`dragFrictionFactor / sqrt(springForce)`.

---

## Module layering

```
lib/core.js ─────────────────► app/js/worker.js
lib/{render3d,diagram,cells} ► app/js/app.js ──► index.html
      │                             └─────────► app/js/preset.js
      └── render3d ──► lib/AnimatedPointer.js
lib/modules.js ──► js/modules.js ──► bruckner, bruckner-grid, historical,
                                     walkthrough, bfigure
```

`core.js`, `cells.js`, `platform.js` and `AnimatedPointer.js` import nothing at
all. `render3d.js` takes only `AnimatedPointer`, and `diagram.js` reaches into
`render3d.js` only for the shared palettes. The two barrel files exist so the
essay pages never name an internal path.

---

## Windows, presets and files

`docs/lib/uilib/` is an adapted port of the window+file library from the sibling
SymmHub project (`250125_symhub/.../lib/uilib`). Its own barrel, separate from
`lib/modules.js`, so the tutorial pages never fetch a byte of it. What changed
in the port is in each file's header; the load-bearing changes: dragging is
Pointer Events with capture (SymmHub's is mouse-only), the chrome is themed from
the app's CSS variables, and one shared IndexedDB store (`stellation.files`)
replaces SymmHub's three parallel databases.

- `internalWindow.js` — floating windows: a module-global manager for z-order
  and Escape, geometry/visibility persisted under `<storageId>_params` /
  `_visible`, clamped to a container element rather than the viewport.
- `imageSelector.js` — a window of clickable thumbnails; items are
  `{url|tmb|file, data}`, `url` being a plain `<img src>` (server presets need
  no fetch code).
- `FileSelectionDialog.js` / `FolderPickerDialog.js` / `SaveAsDialog.js` /
  `files.js` — the local-folder machinery, all behind `hasFSAccess()`.

**Windowed mode** (`app/js/workspace.js`) is the one idea worth understanding:
entering it MOVES the live panel subtrees (the two `.view`s, the cells group,
the settings `details`) into window interiors with `appendChild`, and leaving
moves them back to comment markers recording their docked slots. Nothing is
cloned or recreated, so every id, every handler wired once in `wireControls`,
and every canvas context survives — which is why `initWorkspace()` runs *after*
`wireControls()`, on DOM that was all found in its docked place first.

The **windows menu** is the one list of every window there is. The four panel
windows are listed only while windowed, since docked they are not windows;
the preset and file browsers float over either mode and register themselves
through `workspace.register({title, isOpen, setOpen})`, which is all this file
ever learns about them. So the menu exists in both modes, and a window closed
by its ✕ always has a way back.

**Documents** (`app/js/docmanager.js`) turn on the *origin*: a document opened
from a local folder remembers its folder handle and file name, so Save
overwrites it; a preset, a `.stel` or a file-input open clears the origin, so
Save falls through to Save As. A saved document is the `<name>.json` +
`<name>.json.png` pair, the same convention `docs/presets/` uses.

Storage inventory: `localStorage` keys `stell.ui.mode` (docked/windows),
`stell.win.*_params` / `_visible` (per-window geometry and visibility);
IndexedDB `stellation.files` store `handles` (root and last-subfolder directory
handles, keyed per dialog).

---

## Data

Precomputed, so the app needs no server: **121 solids** across five catalog
categories (regular, Archimedean, Archimedean duals, nonconvex uniform, duals to
uniform), **150 geometry entries**, **97 symmetry groups** with their matrices,
and Brückner's 1900 plates.

### Groups in more than one frame

A group is offered as a stellation symmetry when its matrices are literally
inside the parent's — the app tests set containment rather than trusting a
table of names (`subgroupsOf`, app.js). That is exact, but it means a group
stored in the wrong orientation is invisible even when it genuinely is a
subgroup: D3d belongs inside Ih, a triangular antiprism sitting inside an
icosahedron, but the stored D3d has its 3-fold axis along z while the
icosahedron's run along body diagonals.

So a group whose canonical frame does not fit carries the frame in brackets —
`D3d(I)`, `C5(I)`, `S6(O)` — and holds matrices taken from the parent's own.
These are ordinary entries in every other respect; nothing keys off the name,
and the symmetry-element display derives axes and mirrors from the matrices,
so an off-canonical frame draws in the right place. `docs/test/symmetry.mjs`
enumerates the full subgroup lattice of every symmetry the catalog uses and
fails if any subgroup type has no name that reaches it.

**Which copy is stored is chosen to match the camera.** Every conjugate copy of
a group inside a parent is an equally good subgroup, so the orientation is free
— and it is spent on making the named views mean something. A group tagged
`(O)` sits on an octahedral axis and a group tagged `(I)` on an icosahedral
one, in both cases the axis the identically-named view looks down:

| axis | direction | groups |
|---|---|---|
| `o3` (isometric) | (1, 1, 1) | C3(O) C3v(O) D3(O) D3d(O) S6(O) |
| `o2` | (0, 1, 1) | C2(O) D2(O) D2h(O) |
| `i5` | (1, 0, τ) | C5(I) C5v(I) D5(I) D5d(I) S10(I) |
| `i3` | (0, 1/τ, τ) | C3v(I) D3(I) D3d(I) |

Choose D5 and press `+i5` and you are looking straight down the axis the group
turns about, which is the only thing that makes either name worth having. The
cube diagonal is a 3-fold axis of the icosahedron as well — that is why the
cubic-frame C3 and S6 fit inside Ih at all — but it is the `o3` axis, so the
icosahedral-frame 3-folds are not the ones that live there. The test checks
every row of that table, and that nothing frame-tagged sits on an axis with no
name.

---

## Tests

Node harnesses, run directly with no runner. Each holds a different kind of
contract, which is why there are several rather than one:

```
node docs/test/validate.mjs    against the Java original — 42 assertions
node docs/test/facing.mjs      the solid-side invariant — 7 assertions
node docs/test/samples.mjs     the four shipped .stel files rebuild and round-trip
node docs/test/sweep.mjs       every catalog entry, for timing and failures
node docs/test/atoms.mjs       the atomic selection model and its serialization
node docs/test/docformat.mjs   document releases, plane rows, shipped presets
node docs/test/examples.mjs    the examples catalog names what it has
node docs/test/symmetry.mjs    the groups are groups, and the lattice is complete
node docs/test/icosahedra.mjs  the generated 59 are still the 59
node docs/test/icosahedra-rules.mjs   the seven rule sets, and what they share
node docs/test/zip.mjs         the archive writer, read back with node's inflate
```

**`validate.mjs` is the important one.** It holds numbers captured from a real
Java run (`vbulatov.Driver`): for the icosahedron u27 / Ih / I, 20 planes, 1,340
facets, 8 layers, cells per layer `[1, 20, 30, 60, 80, 132, 90, 60]`, and exact
volumes. It is the only thing keeping the two implementations honest.

**`facing.mjs`** asserts every boundary face has solid inside and empty outside —
and asserts its own cases exercise 242 undersides, so it cannot pass vacuously.

**`sweep.mjs`** is not a pass/fail test but a survey: it decides which catalog
entries the UI can offer without a wait and which need a depth guard.

Last run, 10 August 2026: **42 passed / 0 failed**, **7 passed / 0 failed**,
samples round-tripped identical.

---

## Conventions worth knowing

Comments explain *why*, and usually cite the failure that motivated the code —
the crossed "bow-tie" faces whose Newell normal cancels to rounding error and
needs a plane fitted to the points instead; `docs/_headers` recording an hour
lost to a cached `app.js` and naming GitHub Pages' unchangeable `max-age=600` as
the reason the site moved to Cloudflare; the diagram avoiding red and green
because those already mean remove and add in 3D. Roughly a fifth of `core.js` is
prose. Treat it as the design record, because it is.

---

## Loose ends

- **The two implementations are diverging, and the gap is widening.** The
  JavaScript has gained face-class colouring, the face/facet edge split, the
  AnimatedPointer trackball, a parallel projection and a capped-arrangement
  guard that the Java knows nothing about. Nothing checks they still agree
  beyond the frozen numbers in `validate.mjs` — and those cover the engine only,
  so none of the above is tested against anything.
- **The new view features have no test.** Colouring, edge classification and the
  trackball were each verified once by measurement — face-class counts per
  solid, edge counts per sample, drag and throw behaviour — but none of it is in
  `docs/test/`. Edge classification in particular is a pure function of the mesh
  and would sit naturally beside `facing.mjs`.
- **The UI has no automated test at all.** Windowed mode, the preset browser and
  the whole file layer were verified by driving the running app in a browser
  (including the local-file flows against the Origin Private File System standing
  in for a picked folder), but nothing re-runs those. The Node harnesses can only
  reach the engine; the DOM and File System Access paths would need a headless
  browser the repo does not set up.
- **`src/test/java` has no runner.** Ant does not compile it, and the JSweet-era
  `pom.xml` that carried the JUnit dependency was removed when that route was
  abandoned. `AppTest` and `DragProbe` are inert; `DragProbe` in particular is
  the regression test for the drag fix described in `java-drag-fix.md`, so it is
  worth restoring a way to run it.
- **Build outputs are tracked.** Both jars and the 307-file `resources/` tree
  dominate the file count against roughly 7,400 lines of JavaScript. Deliberate,
  since the jar is the distributable, but it makes the repository heavy.
- **The items under "Found on the way, not fixed" in `java-drag-fix.md`** are
  still open in the Java UI.
