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
import { importProblems } from './core/importhooks';
import type { FolderProblem } from './core/gamefolder';

const PE_EXT = /\.(exe|dll|asi)$/i;
/** A file over this size is skipped; files are read until this total. */
export const PE_FILE_LIMIT = 400e6, PE_TOTAL_LIMIT = 1.5e9;

// Each file is opened without blocking (a named pipe or device never stalls the read), checked to be a regular file
// on the opened handle, and read only up to its size limit and what is left of the total. The bytes are charged to
// the total before parsing, so files that turn out not to be programs count too.
const OPEN_FLAGS = fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK ?? 0);
type Budget = { left: number };
function readCappedSync(abs: string, budget: Budget): Uint8Array | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(abs, OPEN_FLAGS);
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.size > PE_FILE_LIMIT || st.size > budget.left) return undefined;
    budget.left -= st.size;
    const buf = Buffer.alloc(st.size);
    let got = 0;
    while (got < buf.length) {
      const k = fs.readSync(fd, buf, got, buf.length - got, got);
      if (!k) break;
      got += k;
    }
    return buf.subarray(0, got);
  } catch {
    return undefined;
  } finally {
    // A failed close changes nothing about what was read.
    if (fd !== undefined) try { fs.closeSync(fd); } catch { /* ignore */ }
  }
}
/** `gate` (the background scans): called with the opened file's size before anything is allocated; it waits for room
 *  in the shared in-flight limit for exactly that size, and false skips the file. Only that many bytes are read. */
async function readCapped(abs: string, budget: Budget, gate?: (size: number) => Promise<boolean>): Promise<Uint8Array | undefined> {
  let fh: fs.promises.FileHandle | undefined;
  try {
    fh = await fs.promises.open(abs, OPEN_FLAGS);
    const st = await fh.stat();
    if (!st.isFile() || st.size > PE_FILE_LIMIT || st.size > budget.left) return undefined;
    if (gate && !(await gate(st.size))) return undefined;
    budget.left -= st.size;
    const buf = Buffer.alloc(st.size);
    let got = 0;
    while (got < buf.length) {
      const { bytesRead } = await fh.read(buf, got, buf.length - got, got);
      if (!bytesRead) break;
      got += bytesRead;
    }
    return buf.subarray(0, got);
  } catch {
    return undefined;
  } finally {
    await fh?.close().catch(() => undefined); // a failed close changes nothing about what was read
  }
}
const parseOr = (bytes: Uint8Array | undefined, rel: string): PeFile | undefined => {
  if (!bytes) return undefined;
  try {
    return parsePE(bytes, rel);
  } catch {
    return undefined; // not a program
  }
};

/** Program files under these paths (folders are walked like the game-folder checks do), with paths relative to
 *  the folder given (or the file's own name). A path given directly must be a regular file. */
export function readGameBinaries(paths: string[]): PeFile[] {
  const out: PeFile[] = [];
  const budget: Budget = { left: PE_TOTAL_LIMIT };
  const add = (abs: string, rel: string, size: number) => {
    if (size > PE_FILE_LIMIT || size > budget.left) return;
    const f = parseOr(readCappedSync(abs, budget), rel);
    if (f) out.push(f);
  };
  // Several inputs: each file's name starts with the input it came from, so two folders' Game.exe stay apart.
  const many = paths.length > 1;
  const label = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  for (const p of paths) {
    let st: fs.Stats;
    try {
      st = fs.statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      for (const f of readGameFolder(p).files) if (PE_EXT.test(f.path)) add(path.join(p, f.path), many ? label(p) + '/' + f.path : f.path, f.size);
    } else if (st.isFile() && PE_EXT.test(p)) add(p, many ? label(p) : path.basename(p), st.size);
  }
  return out;
}

/** Bytes of program files held at once by all the background scans together (each file is read whole, then parsed
 *  and dropped): scans of several folders take turns instead of each holding up to its own total. */
export const PE_INFLIGHT_LIMIT = 512e6;
let inflight = 0;
const queued: { size: number; go: () => void }[] = [];
async function reserve(size: number): Promise<() => void> {
  // A file larger than the limit on its own still goes, alone. A queued file is counted in when it is let through.
  if (queued.length || (inflight && inflight + size > PE_INFLIGHT_LIMIT)) await new Promise<void>((go) => queued.push({ size, go }));
  else inflight += size;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    inflight -= size;
    while (queued.length && (!inflight || inflight + queued[0]!.size <= PE_INFLIGHT_LIMIT)) {
      const q = queued.shift()!;
      inflight += q.size;
      q.go();
    }
  };
}

