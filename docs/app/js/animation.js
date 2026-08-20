/*
 * The turntable.
 *
 * A solid spinning about an axis of its own — set the axis along one of the
 * figure's symmetry axes and it revolves about itself, which is the way these
 * things are actually looked at. The axis is given in the SOLID's frame, so it
 * holds still on screen while the model goes round it: the spin quaternion is
 * post-multiplied onto the view, applied to the model before the camera ever
 * sees it.
 *
 * And "save to video": exactly one full turn from the current angle, recorded
 * off the live canvas. One turn because a turn is a loop — the last frame
 * meets the first, so the file can play on repeat without a seam, which is
 * what a turntable video is for. The rotation is driven by the recording
 * clock, not the free-running spin, and is put back exactly where it started.
 *
 * Nothing here is saved into documents. The axis and speed persist in
 * localStorage like the edge style; `enabled` deliberately does not — a page
 * that starts spinning the moment it loads is a surprise, not a preference.
 */

import { hasFSAccess, writeFile, createFolderChooser } from '../../lib/uilib/files.js';

const $ = (sel) => document.querySelector(sel);

const STORE_KEY = 'stell.animation';
const TAU = Math.PI * 2;

// Hamilton product, [x, y, z, w] — matches quatToMat4's reading in render3d
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qnorm = (q) => {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
};
const aboutAxis = (a, angle) => {
  const s = Math.sin(angle / 2);
  return [a[0] * s, a[1] * s, a[2] * s, Math.cos(angle / 2)];
};

/*
 * The candidate encodings per container, best first. Which of them exist is
 * the browser's business: Chromium encodes both, Firefox only WebM, and the
 * answer comes from isTypeSupported rather than from guessing at versions.
 */
const VIDEO_MIMES = {
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'],
};
const mimeFor = (fmt) => typeof MediaRecorder === 'undefined' ? null
  : (VIDEO_MIMES[fmt] || []).find(m => MediaRecorder.isTypeSupported(m)) || null;

