// The visual editor (Form and Blocks) is hidden for now: the maintainer isn't happy with how it works yet. Its code
// stays in place behind this one flag. `?visual=1` in the workbench's address turns it on in this browser (kept, like
// a setting), `?visual=0` turns it off again. Off, a saved Form or Blocks view opens Code with a short note.
const KEY = 'nucleus-workbench-visual';

function read(): boolean {
  try {
    const q = new URLSearchParams(location.search).get('visual');
    if (q === '1') localStorage.setItem(KEY, '1');
    else if (q === '0') localStorage.removeItem(KEY);
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Is the visual editor (Form and Blocks) on? Off unless turned on with `?visual=1`. */
export const VISUAL = typeof location !== 'undefined' && typeof localStorage !== 'undefined' && read();

/** The note for someone whose saved view (or a link) was Form or Blocks. */
export const VISUAL_HIDDEN_NOTE = 'Form and Blocks are hidden in this version while we rework them, so this opens in Code. Your handler is the same.';

/** Text that's only about Form or Blocks (a tip, a What's new line). */
export const aboutVisual = (s: string) => /\b(Form|Blocks)\b|visual editor/.test(s);
