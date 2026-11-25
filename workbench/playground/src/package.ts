// Handler packages (.zip / .nc): handler.js at the root, plus whatever else the author ships
// (config files, DLLs, scripts in folders). Opening one keeps those other files, and saving puts
// them back unchanged, with the explicit folder entries Nucleus' installer needs.
import { packageEntries, zipBytes, zipRecords, type ZipRecord } from '@core/zipbytes';

export { sizeOf, type PackageFile } from '@core/pkgcheck';
import type { PackageFile } from '@core/pkgcheck';
export interface Package {
  handler: string;
  handlerName: string;
  /** Every other file, unchanged. */
  files: PackageFile[];
  /** Files this browser couldn't unpack (a compression method it doesn't support). */
  unreadable: string[];
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream !== 'function') return null;
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads a package; null when it has no root .js the page can read. */
export async function readPackage(buf: ArrayBuffer): Promise<Package | null> {
  let records: ZipRecord[];
  try {
    records = zipRecords(new Uint8Array(buf)).filter((r) => r.body); // folder entries are rebuilt on save
  } catch {
    return null;
  }
  const roots = records.filter((e) => !e.name.includes('/') && /\.js$/i.test(e.name));
  const pick = roots.find((e) => e.name.toLowerCase() === 'handler.js') ?? roots[0];
  if (!pick) return null;
  const read = async (e: ZipRecord) => {
    if (e.method === 0) return e.body!.slice();
    if (e.method === 8) return inflate(e.body!);
    return null;
  };
  const handlerBytes = await read(pick);
  if (!handlerBytes) return null;
  const files: PackageFile[] = [];
  const unreadable: string[] = [];
  for (const e of records) {
    if (e === pick) continue;
    const data = await read(e);
    if (data) files.push({ name: e.name, data });
    else unreadable.push(e.name);
  }
  return { handler: new TextDecoder().decode(handlerBytes), handlerName: pick.name, files, unreadable };
}

/** A package with the handler as handler.js and the other files, plus an entry for each folder (core/zipbytes.ts, stored). */
export function buildPackage(handler: string, files: PackageFile[]): Uint8Array {
  const keep = files.filter((f) => f.name.toLowerCase() !== 'handler.js' && !f.remote); // placeholders have no content to save
  return zipBytes(packageEntries(new TextEncoder().encode(handler), keep.map((f) => ({ name: f.name, data: f.data }))));
}

/** A handler in a .zip of several: its name (the file's, without .js), its code and its package files. */
export interface BundleHandler { name: string; handler: string; files: PackageFile[] }
/**
 * Several handlers in one .zip, laid out as Nucleus Co-op's handlers folder holds them: `<Name>.js`, and the files of
 * its package in `<Name>/` (the contents of each top-level folder, as a Hub install merges them; files at a package's
 * root and a Hub package's files that aren't here are left out). Two handlers with one name get "(2)".
 */
export function buildBundle(list: BundleHandler[]): Uint8Array {
  const files: { name: string; data: Uint8Array }[] = [];
  const used = new Set<string>();
  for (const h of list) {
    let name = h.name;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${h.name} (${n})`;
    used.add(name.toLowerCase());
    files.push({ name: `${name}.js`, data: new TextEncoder().encode(h.handler) });
    for (const f of h.files) {
      const parts = f.name.split('/').filter((p) => p && p !== '.' && p !== '..');
      if (parts.length < 2 || f.remote) continue;
      files.push({ name: `${name}/${parts.slice(1).join('/')}`, data: f.data });
    }
  }
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.name.split('/');
    for (let i = 1; i < parts.length; i++) dirs.add(`${parts.slice(0, i).join('/')}/`);
  }
  return zipBytes([...[...dirs].sort().map((name) => ({ name })), ...files]);
}
/** Reads a .zip of several handlers (two or more .js at its root and no handler.js); null when it isn't one. */
export async function readBundle(buf: ArrayBuffer): Promise<BundleHandler[] | null> {
  let records: ZipRecord[];
  try {
    records = zipRecords(new Uint8Array(buf)).filter((r) => r.body);
  } catch {
    return null;
  }
  const roots = records.filter((e) => !e.name.includes('/') && /\.js$/i.test(e.name));
  if (roots.length < 2 || roots.some((e) => e.name.toLowerCase() === 'handler.js')) return null;
  const read = async (e: ZipRecord) => (e.method === 0 ? e.body!.slice() : e.method === 8 ? inflate(e.body!) : null);
  const out: BundleHandler[] = [];
  for (const r of roots) {
    const code = await read(r);
    if (!code) continue;
    const name = r.name.replace(/\.js$/i, '');
    const prefix = `${name.toLowerCase()}/`;
    const files: PackageFile[] = [];
    for (const e of records) {
      if (!e.name.toLowerCase().startsWith(prefix)) continue;
      const data = await read(e);
      if (data) files.push({ name: e.name, data });
    }
    out.push({ name, handler: new TextDecoder().decode(code), files });
  }
  return out.length ? out : null;
}

// --- kept with the draft in this browser, so a reload doesn't lose them
const KEY = 'nucleus-workbench-package-files';
const b64 = (d: Uint8Array) => {
  let s = '';
  for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode(...d.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
/** Saves the files for the current draft; false when they're too big for the browser to keep. */
export function storeFiles(files: PackageFile[], key = KEY): boolean {
  try {
    if (!files.length) return localStorage.removeItem(key), true;
    localStorage.setItem(key, JSON.stringify(files.map((f) => (f.remote ? [f.name, '', f.remote] : [f.name, b64(f.data)]))));
    return true;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {}
    return false;
  }
}
export function storedFiles(key = KEY): PackageFile[] {
  try {
    return (JSON.parse(localStorage.getItem(key) || '[]') as [string, string, PackageFile['remote']?][]).map(([name, d, remote]) => (remote ? { name, data: new Uint8Array(0), remote } : { name, data: unb64(d) }));
  } catch {
    return [];
  }
}

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
