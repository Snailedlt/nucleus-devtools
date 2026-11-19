// Undo and redo as in VS Code: the cursor ends up where the code changed, and the editor scrolls only when that place
// is off screen, as little as needed (no jump when it's already in view, no centring). CodeMirror 5 on its own
// scrolls to the whole changed range (for Format Document or a fix that rewrote the text that is the top of the
// file) and puts the cursor back where it was before the edit, which can be far from the change (a fix applied from
// Check, a Docs example inserted while the cursor was elsewhere).

type Pos = { line: number; ch: number };
type CM = any; // CodeMirror 5

/** Where two texts differ: [start, endBefore) in `before` became [start, endAfter) in `after`. Null when they're equal. */
export function changedRegion(before: string, after: string): { start: number; endBefore: number; endAfter: number } | null {
  if (before === after) return null;
  let start = 0;
  const max = Math.min(before.length, after.length);
  while (start < max && before.charCodeAt(start) === after.charCodeAt(start)) start++;
  let tail = 0;
  while (tail < max - start && before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)) tail++;
  return { start, endBefore: before.length - tail, endAfter: after.length - tail };
}

/** Lines to keep around a revealed change that was off screen, so it isn't on the very edge. */
const CONTEXT_LINES = 3;

/** Makes `cm.undo()` and `cm.redo()` (the keys, the Undo buttons, Blocks' Ctrl+Z) put the cursor at the change and
 *  reveal it only if it's off screen. */
export function revealHistoryChanges(cm: CM): void {
  for (const dir of ['undo', 'redo'] as const) {
    const run = cm[dir].bind(cm);
    cm[dir] = () => {
      const before: string = cm.getValue();
      const { left, top, clientHeight } = cm.getScrollInfo();
      cm.operation(() => {
        run();
        const after: string = cm.getValue();
        const r = changedRegion(before, after);
        if (!r) return; // only the selection moved: as CodeMirror does it
        const from: Pos = cm.posFromIndex(r.start), to: Pos = cm.posFromIndex(r.endAfter);
        // CodeMirror restores the selection from before the edit. Keep it when it's at the change (undoing typing);
        // otherwise the cursor goes to the end of what changed, as in VS Code.
        const head: Pos = cm.getCursor('head');
        const near = head.line >= from.line - 1 && head.line <= to.line + 1;
        if (!near) cm.setCursor(to, undefined, { scroll: false });
        const target: Pos = near ? head : to;
        // Undo CodeMirror's own scroll to the changed range, then scroll only if the target is off screen.
        cm.scrollTo(left, top);
        const y = cm.heightAtLine(target.line, 'local');
        const lh = cm.defaultTextHeight();
        const offScreen = y < top || y + lh > top + clientHeight;
        cm.scrollIntoView(target, offScreen ? CONTEXT_LINES * lh : 0);
      });
    };
  }
}
