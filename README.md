
# Stellation "Applet"

### ▶ **[Try it live](https://vbulatov2011.github.io/stellation/)** — runs in the browser, no install

This project has been ported from Java to Javascript, to run in the web.
The original Java code ran as an applet, but of course that is now impossible.
The Javascript version is in `docs/`; the original Java still builds and runs as
a desktop app.  Both are described below, after the original README.

## Original README

This is source code of the stellation applet. 
The applet and the source web site is: 
[www.bulatov.org/polyhedra/stellation_applet/index.html](https://www.bulatov.org/polyhedra/stellation_applet/index.html)

The source code is indented for people, who wish to modify or extend the applet 
functionality. It is not needed to run the applet. 

To build the applet, you need to have java JDK installed on your system. 

makeall.bat on Windows system will compile everything and create 
executable stellation.jar file. 

Several people's work was used in the applet code. 
In particular, 
Fmt package by Jef Poskanzer, 
Math expression parser by Darius Bacon, 
Jama matrix package by Jama team, 
Paul Prants helped to extended incomplete Symmetry class. 

I apologize if I've forgot somebody. 

Vladimir Bulatov

## Running the original Java version locally

Browsers can no longer run applets, but the original code was never applet-only:
`pvs.polyhedra.stellation.ui.StellationMain` has a `main()` and opens plain AWT
windows.  So it still runs as an ordinary desktop app.

You need a **JDK** (8 or later — a JRE is not enough, the build needs `javac`)
and **Ant**.

### On Windows: just run the batch files

```bash
ant-build.bat
```
Full rebuild, leaving `stellation-app.jar` next to it.  Then:
```bash
ant-run.bat
```
to build and launch.  Both take arguments — `ant-build.bat jar` for a specific
target, `ant-run.bat -i off/u27.off -y I` for the app's own options.

Neither needs anything set up first: `ant-env.bat` (which they both call) hunts
down a JDK under `C:\Program Files\Java` or Eclipse Adoptium, and an Ant under
`D:\home\utils`, `C:\apache-ant-*`, `C:\Program Files\apache-ant-*`, or your
`PATH`.  Set `JAVA_HOME` or `ANT_HOME` yourself and it uses those instead.
They are double-click safe — they `pause` at the end and on failure, so the
window sticks around long enough to read.

### The Ant build itself

`build.xml` is the real build; the batch files above are just a wrapper that
sets `JAVA_HOME` and `ANT_HOME` for you.  Invoking Ant directly, do that part
yourself first — without a JDK in `JAVA_HOME`, Ant reports "Unable to find a
javac compiler":
```bash
set JAVA_HOME=C:\Program Files\Java\jdk1.8.0_221
```

| command | what it does |
|---|---|
| `ant` | default target — compiles and builds `stellation-app.jar` |
| `ant clean build` | full rebuild from scratch |
| `ant run` | builds the jar and launches the app |
| `ant runMain -Dclass=`*fqcn* | runs any class against `cls` + `resources` |

`compile` builds `src/main/java` (the portable core) and `src/ui/java` (the AWT
front end) into `cls/`.  `src/jsweet/` is deliberately excluded — those are stub
classes that shadow `java.awt`/`java.io` for the Javascript transpile only, and
they break a normal compile.

`jar` then packages `cls/` together with `resources/images`, producing
`stellation-app.jar`.  The images have to be *inside* the jar: the code reads
them back out with `getResourceAsStream("/images/off/u27.off")` and friends.

Pass arguments through with `-Dargs=`:
```bash
ant run -Dargs="-i off/u27.off -y I"
```

### The resulting jar

`stellation-app.jar` is self-contained — nothing else needs to sit beside it.
Double-click it, or:
```bash
java -jar stellation-app.jar
```

On Windows, double-clicking works when `.jar` is associated with `javaw.exe` —
installing any Oracle/Adoptium JRE sets that up.  Check with `assoc .jar` and
`ftype jarfile`.  Note that `javaw` has no console, so the diagnostic output the
app normally prints goes nowhere; run it from a terminal with `java -jar` when
you want to see it.

`main()` takes `-i` for the `.off` polyhedron file and `-y` for the stellation
symmetry (default `I`).

### Without Ant

`run.bat` (or `./run.bash` on macOS/Linux/Git Bash) compiles and launches the
app with nothing but a JDK — straight from `bin/`, skipping the jar step.  It is
the quickest edit-and-see loop; use Ant when you want the jar.

Or by hand:
```bash
javac -d bin -encoding UTF-8 $(find src/main/java src/ui/java -name '*.java')
java -Xmx512M -cp "bin;resources" pvs.polyhedra.stellation.ui.StellationMain
```
`resources` must be on the classpath, for the same `getResourceAsStream` reason.
(Use `bin:resources` with a colon on macOS/Linux.)

### The old jar

There is also a prebuilt `stellation.jar` from 2001 in this folder, which runs
with no build step at all via `stellation.bat` (or `java -jar stellation.jar`).
It is an old snapshot of the code (package `PVS`, not `pvs`) and predates
everything in `src/`, so prefer `stellation-app.jar` when working on the source.
The build deliberately does not overwrite it.

## The Javascript version

**Live at <https://vbulatov2011.github.io/stellation/>** — this repository's
GitHub Pages, built from `main`, folder `/docs`.

The web version lives in `docs/` — a hand port of the stellation core to ES
modules, written against the Java as reference rather than translated from it.
`docs/lib/core.js` is the port proper (`pvs.polyhedra.Stellation`, `SCell`,
`SSCell`, `SFace`); `app/js/app.js` drives the page, `app/js/worker.js` runs the
expensive plane arrangement off the main thread.

`docs/index.html` is the landing page — a short description and a card for each
of the other pages.  The app itself is `docs/stellation_app.html`, and it keeps
its whole state in the URL hash, so any view can be linked to.  Links made
before the app moved still work: the landing page forwards a hash that looks
like app state and leaves every other visit alone.

There is no build step — the files served are the files you edit.  It does need
a real web server, though, not `file://`: the page uses ES modules, a module
Worker, and `fetch` for `data/*.json`, all of which are blocked on `file://`.

```bash
python -m http.server 8000 --directory docs
```
then open http://localhost:8000.  Any static server will do.

`docs/_headers` is the cache policy for Cloudflare Pages, where the site is
deployed; it has no effect locally.

### Windows, presets and local files

The app can run its panels docked (the default) or as floating internal windows
— a header toggle switches between them, and a phone is always docked.  The
window system is `docs/lib/uilib/`, an adapted port of the same library in the
sibling SymmHub project.

Ready-made documents live in `docs/presets/`: each is a `<name>.json` with a
`<name>.json.png` thumbnail beside it, listed in the manifest `docs/presets.json`
(whose paths are relative to itself).  To add one, save a document, render its
thumbnail (the app's `Save As…` does both at once, or use
`stellation.downloadThumb(name)` from the console), drop the pair into
`docs/presets/`, and add a line to the manifest.

Every window — the panels, the preset browser, the file browser — is listed in
the header's **windows menu**, which is where a window closed with its ✕ is
reopened.  The panel windows appear there only in windowed mode.

Local-file support depends on the browser:

| | Chrome / Edge | Firefox / Safari / mobile |
|---|---|---|
| Open a `.json` / `.stel` | file picker | file picker |
| Save | over the file, or download | download |
| Browse a folder, previews, Save As, Save-in-place | yes | — (buttons hidden) |

The folder features use the File System Access API, which only Chromium has;
everywhere else they are absent and Save is a plain download.  Server presets
work in every browser.

An earlier attempt machine-translated the Java with the
[JSweet transpiler](https://www.jsweet.org/).  That route was abandoned in
favor of the hand port and its files have been removed; it is in the history if
you ever want it back.
