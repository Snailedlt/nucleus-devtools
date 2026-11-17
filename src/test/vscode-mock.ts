import * as nodeFs from 'node:fs';
import * as nodePath from 'node:path';
// A small stand-in for the `vscode` module so the extension glue can be tested
// with node:test. Only what src/extension.ts and src/commands.ts touch.
export class Position {
  constructor(public line: number, public character: number) {}
  with(line?: number, character?: number) {
    return new Position(line ?? this.line, character ?? this.character);
  }
}
export class Range {
  constructor(public start: Position, public end: Position) {}
}
export enum DiagnosticSeverity { Error, Warning, Information, Hint }
export enum SymbolKind { Namespace = 2, Property = 6, Function = 11, Variable = 12 }
export class DocumentSymbol {
  children: DocumentSymbol[] = [];
  constructor(public name: string, public detail: string, public kind: SymbolKind, public range: Range, public selectionRange: Range) {}
}
export enum DiagnosticTag { Unnecessary = 1, Deprecated = 2 }
export class Diagnostic {
  source?: string;
  code?: any;
  tags?: DiagnosticTag[];
  constructor(public range: Range, public message: string, public severity: DiagnosticSeverity) {}
}
export class CodeActionKind {
  static QuickFix = new CodeActionKind('quickfix');
  static SourceFixAll = new CodeActionKind('source.fixAll');
  constructor(public value: string) {}
  append(part: string) {
    return new CodeActionKind(`${this.value}.${part}`);
  }
  intersects(other: CodeActionKind) {
    return this.value.startsWith(other.value) || other.value.startsWith(this.value);
  }
}
export class WorkspaceEdit {
  edits: { uri: any; range: Range; text: string }[] = [];
  replace(uri: any, range: Range, text: string) {
    this.edits.push({ uri, range, text });
  }
  insert(uri: any, pos: Position, text: string) {
    this.edits.push({ uri, range: new Range(pos, pos), text });
  }
}
export class CodeAction {
  diagnostics?: Diagnostic[];
  isPreferred?: boolean;
  edit?: WorkspaceEdit;
  constructor(public title: string, public kind: CodeActionKind) {}
}
export enum CompletionItemKind { Method = 1, Function = 2, Keyword = 13, Field = 4, Variable = 5, Class = 6, Module = 8, Property = 9, Enum = 12, EnumMember = 19 }
export enum CompletionItemTag { Deprecated = 1 }
export class SnippetString {
  constructor(public value: string) {}
}
export class MarkdownString {
  isTrusted?: boolean;
  constructor(public value: string) {}
}
export class CompletionItem {
  kind?: CompletionItemKind;
  detail?: string;
  documentation?: MarkdownString;
  insertText?: SnippetString | string;
  range?: Range;
  sortText?: string;
  tags?: CompletionItemTag[];
  command?: any;
  constructor(public label: string, kind?: CompletionItemKind) {
    this.kind = kind;
  }
}
export class SemanticTokensLegend {
  constructor(public tokenTypes: string[], public tokenModifiers: string[] = []) {}
}
/** Collects the pushed tokens as they are (range, type, modifiers) instead of encoding them. */
export class SemanticTokensBuilder {
  tokens: { range: Range; type: string; modifiers: string[] }[] = [];
  constructor(public legend?: SemanticTokensLegend) {}
  push(range: Range, type: string, modifiers: string[] = []) {
    this.tokens.push({ range, type, modifiers });
  }
  build() {
    return { tokens: this.tokens };
  }
}
export class InlayHint {
  paddingLeft?: boolean;
  tooltip?: unknown;
  constructor(public position: Position, public label: string) {}
}
export class Hover {
  constructor(public contents: MarkdownString, public range?: Range) {}
}
export class ParameterInformation {
  constructor(public label: string) {}
}
export class SignatureInformation {
  parameters: ParameterInformation[] = [];
  constructor(public label: string, public documentation?: MarkdownString) {}
}
export class SignatureHelp {
  signatures: SignatureInformation[] = [];
  activeSignature = 0;
  activeParameter = 0;
}
export class Uri {
  constructor(public fsPath: string, public scheme = /^[a-z][\w+.-]+:/i.test(fsPath) ? fsPath.split(':')[0] : 'file') {}
  static parse(s: string) {
    return new Uri(s);
  }
  static file(s: string) {
    return new Uri(s, 'file');
  }
  static joinPath(u: Uri, ...parts: string[]) {
    return Uri.file(nodePath.join(u.fsPath, ...parts));
  }
  toString() {
    return this.fsPath;
  }
}
export class FileSystemError extends Error {
  code = '';
}
export enum LanguageStatusSeverity { Information, Warning, Error }
export class RelativePattern {
  constructor(public base: any, public pattern: string) {}
}
/** Language status items the extension created (createLanguageStatusItem), by id. */
export const __languageStatus: Record<string, any> = {};
/** Lines written to the output channel (createOutputChannel). */
export const __log: string[] = [];
export enum ConfigurationTarget { Global = 1, Workspace, WorkspaceFolder }
export enum ProgressLocation { Notification = 15 }

