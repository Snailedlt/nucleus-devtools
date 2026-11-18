import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePE, NotAProgram, PE_WORK_LIMIT, type PeFile } from '../core/pe';
import { analyse, importHints, importsReport, handlerHooks, importProblems, jsString, findExe, findExes, lastSwitch, RULES, HUB_SHARES } from '../core/importhooks';
import { api } from '../core/api';

const FIX = path.join(__dirname, '..', 'src', 'test', 'fixtures', 'pe');
const read = (dir: string) => fs.readdirSync(path.join(FIX, dir)).filter((f) => /\.(exe|dll)$/i.test(f)).map((f) => parsePE(fs.readFileSync(path.join(FIX, dir, f)), f));

test('pe: imports, delay-free tables, exports, 32 and 64 bit', () => {
  const x64 = parsePE(fs.readFileSync(path.join(FIX, 'game', 'MyGame.exe')), 'MyGame.exe');
  assert.equal(x64.is64, true);
  assert.equal(x64.dll, false);
  const fns = (p: typeof x64, dll: RegExp) => p.imports.filter((i) => dll.test(i.dll)).flatMap((i) => i.fns.map((f) => f.name));
  assert.ok(fns(x64, /^user32\.dll$/i).includes('GetCursorPos'));
  assert.ok(fns(x64, /^xinput1_3\.dll$/i).includes('XInputGetState'));
  assert.ok(fns(x64, /^dinput8\.dll$/i).includes('DirectInput8Create'));
  const x86 = parsePE(fs.readFileSync(path.join(FIX, 'MyGame-x86.exe')), 'MyGame-x86.exe');
  assert.equal(x86.is64, false);
  assert.ok(fns(x86, /^user32\.dll$/i).includes('RegisterRawInputDevices'));
  const dll = parsePE(fs.readFileSync(path.join(FIX, 'game', 'Engine.dll')), 'Engine.dll');
  assert.equal(dll.dll, true);
  assert.deepEqual(dll.exports.map((e) => e.name).sort(), ['Engine_Init', 'Engine_Shutdown', 'Input_PollGamepad', 'Window_SetFullscreen']);
});

test('pe: not a program, and damaged files give fewer results instead of a crash', () => {
  assert.throws(() => parsePE(new TextEncoder().encode('hello world, not a program at all..................................'), 'x.txt'), NotAProgram);
  const real = fs.readFileSync(path.join(FIX, 'game', 'MyGame.exe'));
  // Cut inside the optional header's fixed part: not a program (NotAProgram, nothing else); cut later: fewer results.
  assert.throws(() => parsePE(real.subarray(0, 200), 'cut.exe'), NotAProgram);
  for (const cut of [600, 1500, 5000, real.length - 100]) assert.doesNotThrow(() => parsePE(real.subarray(0, cut), 'cut.exe'));
  const junk = Buffer.from(real);
  for (let i = 0x200; i < junk.length; i += 7) junk[i] = 0xff;
  assert.doesNotThrow(() => parsePE(junk, 'junk.exe'));
});

test('importhooks: a game folder gives the hooks that match its imports', () => {
  const a = analyse(read('game'));
  assert.equal(a.main?.fileName, 'MyGame.exe');
  const ids = a.found.map((f) => f.rule.id);
  for (const id of ['xinput', 'focus', 'clip', 'cpos', 'keys', 'raw', 'msg']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('launcher'));
  // DirectInput is only "if you see the problem": many games load it for keyboard and mouse.
  assert.equal(a.found.find((f) => f.rule.id === 'dinput')?.rule.maybe, true);
  const report = importsReport(a);
  assert.match(report, /Game\.ProtoInput\.XinputHook = true;/);
  assert.match(report, /Game\.SupportsMultipleKeyboardsAndMice = true;/);
  assert.doesNotMatch(importsReport(a, { controllers: false }), /XinputHook = true/);
});

test('importhooks: a launcher is followed to the game it starts', () => {
  const a = analyse(read('launcher'));
  assert.equal(a.main?.fileName, 'war3.exe');
  assert.deepEqual(a.launchers.map((f) => f.fileName), ['Frozen Throne.exe']);
  assert.equal(a.found[0]!.rule.id, 'launcher');
  // The game's own DLL counts (Game.dll reads the cursor), the launcher's imports don't.
  assert.ok(a.found.some((f) => f.rule.id === 'cpos' && f.hits.some((h) => h.file === 'Game.dll')));
});

