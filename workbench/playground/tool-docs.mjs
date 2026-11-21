// The docs' Tools section (docs/tools/…): for each tool what it is and when it is useful, how it works, and its
// reference. Made from data, so it can't drift:
// - the reference parts from what the tools themselves use: `ncdev --help` (src/clihelp.ts), the MCP server's tool list
//   (src/mcp.ts), the extension's commands, settings and keys (package.json), the Notepad++ plugin's menu
//   (npp-plugin/src/NcDev.cpp), the workbench's shortcuts (src/keyactions.ts) and the editor setups (PORTING.md);
// - the introductions and the two diagrams from data/tools.json; the editors' comparison from data/tools-compare.json;
// - the workbench guide from src/guide.json (its pages), src/tourparts.json (the labelled screenshot's legend: the
//   tour's own steps) and src/tips.ts (each page's "Good to know").
// Installing is on the tools page (../tools/), the AI setup on ai/.
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
  return { commands: section('Commands'), options: section('Common options'), lint: section('Lint options') };
}

/** The Notepad++ plugin's menu, in order, with a gap where the menu has a separator. */
export function parseNppMenu(cpp) {
  const block = cpp.slice(cpp.indexOf('static FuncItem funcs[] = {'), cpp.indexOf('};', cpp.indexOf('static FuncItem funcs[] = {')));
  return [...block.matchAll(/\{L"([^"]*)",[^,]*,[^,]*,[^,]*,\s*(nullptr|&(\w+))\}/g)].map((m) => ({
    label: m[1],
    keys: m[3] ? m[3].replace(/^(alt|ctrl|shift)/, (x) => x[0].toUpperCase() + x.slice(1) + '+').replace(/\+(\w)/, (x) => x.toUpperCase()) : '',
  }));
}


/** Keys written in backticks (`F8`, `Alt+Enter`) are keys, not code. */
const KEYISH = /^(?:(?:Ctrl|Alt|Shift|Cmd|Meta)\+)*(?:F\d{1,2}|Esc|Tab|Enter|Space|Home|End|Up|Down|Left|Right|[A-Z0-9?]|[↑↓←→])$/;

/** The guide's and the introductions' text: `code` and `keys`, **bold**, *emphasis*, {key:<action id>}, links
 *  (https://…, @guide:<page id>, @site:<path>, @docs:<slug>). `c`: { keyOf, guideHref }. */
function rich(t, c) {
  const link = (u) => {
    if (/^https?:/.test(u)) return u;
    const m = /^@(guide|site|docs):(.*)$/.exec(u);
    if (!m) throw new Error(`tool docs: a link to "${u}": use https://…, @guide:<page>, @site:<path> or @docs:<slug>.`);
    return m[1] === 'guide' ? c.guideHref(m[2]) : m[1] === 'docs' ? `__UP__docs/${m[2]}/` : `__UP__${m[2]}`;
  };
  return esc(t)
    .replace(/\{key:(\w+)\}/g, (_, id) => keys(c.keyOf(id)))
    .replace(/`([^`]+)`/g, (_, x) => (KEYISH.test(x) ? `<kbd>${x}</kbd>` : `<code class="use">${x}</code>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, u) => `<a href="${link(u.replace(/&amp;/g, '&'))}">${text}</a>`);
}
/** Blocks of that text: paragraphs, "- " lists and "1. " steps. */
function blocks(md0, c) {
  return md0.split(/\n{2,}/).map((b) => {
    const lines = b.split('\n');
    const out = [];
    let list = null;
    const flush = () => { if (list) { out.push(`<${list.tag}${list.tag === 'ol' ? ' class="steps"' : ' class="dlist"'}>${list.items.map((i) => `<li>${rich(i, c)}</li>`).join('')}</${list.tag}>`); list = null; } };
    for (const l of lines) {
      const m = /^(?:- |(\d+)\. )(.*)$/.exec(l);
      if (!m) { flush(); out.push(`<p>${rich(l, c)}</p>`); continue; }
      const tag = m[1] ? 'ol' : 'ul';
      if (list && list.tag !== tag) flush();
      (list ??= { tag, items: [] }).items.push(m[2]);
    }
    flush();
    return out.join('\n');
  }).join('\n');
}

