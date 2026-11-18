// Reading a game's install folder from disk (names and sizes only), for the game-folder checks in core/gamefolder.ts.
// No vscode import: used by the extension (src/gamefolders.ts) and `nucleus lsp`.
import fs from 'node:fs';
import path from 'node:path';
import { MAX_DEPTH, MAX_ENTRIES, SKIP_DIRS, type GameFolder } from './core/gamefolder';

/** The folder's files and folders (relative, with "/"), breadth first, within the same limits as the workbench. */
export function readGameFolder(dir: string): GameFolder {
  const files: GameFolder['files'] = [];
  const dirs: string[] = [];
  let truncated = false;
  let count = 0;
  const queue: { abs: string; rel: string; depth: number }[] = [{ abs: dir, rel: '', depth: 0 }];
  while (queue.length) {
    const { abs, rel, depth } = queue.shift()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (++count > MAX_ENTRIES) {
        truncated = true;
        break;
      }
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name.toLowerCase())) continue;
        dirs.push(p);
        if (depth + 1 < MAX_DEPTH) queue.push({ abs: path.join(abs, e.name), rel: p, depth: depth + 1 });
        else truncated = true;
      } else if (e.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(path.join(abs, e.name)).size;
        } catch {
          /* unreadable: size 0 */
        }
        files.push({ path: p, size });
      }
    }
    if (count > MAX_ENTRIES) break;
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  dirs.sort((a, b) => a.localeCompare(b));
  return { name: path.basename(dir), files, dirs, truncated: truncated || undefined };
}

const cache = new Map<string, { at: number; folder: GameFolder }>();
export function folderAt(dir: string): GameFolder | undefined {
  const hit = cache.get(dir);
  if (hit && Date.now() - hit.at < 60_000) return hit.folder;
  if (!fs.existsSync(dir)) return undefined;
  const folder = readGameFolder(dir);
  cache.set(dir, { at: Date.now(), folder });
  return folder;
}


/** Read the folder again next time (it was just linked, or changed). */
export const forgetFolder = (dir: string) => cache.delete(dir);

// ---------------------------------------------------------------------------------------------------------------
// The game's program files (.exe, .dll, .asi), read for the import hints (core/pe.ts, core/importhooks.ts). Only
// the files' tables and names written in them are used; nothing is run or sent anywhere.
import { parsePE, type PeFile } from './core/pe';

const PE_EXT = /\.(exe|dll|asi)$/i;
/** A file over this size is skipped; files are read until this total. */
export const PE_FILE_LIMIT = 400e6, PE_TOTAL_LIMIT = 1.5e9;

/** Program files under these paths (folders are walked like the game-folder checks do), with paths relative to
 *  the folder given (or the file's own name). */
export function readGameBinaries(paths: string[]): PeFile[] {
  const out: PeFile[] = [];
  let total = 0;
  const add = (abs: string, rel: string, size: number) => {
    if (size > PE_FILE_LIMIT || total + size > PE_TOTAL_LIMIT) return;
    try {
      out.push(parsePE(fs.readFileSync(abs), rel));
      total += size;
    } catch {
      /* not a program, or unreadable */
    }
  };
  for (const p of paths) {
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const f of readGameFolder(p).files) if (PE_EXT.test(f.path)) add(path.join(p, f.path), f.path, f.size);
    } else if (PE_EXT.test(p)) add(p, path.basename(p), st.size);
  }
  return out;
}

/** The same for an editor: read in the background, cached per folder until it changes (or for 10 minutes). */
const peCache = new Map<string, { at: number; files: Promise<PeFile[]> }>();
export function gameBinaries(dir: string): Promise<PeFile[]> {
  const hit = peCache.get(dir);
  if (hit && Date.now() - hit.at < 600_000) return hit.files;
  const files = (async () => {
    const folder = readGameFolder(dir);
    const out: PeFile[] = [];
    let total = 0;
    for (const f of folder.files) {
      if (!PE_EXT.test(f.path) || f.size > PE_FILE_LIMIT || total + f.size > PE_TOTAL_LIMIT) continue;
      try {
        out.push(parsePE(await fs.promises.readFile(path.join(dir, f.path)), f.path));
        total += f.size;
      } catch {
        /* not a program, or unreadable */
      }
      await new Promise((r) => setImmediate(r)); // let the editor breathe between files
    }
    return out;
  })();
  peCache.set(dir, { at: Date.now(), files });
  return files;
}
/** Settled results only (undefined while still reading): for synchronous diagnostics. */
const peDone = new Map<string, PeFile[]>();
export function gameBinariesNow(dir: string, ready?: () => void): PeFile[] | undefined {
  if (peDone.has(dir) && Date.now() - (peCache.get(dir)?.at ?? 0) < 600_000) return peDone.get(dir);
  void gameBinaries(dir).then((files) => {
    const fresh = !peDone.has(dir);
    peDone.set(dir, files);
    if (fresh) ready?.();
  });
  return peDone.get(dir);
}
export const forgetBinaries = (dir: string) => {
  peCache.delete(dir);
  peDone.delete(dir);
};
