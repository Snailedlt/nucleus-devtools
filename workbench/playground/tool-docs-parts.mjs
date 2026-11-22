// The building blocks of the docs' Tools pages (tool-docs.mjs): a page's opening line and facts, screenshots and
// videos, the diagrams, a table of keys, a page's written sections and its Related list. Each takes the page context
// `c` (tool-docs.mjs context()).
import { esc, keys, table, rich, blocks, slug } from './tool-docs-text.mjs';

/** The most links a page's Related list may have: more than that and it is a second table of contents. */
export const RELATED_MAX = 3;

/** A screenshot, light and dark at once: a line down the picture, light to its left and dark to its right, dragged
 *  (or moved with the arrow keys) to compare, as in the start page's gallery (the maintainer asked for the slider
 *  instead of a picture that follows the page's theme). The light picture carries the description; the dark one is
 *  the same view, so it has none. SHOT_SCRIPT moves the line. */
function shot(name, caption, alt, [w, h] = [1920, 1200]) {
  const img = (t, text) => `<img class="ba-${t}" src="__UP__start/gallery/${name}-${t}.webp" alt="${esc(text)}" width="${w}" height="${h}" loading="lazy" decoding="async">`;
  return `<figure class="shot${h > w ? ' tall' : ''}"><div class="ba-frame">${img('light', alt)}${img('dark', '')}<div class="ba-line" aria-hidden="true"><span>☀</span><span>☾</span></div><input class="ba-range" type="range" min="0" max="100" value="50" aria-label="${esc(alt)}, light or dark: drag, or use the arrow keys, to compare"></div><figcaption>${esc(caption)}</figcaption></figure>`;
}
/** For the pages that show screenshots: the slider moves the line (one listener for every picture on the page). */
export const SHOT_SCRIPT = "document.addEventListener('input', function (e) { var t = e.target; if (t && t.classList && t.classList.contains('ba-range')) t.parentNode.style.setProperty('--pos', t.value + '%'); });";

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
export function video(c, t) {
  if (!t.video) return '';
  const v = c.d.videos[t.video];
  if (!v) throw new Error(`tool docs: no video "${t.video}" on the start page (its size is read from there).`);
  return `<figure class="shot vid"><video controls preload="none" playsinline muted poster="__UP__start/videos/${t.video}-poster.jpg" width="${v.w}" height="${v.h}" aria-label="${esc(t.title)}: a short demo with captions"><source src="__UP__start/videos/${t.video}.mp4" type="video/mp4"></video>
<figcaption>${esc(t.videoLine)} It has captions and no sound. <a href="__UP__start/videos/${t.video}.mp4">Download</a></figcaption></figure>`;
}

/** A page's first paragraph: what the thing is. */
export const lead = (c, text) => `<p class="lead">${rich(text, c)}</p>`;

/** The short list under it: what it runs on, what it needs, where its setup is ([name, text] pairs). */
export function facts(c, list) {
  if (!list?.length) return '';
  return `<dl class="facts">${list.map(([name, text]) => `<div><dt>${esc(name)}</dt><dd>${rich(text, c)}</dd></div>`).join('')}</dl>`;
}

/** The links a page ends with. One short list, so the text above it doesn't have to point everywhere. */
export function related(c, list, where) {
  if (!list?.length) return '';
  if (list.length > RELATED_MAX) throw new Error(`tool docs: "${where}" has ${list.length} related links; ${RELATED_MAX} at most.`);
  return `<h2 id="related">Related</h2>\n<ul class="dlist related">${list.map((x) => `<li>${rich(x, c)}</li>`).join('')}</ul>`;
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

/** A page's written sections: a heading (its id is the heading's words), then any of a two-box diagram, a table
 *  of [name, text] rows (`cols`: its two headings) and text. */
export function sections(c, list) {
  return (list ?? []).map((s) => [
    `<h2 id="${slug(s.h)}">${esc(s.h)}</h2>`,
    s.pair && pairDiagram(c, s.pair, slug(s.h)),
    s.rows && table((s.cols ?? ['Part', 'What it does']).map(esc), s.rows.map((row) => row.map((cell) => rich(cell, c)))),
    s.md && blocks(s.md, c),
    s.shots && shots(c, s.shots),
  ].filter(Boolean).join('\n'));
}

/** Shortcuts as a table. A Mac key that is the same keys means the real Control key (Ctrl is ⌘ there otherwise). */
export function keyTable(actions) {
  const cell = (a) => keys(a.keys)
    + (a.mac ? ` <span class="small">(Mac: ${a.mac === a.keys ? `${keys(a.mac)}, the Control key` : keys(a.mac)})</span>` : '')
    + (a.where === 'fixed' ? ' <span class="small">fixed</span>' : '');
  return table(['Action', 'Keys'], actions.map((a) => [esc(a.label), cell(a)]));
}
