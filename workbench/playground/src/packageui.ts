// Handler packages in the workbench: the Files panel (each open handler laid out like its Hub package: handler.js,
// then its other files. One handler open: its files, under its name. Several: a folder each, the one being worked on
// open and the others shut, a click away), a second editor for a package's text files (ini, cfg,
// json, xml…, with highlighting and checks) and a card for binaries. handler.js stays in the main editor, so
// everything that reads "the handler" keeps reading it. The tabs above the code (one per open file) are the host's.
import CodeMirror from 'codemirror';
import { wrapEditor, wrapOn } from './wrap';
import 'codemirror/mode/properties/properties';
import 'codemirror/mode/xml/xml';
import 'codemirror/mode/toml/toml';
import 'codemirror/mode/yaml/yaml';
import 'codemirror/mode/powershell/powershell';
import 'codemirror/mode/lua/lua';
// Steam's KeyValues files (.vdf, .acf): "key" "value" pairs in { } blocks, // comments.
CodeMirror.defineMode('nucleus-vdf', () => ({
  startState: () => ({ key: true }),
  token: (stream: any, state: any) => {
    if (stream.sol()) state.key = true;
    if (stream.eatSpace()) return null;
    if (stream.match('//')) { stream.skipToEnd(); return 'comment'; }
    if (stream.match(/^"(?:[^"\\]|\\.)*"?/)) { const k = state.key; state.key = !k; return k ? 'property' : 'string'; }
    if (stream.match(/^[{}]/)) { state.key = true; return 'bracket'; }
    if (stream.match(/^\[[^\]]*\]/)) return 'meta';
    stream.next();
    return null;
  },
  lineComment: '//',
}));
// Batch files (.bat, .cmd): rem / :: comments, :labels, %VARS% and %~dp0, "strings", @echo and the common commands.
CodeMirror.defineMode('nucleus-batch', () => ({
  startState: () => ({}),
  token: (stream: any) => {
    if (stream.sol()) {
      stream.eatSpace();
      if (stream.match(/^(rem\b|::)/i)) { stream.skipToEnd(); return 'comment'; }
      if (stream.match(/^:[\w.-]+/)) return 'def';
      if (stream.match('@')) return 'meta';
    }
    if (stream.eatSpace()) return null;
    if (stream.match(/^%~?[\w]*%?|^![\w]+!/)) return 'variable-2';
    if (stream.match(/^"(?:[^"]|"")*"?/)) return 'string';
    if (stream.match(/^(echo|off|on|set|setlocal|endlocal|if|else|not|exist|errorlevel|defined|for|in|do|goto|call|exit|start|cd|pushd|popd|copy|xcopy|move|del|mkdir|md|rmdir|rd|timeout|pause|shift|choice|powershell|cmd|taskkill|reg)\b/i)) return 'keyword';
    if (stream.match(/^-\w+|^\/\w+/)) return 'attribute';
    if (stream.match(/^\d+\b/)) return 'number';
    if (stream.match(/^[&|<>()=]+/)) return 'operator';
    stream.next();
    return null;
  },
  lineComment: 'rem',
}));
import type { PackageFile } from './package';
import { icon } from './icons';
import { fileSize, sizeOf } from './package';
import { BADGE, bytesOf, checkFileText, checkPackage, gameFolderName, installPath, kindOf, MODE, textOf, type PkgProblem } from './pkgcheck';

type CM = any;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const $ = (s: string) => document.querySelector(s) as HTMLElement;
declare const BUILD: { logo?: string | null };
export const fileIcon = (name: string) => { const k = kindOf(name); return `<span class="fi-badge fi-${k}" aria-hidden="true">${BADGE[k]}</span>`; };
/** The handler itself: Nucleus Co-op's logo, as VS Code shows it (the JS badge when the build has no logo). */
export const handlerIcon = () => (typeof BUILD !== 'undefined' && BUILD.logo ? `<img class="fi-logo" src="${BUILD.logo}" alt="" aria-hidden="true">` : fileIcon('handler.js'));