// --- registries the tests can inspect --------------------------------------
export const __registered: Record<string, any[]> = { completion: [], hover: [], signature: [], codeAction: [], commands: [], formatting: [], symbols: [], definition: [] };
export const __diagnostics = new Map<string, Diagnostic[]>();
export const __config: Record<string, any> = {};

const disposable = { dispose() {} };

/** Event handlers the code under test registered, by event name (onDidOpenTextDocument…), so tests can fire them. */
export const __listeners: Record<string, ((e: any) => void)[]> = {};
const listen = (name: string) => (fn: (e: any) => void) => (((__listeners[name] ??= []).push(fn)), disposable);
export const languages = {
  getDiagnostics: ((uri?: Uri): any => (uri ? __diagnostics.get(uri.toString()) ?? [] : [...__diagnostics].map(([k, d]) => [Uri.parse(k), d]))) as { (): [Uri, Diagnostic[]][]; (uri: Uri): Diagnostic[] },
  onDidChangeDiagnostics: listen('onDidChangeDiagnostics'),
  createLanguageStatusItem: (id: string, selector: any) => (__languageStatus[id] = { id, selector, dispose() {} }),
  createDiagnosticCollection: () => ({
    set: (uri: Uri, d: Diagnostic[]) => __diagnostics.set(uri.toString(), d),
    delete: (uri: Uri) => __diagnostics.delete(uri.toString()),
    dispose() {},
  }),
  registerCompletionItemProvider: (_s: any, p: any) => (__registered.completion.push(p), disposable),
  registerHoverProvider: (_s: any, p: any) => (__registered.hover.push(p), disposable),
  registerDocumentSymbolProvider: (_s: any, p: any) => (__registered.symbols.push(p), disposable),
  registerDefinitionProvider: (_s: any, p: any) => (__registered.definition.push(p), disposable),
  registerSignatureHelpProvider: (_s: any, p: any) => (__registered.signature.push(p), disposable),
  registerDocumentFormattingEditProvider: (_s: any, p: any) => (__registered.formatting.push(p), disposable),
  registerDocumentRangeFormattingEditProvider: (_s: any, p: any) => (((__registered as any).rangeFormatting ??= []).push(p), disposable),
  registerOnTypeFormattingEditProvider: (_s: any, p: any) => (((__registered as any).onType ??= []).push(p), disposable),
  registerCodeActionsProvider: (_s: any, p: any) => (__registered.codeAction.push(p), disposable),
  registerDocumentSemanticTokensProvider: (_s: any, p: any, legend: any) => (((__registered as any).semantic ??= []).push({ p, legend }), disposable),
  registerInlayHintsProvider: (_s: any, p: any) => ((__registered as any).inlay = [...((__registered as any).inlay ?? []), p], disposable),
  // Language changes (handlermode.ts): recorded, and the document takes the new language.
  setTextDocumentLanguage: async (doc: any, languageId: string) => (__languageChanges.push({ uri: String(doc.uri), languageId }), (doc.languageId = languageId), doc),
};
export const __languageChanges: { uri: string; languageId: string }[] = [];
export const __applied: WorkspaceEdit[] = [];
export const workspace = {
  applyEdit: async (e: WorkspaceEdit) => (__applied.push(e), true),
  textDocuments: [] as any[],
  workspaceFolders: undefined as any,
  // The real file system, for the commands that write files (New Handler).
  fs: {
    stat: async (u: Uri) => nodeFs.statSync(u.fsPath),
    writeFile: async (u: Uri, data: Uint8Array) => nodeFs.writeFileSync(u.fsPath, data),
    createDirectory: async (u: Uri) => void nodeFs.mkdirSync(u.fsPath, { recursive: true }),
  },
  isTrusted: true,
  onDidOpenTextDocument: listen('onDidOpenTextDocument'),
  onDidChangeTextDocument: () => disposable,
  onDidCloseTextDocument: listen('onDidCloseTextDocument'),
  onDidSaveTextDocument: listen('onDidSaveTextDocument'),
  onDidChangeConfiguration: listen('onDidChangeConfiguration'),
  createFileSystemWatcher: () => ({ onDidCreate: () => disposable, onDidChange: () => disposable, onDidDelete: () => disposable, dispose() {} }),
  getConfiguration: (section: string) => ({
    get: (key: string, def?: any) => (`${section}.${key}` in __config ? __config[`${section}.${key}`] : def),
    inspect: (key: string) => (`${section}.${key}` in __config ? { workspaceValue: __config[`${section}.${key}`] } : undefined),
    update: async (key: string, value: any, target?: number) => void __configWrites.push({ key: `${section}.${key}`, value, target }),
  }),
};
/** Settings the extension wrote (getConfiguration().update). */
export const __configWrites: { key: string; value: any; target?: number }[] = [];
export const commands = {
  registerCommand: (id: string, fn: any) => (__registered.commands.push({ id, fn }), disposable),
  // The extension's own commands run (a webview message → its command); VS Code's do nothing.
  executeCommand: async (id: string, ...args: any[]) => __registered.commands.filter((c: any) => c.id === id).at(-1)?.fn(...args),
};
export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
}
/** Webview panels created by the extension (see createWebviewPanel). */
export const __panels: { viewType: string; title: string; options: any; webview: { html: string }; __onMessage?: (m: any) => void }[] = [];
export const window = {
  activeTextEditor: undefined as any,
  onDidChangeActiveTextEditor: () => disposable,
  createWebviewPanel: (viewType: string, title: string, _column: unknown, options: any) => {
    const panel: any = { viewType, title, options, webview: { html: '', onDidReceiveMessage: (f: (m: any) => void) => ((panel.__onMessage = f), disposable), postMessage: async () => true }, reveal: () => {}, onDidDispose: () => disposable, dispose: () => {} };
    __panels.push(panel);
    return panel;
  },
  __shown: [] as any[],
  showTextDocument: async (x: any) => (window.__shown.push(x), x),
  createInputBox: () => quickInput('input'),
  createQuickPick: () => quickInput('pick'),
  createOutputChannel: () => ({ info: (m: string) => __log.push(`info ${m}`), warn: (m: string) => __log.push(`warn ${m}`), error: (m: string) => __log.push(`error ${m}`), show() {}, dispose() {} }),
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showInformationMessage: async () => undefined,
  __openDialog: undefined as any,
  showOpenDialog: async () => window.__openDialog,
  __status: [] as string[],
  setStatusBarMessage: (text: string) => (window.__status.push(text), disposable),
  __progress: [] as { message?: string }[],
  withProgress: async (_o: unknown, task: (p: { report(v: { message?: string }): void }, t: { isCancellationRequested: boolean; onCancellationRequested(f: () => void): unknown }) => Promise<unknown>) =>
    task({ report: (v) => window.__progress.push(v) }, { isCancellationRequested: false, onCancellationRequested: () => disposable }),
};
/** Answers for the quick inputs the extension shows, in order: a string (typed, then Enter), an array of labels
 *  (picked, then Enter), 'BACK' (the Back button) or undefined (Escape). Each shown input is recorded in __inputs. */
