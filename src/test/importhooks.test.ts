import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePE, NotAProgram, PE_WORK_LIMIT, type PeFile } from '../core/pe';
import { analyse, importHints, importsReport, handlerHooks, importProblems, jsString, findExe, RULES, HUB_SHARES } from '../core/importhooks';
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
  for (const cut of [200, 600, 1500, 5000, real.length - 100]) assert.doesNotThrow(() => parsePE(real.subarray(0, cut), 'cut.exe'));
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
  assert.equal(findExe([old, now], 'Game.exe'), old);
  assert.equal(findExe([old, now], 'Missing.exe'), undefined);
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
});

test('importhooks: launcher startup is a warning (not a quiet note); its fix keeps a trailing comment', () => {
  const files = read('launcher');
  const text = 'Game.ExecutableName = "war3.exe";\nGame.LauncherExe = "Frozen Throne.exe";\nGame.ProtoInput.InjectStartup = true; // hooks\n';
  const w = importProblems(text, files).find((p) => p.title.startsWith('Game.ProtoInput.InjectStartup injects'))!;
  assert.ok(w && !w.fact);
  const fixed = text.slice(0, w.fix!.start) + w.fix!.text + text.slice(w.fix!.end);
  assert.match(fixed, /^Game\.ProtoInput\.InjectRuntime_EasyHookMethod = true; \/\/ hooks$/m);
  assert.doesNotMatch(fixed, /InjectStartup/);
  // The launcher is found from the game too (war3.exe picked by name, Frozen Throne.exe starts it).
  const a = analyse(files, 'war3.exe');
  assert.equal(a.main?.fileName, 'war3.exe');
  assert.deepEqual(a.launchers.map((f) => f.fileName), ['Frozen Throne.exe']);
});
