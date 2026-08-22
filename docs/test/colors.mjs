/*
 * The editable palette: overrides, alpha, and the array a document saves.
 *
 *   node docs/test/colors.mjs
 *
 * Two things are checked. First that an override really does stand in for the
 * palette everywhere a color is asked for — including inside a blend, which
 * mixes its members and must mix the overridden ones. Second that the saved
 * array survives a round trip and lines up BY GROUP NUMBER, which is what lets
 * a palette be copied between two figures that have different selections.
 */

import { faceColor, defaultColor, setColorOverride, setColorOverrides,
         colorOverrides, hasColorOverrides, hexToRgba, rgbaToHex,
         UNDERSIDE } from '../lib/palette.js';
import { groupsOf, colorsArray, applyColorsArray } from '../app/js/colors.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('   ok   ' + label); }
  else { failed++; console.log('   FAIL ' + label); }
};
const near = (a, b, e = 0.004) => Math.abs(a - b) < e;
const sameColor = (a, b) => a.length === b.length && a.every((v, i) => near(v, b[i]));

// ------------------------------------------------------------------- hex

{
  ok(rgbaToHex([1, 0, 0, 1]) === '#ff0000ff', 'rgba to hex keeps the alpha digits');
  ok(sameColor(hexToRgba('#3366cc80'), [0.2, 0.4, 0.8, 0.502]), 'and hex reads back');
  ok(sameColor(hexToRgba('#3366cc'), [0.2, 0.4, 0.8, 1]), 'six digits mean opaque');
  ok(hexToRgba('nonsense') === null && hexToRgba('') === null, 'anything else is not a color');
  const round = rgbaToHex(hexToRgba('#12ab34cd'));
  ok(round === '#12ab34cd', `a round trip is exact (got ${round})`);
}

// ------------------------------------------------------- overrides stand in

{
  setColorOverrides(null);
  const base = faceColor('coset', 0);
  ok(base[3] === 1, 'a palette color is opaque');
  ok(sameColor(base, defaultColor('coset', 0)), 'and it is the palette default');

  setColorOverride('coset', 0, '#ff000040');
  ok(sameColor(faceColor('coset', 0), [1, 0, 0, 0.251]), 'an override replaces it, alpha and all');
  ok(hasColorOverrides('coset') && !hasColorOverrides('layer'),
     'and belongs to its own mode, not to every mode');

  // the underside is the same color darkened — except by shell, which never
  // darkened its undersides and must not start now
  const under = faceColor('coset', 0, false);
  ok(near(under[0], UNDERSIDE) && near(under[3], 0.251),
     'undersides darken the override and keep its alpha');
  setColorOverride('layer', 1, '#40c0ffff');
  ok(sameColor(faceColor('layer', 1, false), faceColor('layer', 1, true)),
     'by shell, an underside is NOT darkened — as before');

  // a blend mixes whatever its members now are
  setColorOverrides(null);
  const plain = faceColor('coset', [0, 6]);
  setColorOverride('coset', 0, '#ff0000ff');
  const mixed = faceColor('coset', [0, 6]);
  ok(!sameColor(plain, mixed), 'a blend follows an override of one of its members');
  setColorOverride('coset', 0, '#ff000000');
  ok(near(faceColor('coset', [0, 6])[3], 0.5), 'and averages the alphas (one clear, one solid)');

  setColorOverride('coset', 0, null);
  ok(sameColor(faceColor('coset', 0), defaultColor('coset', 0)), 'clearing gives the palette back');
}

// --------------------------------------------------- rows, and the saved array

{
  setColorOverrides(null);
  // a mesh is only ever read for its per-face group arrays
  const mesh = { faceCosets: [0, 2, 2, -1, 4], faceLayers: [3, 3, 5] };

  const rows = groupsOf(mesh, 'coset');
  ok(rows.join(',') === '0,1,2,3,4,-1',
     `rows run 0..max then gray, gaps included (got ${rows.join(',')})`);
  ok(groupsOf(mesh, 'layer').join(',') === '0,1,2,3,4,5',
     'by shell they run from zero, so row 3 is always shell 3');
  ok(groupsOf(mesh, 'orbitP').length === 0, 'a mode the mesh does not carry has no rows');

  const arr = colorsArray(mesh, 'coset');
  ok(arr.length === rows.length && arr.every(h => /^#[0-9a-f]{8}$/.test(h)),
     'the saved array is one eight-digit hex per row');

  // an edit, saved and restored
  setColorOverride('coset', 2, '#11223344');
  setColorOverride('coset', -1, '#00000000');
  const saved = colorsArray(mesh, 'coset');
  setColorOverrides(null);
  const n = applyColorsArray(mesh, 'coset', saved);
  ok(n === rows.length, `every row of the array applies (${n} of ${rows.length})`);
  ok(sameColor(faceColor('coset', 2), [0.067, 0.133, 0.2, 0.267]), 'the edited group comes back');
  ok(near(faceColor('coset', -1)[3], 0), 'and so does an invisible gray');
  ok(colorOverrides().size === 2,
     'while groups equal to the palette are not stored — a document keeps only its edits');

  /*
   * The point of numbering the rows: a palette taken from a figure with six
   * groups still lands correctly on a figure with three, and its gray — which
   * has no number — is read from the end rather than from a fixed position.
   */
  setColorOverrides(null);
  const small = { faceCosets: [0, 1, -1] };
  applyColorsArray(small, 'coset', saved);
  ok(sameColor(faceColor('coset', 2), defaultColor('coset', 2)),
     'a group the smaller figure does not have is left alone');
  ok(near(faceColor('coset', -1)[3], 0), 'and gray still comes from the last entry');

  setColorOverrides(null);
  ok(applyColorsArray(mesh, 'coset', ['not', 'colors']) === 0, 'nonsense colors nothing');
  ok(!hasColorOverrides(), 'and leaves no overrides behind');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
