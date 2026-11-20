// The docs' Tools section (docs/tools/…): reference pages for each tool, made from the data the tools themselves use,
// so they can't drift: `ncdev --help` (src/clihelp.ts), the MCP server's tool list (src/mcp.ts), the extension's
// commands, settings and keys (package.json), the Notepad++ plugin's menu (npp-plugin/src/NcDev.cpp), the workbench's
// shortcuts (src/keyactions.ts) and the editor setups (PORTING.md). Reference only: no pitches; installing is on the
// tools page (../tools/), the AI setup on ai/.
import fs from 'node:fs';
import path from 'node:path';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
/** A little Markdown in a description: `code`, **bold**, [links](url). */
const md = (t) => esc(t)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
/** A key combination: the site's page pass (kbd.ts kbdify) draws it as keycaps, "Ctrl+K Ctrl+0" as two steps. */
const keys = (k) => `<kbd>${esc(k)}</kbd>`;
/** Code that is a usage line, not handler code: left out of the site's code colouring. */
const use = (u) => `<code class="use">${esc(u)}</code>`;
const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const get = (anchor, label) => `<p class="small">To install it: <a href="__UP__tools/#${anchor}">${label}</a>.</p>`;

/** `ncdev --help` as commands: each with its usage lines and its description. */
export function parseHelp(help) {
  const lines = help.split('\n');
  const section = (name) => {
    const i = lines.findIndex((l) => l.trim() === `${name}:`);
    if (i < 0) return [];
    const out = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.trim()) break;
      const indent = l.length - l.trimStart().length;
      const split = l.length > 30 && l.slice(28, 30) === '  ' && l.slice(0, 30).trim() ? 30 : l.slice(0, 30).trim() ? -1 : 0;
      if (indent >= 30) { out.at(-1).desc.push(l.trim()); continue; }
      const use = split > 0 ? l.slice(0, split).trim() : l.trim();
      const desc = split > 0 ? [l.slice(split).trim()] : [];
      // A command with two usage lines (`report …` then `report --check …`): the second starts at the same indent.
      if (indent === 2 && !(out.length && !out.at(-1).desc.length)) out.push({ use: [use], desc });
      else { out.at(-1).use.push(use); out.at(-1).desc.push(...desc); }
    }
    return out.map((c) => ({ use: c.use, desc: c.desc.join(' ') }));
  };
  return { commands: section('Commands'), options: section('Common options') };
}

/** The Notepad++ plugin's menu, in order, with a gap where the menu has a separator. */
export function parseNppMenu(cpp) {
  const block = cpp.slice(cpp.indexOf('static FuncItem funcs[] = {'), cpp.indexOf('};', cpp.indexOf('static FuncItem funcs[] = {')));
  return [...block.matchAll(/\{L"([^"]*)",[^,]*,[^,]*,[^,]*,\s*(nullptr|&(\w+))\}/g)].map((m) => ({
    label: m[1],
    keys: m[3] ? m[3].replace(/^(alt|ctrl|shift)/, (x) => x[0].toUpperCase() + x.slice(1) + '+').replace(/\+(\w)/, (x) => x.toUpperCase()) : '',
  }));
}

/**
 * @param {{ help: string, mcpTools: { name: string, title?: string, description: string, inputSchema?: any }[],
 *   pkg: any, nppCpp: string, actions: { label: string, group: string, keys: string, mac?: string, where: string }[],
 *   porting: string, repoUrl: string }} d
 * @returns {{ slug: string, title: string, desc: string, html?: string, md?: string, mdHref?: (u: string) => string }[]}
 */
