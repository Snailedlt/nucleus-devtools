// Text to HTML for the docs' Tools pages (tool-docs.mjs). Two kinds of text:
// - what a tool says about itself (a command's help, a setting's description): `toolText`;
// - what a person wrote for these pages (data/tools.json, src/guide.json): `rich` for a line, `blocks` for more.

export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** A tool's own text: `code`, **bold**, [links](https://…). Its code is left for the site's colouring. */
export const toolText = (t) => esc(t)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');

/** A key combination: the site's page pass (kbd.ts kbdify) draws it as keycaps, "Ctrl+K Ctrl+0" as two steps. */
export const keys = (k) => `<kbd>${esc(k)}</kbd>`;
/** Code that is a usage line, not handler code: left out of the site's code colouring. */
export const use = (u) => `<code class="use">${esc(u)}</code>`;
export const table = (head, rows) => `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
/** "a, b and c". */
export const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
/** A heading as the id links name it: "Setting it up" is #setting-it-up. */
export const slug = (h) => h.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** What's in backticks is a key when it reads as one (`F8`, `Alt+Enter`, `Ctrl+.`); a lone `.` or `=` is code. */
const MOD = '(?:Ctrl|Alt|Shift|Cmd|Meta)\\+';
const KEYISH = new RegExp(`^(?:(?:${MOD})+[.,[\\]]|(?:${MOD})*(?:F\\d{1,2}|Esc|Tab|Enter|Space|Home|End|Up|Down|Left|Right|PageUp|PageDown|Shift|Ctrl|Alt|[A-Z0-9?]|[↑↓←→]))$`);

/**
 * One line of written text: `code` and `keys`, **bold**, *emphasis*, {key:<action id>} for a shortcut, {repo} for
 * this repository, {vscodeVersion} for the oldest VS Code the extension runs in, and links: https://…,
 * @guide:<page id>, @site:<path>, @docs:<slug>, each with an optional #part.
 * `c`: { keyOf(id), guideHref(id), docHref(slug), repo, vscodeVersion }. Something it names that doesn't exist stops the build.
 */
export function rich(t, c) {
  const link = (u) => {
    if (/^https?:/.test(u)) return u;
    const m = /^@(guide|site|docs):([^#]*)(#.*)?$/.exec(u);
    if (!m) throw new Error(`tool docs: a link to "${u}": use https://…, @guide:<page>, @site:<path> or @docs:<slug>.`);
    const [, kind, to, part = ''] = m;
    return (kind === 'guide' ? c.guideHref(to) : kind === 'docs' ? (c.docHref ? c.docHref(to) : `__UP__docs/${to}/`) : `__UP__${to}`) + part;
  };
  return esc(t)
    .replace(/\{(repo|vscodeVersion)\}/g, (_, name) => c[name] ?? '')
    .replace(/\{key:(\w+)\}/g, (_, id) => keys(c.keyOf(id)))
    .replace(/`([^`]+)`/g, (_, x) => (KEYISH.test(x) ? `<kbd>${x}</kbd>` : `<code class="use">${x}</code>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, u) => `<a href="${link(u.replace(/&amp;/g, '&'))}">${text}</a>`);
}

/** Written text of more than a line: paragraphs, "- " lists, "1. " steps, and ``` fences (a code block, coloured by
 *  the site's page pass when the fence names a language it knows). A fence opens and closes on a line of its own, so
 *  ``` inside a line of code stays code. */
export function blocks(text, c) {
  const paragraphs = (part) => part.split(/\n{2,}/).filter((b) => b.trim()).map((b) => {
    const out = [];
    let list = null;
    const flush = () => {
      if (!list) return;
      out.push(`<${list.tag} class="${list.tag === 'ol' ? 'steps' : 'dlist'}">${list.items.map((i) => `<li>${rich(i, c)}</li>`).join('')}</${list.tag}>`);
      list = null;
    };
    for (const line of b.split('\n')) {
      const m = /^(?:- |(\d+)\. )(.*)$/.exec(line);
      if (!m) { flush(); out.push(`<p>${rich(line, c)}</p>`); continue; }
      const tag = m[1] ? 'ol' : 'ul';
      if (list && list.tag !== tag) flush();
      (list ??= { tag, items: [] }).items.push(m[2]);
    }
    flush();
    return out.join('\n');
  });
  // text, a fence's language, its code, text, …
  return text.split(/^```(\w*)\n([\s\S]*?)^```[ \t]*$/gm).flatMap((part, i, all) => {
    if (i % 3 === 1) return [];
    if (i % 3 === 2) return [`<pre class="cfg"${all[i - 1] ? ` data-lang="${all[i - 1]}"` : ''}><code>${esc(part.replace(/\n$/, ''))}</code></pre>`];
    return paragraphs(part);
  }).join('\n');
}
