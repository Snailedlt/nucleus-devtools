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
  const check = async (uri: vscode.Uri) => {
    if (uri.scheme !== 'file' || !/\.js$/i.test(uri.fsPath)) return;
    try {
      set(uri.fsPath, isHandlerText(uri.fsPath, await fs.readFile(uri.fsPath, 'utf8')));
    } catch {
      set(uri.fsPath, false);
    }
  };
  const doc = (d: vscode.TextDocument) => d.uri.scheme === 'file' && /\.js$/i.test(d.uri.fsPath) && set(d.uri.fsPath, isHandler(d));
  vscode.workspace.textDocuments.forEach(doc);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(doc),
    vscode.workspace.onDidSaveTextDocument(doc),
  );
  if (vscode.workspace.workspaceFolders?.length) {
    void Promise.resolve(vscode.workspace.findFiles('**/*.js', '**/{node_modules,.git,dist,out}/**', MAX))
      .then(async (uris) => {
        for (const u of uris ?? []) await check(u);
      })
      .catch(() => {});
    const w = vscode.workspace.createFileSystemWatcher('**/*.js');
    context.subscriptions.push(w, w.onDidCreate(check), w.onDidChange(check), w.onDidDelete((u) => set(u.fsPath, false)));
  }
}
