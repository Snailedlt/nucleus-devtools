// The release scripts (scripts/release-version.mjs, release-notes.mjs, announce.mjs), run by the Release workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from './tmp';

const root = path.join(__dirname, '..');
// Loaded as the ES modules they are (not bundled), as the workflow runs them.
const load = (name: string): Promise<any> => import(pathToFileURL(path.join(root, 'scripts', name)).href);

const LOG = `# Changelog

<!-- how to write it -->

## Unreleased

### ✨ New

- **Unreleased thing.** Not out yet.

---

## 1.2.0 · 2026-01-02

### ✨ New

- **First.** Details.
- **Second.** Details.

### 🐛 Fixed

- **Third.** Details.
- **Fourth.** Details.
- **Fifth.** Details.
- **Sixth.** Details.

### 🙏 Thanks

- **[Ann](https://github.com/ann)** for testing.
- **Bob** for the report.

---

## 1.1.0 (beta) · 2026-01-01

- **Old.** Details.
`;

test('release-version: package.json\'s version as a plain tag, and plain reasons to stop', async () => {
  const { releaseTag } = await load('release-version.mjs');
  const base = { pkg: '1.2.0', tags: ['v1.0.0-beta.1', 'v1.1.0'], changelog: LOG };
  assert.deepEqual(releaseTag(base), { tag: 'v1.2.0' }, 'empty: package.json\'s version');
  assert.deepEqual(releaseTag({ ...base, requested: ' v1.2.0 ' }), { tag: 'v1.2.0' });
  assert.equal(releaseTag({ ...base, requested: '1.2.0' }).error.title, 'Bad version');
  assert.equal(releaseTag({ ...base, requested: 'v1.2.0-beta.1' }).error.title, 'Bad version', 'no -beta tags any more');
  assert.equal(releaseTag({ ...base, requested: 'v1.3.0' }).error.title, 'Version mismatch');
  assert.equal(releaseTag({ ...base, tags: ['v1.2.0'] }).error.title, 'Already released');
  assert.match(releaseTag({ ...base, tags: ['v1.2.0'] }).error.msg, /Bump package\.json/);
  assert.deepEqual(releaseTag({ ...base, tags: ['v1.2.0'], pushed: 'v1.2.0' }), { tag: 'v1.2.0' }, 'the tag the workflow ran for');
  assert.equal(releaseTag({ ...base, pkg: '1.3.0' }).error.title, 'No release notes');
  assert.match(releaseTag({ ...base, pkg: '1.3.0' }).error.msg, /Rename "## Unreleased"/);
});

test('release-notes: the section, the GitHub notes and the Discord posts', async () => {
  const { section, githubNotes, discordText, discordPayload } = await load('release-notes.mjs');
  const body = section(LOG, '1.2.0');
  assert.ok(body.startsWith('### ✨ New') && body.endsWith('for the report.'), 'without the heading and the --- line');
  assert.equal(section(LOG, '1.2'), undefined, 'a whole version only');
  assert.equal(section(LOG, '9.9.9'), undefined);
  assert.match(section(LOG, '1.1.0'), /^- \*\*Old\.\*\*/);
  const gh = githubNotes(body, 'v1.2.0');
  assert.ok(gh.startsWith(body) && gh.includes('splitscreenme-vscode-v1.2.0.vsix'));
  assert.equal(
    discordText(body, 'v1.2.0'),
    '**v1.2.0 is out** 🛠️\n• First\n• Second\n• Third\n\n<https://github.com/Snailedlt/nucleus-devtools/releases/tag/v1.2.0>\nThanks Ann, Bob 🙏',
  );
  const p = discordPayload(body, 'v1.2.0', new Date('2026-01-02T00:00:00Z'));
  const e = p.embeds[0];
  assert.equal(e.title, '🧩 SplitScreen.Me for VS Code v1.2.0');
  assert.match(e.description, /^• First\n• Second\n• Third\n• Fourth\n• Fifth\n…and 1 more in the release notes\n\n\[Release notes\]/);
  assert.deepEqual(e.fields, [{ name: 'Thanks', value: 'Ann, Bob 🙏' }]);
  assert.equal(e.timestamp, '2026-01-02T00:00:00.000Z');
  assert.equal(p.allowed_mentions, undefined, 'announce.mjs adds that');
  // The CLI: the real CHANGELOG.md has a section for package.json's version or none; --discord needs --tag.
  const run = (...a: string[]) => spawnSync(process.execPath, [path.join(root, 'scripts/release-notes.mjs'), ...a], { encoding: 'utf8' });
  assert.equal(run('--discord').status, 1);
  const missing = run('0.0.0-none');
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /no "## 0\.0\.0-none" section/);
});

