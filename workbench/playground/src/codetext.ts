// Whether inline code is clearly code, shared by the workbench (codehl.ts) and the build (the site's pages).
import { isKeyCombo } from './kbd';

const FILE_NAME = /^[\w$*.%-]*\.(?:js|ts|json|toml|lua|el|ini|cfg|txt|md|xml|ya?ml|html|css|exe|dll|nc|zip|vsix|sh|bat|ps1|log)$/i;
const COMMAND_LINE = /^(?:ncdev|nucleus|node|npm|npx|git|chmod|mkdir|mv|cd|code)\s/;
/** Whether inline code is clearly code (a member path, a call, a literal, an operator), not a plain word in running
 *  text: `Game.Play`, `includes()`, `"-windowed"`, `true` are coloured; `handlers` or `ExecutableName` stay plain. */
export function looksLikeCodeText(s: string): boolean {
  const t = s.trim();
  if (!t || t.length > 400) return false;
  if (isKeyCombo(t)) return false; // a shortcut (`Ctrl+.`): drawn as keys (kbd.ts), not coloured as code
  if (/^[\w$]+$/.test(t)) return /^(true|false|null|undefined|var|function|new|\d[\d.]*)$/.test(t);
  if (/[\\/]/.test(t) && !/[("=]/.test(t)) return false; // a path or a file name
  // A file name (`languages.toml`, `ncdev.exe`, `*.js`) or a command line (`ncdev setup notepad++`) is not handler
  // code: the dot isn't a member and the ++ isn't an operator.
  if (FILE_NAME.test(t) || COMMAND_LINE.test(t)) return false;
  return /[.()=;"'[\]{}+<>!-]/.test(t);
}

