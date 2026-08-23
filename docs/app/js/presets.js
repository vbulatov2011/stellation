/*
 * The preset browser: a floating window of thumbnails for the documents the
 * site ships.
 *
 * The server side is a naming convention, not code — docs/presets/ holds
 * <name>.json with <name>.json.png beside it, and docs/presets.json lists the
 * files (static hosting has no directory listing, so the manifest is the
 * index). Its paths are relative to itself, so the manifest says where the
 * documents are rather than relying on a folder name written in here.
 * The thumbnails are plain <img src> URLs: the browser fetches, caches and
 * lazily decodes them, which is why this works identically on every browser
 * and phone — there is no API in it at all.
 *
 * Selecting a preset fetches its json and hands the text to the same
 * openDocument() the Open button and the file browser use: one entry point
 * for documents, wherever they come from.
 */

import { createImageSelector, showThumbMenu, copyText } from '../../lib/uilib/modules.js';

export function initPresets({ openDocument, setStatus }) {
  let selector = null;
  /*
   * A one-shot borrower. The plane editor imports planes out of a preset
   * rather than opening it, and rather than building a second thumbnail
   * window for the same nine documents it takes this one for a single
   * selection: `pick` swaps the title and the destination for exactly one
   * click, then everything is a preset browser again.
   */
  let pending = null;

  async function load(sel) {
    let manifest;
    try {
      const r = await fetch('presets.json');
      if (!r.ok) throw new Error(r.statusText);
      manifest = await r.json();
    } catch (err) {
      setStatus?.('could not load the preset list: ' + err.message, false);
      return;
    }
    sel.addItems((manifest.items || []).map((it) => ({
      url: it.file + '.png',
      data: {
        getName: () => it.name || it.file.split('/').pop().replace(/\.json$/, ''),
        jsonUrl: it.file,
      },
    })), { noSort: true });   // the manifest order is the curated order
  }

  async function open(data) {
    try {
      const r = await fetch(data.jsonUrl);
      if (!r.ok) throw new Error(r.statusText);
      const text = await r.text();
      const name = data.jsonUrl.split('/').pop();
      if (pending) {
        const take = pending;
        endPick();
        take(text, name);
        return;
      }
      // a preset has a real address, so the URL can keep it and a reload
      // opens the same preset again
      await openDocument(text, name, { hash: 'doc=' + data.jsonUrl });
    } catch (err) {
      setStatus?.('could not open the preset: ' + err.message, false);
      endPick();
    }
  }

  function endPick() {
    if (!pending) return;
    pending = null;
    selector?.setTitle('Presets');
    selector?.setVisible(false);
  }

  function show(title) {
    if (!selector) {
      selector = createImageSelector({
        title: 'Presets',
        width: '460px', height: '380px', left: '60px', top: '48px',
        storageId: 'stell.win.presets',
        container: document.querySelector('main'),
        role: 'dialog',
        transient: true,          // near-fullscreen sheet on narrow screens
        onSelect: open,
        /*
         * The same right-button menu the file browser has, so the two shelves
         * of tiles answer the button the same way. A preset is read-only and
         * lives on the server, so the one thing worth taking from it is where
         * it is: the address that fetches it, which is what you paste to send
         * someone the preset you are looking at.
         */
        onContextMenu: (data, event) => showThumbMenu([
          data && {
            label: 'copy path',
            run: async () => {
              const path = new URL(data.jsonUrl, location.href).href;
              const ok = await copyText(path);
              setStatus?.(ok ? 'copied ' + path : 'could not reach the clipboard', false);
            },
          },
        ], event),
      });
      load(selector);
    }
    selector.setTitle(title || 'Presets');
    selector.setVisible(true);
  }

  return {
    show: () => { pending = null; show(); },
    /** borrow the browser for one selection: handler(text, fileName) */
    pick: (handler, title = 'Presets — pick one to import') => {
      pending = handler;
      show(title);
    },
    /*
     * The windows menu drives this like any other window. Nothing exists
     * until the first open, so "not open yet" and "closed" are the same
     * answer — which is what the menu wants to show anyway.
     */
    isOpen: () => !!selector && selector.isVisible(),
    setOpen: (v) => { if (v) show(); else selector?.setVisible(false); },
  };
}
