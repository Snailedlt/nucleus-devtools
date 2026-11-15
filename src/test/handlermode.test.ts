// Handlers in their own language mode (src/handlermode.ts, issue #30): which documents switch, that a file switched
// back to JavaScript by hand stays there, the setting, and that package.json contributes the language everywhere
// javascript is contributed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as vscode from 'vscode';
import { HANDLER_LANGUAGE, languageFor, registerHandlerMode } from '../handlermode';

const mock = vscode as any;
const fire = (name: string, e: any) => (mock.__listeners[name] ?? []).forEach((fn: (e: any) => void) => fn(e));
const docOf = (uri: string, languageId: string) => ({ uri: { toString: () => uri, scheme: 'file' }, languageId, isClosed: false });

test('languageFor: a handler in JavaScript switches; a plain file, a hand-picked JavaScript file and the setting do not', () => {
  assert.equal(languageFor({ languageId: 'javascript', mode: 'handler', isHandler: true, userChoseJavaScript: false }), HANDLER_LANGUAGE);
  assert.equal(languageFor({ languageId: 'javascript', mode: 'handler', isHandler: false, userChoseJavaScript: false }), undefined, 'not a handler: stays JavaScript');
  assert.equal(languageFor({ languageId: 'javascript', mode: 'handler', isHandler: true, userChoseJavaScript: true }), undefined, 'switched back by hand: stays');
  assert.equal(languageFor({ languageId: 'javascript', mode: 'javascript', isHandler: true, userChoseJavaScript: false }), undefined, 'the setting keeps handlers JavaScript');
  assert.equal(languageFor({ languageId: HANDLER_LANGUAGE, mode: 'javascript', isHandler: true, userChoseJavaScript: false }), 'javascript', 'the setting turned to javascript switches open handlers back');
  assert.equal(languageFor({ languageId: 'typescript', mode: 'handler', isHandler: true, userChoseJavaScript: false }), undefined, 'other languages are left alone');
});

test('registerHandlerMode: switches a handler on open, and leaves a file the user switched back to JavaScript', async () => {
  mock.__languageChanges.length = 0;
  for (const k of Object.keys(mock.__listeners)) delete mock.__listeners[k];
  const ctx = { subscriptions: [] as any[] };
  registerHandlerMode(ctx as any, (d: any) => String(d.uri).endsWith('Game.js'));
  const handler = docOf('file:///h/Game.js', 'javascript');
  fire('onDidOpenTextDocument', handler);
  fire('onDidOpenTextDocument', docOf('file:///h/other.js', 'javascript'));
  await Promise.resolve();
  assert.deepEqual(mock.__languageChanges, [{ uri: 'file:///h/Game.js', languageId: HANDLER_LANGUAGE }], 'only the handler switches');
  // Our own switch arrives as a close + open: nothing more happens.
  fire('onDidCloseTextDocument', docOf('file:///h/Game.js', 'javascript'));
  fire('onDidOpenTextDocument', docOf('file:///h/Game.js', HANDLER_LANGUAGE));
  // The user picks JavaScript in the status bar: VS Code closes the handler document and opens it as JavaScript.
  fire('onDidCloseTextDocument', docOf('file:///h/Game.js', HANDLER_LANGUAGE));
  fire('onDidOpenTextDocument', docOf('file:///h/Game.js', 'javascript'));
  fire('onDidSaveTextDocument', docOf('file:///h/Game.js', 'javascript'));
  await Promise.resolve();
  assert.equal(mock.__languageChanges.length, 1, 'switched back by hand: left as JavaScript, also on save');
  for (const d of ctx.subscriptions) d.dispose?.();
});

test('package.json: the handler language has a grammar built on JavaScript\'s, and goes wherever javascript goes', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const c = pkg.contributes;
  assert.ok(c.languages.some((l: any) => l.id === HANDLER_LANGUAGE && fs.existsSync(l.configuration)), 'the language, with its configuration file');
  const grammar = c.grammars.find((g: any) => g.language === HANDLER_LANGUAGE);
  assert.deepEqual(JSON.parse(fs.readFileSync(grammar.path, 'utf8')).patterns, [{ include: 'source.js' }], 'JavaScript\'s colours');
  assert.ok(pkg.activationEvents.includes(`onLanguage:${HANDLER_LANGUAGE}`));
  for (const [what, list] of [['snippets', c.snippets], ['semanticTokenScopes', c.semanticTokenScopes], ['breakpoints', c.breakpoints]] as const)
    assert.ok((list as any[]).some((x) => x.language === HANDLER_LANGUAGE), `${what} cover the handler language`);
  assert.ok(c.debuggers[0].languages.includes(HANDLER_LANGUAGE), 'the debugger offers itself in handler files');
  const setting = c.configuration.properties['splitscreenme.languageMode'];
  assert.equal(setting.default, 'handler');
  assert.deepEqual(setting.enum, ['handler', 'javascript']);
  assert.ok(fs.readFileSync('.vscodeignore', 'utf8').includes('!syntaxes/**'), 'the grammar ships in the .vsix');
});
