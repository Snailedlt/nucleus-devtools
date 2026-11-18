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

/** Which program is the game (following launchers), which DLLs are its own and which are libraries. */
function roles(files: PeFile[], mainName?: string) {
  const exes = files.filter((f) => !f.dll);
  const bn = (f: PeFile) => base(f.fileName).toLowerCase();
  const main = (mainName && exes.find((f) => bn(f) === base(mainName).toLowerCase() || f.fileName.toLowerCase().endsWith(mainName.toLowerCase())))
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
  const role = new Map<PeFile, Role>();
  for (const f of files) role.set(f, f === game ? 'main' : launchers.includes(f) ? 'launcher' : !f.dll ? 'other' : LIB.test(base(f.fileName)) ? 'lib' : 'game');
  return { main: game, launchers, role };
}

export function analyse(files: PeFile[], mainName?: string): Analysis {
  const { main, launchers, role } = roles(files, mainName);
  const use = files.filter((f) => role.get(f) !== 'other' && role.get(f) !== 'launcher');
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
    // SDL2.dll in another folder than the .exe: Nucleus copies its SDL2.dll into each Game.SDLPaths folder (SDL2Dll.cs).
    if (r.id === 'sdl' && sdl?.size && main && dirOf(sdl.fileName) !== dirOf(main.fileName)) {
      const d = dirOf(sdl.fileName), m = dirOf(main.fileName);
      const rel = m && d.startsWith(m + '/') ? d.slice(m.length + 1) : d;
      lines = [...lines, `Game.SDLPaths = ["${rel.replace(/\//g, '\\\\')}"];`];
    }
    found.push({ rule: r, hits, opts, lines });
  }
  if (launchers.length && main) {
    const L = base(launchers[launchers.length - 1]!.fileName), G = base(main.fileName);
    found.unshift({
      rule: { id: 'launcher', area: 'Starting the game', title: `${L} is a launcher: it starts ${G}`, why: `The hooks have to be in ${G}, the program that runs the game. Either start ${G} directly (if it runs without its launcher), or let Nucleus start the launcher (Game.LauncherExe) and pick up ${G}: then inject Proto Input at runtime, because startup injection goes into the program Nucleus starts (GenericGameHandler: exePath is the launcher).` },
      hits: [{ file: launchers[launchers.length - 1]!.fileName, dll: G, fn: G, how: 'mentions' }], opts: [],
      lines: [`Game.ExecutableName = "${G}";`, `// If ${G} needs its launcher:`, `// Game.LauncherExe = "${L}";`, '// Game.ProtoInput.InjectRuntime_EasyHookMethod = true;'],
    });
  }
  const runtime = use.some((f) => f.imports.some((im) => im.fns.some((x) => x.name && RUNTIME.includes(x.name))));
  return { main, launchers, roles: role, found, runtime };
}

// ---------------------------------------------------------------------------------------------------------------
// What a handler already has, and the hints for what it lacks.

const ID2OPT: Record<string, string> = { FocusHooksHookID: 'FocusHooks', CursorVisibilityStateHookID: 'CursorVisibilityHook', DinputOrderHookID: 'DinputDeviceHook', WindowStyleHookID: 'SetWindowStyleHook', GetCursorInfoID: 'GetCursorInfoHook' };
/** Proto Input hooks a handler turns on: options set to true anywhere, and hooks installed at runtime (ProtoInput.InstallHook). */
export function handlerHooks(text: string): Set<string> {
  const code = text.replace(/\/\/.*$/gm, '');
  const on = new Set([...code.matchAll(/\bGame\.ProtoInput\.(\w+)\s*=\s*true\b/g)].map((m) => m[1]!));
  for (const m of code.matchAll(/InstallHook\s*\([^)]*?Values\.(\w+ID)\b/g)) on.add(ID2OPT[m[1]!] ?? m[1]!.replace(/ID$/, ''));
  return on;
}
const isOn = (text: string, opt: string) => new RegExp(`\\bGame\\.${opt.replace(/\./g, '\\.')}\\s*=\\s*true\\b`).test(text.replace(/\/\/.*$/gm, ''));
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
  const runtimeInject = ['InjectRuntime_RemoteLoadMethod', 'InjectRuntime_EasyHookMethod', 'InjectRuntime_EasyHookStealthMethod'].some((k) => isOn(text, 'ProtoInput.' + k));
  if (/\bGame\.LauncherExe\s*=\s*["']/.test(text.replace(/\/\/.*$/gm, '')) && isOn(text, 'ProtoInput.InjectStartup') && !runtimeInject)
    out.push({
      rule: 'launcher-startup',
      title: 'Game.ProtoInput.InjectStartup injects Proto Input into the launcher, not the game',
      why: 'With Game.LauncherExe, the program Nucleus starts is the launcher (GenericGameHandler), so its hooks never reach the game. Inject at runtime instead (it only runs with InjectStartup off): Nucleus then injects into the game process it finds.',
      lines: ['Game.ProtoInput.InjectRuntime_EasyHookMethod = true;'],
      severity: 'warning',
      fact: true,
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

// ---------------------------------------------------------------------------------------------------------------
// As game-folder problems (VS Code, ncdev lsp, the workbench): quiet hints next to Game.ExecutableName, each with a
// fix that adds its lines after the handler's last top-level Game.ProtoInput line (else after ExecutableName).
import type { FolderProblem } from './gamefolder';

export function importProblems(text: string, files: PeFile[]): FolderProblem[] {
  if (!files.length) return [];
  const exe = text.match(/^\s*Game\.ExecutableName\s*=\s*["']([^"']+)["']/m);
  const a = analyse(files, exe?.[1]);
  const hints = importHints(text, a);
  if (!hints.length) return [];
  const anchor = exe ? { start: exe.index! + exe[0].indexOf(exe[1]!), end: exe.index! + exe[0].indexOf(exe[1]!) + exe[1]!.length } : { start: 0, end: 0 };
  const lineEnd = (at: number) => {
    const n = text.indexOf('\n', at);
    return n < 0 ? text.length : n + 1;
  };
  const pis = [...text.matchAll(/^Game\.ProtoInput\.\w+\s*=.*$/gm)];
  const insertAt = pis.length ? lineEnd(pis[pis.length - 1]!.index!) : exe ? lineEnd(exe.index!) : 0;
  const nl = insertAt > 0 && text[insertAt - 1] !== '\n' ? '\n' : '';
  // Startup injection into a launcher: the fix swaps the InjectStartup line for runtime injection.
  const startup = text.match(/^[ \t]*Game\.ProtoInput\.InjectStartup\s*=\s*true\s*;?[ \t]*$/m);
  return hints.map((h) => h.rule === 'launcher-startup' && startup ? {
    ...anchor,
    severity: h.severity,
    title: h.title,
    why: h.why + ' (From the game’s program files.)',
    fact: true as const,
    fix: { title: 'Inject at runtime instead', text: h.lines[0]!, start: startup.index! + startup[0].indexOf('Game.'), end: startup.index! + startup[0].length },
  } : ({
    ...anchor,
    severity: h.severity,
    title: h.title,
    why: h.why + ' (From the game’s program files.)',
    fact: h.fact ? (true as const) : undefined,
    fix: h.lines.length ? { title: `Add ${h.lines.length === 1 ? h.lines[0]!.replace(/ = true;$/, '') : h.lines.length + ' lines'}`, text: nl + h.lines.join('\n') + '\n', start: insertAt, end: insertAt } : undefined,
  }));
}
