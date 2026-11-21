// Zen mode, as in VS Code (Ctrl+K Z): only the code, centred, with nothing else on screen. The header, the tool rail,
// Files, Lines and the results pane go; the code's own marks (problems, notes, fixes) stay. Esc twice, the same keys,
// the command palette or the small "Leave Zen mode" button bring everything back. The button, with its keys, shows for
// a few seconds on the way in (so nobody has to guess the way out), then when the pointer nears the top, or on focus. Not kept: a reload starts outside it. Wide screens and phones alike.
export function initZen(opts: { refresh: () => void; focusCode: () => void; announce: (s: string) => void; keys: () => string }) {
  const root = document.documentElement;
  const exit = document.getElementById('zen-exit') as HTMLButtonElement | null;
  const on = () => root.hasAttribute('data-zen');
  let hint = 0;
  const set = (zen: boolean) => {
    if (zen === on()) return;
    root.toggleAttribute('data-zen', zen);
    if (exit) {
      exit.hidden = !zen;
      clearTimeout(hint);
      exit.classList.toggle('hint', zen);
      if (zen) hint = window.setTimeout(() => exit.classList.remove('hint'), 4000);
    }
    requestAnimationFrame(() => { opts.refresh(); if (zen) opts.focusCode(); });
    const keys = opts.keys();
    opts.announce(zen ? `Zen mode: only the code. Escape twice${keys ? ` or ${keys}` : ''} leaves it.` : 'Left Zen mode.');
  };
  exit?.addEventListener('click', () => set(false));
  // The button fades in when the pointer comes near the top of the screen.
  document.addEventListener('pointermove', (e) => { if (on() && exit) exit.classList.toggle('near', e.clientY < 56); }, { passive: true });
  // Esc twice, quickly, and only when the Escape had nothing else to close: a suggestion list, the find bar, a menu, a
  // popup over the code or a dialog (looked at before they handle it, in the capture phase). The editor itself marks
  // every Escape as used, so that can't tell.
  const OPEN = '.CodeMirror-hints, .find-widget.open, .app-menu, dialog[open], #line-pop:not([hidden]), .CodeMirror-dialog, #tip:not([hidden]), #sig:not([hidden])';
  let last = 0;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !on()) return;
    if (e.repeat || [...document.querySelectorAll<HTMLElement>(OPEN)].some((el) => el.getClientRects().length > 0)) { last = 0; return; }
    const now = Date.now();
    if (now - last < 600) { last = 0; set(false); } else last = now;
  }, true);
  return { isOn: on, toggle: () => set(!on()), set };
}
