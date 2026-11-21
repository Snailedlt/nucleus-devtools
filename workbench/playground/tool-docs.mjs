// The docs' Tools section (docs/tools/…): for each tool what it is and when to use it, how it works, and its
// reference. The pages are put together here from two kinds of source, and nothing is written in this file:
// - the words a person wrote: data/tools.json (every tool's page, the index, the editors' comparison page) and
//   src/guide.json (the workbench guide), with src/tourparts.json (the labelled screenshot's legend: the tour's own
//   steps) and src/tips.ts (each guide page's tips);
// - the reference, generated from what the tools themselves use: `ncdev --help` (src/clihelp.ts), the MCP server's
//   tool list (src/mcp.ts), the extension's commands, settings and keys (package.json), the Notepad++ plugin's menu
//   (npp-plugin/src/NcDev.cpp), the workbench's shortcuts (src/keyactions.ts), the editor setups (PORTING.md) and
//   the editors' comparison (data/tools-compare.json, data/editors.json).
// tool-docs-read.mjs reads those sources, tool-docs-text.mjs turns text into HTML, tool-docs-parts.mjs has the
// building blocks (introduction, screenshots, diagrams, key tables), and tool-docs.css is the pages' styles.
import fs from 'node:fs';
import { esc, toolText, keys, use, table, andList, rich } from './tool-docs-text.mjs';
import { intro, shots, sections, coreDiagram, flowDiagram, keyTable, more } from './tool-docs-parts.mjs';
import { parseHelp, parseNppMenu } from './tool-docs-read.mjs';

export { parseHelp, parseNppMenu, readToolSources, readGuideSources } from './tool-docs-read.mjs';

const CSS = fs.readFileSync(new URL('./tool-docs.css', import.meta.url), 'utf8');
const small = (c, text) => `<p class="small">${rich(text, c)}</p>`;
const cards = (items, cls = '') => `<ul class="tool-cards${cls}">${items.map((x) => `<li><a href="${x.href}"><strong>${x.title}</strong><small>${x.line}</small></a></li>`).join('')}</ul>`;

/**
 * Everything a page needs to look things up: the data (`d`), the lookups, and what links and keys in written text
 * resolve to. `used` collects the screenshots the pages show, for the build to copy.
 * @param {{ help: string, mcpTools: { name: string, title?: string, description: string, inputSchema?: any }[],
 *   pkg: any, nppCpp: string, actions: { id: string, label: string, group: string, keys: string, mac?: string, where: string }[],
 *   porting: string, repoUrl: string, tools: any, guide: any, tourParts: { parts: any[] }, tips: { id: string, text: string }[],
 *   gallery: Record<string, { tool: string, label: string, caption: string }>, videos: Record<string, { w: number, h: number }>,
 *   sizes?: Record<string, [number, number]>, map?: { width: number, height: number, parts: Record<string, { x: number, y: number }> } | null,
 *   compareHtml: string, editors: { editors: any[] }, settingsTabs: string[] }} d
 */
function context(d) {
  const by = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const action = by(d.actions);
  const guidePage = by(d.guide.pages);
  const c = {
    d, action, guidePage, used: new Set(), repo: d.repoUrl,
    tool: by(d.tools.tools),
    tip: by(d.tips),
    group: (id) => d.tools.groups.find((g) => g.id === id).title,
    /** A tour part's number on the labelled screenshot. */
    partNo: Object.fromEntries(d.tourParts.parts.map((p, i) => [p.id, i + 1])),
    keyOf: (id) => { if (!action[id]) throw new Error(`tool docs: {key:${id}} is not an action in keyactions.ts.`); return action[id].keys; },
    guideHref: (id) => { if (!guidePage[id]) throw new Error(`tool docs: @guide:${id} is not a page in guide.json.`); return `__UP__docs/${guidePage[id].slug}/`; },
  };
  return c;
}

// ---------------------------------------------------------------------------
// The workbench guide (src/guide.json): the overview first, then a page per area.

