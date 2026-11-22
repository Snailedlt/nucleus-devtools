// The docs' Tools section (docs/tools/…). In the docs list every tool is a group under Tools, and its pages are the
// same kinds in the same order (AGENTS.md, "How the Tools docs are organised"):
// - overview: what the tool, or a part of the workbench, is and does. Each fact on one page.
// - setup: the getting-started guide of a tool that has to be installed: what you need, the steps, the check.
// - a reference page per kind the tool has (features, commands, tools, shortcuts, settings, options, handler files),
//   generated from the tool itself by one function per kind and source (REFERENCE below).
// The pages are put together here from two kinds of source, and nothing is written in this file:
// - the words a person wrote: data/tools.json (every tool's reference and setup page, the index, the feature
//   comparison) and src/guide.json (the workbench's pages), with src/tourparts.json (the labelled screenshot's
//   legend: the tour's own steps);
// - the reference, generated from what the tools themselves use: `ncdev --help` (src/clihelp.ts), the MCP server's
//   tool list (src/mcp.ts), the extension's commands, settings and keys (package.json), the Notepad++ plugin's menu
//   (npp-plugin/src/NcDev.cpp), the workbench's shortcuts (src/keyactions.ts) and Settings sections (page.html), the
//   language server's settings and the editor setups (PORTING.md) and the comparison (data/tools-compare.json,
//   data/editors.json).
// tool-docs-read.mjs reads those sources, tool-docs-text.mjs turns text into HTML, tool-docs-parts.mjs has the
// building blocks (lead, facts, screenshots, diagrams, tables, the Related list), and tool-docs.css is the styles.
import fs from 'node:fs';
import { esc, toolText, keys, use, table, rich, slug } from './tool-docs-text.mjs';
import { lead, facts, video, shots, sections, related, coreDiagram, flowDiagram, keyTable } from './tool-docs-parts.mjs';
import { parseHelp, parseNppMenu } from './tool-docs-read.mjs';

export { parseHelp, parseNppMenu, readToolSources, readGuideSources } from './tool-docs-read.mjs';
export { RELATED_MAX } from './tool-docs-parts.mjs';

const CSS = fs.readFileSync(new URL('./tool-docs.css', import.meta.url), 'utf8');
const small = (c, text) => `<p class="small">${rich(text, c)}</p>`;
const join = (parts) => parts.filter(Boolean).join('\n');

/**
 * Everything a page needs to look things up: the data (`d`), the lookups, and what links, keys and {names} in
 * written text resolve to. `used` collects the screenshots the pages show, for the build to copy.
 * @param {{ help: string, mcpTools: { name: string, title?: string, description: string, inputSchema?: any }[],
 *   pkg: any, nppCpp: string, actions: { id: string, label: string, group: string, keys: string, mac?: string, where: string }[],
 *   porting: string, repoUrl: string, tools: any, guide: any, tourParts: { parts: any[] },
 *   gallery: Record<string, { tool: string, label: string, caption: string }>, videos: Record<string, { w: number, h: number }>,
 *   sizes?: Record<string, [number, number]>, map?: { width: number, height: number, parts: Record<string, { x: number, y: number }> } | null,
 *   compareHtml: string, editors: { editors: any[] }, settingsTabs: string[] }} d
 */
