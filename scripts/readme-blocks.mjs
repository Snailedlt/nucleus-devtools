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
// A placeholder in plain text (<Name>/) would be read as an HTML tag by GitHub and vanish: written as code.
const mdCell = (t) => String(t).replace(/\|/g, '\\|').replace(/\n+/g, ' ').split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.replace(/<[A-Za-z][\w ]*>[\w./]*/g, (m) => `\`${m}\``))).join('');

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

/** The tools page's tiles for the editors that use ncdev lsp (the tools page fills <!--ED_TILES--> with them). */
export function editorTiles(data = readJson('data/editors.json')) {
  const repo = readJson('package.json').repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
  return data.editors.map((e) => `<li><a class="ed" data-ed="${e.id}" href="${repo}#${e.tile.readme}" rel="noopener"><img src="../start/editors/${e.id}.svg" alt="" width="40" height="40" loading="lazy"><span><strong>${esc(e.tile.name)}</strong><small>${esc(e.tile.line)}</small></span>${editorTag(e.id, data)}</a></li>`).join('');
}

/** The tools page's setup steps for those editors (<!--ED_STEPS-->), from each editor's `page` in data/editors.json. */
export function editorSteps(data = readJson('data/editors.json')) {
  const repo = readJson('package.json').repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
  const inline = (t) => t.replaceAll('{repo}', repo).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const step = (e, t) => {
    const m = /\{snippet:(\w+)\}$/.exec(t);
    if (!m) return `<li>${inline(t)}</li>`;
    return `<li>${inline(t.slice(0, m.index))}\n<pre class="cfg" data-lang="${m[1]}"><code>${esc(portingSnippet(e.id)).replace(/&quot;/g, '"')}</code></pre></li>`;
  };
  return data.editors.map((e) => `<div class="ed-step" id="setup-${e.id}" hidden><h3>${e.page.title}</h3><ol>${e.page.steps.map((t) => step(e, t)).join('\n')}</ol></div>`).join('');
}

/** An editor's setup snippet: the first code block under its heading in PORTING.md (the tools page shows the same). */
const PORTING_HEADINGS = { neovim: '### Neovim', helix: '### Helix', sublime: '### Sublime Text', emacs: '### Emacs', kate: '### Kate' };
export function portingSnippet(id, porting = fs.readFileSync(path.join(root, 'PORTING.md'), 'utf8')) {
  const h = porting.indexOf(`\n${PORTING_HEADINGS[id]}`);
  if (!PORTING_HEADINGS[id] || h < 0) throw new Error(`PORTING.md has no heading for "${id}"`);
  const m = /```\w*\n([\s\S]*?)```/.exec(porting.slice(h));
  return m[1].replace(/\n$/, '');
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
  const cap = (k) => k.replace(/\b\w/g, (x) => x.toUpperCase());
  // A different key on a Mac is named next to the Windows/Linux one.
  const keys = Object.fromEntries((pkg.contributes.keybindings ?? []).map((k) => [k.command, k.mac && k.mac !== k.key ? `${cap(k.key)} (Mac: ${cap(k.mac)})` : cap(k.key)]));
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
    'snippet-neovim': `\`\`\`lua\n${portingSnippet('neovim')}\n\`\`\``,
    'snippet-helix': `\`\`\`toml\n${portingSnippet('helix')}\n\`\`\``,
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