export function toolPages(d) {
  const pages = [];
  const cmds = parseHelp(d.help);
  const conf = [].concat(d.pkg.contributes.configuration ?? []).flatMap((c) => Object.entries(c.properties ?? {}));
  const cmdTitle = Object.fromEntries((d.pkg.contributes.commands ?? []).map((c) => [c.command, `${c.category ? `${c.category}: ` : ''}${c.title}`]));
  const menu = parseNppMenu(d.nppCpp);

  pages.push({
    slug: 'tools/workbench', group: 'Editors', title: 'Workbench', desc: 'The browser workbench\'s keyboard shortcuts.',
    html: `<p>The workbench runs in your browser, with nothing to install. Every shortcut below can be changed in <strong>Settings › Keyboard shortcuts</strong>; <kbd>?</kbd> lists them in the workbench. On a Mac, <kbd>Ctrl</kbd> is <kbd>⌘</kbd> unless a Mac key is shown.</p>
<p class="small"><a href="__UP__">Open the workbench</a>.</p>
${[...new Set(d.actions.map((a) => a.group))].map((g) => `<h2>${esc(g)}</h2>\n${table(['Action', 'Keys'], d.actions.filter((a) => a.group === g).map((a) => [esc(a.label), keys(a.keys) + (a.mac ? ` <span class="small">(Mac: ${keys(a.mac)})</span>` : '')]))}`).join('\n')}`,
  });
  pages.push({
    slug: 'tools/vscode', group: 'Editors', title: 'VS Code', desc: 'The VS Code extension\'s commands, keys and settings.',
    html: `<p>The extension works in VS Code and VSCodium. Its commands are in the Command Palette (<kbd>Ctrl+Shift+P</kbd>) under <strong>Nucleus</strong>; its settings are under <strong>Settings › Extensions › Nucleus</strong>.</p>
${get('get-vscode', 'Get the tools: VS Code')}
<h2>Commands</h2>
${table(['Command'], (d.pkg.contributes.commands ?? []).map((c) => [esc(cmdTitle[c.command])]))}
<h2>Keys</h2>
${table(['Command', 'Keys'], (d.pkg.contributes.keybindings ?? []).map((k) => [esc(cmdTitle[k.command] ?? k.command), keys(k.key.replace(/\b\w/g, (x) => x.toUpperCase())) + (k.mac && k.mac !== k.key ? ` <span class="small">(Mac: ${keys(k.mac.replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\bCmd\b/g, '⌘'))})</span>` : '')]))}
<h2>Settings</h2>
${table(['Setting', 'Default', 'What it does'], conf.map(([k, v]) => [`<code>${esc(k)}</code>`, v.default === undefined || typeof v.default === 'object' ? '' : `<code>${esc(JSON.stringify(v.default))}</code>`, md(v.markdownDescription ?? v.description ?? '')]))}`,
  });
  pages.push({
    slug: 'tools/notepadpp', group: 'Editors', title: 'Notepad++', desc: 'The Notepad++ plugin\'s menu.',
    html: `<p>The plugin adds a <strong>Plugins › Nucleus</strong> menu to Notepad++. It runs <code>ncdev lsp</code> underneath, so its checks and docs are the same as everywhere else.</p>
${get('get-notepadpp', 'Get the tools: Notepad++')}
<h2>The Nucleus menu</h2>
<ul class="dlist">${menu.map((m) => (m.label ? `<li>${esc(m.label)}${m.keys ? ` (${keys(m.keys)})` : ''}</li>` : '</ul><ul class="dlist">')).join('')}</ul>`,
  });
  const wiring = d.porting.indexOf('## Wiring');
  const end = d.porting.indexOf('\n## ', d.porting.indexOf('## Debugging'));
  pages.push({
    slug: 'tools/other-editors', group: 'Editors', title: 'Other editors', desc: 'Neovim, Helix, Zed, Sublime Text, Emacs, JetBrains, Kate: the language server and the debugger.',
    md: d.porting.slice(wiring, end > 0 ? end : undefined).replace(/^## Wiring[^\n]*\n/, '## Set up your editor\n').replace(/^###? /gm, (h) => (h === '### ' ? '### ' : '## ')),
    mdHref: (u) => (/^https?:/.test(u) ? u : u.startsWith('#') ? `${d.repoUrl}/blob/main/PORTING.md${u}` : `${d.repoUrl}/blob/main/${u}`),
    intro: `<p>Other editors get the checks, docs, suggestions and fixes from <code>ncdev lsp</code>, a language server, and the debugger from <code>ncdev dap</code>. Both come with <a href="__UP__docs/tools/ncdev/">ncdev</a>. The setups below are from <a href="${d.repoUrl}/blob/main/PORTING.md">PORTING.md</a>, which also has the details for porting the tools to another editor.</p>
${get('in-your-editor', 'Get the tools: other editors')}`,
  });
  pages.push({
    slug: 'tools/ncdev', group: 'Command line and AI', title: 'ncdev (command line)', desc: 'Every ncdev command and option.',
    html: `<p><code>ncdev</code> checks, fixes, formats, simulates and packages handlers from the command line, one at a time or a whole folder. It's one file: <code>ncdev.exe</code> on Windows, or <code>nucleus.js</code> with Node.js 18 or newer. <code>nucleus</code> is its old name and still works. <code>ncdev &lt;command&gt; --help</code> prints one command's part of this list.</p>
${get('command-line', 'Get the tools: the command line')}
<h2>Commands</h2>
${table(['Command', 'What it does'], cmds.commands.map((c) => [c.use.map(use).join('<br>'), md(c.desc)]))}
<h2>Options for every command</h2>
${table(['Option', 'What it does'], cmds.options.map((c) => [c.use.map(use).join('<br>'), md(c.desc)]))}`,
  });
  pages.push({
    slug: 'tools/mcp', group: 'Command line and AI', title: 'MCP server (AI agents)', desc: 'The tools AI agents get from the nucleus MCP server.',
    html: `<p><code>ncdev mcp</code> is an MCP server: AI agents (Claude Code, Codex, Cursor, Copilot and others) call these tools to check, fix and try the handlers they write. The Claude Code plugin and the VS Code extension start it for you; <a href="__UP__ai/">Set up your AI</a> has the prompts that set it up in other agents.</p>
${d.mcpTools.map((t) => {
      const props = Object.entries(t.inputSchema?.properties ?? {});
      const req = new Set(t.inputSchema?.required ?? []);
      return `<h2 id="${esc(t.name)}"><code>${esc(t.name)}</code>${t.title ? `: ${esc(t.title)}` : ''}</h2>\n<p>${md(t.description)}</p>${props.length ? `\n${table(['Parameter', 'Type', 'What it is'], props.map(([k, v]) => [`<code>${esc(k)}</code>${req.has(k) ? '' : ' <span class="small">(optional)</span>'}`, esc(v.type ?? (v.enum ? v.enum.join(' | ') : '')), md(v.description ?? '')]))}` : ''}`;
    }).join('\n')}`,
  });
  return pages;
}

/** Read the sources from the repository (the core's root) and the workbench (its keyactions), for build.mjs. */
export function readToolSources(coreRepo) {
  const read = (p) => fs.readFileSync(path.join(coreRepo, p), 'utf8');
  return { pkg: JSON.parse(read('package.json')), nppCpp: read('npp-plugin/src/NcDev.cpp'), porting: read('PORTING.md') };
}
