import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatHandler, detectIndent } from '../core/format';
import { lint } from '../core/lint';
import { hubLineKeeps, hubScan } from '../core/hubscan';
import { FEATURES, renderHandler } from '../core/templates';

const fmt = (s: string, indent = '  ') => {
  const r = formatHandler(s, { indent });
  assert.ok(r.ok, r.ok ? '' : r.reason);
  return r.code;
};

test('format: indentation, spacing, and nothing else', () => {
  const src = 'Game.GUID="Demo";\nGame.Play=function(){\nif(a)\nb();\nelse{\nvar x=a?1:2;\n}\nswitch(x){\ncase 1:\nfoo([\n1,2\n]);\nbreak;\n}\nvar o={a:1,b:[1,2]};\nvar s=-x+ +y-(-1);\ni++;\nif(!a&&b||c){return}\n};\n';
  assert.equal(
    fmt(src),
    'Game.GUID = "Demo";\nGame.Play = function () {\n  if (a)\n    b();\n  else {\n    var x = a ? 1 : 2;\n  }\n  switch (x) {\n    case 1:\n      foo([\n        1, 2\n      ]);\n      break;\n  }\n  var o = { a: 1, b: [1, 2] };\n  var s = -x + +y - (-1);\n  i++;\n  if (!a && b || c) { return; }\n};\n',
  );
});

test('format: idempotent, and the lines stay where they are', () => {
  for (const features of [[], FEATURES.map((f) => f.id)]) {
    const src = renderHandler({ gameName: 'Halo: Reach', executableName: 'MCC-Win64-Shipping.exe', steamId: '976730', features });
    const once = fmt(src, '    ');
    assert.equal(fmt(once, '    '), once);
    assert.equal(once.split('\n').filter((l) => l.trim()).length, src.split('\n').filter((l) => l.trim()).length);
  }
});

test('format: comments, strings and regexes are kept exactly; a multi-line comment is left alone', () => {
  const src = 'Game.GUID = "Demo";  // a   comment  \n/* keep\n     this   \n  as is */\nvar r=/a b/g;var s="  x  ";\n';
  assert.equal(fmt(src), 'Game.GUID = "Demo"; // a   comment\n/* keep\n     this   \n  as is */\nvar r = /a b/g; var s = "  x  ";\n');
});

test('format: top-level lines stay unindented for the Hub install, and lint results stay the same', () => {
  const src = 'Game.GUID = "Demo";\n   Game.GameName = "Demo";\nGame.ExecutableName = "demo.exe";\nGame.MaxPlayers = 4;\n';
  const out = fmt(src);
  assert.match(out, /^Game\.GameName/m);
  const key = (t: string) => lint(t).map((d) => `${d.rule}:${d.severity}`).sort().join(',');
  assert.notEqual(key(src), key(out)); // the indented GameName line was a Hub install problem...
  assert.equal(lint(out).filter((d) => d.rule === 'hub-install-parse').length, 0); // ...and is gone
});