function context(d) {
  const by = (list) => Object.fromEntries(list.map((x) => [x.id, x]));
  const action = by(d.actions);
  const guidePage = by(d.guide.pages);
  const tools = d.tools.tools;
  // Every address under docs/tools/, so a link in the text to one that doesn't exist stops the build.
  const slugs = new Set(['tools', d.tools.compare.slug, ...d.guide.pages.map((p) => p.slug), ...tools.flatMap((t) => [t.slug, t.setup?.slug, ...Object.keys(t.pages ?? {}).map((k) => `${t.slug}/${k}`)])].filter(Boolean));
  return {
    d, action, guidePage, used: new Set(), repo: d.repoUrl,
    vscodeVersion: String(d.pkg.engines?.vscode ?? '').replace(/^[^\d]*/, '').replace(/\.0$/, ''),
    tool: by(tools),
    /** A kind of page (data/tools.json `kinds`): its name in the docs list, and its place in the order. */
    kind: by(d.tools.kinds),
    /** A tour part's number on the labelled screenshot. */
    partNo: Object.fromEntries(d.tourParts.parts.map((p, i) => [p.id, i + 1])),
    keyOf: (id) => { if (!action[id]) throw new Error(`tool docs: {key:${id}} is not an action in keyactions.ts.`); return action[id].keys; },
    guideHref: (id) => { if (!guidePage[id]) throw new Error(`tool docs: @guide:${id} is not a page in guide.json.`); return `__UP__docs/${guidePage[id].slug}/`; },
    docHref: (to) => { if (/^tools(\/|$)/.test(to) && !slugs.has(to)) throw new Error(`tool docs: @docs:${to} is not a Tools page.`); return `__UP__docs/${to}/`; },
  };
}

// ---------------------------------------------------------------------------
// The workbench (src/guide.json): the overview first, then a page per area. Reference pages.

/** The labelled screenshot: the tour's own parts, a number on each; the same numbers before their lines below. */
function mapSection(c, page) {
  const { map, tourParts } = c.d;
  const text = page.map;
  const pin = (p) => `<a class="map-pin" href="#part-${p.id}" style="left:${map.parts[p.id].x}%;top:${map.parts[p.id].y}%" aria-label="${c.partNo[p.id]}: ${esc(p.title)}">${c.partNo[p.id]}</a>`;
  const picture = (theme) => `<img class="th-${theme}" src="__UP__start/gallery/workbench-map-${theme}.webp" alt="${esc(text.alt)}" width="${map.width}" height="${map.height}">`;
  if (map) c.used.add('workbench-map');
  const figure = map ? `<figure class="shot wb-map"><div class="map-scroll"><div class="map-frame">${picture('light')}${picture('dark')}${tourParts.parts.filter((p) => map.parts[p.id]).map(pin).join('')}</div></div>
<figcaption>${esc(text.caption)}</figcaption></figure>\n` : '';
  // A part's name leads to the page that describes it: the overview is the one page that links to all the others.
  const name = (p) => (p.page && p.page !== page.id ? `<a href="${c.guideHref(p.page)}">${esc(p.title)}</a>` : esc(p.title));
  const line = (p) => `<li id="part-${p.id}"><strong>${name(p)}.</strong> ${rich(p.text, c)}</li>`;
  return `<h2 id="the-screen">${esc(text.h)}</h2>
${figure}<ol class="map-legend">${tourParts.parts.map(line).join('')}</ol>
${small(c, text.note)}`;
}

/** On an area's page: where its part is on the labelled screenshot. */
function whereLine(c, page) {
  const parts = c.d.tourParts.parts.filter((p) => p.page === page.id);
  if (!parts.length) return '';
  return `<p class="where small">On the screen: ${parts.map((p) => `<a href="${c.guideHref('overview')}#part-${p.id}"><span class="pin" aria-hidden="true">${c.partNo[p.id]}</span>${esc(p.title)}</a>`).join(' ')}</p>`;
}

/** Settings, section by section: the names are the workbench's own (page.html), the lines are the page's. */
function settingsTable(c, page) {
  const lines = page.settingsTabs;
  const names = c.d.settingsTabs;
  const missing = names.filter((n) => !lines[n]);
  const gone = Object.keys(lines).filter((n) => !names.includes(n));
  if (missing.length || gone.length) throw new Error(`tool docs: the Settings page's sections differ from the workbench's (guide.json settingsTabs). No line for: ${missing.join(', ') || 'none'}. Not a section any more: ${gone.join(', ') || 'none'}.`);
  return `<h2 id="sections">Sections</h2>\n${table(['Section', 'What it has'], names.map((n) => [esc(n), rich(lines[n], c)]))}`;
}

