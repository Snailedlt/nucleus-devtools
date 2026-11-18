// What a game's program files say about the hooks and options a Nucleus Co-op handler likely needs.
// Which Proto Input hook covers which Windows function: Proto Input's source (ProtoInputHooks/*.cpp, InstallNamedHook);
// what each hook does: checked in that source and Nucleus' (ProtoInputLauncher.cs, SDL2Dll.cs); how often working Hub
// handlers turn each hook on: the verified Hub handlers that use Proto Input, options and runtime ProtoInput.InstallHook
// calls, counted 2026-11-18. Compared with 35 games' Hub handlers (splitscreenme-vscode#39).
// Pure (no Node, no DOM): shared by ncdev, VS Code, `ncdev lsp` and the workbench. Tests: src/test/importhooks.test.ts.
import { XINPUT_DLLS, type PeFile } from './pe';

export interface Rule {
  id: string;
  area: string;
  title: string;
  why: string;
  /** Matches an imported DLL by name. */
  dll?: RegExp;
  /** Matches imported functions by name. */
  fns?: string[];
  /** DLL names found as text (loaded while running). */
  rt?: string[];
  /** The Proto Input options it suggests, or per function. */
  opts?: string[] | Record<string, string>;
  /** Lines it suggests instead of Proto Input options. */
  code?: string[];
  /** Lines added before the options. */
  pre?: string[];
  /** Controllers group (asked: does the handler want controllers?). */
  ctl?: true;
  /** Several keyboards and mice group. */
  kbm?: true;
  /** In the keyboards-and-mice group even when the game doesn't import it (Proto Input needs it itself). */
  kbmAlways?: true;
  /** Only if the game reads keys or the cursor directly. */
  detail?: true;
  /** Only if you see the problem. */
  maybe?: true;
  /** Every game does it. */
  common?: true;
  /** Only the game's own files count, not libraries. */
  ownCode?: true;
  sdl?: true;
  sdlStatic?: true;
}

/** Verified Hub handlers that use Proto Input (567) and how many turn each hook on (as an option or at runtime), 2026-11-18. */
export const HUB_SHARES: Record<string, number> = { n: 567, MessageFilterHook: 510, RegisterRawInputHook: 503, GetRawInputDataHook: 500, GetCursorPosHook: 495, SetCursorPosHook: 495, GetAsyncKeyStateHook: 487, GetKeyStateHook: 486, GetKeyboardStateHook: 486, FocusHooks: 460, CursorVisibilityHook: 455, ClipCursorHook: 411, XinputHook: 246, SetWindowPosHook: 82, SetWindowStyleHook: 73, FindWindowHook: 13, RenameHandlesHook: 6, DinputDeviceHook: 4, AdjustWindowRectHook: 2, MoveWindowHook: 1, GetCursorInfoHook: 0, SetWindowsHookHook: 0, BlockRawInputHook: 0, CreateSingleHIDHook: 0 };
export const hubShare = (opt: string): number | undefined => (HUB_SHARES[opt] == null ? undefined : Math.round((HUB_SHARES[opt]! / HUB_SHARES.n!) * 100));

