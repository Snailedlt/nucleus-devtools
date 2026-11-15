// Code coloured by what the names are, as in VS Code: CodeMirror's JavaScript tokens, then the core's semantic tokens
// (core/features.ts semanticTokens) on top. Those are JavaScript's own categories (variable, property, method,
// class) with Nucleus's detail as modifiers (group, choice, callback). The Nucleus colouring (the default, which
// follows the look) gives each its own colour; a named code theme (VS Code, JetBrains…) colours by the JavaScript
// category alone, as that editor does. A name Nucleus doesn't know stays plain. The workbench's and Learn's editors,
// codehl.ts (hovers, Check, docs) and the site's static pages (build.mjs, with CodeMirror's Node runMode) all use it.
import { semanticTokens, type SemanticToken } from '@core/features';

/** The class a Nucleus name gets (styled in page.html and semcss.ts). */
export function semClass(t: Pick<SemanticToken, 'type' | 'modifiers'>): string {
  const m = (x: string) => t.modifiers.includes(x as any);
  switch (t.type) {
    case 'variable':
    case 'class':
      return 'cm-nucleus-obj'; // Game, Context, Nucleus; new Nucleus.IniSaveInfo
    case 'method':
      return m('callback') ? 'cm-nucleus-cb' : 'cm-nucleus-fn'; // Game.Play; Context.GetFolder
    default:
      return m('group') ? 'cm-nucleus-group' : m('choice') ? 'cm-nucleus-val' : 'cm-nucleus-prop'; // Game.Hook; Nucleus.Folder.X; settings
  }
}

/** Where the Nucleus names are: [start, end) offsets and their class. Empty if the code doesn't parse at all. */
export function semanticSpans(src: string): { start: number; end: number; cls: string }[] {
  try {
    return semanticTokens(src).map((t) => ({ start: t.start, end: t.end, cls: semClass(t) }));
  } catch {
    return [];
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * `src` as HTML with CodeMirror's token classes, a Nucleus name's token taking its semantic class instead.
 * `runMode` is CodeMirror's (the browser's or Node's), already loaded with the JavaScript mode.
 */
export function semHighlight(src: string, runMode: (src: string, mode: string, cb: (text: string, style?: string | null) => void) => void): string {
  const spans = semanticSpans(src);
  const at = new Map(spans.map((s) => [s.start, s]));
  let out = '';
  let pos = 0;
  runMode(src, 'javascript', (text, style) => {
    const s = at.get(pos);
    const cls = s && s.end === pos + text.length ? s.cls : style ? style.split(' ').map((x) => `cm-${x}`).join(' ') : '';
    out += cls ? `<span class="${cls}">${esc(text)}</span>` : esc(text);
    pos += text.length;
  });
  return out;
}

export { SEM_STATIC_CSS } from './semcss';
