// Parts of the README (and the site) made from data instead of written twice: the feature comparison
// (data/tools-compare.json) and the Claude Code plugin's install commands (.claude-plugin/marketplace.json). In README.md
// each sits between <!-- generated:NAME --> and <!-- /generated:NAME -->.
//   node scripts/readme-blocks.mjs          rewrites those parts of README.md
//   node scripts/readme-blocks.mjs --check  exits 1 when README.md is out of date (the workbench's tests check this too)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A comparison cell: "yes", "no" or "", then an optional note. */
const cell = (c) => {
  const [mark, ...rest] = c.split(':');
  return { mark: mark.trim(), note: rest.join(':').trim() };
};
const MARK = { yes: '✅', no: '—', '': '' };

export function compareMarkdown(data = readJson('data/tools-compare.json')) {
  const head = `| | ${data.columns.map((c) => (c.readme ? `[${c.label}](${c.readme})` : c.label)).join(' | ')} |`;
  const rows = data.rows.map((r) => `| ${r.feature} | ${r.cells.map((x) => { const { mark, note } = cell(x); return [MARK[mark], note].filter(Boolean).join(' '); }).join(' | ')} |`);
  return [head, `|---|${data.columns.map(() => ':-:').join('|')}|`, ...rows].join('\n');
}

export function compareHtml(data = readJson('data/tools-compare.json')) {
  const note = (n) => esc(n).replace(/`([^`]+)`/g, '<code>$1</code>');
  return `<thead><tr><th scope="col">Feature</th>${data.columns.map((c) => `<th scope="col">${esc(c.label)}</th>`).join('')}</tr></thead>
<tbody>
${data.rows.map((r) => `<tr><th scope="row">${esc(r.feature)}</th>${r.cells.map((x) => { const { mark, note: n } = cell(x); return `<td${mark === 'no' ? ' class="no"' : ''}>${MARK[mark]}${n ? `<small>${note(n)}</small>` : ''}</td>`; }).join('')}</tr>`).join('\n')}
</tbody>`;
}

/** The Claude Code plugin's marketplace (owner/repo) and its id (plugin@marketplace), from the manifests. */
export function claudePlugin() {
  const market = readJson('.claude-plugin/marketplace.json');
  const repo = /github\.com\/([^/]+\/[^/.]+)/.exec(String(readJson('package.json').repository?.url ?? readJson('package.json').repository))?.[1];
  return { marketplace: repo, plugin: `${market.plugins[0].name}@${market.name}` };
}

export function readmeBlocks() {
  const c = claudePlugin();
  return {
    compare: compareMarkdown(),
    'claude-plugin': `\`\`\`\n/plugin marketplace add ${c.marketplace}\n/plugin install ${c.plugin}\n\`\`\``,
  };
}

/** README.md with every generated part brought up to date. */
export function updatedReadme(text = fs.readFileSync(path.join(root, 'README.md'), 'utf8')) {
  for (const [name, body] of Object.entries(readmeBlocks())) {
    const re = new RegExp(`(<!-- generated:${name} -->\\n)[\\s\\S]*?(\\n<!-- /generated:${name} -->)`);
    if (!re.test(text)) throw new Error(`README.md has no <!-- generated:${name} --> block`);
    text = text.replace(re, (_, a, b) => a + body + b);
  }
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = path.join(root, 'README.md');
  const now = fs.readFileSync(file, 'utf8');
  const next = updatedReadme(now);
  if (process.argv.includes('--check')) {
    if (now !== next) { console.error('README.md is out of date: run node scripts/readme-blocks.mjs'); process.exit(1); }
    console.log('README.md is up to date');
  } else if (now !== next) { fs.writeFileSync(file, next); console.log('README.md updated'); } else console.log('README.md is up to date');
}
