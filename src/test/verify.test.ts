import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatVerify, parseCrashLog, parseDebugLog, verifySession, type Observation } from '../core/verify';
import { simulate } from '../core/sim';

const HANDLER = `Game.GameName = "Test Game";
Game.ExecutableName = "TestGame.exe";
Game.GUID = "Test Game";
Game.MaxPlayers = 4;
Game.Play = function () {
  Context.StartArguments = "-w " + Context.Width;
};
`;
const sim2 = () => simulate(HANDLER, { players: 2, width: 1920, height: 1080, keyboardPlayer: 0 });

// The lines as GenericGameHandler.Log writes them ("[yyyy-MM-dd HH:mm:ss]HANDLER: ..."), two sessions appended.
const LOG = [
  '[2026-11-25 10:00:00]HANDLER: ********** Setting up player 1 **********',
  '',
  '[2026-11-25 10:00:01]HANDLER: ERROR - from the old session',
  '[2026-11-25 11:00:00]HANDLER: ********** Setting up player 1 **********',
  '',
  "[2026-11-25 11:00:00]HANDLER: Player monitor's resolution: 1920 x 1080",
  '[2026-11-25 11:00:02]HANDLER: Launching exe C:\\Games\\TestGame.exe',
  '[2026-11-25 11:00:05]HANDLER: ********** Setting up player 2 **********',
  '[2026-11-25 11:00:06]MAIN: something else',
  '[2026-11-25 11:00:07]HANDLER: PIDs stored 100 200 ',
].join('\r\n');

const screen = { x: 0, y: 0, width: 1920, height: 1080 };
const seen = (rects: { x: number; y: number; width: number; height: number }[]): Observation => ({
  exe: 'TestGame.exe',
  processes: rects.map((_, i) => ({ pid: 100 + i, name: 'TestGame.exe' })),
  windows: rects.map((rect, i) => ({ pid: 100 + i, title: 'Test', rect, monitor: screen })),
});

test('debug-log.txt: only the newest session, its players, launches, PIDs and errors', () => {
  const l = parseDebugLog(LOG);
  assert.equal(l.started, true);
  assert.deepEqual(l.playersSetUp, [1, 2]);
  assert.deepEqual(l.launched, ['C:\\Games\\TestGame.exe']);
  assert.deepEqual(l.pids, [100, 200]);
  assert.deepEqual(l.monitors, [{ width: 1920, height: 1080 }]);
  assert.equal(l.errors.length, 0, "the old session's error isn't this one's");
  assert.equal(l.startedAt, '2026-11-25 11:00:00');
  assert.equal(parseDebugLog('[2026-11-25 11:00:00]MAIN: Nucleus started').started, false);
});

test("Nucleus' error file (LogManager.LogExceptionFile): message, handler line, version", () => {
  const c = parseCrashLog('[Header]\r\nWednesday, 25 November 2026\r\n11:00:09\r\nNucleus Co-op v2.3.2\r\n[Message]\r\nLine 12: Object has no method \'Foo\'\r\n[Stacktrace]\r\n   at Jint.Engine...\r\n');
  assert.equal(c?.message, "Line 12: Object has no method 'Foo'");
  assert.equal(c?.handlerLine, 12);
  assert.equal(c?.version, '2.3.2');
  assert.equal(parseCrashLog('nothing here'), undefined);
});

test('verify: windows where Try it put them is a match', () => {
  const r = verifySession({ sim: sim2(), log: parseDebugLog(LOG), seen: seen([{ x: 0, y: 0, width: 960, height: 1080 }, { x: 968, y: 4, width: 952, height: 1076 }]) });
  assert.equal(r.ok, true, formatVerify(r));
  assert.deepEqual(r.players.map((p) => p.ok), [true, true]);
});

