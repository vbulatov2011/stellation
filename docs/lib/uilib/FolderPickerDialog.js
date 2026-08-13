/*
 * Folder picker — a modal tree of subfolders under a root directory handle.
 *
 * By Vladimir Bulatov; adapted from SymmHub (lib/uilib/FolderPickerDialog.js).
 * Used by Save As to choose a destination inside the granted root: the OS
 * picker cannot be constrained to a subtree, so choosing within what the user
 * already granted needs a picker of our own.
 *
 * The tree is lazy — each node lists its children on first expand, because a
 * whole directory tree up front is unbounded work for folders the user will
 * never open. The original persisted its own root handle under a hard-coded
 * key that had drifted from its writer's; this port takes the root as an
 * argument only, and the shared handle store in files.js is the one place
 * remembering anything.
 *
 *   createFolderPickerDialog({ title })
 *     .show(rootHandle, startHandle) -> Promise<{handle, path} | null>
 */

import { createInternalWindow } from './internalWindow.js';

export function createFolderPickerDialog(params = {}) {
  let win = null;
  let resolvePick = null;
  let selected = null;        // { handle, path: string[] }
  let treeRoot = null;
  let titleBase = params.title || 'Choose a folder';

  function ensureWindow() {
    if (win) return;
    win = createInternalWindow({
      width: '340px', height: '380px',
      left: 'calc(50% - 170px)', top: '15%',
      title: titleBase,
      canClose: true, canResize: true, modal: true, role: 'dialog',
    });
    win.wnd.classList.add('transient');

    const wrap = document.createElement('div');
    wrap.className = 'iw-form';
    wrap.style.height = '100%';
    wrap.innerHTML =
      '<div class="iw-tree" style="flex:1; overflow:auto; border:1px solid var(--line); border-radius:7px"></div>' +
      '<div class="actions">' +
      '  <button type="button" data-act="cancel">Cancel</button>' +
      '  <button type="button" data-act="ok" disabled>Select</button>' +
      '</div>';
    win.interior.appendChild(wrap);
    treeRoot = wrap.querySelector('.iw-tree');

    wrap.querySelector('[data-act="cancel"]').onclick = () => finish(null);
    wrap.querySelector('[data-act="ok"]').onclick = () => finish(selected);
    win.wnd.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && selected) finish(selected);
    });
  }

  function finish(result) {
    win.setVisible(false);
    const r = resolvePick;
    resolvePick = null;
    r?.(result);
  }

  /** one folder row; children list built on first expand */
  function makeNode(handle, path) {
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'tree-row';
    const arrow = document.createElement('span');
    arrow.className = 'folder-arrow';
    arrow.textContent = '▸';
    const label = document.createElement('span');
    label.textContent = (path.length ? path[path.length - 1] : handle.name) || '/';
    row.append(arrow, label);
    li.appendChild(row);

    const kids = document.createElement('ul');
    kids.className = 'nested';
    li.appendChild(kids);
    let loaded = false;

    async function expand() {
      if (!loaded) {
        loaded = true;
        try {
          const names = [];
          for await (const [name, h] of handle.entries()) {
            if (h.kind === 'directory') names.push([name, h]);
          }
          names.sort((a, b) => a[0].localeCompare(b[0]));
          for (const [name, h] of names) kids.appendChild(makeNode(h, [...path, name]));
          if (!names.length) arrow.textContent = '·';
        } catch { arrow.textContent = '·'; }
      }
      const open = kids.classList.toggle('active');
      if (arrow.textContent !== '·') arrow.textContent = open ? '▾' : '▸';
    }

    arrow.onclick = (e) => { e.stopPropagation(); expand(); };
    row.onclick = () => {
      treeRoot.querySelector('.selected-node')?.classList.remove('selected-node');
      row.classList.add('selected-node');
      selected = { handle, path };
      win.wnd.querySelector('[data-act="ok"]').disabled = false;
      win.setTitle(titleBase + ' — /' + path.join('/'));
      expand();
    };

    li._open = expand;     // for the walk-to-start below
    li._row = row;
    li._name = label.textContent;
    return li;
  }

  /*
   * show(rootHandle, startHandle): the tree is rooted at rootHandle; if a
   * previous destination is known, walk to it via resolve() — every handle on
   * the way derives from the root the user already granted, so no new
   * permission is involved.
   */
  async function show(rootHandle, startHandle = null) {
    ensureWindow();
    selected = null;
    win.setTitle(titleBase);
    treeRoot.replaceChildren();
    win.wnd.querySelector('[data-act="ok"]').disabled = true;

    const rootUl = document.createElement('ul');
    const rootLi = makeNode(rootHandle, []);
    rootUl.appendChild(rootLi);
    treeRoot.appendChild(rootUl);
    await rootLi._open();
    rootLi._row.click();

    if (startHandle) {
      try {
        const rel = await rootHandle.resolve(startHandle);
        let li = rootLi;
        for (const seg of rel || []) {
          const next = [...li.querySelectorAll(':scope > ul > li')]
            .find((k) => k._name === seg);
          if (!next) break;
          await next._open();
          li = next;
        }
        li._row.click();
        li._row.scrollIntoView({ block: 'center' });
      } catch { /* start folder no longer under root: stay at root */ }
    }

    win.setVisible(true);
    return new Promise((resolve) => { resolvePick = resolve; });
  }

  return { show };
}
