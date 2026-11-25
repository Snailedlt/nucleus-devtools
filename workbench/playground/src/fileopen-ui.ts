// Open a file from the computer, with the picker (Open a file…) or by dropping it on the page: a handler (.js), or
// a .zip/.nc package, whose other files are kept and saved with it. Open a folder… reads a handler another editor
// worked on: <Name>.js with its files in <Name>/ (Nucleus Co-op's handlers folder, what "Save as a folder" writes), or
// an unpacked package (handler.js and its folders).
import { $ } from './dom';
import { notice } from './toast';
import { readBundle, readPackage, storeFiles, type PackageFile } from './package';

export interface FileOpenDeps {
  loadSource: (src: string, meta: { name: string; kind: 'draft' }) => void;
  setPackageFiles: (files: PackageFile[]) => void;
  /** A folder with several handlers: the person picks which to open (`open` takes their positions in `names`). */
  choose: (names: string[], open: (which: number[]) => void) => void;
}

/** A handler found in a picked folder: its code's file and its package files, by their names in the package. */
export interface FolderHandler { name: string; js: File; files: { name: string; file: File }[] }
/** The most files of one handler a folder is read for (a game's whole install folder isn't a handler). */
export const FOLDER_MAX_FILES = 2000;
const skipped = (path: string) => path.split('/').some((p) => p.startsWith('.') || p === 'node_modules');
/**
 * The handlers in a picked folder, from its files' paths (relative to the folder). With a handler.js at the top it is
 * one unpacked package: the folder's name is the handler's, and every other file keeps its path. Otherwise each .js
 * at the top is a handler, with the files of the folder that has its name (as in Nucleus Co-op's handlers folder).
 */
