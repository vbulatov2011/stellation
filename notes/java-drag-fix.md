# The Java app: the solid disappears while you drag it

Reported as *"the rotation in java is broken, it disappears after I drag a bit"*.
Diagnosed, fixed and verified on 7 August 2026. Regression test:
`src/test/java/pvs/g3d/ui/DragProbe.java`.

---

## What was happening

macOS reports the pointer in **whole logical points**. On a 2× Retina display
every movement smaller than one logical point lands on the same integer
coordinate as the one before it, and `LWWindowPeer` does not drop the duplicate
— so a slow, careful drag routinely delivers a `mouseDragged` event with
`dx == dy == 0`. Measured on this machine: about **one drag event in ten** on
ordinary movement, and **15 out of 24** on deliberately fine movement.

`Canvas3D.mouseDragged` built its rotation axis from that delta:

```java
spinAxis = new Vec3(dy, -dx, 0);
spinAxis.normalize();
Matrix3D rotation = new Matrix3D(spinAxis, angle);
m_curMatrix.mul(rotation);
```

With a zero delta that axis has zero length. `Vec3.normalize()` divided by it
with no guard, giving `(NaN, NaN, NaN)`. The `Matrix3D` axis-angle constructor
normalized it a *second* time — equally unguarded — and filled all twelve cells
with NaN. `Matrix3D.mul` mutates in place, so the accumulated view matrix became
NaN **permanently**: every later drag multiplies into an already-poisoned
matrix, and nothing short of *Reset* recovers it.

### Why it looks like a disappearance rather than a crash

`Matrix3D.transform` writes transformed vertices into an `int[]`, and in Java
`(int) Double.NaN` is `0`. So every vertex of the solid lands on the same pixel.
The probe printed exactly this against the old build:

```
!!! spinAxis NaN. angle=0.0  rotation.xx=NaN  m_curMatrix.xx=NaN yy=NaN
    transformed unit points -> [0,0,0 | 0,0,0 | 0,0,0]
```

Nothing throws, nothing is logged, the window just goes empty.

---

## The fix

Three layers, because the same degenerate input arrives at three places.

**1. `pvs/g3d/Matrix3D.java` — the axis-angle constructor.** A zero or NaN axis
now yields the identity. Rotating about no axis at all is not an error the
caller can recover from; it is simply no rotation. The guard has to be here as
well as in `Vec3`, because this constructor re-normalizes independently of
whatever the caller did, and because for a zero axis the right answer is the
identity, not `diag(cos θ)`. The axis is also copied rather than normalized in
place, removing a hidden side effect on the caller's vector.

**2. `pvs/g3d/Vec3.java` — `normalize()`.** A zero-length vector is left alone
instead of divided by zero. This is the only NaN factory in the geometry layer
and it has around ninety call sites; the sibling class
`pvs.polyhedra.Vector3D.normalize()` has always had this guard, so the two now
agree.

**3. `pvs/g3d/ui/Canvas3D.java` — `mouseDragged`.** Returns immediately when
`dx == dy == 0`. Needed *in addition* to the guards above: with them the matrix
stays finite, but carrying on would still overwrite the remembered spin axis
with a degenerate one and feed a zero sample into the flick-speed average, so a
flick would lose the direction it was thrown in. Deliberately does **not** touch
`m_mouseDownTime` on the way out — position and time must stay anchored to the
same instant, or the next event measures its distance from here and its elapsed
time from now, and the flick comes out too fast.

## Also fixed, in the same machinery

- **A modifier-press did not stop a running spin.** `mousePressed` only cleared
  the spin state for a *plain* left press, while `mouseClicked` had always
  cleared it unconditionally. Since toggling a cell requires a modifier, the one
  gesture that edits the model was the one that could not stop the model moving:
  measured at half a radian of drift over a tenth of a second, so the cell you
  hit was not the cell you aimed at. Now any press stops the spin.

- **A click on the zoom buttons killed a running spin.** `eventCallback` is a
  single slot shared by the spin and both zoom autorepeats, and the zoom
  listeners cleared it outright on release even when it belonged to the spin.
  They now only release the slot if they still hold it. (`mouseDown` is what
  actually ends a zoom autorepeat, so nothing else changes.)

- **The frame-time average was never reset between spins.** `averageDt` is a
  field on the one listener of the one `Canvas3D`, reused for the life of the
  program and across every change of model. The first frames of a spin applied
  20%, then 36%, then 49% of the rotation they should have; a spin inherited
  from a heavy stellation over-rotated a light model's first frame roughly five
  times over. It is now seeded from the first real sample of each spin.

## One deliberate behaviour change

`spinSpeedCutoff` was `0.001` rad/s — about one turn per hundred minutes, which
is no threshold at all. A careful one-pixel-per-tenth-second positioning drag
measures `0.019`, twenty times over the line, so **every** drag left the solid
turning by itself and it would slowly wander off the view you had just set up.
Raised to `0.3`, so a flick spins it and placing it does not.

This is a feel setting, not a defect: turn it down if spins are too hard to
start, up if they still trigger accidentally. One line, `Canvas3D.java`.

Explicitly **not** added: friction. The undamped constant-rate flick is the
intended behaviour — "a real flick keeps the solid spinning until you catch it".
Only the threshold was wrong.

---

## Verification

`DragProbe` drives the real `Canvas3D` listener with synthetic `MouseEvent`s,
including the zero-delta one, so the case is exercised deterministically rather
than by waiting for the timing to line up. Against the two builds:

```
############ ORIGINAL ############
  drag -> (113,108)  <-- ZERO DELTA   matrix NaN = true
FAIL: view matrix destroyed

############ FIXED ############
  drag -> (113,108)  <-- ZERO DELTA   matrix NaN = false
PASS: matrix finite through the zero-delta event and after it
```

Also confirmed by hand in the running app: dragging the icosahedron through
several dozen fine movements now rotates it smoothly and it stays on screen.

---

## Found on the way, not fixed

These came out of the same investigation and are real, but are separate changes
rather than part of the drag fix:

- **Face picking is in `mouseClicked`, which macOS never delivers after a drag.**
  `LWWindowPeer` clears the pending-click bit on any `MOUSE_DRAGGED`, so a
  one-pixel wobble between press and release silently cancels the cell toggle.
  The fix is to pick in `mouseReleased`, gated on travel since press — but it
  needs *new* press-point fields, because `m_mouseDownX/Y` are overwritten by
  every drag event.

- **The back buffer is sized from the enclosing `Panel` but blitted into the
  inner canvas.** Measured 600×568 against 600×537: the model sits 16 px low,
  the bottom 31 rows are clipped, and `findFaceAtPoint` mis-picks by the same
  16 px. `StellationCanvas` already uses the canvas size, showing the intent.

- **`BUTTON3_MASK == META_MASK == 4`,** so Cmd+left-click opens the cell popup in
  `StellationCanvas`. Note that the obvious fixes are wrong here: on macOS a real
  right-button release reports `isPopupTrigger() == false` and
  `getModifiersEx() == 0`, so both of those would make the popup unreachable.
  `e.getButton() != MouseEvent.BUTTON3` is the one that works.