test('announce: Discord webhooks only, never pings, and a failed post is only a warning', async (t) => {
  const { webhookUrls, isDiscordWebhook, buildPayload, announce } = await load('announce.mjs');
  const hook = 'https://discord.com/api/webhooks/123/abc-DEF_9';
  assert.deepEqual(webhookUrls(` ${hook}\n\nhttps://example.com/x \n`), [hook, 'https://example.com/x']);
  assert.ok(isDiscordWebhook(hook) && isDiscordWebhook('https://canary.discord.com/api/webhooks/1/x'));
  for (const bad of ['http://discord.com/api/webhooks/1/x', 'https://discord.com.evil.io/api/webhooks/1/x', 'https://example.com/api/webhooks/1/x']) assert.ok(!isDiscordWebhook(bad), bad);
  assert.deepEqual(buildPayload(' hi @everyone \n', false), { content: 'hi @everyone', allowed_mentions: { parse: [] } });
  assert.equal(buildPayload('x'.repeat(2500), false).content.length, 2000, "Discord's limit");
  assert.deepEqual(buildPayload('{"embeds":[],"allowed_mentions":{"parse":["everyone"]}}', true).allowed_mentions, { parse: [] });

  const calls: string[] = [];
  const logs: string[] = [];
  const log = (s: string) => logs.push(s);
  const offline = async (url: string) => {
    calls.push(url);
    throw new Error('getaddrinfo ENOTFOUND discord.com');
  };
  assert.deepEqual(await announce(['https://example.com/x', hook], { content: 'x' }, { fetch: offline, log }), { posted: 0, failed: 2 });
  assert.deepEqual(calls, [hook], 'a non-Discord URL is never called');
  assert.match(logs[0], /^::warning::Webhook 1 doesn't look like a Discord webhook URL; skipped\.$/);
  assert.match(logs[1], /^::warning::Couldn't reach Discord for webhook 2: getaddrinfo ENOTFOUND/);
  const answers = [{ ok: true }, { ok: false, status: 429, text: async () => 'rate limited' }];
  logs.length = 0;
  assert.deepEqual(await announce([hook, hook], { content: 'x' }, { fetch: async () => answers.shift(), log }), { posted: 1, failed: 1 });
  assert.deepEqual(logs, ['Announced in channel 1 of 2.', '::warning::Discord answered 429 for webhook 2: rate limited']);

  // The CLI exits 0 whatever happens to the post (the release is already out).
  const dir = tmpdir(t, 'ncdev-announce-');
  const msg = path.join(dir, 'msg.txt');
  fs.writeFileSync(msg, 'hello');
  const run = (env: Record<string, string>) => spawnSync(process.execPath, [path.join(root, 'scripts/announce.mjs'), msg], { encoding: 'utf8', env: { ...process.env, DISCORD_WEBHOOKS: '', ANNOUNCE_ALLOW_ANY_URL: '', ...env } });
  let r = run({});
  assert.equal(r.status, 0);
  assert.match(r.stdout, /nothing announced/);
  r = run({ DISCORD_WEBHOOKS: 'https://example.com/x' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /skipped/);
  r = run({ DISCORD_WEBHOOKS: 'http://127.0.0.1:9/hook', ANNOUNCE_ALLOW_ANY_URL: '1' }); // nothing listens there: a network error
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /::warning::Couldn't reach Discord for webhook 1/);
});

test('release notes list every uploaded asset in manifest order and substitute the release tag', async () => {
  const { githubNotes } = await load('release-notes.mjs');
  const { assets } = JSON.parse(fs.readFileSync(path.join(root, 'data/release-assets.json'), 'utf8')) as { assets: { name: string; what: string }[] };
  for (const tag of ['v1.2.0', 'v10.0.1']) {
    const notes = githubNotes('Release body', tag);
    const downloads = notes.split('**Downloads** (below):\n')[1].split('\n\n')[0];
    assert.deepEqual(downloads.split('\n'), assets.map(({ name, what }) => `- \`${name.replaceAll('{tag}', tag)}\`: ${what}`));
    assert.doesNotMatch(downloads, /\{tag\}/);
  }
});

test('Notepad++ release archives replace stale files and contain the correct DLL at the root', (t) => {
  for (const tool of ['zip', 'unzip']) {
    if (spawnSync('sh', ['-c', 'command -v "$1"', 'sh', tool]).status !== 0) {
      t.skip(`requires sh and ${tool}`);
      return;
    }
  }
  const dir = tmpdir(t, 'ncdev-npp-zips-');
  const dist = path.join(dir, 'dist-sea');
  const scripts = path.join(dir, 'scripts');
  const out = path.join(dir, 'asset output');
  for (const folder of [dist, scripts, out]) fs.mkdirSync(folder);
  const script = path.join(scripts, 'npp-zips.sh');
  fs.copyFileSync(path.join(root, 'scripts', 'npp-zips.sh'), script);
  const run = (file: string, args: string[], cwd = dir) => {
    const result = spawnSync(file, args, { cwd, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, `${file}: ${result.error ?? result.stderr}`);
    return result.stdout;
  };
  fs.writeFileSync(path.join(dist, 'NcDev.dll'), '64-bit fixture');
  fs.writeFileSync(path.join(dist, 'NcDev-x86.dll'), '32-bit fixture');
  fs.writeFileSync(path.join(out, 'stale.txt'), 'old entry');
  run('zip', ['-q', 'NcDev.zip', 'stale.txt'], out);
  run('zip', ['-q', 'NcDev-x86.zip', 'stale.txt'], out);
  run('sh', [script, 'asset output'], scripts);
  for (const [name, contents] of [['NcDev.zip', '64-bit fixture'], ['NcDev-x86.zip', '32-bit fixture']]) {
    const archive = path.join(out, name);
    assert.equal(run('unzip', ['-Z1', archive]).trim(), 'NcDev.dll');
    assert.equal(run('unzip', ['-p', archive, 'NcDev.dll']), contents);
  }
  assert.deepEqual(fs.readdirSync(dist).sort(), ['NcDev-x86.dll', 'NcDev.dll']);
});
