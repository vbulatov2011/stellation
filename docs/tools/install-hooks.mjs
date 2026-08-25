/*
 * Install the git hooks this repository wants.
 *
 *   node docs/tools/install-hooks.mjs
 *
 * One hook: stamp the build before every commit, and stage the stamp with it.
 * Hooks live in .git/hooks, which git does not version, so a repository cannot
 * simply carry them — every clone has to install its own, and a tool that does
 * it is friendlier than a paragraph asking someone to paste a shell script.
 *
 * Refuses to overwrite a hook it did not write, since a hook someone else put
 * there is theirs.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = join(ROOT, '.git', 'hooks');
const HOOK = join(HOOKS, 'pre-commit');
const MARK = '# stellation: stamp the build';

const body = `#!/bin/sh
${MARK}
#
# The stamp is the help dialog's build line and the worker's cache key, so it
# has to be current in every commit — see docs/tools/stamp-build.mjs.
node docs/tools/stamp-build.mjs || exit 1
git add docs/app/js/build.js
`;

if (!existsSync(HOOKS)) mkdirSync(HOOKS, { recursive: true });

if (existsSync(HOOK)) {
  const had = readFileSync(HOOK, 'utf8');
  if (!had.includes(MARK)) {
    console.error('pre-commit already exists and is not ours — left alone.');
    console.error('add this line to it yourself:  node docs/tools/stamp-build.mjs && git add docs/app/js/build.js');
    process.exit(1);
  }
}

writeFileSync(HOOK, body);
try { chmodSync(HOOK, 0o755); } catch { /* windows: the bit is not there to set */ }
console.log('installed .git/hooks/pre-commit — the build is stamped on every commit');