/** The labelled screenshot: the tour's own parts, a number on each; the same numbers before their lines below. */
function mapSection(c, page) {
  const { map, tourParts } = c.d;
  const text = page.map;
  const pin = (p) => `<a class="map-pin" href="#part-${p.id}" style="left:${map.parts[p.id].x}%;top:${map.parts[p.id].y}%" aria-label="${c.partNo[p.id]}: ${esc(p.title)}">${c.partNo[p.id]}</a>`;
  const picture = (theme) => `<img class="th-${theme}" src="__UP__start/gallery/workbench-map-${theme}.webp" alt="${theme === 'light' ? esc(text.alt) : ''}"${theme === 'dark' ? ' aria-hidden="true"' : ''} width="${map.width}" height="${map.height}">`;
  if (map) c.used.add('workbench-map');
  const figure = map ? `<figure class="shot wb-map"><div class="map-scroll"><div class="map-frame">${picture('light')}${picture('dark')}${tourParts.parts.filter((p) => map.parts[p.id]).map(pin).join('')}</div></div>
<figcaption>${esc(text.caption)}</figcaption></figure>\n` : '';
  const line = (p) => `<li id="part-${p.id}"><strong>${esc(p.title)}.</strong> ${rich(p.text, c)}${p.page && p.page !== page.id ? ` <a href="${c.guideHref(p.page)}">More: ${esc(c.guidePage[p.page].nav)}</a>` : ''}</li>`;
  return `<h2 id="where-things-are">${esc(text.h)}</h2>
${figure}<ol class="map-legend">${tourParts.parts.map(line).join('')}</ol>
${small(c, text.note)}`;
}

/** On a guide page: where its part is on the labelled screenshot. */
function whereLine(c, page) {
  const parts = c.d.tourParts.parts.filter((p) => p.page === page.id);
  if (!parts.length) return '';
  return `<p class="where small">Where it is: ${parts.map((p) => `<a href="${c.guideHref('overview')}#part-${p.id}" title="Where things are"><span class="pin" aria-hidden="true">${c.partNo[p.id]}</span>${esc(p.title)}</a>`).join(' ')}</p>`;
}

const flowSection = (c, flow) => `<h2 id="from-idea-to-nucleus">${esc(flow.h)}</h2>
${flowDiagram(c, flow.caption, (step) => (flow.links[step] ? c.guideHref(flow.links[step]) : null))}`;

const guideList = (c) => `<h2 id="the-guide">What's in this guide</h2>
${cards(c.d.guide.pages.slice(1).map((p) => ({ href: c.guideHref(p.id), title: esc(p.nav), line: esc(p.desc) })))}`;

const settingsSections = (c) => `<h2 id="sections">Sections in Settings</h2>\n<ul class="chips">${c.d.settingsTabs.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;

/** Every shortcut, by group. */
const allKeys = (c) => [...new Set(c.d.actions.map((a) => a.group))].map((g) => `<h2>${esc(g)}</h2>\n${keyTable(c.d.actions.filter((a) => a.group === g))}`).join('\n');

/** The page's own shortcuts. */
function pageKeys(c, page) {
  const list = page.keys.map((id) => { if (!c.action[id]) throw new Error(`tool docs: guide page "${page.id}" lists the key "${id}", which is not an action in keyactions.ts.`); return c.action[id]; });
  return `<h2 id="keys">Keys</h2>\n${keyTable(list)}\n<p class="small">These are the default keys. <a href="${c.guideHref('shortcuts')}">See all shortcuts</a>.</p>`;
}

/** The workbench's own tips that belong to the page. */
function pageTips(c, page) {
  const text = (id) => { if (!c.tip[id]) throw new Error(`tool docs: guide page "${page.id}" lists the tip "${id}", which is not in tips.ts.`); return c.tip[id].text; };
  return `<h2 id="tips">Tips from the workbench</h2>\n<ul class="dlist tips">${page.tips.map((id) => `<li>${rich(text(id), c)}</li>`).join('')}</ul>`;
}

function guideNav(c, i) {
  const link = (p, rel, word) => (p ? `<a rel="${rel}" href="${c.guideHref(p.id)}"><small>${word}</small>${esc(p.nav)}</a>` : '<span></span>');
  const pages = c.d.guide.pages;
  return `<nav class="guide-nav" aria-label="The workbench guide">${link(pages[i - 1], 'prev', 'Previous')}${link(pages[i + 1], 'next', 'Next')}</nav>
<p class="small"><a href="__UP__">Open the workbench</a> · <a href="__UP__#tour">Take the tour in it</a></p>`;
}

function guidePage(c, page, i) {
  const overview = i === 0;
  const body = [
    overview ? intro(c, c.tool.workbench) : `<p class="lead">${rich(page.intro, c)}</p>`,
    overview ? mapSection(c, page) : whereLine(c, page),
    shots(c, page.shots),
    page.allKeys && allKeys(c),
    ...sections(c, page.sections),
    overview && flowSection(c, page.flow),
    overview && guideList(c),
    page.settingsTabs && settingsSections(c),
    page.keys?.length && pageKeys(c, page),
    page.tips?.length && pageTips(c, page),
    guideNav(c, i),
  ];
  return { slug: page.slug, group: c.group('workbench'), title: page.title, nav: page.nav, desc: page.desc, html: body.filter(Boolean).join('\n') };
}

// ---------------------------------------------------------------------------
// The editors: the page that compares them (data/tools.json editorsPage, data/tools-compare.json, data/editors.json).

function editorsPage(c) {
  const text = c.d.tools.editorsPage;
  const lsp = c.d.editors.editors;
  const names = lsp.map((e) => esc(e.tile.name));
  const fill = (s) => esc(s).replace('{first}', names.slice(0, 3).join(', ')).replace('{all}', andList(names));
  return {
    slug: text.slug, group: c.group('editors'), title: text.title, nav: text.title, desc: text.desc,
    html: `<p class="lead">${rich(text.lead, c)}</p>