export const __answers: any[] = [];
export const __inputs: any[] = [];
export const QuickInputButtons = { Back: { iconPath: 'back' } };
function quickInput(kind: 'input' | 'pick') {
  const on: Record<string, (x?: any) => void> = {};
  const q: any = {
    kind, value: '', items: [], selectedItems: [], activeItems: [], buttons: [],
    onDidChangeValue: (f: any) => ((on.change = f), disposable),
    onDidAccept: (f: any) => ((on.accept = f), disposable),
    onDidTriggerButton: (f: any) => ((on.button = f), disposable),
    onDidHide: (f: any) => ((on.hide = f), disposable),
    dispose() {},
    show() {
      __inputs.push({ kind, title: q.title, step: q.step, totalSteps: q.totalSteps, prompt: q.prompt, placeholder: q.placeholder, value: q.value, back: q.buttons.includes(QuickInputButtons.Back), selected: q.selectedItems.map((i: any) => i.label) });
      const a = __answers.shift();
      setTimeout(() => {
        if (a === undefined) return on.hide?.();
        if (a === 'BACK') return on.button?.(QuickInputButtons.Back);
        if (kind === 'input') { q.value = a; on.change?.(a); return on.accept?.(); }
        const picked = q.items.filter((i: any) => (a as string[]).some((l) => i.label.includes(l)));
        q.selectedItems = picked; q.activeItems = picked.slice(0, 1);
        on.accept?.();
      }, 0);
    },
  };
  return q;
}
export const env = { openExternal: async () => true };