test('importhooks: hints only for what the handler lacks, quietly', () => {
  const a = analyse(read('game'));
  const PI = 'Game.ProtoInput.InjectStartup = true;\n';
  // No Proto Input: no Proto Input hints.
  assert.equal(importHints('Game.ExecutableName = "MyGame.exe";\n', a).filter((h) => h.lines.some((l) => l.includes('ProtoInput'))).length, 0);
  const h = importHints(PI, a);
  assert.ok(h.some((x) => x.rule === 'xinput' && x.lines[0] === 'Game.ProtoInput.XinputHook = true;'));
  assert.ok(h.every((x) => x.fact), 'hints are quiet');
  // Keyboard-and-mouse ones only with SupportsMultipleKeyboardsAndMice.
  assert.ok(!h.some((x) => x.rule === 'raw'));
  assert.ok(importHints(PI + 'Game.SupportsMultipleKeyboardsAndMice = true;\n', a).some((x) => x.rule === 'raw'));
  // Hooks installed at runtime count as on.
  const runtime = PI + 'Game.ProtoInput.OnInputLocked = function () {\n  ProtoInput.InstallHook(h, ProtoInput.Values.XinputHookID);\n  ProtoInput.InstallHook(h, ProtoInput.Values.FocusHooksHookID);\n};\n';
  assert.ok(handlerHooks(runtime).has('FocusHooks'));
  const hr = importHints(runtime, a);
  assert.ok(!hr.some((x) => x.rule === 'xinput' || x.rule === 'focus'));
  // Nucleus' own focus hooks cover focus.
  assert.ok(!importHints(PI + 'Game.Hook.ForceFocus = true;\n', a).some((x) => x.rule === 'focus'));
});

test('importhooks: every option it suggests exists in the API model', () => {
  const m = api;
  const opts = new Set(RULES.flatMap((r) => (Array.isArray(r.opts) ? r.opts : r.opts ? Object.values(r.opts) : [])));
  for (const o of opts) assert.ok(m.objects.GameProtoInput!.members[o], `Game.ProtoInput.${o}`);
  for (const k of Object.keys(HUB_SHARES)) if (k !== 'n') assert.ok(m.objects.GameProtoInput!.members[k], `share for ${k}`);
  for (const line of RULES.flatMap((r) => [...(r.code ?? []), ...(r.pre ?? [])])) {
    const p = line.match(/^Game\.([\w.]+)\s*=/);
    if (!p) continue;
    const [obj, name] = p[1]!.includes('.') ? [p[1]!.startsWith('Hook.') ? 'GameHook' : 'GameProtoInput', p[1]!.split('.').pop()!] : ['Game', p[1]!];
    assert.ok(m.objects[obj]!.members[name], line);
  }
});

test('importhooks: hints as game-folder problems, with a fix that adds the lines', async () => {
  const { importProblems } = await import('../core/importhooks');
  const { gameBinaries, readGameBinaries } = await import('../gamefolder-node');
  const files = await gameBinaries(path.join(FIX, 'game'));
  assert.equal(files.length, 2);
  assert.equal(readGameBinaries([path.join(FIX, 'game')]).length, 2);
  const text = 'Game.ExecutableName = "MyGame.exe";\nGame.ProtoInput.InjectStartup = true;\nGame.ProtoInput.FocusHooks = true;\n\nGame.Play = function () {};\n';
  const ps = importProblems(text, files);
  const x = ps.find((p) => /XinputHook/.test(p.title));
  assert.ok(x, 'XInput hint');
  assert.equal(x!.fact, true);
  assert.equal(text.slice(x!.start, x!.end), 'MyGame.exe');
  // FocusHooks is already on: no hint for it.
  assert.ok(!ps.some((p) => /FocusHooks/.test(p.title)));
  // The fix goes after the last Game.ProtoInput line.
  const fixed = text.slice(0, x!.fix!.start) + x!.fix!.text + text.slice(x!.fix!.end);
  assert.match(fixed, /Game\.ProtoInput\.FocusHooks = true;\nGame\.ProtoInput\.XinputHook = true;\n\nGame\.Play/);
  // Nothing without program files.
  assert.deepEqual(importProblems(text, []), []);
});