/** A screenshot in the page's theme: the light and the dark one, the right one shown by CSS (.th-light / .th-dark). */
function shot(name, caption, alt, size) {
  const [w, h] = size ?? [1920, 1200];
  const img = (t) => `<img class="th-${t}" src="__UP__start/gallery/${name}-${t}.webp" alt="${t === 'light' ? esc(alt) : ''}" width="${w}" height="${h}" loading="lazy" decoding="async"${t === 'dark' ? ' aria-hidden="true"' : ''}>`;
  return `<figure class="shot${h > w ? ' tall' : ''}">${img('light')}${img('dark')}<figcaption>${esc(caption)}</figcaption></figure>`;
}
const shots = (list, d) => (list ?? []).map((x) => {
  const [name, own] = Array.isArray(x) ? x : [x];
  const g = d.gallery[name];
  if (!own && !g) throw new Error(`tool docs: the screenshot "${name}" has no caption: it isn't in the start page's gallery, so give one ([name, caption]).`);
  d.used.add(name);
  return shot(name, own ?? g.caption, g ? `${g.tool}: ${g.label}` : `Workbench: ${name.replace(/^workbench-/, '').replace(/-/g, ' ')}`, d.sizes?.[name]);
}).join('\n');
const video = (name, title, line, d) => {
  const v = d.videos[name];
  if (!v) throw new Error(`tool docs: no video "${name}" on the start page (its size is read from there).`);
  return `<figure class="shot vid"><video controls preload="none" playsinline muted poster="__UP__start/videos/${name}-poster.jpg" width="${v.w}" height="${v.h}" aria-label="${esc(title)}: a short demo with captions"><source src="__UP__start/videos/${name}.mp4" type="video/mp4"></video>
<figcaption>${esc(line)} It has captions and no sound. <a href="__UP__start/videos/${name}.mp4">Download</a></figcaption></figure>`;
};

/** What a tool is and when it is useful (data/tools.json), on top of its page. */
function intro(t, c, d) {
  return `<div class="tool-intro">
<p class="lead">${rich(t.what, c)}</p>
<h2 id="when">When to use it</h2>
<ul class="dlist">${t.when.map((w) => `<li>${rich(w, c)}</li>`).join('')}</ul>
${t.not ? `<p class="small">${rich(t.not, c)}</p>\n` : ''}<p><a class="btn primary" href="__UP__${t.get.href}">${esc(t.get.label)}</a></p>
</div>${t.video ? `\n${video(t.video, t.title, t.videoLine, d)}` : ''}`;
}

/** Diagram: every tool around the one engine they share. Boxes and lines in HTML and CSS, so it wraps and stays text. */
function coreDiagram(d) {
  const card = (t) => `<li><a href="__UP__docs/${t.slug}/"><strong>${esc(t.title.replace(/ \(.*\)$/, ''))}</strong><small>${esc(t.short)}</small></a></li>`;
  const half = Math.ceil(d.tools.tools.length / 2);
  return `<figure class="dg" aria-labelledby="dg-core-cap">
<div class="dg-core">
<ul class="dg-row top">${d.tools.tools.slice(0, half).map(card).join('')}</ul>
<p class="dg-engine"><strong>${esc(d.tools.core.title)}</strong><span>${d.tools.core.parts.map(esc).join(' · ')}</span></p>
<ul class="dg-row bottom">${d.tools.tools.slice(half).map(card).join('')}</ul>
</div>
<figcaption id="dg-core-cap">${esc(d.tools.core.line)}</figcaption></figure>`;
}
/** Diagram: a handler's path, from writing to the Hub. `href`: a step's page, where there is one. */
function flowDiagram(d, caption, href = () => null) {
  return `<figure class="dg" aria-labelledby="dg-flow-cap">
<ol class="dg-flow">${d.tools.flow.map((s) => { const u = href(s.id); const inner = `<strong>${esc(s.label)}</strong><small>${esc(s.line)}</small>`; return `<li>${u ? `<a href="${u}">${inner}</a>` : `<span>${inner}</span>`}</li>`; }).join('')}</ol>
<figcaption id="dg-flow-cap">${esc(caption)}</figcaption></figure>`;
}

/**
 * @param {{ help: string, mcpTools: { name: string, title?: string, description: string, inputSchema?: any }[],
 *   pkg: any, nppCpp: string, actions: { id: string, label: string, group: string, keys: string, mac?: string, where: string }[],
 *   porting: string, repoUrl: string, tools: any, guide: any, tourParts: { parts: any[] }, tips: { id: string, text: string, kind?: string }[],
 *   gallery: Record<string, { tool: string, label: string, caption: string }>, videos: Record<string, { w: number, h: number }>,
 *   sizes?: Record<string, [number, number]>, map?: { width: number, height: number, parts: Record<string, { x: number, y: number }> } | null,
 *   compareHtml: string, editors: { editors: any[] }, editorTag: (id: string) => string, settingsTabs: string[] }} d
 * @returns {{ pages: { slug: string, group: string, title: string, nav: string, desc: string, html: string }[], index: string, media: string[] }}
 */
