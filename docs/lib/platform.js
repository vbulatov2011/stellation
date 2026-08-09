/*
 * Which modifier key to name in the interface.
 *
 * The carve gesture is bound to ctrl, option/alt, cmd and the macOS secondary
 * click all at once, so it is reachable on every platform. What matters here is
 * which one to *say*, and the answer is now "ctrl" everywhere:
 *
 *   Windows / Linux  ctrl-click arrives as an ordinary click carrying ctrlKey.
 *   macOS            ctrl-click is the OS secondary click, so it arrives as a
 *                    `contextmenu` event instead — which the views handle, and
 *                    tell apart from a genuine right-click by that same
 *                    ctrlKey. Option-click works too, as a fallback.
 *
 * One shared word beats two correct ones: two people on different machines
 * should be able to describe the same gesture to each other.
 */

const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
export const isMac = /Mac|iPhone|iPad|iPod/i.test(ua);

/** what to print for the carve modifier — the same on every platform */
export const subKey = 'ctrl';

/** the platform's alternative, for the controls page */
export const altKeyName = isMac ? '⌥ option' : 'alt';

export function labelKeys(root = document) {
  for (const k of root.querySelectorAll('.kSub')) k.textContent = subKey;
}