test('importhooks: a launcher with startup injection gets a warning whose fix injects at runtime; no empty brackets', async () => {
  const { importProblems } = await import('../core/importhooks');
  const files = read('launcher');
  const text = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.SupportsMultipleKeyboardsAndMice = true;\nGame.ProtoInput.InjectStartup = true;\n';
  const ps = importProblems(text, files);
  const w = ps.find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'));
  assert.ok(w, ps.map((p) => p.title).join('\n'));
  assert.equal(w!.severity, 'warning');
  const fixed = text.slice(0, w!.fix!.start) + w!.fix!.text + text.slice(w!.fix!.end);
  assert.match(fixed, /^Game\.ProtoInput\.InjectRuntime_EasyHookMethod = true;$/m);
  assert.doesNotMatch(fixed, /InjectStartup/);
  assert.ok(!ps.some((p) => /\(\)/.test(p.title)), 'no empty brackets');
  // Runtime injection already: no warning.
  assert.ok(!importProblems(fixed, files).some((p) => /InjectStartup injects/.test(p.title)));
});

test('pe: one work budget across a file whose tables point at the same data again and again; bad magic is no program', () => {
  // A PE32 whose 2000 import descriptors all share one 20000-entry thunk table: 40 million records without a budget.
  const SEC = 0x200, VA = 0x1000, NDESC = 2000, NTH = 20000;
  const thunkAt = NDESC * 20 + 20, nameAt = thunkAt + NTH * 4 + 4;
  const size = SEC + nameAt + 16;
  const b = new Uint8Array(size), dv = new DataView(b.buffer);
  b[0] = 0x4d; b[1] = 0x5a; dv.setUint32(0x3c, 0x40, true);
  dv.setUint32(0x40, 0x4550, true); dv.setUint16(0x44, 0x14c, true); dv.setUint16(0x46, 1, true); dv.setUint16(0x54, 224, true); dv.setUint16(0x56, 0x102, true);
  const opt = 0x58;
  dv.setUint16(opt, 0x10b, true); dv.setUint32(opt + 60, SEC, true); dv.setUint32(opt + 92, 16, true);
  dv.setUint32(opt + 96 + 8, VA, true); dv.setUint32(opt + 96 + 12, NDESC * 20, true);
  const sh = opt + 224;
  dv.setUint32(sh + 8, size - SEC, true); dv.setUint32(sh + 12, VA, true); dv.setUint32(sh + 16, size - SEC, true); dv.setUint32(sh + 20, SEC, true);
  for (let i = 0; i < NDESC; i++) { dv.setUint32(SEC + i * 20, VA + thunkAt, true); dv.setUint32(SEC + i * 20 + 12, VA + nameAt + 2, true); }
  for (let i = 0; i < NTH; i++) dv.setUint32(SEC + thunkAt + i * 4, VA + nameAt, true);
  b.set(new TextEncoder().encode('\0\0x.dll\0'), SEC + nameAt);
  const t = Date.now();
  const f = parsePE(b, 'loop.exe');
  const records = f.imports.length + f.imports.reduce((n, im) => n + im.fns.length, 0);
  assert.ok(records <= PE_WORK_LIMIT && records > 0, String(records));
  assert.ok(Date.now() - t < 5000);
  // Only MZ and PE signatures, no PE32/PE32+ optional header: not a program.
  const bad = new Uint8Array(512), bv = new DataView(bad.buffer);
  bad[0] = 0x4d; bad[1] = 0x5a; bv.setUint32(0x3c, 0x40, true); bv.setUint32(0x40, 0x4550, true);
  assert.throws(() => parsePE(bad, 'bad.exe'), NotAProgram);
});

