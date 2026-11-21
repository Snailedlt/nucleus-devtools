// The building blocks of the docs' Tools pages (tool-docs.mjs): a tool's introduction, screenshots and videos, the
// diagrams, a table of keys, and a page's written sections. Each takes the page context `c` (tool-docs.mjs context()).
import { esc, keys, table, rich, blocks, slug } from './tool-docs-text.mjs';

/** A screenshot in the page's theme: the light and the dark one, the right one shown by CSS (.th-light / .th-dark). */
function shot(name, caption, alt, [w, h] = [1920, 1200]) {
  const img = (t) => `<img class="th-${t}" src="__UP__start/gallery/${name}-${t}.webp" alt="${t === 'light' ? esc(alt) : ''}" width="${w}" height="${h}" loading="lazy" decoding="async"${t === 'dark' ? ' aria-hidden="true"' : ''}>`;
  return `<figure class="shot${h > w ? ' tall' : ''}">${img('light')}${img('dark')}<figcaption>${esc(caption)}</figcaption></figure>`;
}

/** A page's screenshots, by name; each one's caption is the start page gallery's, or its own (["name", "caption"]). */
export function shots(c, list) {
  if (!list?.length) return '';
  const figures = list.map((x) => {
    const [name, own] = Array.isArray(x) ? x : [x];
    const g = c.d.gallery[name];
    if (!own && !g) throw new Error(`tool docs: the screenshot "${name}" has no caption: it isn't in the start page's gallery, so give one ([name, caption]).`);
    c.used.add(name);
    return shot(name, own ?? g.caption, g ? `${g.tool}: ${g.label}` : `Workbench: ${name.replace(/^workbench-/, '').replace(/-/g, ' ')}`, c.d.sizes?.[name]);
  });
  return `<div class="shots">${figures.join('\n')}</div>`;
}

/** A tool's demo video (the start page's, which also gives its size). */
function video(c, name, title, line) {
  const v = c.d.videos[name];
  if (!v) throw new Error(`tool docs: no video "${name}" on the start page (its size is read from there).`);
  return `<figure class="shot vid"><video controls preload="none" playsinline muted poster="__UP__start/videos/${name}-poster.jpg" width="${v.w}" height="${v.h}" aria-label="${esc(title)}: a short demo with captions"><source src="__UP__start/videos/${name}.mp4" type="video/mp4"></video>
<figcaption>${esc(line)} It has captions and no sound. <a href="__UP__start/videos/${name}.mp4">Download</a></figcaption></figure>`;
}

/** What a tool is, when to use it and where to get it (data/tools.json), on top of its page; then its video. */
export function intro(c, t) {
  return `<div class="tool-intro">
<p class="lead">${rich(t.what, c)}</p>
<h2 id="when">When to use it</h2>
<ul class="dlist">${t.when.map((w) => `<li>${rich(w, c)}</li>`).join('')}</ul>
${t.not ? `<p class="small">${rich(t.not, c)}</p>\n` : ''}<p><a class="btn primary" href="__UP__${t.get.href}">${esc(t.get.label)}</a></p>
</div>${t.video ? `\n${video(c, t.video, t.title, t.videoLine)}` : ''}`;
}

// Diagrams are boxes and lines in HTML and CSS, so they wrap on a narrow screen and stay text.

/** Every tool around the one core they share. */
export function coreDiagram(c) {
  const { tools, core } = c.d.tools;
  const card = (t) => `<li><a href="__UP__docs/${t.slug}/"><strong>${esc(t.title.replace(/ \(.*\)$/, ''))}</strong><small>${esc(t.short)}</small></a></li>`;
  const half = Math.ceil(tools.length / 2);
  return `<figure class="dg" aria-labelledby="dg-core-cap">
<div class="dg-core">
<ul class="dg-row top">${tools.slice(0, half).map(card).join('')}</ul>
<p class="dg-engine"><strong>${esc(core.title)}</strong><span>${core.parts.map(esc).join(' · ')}</span></p>
<ul class="dg-row bottom">${tools.slice(half).map(card).join('')}</ul>
</div>
<figcaption id="dg-core-cap">${esc(core.line)}</figcaption></figure>`;
}

/** A handler's path, from writing to the Hub. `href(step id)`: the step's page, where it has one. */
export function flowDiagram(c, caption, href = () => null) {
  const step = (s) => {
    const inner = `<strong>${esc(s.label)}</strong><small>${esc(s.line)}</small>`;
    const u = href(s.id);
    return `<li>${u ? `<a href="${u}">${inner}</a>` : `<span>${inner}</span>`}</li>`;
  };
  return `<figure class="dg" aria-labelledby="dg-flow-cap">
<ol class="dg-flow">${c.d.tools.flow.map(step).join('')}</ol>
<figcaption id="dg-flow-cap">${esc(caption)}</figcaption></figure>`;
}

/** Two boxes that talk to each other (your editor and the language server). `id`: unique on the page. */
function pairDiagram(c, pair, id) {
  const box = ([title, line]) => `<li><span><strong>${esc(title)}</strong><small>${esc(line)}</small></span></li>`;
  return `<figure class="dg" aria-labelledby="dg-${id}-cap"><ol class="dg-flow pair">${box(pair.a)}${box(pair.b)}</ol>
<figcaption id="dg-${id}-cap">${rich(pair.caption, c)}</figcaption></figure>`;
}

/** A page's written sections: a heading (its id is the heading's words), an optional two-box diagram, the text. */
export function sections(c, list) {
  return (list ?? []).map((s) => [
    `<h2 id="${slug(s.h)}">${esc(s.h)}</h2>`,
    s.pair && pairDiagram(c, s.pair, slug(s.h)),
    s.md && blocks(s.md, c),
  ].filter(Boolean).join('\n'));
}

/** Shortcuts as a table. A Mac key that is the same keys means the real Control key (Ctrl is ⌘ there otherwise). */
export function keyTable(actions) {
  const cell = (a) => keys(a.keys)
    + (a.mac ? ` <span class="small">(Mac: ${a.mac === a.keys ? `${keys(a.mac)}, the Control key` : keys(a.mac)})</span>` : '')
    + (a.where === 'fixed' ? ' <span class="small">fixed</span>' : '');
  return table(['Action', 'Keys'], actions.map((a) => [esc(a.label), cell(a)]));
}

/** The last line of a tool's own page: the pages a reader is likely to want next. */
export function more(from) {
  const next = [['editors', 'tools/editors', 'Compare the editors'], ['workbench', 'tools/workbench', 'The workbench guide'], ['all', 'tools', 'All the tools']]
    .filter(([id]) => id !== from)
    .map(([, to, label]) => `<a href="__UP__docs/${to}/">${label}</a>`);
  return `<p class="small more">Next: ${next.join(' · ')} · <a href="__UP__docs/">The handler API docs</a> · <a href="__UP__rules/">Every check</a></p>`;
}