test('verify: a fullscreen window, a missing instance, a logged error, a crash', () => {
  const full = verifySession({ sim: sim2(), seen: seen([{ x: 0, y: 0, width: 960, height: 1080 }, screen]) });
  assert.equal(full.ok, false);
  const f = full.findings.find((x) => x.kind === 'window-size');
  assert.equal(f?.player, 2);
  assert.match(f!.hint!, /fullscreen/);

  const one = verifySession({ sim: sim2(), seen: seen([{ x: 0, y: 0, width: 960, height: 1080 }]) });
  assert.ok(one.findings.some((x) => x.kind === 'processes' && /1 TestGame.exe is running for 2 players/.test(x.message)), formatVerify(one));
  assert.equal(one.players[1].ok, false);

  const none = verifySession({ sim: sim2(), seen: seen([]) });
  assert.ok(none.findings.some((x) => x.severity === 'error' && /No TestGame.exe is running/.test(x.message)));

  const logged = verifySession({ sim: sim2(), log: parseDebugLog(LOG + '\r\n[2026-11-25 11:00:08]HANDLER: ERROR - Could not find launcher.exe') });
  assert.ok(logged.findings.some((x) => x.kind === 'log-error' && /launcher\.exe/.test(x.message)));

  const crash = verifySession({ sim: sim2(), crash: { message: 'Line 6: boom', handlerLine: 6 } });
  assert.equal(crash.findings[0].kind, 'crash');
  assert.equal(crash.findings[0].handlerLine, 6);

  const notStarted = verifySession({ sim: sim2(), log: parseDebugLog('') });
  assert.equal(notStarted.findings[0].kind, 'not-started');
});

test('verify: windows on a second monitor are compared on that monitor', () => {
  const right = { x: 1920, y: 0, width: 1920, height: 1080 };
  const r = verifySession({
    sim: sim2(),
    seen: { exe: 'TestGame.exe', processes: [{ pid: 1, name: 'TestGame.exe' }, { pid: 2, name: 'TestGame.exe' }], windows: [{ pid: 1, title: '', rect: { x: 1920, y: 0, width: 960, height: 1080 }, monitor: right }, { pid: 2, title: '', rect: { x: 2880, y: 0, width: 960, height: 1080 }, monitor: right }] },
  });
  assert.equal(r.ok, true, formatVerify(r));
});

test("verify: a different player count is said, not counted as a problem; what wasn't checked is listed", () => {
  const sim = simulate(HANDLER, { players: 3, width: 1920, height: 1080, keyboardPlayer: 0 });
  const r = verifySession({ sim, log: parseDebugLog(LOG) });
  assert.ok(r.findings.some((f) => f.kind === 'players' && f.severity === 'info'));
  assert.equal(r.ok, true);
  assert.match(formatVerify(r), /Not checked: the game windows/);
});

test("verify: another split than Try it's (top and bottom) is the player's choice, not a problem", () => {
  const r = verifySession({ sim: sim2(), seen: seen([{ x: 0, y: 0, width: 1920, height: 540 }, { x: 0, y: 540, width: 1920, height: 540 }]) });
  assert.equal(r.ok, true, formatVerify(r));
  assert.ok(r.findings.some((f) => f.severity === 'info' && /top and bottom/.test(f.message)));
  // One window per screen, on two screens
  const two = verifySession({
    sim: sim2(),
    seen: { exe: 'TestGame.exe', processes: [{ pid: 1, name: 'TestGame.exe' }, { pid: 2, name: 'TestGame.exe' }], windows: [{ pid: 1, title: '', rect: screen, monitor: screen }, { pid: 2, title: '', rect: { x: 1920, y: 0, width: 1920, height: 1080 }, monitor: { x: 1920, y: 0, width: 1920, height: 1080 } }] },
  });
  assert.equal(two.ok, true, formatVerify(two));
});

test('verify: nothing to compare is not a match; the session time is said', () => {
  const r = verifySession({ sim: sim2() });
  assert.equal(r.ok, false);
  assert.match(formatVerify(r), /nothing to compare/);
  assert.match(formatVerify(verifySession({ sim: sim2(), log: parseDebugLog(LOG) })), /Session started 2026-11-25 11:00:00/);
});
