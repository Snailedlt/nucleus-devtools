// Reports from VS Code: Report a Problem…, Request a Feature…, "This check is wrong" (a code action on every problem)
// and "Nucleus did something different" (the Try it panel). core/report.ts picks the repository and fills the form;
// this asks the few questions that need the person (keyboard-only quick picks, nothing on screen until asked), shows
// open issues that may be the same, then opens the prefilled GitHub form, or copies the report for the testers'
// Discord thread when there's no GitHub account.
// Why not VS Code's own issue reporter (workbench.action.openIssueReporter)? It writes its own body, so the issue forms
// (their labels, the Where list, the fields the bots read) can't be used, it needs a GitHub sign-in inside VS Code, and
// it isn't in VS Code for the web. A prefilled form works everywhere and shows everything before it is sent.
import * as vscode from 'vscode';
import { buildReport, DISCORD_THREAD, findDuplicates, handlerHelp, handlerOrigin, HANDLER_OR_TOOLS, CHECK_VERDICTS, type ReportInput, type HandlerOrigin } from './core/report';
import { REPORT_TRY_IT } from './tryit';

/** Opens a link as the text it is: Uri.parse would decode the form's query (an "&" in a field would cut it short),
 *  and VS Code's opener takes the string as is. */
const openUrl = (url: string) => vscode.env.openExternal(url as unknown as vscode.Uri);

export const REPORT_COMMANDS = { problem: 'splitscreenme.reportProblem', feature: 'splitscreenme.requestFeature', check: 'splitscreenme.reportCheck', tryIt: REPORT_TRY_IT } as const;

/** What a "This check is wrong" code action passes. */
export interface CheckArgs { uri: string; rule: string; message: string; startLine: number; endLine: number; /** The document's version the lines are from. */ version?: number }

let extVersion = '';
function details(): string[] {
  const env = vscode.env as Partial<typeof vscode.env> | undefined;
  return [`VS Code extension: ${extVersion || '?'}`, `VS Code: ${vscode.version ?? '?'}${env?.appHost ? ` (${env.appHost})` : ''}${env?.uiKind === 2 ? ', web' : ''}`, `OS: ${process.platform} ${process.arch}`];
}
const docFor = (uri?: string) => (uri ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri) : vscode.window.activeTextEditor?.document);

/** The Hub handler, if the open handler is one; then the person says whether the problem is in the tools or in it. */
async function toolsOrHandler(code: string | undefined): Promise<'tools' | 'handler' | undefined> {
  const o = handlerOrigin(code);
  if (!o.hubId) return 'tools';
  const pick = await vscode.window.showQuickPick(
    [
      { label: HANDLER_OR_TOOLS.tools, value: 'tools' as const },
      { label: HANDLER_OR_TOOLS.handler, detail: "For the handler's author and the community: its Hub page, Discord or Reddit", value: 'handler' as const },
    ],
    { title: HANDLER_OR_TOOLS.question, placeHolder: `${o.name ?? 'This handler'} is from the Hub (${o.hubId})` },
  );
  if (pick?.value !== 'handler') return pick?.value;
  const help = handlerHelp(o);
  const link = await vscode.window.showQuickPick(help.links.map((l) => ({ label: l.label, detail: l.url, url: l.url })), { title: help.title, placeHolder: help.note });
  if (link) void openUrl(link.url);
  return 'handler';
}

/** Possible duplicates, the GitHub form, or the text to copy. */
async function send(input: ReportInput) {
  const r = buildReport({ ...input, version: input.version ?? `VS Code extension ${extVersion}`, details: [...details(), ...(input.details ?? [])] });
  const hits = await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: 'Looking for the same report on GitHub…' }, () => findDuplicates(r, { userAgent: 'splitscreenme-vscode' }));
  if (hits.length) {
    const pick = await vscode.window.showQuickPick(
      [...hits.map((h) => ({ label: `$(issues) #${h.number} ${h.title}`, description: h.thumbs ? `👍 ${h.thumbs}` : '', detail: 'Open it, and add a 👍 or a comment', url: h.url })), { label: '$(add) None of these: a new report', url: '' }],
      { title: 'Is it one of these?', placeHolder: 'Open reports that may be the same' },
    );
    if (!pick) return;
    if (pick.url) return void openUrl(pick.url);
  }
  const how = await vscode.window.showQuickPick(
    [
      { label: '$(github) Open the report on GitHub', description: 'recommended', detail: 'A form with everything filled in: check it, then submit', value: 'github' },
      { label: '$(copy) No GitHub account? Copy the report', detail: "Copies it as text and opens the testers' thread on Discord, to paste it there", value: 'copy' },
    ],
    { title: r.title || (input.kind === 'feature' ? 'Request a feature' : input.kind === 'check' ? 'This check is wrong' : 'Report a problem'), placeHolder: 'You see everything before it is sent' },
  );
  if (!how) return;
  if (how.value === 'github') return void openUrl(r.url);
  await vscode.env.clipboard.writeText(r.text);
  void vscode.env.openExternal(vscode.Uri.parse(DISCORD_THREAD));
  void vscode.window.showInformationMessage("Copied the report. Paste it in the testers' Discord thread.");
}

