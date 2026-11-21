// Every keyboard shortcut in one list, VS Code's by default, and changeable in Settings › Keyboard shortcuts.
// The code editor's keys (CodeMirror), the workbench's own (anywhere on the page), the command palette and the
// shortcut list (?) all read from here. Changes are kept in this browser (nucleus-workbench-keys) and go with
// Export / Import settings.
//
// Notation: "Ctrl+Shift+[", "Ctrl+K Ctrl+0" (two steps). "Ctrl" is ⌘ on a Mac unless an action says otherwise.
// Punctuation means the key's position on a US keyboard (as VS Code does), so the same binding works on every layout.
import CodeMirror from 'codemirror';

export const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
const STORE = 'nucleus-workbench-keys';

import { ACTIONS, type Action, type Group } from './keyactions';
export { ACTIONS, type Action, type Group };


// ---------------------------------------------------------------------------
// Bindings: the default, or the person's own

function load(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
let custom = load();
const listeners = new Set<() => void>();
export const onBindingsChange = (f: () => void) => listeners.add(f);

export const defaultBinding = (a: Action) => (isMac ? a.mac ?? a.keys.replace(/\bCtrl\+/g, 'Cmd+') : a.keys);
/** The binding in use: the person's own (may be "" for none), else the default. */
export function binding(id: string): string {
  const a = ACTIONS.find((x) => x.id === id);
  if (!a) return '';
  return id in custom ? custom[id] : defaultBinding(a);
}
export const isCustom = (id: string) => id in custom;
export function setBinding(id: string, keys: string | null) {
  if (keys === null) delete custom[id];
  else custom[id] = keys;
  try {
    Object.keys(custom).length ? localStorage.setItem(STORE, JSON.stringify(custom)) : localStorage.removeItem(STORE);
  } catch {
    /* not kept */
  }
  listeners.forEach((f) => f());
}
export function resetAll() {
  custom = {};
  try { localStorage.removeItem(STORE); } catch { /* ignore */ }
  listeners.forEach((f) => f());
}

/** "Ctrl+Shift+[" for display: ⌘ ⌥ ⇧ on a Mac. */
export function keyLabel(keys: string): string {
  if (!keys) return '';
  return isMac ? keys.replace(/Cmd\+/g, '⌘').replace(/Alt\+/g, '⌥').replace(/Shift\+/g, '⇧').replace(/Ctrl\+/g, '⌃') : keys;
}
export const labelOf = (id: string) => keyLabel(binding(id));
/** What text says in place of a shortcut's keys when the action has none (its shortcut was cleared): the action
 *  by name, so the sentence still reads. Tips and the tour use it. */
export const noKeyText = (id: string) => `"${ACTIONS.find((a) => a.id === id)?.label ?? id}" (no key set)`;

// ---------------------------------------------------------------------------
// Keys from events, and matching

const US: Record<string, string> = {
  Semicolon: ';', Equal: '=', Comma: ',', Minus: '-', Period: '.', Slash: '/', Backquote: '`',
  BracketLeft: '[', Backslash: '\\', BracketRight: ']', Quote: "'",
};
const NAMES: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Escape: 'Esc' };