export function initAnimation({ renderer, currentName, setStatus }) {
  const on = $('#animOn'), axisIn = $('#animAxis'), speedIn = $('#animSpeed');
  const fmtSel = $('#animFormat'), videoBtn = $('#animVideo'), info = $('#animInfo');
  if (!on || !renderer) return null;

  /*
   * An option the browser cannot encode is disabled rather than removed: a
   * menu that silently loses an entry looks broken, where a greyed MP4 with
   * the tooltip above it says whose limitation it is.
   */
  for (const o of fmtSel.options) {
    if (!mimeFor(o.value)) { o.disabled = true; o.textContent += ' — not in this browser'; }
  }

  /*
   * The axis, from whatever was typed. Any three numbers separated by
   * anything: "0 1 0", "1,0,1.618", "0.5, -1, 2e-1" all read. Null when the
   * field does not hold three finite numbers with some length between them —
   * the caller says why, rather than spinning about a guess.
   */
  function parseAxis() {
    const nums = (axisIn.value.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (nums.length !== 3 || nums.some(v => !Number.isFinite(v))) return null;
    const n = Math.hypot(nums[0], nums[1], nums[2]);
    if (n < 1e-12) return null;
    return [nums[0] / n, nums[1] / n, nums[2] / n];
  }
  const speedOf = () => {
    const v = Number(speedIn.value);
    return Number.isFinite(v) ? Math.max(-2, Math.min(2, v)) : 0;
  };

  // ---- the free spin -----------------------------------------------------

  let raf = null, lastT = 0, recording = false;

  function tick(t) {
    raf = null;
    if (!on.checked || recording) return;
    const axis = parseAxis(), speed = speedOf();
    if (axis && speed) {
      // dt is clamped: a background tab hands back seconds of it at once,
      // and the figure should resume, not leap
      const dt = Math.min(0.1, (t - lastT) / 1000);
      renderer.rotation = qnorm(qmul(renderer.rotation, aboutAxis(axis, TAU * speed * dt)));
      renderer.draw();
    }
    lastT = t;
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (raf) return;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // ---- one turn, into a file ---------------------------------------------

  const canRecord = typeof MediaRecorder !== 'undefined' &&
                    !!renderer.canvas?.captureStream;

  /*
   * Where the videos go: the same remembered-folder machinery the two export
   * dialogs use — asked once, kept in IndexedDB, changed from its own button.
   * Its own key, so plates, models and videos can each have their place.
   */
  const folders = createFolderChooser({
    key: 'stell.animation.folder', pickerId: 'stellation-videos',
  });
  async function showFolder() {
    if (!hasFSAccess()) return;
    const folder = await folders.current();
    const where = $('#animWhere');
    if (where) {
      where.textContent = folder ? folder.name : 'you will be asked once';
      where.classList.toggle('dim', !folder);
    }
  }

  async function recordTurn() {
    const axis = parseAxis(), speed = speedOf();
    if (!axis) { info.textContent = 'the axis needs three numbers, e.g. 0 1 0'; return; }
    if (!speed) { info.textContent = 'a turn at speed 0 never ends — set a speed first'; return; }

    const mime = mimeFor(fmtSel.value);
    if (!mime) { info.textContent = `this browser cannot encode ${fmtSel.value}`; return; }

    /*
     * The folder first, while the click's user activation still holds — a
     * recording takes seconds and the picker would be refused after it. A
     * dismissed picker cancels the recording before any work is done.
     */
    let dir = null;
    if (hasFSAccess()) {
      try { dir = await folders.choose(); }
      catch (err) { info.textContent = err && err.message ? err.message : String(err); return; }
      if (!dir) { info.textContent = ''; return; }
      showFolder();
    }

    recording = true;
    videoBtn.disabled = true;
    const q0 = renderer.rotation.slice();
    const T = 1 / Math.abs(speed);
    const chunks = [];
    /*
     * captureStream(0): frames are pushed by hand, one requestFrame() right
     * after each draw, rather than harvested from the compositor. Left to the
     * compositor, a canvas that is not being composited — an occluded window,
     * some embedded views — records a valid, empty file: a webm of nothing,
     * which is exactly what this produced before the change. Pushing by hand
     * also means the recording cannot miss a frame the loop drew.
     */
    const stream = renderer.canvas.captureStream(0);
    const track = stream.getVideoTracks()[0];
    const pushFrame = () => track.requestFrame?.();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const finished = new Promise((resolve) => { rec.onstop = resolve; });
    rec.start();

    /*
     * The angle comes from the FRAME COUNT: one turn is a fixed number of
     * frames, each exactly its share of the circle, whatever the wall clock
     * did between them. Driven by time, a slow machine dropped the frames it
     * could not render and the video jerked past them; counted, it just takes
     * longer to record, and every frame is in the file — a perfectly even
     * turn on any machine. That trade is right for a recording (nobody minds
     * a slow export, everybody minds a jerky video) and wrong for the live
     * spin above, which stays clock-driven for the same reason in reverse.
     *
     * The last frame is one step SHORT of 2π, not on it: the frame at 2π is
     * the frame at 0 again, and a loop that repeats its seam frame plays with
     * a stutter every time round.
     *
     * Pacing: never ahead of real time, so a fast machine records one turn in
     * one turn's time and the file plays at the speed asked for; behind is
     * let be. And each wait is a rAF raced against a timer, because rAF alone
     * stops when the tab is covered — that froze the recorder with the button
     * dead — while drawing and requestFrame() work fine without a compositor.
     */
    const FPS = 60;
    const frames = Math.max(8, Math.round(FPS * T));
    const frameMs = 1000 * T / frames;
    const waitUntil = (deadline) => new Promise((resolve) => {
      const poke = () => {
        if (performance.now() >= deadline) { resolve(); return; }
        let called = false;
        const once = () => { if (!called) { called = true; poke(); } };
        requestAnimationFrame(once);
        setTimeout(once, 250);
      };
      poke();
    });
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      renderer.rotation = qnorm(qmul(q0, aboutAxis(axis, TAU * (i / frames) * Math.sign(speed))));
      renderer.draw();
      pushFrame();               // hand this exact frame to the encoder
      info.textContent = `recording — frame ${i + 1} of ${frames}`;
      await waitUntil(t0 + (i + 1) * frameMs);
    }
    // a beat for the encoder to take the closing frame, then stop
    await new Promise(r => setTimeout(r, 120));
    rec.stop();
    await finished;
    stream.getTracks().forEach(t => t.stop());

    // the turn is a full circle, but put the exact quaternion back anyway
    renderer.rotation = q0;
    renderer.draw();
    recording = false;
    videoBtn.disabled = false;

    const blob = new Blob(chunks, { type: mime.split(';')[0] });
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const stem = (currentName() || 'stellation')
      .replace(/\.(json|stel|txt)$/i, '').toLowerCase().normalize('NFD')
      .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'stellation';
    const fname = `${stem}-turn.${ext}`;
    if (dir) {
      await writeFile(dir, fname, blob);
      setStatus(`saved ${fname} in ${dir.name} — one turn, ${frames} frames`);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      setStatus(`saved ${fname} — one turn, ${frames} frames`);
    }
    sync();
    if (on.checked) start();       // hand the wheel back to the free spin
  }

  // ---- wiring ------------------------------------------------------------

  function sync() {
    const axis = parseAxis(), speed = speedOf();
    axisIn.classList.toggle('invalid', !axis);
    if (recording) return;                       // the recorder owns the line
    const encodable = canRecord && !!mimeFor(fmtSel.value);
    info.textContent = !axis
      ? 'the axis needs three numbers, e.g. 0 1 0'
      : !speed
        ? ''
        : `one turn = ${(1 / Math.abs(speed)).toFixed(1)} s` +
          (encodable ? '' : ` — this browser cannot record ${fmtSel.value}`);
    videoBtn.disabled = !encodable || recording || !axis || !speed;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        axis: axisIn.value, speed: speedIn.value, format: fmtSel.value,
      }));
    } catch { }
    if (on.checked) start();
  }

  // axis and speed come back; `enabled` starts off, always
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) {
      if (typeof saved.axis === 'string') axisIn.value = saved.axis;
      if (saved.speed !== undefined) speedIn.value = saved.speed;
      // a remembered format this browser cannot encode falls back silently
      if (saved.format && mimeFor(saved.format)) fmtSel.value = saved.format;
    }
  } catch { }
  if (!mimeFor(fmtSel.value) && mimeFor('webm')) fmtSel.value = 'webm';

  for (const c of [on, axisIn, speedIn, fmtSel]) c.addEventListener('input', sync);
  const whereRow = $('#animWhereRow');
  if (whereRow) whereRow.hidden = !hasFSAccess();
  const changeBtn = $('#animChangeFolder');
  if (changeBtn) {
    changeBtn.onclick = async () => {
      try { await folders.choose(true); } catch (err) {
        info.textContent = err && err.message ? err.message : String(err);
      }
      showFolder();
    };
  }
  showFolder();
  videoBtn.onclick = () => { recordTurn().catch(err => {
    recording = false; videoBtn.disabled = false;
    info.textContent = err && err.message ? err.message : String(err);
  }); };
  sync();

  return {
    /** the spin, for anything that needs to hold it still for a moment */
    isSpinning: () => on.checked && !!parseAxis() && speedOf() !== 0,
  };
}