test('importhooks: file names become string literals; an explicit path wins; comments and multi-line settings', () => {
  assert.equal(jsString('a"b\\c\nd '), '"a\\"b\\\\c\\u000ad\\u2028"');
  assert.equal(eval(jsString('x"); evil(); ("')), 'x"); evil(); ("');
  const pe = (fileName: string, size = 1): PeFile => ({ fileName, size, is64: true, machine: 0x8664, dll: false, imports: [], exports: [], exportName: '', starts: false, mentions: [], rt: [] });
  const old = pe('old/Game.exe'), now = pe('new/Game.exe');
  assert.equal(findExe([old, now], 'new/Game.exe'), now);
  assert.equal(findExe([old, now], 'new\\Game.exe'), now);
  // A bare name two programs have: ambiguous, none picked (both listed).
  assert.equal(findExe([old, now], 'Game.exe'), undefined);
  assert.deepEqual(findExes([old, now], 'Game.exe'), [old, now]);
  assert.equal(findExe([old, now], 'Missing.exe'), undefined);
  // Two input folders (`ncdev imports . ../other`): `./Game.exe` is the first input's, not ambiguous.
  const here = pe('./Game.exe'), other = pe('../other/Game.exe');
  assert.deepEqual(findExes([here, other], './Game.exe'), [here]);
  assert.deepEqual(findExes([here, other], 'Game.exe'), [here, other]);
  assert.deepEqual(findExes([pe('sub/Game.exe')], './Game.exe'), [], 'an explicit ./ path is not a bare name');
  assert.equal(findExe([pe('Game.exe')], './Game.exe')?.fileName, 'Game.exe');
  // A root Game.exe and bin/Game.exe: a bare name is ambiguous; the path picks one.
  const root = pe('Game.exe'), sub = pe('bin/Game.exe');
  assert.deepEqual(findExes([root, sub], 'Game.exe'), [root, sub]);
  assert.deepEqual(findExes([root, sub], './Game.exe'), [root]);
  assert.deepEqual(findExes([root, sub], 'bin/Game.exe'), [sub]);
  // A hook in a block comment is not on.
  assert.ok(!handlerHooks('/* Game.ProtoInput.XinputHook = true; */').has('XinputHook'));
  // SDL2.dll in another folder: Game.SDLPaths as a proper string literal, whatever the folder's name.
  const exe: PeFile = { ...pe('MyGame.exe', 100), imports: [{ dll: 'SDL2.dll', fns: [{ name: 'SDL_Init' }], delay: false }] };
  const sdl: PeFile = { ...pe('bin"\n);x/SDL2.dll', 50), dll: true };
  const lines = analyse([exe, sdl]).found.find((f) => f.rule.id === 'sdl')!.lines;
  const paths = lines.find((l) => l.startsWith('Game.SDLPaths'))!;
  assert.equal(paths, 'Game.SDLPaths = ["bin\\"\\u000a);x"];');
  // The fix goes after the last complete Game.ProtoInput statement, not into a callback.
  const files = read('game');
  const text = 'Game.ExecutableName = "MyGame.exe";\nGame.ProtoInput.InjectStartup = true;\nGame.ProtoInput.OnInputLocked = function () {\n  x();\n};\n';
  const x = importProblems(text, files).find((p) => /XinputHook/.test(p.title))!;
  const fixed = text.slice(0, x.fix!.start) + x.fix!.text + text.slice(x.fix!.end);
  assert.match(fixed, /InjectStartup = true;\nGame\.ProtoInput\.XinputHook = true;\nGame\.ProtoInput\.OnInputLocked/);
  // An unindented callback body and a block comment are not the top level either.
  const flat = 'Game.ExecutableName = "MyGame.exe";\nGame.ProtoInput.InjectStartup = true;\nGame.ProtoInput.OnInputLocked = function () {\nGame.ProtoInput.FocusHooks = true;\n};\n/*\nGame.ProtoInput.GetCursorPosHook = true;\n*/\n';
  const y = importProblems(flat, files).find((p) => /XinputHook/.test(p.title))!;
  assert.equal(y.fix!.start, flat.indexOf('Game.ProtoInput.OnInputLocked'));
  // A "//" inside a string is no comment: the line still counts.
  assert.ok(handlerHooks('var u = "http://x"; Game.ProtoInput.XinputHook = true;').has('XinputHook'));
  // Game.SDLPaths is relative to the instance's root (Nucleus' rootFolder): the .exe's folder without
  // Game.BinariesFolder, the folder above it with Game.BinariesFolder = "bin".
  const exe2: PeFile = { ...pe('bin/Game.exe', 100), imports: [{ dll: 'SDL2.dll', fns: [{ name: 'SDL_Init' }], delay: false }] };
  const sdl2: PeFile = { ...pe('bin/plugins/SDL2.dll', 50), dll: true };
  const sdlLines = (o?: { binariesFolder?: string }) => analyse([exe2, sdl2], undefined, o).found.find((f) => f.rule.id === 'sdl')!.lines;
  assert.ok(sdlLines().includes('Game.SDLPaths = ["plugins"];'), sdlLines().join('\n'));
  assert.ok(sdlLines({ binariesFolder: 'bin' }).includes('Game.SDLPaths = ["bin\\\\plugins"];'));
  assert.ok(sdlLines({ binariesFolder: 'bin\\' }).includes('Game.SDLPaths = ["bin\\\\plugins"];'));
  // Outside the root (a sibling of the .exe's folder): no path can name it.
  assert.ok(!analyse([exe2, { ...sdl2, fileName: 'plugins/SDL2.dll' }]).found.find((f) => f.rule.id === 'sdl')!.lines.some((l) => l.startsWith('Game.SDLPaths')));
  // From the handler's own Game.BinariesFolder (importProblems).
  const t = 'Game.ExecutableName = "Game.exe";\nGame.BinariesFolder = "bin";\n';
  const fix = importProblems(t, [exe2, sdl2]).find((p) => /SDL2/.test(p.title))!.fix!;
  assert.match(fix.text, /Game\.SDLPaths = \["bin\\\\plugins"\];/);
});

