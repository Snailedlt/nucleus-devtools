// AI-written parts of a doc, marked the same way wherever HTML shows them (VS Code's Docs panel, the workbench's
// docs pages): a framed box with a light AI-violet tint and the sparkle in its corner, so nobody needs a label to see
// it. The sparkle's tooltip (on hover and on focus) says where the part comes from; a visually hidden "AI-written"
// tells screen readers; "Checked by …" stays visible as a small mark, since it changes how far to trust it. Human
// docs stay plain. Markdown, which has no frames (hovers, suggestion docs), gets a ✨ before the text instead
// (core/api.ts memberMarkdown). No DOM: the callers bring their own icon and CSS (the same class names).
import { aiBasis, aiChecked, type AiPart, type Member } from './api';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The corner of an AI-written part's frame: "Checked by …" (when a person did) and the sparkle with its tooltip.
 *  `icon`: the caller's sparkle (decorative: aria-hidden). `id`: unique on the page. */
export function aiMeta(m: Member, part: AiPart, icon: string, id: string): string {
  const checked = aiChecked(m, part);
  return `<span class="ai-meta">${checked ? `<span class="ai-checked">✓ ${esc(checked)}</span>` : ''}`
    + `<span class="ai-badge" tabindex="0" aria-describedby="${esc(id)}">${icon}<span class="sr-only">AI-written</span>`
    + `<span class="ai-tip" role="tooltip" id="${esc(id)}">AI-written. ${esc(aiBasis(m, part))}</span></span></span>`;
}

/**
 * Frames the AI-written parts of a page rendered from memberMarkdown(…, slots): each `ai-doc`/`ai-params`/
 * `ai-example` … `ai-close` and `practice-open` … `practice-close` slot pair (a paragraph each) becomes a box with
 * aiMeta in its corner; "In practice"'s bold first line becomes its heading (`<h{level}>`). Other slots stay.
 */
export function placeAiFrames(html: string, m: Member, o: { icon: string; idPrefix?: string; level?: number }): string {
  const p = (name: string) => `<p>@@slot:${name}@@</p>`;
  const id = (part: string) => `${o.idPrefix ?? 'ai'}-${part}`;
  const h = o.level ?? 2;
  let out = html;
  for (const part of ['doc', 'params', 'example'] as const)
    out = out.replace(p(`ai-${part}`), () => `<div class="ai-box" data-ai="${part}">${aiMeta(m, part, o.icon, id(part))}`);
  out = out.split(p('ai-close')).join('</div>');
  out = out.replace(new RegExp(`${p('practice-open')}\\s*(?:<p><strong>In practice</strong></p>)?`), () =>
    `<section class="ai-box practice" data-ai="practice" aria-labelledby="${id('practice-h')}">${aiMeta(m, 'practice', o.icon, id('practice'))}<h${h} class="ai-h" id="${id('practice-h')}">In practice</h${h}>`);
  return out.replace(p('practice-close'), '</section>');
}

/** The frame's CSS, from the caller's colours: `fg`, `muted`, `line`, `surface` (the tooltip's background) and `tint`
 *  (the AI violet, mixed lightly into the background: light enough for text in every theme). */
export function aiFrameCss(c: { fg: string; muted: string; line: string; surface: string; tint?: string }): string {
  const tint = c.tint ?? '#a855f7';
  return `.ai-box { display: flow-root; margin: 10px 0 14px; padding: 8px 12px; border: 1px solid color-mix(in srgb, ${tint} 45%, ${c.line}); border-radius: 8px; background: color-mix(in srgb, ${tint} 7%, transparent); }
.ai-box > :last-child { margin-bottom: 0; }
.ai-box > .ai-meta + :is(p, ul, h2, h3, div, pre) { margin-top: 0; }
.ai-meta { float: right; display: inline-flex; align-items: center; gap: 6px; margin: 0 -4px 2px 10px; font-size: 12px; color: ${c.muted}; }
.ai-checked { white-space: nowrap; }
.ai-badge { position: relative; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; cursor: help; }
.ai-badge:focus-visible { outline: 2px solid ${tint}; outline-offset: 1px; }
.ai-badge > svg, .ai-badge > .ai-spark { width: 16px; height: 16px; }
.ai-tip { position: absolute; z-index: 5; right: 0; top: 100%; margin-top: 4px; width: max-content; max-width: min(340px, 80vw); padding: 6px 10px; border: 1px solid ${c.line}; border-radius: 6px; background: ${c.surface}; color: ${c.fg}; font-size: 13px; font-weight: 400; line-height: 1.45; text-align: left; white-space: normal; box-shadow: 0 4px 14px rgb(0 0 0 / .18); visibility: hidden; }
.ai-tip::before { content: ''; position: absolute; left: 0; right: 0; top: -6px; height: 6px; }
.ai-badge:hover .ai-tip, .ai-badge:focus .ai-tip { visibility: visible; }
.ai-badge.tip-off .ai-tip { visibility: hidden; }
.ai-h { margin: 0 0 6px; font-size: 1.05em; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; margin: -1px; }`;
}

/** Escape hides a sparkle's tooltip until the pointer or focus leaves it (WCAG 1.4.13), for pages that run scripts. */
export const AI_TIP_SCRIPT = `document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.ai-badge:hover, .ai-badge:focus').forEach(function (b) { b.classList.add('tip-off'); }); });
document.addEventListener('mouseout', function (e) { var b = e.target.closest && e.target.closest('.ai-badge'); if (b && !b.contains(e.relatedTarget)) b.classList.remove('tip-off'); });
document.addEventListener('focusout', function (e) { var b = e.target.closest && e.target.closest('.ai-badge'); if (b) b.classList.remove('tip-off'); });`;
