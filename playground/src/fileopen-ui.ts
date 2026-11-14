// Open a file from the computer, with the picker (Open a file…) or by dropping it on the page: a handler (.js), or
// a .zip/.nc package, whose other files are kept and saved with it.
import { $ } from './dom';
import { notice } from './toast';
import { readPackage, storeFiles, type PackageFile } from './package';

export interface FileOpenDeps {
  loadSource: (src: string, meta: { name: string; kind: 'draft' }) => void;
  setPackageFiles: (files: PackageFile[]) => void;
}

/** Wires the picker and drag & drop; returns the file input (its click opens the picker). */
export function initFileOpen(deps: FileOpenDeps): HTMLInputElement {
  async function openFile(file: File) {
    try {
      if (/\.(zip|nc)$/i.test(file.name)) {
        const pkg = await readPackage(await file.arrayBuffer());
        if (!pkg) {
          notice(`${file.name} doesn't contain a handler.js this page can read.`, { kind: 'error' });
          return;
        }
        deps.loadSource(pkg.handler.replace(/^﻿/, '').replace(/\r\n/g, '\n'), { name: file.name.replace(/\.(zip|nc)$/i, '.js'), kind: 'draft' });
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
      deps.loadSource(text.replace(/^﻿/, '').replace(/\r\n/g, '\n'), { name: file.name, kind: 'draft' });
    } catch {
      notice(`Couldn't read ${file.name}.`, { kind: 'error' });
    }
  }
  const fileInput = $('#file-input') as HTMLInputElement;
  $('#file-open').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) openFile(f);
    fileInput.value = '';
  });
  // Dropping a file anywhere on the page opens it; the whole window says so while a file is dragged over it. Over the
  // open Files panel the drop adds the file to this handler's package instead (packageui.ts), and the panel says that.
  // Driven by dragover alone (it repeats while the pointer is over the page, also when it holds still): when it stops
  // coming, the pointer left the window or the drag ended. Counting dragenter/dragleave, as before, lost count over
  // the editor's nested elements and showed the hint only some of the time.
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
      hideTimer = window.setTimeout(() => show(null), 200);
    },
    true,
  );
  window.addEventListener('dragend', () => show(null), true);
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
  return fileInput;
}
