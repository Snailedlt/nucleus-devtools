// Text to HTML for the docs' Tools pages (tool-docs.mjs). Two kinds of text:
// - what a tool says about itself (a command's help, a setting's description): `toolText`;
// - what a person wrote for these pages (data/tools.json, src/guide.json): `rich` for a line, `blocks` for more.
import { FENCE_LANGS } from './docs-pages.mjs';

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
 * this repository, {vscodeVersion} for the oldest VS Code the extension runs in, {download:<file>} for a link to that
 * file of the newest release (DOWNLOADS), and links: https://…,
 * @guide:<page id>, @site:<path>, @docs:<slug>, each with an optional #part.
 * `c`: { keyOf(id), guideHref(id), docHref(slug), repo, vscodeVersion }. Something it names that doesn't exist stops the build.
 */
/** The files a setup page hands out: a link to the newest release's, by the file's name there (`vsix`: the
 *  extension, whose file name has the version in it). The build puts in the address it knows (the placeholders), and
 *  RELEASE_SCRIPT swaps in a newer release's when the page is opened. */
export const DOWNLOADS = {
  vsix: '<a class="dl" data-asset="vsix" href="__VSIX_URL__"><strong>__VSIX_NAME__</strong></a> (<span data-asset-tag>__VSIX_TAG__</span>)',
  'ncdev.exe': '<a class="dl" data-asset="ncdev.exe" href="__NCDEV_URL__"><code>ncdev.exe</code></a>',
  'ncdev-linux-x64': '<a class="dl" data-asset="ncdev-linux-x64" href="__NCDEV_LINUX_URL__"><code>ncdev-linux-x64</code></a>',
};
/** For the pages with download links: the newest release now (the extension's v… tags, pre-releases included; not
 *  the workbench's updates or the test build), so a new release shows up without a rebuild. Any error keeps the
 *  built links. A test site built with a test build keeps it (data-pinned). */
export const RELEASE_SCRIPT = `(function () {
  var links = document.querySelectorAll('a[data-asset]');
  if (!window.fetch || !links.length || document.querySelector('a[data-asset][data-pinned]')) return;
  fetch('https://api.github.com/repos/Snailedlt/nucleus-devtools/releases?per_page=30', { headers: { accept: 'application/vnd.github+json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (list) {
      if (!Array.isArray(list)) return;
      for (var i = 0; i < list.length; i++) {
        var rel = list[i];
        if (rel.draft || !/^v\\d/.test(rel.tag_name)) continue;
        var vsix = rel.assets.filter(function (a) { return /\\.vsix$/.test(a.name) && /^https:\\/\\/github\\.com\\//.test(a.browser_download_url); })[0];
        if (!vsix) continue;
        links.forEach(function (l) {
          if (l.dataset.asset === 'vsix') { l.href = vsix.browser_download_url; (l.querySelector('strong') || l).textContent = vsix.name; return; }
          var a = rel.assets.filter(function (x) { return x.name === l.dataset.asset; })[0];
          if (a && /^https:\\/\\/github\\.com\\//.test(a.browser_download_url)) l.href = a.browser_download_url;
        });
        document.querySelectorAll('[data-asset-tag]').forEach(function (t) { t.textContent = rel.tag_name; });
        return;
      }
    })
    .catch(function () {});
})();`;

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
    .replace(/\{download:([\w.-]+)\}/g, (_, file) => { if (!DOWNLOADS[file]) throw new Error(`tool docs: {download:${file}} is not a file a release hands out (DOWNLOADS in tool-docs-text.mjs).`); return `\u0001dl:${file}\u0001`; })
    // Plain <code>: the site's page pass colours what is clearly code (`Game.Play`) and leaves the rest (a file name,
    // a command) as it is. Command usage keeps its own class (use(), above), which that pass skips.
    .replace(/`([^`]+)`/g, (_, x) => (KEYISH.test(x) ? `<kbd>${x}</kbd>` : `<code>${x}</code>`))
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, u) => `<a href="${link(u.replace(/&amp;/g, '&'))}">${text}</a>`)
    // Last, so the link's own markup isn't read as text above.
    .replace(/\u0001dl:([\w.-]+)\u0001/g, (_, file) => DOWNLOADS[file]);
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
    if (i % 3 === 2) {
      // The language by the name the site's colouring knows (docs-pages.mjs FENCE_LANGS: `bash` is shell, `elisp` is commonlisp).
      const lang = FENCE_LANGS[all[i - 1].toLowerCase()] ?? all[i - 1];
      return [`<pre class="cfg"${lang ? ` data-lang="${lang}"` : ''}><code>${esc(part.replace(/\n$/, ''))}</code></pre>`];
    }
    return paragraphs(part);
  }).join('\n');
}
