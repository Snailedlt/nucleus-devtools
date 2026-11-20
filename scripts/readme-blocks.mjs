// Parts of the README (and the site) made from data instead of written twice: the feature comparison
// (data/tools-compare.json), the editors' test status (data/editors.json), the Claude Code plugin's install commands (.claude-plugin/marketplace.json), the checks
// (src/core/lint.ts, jsrules.ts, ruledocs.ts), the VS Code settings and commands (package.json) and the MCP server's
// tools (src/mcp.ts). In README.md
// each sits between <!-- generated:NAME --> and <!-- /generated:NAME -->.
//   node scripts/readme-blocks.mjs          rewrites those parts of README.md
//   node scripts/readme-blocks.mjs --check  exits 1 when README.md is out of date (the workbench's tests check this too)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** The core's data the README lists: every check (with its plain title and page) and the MCP server's tools. */
let core;
async function loadCore() {
  if (core) return core;
  const out = await esbuild.build({
    stdin: { contents: "export { RULES } from './core/lint'; export { JS_RULES } from './core/jsrules'; export { RULE_DOCS, ruleUrl } from './core/ruledocs'; export { TOOLS } from './mcp';", resolveDir: path.join(root, 'src'), loader: 'ts' },
    bundle: true, format: 'esm', platform: 'node', write: false, logLevel: 'error', nodePaths: [path.join(root, 'node_modules')],
    define: { __SIM_SANDBOX__: '""', __SIM_WORKER__: '""', __VERSION__: JSON.stringify(readJson('package.json').version), __HUB_TOOL__: '"readme"' },
    banner: { js: `import { createRequire as __cr } from 'node:module'; const require = __cr(${JSON.stringify(import.meta.url)});` },
  });
  core = await import('data:text/javascript;base64,' + Buffer.from(out.outputFiles[0].text).toString('base64'));
  return core;
}
const mdCell = (t) => String(t).replace(/\|/g, '\\|').replace(/\n+/g, ' ');

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

/** Editors that use ncdev lsp and how far each is tested (data/editors.json). */
export function editorsMarkdown(data = readJson('data/editors.json')) {
  const done = (x) => (x ? `✅ ${x}` : 'not yet');
  return ['| Editor | Setup | Tested by people | Tested by AI |', '| --- | --- | --- | --- |', ...data.editors.map((e) => `| ${e.name} | ${e.setup} | ${done(e.people)} | ${done(e.ai)} |`)].join('\n');
}
/** The tools page's tag for an editor: Tested once people or an AI have tried it. */
export function editorTag(id, data = readJson('data/editors.json')) {
  const e = data.editors.find((x) => x.id === id);
  if (!e) throw new Error(`data/editors.json has no editor "${id}"`);
  return e.people || e.ai ? '<span class="ed-tag ok">Tested</span>' : '<span class="ed-tag">Untested</span>';
}

/** The Claude Code plugin's marketplace (owner/repo) and its id (plugin@marketplace), from the manifests. */
export function claudePlugin() {
  const market = readJson('.claude-plugin/marketplace.json');
  const repo = /github\.com\/([^/]+\/[^/.]+)/.exec(String(readJson('package.json').repository?.url ?? readJson('package.json').repository))?.[1];
  return { marketplace: repo, plugin: `${market.plugins[0].name}@${market.name}` };
}

/** The checks: Nucleus' own, then the general JavaScript ones, each with its default and a link to its page. */
export function rulesMarkdown({ RULES, JS_RULES, RULE_DOCS, ruleUrl }, which) {
  const ids = Object.keys(which === 'js' ? JS_RULES : RULES).filter((id) => which === 'js' || !(id in JS_RULES));
  const sev = (id) => (RULES[id]?.severity ?? 'warning');
  return ['| Rule | Default | What it catches |', '| --- | --- | --- |', ...ids.map((id) => `| [\`${id}\`](${ruleUrl(id, 'readme-md')}) | ${sev(id)} | ${mdCell(RULE_DOCS[id]?.title ?? '')} |`)].join('\n');
}

/** The VS Code settings and commands, from the extension's manifest. */
export function settingsMarkdown(pkg = readJson('package.json')) {
  const props = [].concat(pkg.contributes.configuration).flatMap((c) => Object.entries(c.properties ?? {}));
  const def = (v) => (v.default === undefined || v.default === '' ? '' : `\`${JSON.stringify(v.default)}\``);
  return ['| Setting | Default | |', '| --- | --- | --- |', ...props.map(([k, v]) => `| \`${k}\` | ${def(v)} | ${mdCell(v.markdownDescription ?? v.description ?? '')} |`)].join('\n');
}
export function commandsMarkdown(pkg = readJson('package.json')) {
  const keys = Object.fromEntries((pkg.contributes.keybindings ?? []).map((k) => [k.command, k.key.replace(/\b\w/g, (x) => x.toUpperCase())]));
  return ['| Command | Keys |', '| --- | --- |', ...pkg.contributes.commands.map((c) => `| **${c.category ? `${c.category}: ` : ''}${c.title}** | ${keys[c.command] ?? ''} |`)].join('\n');
}

/** The MCP server's tools: name and title (the descriptions are in each tool and on the docs' MCP page). */
export const mcpMarkdown = ({ TOOLS }) => ['| Tool | What it does |', '| --- | --- |', ...TOOLS.map((t) => `| \`${t.name}\` | ${mdCell(t.title ?? t.description.split('. ')[0])} |`)].join('\n');

export async function readmeBlocks() {
  const c = claudePlugin();
  const k = await loadCore();
  return {
    compare: compareMarkdown(),
    editors: editorsMarkdown(),
    rules: rulesMarkdown(k, 'nucleus'),
    'js-rules': rulesMarkdown(k, 'js'),
    settings: settingsMarkdown(),
    'vscode-commands': commandsMarkdown(),
    'mcp-tools': mcpMarkdown(k),
    'claude-plugin': `\`\`\`\n/plugin marketplace add ${c.marketplace}\n/plugin install ${c.plugin}\n\`\`\``,
  };
}

/** README.md with every generated part brought up to date. */
export async function updatedReadme(text = fs.readFileSync(path.join(root, 'README.md'), 'utf8')) {
  for (const [name, body] of Object.entries(await readmeBlocks())) {
    const re = new RegExp(`(<!-- generated:${name} -->\\n)[\\s\\S]*?(\\n<!-- /generated:${name} -->)`);
    if (!re.test(text)) throw new Error(`README.md has no <!-- generated:${name} --> block`);
    text = text.replace(re, (_, a, b) => a + body + b);
  }
  return text;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = path.join(root, 'README.md');
  const now = fs.readFileSync(file, 'utf8');
  const next = await updatedReadme(now);
  if (process.argv.includes('--check')) {
    if (now !== next) { console.error('README.md is out of date: run node scripts/readme-blocks.mjs'); process.exit(1); }
    console.log('README.md is up to date');
  } else if (now !== next) { fs.writeFileSync(file, next); console.log('README.md updated'); } else console.log('README.md is up to date');
}
