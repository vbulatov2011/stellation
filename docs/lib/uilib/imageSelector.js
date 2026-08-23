/*
 * Image selector — a floating window full of clickable thumbnails.
 *
 * By Vladimir Bulatov; adapted here from SymmHub (lib/uilib/imageSelector.js).
 * The API is kept; the internals are trimmed to what this app uses:
 *
 *  - imports only ./internalWindow.js — never a barrel, so pulling this file
 *    in cannot drag the rest of the lib along with it;
 *  - the thumbnail background modes (solid color / checkerboard, persisted
 *    per dialog) are dropped — stellation thumbnails are opaque renders and
 *    the chrome should follow the theme, not fight it;
 *  - the missing-thumbnail placeholder is an inline SVG data URL — the
 *    original pointed at an image path that no app actually served;
 *  - the drag-highlight is a CSS class rather than inline colors, so the
 *    theme owns it.
 *
 * Items are supplied as {url|tmb|file, data}: `url` becomes a plain <img src>
 * (the browser does all the fetching — this is how server presets need zero
 * network code), `tmb` is any ready src string (data: URLs from FileReader),
 * `file` is a File whose bitmap gets scaled into a thumbnail locally. `data`
 * is the caller's — `data.getName()` (or `.name`) feeds sorting and captions,
 * `data.isFolder` marks navigation entries.
 *
 * The window also accepts OS file drops: real files are separated from
 * browser-internal drags (an <img> dragged within the page carries text/*
 * types alongside 'Files'; an OS drop never does), then run through the
 * files filter, which decides what a droppable set of files means.
 */

import { createInternalWindow } from './internalWindow.js';

const EXT_JSON = '.json';
const EXT_PNG = '.png';
const DEFAULT_TMB_SIZE = 128;

/* a neutral "document" pictogram for presets that arrived without a thumbnail */
export const DEFAULT_THUMB =
  'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
    '<rect x="14" y="8" width="36" height="48" rx="4" fill="#8b93a7" opacity="0.25"/>' +
    '<path d="M20 20h24M20 28h24M20 36h16" stroke="#8b93a7" stroke-width="3" stroke-linecap="round" fill="none"/>' +
    '</svg>');

/**
 * createImageSelector({ onSelect(data), onContextMenu(data, event),
 *                       width, height, left, top, title, storageId,
 *                       filesFilter, container, role, transient })
 *
 * returns { addItems(items, {noSort}), updateItem, findItem, addFiles,
 *           setVisible, isVisible, selectItem, clear, removeItem, setTitle,
 *           getHeader, getTitleDiv, getInterior, getWindow }
 */