/** Every shortcut, by group. */
const allKeys = (c) => [...new Set(c.d.actions.map((a) => a.group))].map((g) => `<h2 id="${slug(g)}">${esc(g)}</h2>\n${keyTable(c.d.actions.filter((a) => a.group === g))}`).join('\n');

function guidePage(c, page, i) {
  const overview = i === 0;
  const wb = c.tool.workbench;
  return {
    slug: page.slug, group: wb.name, title: page.title, nav: page.nav, desc: page.desc,
    html: join([
      lead(c, overview ? wb.summary : page.intro),
      overview ? facts(c, wb.facts) : whereLine(c, page),
      overview && mapSection(c, page),
      shots(c, page.shots),
      page.allKeys && allKeys(c),
      page.settingsTabs && settingsTable(c, page),
      ...sections(c, page.sections),
      related(c, page.related, page.slug),
    ]),
  };
}

// ---------------------------------------------------------------------------
// A tool's overview page: what it is (data/tools.json). Its reference is on the pages below.

function toolPage(c, id) {
  const t = c.tool[id];
  return {
    slug: t.slug, group: t.name, title: t.title, nav: c.kind.overview.nav, hit: t.title, desc: t.desc ?? t.line,
    html: join([lead(c, t.summary), facts(c, t.facts), video(c, t), shots(c, t.shots), ...sections(c, t.sections), related(c, t.related, t.slug)]),
  };
}

// ---------------------------------------------------------------------------
// A tool's reference pages: one per kind, each generated from what the tool itself uses. A function per kind and
// source; it returns the page's body as HTML, or as Markdown (PORTING.md's own sections) with how its links resolve.

/** The extension's manifest: its commands by id, with the category they show under. */
function vscodeManifest(c) {
  const contributes = c.d.pkg.contributes;
  const commands = contributes.commands ?? [];
  return { contributes, commands, title: Object.fromEntries(commands.map((x) => [x.command, `${x.category ? `${x.category}: ` : ''}${x.title}`])) };
}
/** VS Code: every command, as the Command Palette names it. */
function vscodeCommands(c) {
  const { commands, title } = vscodeManifest(c);
  return { html: table(['Command'], commands.map((x) => [esc(title[x.command])])) };
}
/** VS Code: the keys the extension binds. */
function vscodeShortcuts(c) {
  const { contributes, title } = vscodeManifest(c);
  const cap = (k) => k.replace(/\b\w/g, (x) => x.toUpperCase());
  const keyCell = (k) => keys(cap(k.key)) + (k.mac && k.mac !== k.key ? ` <span class="small">(Mac: ${keys(cap(k.mac).replace(/\bCmd\b/g, '⌘'))})</span>` : '');
  return { html: table(['Command', 'Keys'], (contributes.keybindings ?? []).map((k) => [esc(title[k.command] ?? k.command), keyCell(k)])) };
}
/** VS Code: every setting, with its default. */
function vscodeSettings(c) {
  const settings = [].concat(c.d.pkg.contributes.configuration ?? []).flatMap((x) => Object.entries(x.properties ?? {}));
  const value = (v) => (v.default === undefined || typeof v.default === 'object' ? '' : `<code>${esc(JSON.stringify(v.default))}</code>`);
  return { html: table(['Setting', 'Default', 'What it does'], settings.map(([k, v]) => [`<code>${esc(k)}</code>`, value(v), toolText(v.markdownDescription ?? v.description ?? '')])) };
}

/** Notepad++: the plugin's menu, in its order, a new list where the menu has a separator. */
function notepadppCommands(c) {
  const item = (m) => (m.label ? `<li>${esc(m.label)}${m.keys ? ` (${keys(m.keys)})` : ''}</li>` : '</ul><ul class="dlist">');
  return { html: `<ul class="dlist">${parseNppMenu(c.d.nppCpp).map(item).join('')}</ul>` };
}

