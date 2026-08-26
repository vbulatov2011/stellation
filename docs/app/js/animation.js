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

import { hasFSAccess, writeFile, createFolderChooser, fileExists } from '../../lib/uilib/files.js';

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
  const playBtn = $('#animPlay'), rewindBtn = $('#animRewind'), recBtn = $('#animRecord');
  const timeIn = $('#animTime'), clock = $('#animClock');
  const axisIn = $('#animAxis'), durIn = $('#animDuration');
  const fmtSel = $('#animFormat'), info = $('#animInfo');
  const sizeSel = $('#animSize'), customRow = $('#animCustomRow');
  const wIn = $('#animW'), hIn = $('#animH');
  if (!playBtn || !renderer) return null;

  /*
   * The video's resolution: a preset, or the custom fields. Everything is
   * snapped to the NEAREST even number — 4:2:0 video pads an odd side and
   * some players show the padding, which is the VLC glitch all over again —
   * and the snapped value is written back into the field on change, so what
   * the field says is what the file will be.
   */
  const even = (v, lo, hi) => Math.max(lo, Math.min(hi, 2 * Math.round(v / 2)));
  function videoSize() {
    if (sizeSel.value !== 'custom') {
      const [w, h] = sizeSel.value.split('x').map(Number);
      return { w, h };
    }
    return {
      w: even(Number(wIn.value) || 1920, 16, 7680),
      h: even(Number(hIn.value) || 1080, 16, 4320),
    };
  }
  for (const [inp, lo, hi] of [[wIn, 16, 7680], [hIn, 16, 4320]]) {
    inp.addEventListener('change', () => {
      const v = Number(inp.value);
      if (Number.isFinite(v)) inp.value = even(v, lo, hi);
    });
  }

  /*
   * What the file is called: the name field, or — left empty — the document's
   * name with "-turn" on it. The placeholder shows the default, so an empty
   * field is not a mystery, and everything is slugged the way the exports
   * slug: a document's title is a good title and a poor filename.
   */
  const nameIn = $('#animName');
  const slug = (s) => (s || '').replace(/\.(json|stel|txt)$/i, '')
    .toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stem = () => slug(nameIn.value) || `${slug(currentName()) || 'stellation'}-turn`;

  /*
   * An option the browser cannot encode is disabled rather than removed: a
   * menu that silently loses an entry looks broken, where a grayed MP4 with
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
  /*
   * One turn's length, in seconds. It replaced turns-per-second, which read
   * backwards for the thing anybody actually decides — how long the video
   * should be — and carried the spin's direction in its sign, where it was
   * easy to set by accident. A turn has a length, not a sign; to go the other
   * way, negate the axis, which is where direction belongs.
   */
  const durationOf = () => {
    const v = Number(durIn.value);
    return Number.isFinite(v) && v >= 0.2 ? Math.min(600, v) : 10;
  };



  // ---- the turn, as a position in it -------------------------------------

  /*
   * The spin used to be incremental: each frame multiplied the rotation by a
   * little more turn. That cannot answer "where am I?", so it could not have
   * a scrubber — and it drifted, since a thousand small multiplications do
   * not land exactly back where they started.
   *
   * So the turn is now a POSITION. `phase` runs 0..1 over one full turn and
   * is the only state; the orientation is computed from it against `base`,
   * the orientation at phase 0. Playing advances the phase, rewinding sets it
   * to 0, and the slider both shows it and sets it — all three are the same
   * operation on one number, which is why they agree.
   *
   * `base` re-anchors when anything else moves the model. Dragging the solid
   * while the turn sits at 0.3 should not throw the turn away, so the drag is
   * read as a new base at the current phase: base = rotation · turn(phase)⁻¹.
   * Without it, the next frame would snap the model back and the trackball
   * would feel dead while the animation section was open.
   */
  let raf = null, lastT = 0, recording = false, playing = false;
  let phase = 0;
  let base = renderer.rotation.slice();
  let applied = null;                     // the rotation we last wrote, to spot drags
  let appliedPhase = 0;                   // and the phase it was written at

  const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const turnAt = (axis, ph) => aboutAxis(axis, TAU * ph);

  /** the orientation this phase means, and the state that says we set it */
  function applyPhase() {
    const axis = parseAxis();
    if (!axis) return;
    reanchor(axis);
    renderer.rotation = qnorm(qmul(base, turnAt(axis, phase)));
    applied = renderer.rotation.slice();
    appliedPhase = phase;
    renderer.draw();
  }

  /**
   * If someone else turned the model, keep the phase and move the base.
   *
   * The undoing has to use the phase the model was LAST DRAWN at, not the one
   * being asked for now. Using the new phase makes the whole thing a no-op —
   * base = r·turn(p)⁻¹ followed by base·turn(p) is r again — which is exactly
   * what happened: dragging the slider moved the number and left the figure
   * sitting still.
   */
  function reanchor(axis) {
    const r = renderer.rotation;
    if (!applied) { base = r.slice(); return; }   // nothing spun yet: this IS phase 0
    if (applied.every((v, i) => Math.abs(v - r[i]) < 1e-9)) return;
    base = qnorm(qmul(r, qconj(turnAt(axis, appliedPhase))));
  }

  function setPhase(ph, fromSlider) {
    phase = ((ph % 1) + 1) % 1;           // one turn, wrapped
    if (!fromSlider && timeIn) timeIn.value = String(phase);
    if (clock) clock.textContent = `${(phase * durationOf()).toFixed(1)}s`;
    applyPhase();
  }

  function tick(t) {
    raf = null;
    if (!playing || recording) { lastT = t; return; }
    // dt is clamped: a background tab hands back seconds of it at once,
    // and the figure should resume, not leap
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    setPhase(phase + dt / durationOf());
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (raf || !playing) return;
    lastT = performance.now();
    raf = requestAnimationFrame(tick);
  }
  function setPlaying(v) {
    playing = !!v && !!parseAxis();
    if (playing) start();
    else if (raf) { cancelAnimationFrame(raf); raf = null; }
    syncTransport();
  }

  /** the three buttons, saying what they will do next */
  function syncTransport() {
    playBtn.innerHTML = playing ? '&#9208;' : '&#9654;';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    playBtn.title = playing ? 'Pause the turn where it is'
                            : 'Play the turn from where the slider is. Click again to pause.';
    playBtn.disabled = recording || !parseAxis();
    rewindBtn.disabled = recording;
    if (timeIn) timeIn.disabled = recording;
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
    const axis = parseAxis();
    if (!axis) { info.textContent = 'the axis needs three numbers, e.g. 0 1 0'; return; }

    const mime = mimeFor(fmtSel.value);
    if (!mime) { info.textContent = `this browser cannot encode ${fmtSel.value}`; return; }
    const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
    const fname = `${stem()}.${ext}`;

    /*
     * The folder first, while the click's user activation still holds — a
     * recording takes seconds and the picker would be refused after it. A
     * dismissed picker cancels the recording before any work is done, and so
     * does declining to overwrite: the name is known now, so a clash is a
     * question to ask before seconds of recording, not after.
     */
    let dir = null;
    if (hasFSAccess()) {
      try { dir = await folders.choose(); }
      catch (err) { info.textContent = err && err.message ? err.message : String(err); return; }
      if (!dir) { info.textContent = ''; return; }
      showFolder();
      if (await fileExists(dir, fname) &&
          !window.confirm(`${fname} already exists in ${dir.name} — overwrite it?`)) {
        info.textContent = 'not recorded — give it another name';
        return;
      }
    }

    recording = true;
    recBtn.disabled = true;
    syncTransport();
    const wasPlaying = playing;
    playing = false;                        // one turn, recorded, not two at once
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    const phase0 = phase;
    const T = durationOf();
    const chunks = [];
    /*
     * The turn is RENDERED at the video's own resolution, not scaled up from
     * the window: the view canvas's backing store is set to the chosen size
     * for the duration — its CSS box does not move, ResizeObserver watches
     * only that, and draw() takes its viewport and aspect from the backing
     * store — so a 4K file is genuinely 4K sharp and framed as 4K, and the
     * live canvas is put back afterwards, exactly as squareImage() does for
     * thumbnails. The sizes are even by construction: 4:2:0 video pads an
     * odd side and marks it as crop, and players that mishandle the crop
     * show it — VLC's end-of-file black flash was exactly that.
     *
     * The staging canvas is still there, because the WebGL context has no
     * preserveDrawingBuffer: each frame is blitted in the same task that
     * drew it, while the buffer still holds it, and captureStream(0) with a
     * hand-pushed requestFrame() per blit means the recording cannot miss a
     * frame the loop drew — nor record a thing when the compositor is not
     * looking, which once produced a valid webm of nothing.
     */
    const { w: VW, h: VH } = videoSize();
    const src = renderer.canvas;
    const kept = { w: src.width, h: src.height, style: src.getAttribute('style') };
    /*
     * While it records, the canvas SHOWS the video: its element is letterboxed
     * to the video's aspect inside the box it normally fills, so what you
     * watch during the turn is the framing the file is getting — not the
     * video squashed into whatever shape the window is. The renderer's own
     * resize is locked first, because the ResizeObserver fires on exactly
     * this style change and would put the backing store right back.
     */
    renderer.lockSize = true;
    const boxW = src.clientWidth, boxH = src.clientHeight;
    if (boxW > 4 && boxH > 4) {
      const sc = Math.min(boxW / VW, boxH / VH);
      const dw = Math.round(VW * sc), dh = Math.round(VH * sc);
      src.style.left = Math.round((boxW - dw) / 2) + 'px';
      src.style.top = Math.round((boxH - dh) / 2) + 'px';
      src.style.width = dw + 'px';
      src.style.height = dh + 'px';
    }
    src.width = VW; src.height = VH;
    const stage = document.createElement('canvas');
    stage.width = VW;
    stage.height = VH;
    const stageCtx = stage.getContext('2d');
    const stream = stage.captureStream(0);
    const track = stream.getVideoTracks()[0];
    /*
     * Each frame lands on a filled stage, not on the last one.
     *
     * The view canvas draws onto nothing now — its backdrop is the element's
     * CSS, which drawImage cannot see — and video carries no alpha anyway. So
     * the stage is painted with the renderer's own background first; without
     * it the transparent parts of every frame would keep whatever the stage
     * held before, which is the previous frame, smeared behind the new one.
     */
    const bg = renderer.background || [0, 0, 0];
    const backdrop = 'rgb(' + bg.map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)).join(',') + ')';
    const pushFrame = () => {
      stageCtx.fillStyle = backdrop;
      stageCtx.fillRect(0, 0, VW, VH);
      stageCtx.drawImage(src, 0, 0);
      track.requestFrame?.();
    };
    // roughly a tenth of a bit per pixel per frame: ~12 Mb/s at 1080p60, more at 4K
    const bits = Math.min(60e6, Math.max(8e6, VW * VH * 6));
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bits });
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
    try {
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) {
        // through setPhase, so the slider and the clock follow the recording
        setPhase(i / frames);
        pushFrame();               // hand this exact frame to the encoder
        info.textContent = `recording — frame ${i + 1} of ${frames}`;
        await waitUntil(t0 + (i + 1) * frameMs);
      }
      // a beat for the encoder to take the closing frame, then stop
      await new Promise(r => setTimeout(r, 120));
      rec.stop();
      await finished;
    } finally {
      stream.getTracks().forEach(t => t.stop());
      /*
       * The view back the way it was, whatever happened above — an encoder
       * that throws must not leave the app letterboxed, locked, or rendering
       * into a 4K backing store for a 500-pixel box. The lock comes off
       * before resize() so resize() works again.
       */
      if (kept.style === null) src.removeAttribute('style');
      else src.setAttribute('style', kept.style);
      renderer.lockSize = false;
      // a turn is a full circle, but put the phase back exactly
      src.width = kept.w; src.height = kept.h;
      renderer.resize();           // recomputes from the restored CSS, and draws
    }
    recording = false;
    recBtn.disabled = false;
    setPhase(phase0);                       // exactly where the recording began
    if (wasPlaying) setPlaying(true);
    syncTransport();

    /*
     * A covered tab records, but poorly: the loop keeps going on its timer
     * and the file comes out whole, yet the browser throttles a hidden
     * canvas's frame delivery to a few per second, and most of the sixty
     * frames pushed never reach the encoder. That is the browser's ceiling,
     * not ours — all that can be done is say so, instead of letting a sparse
     * video look like a bug in the recorder.
     */
    if (document.visibilityState === 'hidden') {
      setStatus('the tab was covered while recording — browsers starve a hidden canvas, so frames are missing; record with the tab visible', false);
    }

    const blob = new Blob(chunks, { type: mime.split(';')[0] });
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
  }

  // ---- wiring ------------------------------------------------------------

  function sync() {
    const axis = parseAxis();
    axisIn.classList.toggle('invalid', !axis);
    syncTransport();
    if (clock) clock.textContent = `${(phase * durationOf()).toFixed(1)}s`;
    if (recording) return;                       // the recorder owns the line
    const encodable = canRecord && !!mimeFor(fmtSel.value);
    customRow.hidden = sizeSel.value !== 'custom';
    const ext = mimeFor(fmtSel.value)?.startsWith('video/mp4') ? 'mp4' : 'webm';
    nameIn.placeholder = `${slug(currentName()) || 'stellation'}-turn.${ext}`;
    const { w, h } = videoSize();
    info.textContent = !axis
      ? 'the axis needs three numbers, e.g. 0 1 0'
      : `one turn = ${durationOf().toFixed(1)} s · ${w} × ${h}` +
        (encodable ? '' : ` — this browser cannot record ${fmtSel.value}`);
    recBtn.disabled = !encodable || recording || !axis;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        axis: axisIn.value, duration: durIn.value, format: fmtSel.value,
        size: sizeSel.value, customW: wIn.value, customH: hIn.value,
      }));
    } catch { }
  }

  // axis and speed come back; `enabled` starts off, always
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved) {
      if (typeof saved.axis === 'string') axisIn.value = saved.axis;
      /*
       * `duration` replaced `speed`, and a stored speed is still worth
       * honouring rather than silently reset: one turn per `speed` seconds is
       * exactly 1/speed, and the sign it used to carry is dropped, direction
       * having moved to the axis.
       */
      if (saved.duration !== undefined) durIn.value = saved.duration;
      else if (saved.speed) durIn.value = String(Math.min(600, Math.max(0.2,
        1 / Math.abs(Number(saved.speed) || 0.1))));
      // a remembered format this browser cannot encode falls back silently
      if (saved.format && mimeFor(saved.format)) fmtSel.value = saved.format;
      if (saved.size && [...sizeSel.options].some(o => o.value === saved.size)) {
        sizeSel.value = saved.size;
      }
      if (saved.customW) wIn.value = saved.customW;
      if (saved.customH) hIn.value = saved.customH;
    }
  } catch { }
  if (!mimeFor(fmtSel.value) && mimeFor('webm')) fmtSel.value = 'webm';

  for (const c of [axisIn, durIn, fmtSel, sizeSel, wIn, hIn]) c.addEventListener('input', sync);
  playBtn.onclick = () => setPlaying(!playing);
  rewindBtn.onclick = () => { setPhase(0); sync(); };
  timeIn.addEventListener('input', () => { setPhase(Number(timeIn.value), true); sync(); });
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
  recBtn.onclick = () => { recordTurn().catch(err => {
    recording = false; recBtn.disabled = false; syncTransport();
    info.textContent = err && err.message ? err.message : String(err);
  }); };
  sync();

  return {
    /** the spin, for anything that needs to hold it still for a moment */
    isSpinning: () => playing && !!parseAxis(),
  };
}