export function toolDocs(d) {
  d.used = new Set();
  const pages = [];
  const cmds = parseHelp(d.help);
  const conf = [].concat(d.pkg.contributes.configuration ?? []).flatMap((c) => Object.entries(c.properties ?? {}));
  const cmdTitle = Object.fromEntries((d.pkg.contributes.commands ?? []).map((c) => [c.command, `${c.category ? `${c.category}: ` : ''}${c.title}`]));
  const menu = parseNppMenu(d.nppCpp);
  const wiring = d.porting.indexOf('## Wiring');
  const end = d.porting.indexOf('\n## ', d.porting.indexOf('## Debugging'));
  const tool = Object.fromEntries(d.tools.tools.map((t) => [t.id, t]));
  const groupTitle = Object.fromEntries(d.tools.groups.map((g) => [g.id, g.title]));
  const action = Object.fromEntries(d.actions.map((a) => [a.id, a]));
  const guidePage = Object.fromEntries(d.guide.pages.map((p) => [p.id, p]));
  const c = {
    keyOf: (id) => { if (!action[id]) throw new Error(`tool docs: {key:${id}} is not an action in keyactions.ts.`); return action[id].keys; },
    guideHref: (id) => { if (!guidePage[id]) throw new Error(`tool docs: @guide:${id} is not a page in guide.json.`); return `__UP__docs/${guidePage[id].slug}/`; },
  };
  const keyCell = (a) => keys(a.keys) + (a.mac ? ` <span class="small">(Mac: ${keys(a.mac)})</span>` : '') + (a.where === 'fixed' ? ' <span class="small">fixed</span>' : '');
  const keyTable = (list) => table(['Action', 'Keys'], list.map((a) => [esc(a.label), keyCell(a)]));
  const tipText = Object.fromEntries(d.tips.map((t) => [t.id, t.text]));
  const partNo = Object.fromEntries(d.tourParts.parts.map((p, i) => [p.id, i + 1]));

  // The workbench guide (guide.json): the overview first, then a page per area.
  const overview = d.guide.pages[0];
  for (const [i, p] of d.guide.pages.entries()) {
    const parts = d.tourParts.parts.filter((x) => x.page === p.id);
    const prev = d.guide.pages[i - 1];
    const next = d.guide.pages[i + 1];
    const body = [];
    if (p === overview) {
      body.push(intro(tool.workbench, c, d));
      // The labelled screenshot: the tour's own parts, numbered; each number sits on its part and leads to its line.
      const pins = d.map ? d.tourParts.parts.filter((x) => d.map.parts[x.id]).map((x) => `<a class="map-pin" href="#part-${x.id}" style="left:${d.map.parts[x.id].x}%;top:${d.map.parts[x.id].y}%" aria-label="${partNo[x.id]}: ${esc(x.title)}">${partNo[x.id]}</a>`).join('') : '';
      if (d.map) d.used.add('workbench-map');
      body.push(`<h2 id="where-things-are">Where things are</h2>
${d.map ? `<figure class="shot wb-map"><div class="map-scroll"><div class="map-frame"><img class="th-light" src="__UP__start/gallery/workbench-map-light.webp" alt="The workbench: the code on the left, the results on the right, the tools in a bar on top" width="${d.map.width}" height="${d.map.height}"><img class="th-dark" src="__UP__start/gallery/workbench-map-dark.webp" alt="" aria-hidden="true" width="${d.map.width}" height="${d.map.height}">${pins}</div></div>
<figcaption>Each number is explained below. The tour inside the workbench walks you through the same parts.</figcaption></figure>\n` : ''}<ol class="map-legend">${d.tourParts.parts.map((x) => `<li id="part-${x.id}"><strong>${esc(x.title)}.</strong> ${rich(x.text, c)}${x.page && x.page !== p.id ? ` <a href="${c.guideHref(x.page)}">More: ${esc(guidePage[x.page].nav)}</a>` : ''}</li>`).join('')}</ol>
<p class="small">Your layout may look different. The tools can sit in a rail on the side, and Files and Lines can be on either side of the code (see <a href="${c.guideHref('settings')}">Settings and looks</a>). On a phone you switch between the code and the results.</p>`);
    } else {
      body.push(`<p class="lead">${rich(p.intro, c)}</p>`);
      if (parts.length) body.push(`<p class="where small">Where it is: ${parts.map((x) => `<a href="${c.guideHref('overview')}#part-${x.id}" title="Where things are"><span class="pin" aria-hidden="true">${partNo[x.id]}</span>${esc(x.title)}</a>`).join(' ')}</p>`);
    }
    const figs = shots(p.shots, d);
    if (figs) body.push(`<div class="shots">${figs}</div>`);
    for (const s of p.sections ?? []) body.push(`<h2 id="${s.h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}">${esc(s.h)}</h2>\n${blocks(s.md, c)}`);
    if (p === overview) {
      body.push(`<h2 id="from-idea-to-nucleus">From an idea to a handler in Nucleus</h2>
${flowDiagram(d, 'The workbench handles the first four steps. Testing in Nucleus Co-op and uploading to the Hub happen outside it.', (id) => ({ write: c.guideHref('writing'), check: c.guideHref('check'), try: c.guideHref('try-it'), save: c.guideHref('files') })[id] ?? null)}`);
      body.push(`<h2 id="the-guide">What's in this guide</h2>
<ul class="tool-cards">${d.guide.pages.slice(1).map((x) => `<li><a href="${c.guideHref(x.id)}"><strong>${esc(x.nav)}</strong><small>${esc(x.desc)}</small></a></li>`).join('')}</ul>`);
    }
    if (p.settingsTabs) body.push(`<h2 id="sections">Sections in Settings</h2>\n<ul class="chips">${d.settingsTabs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`);
    if (p.allKeys) body.push([...new Set(d.actions.map((a) => a.group))].map((g) => `<h2>${esc(g)}</h2>\n${keyTable(d.actions.filter((a) => a.group === g))}`).join('\n'));
    if (p.keys?.length) body.push(`<h2 id="keys">Keys</h2>\n${keyTable(p.keys.map((id) => { if (!action[id]) throw new Error(`tool docs: guide page "${p.id}" lists the key "${id}", which is not an action in keyactions.ts.`); return action[id]; }))}\n<p class="small">These are the default keys. <a href="${c.guideHref('shortcuts')}">See all shortcuts</a>.</p>`);
    if (p.tips?.length) body.push(`<h2 id="tips">Tips from the workbench</h2>\n<ul class="dlist tips">${p.tips.map((id) => { if (!tipText[id]) throw new Error(`tool docs: guide page "${p.id}" lists the tip "${id}", which is not in tips.ts.`); return `<li>${rich(tipText[id], c)}</li>`; }).join('')}</ul>`);
    body.push(`<nav class="guide-nav" aria-label="The workbench guide">${prev ? `<a rel="prev" href="${c.guideHref(prev.id)}"><small>Previous</small>${esc(prev.nav)}</a>` : '<span></span>'}${next ? `<a rel="next" href="${c.guideHref(next.id)}"><small>Next</small>${esc(next.nav)}</a>` : '<span></span>'}</nav>
<p class="small"><a href="__UP__">Open the workbench</a> · <a href="__UP__#tour">Take the tour in it</a></p>`);
    pages.push({ slug: p.slug, group: groupTitle.workbench, title: p.title, nav: p.nav, desc: p.desc, html: body.join('\n') });
  }

  // Editors: the overview (which editor, and the comparison), then each editor's page.
  const lsp = d.editors.editors;
  pages.push({
    slug: 'tools/editors', group: groupTitle.editors, title: 'Picking an editor', nav: 'Compare the editors', desc: 'VS Code, Notepad++, other editors and the workbench side by side, and what each one can do.',
    html: `<p class="lead">All of these give you the same checks, fixes, suggestions and docs, since the same engine runs underneath. Where they differ is in how you install them and in a few extras.</p>
<h2 id="which">Which one to pick</h2>
<ul class="tool-cards two">
<li><a href="__UP__docs/tools/vscode/"><strong>VS Code</strong><small>Has the most in it, including a Docs panel, Try it next to your code and a debugger. If you don't have a favourite editor, pick this one.</small></a></li>
<li><a href="__UP__docs/tools/notepadpp/"><strong>Notepad++</strong><small>The most popular editor among handler authors. Setup is one command. It has no debugger.</small></a></li>
<li><a href="__UP__docs/tools/other-editors/"><strong>${lsp.slice(0, 3).map((e) => esc(e.tile.name)).join(', ')} and others</strong><small>These need a few lines of config. We have setups for ${lsp.slice(0, -1).map((e) => esc(e.tile.name)).join(', ')} and ${esc(lsp.at(-1).tile.name)}. Other editors with a language-server client should work too.</small></a></li>
<li><a href="__UP__docs/tools/workbench/"><strong>Or no editor at all</strong><small>The workbench has the same tools in a browser tab, with nothing to install.</small></a></li>
</ul>
<h2 id="compare">Side by side</h2>
<div class="compare-wrap" tabindex="0" role="region" aria-label="Features by editor (scrolls sideways)">
<table class="compare">
${d.compareHtml}
</table>
</div>
<h2 id="language-server-editors">Editors that use the language server</h2>
<p>These all run <code class="use">ncdev lsp</code>. Here's how far each setup has been tested.</p>
${table(['Editor', 'Setup', 'Tested'], lsp.map((e) => [esc(e.name), esc(e.tile.line), d.editorTag(e.id)]))}
<p class="small">The setups themselves are on <a href="__UP__docs/tools/other-editors/">Other editors</a>. If your editor isn't here, the server should still work as long as the editor has a language-server client. <a href="${d.repoUrl}/blob/main/PORTING.md">PORTING.md</a> explains how to wire it up.</p>`,
  });
  pages.push({
    slug: 'tools/vscode', group: groupTitle.editors, title: 'VS Code', nav: 'VS Code', desc: 'What the VS Code extension does, with its commands, keys and settings.',
    html: `${intro(tool.vscode, c, d)}
<div class="shots">${shots(tool.vscode.shots, d)}</div>
<h2 id="how-it-works">How it works</h2>
<ul class="dlist">
<li>Open a handler. The extension recognises a .js file in a <code class="use">handlers</code> folder, and any other .js file that looks like a handler. From then on it's checked while you type, with problems underlined in the code and listed in the Problems panel.</li>
<li>Press <kbd>Ctrl+.</kbd> on a problem to see its fixes. Hover a name to read its docs, and follow the link in the hover if you want the Nucleus Docs panel open beside your code.</li>
<li>Everything else is in the command palette. Press <kbd>Ctrl+Shift+P</kbd> and type "Nucleus".</li>
</ul>
<h2 id="commands">Commands</h2>
${table(['Command'], (d.pkg.contributes.commands ?? []).map((x) => [esc(cmdTitle[x.command])]))}
<h2 id="keys">Keys</h2>
${table(['Command', 'Keys'], (d.pkg.contributes.keybindings ?? []).map((k) => [esc(cmdTitle[k.command] ?? k.command), keys(k.key.replace(/\b\w/g, (x) => x.toUpperCase())) + (k.mac && k.mac !== k.key ? ` <span class="small">(Mac: ${keys(k.mac.replace(/\b\w/g, (x) => x.toUpperCase()).replace(/\bCmd\b/g, '⌘'))})</span>` : '')]))}
<h2 id="settings">Settings</h2>
${table(['Setting', 'Default', 'What it does'], conf.map(([k, v]) => [`<code>${esc(k)}</code>`, v.default === undefined || typeof v.default === 'object' ? '' : `<code>${esc(JSON.stringify(v.default))}</code>`, md(v.markdownDescription ?? v.description ?? '')]))}
<p class="small">These lists are generated from the extension's <code class="use">package.json</code>.</p>`,
  });
  pages.push({
    slug: 'tools/notepadpp', group: groupTitle.editors, title: 'Notepad++', nav: 'Notepad++', desc: 'What the Notepad++ plugin does, and what\'s in its menu.',
    html: `${intro(tool.notepadpp, c, d)}
<div class="shots">${shots(tool.notepadpp.shots, d)}</div>
<h2 id="how-it-works">How it works</h2>
<ul class="dlist">
<li>The plugin runs <code class="use">ncdev</code> in the background and asks it about the handler you have open. That's why Notepad++ shows the same problems and docs as the other tools.</li>
<li>Problems get underlined while you type. Hover one to read what's wrong, or press <kbd>Alt+Enter</kbd> to fix it.</li>
<li>The rest is in the menu, under <strong>Plugins › Nucleus Co-op handlers</strong>.</li>
</ul>
<h2 id="menu">The Nucleus menu</h2>
<ul class="dlist">${menu.map((m) => (m.label ? `<li>${esc(m.label)}${m.keys ? ` (${keys(m.keys)})` : ''}</li>` : '</ul><ul class="dlist">')).join('')}</ul>
<p class="small">This list is read from the plugin's own menu.</p>`,
  });
  pages.push({
    slug: 'tools/other-editors', group: groupTitle.editors, title: 'Other editors', nav: 'Other editors', desc: `The language server and debugger setups: ${[...d.porting.slice(wiring, end).matchAll(/^### ([^(\n`]+)/gm)].map((m) => m[1].trim()).filter((x) => !/^(Anything|Settings)/.test(x)).join(', ')}.`,
    md: d.porting.slice(wiring, end > 0 ? end : undefined).replace(/^## Wiring[^\n]*\n/, '## Set up your editor\n').replace(/^###? /gm, (h) => (h === '### ' ? '### ' : '## ')),
    mdHref: (u) => (/^https?:/.test(u) ? u : u.startsWith('#') ? `${d.repoUrl}/blob/main/PORTING.md${u}` : `${d.repoUrl}/blob/main/${u}`),
    intro: `${intro(tool['other-editors'], c, d)}
