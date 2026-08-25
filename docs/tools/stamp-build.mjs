/*
 * Stamp the build.
 *
 *   node docs/tools/stamp-build.mjs
 *
 * Writes docs/app/js/build.js with the moment it ran. That file is imported by
 * the app AND by the worker, and it is what the help dialog shows.
 *
 * It exists because of a failure this project keeps having: the browser serves
 * a stale copy of a module and the screen shows a version of the program that
 * was fixed an hour ago. A stamp that only changes when someone remembers to
 * change it cannot catch that — ours sat at the date it was introduced for
 * three weeks — so it is written by a tool, and the hook installed by
 * install-hooks.mjs runs the tool on every commit.
 *
 * The stamp is also a cache key: app.js appends it to the worker's URL, so a
 * new build is a new URL and the worker cannot be served from a cache that
 * predates it. That is the case that produced this file — a fresh app.js
 * talking to a worker three commits old, which showed the right build date and
 * the wrong answers.
 *
 * Minute resolution, in UTC, so the file is stable within a minute and the
 * same source produces the same stamp for anyone in any timezone.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(DOCS, 'app', 'js', 'build.js');

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}` +
              ` ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

const text = `/*
 * WRITTEN BY docs/tools/stamp-build.mjs — do not edit by hand.
 *
 * The moment this build was stamped. Shown in the help dialog, and used as the
 * worker's cache key so that a new build can never be answered by an old
 * worker. See the tool for why both of those matter.
 */
export const BUILD = '${stamp}';
`;

// only when it would actually change, so re-running does not dirty the tree
let before = null;
try { before = readFileSync(OUT, 'utf8'); } catch { /* first run */ }
if (before === text) {
  console.log('build stamp unchanged: ' + stamp);
} else {
  writeFileSync(OUT, text);
  console.log('stamped ' + stamp);
}