/** A section of PORTING.md, from its heading (as written there) to the next heading of the same level or above. */
function portingSection(porting, heading) {
  const lines = porting.split('\n');
  const from = lines.indexOf(heading);
  if (from < 0) throw new Error(`tool docs: PORTING.md has no "${heading}" section any more; update tool-docs.mjs to match.`);
  const next = new RegExp(`^#{1,${heading.match(/^#+/)[0].length}} `);
  const out = [];
  // A "# comment" inside a code block is not a heading. A block opened by ``` or ~~~ ends at a line of the same
  // marker, at least as long, with nothing after it.
  let fence = '';
  for (const line of lines.slice(from + 1)) {
    const mark = /^(`{3,}|~{3,})/.exec(line)?.[1];
    if (mark && !fence) fence = mark;
    else if (mark && mark[0] === fence[0] && mark.length >= fence.length && !line.slice(mark.length).trim()) fence = '';
    else if (!fence && next.test(line)) break;
    out.push(line);
  }
  return out.join('\n').trim();
}
const portingHref = (repoUrl) => (u) => (/^https?:/.test(u) ? u : u.startsWith('#') ? `${repoUrl}/blob/main/PORTING.md${u}` : `${repoUrl}/blob/main/${u}`);
/** The language server's pages are PORTING.md's own sections. */
const porting = (heading) => (c) => ({ md: portingSection(c.d.porting, heading), mdHref: portingHref(c.d.repoUrl) });

/** ncdev: every command, from `ncdev --help`. */
const helpRows = (list) => list.map((x) => [x.use.map(use).join('<br>'), toolText(x.desc)]);
function ncdevCommands(c) {
  return { html: table(['Command', 'What it does'], helpRows(parseHelp(c.d.help).commands)) };
}
/** ncdev: the options every command takes, the ones of `ncdev lint`, and the exit codes. */
function ncdevOptions(c) {
  const help = parseHelp(c.d.help);
  return { html: `<h2 id="every-command">For every command</h2>
${table(['Option', 'What it does'], helpRows(help.options))}
<h2 id="lint-options">Options of <code class="use">ncdev lint</code></h2>
${table(['Option', 'What it does'], helpRows(help.lint))}${help.exit ? `\n<h2 id="exit-codes">Exit codes</h2>\n<p>${toolText(help.exit)}</p>` : ''}` };
}

/** The MCP server: each tool it serves, with its parameters. */
function mcpTools(c) {
  const params = (t) => {
    const props = Object.entries(t.inputSchema?.properties ?? {});
    const required = new Set(t.inputSchema?.required ?? []);
    if (!props.length) return '';
    return `\n${table(['Parameter', 'Type', 'What it is'], props.map(([k, v]) => [`<code>${esc(k)}</code>${required.has(k) ? '' : ' <span class="small">(optional)</span>'}`, esc(v.type ?? (v.enum ? v.enum.join(' | ') : '')), toolText(v.description ?? '')]))}`;
  };
  return { html: c.d.mcpTools.map((t) => `<h2 id="${esc(t.name)}"><code>${esc(t.name)}</code>${t.title ? `: ${esc(t.title)}` : ''}</h2>\n<p>${toolText(t.description)}</p>${params(t)}`).join('\n') };
}

/** Features: the tool's column of the comparison (data/tools-compare.json), row by row. */
function features(c, id) {
  const { columns, rows } = c.d.compare;
  const col = columns.findIndex((x) => x.id === id);
  if (col < 0) throw new Error(`tool docs: "${id}" has a features page but no column in data/tools-compare.json.`);
  const k = c.kind.features;
  const cell = (text) => { const [mark, ...rest] = text.split(':'); return [mark.trim(), rest.join(':').trim()]; };
  return { html: table(k.cols, rows.map((r) => { const [mark, note] = cell(r.cells[col]); return [esc(r.feature), mark === 'yes' ? k.yes : mark === 'no' ? k.no : '', toolText(note.replace(/^[a-z]/, (x) => x.toUpperCase()))]; })) };
}

const REFERENCE = {
  vscode: { commands: vscodeCommands, shortcuts: vscodeShortcuts, settings: vscodeSettings },
  notepadpp: { commands: notepadppCommands },
  lsp: { commands: porting("## What's VS Code only today, and how to get it elsewhere"), settings: porting('### Settings'), detection: porting('## How handler files are detected') },
  ncdev: { commands: ncdevCommands, options: ncdevOptions },
  mcp: { tools: mcpTools },
};

/** A tool's reference pages, in the kinds' order: the lead and the note are written (data/tools.json `pages`), the
 *  body is generated. Each links back to the tool's overview, and nowhere else. */
function referencePages(c, id) {
  const t = c.tool[id];
  const unknown = Object.keys(t.pages ?? {}).filter((k) => !c.kind[k]);
  if (unknown.length) throw new Error(`tool docs: ${id} has pages of a kind that isn't in "kinds": ${unknown.join(', ')}.`);
  return c.d.tools.kinds.filter((k) => t.pages?.[k.id]).map((k) => {
    const make = k.id === 'features' ? (cx) => features(cx, id) : REFERENCE[id]?.[k.id];
    if (!make) throw new Error(`tool docs: nothing generates ${id}'s "${k.id}" page; add it to REFERENCE in tool-docs.mjs.`);
    const text = t.pages[k.id];
    const slug = `${t.slug}/${k.id}`;
    const ref = make(c);
    const top = lead(c, text.lead);
    const end = join([text.note && small(c, text.note), related(c, text.related ?? [`[${t.title}](@docs:${t.slug})`], slug)]);
    const page = { slug, group: t.name, title: text.title, nav: k.nav, hit: text.title, desc: text.desc };
    // A reference that is Markdown is rendered by the docs writer, between `intro` and `outro`.
    return ref.md ? { ...page, intro: `${top}\n`, md: ref.md, mdHref: ref.mdHref, outro: end } : { ...page, html: join([top, ref.html, end]) };
  });
}

// ---------------------------------------------------------------------------
// A tool's setup page (data/tools.json `setup`): what you need, the steps, how to see that it worked.

/** The editors that use the language server, and who has tried each setup (data/editors.json). */
function testedTable(c, text) {
  const lsp = c.d.editors.editors;
  return `<h2 id="${slug(text.h)}">${esc(text.h)}</h2>
${table(['Editor', 'Setup', 'Tried by people', 'Tried by an AI'], lsp.map((e) => [esc(e.name), esc(e.tile.line), esc(e.people ?? ''), esc(e.ai ?? '')]))}
${small(c, `${text.intro} ${text.after}`)}`;
}

/** The other editors' setups, as PORTING.md has them: a heading per editor, then the debug adapter. Notepad++ has
 *  its own setup page. */
function editorSetups(c) {
  const { porting, repoUrl } = c.d;
  const wiring = portingSection(porting, '## Wiring `ncdev lsp` into an editor').replace(/\n### Notepad\+\+\n[\s\S]*?(?=\n### )/, '\n');
  const names = [...wiring.matchAll(/^### ([^(\n`]+)/gm)].map((m) => m[1].trim()).filter((x) => !/^Anything/.test(x));
  return {
    names,
    md: `${wiring.replace(/^### /gm, '## ')}\n\n## The debugger: \`ncdev dap\`\n\n${portingSection(porting, '## Debugging: `ncdev dap`')}`,
    mdHref: portingHref(repoUrl),
  };
}

function setupPage(c, id) {
  const t = c.tool[id];
  const s = t.setup;
  const list = (h, items, tag, cls) => (items?.length ? `<h2 id="${slug(h)}">${h}</h2>\n<${tag} class="${cls}">${items.map((x) => `<li>${rich(x, c)}</li>`).join('')}</${tag}>` : '');
  const top = join([
    lead(c, s.lead),
    list('Before you start', s.needs, 'ul', 'dlist'),
    list('Steps', s.steps, 'ol', 'steps'),
    ...sections(c, s.sections),
    s.tested && testedTable(c, s.tested),
  ]);
  const end = join([
    s.verify && `<h2 id="check-that-it-works">Check that it works</h2>\n<p>${rich(s.verify, c)}</p>`,
    ...sections(c, s.after),
    related(c, s.related, s.slug),
  ]);
  const page = { slug: s.slug, group: t.name, title: s.title, nav: c.kind.setup.nav, hit: s.title, desc: s.desc };
  if (id !== 'lsp') return { ...page, html: join([top, end]) };
  const setups = editorSetups(c);
  return { ...page, desc: `The language server and debugger config for ${setups.names.join(', ')}.`, intro: `${top}\n`, md: setups.md, mdHref: setups.mdHref, outro: end };
}

// ---------------------------------------------------------------------------
// The feature comparison (data/tools.json compare, data/tools-compare.json).

function comparePage(c) {
  const text = c.d.tools.compare;
  return {
    slug: text.slug, group: c.d.tools.across, title: text.title, nav: text.nav, desc: text.desc,
    html: `${lead(c, text.lead)}
<div class="compare-wrap" tabindex="0" role="region" aria-label="Features by tool (scrolls sideways)">
<table class="compare">
${c.d.compareHtml}
</table>
</div>
${small(c, text.note)}`,
  };
}

// ---------------------------------------------------------------------------
// docs/tools/: every tool in one table, how they fit together, a handler's path.

function indexPage(c) {
  const { index, tools, compare } = c.d.tools;
  const row = (t) => [
    `<a href="${c.docHref(t.slug)}">${esc(t.title)}</a>`,
    rich(t.line, c),
    t.setup ? `<a href="${c.docHref(t.setup.slug)}">${esc(t.setup.title)}</a>` : rich(t.setupLine, c),
  ];
  return `${lead(c, index.lead)}
<h2 id="the-tools">The tools</h2>
${table(['Tool', 'What it is', 'Set up'], tools.map(row))}
${small(c, index.new)}
<h2 id="how-they-fit">How they fit together</h2>
${coreDiagram(c)}
<p>${rich(index.fit, c)}</p>
<h2 id="path">A handler's path</h2>
${flowDiagram(c, index.path)}
<p><a href="${c.docHref(compare.slug)}">${esc(compare.title)}</a></p>`;
}

/**
 * The Tools pages, in the order of the docs list: a group per tool (the workbench's pages; for the others the overview,
 * the setup, then a reference page per kind), then the pages about every tool.
 * @returns {{ pages: { slug: string, group: string, title: string, nav: string, hit?: string, desc: string, html?: string, intro?: string, md?: string, mdHref?: (u: string) => string, outro?: string }[],
 *   index: string, media: string[], css: string }} `nav`: the page's name under its group in the docs list; `hit`: its
 *   name where the group isn't shown (the filter's results). `media`: the screenshots the pages show, for the build to copy.
 */
export function toolDocs(d) {
  const c = context(d);
  const pages = d.tools.tools.flatMap((t) => (t.id === 'workbench'
    ? [...d.guide.pages.map((page, i) => guidePage(c, page, i)), ...referencePages(c, t.id)]
    : [toolPage(c, t.id), ...(t.setup ? [setupPage(c, t.id)] : []), ...referencePages(c, t.id)]));
  pages.push(comparePage(c));
  return { pages, index: indexPage(c), media: [...c.used], css: CSS };
}