export function createImageSelector(param = {}) {
  const onSelect = param.onSelect || (() => {});
  const onContextMenu = param.onContextMenu || null;
  /*
   * What opens an item: a single click, or a double click with the single one
   * demoted to selecting. Default 'click', so pickers that are lists of things
   * to choose (the presets sheet) keep working the way they read; the file
   * browser asks for 'dblclick', because there a click also means "this is the
   * one I mean" for a menu or a second gesture, and opening a document by
   * brushing past it is how the wrong file gets opened.
   */
  const activateOn = param.activateOn === 'dblclick' ? 'dblclick' : 'click';
  const filesFilter = param.filesFilter || createDefaultImageFilesFilter();

  const intWin = createInternalWindow({
    width: param.width || '400px',
    height: param.height || '400px',
    left: param.left || '10px',
    top: param.top || '10px',
    title: param.title || 'items',
    canClose: true,
    canResize: true,
    storageId: param.storageId,
    container: param.container,
    role: param.role || 'dialog',
  });
  // transient windows become near-fullscreen sheets on narrow screens
  if (param.transient) intWin.wnd.classList.add('transient');

  const grid = document.createElement('div');
  grid.className = 'thumbnail-grid';
  intWin.interior.appendChild(grid);

  /*
   * The whole interior answers the right button, not just the tiles. Clicking
   * the gap between them used to raise the browser's own menu — reload, view
   * source, save image — which belongs to a web page and not to a folder. The
   * item's own handler takes the ones over a tile; this takes the rest, and
   * reports no item.
   */
  if (onContextMenu) {
    intWin.interior.addEventListener('contextmenu', (e) => {
      if (e.target.closest('.thumbnail-container')) return;
      e.preventDefault();
      onContextMenu(null, e);
    });
  }

  let items = [];            // the live item wrappers, in DOM order
  let selected = null;

  // ---- OS file drops ----------------------------------------------------

  /*
   * True only for drags carrying actual OS-level files. OS drops carry only
   * 'Files'; a browser-internal drag (a thumbnail dragged two pixels and
   * dropped back) always mixes in a text/* type.
   */
  const hasOsFiles = (dt) => {
    const types = [...dt.types];
    return types.includes('Files') && !types.some((t) => t.startsWith('text/'));
  };

  grid.addEventListener('dragover', (e) => {
    if (!hasOsFiles(e.dataTransfer)) return;
    e.stopPropagation(); e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  grid.addEventListener('dragenter', (e) => {
    if (!hasOsFiles(e.dataTransfer)) return;
    grid.classList.add('drop-target');
    e.stopPropagation(); e.preventDefault();
  });
  grid.addEventListener('dragleave', (e) => {
    grid.classList.remove('drop-target');
    e.stopPropagation(); e.preventDefault();
  });
  grid.addEventListener('drop', (e) => {
    grid.classList.remove('drop-target');
    e.stopPropagation(); e.preventDefault();
    if (hasOsFiles(e.dataTransfer)) addFiles(e.dataTransfer.files);
  });
  // an <img> dragged inside the window must not start a browser drag at all
  grid.addEventListener('dragstart', (e) => e.preventDefault());

  // ---- items --------------------------------------------------------------

  const nameOf = (data) => (data?.getName ? data.getName() : data?.name);

  function addItems(imageItems, options = {}) {
    if (!options.noSort) {
      imageItems.sort((a, b) => {
        const na = nameOf(a.data) || '', nb = nameOf(b.data) || '';
        return na < nb ? -1 : na > nb ? 1 : 0;
      });
    }
    for (const it of imageItems) {
      const wrap = createImageItemElem({
        url: it.url, tmb: it.tmb, file: it.file,
        userData: it.data,
        onClick: pick,
        onActivate: activate,
        onContextMenu: onContextMenu
          ? (w, e) => onContextMenu(w.getUserData(), e)
          : null,
      });
      grid.appendChild(wrap.elem);
      items.push(wrap);
    }
  }

  /** a single click: always selects, and opens only where that is the gesture */
  function pick(wrap) {
    selectItem(wrap);
    if (activateOn === 'click') onSelect(wrap.getUserData());
  }

  /** a double click: opens where that is the gesture, having selected anyway */
  function activate(wrap) {
    selectItem(wrap);
    if (activateOn === 'dblclick') onSelect(wrap.getUserData());
  }

  function selectItem(wrap) {
    selected?.setSelected(false);
    selected = wrap;
    wrap?.setSelected(true);
  }

  function findItem(data, silent = false) {
    const name = nameOf(data);
    const found = items.find((w) => {
      const ud = w.getUserData();
      if (ud === data) return true;
      return name != null && nameOf(ud) === name;
    });
    if (!found && !silent) console.warn('imageSelector: item not found for', data);
    return found || null;
  }

  function updateItem(imageItem) {
    const found = findItem(imageItem.data);
    if (!found) return;
    found.setThumbnail(imageItem.tmb);
    found.setUserData(imageItem.data);
  }

  function removeItem(data) {
    const wrap = findItem(data);
    if (!wrap) return;
    wrap.elem.remove();
    items.splice(items.indexOf(wrap), 1);
    if (selected === wrap) selected = null;
  }

  function clear() {
    grid.replaceChildren();
    items = [];
    selected = null;
  }

  function addFiles(files) {
    addItems(filesFilter.getImageItems(files));
  }

  return {
    addItems, updateItem, findItem, addFiles,
    setVisible: (v) => intWin.setVisible(v),
    isVisible: () => intWin.isVisible(),
    selectItem, clear, removeItem,
    setTitle: (t) => intWin.setTitle(t),
    getHeader: () => intWin.header,
    getTitleDiv: () => intWin.titleDiv,
    getInterior: () => intWin.interior,
    getWindow: () => intWin,
  };
}

// ---------------------------------------------------------------- one cell

function createImageItemElem(options) {
  let userData = options.userData;

  const container = document.createElement('div');
  container.className = 'thumbnail-container';

  const img = document.createElement('img');
  img.className = 'thumbnail-image';
  if (options.tmb) img.src = options.tmb;
  else if (options.url) img.src = options.url;
  else if (options.file) {
    createImageBitmap(options.file).then((bmp) => {
      img.src = scaleToThumb(bmp, DEFAULT_TMB_SIZE);
    });
  }
  // draggable=false is ignored by Chrome for <img>; dragstart is the real fix
  img.addEventListener('dragstart', (e) => e.preventDefault());
  if (userData?.isFolder) img.classList.add('folder-thumbnail');

  const caption = document.createElement('div');
  caption.className = 'thumbnail-caption';
  /*
   * The caller's name wins when it gave one — a manifest's "Deep stellation"
   * beats the filename it happens to live in. The URL / file name is only the
   * fallback for items that arrived without any.
   */
  let text = (userData?.getName ? userData.getName() : userData?.name)
    || (options.url ? options.url.split('/').pop() : '')
    || (options.file ? options.file.name : '');
  if (text.endsWith(EXT_JSON + EXT_PNG)) text = text.slice(0, -(EXT_JSON + EXT_PNG).length);
  caption.textContent = text;
  container.title = text;

  container.appendChild(img);
  container.appendChild(caption);

  const myself = {
    elem: container,
    setSelected: (on) => container.classList.toggle('selected', !!on),
    setThumbnail: (src) => { if (src) img.src = src; },
    setUserData: (d) => { userData = d; },
    getUserData: () => userData,
  };

  img.addEventListener('click', () => options.onClick?.(myself));
  // the caption counts as the item too, which is what a double click expects
  container.addEventListener('dblclick', () => options.onActivate?.(myself));
  if (options.onContextMenu) {
    container.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      options.onContextMenu(myself, e);
    });
  }

  return myself;
}