test('format: a line the Hub install reads keeps what it reads', () => {
  const reads = (t: string) => {
    const s = hubScan(t);
    return [s.ExecutableName?.value, s.GameName?.value];
  };
  // A second string on the line: in double quotes, the install would read from the first quote to its last one.
  const two = "Game.GameName = \"Demo\"; Game.Description = 'Hello'\nGame.ExecutableName = \"demo.exe\"\nvar s = 'x'\n";
  const r = formatHandler(two);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.code, "Game.GameName = \"Demo\"; Game.Description = 'Hello'\nGame.ExecutableName = \"demo.exe\";\nvar s = \"x\";\n", 'that line is left out, the others are formatted');
    assert.deepEqual(reads(r.code), reads(two));
  }
  // Single quotes asked for: the two lines the install reads keep their double quotes (it throws without them).
  const src = 'Game.GameName = "Demo";\nGame.ExecutableName = "demo.exe";\nGame.GUID = "Demo";\n';
  const single = formatHandler(src, { quotes: 'single' });
  assert.ok(single.ok);
  if (single.ok) {
    assert.equal(single.code, "Game.GameName = \"Demo\";\nGame.ExecutableName = \"demo.exe\";\nGame.GUID = 'Demo';\n");
    assert.deepEqual(reads(single.code), ['demo.exe', 'Demo']);
  }
  // Spaces: `"My"+"Game"` reads as My"+"Game, and must go on doing so.
  const glued = 'Game.GameName="My"+"Game";\nGame.ExecutableName="demo.exe";\nGame.GUID="Demo";\n';
  assert.equal(fmt(glued), 'Game.GameName="My"+"Game";\nGame.ExecutableName = "demo.exe";\nGame.GUID = "Demo";\n');
  // At the start of a line inside a block: the install reads it there, so it isn't pushed in.
  const inBlock = 'if (a) {\nGame.GameName = "Demo";\nb();\n}\n';
  assert.equal(fmt(inBlock), 'if (a) {\nGame.GameName = "Demo";\n  b();\n}\n');
  // A line the install can't read yet may become readable (the reason double quotes are the default)...
  assert.equal(fmt("Game.GameName = 'My Game'\n"), 'Game.GameName = "My Game";\n');
  // ...but not when it would then read more than the one value.
  assert.equal(fmt("Game.GameName = 'Demo'; Game.Description = 'Hello'\nvar s = 'x'\n"), "Game.GameName = 'Demo'; Game.Description = 'Hello'\nvar s = \"x\";\n");
  // The same result when formatted again.
  for (const t of [two, src, glued, inBlock]) {
    const once = formatHandler(t);
    assert.ok(once.ok);
    const twice = once.ok ? formatHandler(once.code) : once;
    assert.ok(once.ok && twice.ok && twice.code === once.code && !twice.changed);
  }
});

test('hubLineKeeps: what counts as the same for a Hub install', () => {
  const yes: [string, string][] = [
    ['Game.GameName="Demo"', 'Game.GameName = "Demo";'], // the same read
    ["Game.GameName = 'Demo'", 'Game.GameName = "Demo";'], // threw, now one clean value
    ['  Game.GameName = "Demo";', 'Game.GameName = "Demo";'], // wasn't read, now one clean value
    ['var a = "x"', "var a = 'x';"], // not a line the install reads
    ["Game.GameName = 'Demo'", "Game.GameName = 'Demo';"], // threw and still throws
  ];
  const no: [string, string][] = [
    ['Game.GameName = "Demo"; var d = \'x\'', 'Game.GameName = "Demo"; var d = "x";'], // reads more
    ['Game.GameName = "Demo";', "Game.GameName = 'Demo';"], // would throw
    ['Game.GameName="a"+"b";', 'Game.GameName = "a" + "b";'], // another text between the quotes
    ['Game.GameName = "Demo";', '  Game.GameName = "Demo";'], // no longer read
    ["  Game.GameName = 'Demo'", "Game.GameName = 'Demo'"], // wasn't read, would throw
    ["Game.GameName = 'a'; var d = 'b'", 'Game.GameName = "a"; var d = "b";'], // threw, would read two strings as one
    ['GAME.EXECUTABLENAMES = ["a.exe"];', "GAME.EXECUTABLENAMES = ['a.exe'];"], // any case, and names that start the same
  ];
  for (const [a, b] of yes) assert.equal(hubLineKeeps(a, b), true, `${a} -> ${b}`);
  for (const [a, b] of no) assert.equal(hubLineKeeps(a, b), false, `${a} -> ${b}`);
});

test('format: CRLF and a BOM are kept; tabs are detected', () => {
  const r = formatHandler('﻿var a=1;\r\nif (a) {\r\nb();\r\n}\r\n');
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.code, '﻿var a = 1;\r\nif (a) {\r\n    b();\r\n}\r\n');
  assert.equal(detectIndent(['a {', '\tb;', '\t\tc;', '}']), '\t');
  assert.equal(detectIndent(['a {', '  b;', '    c;', '}']), '  ');
});

