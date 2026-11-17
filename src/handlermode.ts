// Handlers in a language mode of their own (issue #30). VS Code's JavaScript/TypeScript service attaches to every
// `javascript` document: its suggestions mix in with ours, its type line shows under our hovers, and much of what it
// offers is wrong for Nucleus (browser globals, ES2015+ methods Jint 2.11.58 doesn't have). A `.js` file our
// detection calls a handler is switched to `nucleus-handler` ("Nucleus Co-op handler"), whose grammar is JavaScript's,
// so colours, brackets, comments and folding stay the same, and only our features run on it.
//
// `splitscreenme.languageMode`: "handler" (the default) or "javascript" (keep VS Code's JavaScript features, e.g. for
// `// @ts-check` with the type definitions). The language shows in VS Code's status bar; clicking it switches, as
// for any file, and a file switched back to JavaScript by hand stays that way for the session.
import * as vscode from 'vscode';

export const HANDLER_LANGUAGE = 'nucleus-handler';
export type LanguageMode = 'handler' | 'javascript';

/** What to do with a document: switch it to the handler language, back to JavaScript, or leave it. */
export function languageFor(o: {
  languageId: string;
  mode: LanguageMode;
  isHandler: boolean;
  userChoseJavaScript: boolean;
}): typeof HANDLER_LANGUAGE | 'javascript' | undefined {
  if (o.languageId === 'javascript' && o.mode === 'handler' && o.isHandler && !o.userChoseJavaScript) return HANDLER_LANGUAGE;
  if (o.languageId === HANDLER_LANGUAGE && o.mode === 'javascript') return 'javascript';
  return undefined;
}

export function registerHandlerMode(context: vscode.ExtensionContext, looksLikeHandler: (doc: vscode.TextDocument) => boolean) {
  const mode = (doc?: vscode.TextDocument) => vscode.workspace.getConfiguration('splitscreenme', doc?.uri).get<LanguageMode>('languageMode', 'handler');
  // A file switched back to JavaScript by hand (the status bar's language picker) is left alone this session.
  // Changing a document's language closes it and opens it again at once, so a handler document that closes and
  // opens as JavaScript within a moment was switched by the user (or by us, when the setting says javascript).
  const userChoseJavaScript = new Set<string>();
  const closing = new Map<string, ReturnType<typeof setTimeout>>();
  const ours = new Set<string>(); // switches this extension made, so they aren't taken for the user's
  const apply = (doc: vscode.TextDocument) => {
    if (doc.isClosed || (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled')) return;
    const key = doc.uri.toString();
    const to = languageFor({ languageId: doc.languageId, mode: mode(doc), isHandler: doc.languageId === 'javascript' && looksLikeHandler(doc), userChoseJavaScript: userChoseJavaScript.has(key) });
    if (!to) return;
    ours.add(key);
    vscode.languages.setTextDocumentLanguage(doc, to).then(undefined, () => ours.delete(key));
  };
  context.subscriptions.push(
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.languageId !== HANDLER_LANGUAGE) return;
      const key = doc.uri.toString();
      clearTimeout(closing.get(key));
      closing.set(key, setTimeout(() => closing.delete(key), 1000));
    }),
    vscode.workspace.onDidOpenTextDocument((doc) => {
      const key = doc.uri.toString();
      const reopened = closing.has(key);
      clearTimeout(closing.get(key));
      closing.delete(key);
      if (ours.delete(key)) return; // our own switch arriving
      if (reopened && doc.languageId === 'javascript') {
        userChoseJavaScript.add(key);
        return;
      }
      apply(doc);
    }),
    // A new file that becomes a handler (pasted in, then saved) switches when it's saved.
    vscode.workspace.onDidSaveTextDocument(apply),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('splitscreenme.languageMode') && !e.affectsConfiguration('splitscreenme.detection')) return;
      for (const doc of vscode.workspace.textDocuments) {
        // Back to "handler" for this document's folder: forget a by-hand JavaScript choice there only.
        if (e.affectsConfiguration('splitscreenme.languageMode', doc.uri) && mode(doc) === 'handler') userChoseJavaScript.delete(doc.uri.toString());
        apply(doc);
      }
    }),
  );
  vscode.workspace.textDocuments.forEach(apply);
}