<h2 id="how-it-works">How it works</h2>
<figure class="dg" aria-labelledby="dg-lsp-cap"><ol class="dg-flow pair"><li><span><strong>Your editor</strong><small>shows problems, docs and suggestions</small></span></li><li><span><strong>ncdev lsp</strong><small>checks the handler</small></span></li></ol>
<figcaption id="dg-lsp-cap">Your editor starts <code class="use">ncdev lsp</code> and talks to it while you type. The server works out what's wrong with the handler, and your editor displays it.</figcaption></figure>
<p class="small">The setups below come from <a href="${d.repoUrl}/blob/main/PORTING.md">PORTING.md</a>, which also explains how to port the tools to an editor we don't cover yet. You can see <a href="__UP__docs/tools/editors/#language-server-editors">how far each one is tested</a>.</p>`,
  });
  pages.push({
    slug: 'tools/ncdev', group: groupTitle['cli-ai'], title: 'ncdev (command line)', nav: 'ncdev (command line)', desc: 'What ncdev is for, with every command and option.',
    html: `${intro(tool.ncdev, c, d)}
<h2 id="how-it-works">How it works</h2>
<ul class="dlist">
<li><code class="use">ncdev lint handlers/</code> checks every handler in a folder. If any of them has errors it exits with an error code, which is what a script or a CI job needs.</li>
<li><code class="use">ncdev simulate handler.js --players 3</code> is Try it in a terminal. It prints each player's window, launch arguments and file changes.</li>
<li>Add <code class="use">--help</code> after a command to see only that command's part of the help.</li>
</ul>
<h2 id="commands">Commands</h2>
${table(['Command', 'What it does'], cmds.commands.map((x) => [x.use.map(use).join('<br>'), md(x.desc)]))}
<h2 id="options">Options for every command</h2>
${table(['Option', 'What it does'], cmds.options.map((x) => [x.use.map(use).join('<br>'), md(x.desc)]))}
<h2 id="lint-options">Options of <code class="use">ncdev lint</code></h2>
${table(['Option', 'What it does'], cmds.lint.map((x) => [x.use.map(use).join('<br>'), md(x.desc)]))}
<p class="small">This reference is generated from <code class="use">ncdev --help</code>.</p>`,
  });
  pages.push({
    slug: 'tools/mcp', group: groupTitle['cli-ai'], title: 'MCP server (AI agents)', nav: 'MCP server (AI agents)', desc: 'What the MCP server gives AI agents, tool by tool.',
    html: `${intro(tool.mcp, c, d)}
<h2 id="how-it-works">How it works</h2>
<figure class="dg" aria-labelledby="dg-mcp-cap"><ol class="dg-flow pair"><li><span><strong>Your AI agent</strong><small>writes the handler</small></span></li><li><span><strong>ncdev mcp</strong><small>looks things up, checks, runs Try it</small></span></li></ol>
<figcaption id="dg-mcp-cap">The agent starts <code class="use">ncdev mcp</code> and calls the tools below as it works. A well-behaved agent looks a name up before using it and runs Check before it shows you the handler.</figcaption></figure>
<h2 id="tools">The tools</h2>
${d.mcpTools.map((t) => {
      const props = Object.entries(t.inputSchema?.properties ?? {});
      const req = new Set(t.inputSchema?.required ?? []);
      return `<h3 id="${esc(t.name)}"><code>${esc(t.name)}</code>${t.title ? `: ${esc(t.title)}` : ''}</h3>\n<p>${md(t.description)}</p>${props.length ? `\n${table(['Parameter', 'Type', 'What it is'], props.map(([k, v]) => [`<code>${esc(k)}</code>${req.has(k) ? '' : ' <span class="small">(optional)</span>'}`, esc(v.type ?? (v.enum ? v.enum.join(' | ') : '')), md(v.description ?? '')]))}` : ''}`;
    }).join('\n')}
<p class="small">This list comes straight from what <code class="use">ncdev mcp</code> serves.</p>`,
  });

  // docs/tools/: what the tools are, the two diagrams, and the pages by group.
  const index = `<p class="lead">These are the tools for writing Nucleus Co-op handlers. There's an editor that runs in your browser, add-ons for the editor you already have, a command-line program, and a server that AI agents can use. Each page explains what the tool is for and how it works, then lists its commands and settings.</p>
${coreDiagram(d)}
${d.tools.groups.map((g) => `<h2 id="${g.id}">${esc(g.title)}</h2>
<p>${esc(g.line)}</p>
<ul class="tool-cards">${pages.filter((p) => p.group === g.title && (g.id !== 'workbench' || p.slug === overview.slug)).map((p) => `<li><a href="__UP__docs/${p.slug}/"><strong>${esc(p.nav === 'Overview' ? p.title : p.nav)}</strong><small>${esc(p.desc)}</small></a></li>`).join('')}${g.id === 'cli-ai' ? '<li><a href="__UP__ai/"><strong>Set up your AI</strong><small>Prompts to paste into Claude Code, other AI agents and chatbots.</small></a></li>' : ''}</ul>`).join('\n')}
<h2 id="path">A handler's path</h2>
${flowDiagram(d, 'All of the tools can write, check and try a handler. They differ in saving, testing and sharing, and the comparison shows how.')}
<p class="small"><a href="__UP__docs/tools/editors/#compare">Compare the editors</a> · To install anything, go to <a href="__UP__tools/">Get the tools</a>.</p>`;
  return { pages, index, media: [...d.used], css: TOOL_DOCS_CSS };
}

