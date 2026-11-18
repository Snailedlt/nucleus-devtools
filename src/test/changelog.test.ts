import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Release notes come from CHANGELOG.md (scripts/release-notes.mjs, used by the release workflow).
test('CHANGELOG.md has notes for the next release, each starting with a short bold summary', () => {
  const root = path.join(__dirname, '..');
  const log = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const heads = [...log.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.ok(heads[0] === 'Unreleased' || heads[0].startsWith(version), `the first section should be "Unreleased" or "${version}", not "${heads[0]}"`);
  // The "how to write it" comment holds the template only: a change written into it is never published.
  const comment = log.slice(0, log.indexOf('-->'));
  const stray = comment.split('\n').filter((l) => /^- \*\*/.test(l));
  assert.deepEqual(stray, [], 'a change line inside the comment at the top (move it under the release heading)');
  const first = log.split(/^## .+$/m)[1];
  for (const line of first.split('\n').filter((l) => l.startsWith('- '))) assert.match(line, /^- \*\*.+?\*\*/, `start with a **short summary**: ${line.slice(0, 80)}`);
  // Groups people (and agents) can scan: the emoji headings listed at the top of the file.
  for (const h of first.split('\n').filter((l) => l.startsWith('### '))) assert.ok(['### ✨ New', '### 🛠️ Improved', '### 🐛 Fixed', '### ⚡ Faster', '### ⚠️ Changed', '### 🙏 Thanks'].includes(h.trim()), h);
  // Thanks lines name the person in bold (a GitHub profile link when it came through GitHub).
  for (const sec of log.split(/^### 🙏.*$/m).slice(1)) for (const l of sec.split(/^##/m)[0].split('\n').filter((x) => x.startsWith('- '))) assert.match(l, /^- \*\*(\[[^\]]+\]\(https:\/\/github\.com\/[\w-]+\)|[^*\[]+)\*\* for /, l);
  // Releases are separated by a --- line, so one doesn't run into the next.
  [...log.matchAll(/\n(.*)\n\n## /g)].slice(1).forEach((m) => assert.equal(m[1], '---', 'a --- line before each release (after the first)'));
  // Released sections carry their date ("(beta)" until 0.5.0; 0.6.0 on are plain versions).
  for (const h of heads.slice(1)) assert.match(h, /^\d+\.\d+\.\d+( \(beta\))? · \d{4}-\d{2}-\d{2}$/, h);
});

test("What's New opens at the installed version, without Unreleased or the writing notes", async () => {
  const { whatsNewMarkdown } = await import('../whatsnew');
  const log = '# Changelog\n\nIntro.\n\n<!--\nnotes\n-->\n\n## Unreleased\n\n- **Next.**\n\n---\n\n## 0.8.0 · 2026-11-17\n\n- **Eight.**\n\n---\n\n## 0.7.0 · 2026-11-15\n\n- **Seven.**\n';
  const md = whatsNewMarkdown(log, '0.8.0');
  assert.match(md, /^# Changelog\n\nIntro\.\n\n## 0\.8\.0/);
  assert.doesNotMatch(md, /Unreleased|Next|notes/);
  assert.match(md, /## 0\.7\.0/);
  // A build with no section of its own (between releases): from the newest release.
  assert.match(whatsNewMarkdown(log, '0.9.0'), /^# Changelog\n\nIntro\.\n\n## 0\.8\.0/);
  // A version between two with no section: the release below it, never a newer one's notes.
  assert.match(whatsNewMarkdown(log, '0.7.5'), /^# Changelog\n\nIntro\.\n\n## 0\.7\.0/);
  // Relative links lead to the repository (the copy lives in the extension's storage).
  assert.match(whatsNewMarkdown(log.replace('**Eight.**', '**Eight.** [Porting](PORTING.md) ![x](docs/a.webp)'), '0.8.0'), /\[Porting\]\(https:\/\/github\.com\/Snailedlt\/splitscreenme-vscode\/blob\/main\/PORTING\.md\) !\[x\]\(https:\/\/raw\.githubusercontent\.com\//);
  // The real changelog: the installed version's section first.
  const real = whatsNewMarkdown(fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8'), '0.8.0');
  assert.doesNotMatch(real, /## Unreleased|<!--/);
  assert.match(real.split('\n## ')[1], /^0\.8\.0 /);
});
