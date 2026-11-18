// The AI docs' source files that changed since a commit of this repository, with the AI-written parts that rest on
// them, as Markdown (the Sync workflow puts it in its pull request). Each source link is at the last commit that
// changed its file (scripts/sources.mjs, the model's `commit` per source item), so a commit that moved means the file
// changed: the doc, "In practice" or parameter docs written from it may be out of date and need checking against the
// new version. Compares data/nucleus-api.json at <ref> with the one on disk; prints nothing when no source moved.
//   node scripts/source-changes.mjs [--base <git ref>]   (default HEAD)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
const sources = read('data/sources.json');

const PERMALINK = /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:blob|tree)\/([0-9a-f]{40})/;
const keyOf = (i) => `${i.project ?? ''}\0${i.file ?? ''}`;

/** project + file -> the commit its link is at, for every source item in a model (and `engines`: the engines data). */
export function sourceCommitsOf(model) {
  const out = new Map();
  const walk = (v) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/Basis$/.test(k)) for (const i of x?.source ?? []) { const c = i.commit ?? i.url?.match(PERMALINK)?.[1]; if (c) out.set(keyOf(i), c); }
        else walk(x);
      }
    }
  };
  walk(model.objects);
  const e = model.basisLinks?.engines?.match(PERMALINK)?.[1];
  if (e) out.set('engines', e);
  return out;
}

/** The AI-written parts (data/claude-*.json) that rest on a source item (project + file), or on the engines data. */
function partsOn(key) {
  const files = [['data/claude-docs.json', 'docs', 'doc'], ['data/claude-practice.json', 'practice', 'In practice'], ['data/claude-param-docs.json', 'params', 'parameter docs']];
  const parts = [];
  for (const [f, field, label] of files) {
    for (const [member, e] of Object.entries(read(f)[field] ?? {})) {
      const b = e.basis ?? {};
      if (key === 'engines' ? b.engines : (b.source ?? []).some((i) => keyOf(i) === key)) parts.push(`\`${member}\` (${label})`);
    }
  }
  return parts;
}

/** The changes between two models as Markdown list items: one per moved source, with the compare link and the parts. */
export function sourceChanges(before, after) {
  const was = sourceCommitsOf(before), now = sourceCommitsOf(after);
  const lines = [];
  for (const [key, c] of now) {
    const old = was.get(key);
    if (!old || old === c) continue;
    let name, github;
    if (key === 'engines') { name = `Hub game engines (\`${sources.data.engines.file}\`)`; github = sources.repos[sources.data.engines.repo].github; }
    else {
      const [project, file] = key.split('\0');
      name = `${project}${file ? ` \`${file}\`` : ''}`;
      github = sources.repos[sources.projects[project]?.repo]?.github;
    }
    const compare = github ? `[${old.slice(0, 7)}...${c.slice(0, 7)}](https://github.com/${github}/compare/${old}...${c})` : `${old.slice(0, 7)} → ${c.slice(0, 7)}`;
    const parts = partsOn(key);
    lines.push(`- ${name}: ${compare}${parts.length ? `. Check: ${parts.join(', ')}` : ''}`);
  }
  return lines;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--base');
  const base = i > 0 ? process.argv[i + 1] : 'HEAD';
  let before;
  try { before = JSON.parse(execFileSync('git', ['show', `${base}:data/nucleus-api.json`], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 })); }
  catch { console.error(`No data/nucleus-api.json at ${base}.`); process.exit(1); }
  const lines = sourceChanges(before, read('data/nucleus-api.json'));
  if (lines.length) {
    console.log(`### AI docs' sources that changed\n\nThese source files changed since the docs written from them were last checked, so their links moved to the new version. Read each diff and check that the AI-written parts listed still hold; fix the text (and its \`basis\`) in \`data/claude-*.json\` where they don't.\n`);
    console.log(lines.join('\n'));
  }
}
