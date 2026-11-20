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
  const wiring = d.porting.indexOf('## Wiring');
  const end = d.porting.indexOf('\n## ', d.porting.indexOf('## Debugging'));

  pages.push({
    slug: 'tools/workbench', group: 'Editors', title: 'Workbench', desc: 'The browser workbench\'s keyboard shortcuts.',
    html: `<p>Generated from the workbench's own shortcut list. Change them in the workbench's Settings; <kbd>?</kbd> shows them there.</p>
<p class="small"><a href="__UP__">Open the workbench</a>.</p>
${[...new Set(d.actions.map((a) => a.group))].map((g) => `<h2>${esc(g)}</h2>\n${table(['Action', 'Keys'], d.actions.filter((a) => a.group === g).map((a) => [esc(a.label), keys(a.keys) + (a.mac ? ` <span class="small">(Mac: ${keys(a.mac)})</span>` : '')]))}`).join('\n')}`,
  });
  pages.push({
    slug: 'tools/vscode', group: 'Editors', title: 'VS Code', desc: 'The VS Code extension\'s commands, keys and settings.',
    html: `<p>Generated from the extension's manifest (<code class="use">package.json</code>).</p>
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
    html: `<p>Generated from the plugin's menu.</p>
${get('get-notepadpp', 'Get the tools: Notepad++')}
<h2>The Nucleus menu</h2>
<ul class="dlist">${menu.map((m) => (m.label ? `<li>${esc(m.label)}${m.keys ? ` (${keys(m.keys)})` : ''}</li>` : '</ul><ul class="dlist">')).join('')}</ul>`,
  });
  pages.push({
    slug: 'tools/other-editors', group: 'Editors', title: 'Other editors', desc: `The language server and debugger setups: ${[...d.porting.slice(wiring, end).matchAll(/^### ([^(\n`]+)/gm)].map((m) => m[1].trim()).filter((x) => !/^(Anything|Settings)/.test(x)).join(', ')}.`,
    md: d.porting.slice(wiring, end > 0 ? end : undefined).replace(/^## Wiring[^\n]*\n/, '## Set up your editor\n').replace(/^###? /gm, (h) => (h === '### ' ? '### ' : '## ')),
    mdHref: (u) => (/^https?:/.test(u) ? u : u.startsWith('#') ? `${d.repoUrl}/blob/main/PORTING.md${u}` : `${d.repoUrl}/blob/main/${u}`),
    intro: `<p>From <a href="${d.repoUrl}/blob/main/PORTING.md">PORTING.md</a>, which also covers porting the tools to another editor.</p>
${get('in-your-editor', 'Get the tools: other editors')}`,
  });
  pages.push({
    slug: 'tools/ncdev', group: 'Command line and AI', title: 'ncdev (command line)', desc: 'Every ncdev command and option.',
    html: `<p>Generated from <code class="use">ncdev --help</code>; <code class="use">ncdev &lt;command&gt; --help</code> prints one command's part.</p>
${get('command-line', 'Get the tools: the command line')}
<h2>Commands</h2>
${table(['Command', 'What it does'], cmds.commands.map((c) => [c.use.map(use).join('<br>'), md(c.desc)]))}
<h2>Options for every command</h2>
${table(['Option', 'What it does'], cmds.options.map((c) => [c.use.map(use).join('<br>'), md(c.desc)]))}`,
  });
  pages.push({
    slug: 'tools/mcp', group: 'Command line and AI', title: 'MCP server (AI agents)', desc: 'The tools AI agents get from the nucleus MCP server.',
    html: `<p>Generated from the tool list <code class="use">ncdev mcp</code> serves. <a href="__UP__ai/">Set up your AI</a> connects an agent to it.</p>
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
