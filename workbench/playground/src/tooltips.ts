// Tooltips are the workbench's own, never the browser's: anything with a `title` shows it in a styled bubble when
// it's pointed at or reached with the keyboard. So a `title` in the markup is enough, and new buttons get the
// styled tooltip without anyone having to remember it. While the bubble shows, the element's `title` is set aside
// (the browser would show its own on top) and put back when the pointer or the focus leaves.
// Touch screens have touch-titles.ts (hold to read); the buttons with shortcuts have keyhints.ts.
const WAIT = 400; // before the first one shows; moving on to the next element shows it at once

export function initTooltips() {
  const bubble = document.createElement('div');
  bubble.id = 'tooltip';
  bubble.setAttribute('aria-hidden', 'true'); // screen readers get the words from the element itself (below)
  bubble.setAttribute('popover', 'manual'); // the top layer: above an open dialog too
  document.body.append(bubble);
  let on: HTMLElement | null = null;
  let said: 'aria-label' | 'aria-description' | null = null; // what stands in for the title while it's set aside
  let timer: number | undefined;
  let lastHidden = 0;

  const restore = () => {
    if (on?.dataset.tip !== undefined) {
      if (!on.hasAttribute('title')) on.setAttribute('title', on.dataset.tip);
      if (said) on.removeAttribute(said);
      delete on.dataset.tip;
    }
    on = null;
    said = null;
  };
  const hide = () => {
    clearTimeout(timer);
    if (bubble.matches(':popover-open')) { bubble.hidePopover(); lastHidden = Date.now(); }
    restore();
  };
  const show = (el: HTMLElement) => {
    if (!el.isConnected || on !== el) return;
    bubble.textContent = el.dataset.tip ?? '';
    if (!bubble.textContent.trim()) return;
    if (!bubble.matches(':popover-open')) bubble.showPopover();
    const r = el.getBoundingClientRect();
    const w = bubble.offsetWidth, h = bubble.offsetHeight;
    bubble.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
    bubble.style.top = `${r.bottom + 6 + h < innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - h - 6)}px`;
  };
  const enter = (target: EventTarget | null, now: boolean) => {
    const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('[title]');
    if (!el || el === on || !el.title.trim() || el.closest('.CodeMirror')) return;
    hide();
    on = el;
    el.dataset.tip = el.title;
    // The title was the element's name (an icon button) or its description: it stays that for screen readers.
    said = el.hasAttribute('aria-label') || el.textContent?.trim() ? (el.hasAttribute('aria-description') ? null : 'aria-description') : 'aria-label';
    if (said) el.setAttribute(said, el.title);
    el.removeAttribute('title');
    if (now || Date.now() - lastHidden < 300) show(el);
    else timer = window.setTimeout(() => show(el), WAIT);
  };
  const leave = (target: EventTarget | null, to: EventTarget | null) => {
    if (!on || !(target instanceof Node) || !on.contains(target)) return;
    if (to instanceof Node && on.contains(to)) return;
    hide();
  };

  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch') enter(e.target, false); });
  document.addEventListener('pointerout', (e) => leave(e.target, e.relatedTarget));
  document.addEventListener('focusin', (e) => { if ((e.target as HTMLElement).matches?.(':focus-visible')) enter(e.target, true); });
  document.addEventListener('focusout', (e) => leave(e.target, e.relatedTarget));
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) document.addEventListener(type, hide, { capture: true, passive: true });
  window.addEventListener('blur', hide);
}