test('format: never glues operators into new ones, and refuses code that is not ES5', () => {
  assert.equal(fmt('var a = b - -c + +d - --e;\n'), 'var a = b - -c + +d - --e;\n');
  const bad = formatHandler('var a = `x`;\n');
  assert.equal(bad.ok, false);
});

test('format: operators newer than ES5 (=>, **, ??) stay in one piece', () => {
  assert.equal(fmt('var f = () => 1;\nvar p = a ** 2;\nvar q = a ?? b;\nf=x=>x;\n'), 'var f = () => 1;\nvar p = a ** 2;\nvar q = a ?? b;\nf = x => x;\n');
});

test('opinionated style: double quotes and semicolons by default, configurable, never changing the program', async () => {
  const { rangeFormatEdits } = await import('../core/features');
  const src = "Game.GameName = 'My Game'\nvar s = 'it\\'s'\nvar t = 'say \"hi\"'\nGame.Play = function () {\n  for (var i = 0; i < 2; i++) {\n    Context.StartArguments = '-w ' + Context.Width\n  }\n  return\n}\n";
  const r = formatHandler(src);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.code, 'Game.GameName = "My Game";\nvar s = "it\'s";\nvar t = \'say "hi"\';\nGame.Play = function () {\n  for (var i = 0; i < 2; i++) {\n    Context.StartArguments = "-w " + Context.Width;\n  }\n  return;\n};\n');
  const keep = formatHandler(src, { quotes: 'keep', semicolons: 'keep' });
  assert.ok(keep.ok && !keep.code.includes('"My Game"') && !/Width;/.test(keep.code));
  const single = formatHandler('var a = "x";\n', { quotes: 'single' });
  assert.ok(single.ok && single.code === "var a = 'x';\n");
  // A line that ASI reads differently (`a\n(b)` is a call) gets no semicolon: the program must stay the same.
  const asi = formatHandler('var a = b\n(c)\n');
  assert.ok(asi.ok && asi.code === 'var a = b\n(c);\n');
  // Range formatting: only the lines asked for, blank lines kept.
  const text = "var a = 'x'\n\n\nvar b = 'y'\n";
  const e = rangeFormatEdits(text, text.indexOf('var b'), text.indexOf('var b'), { insertSpaces: true, tabSize: 2 });
  assert.ok('edits' in e);
  if ('edits' in e) assert.deepEqual(e.edits.map((x) => x.text), ['var b = "y";']);
});

test('format: a lone \\r and U+2028/U+2029 are line breaks, kept exactly where they are', () => {
  for (const br of ['\r', '\u2028', '\u2029']) {
    const src = `var a=1${br}var b=2\n  if(a){${br}b();\n}\n`;
    const r = formatHandler(src, { indent: '  ' });
    assert.ok(r.ok, r.ok ? '' : r.reason);
    assert.equal(r.code, `var a = 1;${br}var b = 2;\nif (a) {${br}  b();\n}\n`, JSON.stringify(br));
  }
  const crlf = formatHandler('var a=1\r\nvar b=2\rvar c=3\r\n', {});
  assert.ok(crlf.ok && crlf.code === 'var a = 1;\r\nvar b = 2;\rvar c = 3;\r\n');
  const { rangeFormatEdits } = require('../core/features');
  const t = 'var a=1;\rvar b=2;\nvar c=3;\n';
  const e = rangeFormatEdits(t, t.indexOf('var b'), t.indexOf('var b'), {});
  assert.deepEqual(e.edits, [{ start: 9, end: 17, text: 'var b = 2;' }], 'Format Selection after a lone \\r');
  const { jsRuleDiagnostics } = require('../core/jsrules');
  const text = 'var a = 1;\rvar b = "\\d";\n';
  const d = jsRuleDiagnostics(text, ['no-useless-escape']);
  assert.equal(text.slice(d[0].start, d[0].end)[0], '\\', 'ESLint positions after a lone \\r');
});
