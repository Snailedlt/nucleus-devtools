// Which .js files in the workspace are Nucleus handlers, as the context key `splitscreenme.handlerFiles` (their
// paths), so Package and Install show in the Explorer's right-click menu for handlers only, not for every .js file
// (`resourcePath in splitscreenme.handlerFiles`). Found the way Lint All finds them; kept up to date as files are
// opened, saved, created and deleted.
import * as vscode from 'vscode';
import { promises as fs } from 'node:fs';

const KEY = 'splitscreenme.handlerFiles';
const MAX = 2000;

export function registerHandlerFiles(context: vscode.ExtensionContext, isHandlerText: (fsPath: string, text: string) => boolean, isHandler: (d: vscode.TextDocument) => boolean) {
  const paths = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const publish = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void vscode.commands.executeCommand('setContext', KEY, [...paths]), 100);
  };
  const set = (fsPath: string, on: boolean) => {
    if (on === paths.has(fsPath)) return;
    if (on) paths.add(fsPath);
    else paths.delete(fsPath);
    publish();
  };
  // A generation per path: a read that finishes after a newer event (a deletion, an edit, another read) is dropped.
  const gen = new Map<string, number>();
  const bump = (p: string) => {
    const g = (gen.get(p) ?? 0) + 1;
    gen.set(p, g);
    return g;
  };
  const check = async (uri: vscode.Uri, fromDisk = false) => {
    if (uri.scheme !== 'file' || !/\.js$/i.test(uri.fsPath)) return;
    const g = bump(uri.fsPath);
    let on = false;
    try {
      // An open file: as the editor sees it (its language mode, its unsaved text); else (or just closed) from disk.
      const open = fromDisk ? undefined : vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
      on = open ? isHandler(open) : isHandlerText(uri.fsPath, await fs.readFile(uri.fsPath, 'utf8'));
    } catch {
      /* gone or unreadable */
    }
    if (gen.get(uri.fsPath) === g) set(uri.fsPath, on);
  };
  const doc = (d: vscode.TextDocument) => {
    if (d.uri.scheme !== 'file' || !/\.js$/i.test(d.uri.fsPath)) return;
    bump(d.uri.fsPath);
    set(d.uri.fsPath, isHandler(d));
  };
  const removed = (u: vscode.Uri) => {
    bump(u.fsPath);
    set(u.fsPath, false);
  };
  const scan = () =>
    void Promise.resolve(vscode.workspace.findFiles('**/*.js', '**/{node_modules,.git,dist,out}/**', MAX))
      .then(async (uris) => {
        for (const u of uris ?? []) await check(u);
      })
      .catch(() => {});
  vscode.workspace.textDocuments.forEach(doc);
  // Unsaved edits can make a file a handler or not: classified again a moment after typing stops.
  const typing = new Map<string, ReturnType<typeof setTimeout>>();
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc),
    vscode.workspace.onDidSaveTextDocument(doc),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const d = e.document;
      if (d.uri.scheme !== 'file' || !/\.js$/i.test(d.uri.fsPath)) return;
      clearTimeout(typing.get(d.uri.fsPath));
      typing.set(d.uri.fsPath, setTimeout(() => {
        typing.delete(d.uri.fsPath);
        if (!d.isClosed) doc(d);
      }, 300));
    }),
    // Closed (perhaps unsaved, or in another language mode): what the file on disk is decides again.
    vscode.workspace.onDidCloseTextDocument((d) => {
      clearTimeout(typing.get(d.uri.fsPath));
      typing.delete(d.uri.fsPath);
      void check(d.uri, true);
    }),
    { dispose: () => typing.forEach((t) => clearTimeout(t)) },
  );
  if (vscode.workspace.workspaceFolders?.length) {
    scan();
    const w = vscode.workspace.createFileSystemWatcher('**/*.js');
    context.subscriptions.push(w, w.onDidCreate(check), w.onDidChange(check), w.onDidDelete(removed));
  }
  // Detection changed (off, always, the globs): what counts as a handler is decided again, everywhere.
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('splitscreenme.detection') && !e.affectsConfiguration('splitscreenme.handlerGlobs')) return;
      for (const p of [...paths]) removed(vscode.Uri.file(p));
      vscode.workspace.textDocuments.forEach(doc);
      if (vscode.workspace.workspaceFolders?.length) scan();
    }),
  );
}
