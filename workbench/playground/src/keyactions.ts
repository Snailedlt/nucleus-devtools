// Every keyboard shortcut as data: keybindings.ts binds them, and the site's docs (docs/tools/workbench/shortcuts/, and each guide page's own keys) list them.
// No DOM here, so the site's build can read it too.

export type Group = 'Workbench' | 'Problems' | 'Find and navigate' | 'Editing' | 'Debugger';
export interface Action {
  id: string;
  label: string;
  group: Group;
  /** The default binding (Windows / Linux), and a Mac one when it differs beyond Ctrl → ⌘. */
  keys: string;
  mac?: string;
  /** Where it works: in the code editor, anywhere on the page, or listed only (not changeable here). */
  where: 'code' | 'app' | 'fixed';
  /** A CodeMirror command, for code actions that need nothing else. */
  cm?: string;
}

export const ACTIONS: Action[] = [
  // Workbench (anywhere)
  { id: 'palette', label: 'Command palette', group: 'Workbench', keys: 'Ctrl+Shift+P', where: 'app' },
  { id: 'open', label: 'Open: examples, Hub handlers, probes', group: 'Workbench', keys: 'Ctrl+P', where: 'app' },
  { id: 'tryIt', label: 'Try it (simulate the handler)', group: 'Workbench', keys: 'Ctrl+F5', where: 'app' },
  { id: 'testAll', label: 'Test all combinations', group: 'Workbench', keys: 'Ctrl+; A', where: 'app' },
  { id: 'save', label: 'Save', group: 'Workbench', keys: 'Ctrl+S', where: 'app' },
  { id: 'saveAs', label: 'Save as: .zip, .js or .nc', group: 'Workbench', keys: 'Ctrl+Shift+S', where: 'app' },
  { id: 'saveNucleus', label: "Save into Nucleus Co-op's handlers folder", group: 'Workbench', keys: 'Ctrl+Alt+S', where: 'app' },
  { id: 'lines', label: 'Show or hide the Lines list', group: 'Workbench', keys: 'Ctrl+B', where: 'app' },
  { id: 'results', label: 'Show or hide the results pane (Check, Try it, Docs)', group: 'Workbench', keys: 'Ctrl+J', where: 'app' },
  { id: 'zen', label: 'Zen mode: only the code (Esc twice leaves it)', group: 'Workbench', keys: 'Ctrl+K Z', where: 'app' },
  { id: 'settings', label: 'Settings', group: 'Workbench', keys: 'Ctrl+,', where: 'app' },
  { id: 'nextPane', label: 'Next part of the page (header, files, code, results)', group: 'Workbench', keys: 'F6', where: 'app' },
  { id: 'prevPane', label: 'Previous part of the page', group: 'Workbench', keys: 'Shift+F6', where: 'app' },
  { id: 'wordWrap', label: 'Word wrap: wrap long lines or scroll sideways', group: 'Workbench', keys: 'Alt+Z', where: 'app' },
  // The open handlers' tabs. VS Code's own keys for these (Ctrl+PageDown, Ctrl+W) belong to the browser; on a Mac
  // ⌘⇧] and ⌘⇧[ are free (Fold is ⌘⌥[ there), so they stay as they are in every Mac app.
  { id: 'nextHandler', label: 'Next tab', group: 'Workbench', keys: 'Alt+PageDown', mac: 'Cmd+Shift+]', where: 'app' },
  { id: 'prevHandler', label: 'Previous tab', group: 'Workbench', keys: 'Alt+PageUp', mac: 'Cmd+Shift+[', where: 'app' },
  { id: 'closeHandler', label: 'Close this tab', group: 'Workbench', keys: 'Alt+W', where: 'app' },
  { id: 'format', label: 'Format the code', group: 'Problems', keys: 'Shift+Alt+F', where: 'app' },
  { id: 'goToCheck', label: 'Go to Check (the problem list)', group: 'Problems', keys: 'Ctrl+Shift+M', where: 'app' },
  { id: 'nextProblem', label: 'Next problem', group: 'Problems', keys: 'F8', where: 'app' },
  { id: 'prevProblem', label: 'Previous problem', group: 'Problems', keys: 'Shift+F8', where: 'app' },
  // In the code
  { id: 'quickFix', label: 'Problems and fixes on this line', group: 'Problems', keys: 'Ctrl+.', where: 'code' },
  { id: 'explainLine', label: 'Explain this line', group: 'Problems', keys: 'Ctrl+Alt+E', where: 'code' },
  { id: 'find', label: 'Find', group: 'Find and navigate', keys: 'Ctrl+F', where: 'code' },
  { id: 'replace', label: 'Find and replace', group: 'Find and navigate', keys: 'Ctrl+H', mac: 'Cmd+Alt+F', where: 'code' },
  { id: 'findNext', label: 'Next match', group: 'Find and navigate', keys: 'F3', where: 'code' },
  { id: 'findPrev', label: 'Previous match', group: 'Find and navigate', keys: 'Shift+F3', where: 'code' },
  { id: 'goToLine', label: 'Go to line', group: 'Find and navigate', keys: 'Ctrl+G', mac: 'Ctrl+G', where: 'code' },
  { id: 'definition', label: 'Go to definition', group: 'Find and navigate', keys: 'F12', where: 'code' },
  { id: 'references', label: 'Find all references (select every use)', group: 'Find and navigate', keys: 'Shift+F12', where: 'code' },
  { id: 'rename', label: 'Rename a variable or function', group: 'Find and navigate', keys: 'F2', where: 'code' },
  { id: 'matchBracket', label: 'Go to the matching bracket', group: 'Find and navigate', keys: 'Ctrl+Shift+\\', where: 'code' },
  { id: 'fold', label: 'Fold the block', group: 'Find and navigate', keys: 'Ctrl+Shift+[', mac: 'Cmd+Alt+[', where: 'code' },
  { id: 'unfold', label: 'Unfold the block', group: 'Find and navigate', keys: 'Ctrl+Shift+]', mac: 'Cmd+Alt+]', where: 'code', cm: 'unfold' },
  { id: 'foldAll', label: 'Fold all', group: 'Find and navigate', keys: 'Ctrl+K Ctrl+0', where: 'code', cm: 'foldAll' },
  { id: 'unfoldAll', label: 'Unfold all', group: 'Find and navigate', keys: 'Ctrl+K Ctrl+J', where: 'code', cm: 'unfoldAll' },
  { id: 'toggleFold', label: 'Fold or unfold', group: 'Find and navigate', keys: 'Ctrl+K Ctrl+L', where: 'code', cm: 'toggleFold' },
  { id: 'scrollUp', label: 'Scroll up a line', group: 'Find and navigate', keys: 'Ctrl+Up', mac: 'Ctrl+PageUp', where: 'code' },
  { id: 'scrollDown', label: 'Scroll down a line', group: 'Find and navigate', keys: 'Ctrl+Down', mac: 'Ctrl+PageDown', where: 'code' },
  { id: 'suggest', label: 'Suggestions', group: 'Editing', keys: 'Ctrl+Space', mac: 'Ctrl+Space', where: 'code' },
  { id: 'parameterHints', label: 'Parameter hints (inside a call)', group: 'Editing', keys: 'Ctrl+Shift+Space', mac: 'Cmd+Shift+Space', where: 'code' },
  { id: 'comment', label: 'Comment or uncomment the line', group: 'Editing', keys: 'Ctrl+/', where: 'code', cm: 'toggleCommentIndented' },
  { id: 'addComment', label: 'Add a line comment', group: 'Editing', keys: 'Ctrl+K Ctrl+C', where: 'code' },
  { id: 'removeComment', label: 'Remove a line comment', group: 'Editing', keys: 'Ctrl+K Ctrl+U', where: 'code' },
  { id: 'blockComment', label: 'Block comment on or off', group: 'Editing', keys: 'Shift+Alt+A', where: 'code' },
  { id: 'lineUp', label: 'Move the line up', group: 'Editing', keys: 'Alt+Up', where: 'code', cm: 'swapLineUp' },
  { id: 'lineDown', label: 'Move the line down', group: 'Editing', keys: 'Alt+Down', where: 'code', cm: 'swapLineDown' },
  { id: 'copyUp', label: 'Copy the line up', group: 'Editing', keys: 'Shift+Alt+Up', where: 'code' },
  { id: 'copyDown', label: 'Copy the line down', group: 'Editing', keys: 'Shift+Alt+Down', where: 'code', cm: 'duplicateLine' },
  { id: 'deleteLine', label: 'Delete the line', group: 'Editing', keys: 'Ctrl+Shift+K', where: 'code', cm: 'deleteLine' },
  { id: 'lineBelow', label: 'New line below', group: 'Editing', keys: 'Ctrl+Enter', where: 'code', cm: 'insertLineAfter' },
  { id: 'lineAbove', label: 'New line above', group: 'Editing', keys: 'Ctrl+Shift+Enter', where: 'code', cm: 'insertLineBefore' },
  { id: 'indent', label: 'Indent', group: 'Editing', keys: 'Ctrl+]', where: 'code', cm: 'indentMore' },
  { id: 'outdent', label: 'Outdent', group: 'Editing', keys: 'Ctrl+[', where: 'code', cm: 'indentLess' },
  { id: 'selectLine', label: 'Select the line', group: 'Editing', keys: 'Ctrl+L', where: 'code', cm: 'selectLine' },
  { id: 'selectNext', label: 'Select the next match too', group: 'Editing', keys: 'Ctrl+D', where: 'code', cm: 'selectNextOccurrence' },
  { id: 'selectAll', label: 'Select every match', group: 'Editing', keys: 'Ctrl+Shift+L', where: 'code', cm: 'selectAllOccurrences' },
  { id: 'cursorUp', label: 'Add a cursor above', group: 'Editing', keys: 'Ctrl+Alt+Up', where: 'code', cm: 'addCursorToPrevLine' },
  { id: 'cursorDown', label: 'Add a cursor below', group: 'Editing', keys: 'Ctrl+Alt+Down', where: 'code', cm: 'addCursorToNextLine' },
  { id: 'cursorsEnds', label: "A cursor at each selected line's end", group: 'Editing', keys: 'Shift+Alt+I', where: 'code' },
  { id: 'undoCursor', label: 'Undo the last cursor move', group: 'Editing', keys: 'Ctrl+U', where: 'code', cm: 'undoSelection' },
  // Listed only
  { id: 'tab', label: 'Indent (a selection: its lines) · outdent', group: 'Editing', keys: 'Tab · Shift+Tab', where: 'fixed' },
  { id: 'undo', label: 'Undo · redo', group: 'Editing', keys: 'Ctrl+Z · Ctrl+Y', where: 'fixed' },
  { id: 'addCursor', label: 'Add a cursor', group: 'Editing', keys: 'Alt+click', where: 'fixed' },
  { id: 'findSelectAll', label: 'In Find: select every match (then → or ← puts a cursor after or before each)', group: 'Editing', keys: 'Alt+Enter', where: 'fixed' },
  { id: 'leave', label: 'Leave the code editor', group: 'Workbench', keys: 'Esc Tab', where: 'fixed' },
  { id: 'help', label: 'This list (outside the editor)', group: 'Workbench', keys: '?', where: 'fixed' },
  { id: 'debugBreak', label: 'Breakpoint on this line (Shift+F9: with a condition)', group: 'Debugger', keys: 'F9', where: 'fixed' },
  { id: 'debugGo', label: 'Start, or continue to the next breakpoint', group: 'Debugger', keys: 'F5', where: 'fixed' },
  { id: 'debugStep', label: 'Step over · into · out', group: 'Debugger', keys: 'F10 · F11 · Shift+F11', where: 'fixed' },
  { id: 'debugBack', label: 'Step back · back to the previous breakpoint', group: 'Debugger', keys: 'Alt+F10 · Alt+F5', where: 'fixed' },
  { id: 'debugStop', label: 'Restart · stop', group: 'Debugger', keys: 'Ctrl+Shift+F5 · Shift+F5', where: 'fixed' },
];