/** The styles of these pages, on top of the docs pages' own (the start page's): the introduction, screenshots in the
 *  page's theme, the labelled screenshot's numbers, the two diagrams, cards and the guide's Before/Next. */
export const TOOL_DOCS_CSS = `
.lead { font-size: 18px; margin: 0 0 14px; }
.tool-intro { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-pane); padding: 16px 18px 6px; margin: 0 0 20px; box-shadow: var(--sh-1); }
.tool-intro h2 { font-size: 16px; margin: 4px 0 6px; }
main h2 { scroll-margin-top: 12px; }
.shot { margin: 0 0 16px; }
.shot video { display: block; width: 100%; height: auto; background: #000; }
.shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 14px; margin: 0 0 8px; }
.shots { align-items: start; }
.shots .shot { margin: 0; }
.shots .shot.tall { max-width: 300px; }
/* A screenshot per theme: the light one, or the dark one when the page is dark. */
.th-dark { display: none !important; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .th-dark { display: block !important; } :root:not([data-theme="light"]) .th-light { display: none !important; } }
:root[data-theme="dark"] .th-dark { display: block !important; }
:root[data-theme="dark"] .th-light { display: none !important; }
/* The labelled screenshot: a number on each part, and the same number before its line in the list below. */
/* On a narrow screen the picture keeps a readable size and scrolls sideways. */
.map-scroll { overflow-x: auto; }
.map-frame { position: relative; min-width: 600px; }
.map-pin, .pin, .map-legend > li::before { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent); color: var(--accent-fg); font: 700 14px/1 var(--font); text-decoration: none; }
.map-pin { position: absolute; transform: translate(-50%, -50%); border: 2px solid var(--surface); box-shadow: 0 1px 4px rgba(0, 0, 0, .45); box-sizing: content-box; }
.map-pin:hover, .map-pin:focus-visible { transform: translate(-50%, -50%) scale(1.15); }
.map-legend { list-style: none; padding: 0; margin: 0 0 12px; counter-reset: part; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 8px 18px; }
.map-legend > li { counter-increment: part; position: relative; padding: 4px 6px 4px 40px; border-radius: var(--r-ctl); scroll-margin-top: 12px; }
.map-legend > li::before { content: counter(part); position: absolute; left: 6px; top: 4px; }
.map-legend > li:target { background: var(--surface); outline: 2px solid var(--accent); }
.where a { display: inline-flex; align-items: center; gap: 6px; margin: 0 10px 0 4px; }
.where .pin { width: 22px; height: 22px; font-size: 12px; }
/* Diagrams: boxes and lines in HTML, so they wrap and stay text. */
.dg { margin: 0 0 20px; }
.dg-core, .dg-flow { padding: 16px 14px 6px; margin: 0; }
.dg-row { list-style: none; display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 0; padding: 0; }
.dg-row a, .dg-flow li > a, .dg-flow li > span, .tool-cards a, .guide-nav a { display: block; height: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-ctl); padding: 10px 12px; text-decoration: none; color: var(--fg); }
.dg-row a { text-align: center; }
.dg-row a:hover, .dg-flow li > a:hover, .tool-cards a:hover, .guide-nav a:hover { border-color: var(--accent); }
.dg strong, .tool-cards strong { display: block; }
.dg small, .tool-cards small, .guide-nav small { display: block; color: var(--muted); font-size: 13px; }
.dg-row.top li::after, .dg-row.bottom li::before { content: ""; display: block; width: 2px; height: 16px; margin: 0 auto; background: var(--line); }
.dg-engine { margin: 0; padding: 12px; border-radius: var(--r-ctl); background: var(--accent); color: var(--accent-fg); text-align: center; }
.dg-engine strong { font-size: 18px; }
.dg-engine span { display: block; font-size: 14px; }
.dg-flow { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(112px, 1fr)); gap: 10px 24px; counter-reset: step; }
.dg-flow li { position: relative; counter-increment: step; }
.dg-flow strong::before { content: counter(step) ". "; color: var(--muted); font-weight: 400; }
.dg-flow li:not(:last-child)::after { content: ""; position: absolute; right: -16px; top: 50%; width: 8px; height: 8px; border-top: 2px solid var(--muted); border-right: 2px solid var(--muted); transform: translateY(-50%) rotate(45deg); }
.dg-flow.pair { gap: 10px 44px; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 560px; }
.dg-flow.pair strong::before { content: none; }
.dg-flow.pair li:first-child::after { right: -26px; top: 36%; }
.dg-flow.pair li:last-child::before { content: ""; position: absolute; left: -26px; top: 64%; width: 8px; height: 8px; border-bottom: 2px solid var(--muted); border-left: 2px solid var(--muted); transform: translateY(-50%) rotate(45deg); }
.tool-cards { list-style: none; padding: 0; margin: 0 0 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 230px), 1fr)); gap: 10px; }
.tool-cards a { background: var(--surface); box-shadow: var(--sh-1); }
.tool-cards.two { grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); }
.chips { list-style: none; padding: 0; margin: 0 0 16px; display: flex; flex-wrap: wrap; gap: 6px; }
.chips li { border: 1px solid var(--line); border-radius: 999px; padding: 2px 11px; font-size: 14px; background: var(--surface); }
.steps { padding-left: 24px; } .steps li { margin: 0 0 6px; }
.guide-nav { display: flex; justify-content: space-between; gap: 10px; margin: 32px 0 10px; }
.guide-nav a { flex: 0 1 48%; background: var(--surface); font-weight: 700; }
.guide-nav a[rel="next"] { text-align: right; }
.compare { display: table; }
@media (max-width: 560px) {
  .dg-row { gap: 6px; } .dg-row a { padding: 8px 4px; font-size: 14px; overflow-wrap: anywhere; } .dg small { font-size: 12px; }
}
@media (prefers-reduced-motion: no-preference) { .map-pin { transition: transform .12s; } }
`;