/** scale a bitmap into a square letterboxed thumbnail, returned as a data URL */
function scaleToThumb(img, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  let w = size, h = size, ox = 0, oy = 0;
  if (img.width >= img.height) { h = (size * img.height) / img.width; oy = (size - h) / 2; }
  else { w = (size * img.width) / img.height; ox = (size - w) / 2; }
  canvas.getContext('2d').drawImage(img, ox, oy, w, h);
  return canvas.toDataURL();
}

// ---------------------------------------------------------------- filters

/** dropped files → items: every image file becomes one thumbnail */
export function createDefaultImageFilesFilter() {
  return {
    getImageItems(files) {
      const items = [];
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          items.push({ name: file.name, file, data: file });
        }
      }
      return items;
    },
  };
}

/**
 * dropped files → items: pairs X.json with its X.json.png thumbnail, the same
 * naming rule the preset folders use. A json without its png still lists,
 * behind the generic pictogram.
 */
export function createPresetsFilesFilter() {
  return {
    getImageItems(fileList) {
      const files = [...fileList];
      const items = [];
      for (const file of files) {
        if (!file.name.endsWith(EXT_JSON)) continue;
        const base = file.name.split('/').pop().slice(0, -EXT_JSON.length);
        const tmbFile = files.find((f) => f.name === file.name + EXT_PNG);
        const data = { jsonFile: file, tmbFile, getName: () => base };
        items.push(tmbFile ? { file: tmbFile, data } : { tmb: DEFAULT_THUMB, data });
      }
      return items;
    },
  };
}
