// Reads a Windows program or DLL (PE32 and PE32+): its imports (normal and delay-loaded), its exports, whether it can
// start other programs, and names written in it as text. Pure (no Node, no DOM APIs beyond TextDecoder): shared by
// ncdev, VS Code, `ncdev lsp` and the workbench. Bounds-checked: a damaged file gives fewer results, never a crash.
// Tests: src/test/importhooks.test.ts (MinGW-built fixtures in src/test/fixtures/pe/).

export interface PeImport {
  dll: string;
  fns: { name?: string; ord?: number }[];
  delay: boolean;
}
export interface PeExport {
  ord: number;
  name: string;
  /** "OTHERDLL.Function" when the export forwards to another DLL. */
  fwd: string;
}
export interface PeFile {
  /** Path relative to the folder read, with "/". */
  fileName: string;
  size: number;
  is64: boolean;
  machine: number;
  dll: boolean;
  imports: PeImport[];
  exports: PeExport[];
  exportName: string;
  /** Imports a way to start programs (CreateProcess, ShellExecute, WinExec): a launcher candidate. */
  starts: boolean;
  /** Program names (something.exe) written in the file, lower case: what a launcher starts. Only for programs that start others. */
  mentions: string[];
  /** Names of DLLs it loads while running (found as text) and a few markers such as SDL's controller settings name. */
  rt: string[];
}

export const XINPUT_DLLS = ['xinput1_4.dll', 'xinput1_3.dll', 'xinput1_2.dll', 'xinput1_1.dll', 'xinput9_1_0.dll'];
/** Text looked for in each file: DLLs loaded while running, and SDL's controller-settings variable (SDL built in). */
export const RT_NAMES = [...XINPUT_DLLS, 'dinput8.dll', 'hid.dll', 'SDL_GAMECONTROLLERCONFIG'];
/** Files larger than this are only read for their tables, not searched as text. */
export const TEXT_SCAN_LIMIT = 80e6;

/** Most import, thunk and export records one file may decode in all (normal and delay imports and exports together):
 *  a damaged or hostile file can point its tables at the same data again and again. Real games stay far below it. */
export const PE_WORK_LIMIT = 200_000;

export class NotAProgram extends Error {}

/** The file as text: Latin-1 and UTF-16 (both byte alignments), cached per buffer. */
const TEXT = new WeakMap<Uint8Array, string[]>();
function textViews(bytes: Uint8Array): string[] {
  const hit = TEXT.get(bytes);
  if (hit) return hit;
  const even = bytes.subarray(0, bytes.length - (bytes.length % 2));
  const odd = bytes.subarray(1, 1 + (bytes.length - 1 - ((bytes.length - 1) % 2)));
  const v = [new TextDecoder('latin1').decode(bytes), new TextDecoder('utf-16le').decode(even), new TextDecoder('utf-16le').decode(odd)];
  TEXT.set(bytes, v);
  return v;
}
export function runtimeNames(bytes: Uint8Array): string[] {
  const views = textViews(bytes).map((t) => t.toLowerCase());
  return RT_NAMES.filter((name) => views.some((t) => t.includes(name.toLowerCase())));
}
export function exeMentions(bytes: Uint8Array): string[] {
  const found = new Set<string>();
  const re = /([A-Za-z0-9_.()\-][A-Za-z0-9_ .()\-]{0,59})\.exe(?![A-Za-z0-9])/gi;
  for (const t of textViews(bytes)) {
    for (const m of t.matchAll(re)) {
      found.add(m[1].trim().toLowerCase() + '.exe');
      if (found.size > 300) break;
    }
  }
  return [...found];
}