/** An open handler, as the Files panel lists it. */
export interface PkgHandler {
  id: string;
  /** The game's name: the folder's label. */
  name: string;
  /** The one in the editor. */
  on: boolean;
  /** Its package's other files. */
  files: PackageFile[];
  /** What Check found in its handler.js, when it has been checked. */
  counts?: { e: number; w: number };
}
export interface PkgHost {
  editor: CM;
  /** Every open handler, in the order of the list. */
  handlers(): PkgHandler[];
  /** Makes a handler the one in the editor (nothing happens when it is already). */
  switchTo(id: string): void;
  /** Closes a handler: out of the list, with its tabs. */
  closeHandler(id: string): void;
  /** The open-file tabs may have changed: which files are open, which one shows. */
  tabsChanged(): void;
  /** The files of the handler in the editor. */
  getFiles(): PackageFile[];
  /** Replaces the package's files (store them, update the header). */
  setFiles(files: PackageFile[]): void;
  /** Called when the main editor should show again (the host re-applies Code / Form). */
  showMain(): void;
  /** Called when the package's problems may have changed. */
  changed(): void;
  /** Optional: HTML for a handler's last rows (its game on this PC), and their clicks ([data-gf]). */
  extraSection?(id: string, indent?: number): string;
  onExtra?(act: string): void;
  /** Optional: the New or open menu, for the + in the list's head. */
  newMenu?(anchor: HTMLElement): void;
}