/** The key of an event, as a binding names it: punctuation by its US position, letters by their label. */
export function keyOf(e: KeyboardEvent): string | undefined {
  if (['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(e.key)) return undefined;
  if (US[e.code]) return US[e.code];
  if (/^Digit\d$/.test(e.code)) return e.code.slice(5);
  if (/^Key[A-Z]$/.test(e.code)) return e.key.length === 1 && /[a-z]/i.test(e.key) ? e.key.toUpperCase() : e.code.slice(3);
  if (NAMES[e.key]) return NAMES[e.key];
  if (/^F\d{1,2}$|^(Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|Insert)$/.test(e.key)) return e.key;
  return e.key.length === 1 ? e.key.toUpperCase() : undefined;
}
/** One step of a binding from an event: "Ctrl+Shift+K". */
export function stepOf(e: KeyboardEvent): string | undefined {
  const k = keyOf(e);
  if (!k) return undefined;
  const mods = [e.ctrlKey && (isMac ? 'Ctrl' : 'Ctrl'), e.metaKey && 'Cmd', e.altKey && 'Alt', e.shiftKey && 'Shift'].filter(Boolean) as string[];
  // Written in VS Code's order: Ctrl+Shift+Alt+Cmd.
  const order = ['Ctrl', 'Shift', 'Alt', 'Cmd'];
  return [...mods.sort((a, b) => order.indexOf(a) - order.indexOf(b)), k].join('+');
}
const normStep = (s: string) => {
  const parts = s.split('+');
  const key = parts.pop() === '' ? '+' : s.split('+').pop()!; // "Ctrl++" is the + key
  const order = ['Ctrl', 'Shift', 'Alt', 'Cmd'];
  return [...parts.filter((p) => p).sort((a, b) => order.indexOf(a) - order.indexOf(b)), key].join('+');
};
export const steps = (keys: string) => keys.split(' ').filter(Boolean).map(normStep);

/** Workbench (app) shortcuts: which action an event completes, following two-step bindings. */
let pending: { step: string; at: number } | null = null;
export function appActionFor(e: KeyboardEvent): string | 'pending' | undefined {
  const s = stepOf(e);
  if (!s) return undefined;
  const now = Date.now();
  const first = pending && now - pending.at < 2000 ? pending.step : null;
  pending = null;
  // A key someone set themselves wins over a default that uses it too (a default added later, like F6 for Next pane),
  // also as the first step of their own two-step binding (F6 A): then a default's F6 waits for the second key.
  const ownPrefix = !first && ACTIONS.some((a) => a.where === 'app' && isCustom(a.id) && steps(binding(a.id)).length === 2 && steps(binding(a.id))[0] === s);
  for (const a of [...ACTIONS].sort((x, y) => Number(isCustom(y.id)) - Number(isCustom(x.id)))) {
    if (a.where !== 'app') continue;
    const b = steps(binding(a.id));
    if (!b.length) continue;
    if (first && b.length === 2 && b[0] === first && b[1] === s) return a.id;
    if (!first && b.length === 1 && b[0] === s && (isCustom(a.id) || !ownPrefix)) return a.id;
  }
  if (!first && ACTIONS.some((a) => a.where === 'app' && steps(binding(a.id)).length === 2 && steps(binding(a.id))[0] === s)) {
    pending = { step: s, at: now };
    return 'pending';
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// The code editor's keymap

const CM_KEY: Record<string, string> = { Esc: 'Esc', Space: 'Space', '+': '=', };
function toCm(keys: string): string {
  return steps(keys)
    .map((s) => {
      const parts = s.split('+');
      const key = parts.pop()!;
      return [...parts, CM_KEY[key] ?? key].join('-');
    })
    .join(' ');
}

/** CodeMirror extraKeys for the code actions (their handlers come from the page). */
export function codeKeyMap(handlers: Record<string, (cm: any) => void>, base: Record<string, any> = {}): Record<string, any> {
  const map: Record<string, any> = { ...base };
  for (const a of ACTIONS) {
    if (a.where !== 'code') continue;
    const run = handlers[a.id] ?? a.cm;
    const b = binding(a.id);
    if (!run || !b) continue;
    map[toCm(b)] = run;
  }
  return (CodeMirror as any).normalizeKeyMap(map);
}

// ---------------------------------------------------------------------------
// Conflicts and keys the browser keeps

/** Other actions using this binding where it would clash (the same place, or the page and the code). */
/** Back to the default shortcut; actions now using that default lose it (as saving a new one does). Returns them. */
export function resetBinding(id: string): Action[] {
  const a = ACTIONS.find((x) => x.id === id);
  const keys = a ? defaultBinding(a) : '';
  const moved = keys ? conflicts(id, keys) : [];
  moved.forEach((c) => setBinding(c.id, ''));
  setBinding(id, null);
  return moved;
}

export function conflicts(id: string, keys: string): Action[] {
  const mine = ACTIONS.find((a) => a.id === id);
  const s = steps(keys);
  // The same keys, or one is the start of the other's chord (Ctrl+K and Ctrl+K Ctrl+0): the editor can't tell
  // them apart, and CodeMirror refuses such a keymap outright.
  const starts = (x: string[], y: string[]) => x.length > 0 && x.length <= y.length && x.every((k, i) => k === y[i]);
  return ACTIONS.filter((a) => {
    if (a.id === id || a.where === 'fixed' || !mine) return false;
    const o = steps(binding(a.id));
    return starts(o, s) || starts(s, o);
  });
}
/** Keys a browser doesn't hand to the page. */
export function reserved(keys: string): string | undefined {
  const s = steps(keys)[0] ?? '';
  const m = isMac ? 'Cmd' : 'Ctrl';
  const map: Record<string, string> = { [`${m}+W`]: 'closes the tab', [`${m}+T`]: 'opens a tab', [`${m}+N`]: 'opens a window', [`${m}+Tab`]: 'switches tabs', [`${m}+Shift+T`]: 'reopens a tab', [`${m}+Shift+N`]: 'opens a private window', [`${m}+Q`]: 'quits the browser' };
  return map[s];
}
