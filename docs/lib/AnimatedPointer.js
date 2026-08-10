/*
 * AnimatedPointer — a virtual pointer that follows the real one on a spring.
 *
 * By Vladimir Bulatov; ported here from SymmHub
 * (lib/uilib/AnimatedPointer.js) with the physics unchanged. The only edits are
 * dropping the SymmHub `modules.js` import for a local `isDefined`, and the
 * debug logging.
 *
 * The pointer is a particle of unit mass moving in a fluid. A spring attached
 * to the real mouse position pulls it, with force proportional to the distance
 * between the two; fluid friction, proportional to speed, damps it. Browser
 * pointer events move the far end of the spring; the particle's own motion is
 * what the application should follow.
 *
 * Two things fall out of that, which are why this is worth a simulation rather
 * than a filter. During a drag the particle smooths the pointer's uneven jumps
 * — three pixels, then five — without the application having to know anything
 * about frame times. And on release the spring is simply switched off, so the
 * particle carries on at whatever speed it had: a flick coasts, at *its own*
 * speed rather than a canned one, and how long it coasts is one friction
 * number.
 *
 *   params.springForce          spring constant; sets the relaxation time
 *   params.dragFrictionFactor   friction while dragging, in units of the
 *                               critical value — 2 is critically damped, above
 *                               that is sluggish, below it rings
 *   params.freeFrictionFactor   friction during free motion, as a fraction of
 *                               the drag friction. 0 spins forever.
 *   params.timeStep             fixed integration step, seconds
 */

const MS = 0.001;                  // millisecond, in seconds
const UNDEFINED_LOCATION = -314.15925;   // some odd number
const MIN_SPEED2 = 16;             // square of the smallest speed worth calling motion (px/s)
const MAX_DELTAT = 100 * MS;       // longest interval to simulate in one go

const isDefined = v => v !== undefined && v !== null;

function AnimatedPointer(params = {}) {

  let timeStep = 1 * MS;
  let springForce = 200;           // relaxation time of about a second
  let freeFrictionFactor = 0.05;
  let dragFrictionFactor = 2.0;    // 2 is critical: larger delays relaxation, smaller oscillates

  let dragFriction = 0;
  let freeFriction = 0;

  setParams(params);

  // location and speed of the virtual pointer
  let locationX = UNDEFINED_LOCATION;
  let locationY = UNDEFINED_LOCATION;
  let speedX = 0, speedY = 0;
  let forceX = 0, forceY = 0;

  let dragState = false;
  let lastFrameTime = -1;
  let mouseX = 0, mouseY = 0;

  function setParams(p) {
    if (isDefined(p.timeStep)) timeStep = p.timeStep;
    if (isDefined(p.springForce)) springForce = p.springForce;
    if (isDefined(p.freeFrictionFactor)) freeFrictionFactor = p.freeFrictionFactor;
    if (isDefined(p.dragFrictionFactor)) dragFrictionFactor = p.dragFrictionFactor;

    dragFriction = dragFrictionFactor * Math.sqrt(springForce);
    freeFriction = freeFrictionFactor * dragFriction;
  }

  /*
   * Integrate to `timeNow` (seconds) in fixed steps.
   *
   * Fixed steps rather than one step of the frame's length: the spring is stiff
   * enough that a 16 ms explicit step is not stable, and a dropped frame would
   * otherwise change the trajectory rather than just sampling it later. The
   * clamp at MAX_DELTAT stops a backgrounded tab from being simulated in one
   * enormous burst when it comes back.
   */
  function performSimulation(timeNow) {
    if (lastFrameTime < 0) lastFrameTime = timeNow;

    const friction = dragState ? dragFriction : freeFriction;
    const deltaT = Math.min(timeNow - lastFrameTime, MAX_DELTAT);

    let t = 0;
    while (t < deltaT) {
      t += timeStep;
      let dt = timeStep;
      if (t > deltaT) { dt -= (t - deltaT); t = deltaT; }   // the last step is shorter

      forceX = -friction * speedX;
      forceY = -friction * speedY;

      if (dragState) {
        forceX += (mouseX - locationX) * springForce;
        forceY += (mouseY - locationY) * springForce;
      }

      const newSpeedX = speedX + forceX * dt;
      const newSpeedY = speedY + forceY * dt;

      // trapezoidal: average the speeds across the step
      locationX += dt * (speedX + newSpeedX) * 0.5;
      locationY += dt * (speedY + newSpeedY) * 0.5;
      speedX = newSpeedX;
      speedY = newSpeedY;
    }

    lastFrameTime = timeNow;
  }

  return {
    setParams,
    /** set the current mouse position — the far end of the spring */
    setMouse(x, y) {
      mouseX = x; mouseY = y;
      if (locationX === UNDEFINED_LOCATION) { locationX = mouseX; locationY = mouseY; }
    },
    incrementMouse(dx, dy) { mouseX += dx; mouseY += dy; },
    getMouse() { return [mouseX, mouseY]; },
    /** true while the button is down: the spring pulls only then */
    setDragState(state) { dragState = state; },
    isDragging() { return dragState; },
    /** advance the simulation to `time`, in milliseconds (performance.now) */
    calculate(time) { performSimulation(time * MS); },
    getX() { return locationX; },
    getY() { return locationY; },
    getPnt() { return [locationX, locationY]; },
    getSpeed() { return [speedX, speedY]; },
    getForce() { return [forceX, forceY]; },
    /** has the pointer been placed yet? */
    isPlaced() { return locationX !== UNDEFINED_LOCATION; },
    /** put the pointer on the mouse, discarding the lag */
    synchronize() { locationX = mouseX; locationY = mouseY; },
    /** kill the momentum, leaving the position alone */
    stop() { speedX = 0; speedY = 0; },
    isMoving() { return dragState || (speedX * speedX + speedY * speedY) > MIN_SPEED2; },
  };
}

export { AnimatedPointer };
