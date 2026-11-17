// "Your game on this PC" in VS Code (splitscreenme-vscode#13): link a handler to the game's install folder, then the
// checks in core/gamefolder.ts (shared with the workbench) compare ExecutableName, BinariesFolder, the symlink lists
// and the like with the real files, with fixes; inside those lists, completion offers the game's own files.
// Only names and sizes are read; nothing leaves the PC.
import * as vscode from 'vscode';
import path from 'node:path';
import { checkAgainstFolder, folderLists, folderSummary, pickerOptions, type FolderFix } from './core/gamefolder';
import { folderAt, forgetFolder, readGameFolder } from './gamefolder-node';
import { RULES_URL } from './core/features';
import { log, status } from './log';
export { readGameFolder };

const SETTING = 'gameFolders';
/** Links made with the command: this PC's own state (by the handler's full path), never a settings file, so a
 *  path on your PC doesn't end up in a shared `.vscode/settings.json`. The setting (by file name) still works. */
const STATE = 'splitscreenme.gameFolders';
let store: vscode.Memento | undefined;
const linksOf = (): Record<string, string> => store?.get<Record<string, string>>(STATE) ?? {};

const keyOf = (doc: vscode.TextDocument) => path.basename(doc.uri.fsPath);
const settingMap = (doc: vscode.TextDocument) => vscode.workspace.getConfiguration('splitscreenme', doc.uri).get<Record<string, string>>(SETTING) ?? {};
/** The game folder linked to this handler, if any: by the command (this PC), else the setting (by file name). */
export function linkedFolder(doc: vscode.TextDocument): string | undefined {
  if (doc.uri.scheme !== 'file') return undefined;
  return linksOf()[doc.uri.fsPath] ?? settingMap(doc)[keyOf(doc)];
}

const fixOf = new WeakMap<vscode.Diagnostic, FolderFix>();

/** The problems the linked game folder shows in this handler (none when no folder is linked). */
export function gameFolderDiagnostics(doc: vscode.TextDocument, source: string, severity: Record<'error' | 'warning' | 'info', vscode.DiagnosticSeverity>): vscode.Diagnostic[] {
  const dir = linkedFolder(doc);
  const folder = dir ? folderAt(dir) : undefined;
  if (!folder) return [];
  return checkAgainstFolder(doc.getText(), folder).map((p) => {
    // A fact about the game (its engine, Steam, …) is a hint: no squiggle, shown on hover and in the language status.
    const d = new vscode.Diagnostic(new vscode.Range(doc.positionAt(p.start), doc.positionAt(Math.max(p.end, p.start))), `${p.title}. ${p.why}`, p.fact ? vscode.DiagnosticSeverity.Hint : severity[p.severity]);
    d.source = source;
    d.code = { value: 'game-folder', target: vscode.Uri.parse(RULES_URL) };
    if (p.fix) fixOf.set(d, p.fix);
    return d;
  });
}