export function registerReports(context: vscode.ExtensionContext) {
  extVersion = (context as any).extension?.packageJSON?.version ?? '';
  context.subscriptions.push(
    vscode.commands.registerCommand(REPORT_COMMANDS.problem, async () => {
      const doc = docFor();
      const code = doc?.getText();
      if ((await toolsOrHandler(code)) !== 'tools') return;
      await send({ kind: 'problem', tool: 'vscode', handler: code ? handlerOrigin(code) : undefined });
    }),
    vscode.commands.registerCommand(REPORT_COMMANDS.feature, () => send({ kind: 'feature', tool: 'vscode' })),
    vscode.commands.registerCommand(REPORT_COMMANDS.check, async (a?: CheckArgs) => {
      if (!a?.rule) return vscode.commands.executeCommand(REPORT_COMMANDS.problem);
      const doc = docFor(a.uri);
      // Lines from another version of the text (edited since the action was made) would be other code: left out.
      if (doc && a.version !== undefined && a.version !== doc.version) {
        vscode.window.setStatusBarMessage('Nucleus: the handler changed since: open "This check is wrong…" again on the checked line', 5000);
        return;
      }
      // Only from the text the check ran on: no version (unknown) means no code.
      const code = doc && a.version === doc.version ? Array.from({ length: Math.min(a.endLine, a.startLine + 19) - a.startLine + 1 }, (_, i) => doc.lineAt(Math.min(doc.lineCount - 1, a.startLine + i)).text).join('\n') : '';
      // From the same text as the flagged lines (the file can reload while the questions are open).
      const handler = handlerOrigin(doc?.getText());
      const verdict = await vscode.window.showQuickPick(CHECK_VERDICTS.map((v) => ({ label: v })), { title: `This check is wrong: ${a.rule}`, placeHolder: a.message.replace(/`/g, '') });
      if (!verdict) return;
      // The flagged lines, shown before anything is sent; leaving them out is one key away.
      let withCode = false;
      if (code.trim()) {
        const pick = await vscode.window.showQuickPick(
          [
            { label: 'Include the flagged code', detail: code.length > 300 ? `${code.slice(0, 300)}…` : code, value: true },
            { label: 'Leave the code out', value: false },
          ],
          { title: 'Include the flagged line(s)?', placeHolder: 'Only these lines, never the rest of the handler' },
        );
        if (!pick) return;
        withCode = pick.value;
      }
      const what = await vscode.window.showInputBox({ title: 'What does Nucleus really do? (optional)', prompt: 'You can also write it on the form', ignoreFocusOut: true });
      if (what === undefined) return;
      await send({ kind: 'check', tool: 'vscode', rule: a.rule, message: a.message, line: a.startLine + 1, code: withCode ? code : undefined, verdict: verdict.label, what, handler });
    }),
    vscode.commands.registerCommand(REPORT_COMMANDS.tryIt, async (a?: { uri?: string; sim?: string; handler?: HandlerOrigin }) => {
      const doc = docFor(a?.uri);
      const what = await vscode.window.showInputBox({ title: 'Nucleus did something different', prompt: 'What really happened in Nucleus Co-op? (optional: you can write it on the form)', ignoreFocusOut: true });
      if (what === undefined) return;
      // The origin of the text Try it ran (sent with the result), else the document's.
      await send({ kind: 'tryit', tool: 'vscode', sim: a?.sim, what, handler: a?.handler && typeof a.handler === 'object' ? a.handler : handlerOrigin(doc?.getText()) });
    }),
  );
}
