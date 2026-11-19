// Game.ProtoInput.BlockedMessages in the editor: each number's window-message name after it (`0x0008` WM_KILLFOCUS),
// and a "+" before the closing bracket that lists the messages handlers block, most used first, to add one.
// Names and meanings come from the core (core/wm.ts: Proto Input's own list), the same as the VS Code extension.
import { blockedLists, blockTarget, COMMON_MESSAGES, hex, insertMessage, type BlockedList } from '@core/wm';

type CM = any; // CodeMirror 5
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function initMessageHints(editor: CM) {
  let marks: { clear: () => void }[] = [];
  // Help on request: the names and the "+" show for the list the cursor is in, or on hover (CSS), not all the time.
  // Each list's brackets as bookmarks, so the bounds follow edits made before the next redraw.
  let groups: { from: { find: () => any }; to: { find: () => any }; els: HTMLElement[] }[] = [];
  const reveal = () => {
    const at = editor.indexFromPos(editor.getCursor());
    for (const g of groups) {
      const a = g.from.find(), b = g.to.find();
      const near = !!a && !!b && at >= editor.indexFromPos(a) && at <= editor.indexFromPos(b) + 1;
      g.els.forEach((e) => e.classList.toggle('near', near));
    }
  };
  let timer = 0;
  let menu: HTMLElement | null = null;
  let opener: HTMLElement | null = null; // the + stays shown while its menu is open (.open)
  const closeMenu = () => { menu?.remove(); menu = null; opener?.classList.remove('open'); opener = null; };
  const draw = () => {
    marks.forEach((m) => m.clear());
    marks = [];
    groups = [];
    const text: string = editor.getValue();
    for (const l of blockedLists(text)) {
      const els: HTMLElement[] = [];
      const from = editor.setBookmark(editor.posFromIndex(l.open)), to = editor.setBookmark(editor.posFromIndex(l.close));
      marks.push(from, to);
      groups.push({ from, to, els });
      for (const it of l.items) {
        const t = blockTarget(it.id);
        const el = document.createElement('span');
        el.className = `wm-hint${t.kind === 'ok' ? '' : ' bad'}`;
        el.textContent = t.kind === 'ok' ? t.name : t.kind === 'out' ? 'unknown' : `→ ${t.name}?`;
        el.setAttribute('aria-hidden', 'true'); // the hover and Check say it in words
        els.push(el);
        marks.push(editor.setBookmark(editor.posFromIndex(it.end), { widget: el, insertLeft: true }));
      }
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'wm-add';
      add.textContent = '+';
      add.title = 'Add a window message';
      add.setAttribute('aria-label', 'Add a window message to block');
      add.addEventListener('mousedown', (e) => e.preventDefault()); // keep the editor's selection
      add.addEventListener('click', () => openMenu(add, l));
      els.push(add);
      marks.push(editor.setBookmark(editor.posFromIndex(l.close), { widget: add, insertLeft: true }));
    }
    reveal();
  };
  editor.on('cursorActivity', reveal);
  function openMenu(anchor: HTMLElement, list: BlockedList) {
    closeMenu();
    opener = anchor;
    anchor.classList.add('open');
    const have = new Set(list.items.map((i) => i.id));
    menu = document.createElement('div');
    menu.className = 'wm-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Window messages to block');
    menu.innerHTML = `<div class="wm-menu-h">Block a window message <span class="muted">(most used first)</span></div>` + COMMON_MESSAGES.map((m) =>
      `<button type="button" role="menuitem" data-id="${m.id}"${have.has(m.id) ? ' disabled' : ''}><b>${m.name}</b> <code>${hex(m.id)}</code>${m.hub ? `<span class="wm-n">${m.hub} Hub handler${m.hub === 1 ? '' : 's'}</span>` : ''}<small>${esc(m.meaning)}</small></button>`).join('')
      + `<p class="wm-menu-f muted">Blocked only with <code>Game.ProtoInput.MessageFilterHook = true</code>.</p>`;
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8))}px`;
    menu.style.top = r.bottom + 6 + menu.offsetHeight < window.innerHeight ? `${r.bottom + 6}px` : `${Math.max(8, r.top - menu.offsetHeight - 6)}px`;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    items[0]?.focus();
    document.getElementById('tip')?.setAttribute('hidden', '');
    menu.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-id]');
      if (!b) return;
      const fresh = blockedLists(editor.getValue()).find((l) => Math.abs(l.open - list.open) < 4) ?? list;
      const ins = insertMessage(editor.getValue(), fresh, Number(b.dataset.id));
      editor.replaceRange(ins.text, editor.posFromIndex(ins.at));
      closeMenu();
      editor.focus();
    });
    menu.addEventListener('keydown', (e) => {
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
      // Back to the + while it shows; else to the code (a hidden button can't hold the focus).
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(); if (anchor.isConnected && anchor.getClientRects().length) anchor.focus(); else editor.focus(); }
    });
    setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (menu && !menu.contains(e.target as Node)) { closeMenu(); } if (!menu) document.removeEventListener('pointerdown', off); }), 0);
  }
  editor.on('change', () => { clearTimeout(timer); timer = window.setTimeout(draw, 150); });
  draw();
}