<h2 id="which">Which one to pick</h2>
${cards(text.pick.map((p) => ({ href: `__UP__docs/${p.to}/`, title: fill(p.title), line: fill(p.line) })), ' two')}
<h2 id="compare">Side by side</h2>
<div class="compare-wrap" tabindex="0" role="region" aria-label="Features by editor (scrolls sideways)">
<table class="compare">
${c.d.compareHtml}
</table>
</div>
<h2 id="language-server-editors">Editors that use the language server</h2>
<p>${rich(text.lspIntro, c)}</p>
${table(['Editor', 'Setup', 'Tried by people', 'Tried by an AI'], lsp.map((e) => [esc(e.name), esc(e.tile.line), esc(e.people ?? ''), esc(e.ai ?? '')]))}
${small(c, text.lspAfter)}
${more('editors')}`,
  };
}

// ---------------------------------------------------------------------------
// A tool's page: its introduction and written sections (data/tools.json), then its reference, generated here.

/** VS Code: the extension's commands, keys and settings, from its manifest. */
function vscodeReference(c) {
  const contributes = c.d.pkg.contributes;
  const commands = contributes.commands ?? [];
  const title = Object.fromEntries(commands.map((x) => [x.command, `${x.category ? `${x.category}: ` : ''}${x.title}`]));
  const settings = [].concat(contributes.configuration ?? []).flatMap((x) => Object.entries(x.properties ?? {}));
  const cap = (k) => k.replace(/\b\w/g, (x) => x.toUpperCase());
  const keyCell = (k) => keys(cap(k.key)) + (k.mac && k.mac !== k.key ? ` <span class="small">(Mac: ${keys(cap(k.mac).replace(/\bCmd\b/g, '⌘'))})</span>` : '');
  const value = (v) => (v.default === undefined || typeof v.default === 'object' ? '' : `<code>${esc(JSON.stringify(v.default))}</code>`);
  return { html: `<h2 id="commands">Commands</h2>
${table(['Command'], commands.map((x) => [esc(title[x.command])]))}
<h2 id="keys">Keys</h2>
${table(['Command', 'Keys'], (contributes.keybindings ?? []).map((k) => [esc(title[k.command] ?? k.command), keyCell(k)]))}
<h2 id="settings">Settings</h2>
${table(['Setting', 'Default', 'What it does'], settings.map(([k, v]) => [`<code>${esc(k)}</code>`, value(v), toolText(v.markdownDescription ?? v.description ?? '')]))}` };
}

/** Notepad++: the plugin's menu, in its order, a new list where the menu has a separator. */
function notepadppReference(c) {
  const item = (m) => (m.label ? `<li>${esc(m.label)}${m.keys ? ` (${keys(m.keys)})` : ''}</li>` : '</ul><ul class="dlist">');
  return { html: `<h2 id="menu">The Nucleus menu</h2>
<ul class="dlist">${parseNppMenu(c.d.nppCpp).map(item).join('')}</ul>` };
}

/** Other editors: PORTING.md's setups, as they are (Notepad++ has its own page). */
function otherEditorsReference(c) {
  const { porting, repoUrl } = c.d;
  const from = porting.indexOf('## Wiring');
  const end = porting.indexOf('\n## ', porting.indexOf('## Debugging'));
  const setups = porting.slice(from, end > 0 ? end : undefined).replace(/\n### Notepad\+\+\n[\s\S]*?(?=\n###? )/, '\n');
  const names = [...setups.matchAll(/^### ([^(\n`]+)/gm)].map((m) => m[1].trim()).filter((x) => !/^(Anything|Settings)/.test(x));
  return {
    desc: `The language server and debugger setups: ${names.join(', ')}.`,
    md: setups.replace(/^## Wiring[^\n]*\n/, '## Set up your editor\n').replace(/^###? /gm, (h) => (h === '### ' ? '### ' : '## ')),
    mdHref: (u) => (/^https?:/.test(u) ? u : u.startsWith('#') ? `${repoUrl}/blob/main/PORTING.md${u}` : `${repoUrl}/blob/main/${u}`),
  };
}

