import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allSteps, readFlow, stepAt, type Part, type Step } from '../core/flow';

const say = (p: Part[]) => p.map((x) => (typeof x === 'string' ? x : `[${x.t}:${x.l}]`)).join(' ');

const HANDLER = `Hub.Handler.Id = "abc";
Game.GameName = "Test Game";
Game.ExecutableName = "TestGame.exe";
Game.MaxPlayers = 4;
Game.KillMutex = ["one", "two"];
var answers = ["Yes", "No"];
Game.AddOption("Use native splitscreen?", "", "Native", answers);
function helper() { return 1; }
Game.OnStop = function () {
  Context.Log("bye");
};
Game.Play = function () {
  var native = Context.Options["Native"];
  var savePath = (Context.SavePath = Context.GetFolder(Nucleus.Folder.InstancedGameFolder) + "\\\\a.ini");
  var savePkgOrigin = System.IO.Path.Combine(Game.Folder, "a.ini");
  System.IO.File.Copy(savePkgOrigin, savePath, true);
  if (native == "Yes") {
    Context.StartArguments = "-w " + Context.Width;
  } else {
    System.IO.Directory.CreateDirectory(Context.GetFolder(Nucleus.Folder.Documents) + "\\\\x");
  }
  //System.IO.File.Delete(savePath);
  Game.HookFocus = true;
  Game.FakeFocus = false;
  Game.ForceFocus = true;
  Context.Something(1, 2);
  helper();
};
`;

test('Flow: settings by section, questions with their answers, callbacks in the order Nucleus runs them', () => {
  const f = readFlow(HANDLER);
  assert.equal(f.ok, true);
  assert.ok(!f.settings.some((s) => s.path.startsWith('Hub.')), "the Hub's own lines aren't shown");
  const name = f.settings.find((s) => s.path === 'Game.GameName')!;
  assert.equal(name.section, 'Game Info');
  assert.deepEqual(name.value.map((t) => t.l), ['Test Game']);
  assert.equal(f.settings.find((s) => s.path === 'Game.KillMutex')!.value[0].t, 'list');
  assert.deepEqual(f.questions, [{ key: 'Native', question: 'Use native splitscreen?', answers: ['Yes', 'No'], from: f.questions[0].from, to: f.questions[0].to }]);
  assert.ok(!f.other.some((s) => say(s.summary).includes('answers')), 'the answers list shows with its question only');
  assert.ok(f.other.some((s) => s.kind === 'code'), 'a helper function is code');
  assert.deepEqual(f.callbacks.map((c) => c.api), ['Game.Play', 'Game.OnStop']);
});

test('Flow: the copy triple is one step, an if forks, commented-out code is turned off, runs are groups', () => {
  const play = readFlow(HANDLER).callbacks[0].steps;
  const verbs = play.map((s) => s.verb);
  assert.deepEqual(verbs, ['Name a value', 'Copy a file', 'If', 'Turned off', 'Set 3 options', 'Something', 'Code']);
  const copy = play[1];
  assert.equal(say(copy.summary), "[place:Handler's own folder] [text:\\a.ini] to [place:This player's game folder] [text:\\a.ini]");
  assert.ok(HANDLER.slice(copy.from, copy.to).startsWith('var savePath'), 'its code starts at the first var it folded');
  const ifs = play[2];
  assert.equal(say(ifs.cond!), '[opt:Answer: Native] is [text:Yes]');
  assert.equal(say(ifs.then![0].summary), '[text:-w ] [player:Window width]');
  assert.equal(ifs.else![0].verb, 'Create a folder');
  assert.equal(play[4].items!.length, 3);
  assert.deepEqual(play[4].columns, ['Option', 'Value']);
});

test('Flow: a step for every offset, and a parse error says so', () => {
  const f = readFlow(HANDLER);
  const at = HANDLER.indexOf('Context.Width');
  const s = stepAt(f, at) as Step;
  assert.equal(s.verb, 'Set the start arguments');
  assert.ok(allSteps(f).length > 8);
  const bad = readFlow('Game.Play = function () {');
  assert.equal(bad.ok, false);
  assert.match(bad.error!, /Unexpected/);
});