/** A WebP file's size in pixels (its header). */
function webpSize(file) {
  const b = fs.readFileSync(file);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

/** The guide's sources, for build.mjs: the data files, the start page's gallery (each screenshot's caption) and
 *  videos (their size), the workbench's Settings sections, every gallery picture's size, and the labelled screenshot's
 *  positions (written by tools/screenshots.cjs --only map; without it the page has the list alone). `here`: playground/. */
export function readGuideSources(here) {
  const root = path.join(here, '..', '..');
  const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const start = fs.readFileSync(path.join(here, 'src', 'start.html'), 'utf8');
  const list = start.match(/var TOOLS = \[([\s\S]*?)\n  \];/);
  const looks = start.match(/var LOOKS = (\[.*\]);/);
  if (!list || !looks) throw new Error('tool docs: the gallery\'s TOOLS or LOOKS list in start.html has moved; update tool-docs.mjs to match.');
  const gallery = {};
  for (const t of list[1].matchAll(/\{ id: '([a-z]+)', label: '([^']+)', views: \[([\s\S]*?)\]\] \}/g))
    for (const v of t[3].matchAll(/\['([a-z0-9-]+)', '((?:\\'|[^'])*)', '((?:\\'|[^'])*)'/g)) {
      const entry = { tool: t[2], label: v[2].replace(/\\'/g, "'"), caption: v[3].replace(/\\'/g, "'") };
      if (v[1] === 'look') for (const [l, name] of JSON.parse(looks[1].replace(/'/g, '"'))) gallery[`${t[1]}-look-${l}`] = { ...entry, caption: `The ${name} look. ${entry.caption}` };
      else gallery[`${t[1]}-${v[1]}`] = entry;
    }
  const videos = Object.fromEntries([...start.matchAll(/<video[^>]*poster="videos\/([a-z]+)-poster\.jpg" width="(\d+)" height="(\d+)"/g)].map((m) => [m[1], { w: +m[2], h: +m[3] }]));
  const settingsTabs = [...fs.readFileSync(path.join(here, 'src', 'page.html'), 'utf8').matchAll(/role="tab" id="st-[a-z0-9]+"([^>]*)>([^<]+)</g)].filter((m) => !/data-beta/.test(m[1])).map((m) => m[2].trim());
  const galleryDirs = [path.join(here, '..', 'docs', 'images', 'gallery'), path.join(root, 'docs', 'images', 'gallery'), path.join(here, '..', 'docs', 'images', 'guide')];
  const sizes = {};
  for (const dir of galleryDirs) for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = /^(.*)-light\.webp$/.exec(f); if (m) sizes[m[1]] = webpSize(path.join(dir, f)); }
  const mapFile = path.join(here, '..', 'docs', 'images', 'guide', 'workbench-map.json');
  return {
    tools: json(path.join(root, 'data', 'tools.json')), editors: json(path.join(root, 'data', 'editors.json')),
    guide: json(path.join(here, 'src', 'guide.json')), tourParts: json(path.join(here, 'src', 'tourparts.json')),
    gallery, videos, settingsTabs, sizes, galleryDirs, map: fs.existsSync(mapFile) ? json(mapFile) : null,
  };
}

/** Read the sources from the repository (the core's root) and the workbench (its keyactions), for build.mjs. */
export function readToolSources(coreRepo) {
  const read = (p) => fs.readFileSync(path.join(coreRepo, p), 'utf8');
  return { pkg: JSON.parse(read('package.json')), nppCpp: read('npp-plugin/src/NcDev.cpp'), porting: read('PORTING.md') };
}