test('importhooks: the last assignment of a runtime method counts; unclear ones withhold the fix', () => {
  const files = read('launcher');
  const warn = (t: string) => importProblems(t, files).find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'));
  const head = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.ProtoInput.InjectStartup = true;\n';
  // On, then off: no runtime method, so the fix adds one instead of turning startup off.
  const w = warn(head + 'Game.ProtoInput.InjectRuntime_RemoteLoadMethod = true;\nGame.ProtoInput.InjectRuntime_RemoteLoadMethod = false;\n')!;
  assert.equal(w.fix!.title, 'Inject at runtime instead');
  // EasyHook itself set false later: swapping InjectStartup for EasyHook = true would be undone, so no fix.
  const e = warn(head + 'Game.ProtoInput.InjectRuntime_EasyHookMethod = false;\n')!;
  assert.ok(e && !e.fix);
  // The fixed handler (no EasyHook elsewhere) really leaves a runtime method on and startup off.
  const ok = warn(head)!;
  const fixed = head.slice(0, ok.fix!.start) + ok.fix!.text + head.slice(ok.fix!.end);
  assert.equal(lastSwitch(fixed, 'ProtoInput.InjectRuntime_EasyHookMethod'), true);
  assert.equal(lastSwitch(fixed, 'ProtoInput.InjectStartup'), undefined);
  // Set inside a block: can't tell, no fix.
  const u = warn(head + 'if (x) {\n  Game.ProtoInput.InjectRuntime_RemoteLoadMethod = true;\n}\n')!;
  assert.ok(u && !u.fix);
  // Startup on, then off: no warning.
  assert.equal(warn('Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.ProtoInput.InjectStartup = true;\nGame.ProtoInput.InjectStartup = false;\n'), undefined);
});

test('importhooks: no fix inside a block comment that a ProtoInput line opens', () => {
  const files = read('game');
  const text = 'Game.ExecutableName = "MyGame.exe";\nGame.ProtoInput.InjectStartup = true;\nGame.ProtoInput.FocusHooks = true; /* note\n end */\n';
  const x = importProblems(text, files).find((p) => /XinputHook/.test(p.title))!;
  const fixed = text.slice(0, x.fix!.start) + x.fix!.text + text.slice(x.fix!.end);
  assert.match(fixed, /InjectStartup = true;\nGame\.ProtoInput\.XinputHook = true;\nGame\.ProtoInput\.FocusHooks/);
});

