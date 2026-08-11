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
  app/js/       1,800 loc    the application
  js/           1,600 loc    scripts for the essay pages
  data/           710 KB     catalog, geometry, symmetry, Brückner plates
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

`docs/app/js/worker.js` owns the built structure and answers seven messages:

```
build       the expensive one; keeps `stel` and the plane→class map
mesh        boundary surface for a selection
diagram     one plane's regions for a selection
both        the two above in one round trip — what the app actually uses
parseCells  a .stel selection string to keys
formatCells keys back to a .stel string
layerKeys   every sub-cell key in the first n layers
```

Selection changes are cheap, so only `build` rebuilds. Everything else reads the
structure already in the worker. Selections are sets of `"layer.cell.sub"`
strings, which is also the exchange format with the UI.

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

### Two colourings

Chosen in the View panel, saved under `params.display.colorMode`: **by shell**, a
hue per layer outward from the core; and **by face class**, a hue per symmetry
class of original face, undersides darkened. An icosahedron has one class and so
takes two colours. The diagram follows the same choice — it is drawn on one
plane, so by class it takes that plane's colour and the only variation left is
the above/below split.

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

## Data

Precomputed, so the app needs no server: **121 solids** across five catalog
categories (regular, Archimedean, Archimedean duals, nonconvex uniform, duals to
uniform), **150 geometry entries**, **85 symmetry groups** with their matrices,
and Brückner's 1900 plates.

---

## Tests

Four Node harnesses, run directly with no runner. Each holds a different kind of
contract, which is why there are four rather than one:

```
node docs/test/validate.mjs    against the Java original — 42 assertions
node docs/test/facing.mjs      the solid-side invariant — 7 assertions
node docs/test/samples.mjs     the four shipped .stel files rebuild and round-trip
node docs/test/sweep.mjs       every catalog entry, for timing and failures
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