export function initPackageUI(host: PkgHost) {
  let active: string | null = null; // null: handler.js
  let open: string[] = [];
  /** Nothing shows in the code pane: every tab is closed. */
  let empty = false;
  /** The handlers folded shut in the list. */
  const folded = new Set<string>();
  let fileEd: CM = null;
  const docs = new Map<string, { doc: CM; enc: ReturnType<typeof textOf> extends infer T ? (T extends { enc: infer E } ? E : never) : never }>();
  let saveTimer = 0;
  /** The file whose edits wait for the pause in typing (not necessarily the one shown now). */
  let pendingFile: string | null = null;
  let blobUrl = '';

  const files = () => host.getFiles();
  const handler = () => host.editor.getValue() as string;

  function ensureEditor() {
    if (fileEd) return fileEd;
    fileEd = CodeMirror($('#file-editor'), {
      lineNumbers: true, indentUnit: 2, tabSize: 2, lineWrapping: wrapOn(),
      gutters: ['CodeMirror-lint-markers', 'CodeMirror-linenumbers'],
      lint: { getAnnotations: (text: string) => (active ? checkFileText(active, text) : []).map((p) => ({ from: CodeMirror.Pos((p.line ?? 1) - 1, 0), to: CodeMirror.Pos((p.line ?? 1) - 1, 999), message: `${p.title}. ${p.why}`, severity: p.severity })), delay: 300 },
    } as any);
    fileEd.getInputField().setAttribute('aria-label', 'The file');
    // As the main editor: one tab stop (the scroller) that hands focus to the editor (WCAG 2.1.1).
    {
      const scroller = fileEd.getScrollerElement() as HTMLElement;
      scroller.tabIndex = 0;
      scroller.setAttribute('role', 'region');
      scroller.setAttribute('aria-label', 'The file');
      fileEd.getInputField().tabIndex = -1;
      scroller.addEventListener('focus', (e: FocusEvent) => { if (e.target === scroller) fileEd.focus(); });
    }
    wrapEditor(fileEd); // Settings › Wrap long lines, Alt+Z
    fileEd.on('change', () => {
      if (pendingFile && pendingFile !== active) commit(); // another file's wait ends here
      pendingFile = active;
      clearTimeout(saveTimer);
      saveTimer = window.setTimeout(commit, 350);
    });
    return fileEd;
  }

  /**
   * The edited file's text into the package (after a short pause in typing, or at once by flush). It goes by the
   * file that was edited and that file's own document, so moving to handler.js or another file first loses nothing.
   */
  function commit() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const name = pendingFile;
    pendingFile = null;
    const d = name ? docs.get(name) : undefined;
    if (!name || !d) return;
    host.setFiles(files().map((f) => (f.name === name && !f.remote ? { name: f.name, data: bytesOf(d.doc.getValue(), d.enc) } : f)));
    host.changed();
  }
  const flush = () => { if (pendingFile) commit(); };

  function show(which: 'main' | 'text' | 'card') {
    empty = false;
    $('#file-editor').hidden = which !== 'text';
    $('#file-card').hidden = which !== 'card';
    if (which === 'main') host.showMain();
    else $('#editor').hidden = true;
  }

  function openFile(name: string, line?: number) {
    const f = files().find((x) => x.name === name);
    if (!f) return showHandler();
    if (!open.includes(name)) open.push(name);
    active = name;
    if (f.remote) {
      renderRemoteCard(f);
      show('card');
      render();
      return host.tabsChanged();
    }
    const t = textOf(f.data);
    if (t) {
      const ed = ensureEditor();
      let d = docs.get(name);
      if (!d) { d = { doc: CodeMirror.Doc(t.text, MODE[kindOf(name)] ?? null), enc: t.enc }; docs.set(name, d); }
      show('text');
      ed.swapDoc(d.doc);
      ed.refresh();
      (ed as any).performLint?.();
      if (line) { ed.setCursor(line - 1, 0); ed.scrollIntoView({ line: line - 1, ch: 0 }, 80); }
      ed.focus();
    } else {
      renderCard(f);
      show('card');
    }
    render();
    host.tabsChanged();
  }
  function showHandler() {
    active = null;
    show('main');
    render();
    host.tabsChanged();
  }
  /** Every tab is closed: the code pane says so, and how to get a file back. */
  function showEmpty() {
    active = null;
    const on = host.handlers().find((h) => h.on);
    $('#file-card').innerHTML = `<div class="fc-empty"><h2>No file is open</h2><p>Pick a file in Files, or open ${on ? `<b>${esc(on.name)}</b>'s` : "the handler's"} code again.</p><div class="fp-actions"><button class="btn primary" type="button" data-card="main">Open handler.js</button></div></div>`;
    $('#file-card').querySelector('[data-card=main]')!.addEventListener('click', () => showHandler());
    show('card');
    empty = true;
    render();
    host.tabsChanged();
  }
  /** Closes a file's tab. The host shows another tab when this one was showing. */
  function closeFile(name: string) {
    open = open.filter((n) => n !== name);
    if (active === name) active = null;
  }

  function renderCard(f: PackageFile) {
    const k = kindOf(f.name);
    const to = installPath(f.name, gameFolderName(handler()));
    const base = f.name.split('/').pop()!;
    const uses = handler().split('\n').map((l, i) => (l.toLowerCase().includes(base.toLowerCase()) ? i + 1 : 0)).filter(Boolean);
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = k === 'img' ? URL.createObjectURL(new Blob([f.data as BlobPart])) : '';
    $('#file-card').innerHTML = `<h2>${fileIcon(f.name)}${esc(base)}</h2>
      <dl><dt>In the package</dt><dd>${esc(f.name)}</dd><dt>Size</dt><dd>${fileSize(f.data.length)}</dd>
      <dt>Installs to</dt><dd>${to ? `<code>${esc(to)}</code>` : '<span style="color:var(--warn)">nowhere: files at the top level are dropped by a Hub install</span>'}</dd>
      <dt>Used by handler.js</dt><dd>${uses.length ? uses.slice(0, 6).map((n) => `<button class="link" type="button" data-line="${n}">line ${n}</button>`).join(', ') : '<span class="muted">not by name</span>'}</dd></dl>
      ${blobUrl ? `<img src="${blobUrl}" alt="${esc(base)}">` : `<p class="muted">A ${k === 'dll' ? 'library (DLL)' : k === 'exe' ? 'program' : 'binary file'}: it can't be edited here, only kept, replaced or removed.</p>`}
      <div class="fp-actions"><button class="btn" type="button" data-card="download">Download</button><button class="btn" type="button" data-card="remove">Remove from the package</button></div>`;
    $('#file-card').querySelectorAll<HTMLButtonElement>('[data-line]').forEach((b) => b.addEventListener('click', () => {
      showHandler();
      const pos = { line: Number(b.dataset.line) - 1, ch: 0 };
      host.editor.setCursor(pos); host.editor.scrollIntoView(pos, 80); host.editor.focus();
    }));
    $('#file-card').querySelector('[data-card=download]')!.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([f.data as BlobPart]));
      a.download = base;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
    $('#file-card').querySelector('[data-card=remove]')!.addEventListener('click', () => removeFile(f.name));
  }

  // A file of a Hub package that's too big to bring along: what it is, and where the original is.
  function renderRemoteCard(f: PackageFile) {
    const to = installPath(f.name, gameFolderName(handler()));
    const base = f.name.split('/').pop()!;
    $('#file-card').innerHTML = `<h2>${fileIcon(f.name)}${esc(base)} <span class="chip info fp-hub">Hub</span></h2>
      <p>In the Hub package, not downloaded here (${fileSize(f.remote!.size)}). <a href="${esc(f.remote!.url)}" target="_blank" rel="noopener">Get the original package from the Hub</a>.</p>
      <dl><dt>In the package</dt><dd>${esc(f.name)}</dd><dt>Size</dt><dd>${fileSize(f.remote!.size)}</dd>
      <dt>Installs to</dt><dd>${to ? `<code>${esc(to)}</code>` : '<span style="color:var(--warn)">nowhere: files at the top level are dropped by a Hub install</span>'}</dd></dl>
      <p class="muted">Saving this package leaves it out: add your own copy (Add files…) to save it with the handler.</p>
      <div class="fp-actions"><button class="btn" type="button" data-card="remove">Remove from the package</button></div>`;
    $('#file-card').querySelector('[data-card=remove]')!.addEventListener('click', () => removeFile(f.name));
  }

  function removeFile(name: string) {
    if (pendingFile === name) { clearTimeout(saveTimer); saveTimer = 0; pendingFile = null; }
    host.setFiles(files().filter((f) => f.name !== name));
    docs.delete(name);
    open = open.filter((n) => n !== name);
    if (active === name) showHandler();
    else { render(); host.tabsChanged(); }
    host.changed();
  }
  function moveFile(from: string, to: string) {
    flush();
    host.setFiles(files().map((f) => (f.name === from ? { ...f, name: to } : f)));
    const d = docs.get(from);
    if (d) { docs.delete(from); docs.set(to, d); }
    open = open.map((n) => (n === from ? to : n));
    if (active === from) active = to;
    render();
    host.tabsChanged();
    host.changed();
  }
  async function addFiles(list: FileList | File[]) {
    const tops = [...new Set(files().filter((f) => f.name.includes('/')).map((f) => f.name.split('/')[0]))];
    const folder = tops[0] ?? gameFolderName(handler());
    const added: PackageFile[] = [];
    for (const file of [...list]) {
      const rel = ((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name).replace(/\\/g, '/');
      added.push({ name: `${folder}/${rel}`, data: new Uint8Array(await file.arrayBuffer()) });
    }
    const names = new Set(added.map((a) => a.name.toLowerCase()));
    host.setFiles([...files().filter((f) => !names.has(f.name.toLowerCase())), ...added]);
    render();
    host.changed();
    if (added[0]) openFile(added[0].name);
  }

  /** The rows of one handler's files. A package with one top-level folder (the usual one, named after the game) shows
   *  that folder's contents straight under the game, as the Hub install puts them; several folders show as they are. */
  function fileRows(h: PkgHandler, game: string, base: number): string[] {
    const fs = h.files;
    const tops = new Set(fs.filter((f) => f.name.includes('/')).map((f) => f.name.split('/')[0]));
    const flat = tops.size === 1 && fs.every((f) => f.name.includes('/'));
    const sorted = [...fs].sort((a, b) => (a.name.includes('/') === b.name.includes('/') ? a.name.localeCompare(b.name) : a.name.includes('/') ? 1 : -1));
    const seenDirs = new Set<string>();
    const rows: string[] = [];
    const pad = (depth: number) => base + depth * 14;
    for (const f of sorted) {
      const full = f.name.split('/');
      const parts = flat ? full.slice(1) : full;
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (!seenDirs.has(dir)) { seenDirs.add(dir); rows.push(`<li class="fp-dir" style="padding-left:${pad(i - 1)}px">${icon('chevron-down', 13, 'ui-ico fp-tw')}${esc(parts[i - 1])}/</li>`); }
      }
      const depth = parts.length - 1;
      const dropped = full.length < 2;
      rows.push(`<li class="fp-item${dropped ? ' dropped' : ''}"><button type="button" class="fp-open" data-fp="${esc(f.name)}" data-h="${h.id}" aria-current="${h.on && active === f.name}" style="padding-left:${pad(depth)}px" title="${esc(dropped ? 'At the top level of the package: a Hub install drops it' : `In the package: ${f.name}\nInstalls to ${installPath(f.name, game)}`)}">${fileIcon(f.name)}<span class="fp-name">${esc(parts[parts.length - 1])}</span>${f.remote ? '<span class="fp-hub" title="In the Hub package, not downloaded here">Hub</span>' : ''}<span class="fp-size">${fileSize(sizeOf(f))}</span></button><button type="button" class="fp-del" data-fp-del="${esc(f.name)}" data-h="${h.id}" aria-label="Remove ${esc(f.name)}" title="Remove from the package">${icon('x', 13)}</button></li>`);
    }
    return rows;
  }

  function render() {
    const fs = files();
    // The Files button: how many files the open handler has besides handler.js.
    $('#files-n').textContent = fs.length ? String(fs.length) : '';
    open = open.filter((n) => fs.some((f) => f.name === n));
    // The Files panel: every open handler, a folder each.
    const panel = $('#files-panel');
    if (panel.hidden) return;
    const list = host.handlers();
    const on = list.find((h) => h.on);
    // The list is drawn anew: the keyboard's place in it is kept (the row with the same handler and file).
    const at = document.activeElement as HTMLElement | null;
    const place = at && panel.contains(at)
      ? Object.entries(at.dataset).map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}="${CSS.escape(v ?? '')}"]`).join('')
      : '';
    if (place) queueMicrotask(() => panel.querySelector<HTMLElement>(place)?.focus());
    const badge = (c?: { e: number; w: number }) => (!c ? '' : c.e ? `<span class="fp-cnt e" title="${c.e} error${c.e === 1 ? '' : 's'} in handler.js">${c.e}</span>` : c.w ? `<span class="fp-cnt w" title="${c.w} warning${c.w === 1 ? '' : 's'} in handler.js">${c.w}</span>` : '<span class="fp-cnt ok" title="Ready for Nucleus">✓</span>');
    // One handler open (what most people have): its files right under its name, no folder to open. Several: a folder
    // each, the one in the editor open and the others shut, so the list stays about the handler being worked on.
    const single = list.length === 1;
    const groups = list.map((h) => {
      const shut = !single && (h.on ? folded.has(h.id) : true);
      const game = h.on ? gameFolderName(handler()) : h.name;
      const tip = esc(`${h.name}: installs to handlers\\${game}\\`);
      const acts = `<button type="button" class="fp-del" data-fp-add data-h="${h.id}" aria-label="Add files to ${esc(h.name)}" title="Add files… (or drop them on the list)">${icon('file-plus', 14)}</button><button type="button" class="fp-del" data-fp-hclose="${h.id}" aria-label="Close ${esc(h.name)}" title="Close this handler">${icon('x', 14)}</button>`;
      const head = single
        ? `<div class="fp-item fp-hrow fp-one" title="${tip}"><span class="fp-open fp-title"><span class="fp-name">${esc(h.name)}</span>${badge(h.counts)}</span>${acts}</div>`
        : `<div class="fp-item fp-hrow"><button type="button" class="fp-open fp-fold" data-fp-fold="${h.id}" aria-expanded="${!shut}" title="${h.on ? tip : esc(`Switch to ${h.name}`)}">${icon(shut ? 'chevron-right' : 'chevron-down', 14, 'ui-ico fp-tw')}<span class="fp-name">${esc(h.name)}</span>${badge(h.counts)}</button>${acts}</div>`;
      if (shut) return `<li class="fp-h${h.on ? ' on' : ''}" data-h="${h.id}">${head}</li>`;
      const base = single ? 8 : 22;
      const rows = [`<li class="fp-item"><button type="button" class="fp-open" data-fp="" data-h="${h.id}" aria-current="${h.on && active === null && !empty}" style="padding-left:${base}px">${handlerIcon()}<span class="fp-name">handler.js</span></button></li>`, ...fileRows(h, game, base)];
      return `<li class="fp-h${h.on ? ' on' : ''}" data-h="${h.id}">${head}<ul class="fp-list">${rows.join('')}${host.extraSection?.(h.id, base) ?? ''}</ul></li>`;
    });
    $('#files-list').innerHTML = `<div class="fp-head"><span>Files</span>${host.newMenu ? `<button type="button" class="fp-ibtn" data-fp-new aria-haspopup="menu" aria-label="New handler, or open a file, a folder or an example" title="New or open">${icon('plus', 15)}</button>` : ''}</div><ul class="fp-list fp-tree" aria-label="${esc(`Open handlers. Files dropped here are added to ${on ? on.name : 'the handler'}`)}">${groups.join('')}</ul>`;
  }

  /** The Files panel in or out; the buttons that toggle it say which. Beside the code (not as a phone's sheet) the
   *  choice is kept for the next visit. */
  const SHOWN_KEY = 'nucleus-workbench-files-shown';
  const beside = () => matchMedia('(min-width: 861px)').matches;
  function setPanel(shown: boolean, keep = true) {
    const panel = $('#files-panel');
    panel.hidden = !shown;
    if (keep && beside()) try { localStorage.setItem(SHOWN_KEY, shown ? '1' : '0'); } catch { /* this visit only */ }
    document.querySelectorAll('#files-toggle, .rail [data-rail=files]').forEach((b) => b.setAttribute('aria-pressed', String(shown)));
    render();
    requestAnimationFrame(() => (host.editor.refresh(), fileEd?.refresh()));
  }

  // Events
  $('#files-toggle').addEventListener('click', () => setPanel(!!$('#files-panel').hidden));
  const picker = document.createElement('input');
  picker.type = 'file'; picker.multiple = true; picker.hidden = true;
  document.body.append(picker);
  picker.addEventListener('change', () => { if (picker.files?.length) void addFiles(picker.files); picker.value = ''; });
  const panel = $('#files-panel');
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const fold = t.closest<HTMLElement>('[data-fp-fold]');
    if (fold) {
      // The handler being worked on folds and unfolds; another one comes into the editor (and opens here).
      const id = fold.dataset.fpFold!;
      if (!host.handlers().find((h) => h.id === id)?.on) { folded.delete(id); return host.switchTo(id); }
      if (!folded.delete(id)) folded.add(id);
      render();
      panel.querySelector<HTMLElement>(`[data-fp-fold="${id}"]`)?.focus();
      return;
    }
    const shut = t.closest<HTMLElement>('[data-fp-hclose]');
    if (shut) return host.closeHandler(shut.dataset.fpHclose!);
    const add = t.closest<HTMLElement>('[data-fp-add]');
    if (add) { if (add.dataset.h) host.switchTo(add.dataset.h); return picker.click(); }
    const fresh = t.closest<HTMLElement>('[data-fp-new]');
    if (fresh) return host.newMenu?.(fresh);
    // Everything else is about one handler's rows: that handler comes into the editor first.
    const of = t.closest<HTMLElement>('[data-h]')?.dataset.h;
    const del = t.closest<HTMLElement>('[data-fp-del]');
    const gf = t.closest<HTMLElement>('[data-gf]');
    const o = t.closest<HTMLElement>('[data-fp]');
    if (!del && !gf && !o) return;
    if (of) host.switchTo(of);
    if (del) return removeFile(del.dataset.fpDel!);
    if (gf) return host.onExtra?.(gf.dataset.gf!);
    if (o) o.dataset.fp ? openFile(o.dataset.fp) : showHandler();
  });
  panel.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  panel.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files.length) void addFiles(e.dataTransfer.files); });

  // Files starts open where there's room for it beside the code and the results: the handlers and their files are the
  // way around, as the file list of a code editor. Whoever closed it finds it closed.
  {
    let kept: string | null = null;
    try { kept = localStorage.getItem(SHOWN_KEY); } catch { /* the default */ }
    setPanel(beside() && (kept ? kept === '1' : window.innerWidth >= 1100), false);
  }
  return {
    render,
    openFile,
    showHandler,
    showEmpty,
    closeFile,
    moveFile,
    setPanel,
    active: () => active,
    /** Every tab is closed: nothing shows in the code pane. */
    isEmpty: () => empty,
    /** Something other than handler.js shows where the code is: a package file, or nothing. */
    away: () => active !== null || empty,
    /** The package files with a tab, in the order they were opened. */
    openList: () => [...open],
    /** Back to handler.js without touching the main editor (the host shows it). */
    deselect() { active = null; empty = false; $('#file-editor').hidden = true; $('#file-card').hidden = true; render(); },
    /** Edits still waiting for the pause in typing go into the package now (before Share, Save or a tab switch). */
    flush,
    /** A different handler: its handler.js in the editor, and the tabs it had (the host then shows the one that was up). */
    reset(tabs: string[] = []) { flush(); active = null; empty = false; open = [...tabs]; docs.clear(); $('#file-editor').hidden = true; $('#file-card').hidden = true; $('#editor').hidden = false; render(); },
    problems: (): PkgProblem[] => checkPackage(handler(), files()),
  };
}
