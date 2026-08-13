/*
 * Save As — name a document and choose its destination folder.
 *
 * By Vladimir Bulatov; adapted from SymmHub (lib/uilib/SaveAsDialog.js).
 * Pure UI: it validates a name and a folder and hands (name, folderHandle) to
 * the caller — writing is the document manager's job, so the dialog cannot
 * disagree with it about file formats or thumbnails.
 *
 * The folder row shows the current destination as a path under the granted
 * root; "change…" opens the folder picker constrained to that root. The last
 * destination is remembered through the shared handle store.
 *
 *   createSaveAsDialog({ storageId })
 *     .show({ suggestedName, suggestedHandle, suggestedPath, rootHandle,
 *             onSave(name, folderHandle), onCancel })
 */

import { createInternalWindow } from './internalWindow.js';
import { createFolderPickerDialog } from './FolderPickerDialog.js';
import { getHandle, setHandle } from './files.js';

export function createSaveAsDialog(options = {}) {
  const FOLDER_KEY = (options.storageId || 'stell.saveAs') + '.folder';

  let win = null;
  let picker = null;
  let nameInput, pathInput, saveBtn;
  let folderHandle = null;
  let rootHandle = null;
  let cb = {};

  function ensureWindow() {
    if (win) return;
    win = createInternalWindow({
      width: '340px', height: '200px',
      left: 'calc(50% - 170px)', top: '20%',
      title: 'Save as',
      canClose: true, modal: true, role: 'dialog',
    });
    win.wnd.classList.add('transient');

    const form = document.createElement('div');
    form.className = 'iw-form';
    form.innerHTML =
      '<label>name<input type="text" data-f="name" spellcheck="false"></label>' +
      '<label>folder' +
      '  <span class="row"><input type="text" data-f="path" class="grow" readonly>' +
      '  <button type="button" data-f="change">change…</button></span>' +
      '</label>' +
      '<div class="actions">' +
      '  <button type="button" data-f="cancel">Cancel</button>' +
      '  <button type="button" data-f="save">Save</button>' +
      '</div>';
    win.interior.appendChild(form);

    nameInput = form.querySelector('[data-f="name"]');
    pathInput = form.querySelector('[data-f="path"]');
    saveBtn = form.querySelector('[data-f="save"]');

    form.querySelector('[data-f="cancel"]').onclick = () => close(false);
    saveBtn.onclick = trySave;
    form.querySelector('[data-f="change"]').onclick = async () => {
      picker ||= createFolderPickerDialog({ title: 'Save into' });
      const picked = await picker.show(rootHandle, folderHandle);
      if (picked) {
        folderHandle = picked.handle;
        pathInput.value = '/' + picked.path.join('/');
        setHandle(FOLDER_KEY, folderHandle);
      }
    };
    win.wnd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') trySave();
      // Escape is handled by the window manager (canClose)
    });
    nameInput.addEventListener('input', () => nameInput.classList.remove('invalid'));
  }

  function trySave() {
    const name = nameInput.value.trim();
    if (!name) { nameInput.classList.add('invalid'); nameInput.focus(); return; }
    if (!folderHandle) { pathInput.classList.add('invalid'); return; }
    close(false);
    cb.onSave?.(name, folderHandle);
  }

  function close(viaCancel) {
    win.setVisible(false);
    if (viaCancel) cb.onCancel?.();
  }

  async function show(params = {}) {
    ensureWindow();
    cb = params;
    rootHandle = params.rootHandle || null;

    folderHandle = params.suggestedHandle || (await getHandle(FOLDER_KEY)) || rootHandle;
    // the remembered folder may be from another root; resolve() gives the true path
    let path = params.suggestedPath;
    if (!path && folderHandle && rootHandle) {
      try {
        const rel = await rootHandle.resolve(folderHandle);
        path = rel ? '/' + rel.join('/') : null;
        if (!rel) folderHandle = rootHandle;      // outside the root: fall back
      } catch { folderHandle = rootHandle; }
    }
    pathInput.value = path || '/';
    nameInput.value = params.suggestedName || '';
    nameInput.classList.remove('invalid');
    pathInput.classList.remove('invalid');
    win.setVisible(true);
    nameInput.focus();
    nameInput.select();
  }

  return { show, setVisible: (v) => win?.setVisible(v) };
}
