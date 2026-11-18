import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parsePE, NotAProgram } from '../core/pe';
import { analyse, importHints, importsReport, handlerHooks, RULES, HUB_SHARES } from '../core/importhooks';
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