/** ncdev: every command and option, from `ncdev --help`. */
function ncdevReference(c) {
  const help = parseHelp(c.d.help);
  const rows = (list) => list.map((x) => [x.use.map(use).join('<br>'), toolText(x.desc)]);
  return { html: `<h2 id="commands">Commands</h2>
${table(['Command', 'What it does'], rows(help.commands))}${help.exit ? `\n<p class="small">Exit code: ${toolText(help.exit)}</p>` : ''}
<h2 id="options">Options for every command</h2>
${table(['Option', 'What it does'], rows(help.options))}
<h2 id="lint-options">Options of <code class="use">ncdev lint</code></h2>
${table(['Option', 'What it does'], rows(help.lint))}` };
}

/** The MCP server: each tool it serves, with its parameters. */
function mcpReference(c) {
  const params = (t) => {
    const props = Object.entries(t.inputSchema?.properties ?? {});
    const required = new Set(t.inputSchema?.required ?? []);
    if (!props.length) return '';
    return `\n${table(['Parameter', 'Type', 'What it is'], props.map(([k, v]) => [`<code>${esc(k)}</code>${required.has(k) ? '' : ' <span class="small">(optional)</span>'}`, esc(v.type ?? (v.enum ? v.enum.join(' | ') : '')), toolText(v.description ?? '')]))}`;
  };
  const note = c.tool.mcp.refIntro;
  return { html: `<h2 id="tools">The tools</h2>${note ? `\n${small(c, note)}` : ''}
${c.d.mcpTools.map((t) => `<h3 id="${esc(t.name)}"><code>${esc(t.name)}</code>${t.title ? `: ${esc(t.title)}` : ''}</h3>\n<p>${toolText(t.description)}</p>${params(t)}`).join('\n')}` };
}

const REFERENCE = { vscode: vscodeReference, notepadpp: notepadppReference, 'other-editors': otherEditorsReference, ncdev: ncdevReference, mcp: mcpReference };

function toolPage(c, id) {
  const t = c.tool[id];
  const ref = REFERENCE[id](c);
  const top = [intro(c, t), shots(c, t.shots), ...sections(c, t.sections)].filter(Boolean).join('\n');
  const end = [t.refNote && small(c, t.refNote), more(id)].filter(Boolean).join('\n');
  const page = { slug: t.slug, group: c.group(t.group), title: t.title, nav: t.title, desc: t.desc ?? ref.desc };
  // A reference that is Markdown (PORTING.md's setups) is rendered by the docs writer, between `intro` and `outro`.
  return ref.md ? { ...page, intro: top, md: ref.md, mdHref: ref.mdHref, outro: end } : { ...page, html: [top, ref.html, end].join('\n') };
}

// ---------------------------------------------------------------------------
// docs/tools/: who starts where, how the tools fit together, and the pages by group.

function indexPage(c, pages) {
  const { index, start, groups } = c.d.tools;
  const overview = c.d.guide.pages[0];
  const group = (g) => {
    const own = pages.filter((p) => p.group === g.title && (g.id !== 'workbench' || p.slug === overview.slug));
    const list = own.map((p) => ({ href: `__UP__docs/${p.slug}/`, title: esc(p.slug === overview.slug ? p.title : p.nav), line: esc(p.desc) }));
    if (g.id === 'cli-ai') list.push({ href: '__UP__ai/', title: 'Set up your AI', line: 'Prompts to paste into Claude Code, other AI agents and chatbots.' });
    return `<h2 id="${g.id}">${esc(g.title)}</h2>\n<p>${esc(g.line)}</p>\n${cards(list)}`;
  };
  return `<p class="lead">${rich(index.lead, c)}</p>
<h2 id="start">Where to start</h2>
<ul class="dlist start">${start.map((x) => `<li><strong>${esc(x.who)}.</strong> ${rich(x.md, c)}</li>`).join('')}</ul>
<h2 id="how-they-fit">How they fit together</h2>
${coreDiagram(c)}
${groups.map(group).join('\n')}
<h2 id="path">A handler's path</h2>
${flowDiagram(c, index.path)}
<p class="small"><a href="__UP__docs/tools/editors/#compare">Compare the editors</a> · To install anything, go to <a href="__UP__tools/">Get the tools</a>.</p>`;
}

/**
 * The Tools pages.
 * @returns {{ pages: { slug: string, group: string, title: string, nav: string, desc: string, html?: string, intro?: string, md?: string, mdHref?: (u: string) => string, outro?: string }[],
 *   index: string, media: string[], css: string }} `media`: the screenshots the pages show, for the build to copy.
 */
export function toolDocs(d) {
  const c = context(d);
  const pages = [
    ...d.guide.pages.map((page, i) => guidePage(c, page, i)),
    editorsPage(c),
    ...['vscode', 'notepadpp', 'other-editors', 'ncdev', 'mcp'].map((id) => toolPage(c, id)),
  ];
  return { pages, index: indexPage(c, pages), media: [...c.used], css: CSS };
}
