/*
 * The document manager: where a document lives, and how it gets saved.
 *
 * Modelled on SymmHub's SymDocumentManager, reduced to what stellation needs.
 * The heart of it is the ORIGIN: a document opened from a local folder
 * remembers its folder handle and file name, so Save overwrites it in place
 * and refreshes its thumbnail; a document that came from anywhere else — a
 * preset, a .stel, the plain file input — has no origin, and Save falls
 * through to Save As. That one rule is the whole difference between "files"
 * and "downloads".
 *
 * A saved document is the json + png pair: <name>.json and <name>.json.png,
 * the same convention the presets folder and the file browser read, so a
 * folder written by this app browses with previews. The thumbnail blob is
 * awaited before save resolves — reload() re-reads the folder immediately,
 * and must find the png already there.
 *
 * Everything File-System-Access-shaped stays behind hasFSAccess(): on
 * Firefox/Safari/mobile, none of these entry points exist in the UI and Save
 * remains the download it always was.
 */

import { hasFSAccess, writeFile } from '../../lib/uilib/files.js';
import { createFileSelectionDialog } from '../../lib/uilib/FileSelectionDialog.js';
import { createSaveAsDialog } from '../../lib/uilib/SaveAsDialog.js';

export function initDocManager({
  currentPresetText,     // (docName) -> the serialized document
  makeThumbnail,         // (size)   -> HTMLCanvasElement
  openDocument,          // (text, fileName) -> Promise
  newDocumentName,       // () -> 'par-YY-MM-DD-…'
  download,              // (fname, text, mime) — the universal fallback
  setStatus,
}) {
  const currentDoc = { name: null, folderHandle: null, fileName: null };
  let fileDialog = null;
  let saveAsDialog = null;

  const canFolders = hasFSAccess();

  function setOrigin(name, folderHandle, fileName) {
    currentDoc.name = name;
    currentDoc.folderHandle = folderHandle || null;
    currentDoc.fileName = fileName || null;
  }

  // ---- writing ------------------------------------------------------------

  /** the json + png pair; resolves only when both are on disk */
  async function writePair(folderHandle, name) {
    const fileName = name.endsWith('.json') ? name : name + '.json';
    await writeFile(folderHandle, fileName, currentPresetText(name.replace(/\.json$/, '')));
    const blob = await new Promise((resolve) => makeThumbnail(256).toBlob(resolve, 'image/png'));
    if (blob) await writeFile(folderHandle, fileName + '.png', blob);
    return fileName;
  }

  async function save() {
    if (!canFolders || !currentDoc.folderHandle) { saveAs(); return; }
    try {
      const fileName = await writePair(currentDoc.folderHandle, currentDoc.fileName || currentDoc.name);
      setStatus(`saved ${fileName}`, false);
      fileDialog?.reload(fileName.replace(/\.json$/, ''), currentDoc.folderHandle);
    } catch (e) {
      setStatus('could not save: ' + e.message, false);
    }
  }

  async function saveAs() {
    if (!canFolders) {
      // the download path IS save-as on browsers without the API
      const docName = currentDoc.name || newDocumentName();
      download(`${docName}.json`, currentPresetText(docName), 'application/json');
      return;
    }
    /*
     * The dialog needs a root to constrain its folder picker to. Reuse the
     * file browser's granted root — restoring it here is a user gesture (we
     * are inside a click), which is exactly when the permission chip works.
     */
    ensureFileDialog();
    let root = await fileDialog.loadRootHandle();
    if (!root) root = await fileDialog.selectFolder();
    if (!root) return;
    saveAsDialog ||= createSaveAsDialog({ storageId: 'stell.saveAs' });
    saveAsDialog.show({
      /*
       * One rule for the offered name: the document's own if it has one —
       * the file it came from, or the preset it came from — and otherwise a
       * fresh generated one. Starting something new (picking a solid from
       * the catalog) drops the name, so a new document never arrives
       * wearing the last one's.
       */
      suggestedName: currentDoc.name || newDocumentName(),
      suggestedHandle: currentDoc.folderHandle,
      rootHandle: root,
      // the dialog asks before landing on a name already in that folder
      exists: async (name, folder) => {
        try { await folder.getFileHandle(`${name.replace(/\.json$/, '')}.json`); return true; }
        catch { return false; }
      },
      onSave: async (name, folderHandle) => {
        try {
          const fileName = await writePair(folderHandle, name);
          setOrigin(name.replace(/\.json$/, ''), folderHandle, fileName);
          setStatus(`saved ${fileName}`, false);
          fileDialog?.reload(currentDoc.name, folderHandle);
        } catch (e) {
          setStatus('could not save: ' + e.message, false);
        }
      },
    });
  }

  // ---- reading ------------------------------------------------------------

  function ensureFileDialog() {
    fileDialog ||= createFileSelectionDialog({
      title: 'Documents',
      storageId: 'stell.fileDialog',
      container: document.querySelector('main'),
      onError: (msg) => setStatus(msg, false),
      onSelect: async (data) => {
        try {
          const file = await data.jsonHandle.getFile();
          await openDocument(await file.text(), data.fileName);
          // origin points at the folder the file was IN, which is the
          // browser's current folder — saved-over, not saved-next-to
          setOrigin(data.getName(), fileDialog.getWriteHandle(), data.fileName);
        } catch (e) {
          setStatus('could not open: ' + e.message, false);
        }
      },
    });
    return fileDialog;
  }

  return {
    save, saveAs,
    browse: () => { ensureFileDialog().show(); },
    canFolders,
    /*
     * The file browser is a window like any other, so the windows menu can
     * show and hide it. Only listed where folders exist at all — see
     * canFolders, which is what gates every entry point into this file.
     */
    isBrowserOpen: () => !!fileDialog && fileDialog.isVisible(),
    setBrowserOpen: (v) => { if (v) ensureFileDialog().show(); else fileDialog?.setVisible(false); },
    /** any non-folder open (preset, .stel, file input) clears the origin */
    clearOrigin: (name) => setOrigin(name || null, null, null),
    current: () => ({ ...currentDoc }),
  };
}
