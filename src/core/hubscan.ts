/**
 * What Nucleus reads from a handler when it installs it from the Hub: DownloadPrompt.ExtractHandler, and the same
 * loop in HubWebView (the in-app Hub browser), HandlerScanner and UI_Functions (drag & drop). One copy here, used by
 * the linter (`hub-install-parse`), the simulator (`Game.Folder`) and the package checks (where files end up).
 *
 * Nucleus' loop, on `File.ReadAllLines` (a leading BOM dropped; lines split at \r\n, \n and \r):
 *
 *     if (line.ToLower().StartsWith("game.executablename")) { exeName = line.Substring(first + 1, last - first - 1); found++; }
 *     else if (line.ToLower().StartsWith("game.gamename")) { title = pattern.Replace(<same>, ""); found++; }
 *     if (found == 2) break;
 *
 * So: raw lines, comments and function bodies included; indentation means no match; the text between the first and
 * last `"`; a later match overwrites an earlier one; it stops after two matches (of either kind); a matched line with
 * fewer than two `"` throws (`Substring` with a negative length), which ends the install. The game name loses only
 * / : * ? " < > | (`new Regex("[\\/:*?\"<>|]")`): a backslash stays.
 */
export interface HubScanHit {
  /** The text between the first and last `"`, or null when the line has fewer than two (the install throws). */
  value: string | null;
  /** 0-based line. */
  line: number;
  /** Offset of the line's start in the text as given (a BOM before it counted). */
  offset: number;
  crash: boolean;
}
export interface HubScan {
  ExecutableName?: HubScanHit;
  GameName?: HubScanHit;
  /** 1-based lines that matched, in order (at most two). */
  matched: number[];
}

/** What the Hub install reads from one line (as Nucleus sees it, a BOM already dropped): nothing (undefined) unless
 *  the line starts with `Game.ExecutableName` or `Game.GameName`, any case; then the text between its first and last
 *  `"`, or null when it has fewer than two (the install throws there). */
export function hubLine(line: string): { key: 'ExecutableName' | 'GameName'; value: string | null } | undefined {
  const lower = line.toLowerCase();
  const key = lower.startsWith('game.executablename') ? 'ExecutableName' : lower.startsWith('game.gamename') ? 'GameName' : null;
  if (!key) return undefined;
  const first = line.indexOf('"');
  const last = line.lastIndexOf('"');
  return { key, value: first < 0 || last === first ? null : line.slice(first + 1, last) };
}

/** Whether a tool may turn the line `before` into `after` without changing what a Hub install does with it:
 *  - a line the install reads fine must read exactly the same afterwards;
 *  - a line it doesn't read, or throws on, may stay so, or become a clean read (one value in double quotes, which is
 *    what its author meant: `'My Game'` in double quotes, an indented line moved to the start);
 *  - anything else (a read that picks up a second string, a new throw) is a change for the worse. */
export function hubLineKeeps(before: string, after: string): boolean {
  const a = hubLine(before)?.value;
  const b = hubLine(after)?.value;
  if (typeof a === 'string') return b === a;
  return b === a || (typeof b === 'string' && !b.includes('"'));
}

/** Replays Nucleus' Hub install scan (see above). Stops at a crash, as the install does. */
export function hubScan(text: string): HubScan {
  const result: HubScan = { matched: [] };
  let found = 0;
  let offset = 0;
  const lines = text.split(/\r\n|\n|\r/);
  const ends = text.match(/\r\n|\n|\r/g) ?? [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = i === 0 && raw.startsWith('\uFEFF') ? raw.slice(1) : raw; // ReadAllLines drops the BOM
    const hit = hubLine(line);
    if (hit) {
      const { key } = hit;
      const crash = hit.value === null;
      result[key] = { value: hit.value, line: i, offset, crash };
      result.matched.push(i + 1);
      found++;
      if (crash || found === 2) break;
    }
    offset += raw.length + (ends[i]?.length ?? 0);
  }
  return result;
}

/** Removes what Nucleus removes from the game name before using it as a file and folder name. */
export const cleanGameName = (name: string) => name.replace(/[\/:*?"<>|]/g, '');

/** The name a Hub install gives the handler (`handlers\<name>.js` and `handlers\<name>\`), or undefined when Nucleus
 *  finds no game name line (it then keeps the package's name) or the install throws. A backslash stays. */
export function hubGameName(text: string): string | undefined {
  const s = hubScan(text);
  if (s.ExecutableName?.crash || !s.GameName || s.GameName.crash) return undefined;
  return cleanGameName(s.GameName.value!);
}