/** Reads a PE file. Throws NotAProgram when it isn't one. */
export function parsePE(input: Uint8Array | ArrayBuffer, fileName: string): PeFile {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = bytes.byteLength;
  const u16 = (o: number) => (o >= 0 && o + 2 <= n ? dv.getUint16(o, true) : 0);
  const u32 = (o: number) => (o >= 0 && o + 4 <= n ? dv.getUint32(o, true) : 0);
  const u64 = (o: number) => (o >= 0 && o + 8 <= n ? dv.getBigUint64(o, true) : 0n);
  if (n < 64 || u16(0) !== 0x5a4d) throw new NotAProgram('not a Windows program or DLL');
  const pe = u32(0x3c);
  if (pe + 24 > n || u32(pe) !== 0x4550) throw new NotAProgram('not a Windows program or DLL');
  const machine = u16(pe + 4), nsec = u16(pe + 6), optSize = u16(pe + 20), chars = u16(pe + 22), opt = pe + 24;
  const magic = u16(opt);
  if (magic !== 0x10b && magic !== 0x20b) throw new NotAProgram('not a Windows program or DLL');
  const is64 = magic === 0x20b;
  // The fixed part of the optional header (up to NumberOfRvaAndSizes) must fit in its declared size and the file.
  const fixed = is64 ? 112 : 96;
  if (optSize < fixed || opt + fixed > n) throw new NotAProgram('not a Windows program or DLL');
  const optEnd = Math.min(opt + optSize, n);
  const imageBase = is64 ? Number(u64(opt + 24)) : u32(opt + 28);
  const nDD = u32(opt + (is64 ? 108 : 92)), ddOff = opt + (is64 ? 112 : 96);
  // A directory entry counts only inside the declared optional header (and the file).
  const dd = (i: number) => (i < nDD && ddOff + i * 8 + 8 <= optEnd ? { rva: u32(ddOff + i * 8), size: u32(ddOff + i * 8 + 4) } : { rva: 0, size: 0 });
  const headers = Math.min(u32(opt + 60), n);
  const secs: { va: number; vs: number; raw: number; rs: number }[] = [];
  for (let i = 0, s = opt + optSize; i < Math.min(nsec, 96); i++, s += 40) secs.push({ va: u32(s + 12), vs: u32(s + 8), raw: u32(s + 20), rs: u32(s + 16) });
  // An RVA to its file offset and the end of the file-backed bytes it is in: only the bytes a section has in the file
  // (not its zero-filled tail), or the headers. Anything else is -1.
  const at = (rva: number): [number, number] => {
    for (const s of secs) {
      if (rva >= s.va && rva < s.va + Math.max(s.vs, s.rs)) {
        if (rva - s.va >= s.rs) return [-1, -1];
        const o = rva - s.va + s.raw, end = Math.min(s.raw + s.rs, n);
        return o < end ? [o, end] : [-1, -1];
      }
    }
    return rva < headers ? [rva, headers] : [-1, -1];
  };
  const off = (rva: number) => at(rva)[0];
  // One budget for every record decoded from this file.
  let work = 0;
  const spend = () => ++work <= PE_WORK_LIMIT;
  const str = (rva: number) => strEnd(rva)[0];
  /** A string and whether its terminating zero was found within the file-backed bytes (and before `limit`, an RVA). */
  const strEnd = (rva: number, limit = Infinity): [string, boolean] => {
    let [o, end] = at(rva), out = '';
    if (o < 0) return ['', false];
    if (limit !== Infinity) end = Math.min(end, o + Math.max(0, limit - rva));
    while (o < end && out.length < 300) {
      const c = bytes[o++];
      if (!c) return [out, true];
      out += String.fromCharCode(c);
    }
    return [out, false];
  };
  // A whole record of `len` bytes at an RVA inside one directory: in the file-backed bytes and the directory's range
  // (a directory with no size given: the bytes only). Its file offset, or -1.
  const rec = (rva: number, len: number, dir: { rva: number; size: number }) => {
    const [o, end] = at(rva);
    if (o < 0 || o + len > end) return -1;
    if (dir.size && (rva < dir.rva || rva + len > dir.rva + dir.size)) return -1;
    return o;
  };
  const step = is64 ? 8 : 4;
  const ordFlag = is64 ? 1n << 63n : 1n << 31n;
  const thunks = (rva: number) => {
    const out: PeImport['fns'] = [];
    let [o, end] = at(rva);
    if (o < 0) return out;
    for (let k = 0; k < 20000 && o + step <= end && spend(); k++, o += step) {
      const v = is64 ? u64(o) : BigInt(u32(o));
      if (v === 0n) break;
      out.push(v & ordFlag ? { ord: Number(v & 0xffffn) } : { name: str(Number(v & 0x7fffffffn) + 2) });
    }
    return out;
  };
  const imports: PeImport[] = [];
  const id = dd(1);
  if (id.rva) {
    for (let k = 0, o: number; k < 2000 && (o = rec(id.rva + k * 20, 20, id)) >= 0 && spend(); k++) {
      const oft = u32(o), nameRva = u32(o + 12), ft = u32(o + 16);
      if (!oft && !nameRva && !ft) break;
      imports.push({ dll: str(nameRva), fns: thunks(oft || ft), delay: false });
    }
  }
  const dl = dd(13);
  if (dl.rva) {
    for (let k = 0, o: number; k < 2000 && (o = rec(dl.rva + k * 32, 32, dl)) >= 0 && spend(); k++) {
      const attr = u32(o), nameP = u32(o + 4), intP = u32(o + 16);
      if (!nameP && !intP) break;
      const fix = (p: number) => (attr & 1 ? p : p - imageBase); // old-style delay descriptors hold VAs
      imports.push({ dll: str(fix(nameP)), fns: thunks(fix(intP)), delay: true });
    }
  }
  const exports: PeExport[] = [];
  let exportName = '';
  const ed = dd(0);
  if (ed.rva) {
    const o = off(ed.rva);
    if (o >= 0) {
      exportName = str(u32(o + 12));
      const base = u32(o + 16), nf = u32(o + 20), nn = u32(o + 24), af = u32(o + 28), an = u32(o + 32), ao = u32(o + 36);
      // Several names can share one address-table entry: keep each.
      const named = new Map<number, string[]>();
      for (let i = 0; i < Math.min(nn, 50000) && spend(); i++) {
        const nmo = off(an + i * 4), oro = off(ao + i * 2);
        if (nmo < 0 || oro < 0) break;
        const k = u16(oro);
        const names = named.get(k);
        if (names) names.push(str(u32(nmo)));
        else named.set(k, [str(u32(nmo))]);
      }
      for (let i = 0; i < Math.min(nf, 50000) && spend(); i++) {
        const fo = off(af + i * 4);
        if (fo < 0) break;
        const r = u32(fo);
        if (!r) continue;
        // A forwarder ("DLL.Function") lies inside the export directory; its whole string has to, too.
        const [f, whole] = r >= ed.rva && r < ed.rva + ed.size ? strEnd(r, ed.rva + ed.size) : ['', false];
        const fwd = whole ? f : '';
        for (const name of named.get(i) ?? ['']) exports.push({ ord: base + i, name, fwd });
      }
    }
  }
  const dll = !!(chars & 0x2000);
  const starts = imports.some((im) => im.fns.some((x) => /^(CreateProcess(As\w+)?[AW]?|ShellExecute(Ex)?[AW]|WinExec)$/.test(x.name || '')));
  const scan = n < TEXT_SCAN_LIMIT;
  // A DLL named in the import table is an import, not a load while running.
  const imported = new Set(imports.map((im) => im.dll.toLowerCase()));
  const rt = scan ? runtimeNames(bytes).filter((x) => !imported.has(x.toLowerCase())) : [];
  return { fileName, size: n, is64, machine, dll, imports, exports, exportName, starts, mentions: !dll && starts && scan ? exeMentions(bytes) : [], rt };
}
