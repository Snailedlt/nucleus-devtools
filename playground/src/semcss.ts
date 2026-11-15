// The colours of Nucleus names (semhl.ts) on pages without the workbench's code themes: no imports, so the build
// can add them to every page cheaply.
/** For pages without the workbench's code themes (Learn, the site's pages): VS Code's own colours for these names,
 *  light and dark (Light+/Dark+, AA on the pages' code backgrounds). */
const PAL = { light: { obj: '#155e6b', group: '#155e6b', val: '#005fa3', prop: '#001080', fn: '#6b5320', cb: '#6b5320' }, dark: { obj: '#4ec9b0', group: '#4ec9b0', val: '#4fc1ff', prop: '#9cdcfe', fn: '#dcdcaa', cb: '#dcdcaa' } };
/** The Nucleus colouring's weight and style: Game and callbacks bold, a fixed choice italic (as in the workbench). */
const STYLE = `:is(.cm-s-default, .hl) .cm-nucleus-obj, :is(.cm-s-default, .hl) .cm-nucleus-cb { font-weight: 600; } :is(.cm-s-default, .hl) .cm-nucleus-val { font-style: italic; }`;
const rules = (p: typeof PAL.light, pre: string) =>
  ['obj', 'group', 'val', 'prop', 'fn', 'cb'].map((k) => `${pre} :is(.cm-s-default, .hl) span.cm-nucleus-${k}, ${pre} :is(.cm-s-default, .hl) span.cm-nucleus-${k} span { color: ${(p as any)[k]}; }`).join('\n');
export const SEM_STATIC_CSS = `${STYLE}
${rules(PAL.light, '')}
@media (prefers-color-scheme: dark) { ${rules(PAL.dark, ':root:not([data-theme="light"])')} }
${rules(PAL.dark, ':root[data-theme="dark"]')}`;