test('importhooks: a statement split over lines is never split by the fix', () => {
  const files = read('game');
  const apply = (t: string) => {
    const x = importProblems(t, files).find((p) => /XinputHook/.test(p.title))!;
    assert.ok(x, 'a hint');
    return x.fix ? t.slice(0, x.fix.start) + x.fix.text + t.slice(x.fix.end) : undefined;
  };
  // A Game.ProtoInput assignment with "=" on the next line: not a place to add after; Game.ExecutableName is.
  const a = apply('Game.ExecutableName = "MyGame.exe";\nGame.ProtoInput.InjectStartup\n= true;\n')!;
  assert.match(a, /^Game\.ExecutableName = "MyGame\.exe";\nGame\.ProtoInput\.XinputHook = true;\nGame\.ProtoInput\.InjectStartup\n= true;\n$/);
  // Game.ExecutableName's statement going on after its string: no safe place, no fix.
  assert.equal(apply('Game.ExecutableName = "MyGame.exe" +\n  "";\nGame.ProtoInput.InjectStartup\n= true;\n'), undefined);
  // Its value on the next line (blank lines before it): after the line the statement ends on.
  const c = apply('\n\nGame.ExecutableName =\n  "MyGame.exe";\nGame.ProtoInput.InjectStartup\n= true;\n')!;
  assert.match(c, /^\n\nGame\.ExecutableName =\n {2}"MyGame\.exe";\nGame\.ProtoInput\.XinputHook = true;\n/);
});