export function handlersInFolder(folder: string, entries: { path: string; file: File }[]): FolderHandler[] {
  const list = entries.filter((e) => e.path && !skipped(e.path));
  const top = list.filter((e) => !e.path.includes('/') && /\.js$/i.test(e.path));
  const pkg = top.find((e) => e.path.toLowerCase() === 'handler.js');
  if (pkg) return [{ name: `${folder}.js`, js: pkg.file, files: list.filter((e) => e !== pkg).map((e) => ({ name: e.path, file: e.file })) }];
  return top.map((e) => {
    const base = e.path.replace(/\.js$/i, '');
    const prefix = `${base.toLowerCase()}/`;
    return { name: e.path, js: e.file, files: list.filter((x) => x.path.toLowerCase().startsWith(prefix)).map((x) => ({ name: x.path, file: x.file })) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

/** Wires the pickers and drag & drop; returns the file and folder inputs (a click opens the picker). */
export function initFileOpen(deps: FileOpenDeps) {
  async function openFile(file: File) {
    try {
      if (/\.(zip|nc)$/i.test(file.name)) {
        const buf = await file.arrayBuffer();
        // Several handlers in one .zip (what Download gives for more than one): each opens.
        const bundle = await readBundle(buf);
        if (bundle) {
          const unkept: string[] = []; // handlers whose files are too big to keep after a reload
          for (const h of bundle) {
            deps.loadSource(h.handler.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), { name: `${h.name}.js`, kind: 'draft' });
            if (h.files.length) { deps.setPackageFiles(h.files); if (!storeFiles(h.files)) unkept.push(h.name); }
          }
          // After the handlers are open (opening one clears the notice): everything there is to say, at once.
          const said: string[] = [];
          if (bundle.unreadable.length) said.push(`This browser couldn't unpack ${bundle.unreadable.join(', ')}, so ${bundle.unreadable.length === 1 ? "it isn't" : "they aren't"} open here and saving won't include ${bundle.unreadable.length === 1 ? 'it' : 'them'}.`);
          if (unkept.length) said.push(`The files of ${unkept.join(', ')} are too big to keep after a reload: save before closing the page.`);
          if (said.length) notice(said.join(' '), { kind: 'warning' });
          return;
        }
        const pkg = await readPackage(buf);
        if (!pkg) {
          notice(`${file.name} doesn't contain a handler.js this page can read.`, { kind: 'error' });
          return;
        }
        deps.loadSource(pkg.handler.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), { name: file.name.replace(/\.(zip|nc)$/i, '.js'), kind: 'draft' });
        // The package's other files: kept, and saved with the handler.
        deps.setPackageFiles(pkg.files);
        const kept = storeFiles(pkg.files);
        const n = pkg.files.length;
        const lost = pkg.unreadable.length ? ` This browser couldn't unpack ${pkg.unreadable.join(', ')}, so saving won't include ${pkg.unreadable.length === 1 ? 'it' : 'them'}.` : '';
        // The "+ N files" chip shows the files; only what needs saying goes in a notice.
        if (!kept || lost) notice(`${kept ? '' : `The ${n} other file${n === 1 ? '' : 's'} are too big to keep after a reload: save before closing the page.`}${lost}`.trim(), { kind: 'warning' });
        return;
      }
      const text = await file.text();
      deps.loadSource(text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), { name: file.name, kind: 'draft' });
    } catch {
      notice(`Couldn't read ${file.name}.`, { kind: 'error' });
    }
  }
  const clean = (text: string) => text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  /** Opens one handler of a folder. What the person should know about it comes back, for the caller to show once
   *  everything is open (opening a handler clears the notice, so a warning shown earlier would be gone). */
  async function openFolderHandler(h: FolderHandler): Promise<{ text: string; kind: 'warning' | 'error' } | undefined> {
    try {
      if (h.files.length > FOLDER_MAX_FILES) {
        deps.loadSource(clean(await h.js.text()), { name: h.name, kind: 'draft' });
        return { text: `${h.name} has ${h.files.length} files beside it, which looks like a game's folder, not a handler's: opened without them.`, kind: 'warning' };
      }
      const files: PackageFile[] = [];
      for (const f of h.files) files.push({ name: f.name, data: new Uint8Array(await f.file.arrayBuffer()) });
      deps.loadSource(clean(await h.js.text()), { name: h.name, kind: 'draft' });
      if (!files.length) return undefined;
      deps.setPackageFiles(files);
      if (!storeFiles(files)) return { text: `${h.name}: the ${files.length} other file${files.length === 1 ? '' : 's'} are too big to keep after a reload, so save before closing the page.`, kind: 'warning' };
    } catch {
      return { text: `Couldn't read ${h.name}.`, kind: 'error' };
    }
    return undefined;
  }
  async function openFolderHandlers(list: FolderHandler[]) {
    const said: { text: string; kind: 'warning' | 'error' }[] = [];
    for (const h of list) { const w = await openFolderHandler(h); if (w) said.push(w); }
    if (said.length) notice(said.map((w) => w.text).join(' '), { kind: said.some((w) => w.kind === 'error') ? 'error' : 'warning' });
  }
  async function openFolder(picked: File[]) {
    const rel = (f: File) => ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).replace(/\\/g, '/');
    const folder = rel(picked[0]).split('/')[0] || 'handler';
    const found = handlersInFolder(folder, picked.map((file) => ({ path: rel(file).split('/').slice(1).join('/'), file })));
    if (!found.length) return notice(`${folder} has no handler: a .js file at its top (with its files in a folder of the same name), or a handler.js.`, { kind: 'error' });
    if (found.length === 1) return void openFolderHandlers(found);
    deps.choose(found.map((h) => h.name), (which) => void openFolderHandlers(which.map((i) => found[i])));
  }
  const folderInput = document.createElement('input');
  folderInput.type = 'file';
  folderInput.id = 'folder-input';
  folderInput.hidden = true;
  folderInput.setAttribute('webkitdirectory', '');
  document.body.append(folderInput);
  folderInput.addEventListener('change', () => {
    const list = [...(folderInput.files ?? [])];
    if (list.length) void openFolder(list);
    folderInput.value = '';
  });
  const fileInput = $('#file-input') as HTMLInputElement;
  $('#file-open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) openFile(f);
    fileInput.value = '';
  });
  // Dropping a file anywhere on the page opens it; the whole window says so while a file is dragged over it. Over the
  // open Files panel the drop adds the file to this handler's package instead (packageui.ts), and the panel says that.
  // Shown by dragover; hidden when the drag leaves the window (a dragleave with nowhere to go), is dropped, or ends.
  // Counting dragenter/dragleave, as before, lost count over the editor's nested elements and showed the hint only
  // some of the time. A held-still file gets a dragover only every ~350 ms (the HTML spec's drag loop), so the
  // safety timer, for a drag that ends without any event here, is far longer than that (5 s).
  const dropHint = $('#drop-hint');
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files');
  const overFiles = (e: DragEvent) => !!(e.target as Element | null)?.closest?.('#files-panel');
  let hideTimer = 0;
  const show = (where: 'page' | 'files' | null) => {
    dropHint.hidden = where !== 'page';
    document.getElementById('files-panel')?.classList.toggle('drop-add', where === 'files');
  };
  window.addEventListener(
    'dragover',
    (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      const files = overFiles(e);
      e.dataTransfer!.dropEffect = 'copy';
      show(files ? 'files' : 'page');
      clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => show(null), 5000);
    },
    true,
  );
  window.addEventListener('dragend', () => show(null), true);
  // Out of the window: the pointer is over nothing of this page (no element it goes to, or outside the viewport).
  window.addEventListener(
    'dragleave',
    (e) => {
      if (!hasFiles(e)) return;
      // Outside the viewport, or (Safari, and some Chromium versions) no target and no position at all. A missing
      // target alone isn't enough: some browsers leave it out when moving between elements inside the page.
      const out = e.clientX < 0 || e.clientY < 0 || e.clientX >= innerWidth || e.clientY >= innerHeight || (!e.relatedTarget && e.clientX === 0 && e.clientY === 0);
      if (out) { clearTimeout(hideTimer); show(null); }
    },
    true,
  );
  window.addEventListener(
    'drop',
    (e) => {
      if (!hasFiles(e)) return;
      clearTimeout(hideTimer);
      show(null);
      if (overFiles(e)) return; // the Files panel adds it to the package
      e.preventDefault();
      e.stopPropagation(); // not into the code editor as text
      const f = e.dataTransfer!.files[0];
      if (f) openFile(f);
    },
    true,
  );
  return { fileInput, folderInput, openFolder };
}
