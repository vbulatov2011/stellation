/*
 * The preset browser: a floating window of thumbnails for the documents the
 * site ships.
 *
 * The server side is a naming convention, not code — docs/presets/ holds
 * <name>.json with <name>.json.png beside it, and index.json lists the files
 * (static hosting has no directory listing, so the manifest is the index).
 * The thumbnails are plain <img src> URLs: the browser fetches, caches and
 * lazily decodes them, which is why this works identically on every browser
 * and phone — there is no API in it at all.
 *
 * Selecting a preset fetches its json and hands the text to the same
 * openDocument() the Open button and the file browser use: one entry point
 * for documents, wherever they come from.
 */

import { createImageSelector } from '../../lib/uilib/modules.js';

export function initPresets({ openDocument, setStatus }) {
  let selector = null;

  async function load(sel) {
    let manifest;
    try {
      const r = await fetch('presets/index.json');
      if (!r.ok) throw new Error(r.statusText);
      manifest = await r.json();
    } catch (err) {
      setStatus?.('could not load the preset list: ' + err.message, false);
      return;
    }
    sel.addItems((manifest.items || []).map((it) => ({
      url: 'presets/' + it.file + '.png',
      data: {
        getName: () => it.name || it.file.replace(/\.json$/, ''),
        jsonUrl: 'presets/' + it.file,
      },
    })), { noSort: true });   // the manifest order is the curated order
  }

  async function open(data) {
    try {
      const r = await fetch(data.jsonUrl);
      if (!r.ok) throw new Error(r.statusText);
      await openDocument(await r.text(), data.jsonUrl.split('/').pop());
    } catch (err) {
      setStatus?.('could not open the preset: ' + err.message, false);
    }
  }

  return {
    show() {
      if (!selector) {
        selector = createImageSelector({
          title: 'Presets',
          width: '460px', height: '380px', left: '60px', top: '48px',
          storageId: 'stell.win.presets',
          container: document.querySelector('main'),
          role: 'dialog',
          transient: true,          // near-fullscreen sheet on narrow screens
          onSelect: open,
        });
        load(selector);
      }
      selector.setVisible(true);
    },
  };
}