/** The same for an editor: read in the background, cached per folder until it changes (or for 10 minutes). */
const PE_TTL = 600_000;
interface Scan { files: Promise<PeFile[]>; pending: boolean; waiters: Set<() => void> }
/** The current scan per folder, and the last result a current scan settled with. */
const scans = new Map<string, Scan>();
const settled = new Map<string, { at: number; files: PeFile[] }>();
const fresh = (dir: string) => {
  const s = settled.get(dir);
  return !!s && Date.now() - s.at < PE_TTL;
};
const wake = (scan: Scan) => {
  const w = [...scan.waiters];
  scan.waiters.clear();
  for (const f of w) f();
};
export function gameBinaries(dir: string): Promise<PeFile[]> {
  const cur = scans.get(dir);
  if (cur && (cur.pending || fresh(dir))) return cur.files;
  const scan: Scan = { files: Promise.resolve([]), pending: true, waiters: new Set() };
  scans.set(dir, scan);
  scan.files = (async () => {
    const folder = readGameFolder(dir);
    const out: PeFile[] = [];
    const budget: Budget = { left: PE_TOTAL_LIMIT };
    for (const f of folder.files) {
      if (scans.get(dir) !== scan) break; // forgotten (relinked or changed): stop early
      if (!PE_EXT.test(f.path) || f.size > PE_FILE_LIMIT || f.size > budget.left) continue;
      // The reservation is for the size of the file as opened (it may have grown since the folder was listed), and is
      // held until the bytes are parsed. A scan forgotten while it waited for room reads nothing more.
      let release: (() => void) | undefined;
      try {
        const bytes = await readCapped(path.join(dir, f.path), budget, async (size) => {
          release = await reserve(size);
          return scans.get(dir) === scan;
        });
        const pf = parseOr(bytes, f.path);
        if (pf) out.push(pf);
      } finally {
        release?.();
      }
      await new Promise((r) => setImmediate(r)); // let the editor breathe between files
    }
    return out;
  })().then((files) => {
    scan.pending = false;
    // A scan that was forgotten meanwhile neither stores its result nor wakes anyone.
    if (scans.get(dir) === scan) {
      settled.set(dir, { at: Date.now(), files });
      wake(scan);
    }
    return files;
  }, () => {
    // A failed scan: nothing stored, the next check starts a new one; whoever waited is told (they find no result).
    scan.pending = false;
    if (scans.get(dir) === scan) {
      scans.delete(dir);
      wake(scan);
    }
    return [] as PeFile[];
  });
  return scan.files;
}
/** Settled results only (undefined while still reading the first time): for synchronous diagnostics. `ready` runs
 *  once the current scan settles (every caller waiting on it, also when an expired result is being refreshed). */
export function gameBinariesNow(dir: string, ready?: () => void): PeFile[] | undefined {
  if (fresh(dir)) return settled.get(dir)!.files;
  void gameBinaries(dir);
  if (ready) scans.get(dir)?.waiters.add(ready);
  return settled.get(dir)?.files;
}
/** Whether the settled result is current (not one kept while a newer scan runs): fixes come only from a current one. */
export const binariesCurrent = (dir: string) => fresh(dir);
/** The import hints for a handler; while the folder is being read again, without their fixes (the program may have
 *  changed: an old fix could add a setting the new files no longer call for). */
export function importProblemsFor(text: string, dir: string, files: PeFile[]): FolderProblem[] {
  const current = binariesCurrent(dir);
  return importProblems(text, files).map((p) => (current || !p.fix ? p : { ...p, fix: undefined }));
}
export const forgetBinaries = (dir: string) => {
  const old = scans.get(dir);
  scans.delete(dir);
  settled.delete(dir);
  // Whoever waited on the forgotten scan waits on its replacement (started now), so every waiting handler is told.
  if (old?.waiters.size) {
    void gameBinaries(dir);
    const next = scans.get(dir)!;
    for (const w of old.waiters) next.waiters.add(w);
    old.waiters.clear();
  }
};
