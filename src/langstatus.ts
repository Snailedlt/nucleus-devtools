// The handler's status beside its language in the status bar ({} Nucleus Co-op handler), as TypeScript and Python
// show theirs: the checks (problems or OK) and the linked game folder (Link…/Unlink). They show only when the
// language indicator is hovered, so nothing new sits on screen.
import * as vscode from 'vscode';
import path from 'node:path';
import { HANDLER_LANGUAGE } from './handlermode';
import { linkedFolder } from './gamefolders';
import { folderAt } from './gamefolder-node';
import { folderSummary } from './core/gamefolder';

/** "2 errors, 1 warning" or "No problems", from a handler's diagnostics. Exported for tests. */
export function checksText(diags: readonly vscode.Diagnostic[]): { text: string; severity: 'ok' | 'warning' | 'error' } {
  const errors = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
  const warnings = diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length;
  const parts = [errors && `${errors} error${errors === 1 ? '' : 's'}`, warnings && `${warnings} warning${warnings === 1 ? '' : 's'}`].filter(Boolean);
  // No icon of our own: the severity's icon shows beside it.
  if (!parts.length) return { text: 'No problems', severity: 'ok' };
  return { text: parts.join(', '), severity: errors ? 'error' : 'warning' };
}

export function registerLanguageStatus(context: vscode.ExtensionContext, isHandler: (d: vscode.TextDocument) => boolean) {
  const create = (vscode.languages as any).createLanguageStatusItem as typeof vscode.languages.createLanguageStatusItem | undefined;
  if (!create) return; // older VS Code (and the test mock without it)
  const base: vscode.DocumentFilter[] = [{ language: HANDLER_LANGUAGE }];
  const checks = create('splitscreenme.checks', base);
  checks.name = 'Nucleus: Checks';
  const folder = create('splitscreenme.gameFolder', base);
  folder.name = 'Nucleus: Game Folder';
  // Report a problem or ask for a feature: here with the handler's other status, only when the language is hovered.
  const report = create('splitscreenme.report', base);
  report.name = 'Nucleus: Report';
  report.text = '$(comment-discussion) Feedback';
  report.detail = 'Something wrong, or missing?';
  report.command = { title: 'Report a problem…', command: 'splitscreenme.reportProblem', tooltip: 'Report a problem with the tools (a check, Try it, the editor)' };
  context.subscriptions.push(checks, folder, report);

  const update = () => {
    const doc = vscode.window.activeTextEditor?.document;
    if (!doc || !isHandler(doc)) return;
    // A handler kept in JavaScript mode: this file only, so other JavaScript files don't get it.
    const selector: vscode.DocumentSelector = doc.languageId === HANDLER_LANGUAGE || doc.uri.scheme !== 'file' ? base : [...base, { language: 'javascript', pattern: new vscode.RelativePattern(vscode.Uri.file(path.dirname(doc.uri.fsPath)), path.basename(doc.uri.fsPath)) }];
    checks.selector = folder.selector = report.selector = selector;

    const c = checksText(vscode.languages.getDiagnostics(doc.uri));
    checks.text = c.text;
    checks.detail = 'Nucleus Co-op handler checks';
    checks.severity = c.severity === 'error' ? vscode.LanguageStatusSeverity.Error : c.severity === 'warning' ? vscode.LanguageStatusSeverity.Warning : vscode.LanguageStatusSeverity.Information;
    checks.command = c.severity === 'ok' ? undefined : { title: 'Show Problems', command: 'workbench.actions.view.problems' };

    const dir = linkedFolder(doc);
    if (!dir) {
      folder.text = 'No game folder linked';
      folder.detail = 'to check the handler against the game\'s files';
      folder.command = doc.uri.scheme === 'file' ? { title: 'Link…', command: 'splitscreenme.linkGameFolder', tooltip: 'Link the game\'s install folder' } : undefined;
      return;
    }
    const f = folderAt(dir);
    folder.text = `Game folder: ${path.basename(dir)}`;
    const facts = f ? folderSummary(f, doc.getText()).facts.map((x) => x.title) : [];
    folder.detail = f ? (facts.length ? facts.join(' · ') : 'Game folder') : 'Game folder (not found)';
    folder.command = { title: 'Unlink', command: 'splitscreenme.unlinkGameFolder', tooltip: dir };
  };
  update();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.languages.onDidChangeDiagnostics((e) => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc && e.uris.some((u) => u.toString() === doc.uri.toString())) update();
    }),
    // Link/Unlink check the handler again, so its diagnostics change and this follows.
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('splitscreenme') && update()),
  );
}