/** An ES5 string literal for any text (a file name from the game's folder can hold quotes or line breaks). */
export const jsString = (s: string): string =>
  '"' + s.replace(/[\\"]/g, (c) => '\\' + c).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '"';
/** Text safe inside a `//` comment (no line breaks). */
const commentText = (s: string): string => s.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ');

export const LIB = /^(sdl\d?(_\w+)?|openal32|soft_oal|libcurl.*|zlib.*|libpng.*|libjpeg.*|libvorbis.*|ogg|libogg.*|libsqlite.*|sqlite3|libfreetype.*|freetype.*|libintl.*|libiconv.*|libstdc\+\+.*|libgcc.*|libwinpthread.*|libc\+\+|libunwind|libzstd|libleveldb|libclang_rt.*|libfluidsynth.*|libgme|libopenmpt|exchndl|mgwhelp|steam_api(64)?|fmod.*|bink.*|d3dcompiler.*|vcruntime.*|msvcp.*|ucrtbase|api-ms-.*|discord.*|galaxy(64)?|eossdk.*|nvngx.*|amd_.*|libcef|chrome_elf|libegl|libglesv2|crashrpt.*|mono.*|openvr_api|physx.*|xaudio.*|x3daudio.*|libssl.*|libcrypto.*|libeay32|ssleay32|glew32|glfw3|avcodec.*|avformat.*|avutil.*|swscale.*|swresample.*)\.dll$/i;
export const NOT_GAME_EXE = /(ed\.exe$|^ucc|ded|server|crash|setup|unins|redist|launcher|helper|update|report|install|config|editor|tools?\b|benchmark|vc_?redist|dxsetup|uninst)/i;

export const RULES: Rule[] = [
  { id: 'xinput', ctl: true, area: 'Controllers', title: 'Reads controllers with XInput', dll: /^xinput/i, rt: XINPUT_DLLS, opts: ['XinputHook'],
    why: 'Each copy would read the same controllers. Proto Input’s XInput hook gives each player the controller picked in Nucleus (it hooks xinput1_1 to 1_4 and 9_1_0, and can use OpenXinput for more than 4). Nucleus’ own route instead: Game.Hook.XInputEnabled with its x360ce-based files.' },
  { id: 'sdl', ctl: true, area: 'Controllers', title: 'Uses SDL2 for controllers', sdl: true, code: ['Game.Hook.SDL2Enabled = true;'],
    why: 'Nucleus’ SDL2 setting copies its own SDL2.dll into each copy of the game and tells it which controller is that player’s (SDL2.ini). SDL also loads XInput while running, so the XInput hook is the other route.' },
  { id: 'sdlstatic', ctl: true, maybe: true, area: 'Controllers', title: 'Has SDL built into the program', sdlStatic: true,
    why: 'Nucleus’ SDL2 setting works by replacing SDL2.dll, and this game has no SDL2.dll to replace, so that setting won’t pick controllers here. Use the XInput hook (SDL loads XInput while running).' },
  { id: 'dinput', ctl: true, maybe: true, area: 'Controllers', title: 'Reads controllers with DirectInput', dll: /^dinput8?\.dll$/i, fns: ['DirectInput8Create', 'DirectInputCreateA', 'DirectInputCreateW', 'DirectInputCreateEx'], opts: ['DinputDeviceHook'],
    why: 'This hook gives each copy only the DirectInput controller picked in Nucleus. Many games load DirectInput just for keyboard and mouse, so only turn it on if controllers are read through DirectInput (few Hub handlers need it).' },
  { id: 'hid', ctl: true, area: 'Controllers', title: 'Opens controllers directly (HID)', dll: /^hid\.dll$/i, opts: ['CreateSingleHIDHook'], maybe: true,
    why: 'The game talks to controllers as raw HID devices. This hook lets each copy open only the device picked in Nucleus. Usually needs startup injection.' },
  { id: 'focus', area: 'Focus', title: 'Checks whether its window is in front', fns: ['GetForegroundWindow', 'WindowFromPoint', 'GetActiveWindow', 'IsWindowEnabled', 'GetFocus', 'GetCapture', 'SetCapture', 'ReleaseCapture', 'SetActiveWindow', 'SetFocus', 'SetForegroundWindow'], opts: ['FocusHooks'],
    why: 'Only one window can be in front, so the other copies would pause or ignore input. These hooks make every copy think it has focus. (Without Proto Input: Game.Hook.ForceFocus or Game.HookFocus.)' },
  { id: 'clip', area: 'Mouse cursor', title: 'Locks the cursor inside its window', fns: ['ClipCursor', 'GetClipCursor'], opts: ['ClipCursorHook'], why: 'The game’s ClipCursor calls are kept as a clip for the player’s fake cursor instead of trapping the real cursor in one window.' },
  { id: 'cvis', kbm: true, detail: true, area: 'Mouse cursor', title: 'Shows, hides or changes the cursor', fns: ['ShowCursor', 'SetCursor', 'SetSystemCursor'], opts: ['CursorVisibilityHook'], why: 'Shows or hides the player’s fake cursor instead of the real one.' },
  { id: 'cpos', kbm: true, detail: true, area: 'Mouse cursor', title: 'Reads the cursor position', fns: ['GetCursorPos'], opts: ['GetCursorPosHook'], why: 'Answers with the player’s own (fake) cursor position, which the raw input hook keeps up to date. Without that hook the cursor seems frozen.' },
  { id: 'cset', kbm: true, detail: true, area: 'Mouse cursor', title: 'Moves the cursor', fns: ['SetCursorPos'], opts: ['SetCursorPosHook'], why: 'Many games centre the cursor every frame (mouse look). This moves the player’s fake cursor instead of the real one.' },
  { id: 'keys', kbm: true, detail: true, area: 'Keyboard', title: 'Checks keys directly', fns: ['GetKeyState', 'GetAsyncKeyState', 'GetKeyboardState'], opts: ['GetKeyStateHook', 'GetAsyncKeyStateHook', 'GetKeyboardStateHook'],
    why: 'Each answers from the player’s own keyboard, filled by the raw input hook. Turn on all three together; without the raw input hook the game sees no key pressed at all.' },
  { id: 'raw', kbm: true, kbmAlways: true, area: 'Keyboard and mouse', title: 'Several keyboards and mice', fns: ['RegisterRawInputDevices', 'GetRawInputBuffer'], opts: ['RegisterRawInputHook'], pre: ['Game.SupportsMultipleKeyboardsAndMice = true;'],
    why: 'Proto Input only reads each player’s own keyboard and mouse when this hook is on: installing it registers Proto Input’s raw input window and unsubscribes the game (RegisterRawInputHook.cpp). From that it sends each player’s input to their window as messages (the Send…Messages options), and the cursor and key hooks below answer from it.' },
  { id: 'rawdata', kbm: true, detail: true, area: 'Keyboard and mouse', title: 'Reads raw input data', fns: ['GetRawInputData'], opts: ['GetRawInputDataHook'],
    why: 'For games that read raw input themselves: Proto Input forwards each player’s raw input to the game’s window, and this hook lets the game read it. Needs the raw input hook above.' },
  { id: 'msg', area: 'Messages', title: 'Reads window messages', fns: ['GetMessageA', 'GetMessageW', 'PeekMessageA', 'PeekMessageW'], opts: ['MessageFilterHook'], common: true,
    why: 'Every game does. The message filter hook is what makes the filters and BlockedMessages work, which is why most handlers turn it on.' },
  { id: 'wpos', area: 'Window', title: 'Moves or resizes its own window', fns: ['SetWindowPos', 'MoveWindow', 'AdjustWindowRect', 'AdjustWindowRectEx'], maybe: true,
    opts: { SetWindowPos: 'SetWindowPosHook', MoveWindow: 'MoveWindowHook', AdjustWindowRect: 'AdjustWindowRectHook', AdjustWindowRectEx: 'AdjustWindowRectHook' }, why: 'If a window jumps or changes size after Nucleus placed it.' },
  { id: 'wstyle', area: 'Window', title: 'Changes its window style', fns: ['SetWindowLongA', 'SetWindowLongW', 'SetWindowLongPtrA', 'SetWindowLongPtrW'], opts: ['SetWindowStyleHook'], maybe: true,
    why: 'If the title bar comes back after Nucleus removed it.' },
  { id: 'cinfo', area: 'Mouse cursor', title: 'Asks about the cursor (GetCursorInfo)', fns: ['GetCursorInfo'], opts: ['GetCursorInfoHook'], maybe: true, why: 'Answers with the fake cursor’s state.' },
  { id: 'find', area: 'Running more than once', title: 'Looks for other windows', fns: ['FindWindowA', 'FindWindowW', 'FindWindowExA', 'FindWindowExW', 'EnumWindows'], opts: ['FindWindowHook'], maybe: true, ownCode: true,
    why: 'A common way to refuse a second copy (“already running”). This hook hides the other windows. Usually needs startup injection.' },
  { id: 'mutex', area: 'Running more than once', title: 'Creates named mutexes', fns: ['CreateMutexA', 'CreateMutexW', 'CreateMutexExA', 'CreateMutexExW', 'OpenMutexA', 'OpenMutexW'], maybe: true, ownCode: true,
    code: ['// Find the name first (Process Explorer)', 'Game.KillMutex = ["<name of the mutex>"];'],
    why: 'The other common “already running” check. If a second copy won’t start, find the name (Process Explorer’s handle list) and close it with Game.KillMutex, or give each copy its own with Proto Input’s rename hook.' },
  { id: 'wshook', area: 'Keyboard and mouse', title: 'Installs Windows input hooks', fns: ['SetWindowsHookExA', 'SetWindowsHookExW'], opts: ['SetWindowsHookHook'], maybe: true, why: 'Low-level keyboard or mouse hooks see every device; this hook filters them per player.' },
  { id: 'rawblock', area: 'Keyboard and mouse', title: 'Lists the input devices', fns: ['GetRawInputDeviceList', 'GetRegisteredRawInputDevices'], opts: ['BlockRawInputHook'], maybe: true, why: 'If the game reacts to the devices it finds, this hook hides them. Usually needs startup injection.' },
];

const RUNTIME = ['GetProcAddress', 'LoadLibraryA', 'LoadLibraryW', 'LoadLibraryExA', 'LoadLibraryExW'];
const base = (p: string) => p.slice(Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')) + 1);
const dirOf = (p: string) => p.split(/[\\/]/).slice(0, -1).join('/');

export type Role = 'main' | 'launcher' | 'game' | 'lib' | 'other';
export interface Hit { file: string; dll: string; fn: string; how: 'imports' | 'loads' | 'file' | 'sdlstatic' | 'mentions' }
export interface Finding { rule: Rule; hits: Hit[]; opts: string[]; lines: string[] }
export interface Analysis {
  main?: PeFile;
  /** Programs that start the game, outermost first. */
  launchers: PeFile[];
  roles: Map<PeFile, Role>;
  found: Finding[];
  /** The files look up functions while running (GetProcAddress): those don't show as imports. */
  runtime: boolean;
}

/** Every program a name can point at: a path (relative to the folder, "/" or "\\") matches that path, or the end of
 *  one; a bare name matches by file name. Case-insensitive, like Windows. An exact path match is the only one. */
export function findExes(exes: PeFile[], name: string): PeFile[] {
  const given = name.replace(/\\/g, '/').toLowerCase();
  const want = given.replace(/^\.\//, '');
  const rel = (f: PeFile) => f.fileName.replace(/\\/g, '/').toLowerCase();
  // A bare name: every program of that name (a root Game.exe and bin/Game.exe are ambiguous; give the path then).
  if (!given.includes('/')) return exes.filter((f) => base(f.fileName).toLowerCase() === want);
  // An explicit path (`./Game.exe` included) first: several input folders label their files by input.
  const exact = exes.filter((f) => rel(f) === given || rel(f) === want);
  if (exact.length) return exact.slice(0, 1);
  if (given !== want) return [];
  return exes.filter((f) => rel(f).endsWith('/' + want));
}
/** The program a name points at, or undefined when none or several match (give the path then: `findExes` lists them). */
export function findExe(exes: PeFile[], name: string): PeFile | undefined {
  const all = findExes(exes, name);
  return all.length === 1 ? all[0] : undefined;
}

/** Which program is the game (following launchers), which DLLs are its own and which are libraries. */
function roles(files: PeFile[], mainName?: string | PeFile) {
  const exes = files.filter((f) => !f.dll);
  const bn = (f: PeFile) => base(f.fileName).toLowerCase();
  const main = (typeof mainName === 'string' ? findExe(exes, mainName) : mainName && exes.includes(mainName) ? mainName : undefined)
    || exes.filter((f) => !NOT_GAME_EXE.test(base(f.fileName))).sort((a, b) => b.size - a.size)[0] || exes[0];
  // A launcher: a program that starts another program of the folder by name. The game is the one it starts.
  const names = (f: PeFile, g: PeFile) => f.mentions.some((x) => x === bn(g) || x.endsWith(' ' + bn(g)) || x.endsWith('\\' + bn(g)));
  const startsWhat = (f: PeFile) => exes.filter((g) => g !== f && names(f, g) && !names(g, f));
  let game = main;
  const launchers: PeFile[] = [];
  for (let k = 0; k < 3 && game; k++) {
    const next = startsWhat(game);
    if (!next.length) break;
    launchers.push(game);
    game = next.sort((a, b) => b.size - a.size)[0];
  }
  // And the other way: programs that start the one picked (the game can be larger than its launcher).
  for (let k = 0, head = launchers[0] ?? game; k < 3 && head; k++) {
    const by = exes.find((f) => f !== game && !launchers.includes(f) && startsWhat(f).includes(head!));
    if (!by) break;
    launchers.unshift(by);
    head = by;
  }
  const role = new Map<PeFile, Role>();
  for (const f of files) role.set(f, f === game ? 'main' : launchers.includes(f) ? 'launcher' : !f.dll ? 'other' : LIB.test(base(f.fileName)) ? 'lib' : 'game');
  return { main: game, launchers, role };
}

/** Where Nucleus' copy of the game starts (GenericGameHandler: rootFolder, which Instance<i> mirrors): the .exe's folder,
 *  minus Game.BinariesFolder at its end when the handler sets one. Folders relative to the scanned folder, "/"-separated. */
function instanceRoot(exeDir: string, binariesFolder?: string): string {
  const bin = (binariesFolder ?? '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!bin) return exeDir;
  const dir = exeDir.toLowerCase();
  if (dir === bin) return '';
  return dir.endsWith('/' + bin) ? exeDir.slice(0, exeDir.length - bin.length - 1) : exeDir;
}

/** The analysis. `main` picks the game's program (a name or path for `findExe`, or the file itself); `binariesFolder` is
 *  the handler's Game.BinariesFolder, for paths relative to the copy's root (Game.SDLPaths). */
export function analyse(files: PeFile[], mainName?: string | PeFile, where: { binariesFolder?: string } = {}): Analysis {
  const { main, launchers, role } = roles(files, mainName);
  // A DLL of the other bitness can't load into the game, so it's no evidence for its hooks (still listed).
  const use = files.filter((f) => role.get(f) !== 'other' && role.get(f) !== 'launcher' && !(f.dll && main && f.is64 !== main.is64));
  const sdl = use.find((f) => /^sdl2\.dll$/i.test(base(f.fileName))) ?? (use.some((f) => f.imports.some((im) => /^sdl2\.dll$/i.test(im.dll))) ? ({ fileName: 'SDL2.dll (imported)' } as PeFile) : undefined);
  const sdlStatic = sdl ? undefined : use.find((f) => !/^sdl/i.test(base(f.fileName)) && f.rt.includes('SDL_GAMECONTROLLERCONFIG'));
  const found: Finding[] = [];
  for (const r of RULES) {
    const hits: Hit[] = [];
    for (const f of use) {
      if (r.ownCode && role.get(f) === 'lib') continue;
      for (const im of f.imports) {
        if (r.dll && r.dll.test(im.dll)) {
          hits.push({ file: f.fileName, dll: im.dll, fn: im.fns.map((x) => x.name || '#' + x.ord).slice(0, 3).join(', '), how: 'imports' });
          continue;
        }
        if (r.fns) for (const x of im.fns) if (x.name && r.fns.includes(x.name)) hits.push({ file: f.fileName, dll: im.dll, fn: x.name, how: 'imports' });
      }
      if (r.rt) {
        const loaded = f.rt.filter((x) => r.rt!.includes(x) && /\.dll$/i.test(x));
        if (loaded.length) hits.push({ file: f.fileName, dll: loaded.join(', '), fn: 'loads', how: 'loads' });
      }
    }
    if (r.sdl && sdl) hits.push({ file: sdl.fileName, dll: 'SDL', fn: base(sdl.fileName), how: 'file' });
    if (r.sdlStatic && sdlStatic) hits.push({ file: sdlStatic.fileName, dll: 'SDL', fn: 'SDL built into ' + base(sdlStatic.fileName), how: 'sdlstatic' });
    if (!hits.length && !r.kbmAlways) continue;
    const opts = Array.isArray(r.opts) ? r.opts : r.opts ? [...new Set(hits.map((h) => (r.opts as Record<string, string>)[h.fn]).filter(Boolean))] : [];
    let lines = r.code ?? [...(r.pre ?? []), ...opts.map((o) => `Game.ProtoInput.${o} = true;`)];
    // SDL2.dll in another folder than the .exe: Nucleus copies its SDL2.dll into each Game.SDLPaths folder (SDL2Dll.cs),
    // and only there.
    if (r.id === 'sdl' && sdl?.size && main && dirOf(sdl.fileName).toLowerCase() !== dirOf(main.fileName).toLowerCase()) {
      // Each path is relative to the instance's root (SDL2Dll.cs: Instance<i>\<path>), which mirrors Nucleus' rootFolder:
      // the .exe's folder, or above it by Game.BinariesFolder. An SDL2.dll outside that root can't be named: no line.
      const root = instanceRoot(dirOf(main.fileName), where.binariesFolder), dir = dirOf(sdl.fileName);
      const rel = !root ? dir : dir.toLowerCase().startsWith(root.toLowerCase() + '/') ? dir.slice(root.length + 1) : undefined;
      if (rel) lines = [...lines, `Game.SDLPaths = [${jsString(rel.replace(/\//g, '\\'))}];`];
    }
    found.push({ rule: r, hits, opts, lines });
  }
  if (launchers.length && main) {
    const L = base(launchers[launchers.length - 1]!.fileName), G = base(main.fileName);
    found.unshift({
      rule: { id: 'launcher', area: 'Starting the game', title: `${L} is a launcher: it starts ${G}`, why: `The hooks have to be in ${G}, the program that runs the game. Either start ${G} directly (if it runs without its launcher), or let Nucleus start the launcher (Game.LauncherExe) and pick up ${G}: then inject Proto Input at runtime, because startup injection goes into the program Nucleus starts (GenericGameHandler: exePath is the launcher).` },
      hits: [{ file: launchers[launchers.length - 1]!.fileName, dll: G, fn: G, how: 'mentions' }], opts: [],
      lines: [`Game.ExecutableName = ${jsString(G)};`, `// If ${commentText(G)} needs its launcher:`, `// Game.LauncherExe = ${commentText(jsString(L))};`, '// Game.ProtoInput.InjectRuntime_EasyHookMethod = true;'],
    });
  }
  const runtime = use.some((f) => f.imports.some((im) => im.fns.some((x) => x.name && RUNTIME.includes(x.name))));
  return { main, launchers, roles: role, found, runtime };
}

// ---------------------------------------------------------------------------------------------------------------
// What a handler already has, and the hints for what it lacks.

const ID2OPT: Record<string, string> = { FocusHooksHookID: 'FocusHooks', CursorVisibilityStateHookID: 'CursorVisibilityHook', DinputOrderHookID: 'DinputDeviceHook', WindowStyleHookID: 'SetWindowStyleHook', GetCursorInfoID: 'GetCursorInfoHook' };
/** Proto Input hooks a handler turns on: options set to true anywhere, and hooks installed at runtime (ProtoInput.InstallHook). */
/** The handler with its comments blanked out (same length, newlines kept; strings and regular expressions left as
 *  they are, so a `//` inside one stays), and the bracket depth at the start of each line (0: top level). A small
 *  lexer rather than a parse: it works on handlers that don't parse yet. */
export function codeOf(text: string): { code: string; depth: number[] } {
  const out = text.split('');
  const depth = [0];
  let d = 0, prev = '';
  const blank = (from: number, to: number) => { for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' '; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!, n = text[i + 1];
    if (c === '\n') { depth.push(d); continue; }
    if (c === '/' && n === '/') {
      let e = text.indexOf('\n', i);
      if (e < 0) e = text.length;
      blank(i, e); i = e - 1; continue;
    }
    if (c === '/' && n === '*') {
      let e = text.indexOf('*/', i + 2);
      e = e < 0 ? text.length : e + 2;
      blank(i, e);
      for (let k = i; k < e; k++) if (text[k] === '\n') depth.push(d);
      i = e - 1; continue;
    }
    if (c === '"' || c === "'" || (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)))) {
      // A string, or a regular expression where one can start; ends at its closing mark or the line's end.
      let k = i + 1, cls = false;
      for (; k < text.length && text[k] !== '\n'; k++) {
        const x = text[k];
        if (x === '\\') { k++; continue; }
        if (c === '/' && x === '[') cls = true;
        else if (c === '/' && x === ']') cls = false;
        else if (x === c && !cls) break;
      }
      i = Math.min(k, text.length - 1);
      if (text[i] === '\n') i--;
      prev = c; continue;
    }
    if (c === '(' || c === '[' || c === '{') d++;
    else if (c === ')' || c === ']' || c === '}') d = Math.max(0, d - 1);
    if (!/\s/.test(c)) prev = c;
  }
  return { code: out.join(''), depth };
}
/** The handler without its comments (block and line), for the text searches below. */
const noComments = (text: string) => codeOf(text).code;
export function handlerHooks(text: string): Set<string> {
  const code = noComments(text);
  const on = new Set([...code.matchAll(/\bGame\.ProtoInput\.(\w+)\s*=\s*true\b/g)].map((m) => m[1]!));
  for (const m of code.matchAll(/InstallHook\s*\([^)]*?Values\.(\w+ID)\b/g)) on.add(ID2OPT[m[1]!] ?? m[1]!.replace(/ID$/, ''));
  return on;
}
const isOn = (text: string, opt: string) => new RegExp(`\\bGame\\.${opt.replace(/\./g, '\\.')}\\s*=\\s*true\\b`).test(noComments(text));
/** What a handler's assignments leave in a Game.<opt> switch: the last one's true/false when every assignment is a plain
 *  `= true`/`= false` statement on its own line at the top level; undefined when it never sets it; 'unclear' otherwise
 *  (one inside a block or a one-line `if`, or a value that isn't true/false). */
export function lastSwitch(text: string, opt: string): boolean | undefined | 'unclear' {
  const { code, depth } = codeOf(text);
  let v: boolean | undefined;
  for (const m of code.matchAll(new RegExp(`\\bGame\\.${opt.replace(/\./g, '\\.')}\\s*=(?!=)\\s*([^;\\n]*)`, 'g'))) {
    const lineStart = code.lastIndexOf('\n', m.index! - 1) + 1;
    const val = m[1]!.trim();
    if (depth[code.slice(0, lineStart).split('\n').length - 1] !== 0 || code.slice(lineStart, m.index!).trim() || !/^(true|false)$/.test(val)) return 'unclear';
    v = val === 'true';
  }
  return v;
}
export function startsProtoInput(text: string) {
  return ['InjectStartup', 'InjectRuntime_RemoteLoadMethod', 'InjectRuntime_EasyHookMethod', 'InjectRuntime_EasyHookStealthMethod'].some((k) => isOn(text, 'ProtoInput.' + k));
}

export interface ImportHint {
  rule: string;
  title: string;
  why: string;
  /** Lines to add (the fix). Empty for a note. */
  lines: string[];
  severity: 'info' | 'warning';
  /** A note about the game, no fix: shown as a quiet hint. */
  fact: boolean;
}

/** Hints for a handler from its game's analysis: what the game uses that the handler doesn't cover yet. Quiet by design:
 *  only the main suggestions, Proto Input ones only when the handler starts Proto Input, keyboard-and-mouse ones only
 *  when it allows several keyboards and mice, never the "only if you see the problem" ones. */
export function importHints(text: string, a: Analysis): ImportHint[] {
  const out: ImportHint[] = [];
  const pi = startsProtoInput(text);
  const have = handlerHooks(text);
  const kbm = isOn(text, 'SupportsMultipleKeyboardsAndMice');
  const used = (f: Finding) => f.hits.slice(0, 3).map((h) => (h.how === 'loads' ? `loads ${h.dll}` : h.how === 'imports' ? h.fn : h.fn)).join(', ');
  // Startup injection with a launcher goes into the launcher, so none of the hooks reach the game.
  // The last assignment of each counts (true, then false: off). A runtime method set somewhere it can't tell: no fix.
  const methods = ['InjectRuntime_RemoteLoadMethod', 'InjectRuntime_EasyHookMethod', 'InjectRuntime_EasyHookStealthMethod'].map((k) => lastSwitch(text, 'ProtoInput.' + k));
  const runtimeInject = methods.includes(true);
  const runtimeUnclear = !runtimeInject && methods.includes('unclear');
  const startup = lastSwitch(text, 'ProtoInput.InjectStartup');
  // A launcher named (a non-empty string), and startup injection on: it goes into the launcher. With a runtime method
  // as well, the runtime one never runs (GenericGameHandler: only when InjectStartup is off), so the fix turns startup off.
  if (/\bGame\.LauncherExe\s*=\s*(["'])[^"'\n]+\1/.test(noComments(text)) && (startup === true || (startup === 'unclear' && isOn(text, 'ProtoInput.InjectStartup'))))
    out.push({
      rule: 'launcher-startup',
      title: 'Game.ProtoInput.InjectStartup injects Proto Input into the launcher, not the game',
      why: runtimeInject
        ? 'With Game.LauncherExe, the program Nucleus starts is the launcher (GenericGameHandler), so its hooks never reach the game; and with InjectStartup on, the runtime injection this handler also sets never runs. Turn startup injection off: Nucleus then injects into the game process it finds.'
        : 'With Game.LauncherExe, the program Nucleus starts is the launcher (GenericGameHandler), so its hooks never reach the game. Inject at runtime instead (it only runs with InjectStartup off): Nucleus then injects into the game process it finds.',
      // Adding EasyHook where the handler also sets it (false) elsewhere: a later `= false` would undo the fix, so none.
      lines: runtimeUnclear || (!runtimeInject && methods[1] !== undefined) ? [] : [runtimeInject ? 'Game.ProtoInput.InjectStartup = false;' : 'Game.ProtoInput.InjectRuntime_EasyHookMethod = true;'],
      severity: 'warning',
      fact: false,
    });
  for (const f of a.found) {
    const r = f.rule;
    if (r.id === 'launcher') {
      out.push({ rule: r.id, title: r.title, why: r.why, lines: [], severity: 'info', fact: true });
      continue;
    }
    if (r.id === 'sdlstatic') {
      if (isOn(text, 'Hook.SDL2Enabled')) out.push({ rule: r.id, title: 'Game.Hook.SDL2Enabled does nothing for this game', why: `${r.why} (${used(f)}.)`, lines: [], severity: 'warning', fact: false });
      continue;
    }
    if (r.maybe || r.detail) continue;
    if (r.kbm && !kbm) continue;
    if (r.id === 'sdl') {
      if (!isOn(text, 'Hook.SDL2Enabled') && !have.has('XinputHook')) out.push({ rule: r.id, title: `The game uses SDL2 (${used(f)}): Nucleus' SDL2 setting can give each player a controller`, why: r.why, lines: f.lines, severity: 'info', fact: true });
      continue;
    }
    const missing = f.opts.filter((o) => !have.has(o));
    if (!pi || !missing.length) continue;
    // Focus: Nucleus' own focus hooks count as covering it.
    if (r.id === 'focus' && (isOn(text, 'Hook.ForceFocus') || isOn(text, 'HookFocus'))) continue;
    out.push({
      rule: r.id,
      title: `${r.title}${used(f) ? ` (${used(f)})` : ''}: ${missing.map((o) => 'Game.ProtoInput.' + o).join(', ')}${r.ctl ? ' (if players use controllers)' : ''}`,
      why: r.why + (missing.length === 1 && hubShare(missing[0]!) != null ? ` On in ${hubShare(missing[0]!)}% of the Hub handlers that use Proto Input.` : ''),
      lines: missing.map((o) => `Game.ProtoInput.${o} = true;`),
      severity: 'info',
      fact: true,
    });
  }
  return out;
}

/** The analysis as text (ncdev imports). */
export function importsReport(a: Analysis, opts: { controllers?: boolean; kbm?: boolean } = {}): string {
  const ctl = opts.controllers !== false, kbm = opts.kbm !== false;
  const lines: string[] = [];
  const name = (f?: PeFile) => (f ? base(f.fileName) : '?');
  lines.push(`Game: ${name(a.main)}${a.main ? (a.main.is64 ? ' (64-bit)' : ' (32-bit)') : ''}${a.launchers.length ? `, started by ${a.launchers.map(name).join(' → ')}` : ''}`);
  const sel = a.found.filter((f) => !f.rule.maybe && !f.rule.detail && (ctl || !f.rule.ctl) && (kbm || !f.rule.kbm));
  const code = [...new Set(sel.flatMap((f) => f.lines))];
  const pi = code.some((l) => l.startsWith('Game.ProtoInput.'));
  lines.push('', 'Suggested lines:', ...(pi ? ['// Proto Input only runs with Game.ProtoInput.InjectStartup', '// or an InjectRuntime_… option; without one these do nothing.'] : []), ...code);
  const show = (title: string, list: Finding[]) => {
    if (!list.length) return;
    lines.push('', title);
    for (const f of list) {
      const share = f.opts.length === 1 && hubShare(f.opts[0]!) != null ? ` [${hubShare(f.opts[0]!)}% of Hub handlers]` : '';
      lines.push(`- ${f.rule.area}: ${f.rule.title}${share}`, `  ${f.rule.why}`, `  Found: ${f.hits.slice(0, 4).map((h) => (h.how === 'loads' ? `loads ${h.dll}` : h.how === 'mentions' ? `${base(h.file)} names ${h.fn}` : `${h.fn} (${base(h.file)})`)).join(' · ') || 'not imported (Proto Input needs it itself)'}`);
    }
  };
  show('What the game does:', sel);
  show('If players’ input still gets mixed up (keyboards and mice):', kbm ? a.found.filter((f) => f.rule.detail) : []);
  show('Only if you see the problem:', a.found.filter((f) => f.rule.maybe && (ctl || !f.rule.ctl)));
  lines.push('', `What this can’t see: ${a.runtime ? 'functions looked up while running (GetProcAddress) show only when their DLL name is in a file; ' : ''}input code in DLLs that aren’t in the folder you gave. “Uses it” means “might need it”: Try it decides.`);
  return lines.join('\n');
}

/** A JavaScript string literal's value (quotes included in `lit`): the escapes ES5 knows. */
function decodeString(lit: string): string {
  const esc: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
  return lit.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, e: string) =>
    e.length > 1 ? String.fromCharCode(parseInt(e.slice(1), 16)) : esc[e] ?? (e === '\n' ? '' : e));
}

// ---------------------------------------------------------------------------------------------------------------
// As game-folder problems (VS Code, ncdev lsp, the workbench): quiet hints next to Game.ExecutableName, each with a
// fix that adds its lines after the handler's last top-level Game.ProtoInput line (else after ExecutableName).
import type { FolderProblem } from './gamefolder';

export function importProblems(text: string, files: PeFile[]): FolderProblem[] {
  if (!files.length) return [];
  const { code, depth } = codeOf(text);
  // A string literal's value (escapes decoded: "bin\\Win64" is bin\Win64), and where its text is, for the diagnostic.
  const setting = (name: string) => {
    const m = code.match(new RegExp(`^\\s*Game\\.${name}\\s*=\\s*("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*')`, 'm'));
    if (!m) return undefined;
    const value = decodeString(m[1]!);
    const start = m.index! + m[0].length - m[1]!.length + 1;
    return value ? { value, index: m.index!, start, end: start + m[1]!.length - 2 } : undefined;
  };
  const exe = setting('ExecutableName');
  // Nucleus starts Game.BinariesFolder\Game.ExecutableName: with a binaries folder, that path picks the program.
  const bin = setting('BinariesFolder')?.value;
  const exes = files.filter((f) => !f.dll);
  const withBin = exe && bin ? bin.replace(/[\\/]+$/, '') + '\\' + exe.value : undefined;
  const name = withBin && findExe(exes, withBin) ? withBin : exe?.value;
  // A name several programs of the folder have (old/Game.exe and new/Game.exe): no guessing which one, no hints.
  if (name && findExes(exes, name).length !== 1) return []; // no program, or several, by that name: no guessing
  const a = analyse(files, name, { binariesFolder: bin });
  const hints = importHints(text, a);
  if (!hints.length) return [];
  const anchor = exe ? { start: exe.start, end: exe.end } : { start: 0, end: 0 };
  const lineEnd = (at: number) => {
    const n = text.indexOf('\n', at);
    return n < 0 ? text.length : n + 1;
  };
  const lineNo = (at: number) => text.slice(0, at).split('\n').length - 1;
  // Only a complete one-line statement at the top level is a safe place to add after (not `OnInputLocked = function
  // () {`, nor a line inside a callback's body, indented or not, nor one in a block comment: comments are blanked).
  const complete = (line: string) => {
    const t = line.trimEnd();
    const open = (re: RegExp) => (t.match(re) ?? []).length;
    return t.endsWith(';') && open(/[({[]/g) === open(/[)}\]]/g);
  };
  const top = (m: RegExpMatchArray) => depth[lineNo(m.index!)] === 0;
  // A line whose end is inside a block comment that goes on (`x = 1; /* note` + newline): adding there would put the
  // lines inside the comment.
  const endsInComment = (at: number) => {
    const ls = text.lastIndexOf('\n', at - 2) + 1, seg = text.slice(ls, at), o = seg.lastIndexOf('/*');
    return o >= 0 && seg.indexOf('*/', o + 2) < 0 && code[ls + o] !== '/';
  };
  // The whole statement on one line (`=` too: `Name\n= true;` would get the lines between name and value).
  // A line without `;` is only a statement end when the next code doesn't continue it (`.replace(…)`, `+ x`, `(`…).
  const continues = (at: number) => /^\s*(?:[.([+\-*/%?:,=&|<>!^]|(?:in|instanceof)\b)/.test(code.slice(at));
  const pis = [...code.matchAll(/^Game\.ProtoInput\.\w+[ \t]*=(?!=).*$/gm)].filter((m) => top(m) && complete(m[0]) && !endsInComment(lineEnd(m.index!)) && (/;\s*$/.test(m[0]) || !continues(m.index! + m[0].length)));
  // Else after Game.ExecutableName's statement, when it ends on the line its string ends on (only `;` after it).
  const exeEnd = exe ? lineEnd(exe.end + 1) : -1;
  const exeSafe = !!exe && /^[ \t]*;?[ \t]*\r?\n?$/.test(code.slice(exe.end + 1, exeEnd)) && !endsInComment(exeEnd)
    && (/;/.test(code.slice(exe.end + 1, exeEnd)) || !continues(exeEnd));
  const insertAt = pis.length ? lineEnd(pis[pis.length - 1]!.index!) : exe ? (exeSafe ? exeEnd : -1) : 0;
  const nl = insertAt > 0 && text[insertAt - 1] !== '\n' ? '\n' : '';
  // Startup injection into a launcher: the fix swaps the one active top-level InjectStartup line (a trailing comment
  // stays). Several InjectStartup assignments, or one inside a block: no fix, it can't tell which one counts.
  const assigns = [...code.matchAll(/\bGame\.ProtoInput\.InjectStartup\s*=/g)];
  const startup = assigns.length === 1 ? code.match(/^[ \t]*(Game\.ProtoInput\.InjectStartup\s*=\s*true\b(?:[ \t]*;)?)[ \t]*$/m) : null;
  const swap = startup && top(startup) ? { start: startup.index! + startup[0].indexOf('Game.'), end: startup.index! + startup[0].indexOf('Game.') + startup[1]!.length } : undefined;
  return hints.map((h) => h.rule === 'launcher-startup' && swap && h.lines.length ? {
    ...anchor,
    severity: h.severity,
    title: h.title,
    why: h.why + ' (From the game’s program files.)',
    fact: undefined,
    fix: { title: /= false;$/.test(h.lines[0]!) ? 'Turn startup injection off' : 'Inject at runtime instead', text: h.lines[0]!, ...swap },
  } : ({
    ...anchor,
    severity: h.severity,
    title: h.title,
    why: h.why + ' (From the game’s program files.)',
    fact: h.fact ? (true as const) : undefined,
    // launcher-startup without a line it can swap: no fix (adding runtime injection would leave startup injection on).
    fix: h.lines.length && h.rule !== 'launcher-startup' && insertAt >= 0 ? { title: `Add ${h.lines.length === 1 ? h.lines[0]!.replace(/ = true;$/, '') : h.lines.length + ' lines'}`, text: nl + h.lines.join('\n') + '\n', start: insertAt, end: insertAt } : undefined,
  }));
}