export function registerGameFolders(context: vscode.ExtensionContext, isHandler: (d: vscode.TextDocument) => boolean, selector: vscode.DocumentSelector, recheck: (d: vscode.TextDocument) => void) {
  store = context.globalState;
  // Unlink shows in the palette only when the open handler has a folder linked.
  const markLinked = () => {
    const doc = vscode.window.activeTextEditor?.document;
    void vscode.commands.executeCommand('setContext', 'splitscreenme.gameFolderLinked', !!doc && isHandler(doc) && !!linkedFolder(doc));
  };
  markLinked();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(markLinked),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('splitscreenme.gameFolders') && markLinked()),
  );
  /** Links (or, with no folder, unlinks) the handler. Returns whether anything was linked before. */
  const save = async (doc: vscode.TextDocument, dir: string | undefined): Promise<boolean> => {
    const links = { ...linksOf() };
    let had = doc.uri.fsPath in links;
    if (dir) links[doc.uri.fsPath] = dir;
    else delete links[doc.uri.fsPath];
    await store!.update(STATE, links);
    // A link in the setting from an older version (or set by hand): unlinking removes it from where it is, and
    // only then is a settings file written.
    if (!dir) {
      const cfg = vscode.workspace.getConfiguration('splitscreenme', doc.uri);
      const info = cfg.inspect<Record<string, string>>(SETTING);
      const targets: [Record<string, string> | undefined, vscode.ConfigurationTarget][] = [
        [info?.workspaceFolderValue, vscode.ConfigurationTarget.WorkspaceFolder],
        [info?.workspaceValue, vscode.ConfigurationTarget.Workspace],
        [info?.globalValue, vscode.ConfigurationTarget.Global],
      ];
      for (const [map, target] of targets) {
        if (!map || !(keyOf(doc) in map)) continue;
        const next = { ...map };
        delete next[keyOf(doc)];
        await cfg.update(SETTING, next, target);
        had = true;
      }
    }
    return had;
  };
  const active = () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !isHandler(doc) || doc.uri.scheme !== 'file') {
      status('open a saved Nucleus Co-op handler first');
      return undefined;
    }
    return doc;
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('splitscreenme.linkGameFolder', async () => {
      const doc = active();
      if (!doc) return;
      const picked = await vscode.window.showOpenDialog({ canSelectFolders: true, canSelectFiles: false, title: `The folder ${keyOf(doc)}'s game is installed in (where its .exe is, or above)`, defaultUri: linkedFolder(doc) ? vscode.Uri.file(linkedFolder(doc)!) : undefined });
      const dir = picked?.[0]?.fsPath;
      if (!dir) return;
      forgetFolder(dir);
      const folder = folderAt(dir)!;
      await save(doc, dir);
      markLinked();
      recheck(doc);
      const sum = folderSummary(folder, doc.getText());
      const facts = sum.facts.map((f) => f.title).join(', ');
      log.info(`Linked ${doc.uri.fsPath} to ${dir}`);
      vscode.window.showInformationMessage(
        `Linked ${keyOf(doc)} to ${folder.name} (${folder.files.length.toLocaleString('en')} files${folder.truncated ? ', only partly listed' : ''}). ` +
          (sum.exe ? `Executable: ${sum.exe}.` : sum.exeName ? `${sum.exeName} isn't in it.` : 'Game.ExecutableName isn\'t set.') +
          (facts ? ` ${facts}.` : '') + ' Only names and sizes are read.',
      );
    }),
    vscode.commands.registerCommand('splitscreenme.unlinkGameFolder', async () => {
      const doc = active();
      if (!doc) return;
      const had = await save(doc, undefined);
      markLinked();
      recheck(doc);
      status(had ? `unlinked ${keyOf(doc)} from its game's folder` : `${keyOf(doc)} isn't linked to a game's folder`);
    }),
    // Fixes for the folder problems (e.g. the exe's real name, BinariesFolder set to where the exe is).
    vscode.languages.registerCodeActionsProvider(selector, {
      provideCodeActions: (doc, _r, ctx) =>
        ctx.diagnostics.flatMap((d) => {
          const f = fixOf.get(d);
          if (!f) return [];
          const a = new vscode.CodeAction(f.title, vscode.CodeActionKind.QuickFix);
          a.edit = new vscode.WorkspaceEdit();
          a.edit.replace(doc.uri, new vscode.Range(doc.positionAt(f.start), doc.positionAt(f.end)), f.text);
          a.diagnostics = [d];
          a.isPreferred = true;
          return [a];
        }),
    }, { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }),
    // Inside DirSymlinkExclusions, FileSymlinkExclusions, HardcopyFiles…: the game's own files and folders.
    vscode.languages.registerCompletionItemProvider(selector, {
      provideCompletionItems: (doc, pos) => {
        const dir = isHandler(doc) ? linkedFolder(doc) : undefined;
        const folder = dir ? folderAt(dir) : undefined;
        if (!folder) return undefined;
        const text = doc.getText();
        const at = doc.offsetAt(pos);
        const list = folderLists(text).find((l) => at > l.open && at <= l.close);
        if (!list) return undefined;
        // Inside a quoted entry: replace that entry's text; else insert a quoted one.
        const inItem = list.items.find((i) => at >= i.start && at <= i.end);
        return pickerOptions(text, list, folder)
          .filter((o) => !o.present)
          .map((o, i) => {
            const item = new vscode.CompletionItem(o.label, o.value.includes('.') ? vscode.CompletionItemKind.File : vscode.CompletionItemKind.Folder);
            item.detail = o.detail ? `${o.detail} · in ${folder.name}` : `in ${folder.name}`;
            item.sortText = String(i).padStart(4, '0');
            if (inItem) {
              item.insertText = o.value.replace(/\\/g, '\\\\');
              item.range = new vscode.Range(doc.positionAt(inItem.start), doc.positionAt(inItem.end));
            } else item.insertText = `${list.quote}${o.value.replace(/\\/g, '\\\\')}${list.quote}`;
            return item;
          });
      },
    }, '"', "'", '[', ','),
  );
}