/** A minimal TextDocument over a string. */
export function makeDocument(text: string, fileName = '/work/handlers/Game.js') {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const positionAt = (o: number) => {
    let l = 0;
    while (l + 1 < starts.length && starts[l + 1] <= o) l++;
    return new Position(l, o - starts[l]);
  };
  const lines = text.split('\n');
  return {
    uri: Uri.file(fileName),
    fileName,
    languageId: 'javascript',
    isUntitled: false,
    getText: (r?: Range) => (r ? text.slice(starts[r.start.line] + r.start.character, starts[r.end.line] + r.end.character) : text),
    positionAt,
    offsetAt: (p: Position) => starts[p.line] + p.character,
    lineAt: (line: number) => ({
      text: lines[line],
      range: new Range(new Position(line, 0), new Position(line, lines[line].length)),
      firstNonWhitespaceCharacterIndex: lines[line].search(/\S|$/),
    }),
    getWordRangeAtPosition: (p: Position, re: RegExp) => {
      const t = lines[p.line];
      let s = p.character;
      let e = p.character;
      const w = new RegExp(`^${re.source}$`);
      while (s > 0 && w.test(t[s - 1])) s--;
      while (e < t.length && w.test(t[e])) e++;
      return s === e ? undefined : new Range(new Position(p.line, s), new Position(p.line, e));
    },
  };
}

export const TextEdit = { replace: (range: any, newText: string) => ({ range, newText }) };
export const debug = {
  registerDebugAdapterDescriptorFactory: () => disposable,
  registerDebugConfigurationProvider: () => disposable,
  breakpoints: [] as any[],
  __started: [] as any[],
  startDebugging: async (_folder: unknown, config: any) => (debug.__started.push(config), true),
};
export class DebugAdapterInlineImplementation {
  constructor(public implementation: unknown) {}
}
export class EventEmitter<T> {
  private ls: ((e: T) => void)[] = [];
  event = (l: (e: T) => void) => (this.ls.push(l), disposable);
  fire(e: T) { this.ls.forEach((l) => l(e)); }
  dispose() {}
}
export class Location {
  constructor(public uri: any, public range: any) {}
}