test('importhooks: several input folders keep same-named programs apart', async () => {
  const os = await import('node:os');
  const { readGameBinaries } = await import('../gamefolder-node');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ncdev-imports-'));
  try {
    for (const d of ['one', 'two']) {
      fs.mkdirSync(path.join(root, d));
      fs.copyFileSync(path.join(FIX, 'game', 'MyGame.exe'), path.join(root, d, 'MyGame.exe'));
    }
    const files = readGameBinaries([path.join(root, 'one'), path.join(root, 'two')]);
    const exes = files.filter((f) => !f.dll);
    assert.equal(exes.length, 2);
    assert.equal(findExes(exes, 'MyGame.exe').length, 2, 'a bare name is ambiguous');
    const two = findExes(exes, path.join(root, 'two', 'MyGame.exe'));
    assert.equal(two.length, 1);
    assert.equal(analyse(files, two[0]).main, two[0]);
    // One folder: names relative to it, as before.
    assert.deepEqual(readGameBinaries([path.join(root, 'one')]).map((f) => f.fileName), ['MyGame.exe']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('importhooks: launcher startup only with a real launcher; in a block comment or twice, no fix; with runtime injection too, turn startup off', () => {
  const files = read('launcher');
  const warn = (t: string) => importProblems(t, files).find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'));
  const head = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\n';
  assert.equal(warn('Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "";\nGame.ProtoInput.InjectStartup = true;\n'), undefined, 'an empty LauncherExe');
  const commented = head + '/*\nGame.ProtoInput.InjectStartup = true;\n*/\nif (x) {\n  Game.ProtoInput.InjectStartup = true;\n}\n';
  const c = warn(commented);
  assert.ok(c && !c.fix, 'only an assignment inside a block: no fix');
  const twice = head + 'Game.ProtoInput.InjectStartup = true;\nGame.ProtoInput.InjectStartup = true;\n';
  assert.ok(warn(twice) && !warn(twice)!.fix, 'two assignments: no fix');
  const both = head + 'Game.ProtoInput.InjectStartup = true; // on\nGame.ProtoInput.InjectRuntime_RemoteLoadMethod = true;\n';
  const b = warn(both)!;
  assert.ok(b, 'warns with a runtime method too');
  assert.equal(b.fix!.title, 'Turn startup injection off');
  const fixed = both.slice(0, b.fix!.start) + b.fix!.text + both.slice(b.fix!.end);
  assert.match(fixed, /^Game\.ProtoInput\.InjectStartup = false; \/\/ on$/m);
  assert.match(fixed, /InjectRuntime_RemoteLoadMethod = true/);
  assert.equal(warn(fixed), undefined);
});

test('importhooks: Game.BinariesFolder picks the program Nucleus starts', () => {
  // Only bin/Game.exe imports XInput, and old/Game.exe is larger: a hint means bin/Game.exe was read.
  const pe = (fileName: string, size: number, xinput: boolean): PeFile => ({ fileName, size, is64: true, machine: 0x8664, dll: false, imports: xinput ? [{ dll: 'XINPUT1_3.dll', fns: [{ name: 'XInputGetState' }], delay: false }] : [], exports: [], exportName: '', starts: false, mentions: [], rt: [] });
  const a = pe('old/Game.exe', 500, false), b = pe('bin/Game.exe', 100, true), w = pe('bin/Win64/Game.exe', 100, true);
  const t = 'Game.ExecutableName = "Game.exe";\nGame.BinariesFolder = "bin";\nGame.ProtoInput.InjectStartup = true;\n';
  const x = importProblems(t, [a, b]).find((p) => /XinputHook/.test(p.title));
  assert.ok(x, 'a hint');
  assert.equal(analyse([a, b], 'bin\\Game.exe').main, b);
  // A string with escapes is read as its value ("bin\\Win64" is bin\Win64); the hint still points at the name.
  const t2 = 'Game.ExecutableName = "Game.exe";\nGame.BinariesFolder = "bin\\\\Win64";\nGame.ProtoInput.InjectStartup = true;\n';
  const y = importProblems(t2, [a, w]).find((p) => /XinputHook/.test(p.title));
  assert.ok(y, 'a hint for bin/Win64/Game.exe');
  assert.equal(t2.slice(y!.start, y!.end), 'Game.exe');
  assert.equal(importProblems(t2, [a, w, b]).filter((p) => /XinputHook/.test(p.title)).length, 1);
  // Game.ExecutableName that two programs have, and no Game.BinariesFolder to pick one: no hints (no guessing by size).
  assert.deepEqual(importProblems('Game.ExecutableName = "Game.exe";\nGame.ProtoInput.InjectStartup = true;\n', [a, b]), []);
  assert.ok(importProblems('Game.ExecutableName = "Game.exe";\nGame.ProtoInput.InjectStartup = true;\n', [b]).some((p) => /XinputHook/.test(p.title)));
  // Game.ExecutableName without `;` whose expression goes on (`.replace(…)` on the next line): no fix rather than one that breaks it.
  {
    const cont = 'Game.ExecutableName = "Game.exe"\n  .replace("Game", "Game");\nGame.ProtoInput.InjectStartup\n= true;\n';
    for (const p of importProblems(cont, [b])) assert.ok(!p.fix, 'no fix: ' + p.title);
    assert.ok(importProblems(cont.replace('"Game.exe"\n', '"Game.exe";\n'), [b]).some((p) => p.fix), 'with `;` the fix is back');
    // `!=` (and other operators) on the next line go on too.
    const ne = 'Game.ExecutableName = "Game.exe"\n  != "Other.exe" ? "Game.exe" : "Other.exe";\nGame.ProtoInput.InjectStartup\n= true;\n';
    for (const p of importProblems(ne, [b])) assert.ok(!p.fix, 'no fix: ' + p.title);
  }
  // A name no program has: no hints either (not the largest program instead).
  assert.deepEqual(importProblems('Game.ExecutableName = "Foo.exe";\nGame.ProtoInput.InjectStartup = true;\n', [b]), []);
});

test('importhooks: launcher startup is a warning (not a quiet note); its fix keeps a trailing comment', () => {
  const files = read('launcher');
  const text = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.ProtoInput.InjectStartup = true; // hooks\n';
  const w = importProblems(text, files).find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'))!;
  assert.ok(w && !w.fact);
  const fixed = text.slice(0, w.fix!.start) + w.fix!.text + text.slice(w.fix!.end);
  assert.match(fixed, /^Game\.ProtoInput\.InjectRuntime_EasyHookMethod = true; \/\/ hooks$/m);
  assert.doesNotMatch(fixed, /InjectStartup/);
  // No semicolon and a trailing comment: only the statement is replaced, the comment stays.
  const bare = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.ProtoInput.InjectStartup = true // hooks\n';
  const wb = importProblems(bare, files).find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'))!;
  const fb = bare.slice(0, wb.fix!.start) + wb.fix!.text + bare.slice(wb.fix!.end);
  assert.match(fb, /^Game\.ProtoInput\.InjectRuntime_EasyHookMethod = true; \/\/ hooks$/m);
  // The launcher is found from the game too (war3.exe picked by name, Frozen Throne.exe starts it).
  const a = analyse(files, 'war3.exe');
  assert.equal(a.main?.fileName, 'war3.exe');
  assert.deepEqual(a.launchers.map((f) => f.fileName), ['Frozen Throne.exe']);
});
