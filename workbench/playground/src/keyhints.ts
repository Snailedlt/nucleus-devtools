// Keyboard shortcuts, shown where they're used: hover a button (or reach it with Tab) and a small hint says what it
// does and its keys. Works in both modes, so the common shortcuts are findable without Advanced mode, but stays out
// of sight until you look. Replaces the button's plain title tooltip (kept as aria-keyshortcuts for screen readers).
const MAC = /Mac|iPhone|iPad/.test(navigator.platform);
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
// Fixed hints write "Ctrl" for the main modifier (⌘ on a Mac). A rebindable action's keys come from keybindings.ts as
// they are (canonical): there "Cmd" is ⌘ and "Ctrl" the Control key, also on a Mac.
const shown = (k: string, canon: boolean) => k === 'Cmd' ? '⌘' : k === 'Ctrl' ? (MAC ? (canon ? '⌃' : '⌘') : 'Ctrl') : k === 'Alt' && MAC ? '⌥' : k;
const ariaName = (k: string, canon: boolean) => k === 'Cmd' ? 'Meta' : k === 'Ctrl' ? (MAC && !canon ? 'Meta' : 'Control') : k;
// Keys can come from an imported settings file: text only, never markup.
const show = (keys: string, canon: boolean) => keys.split(' ').filter(Boolean).map((k) => `<kbd>${esc(shown(k, canon))}</kbd>`).join('');

/** `keys` is "Ctrl B" (space between keys), or a function for a rebindable action, read when the hint shows; call the
 *  returned `refresh` when bindings change so aria-keyshortcuts follows. */
export function initKeyHints(list: { el: HTMLElement | null; what?: string; keys: string | (() => string) }[]) {
  const tip = document.createElement('div');
  tip.className = 'keyhint';
  tip.setAttribute('role', 'tooltip');
  tip.hidden = true;
  document.body.append(tip);
  let timer = 0;
  const hide = () => { clearTimeout(timer); tip.hidden = true; };
  const aria = (el: HTMLElement, k: string, canon: boolean) => {
    if (k) el.setAttribute('aria-keyshortcuts', k.split(' ').filter(Boolean).map((t) => ariaName(t, canon)).join('+'));
    else el.removeAttribute('aria-keyshortcuts');
  };
  const now = (keys: string | (() => string)) => (typeof keys === 'function' ? keys() : keys);
  for (const { el, what, keys: given } of list) {
    if (!el) continue;
    const label = what ?? (el.getAttribute('title') || el.getAttribute('aria-label') || el.textContent || '').replace(/\s*\((Ctrl|⌘|F\d|\?)[^)]*\)\s*$/, '').trim();
    el.removeAttribute('title');
    aria(el, now(given), typeof given === 'function');
    const open = (delay: number) => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (!el.isConnected || el.offsetParent === null) return;
        const keys = now(given);
        tip.innerHTML = `<span>${label.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</span>${keys ? `<span class="kh-keys">${show(keys, typeof given === 'function')}</span>` : ''}`;
        tip.hidden = false;
        const r = el.getBoundingClientRect();
        const w = tip.offsetWidth, h = tip.offsetHeight;
        // In the side rail: to the right of the button; elsewhere under it.
        if (el.closest('.rail')) {
          tip.style.left = `${r.right + 8}px`;
          tip.style.top = `${r.top + r.height / 2 - h / 2}px`;
        } else {
          tip.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8))}px`;
          tip.style.top = `${r.bottom + 6 + h < innerHeight ? r.bottom + 6 : r.top - h - 6}px`;
        }
      }, delay);
    };
    el.addEventListener('mouseenter', () => open(450));
    el.addEventListener('mouseleave', hide);
    el.addEventListener('focus', () => el.matches(':focus-visible') && open(0));
    el.addEventListener('blur', hide);
    el.addEventListener('click', hide);
  }
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
  addEventListener('scroll', hide, true);
  return { refresh: () => list.forEach(({ el, keys }) => el && aria(el, now(keys), typeof keys === 'function')) };
}
