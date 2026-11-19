// Plain-language names for handler options (`Game.X`, `Game.Hook.X`, `Game.ProtoInput.X`), shown by the Form view next
// to the real API name (which stays visible: people move on to the code by seeing it), and the unit of a number where
// the docs or the Nucleus source make it certain.
//
// The labels are hand-written for the options handlers use most (tools/usage-counts.mjs, usage.json) and the ones Form
// shows by default; any other option gets a readable version of its name ("KillMutexDelay" -> "Kill mutex delay").
// Keep a label short (it sits in one line beside the value) and true to what Nucleus does: when unsure, leave it out
// and let the readable name stand.
import type { Member } from '@core/api';

export type Unit = 'ms' | 's';
export const UNIT_TEXT: Record<Unit, { short: string; long: string }> = {
  ms: { short: 'ms', long: 'milliseconds' },
  s: { short: 'seconds', long: 'seconds' },
};

type Entry = string | [string, Unit];
/** Hand-written labels, by path. A unit given here wins over the one read from the docs. */
export const LABELS: Record<string, Entry> = {
  // Required, and what Nucleus shows
  'Game.GUID': 'Handler ID (content folder name)',
  'Game.GameName': 'Game name',
  'Game.ExecutableName': 'Game’s .exe file',
  'Game.SteamID': 'Steam app ID',
  'Game.MaxPlayers': 'Most players',
  'Game.MaxPlayersOneMonitor': 'Most players on one screen (info)',
  'Game.Description': 'Message for players',
  'Game.HandlerInterval': ['Handler update interval', 'ms'],
  'Game.Folder': 'Handler’s own folder',
  // Starting the game
  'Game.StartArguments': 'Start arguments',
  'Game.BinariesFolder': 'Folder the .exe is in',
  'Game.ExecutableContext': 'Other files that identify the game',
  'Game.LauncherExe': 'Launcher .exe',
  'Game.LauncherTitle': 'Launcher window title',
  'Game.LauncherExeIgnoreFileCheck': 'Don’t check the launcher exists',
  'Game.PauseBetweenStarts': ['Wait between starting players', 's'],
  'Game.PauseBetweenProcessGrab': ['Wait before finding the game process', 's'],
  'Game.PauseBetweenContextAndLaunch': ['Wait after extra files, before setup', 's'],
  'Game.PromptBetweenInstances': 'Ask before starting each next player',
  'Game.PromptAfterFirstInstance': 'Ask to continue after the first player',
  'Game.KillMutex': 'Mutexes to close',
  'Game.KillMutexDelay': ['Wait before closing mutexes', 's'],
  'Game.RenameNotKillMutex': 'Rename mutexes instead of closing them',
  'Game.KillProcessesOnClose': 'Other processes to end on close',
  'Game.GamePlayBeforeGameSetup': 'Run Game.Play before the setup',
  'Game.GamePlayAfterLaunch': 'Run Game.Play after launch',
  'Game.KeyboardPlayerFirst': 'Keyboard player first',
  'Game.PlayersPerInstance': 'Players per instance',
  // Callbacks
  'Game.Play': 'For each player, before their game starts',
  'Game.OnFinishedSetup': 'Once every game is set up and started',
  'Game.OnStop': 'When the session ends',
  'Game.ProtoInput.OnInputLocked': 'Each time input is locked',
  'Game.ProtoInput.OnInputUnlocked': 'Each time input is unlocked',
  // Game files
  'Game.SymlinkGame': 'Link game files instead of copying',
  'Game.SymlinkExe': 'Link the .exe too',
  'Game.SymlinkFolders': 'Link folders instead of copying',
  'Game.HardcopyGame': 'Copy every game file',
  'Game.HardlinkGame': 'Hard-link game files',
  'Game.KeepSymLinkOnExit': 'Keep the links when Nucleus closes',
  'Game.FileSymlinkExclusions': 'Files not to link',
  'Game.FileSymlinkCopyInstead': 'Files to copy instead of linking',
  'Game.DirSymlinkExclusions': 'Folders not to link',
  'Game.DirSymlinkCopyInstead': 'Folders to copy instead of linking',
  'Game.DirExclusions': 'Folders to leave out',
  'Game.UserProfileSavePath': 'Save folder (in the user profile)',
  'Game.UserProfileConfigPath': 'Config folder (in the user profile)',
  'Game.UserProfileSavePathNoCopy': 'Don’t copy the save folder',
  'Game.UserProfileConfigPathNoCopy': 'Don’t copy the config folder',
  'Game.DocumentsSavePath': 'Save folder (in Documents)',
  'Game.DocumentsConfigPath': 'Config folder (in Documents)',
  'Game.UseNucleusEnvironment': 'Nucleus environment (own user folders)',
  // Steam
  'Game.UseGoldberg': 'Goldberg Steam emulator',
  'Game.GoldbergNoLocalSave': 'Goldberg: no local save',
  'Game.GoldbergExperimental': 'Goldberg: experimental build',
  'Game.NeedsSteamEmulation': 'Steam emulation (SSE)',
  'Game.CreateSteamAppIdByExe': 'Create steam_appid.txt by the .exe',
  'Game.UseSteamless': 'Remove Steam DRM with Steamless',
  'Game.SteamlessArgs': 'Steamless arguments',
  'Game.SteamlessTiming': ['Time Steamless gets to patch', 'ms'],
  'Game.UseSteamStubDRMPatcher': 'Remove Steam DRM with Steam Stub DRM Patcher',
  // Windows
  'Game.Hook.ForceFocusWindowName': 'Game window title',
  'Game.HasDynamicWindowTitle': 'Window title changes',
  'Game.ResetWindows': 'Reset earlier windows after each start',
  'Game.RefreshWindowAfterStart': 'Minimize and restore windows at the end',
  'Game.SetWindowHook': 'Stop the game resizing its window',
  'Game.SetWindowHookStart': 'Stop the game resizing its window, from start',
  'Game.SupportsPositioning': 'Place windows automatically',
  'Game.DontResize': 'Don’t resize windows',
  'Game.DontReposition': 'Don’t move windows',
  'Game.DontRemoveBorders': 'Keep window borders',
  'Game.KeepMonitorAspectRatio': 'Keep the monitor’s aspect ratio',
  'Game.NotTopMost': 'Don’t keep windows on top',
  'Game.SetTopMostAtEnd': 'Windows on top at the end',
  'Game.HideTaskbar': 'Hide the taskbar',
  'Game.SetForegroundWindowElsewhere': 'Move focus off the game windows',
  // Focus
  'Game.FakeFocus': 'Send focus messages regularly',
  'Game.FakeFocusInterval': ['Focus message interval', 'ms'],
  'Game.SendFakeFocusMsg': 'Send focus messages once, at the end',
  'Game.HookFocus': 'Hook focus checks',
  'Game.PreventWindowDeactivation': 'Block lose-focus messages',
  'Game.HookInit': 'Hook multiple-instance checks',
  'Game.Hook.ForceFocus': 'Keep each window focused (custom DLL)',
  // Input
  'Game.SupportsKeyboard': 'A keyboard and mouse player',
  'Game.SupportsMultipleKeyboardsAndMice': 'Several keyboards and mice',
  'Game.LockInputAtStart': 'Lock input at start',
  'Game.LockInputToggleKey': 'Key that locks input',
  'Game.LockInputSuspendsExplorer': 'Pause Explorer while input is locked',
  'Game.XInputPlusDll': 'XInputPlus DLLs',
  'Game.InjectHookXinput': 'Hook XInput (Universal Split Screen way)',
  'Game.UseDInputBlocker': 'Block DirectInput',
  'Game.BlockRawInput': 'Block raw input devices',
  'Game.HookSetCursorPos': 'Hook: game moves the cursor',
  'Game.HookGetCursorPos': 'Hook: game reads the cursor',
  'Game.HookGetKeyState': 'Hook: key state',
  'Game.HookGetAsyncKeyState': 'Hook: async key state',
  'Game.HookGetKeyboardState': 'Hook: keyboard state',
  'Game.HookFilterRawInput': 'Filter raw input',
  'Game.HookFilterMouseMessages': 'Filter mouse messages',
  'Game.HookUseLegacyInput': 'Legacy input',
  'Game.HookDontUpdateLegacyInMouseMsg': 'Legacy input: don’t update in mouse messages',
  'Game.KeyboardPlayerSkipPreventWindowDeactivate': 'Keyboard player: don’t block lose-focus messages',
  'Game.HookMouseVisibility': 'Hook cursor visibility',
  'Game.HookReRegisterRawInput': 'Re-register raw input in the game',
  'Game.HookReRegisterRawInputMouse': 'Re-register raw input: mouse',
  'Game.HookReRegisterRawInputKeyboard': 'Re-register raw input: keyboard',
  'Game.SendNormalMouseInput': 'Send mouse input as messages',
  'Game.SendNormalKeyboardInput': 'Send keyboard input as messages',
  'Game.SendScrollWheel': 'Send the scroll wheel',
  'Game.ForwardRawMouseInput': 'Forward raw mouse input',
  'Game.ForwardRawKeyboardInput': 'Forward raw keyboard input',
  'Game.DrawFakeMouseCursor': 'Draw a fake mouse cursor',
  'Game.Hook.XInputEnabled': 'Controllers (XInput)',
  'Game.Hook.DInputEnabled': 'Controllers (DirectInput)',
  'Game.Hook.CustomDllEnabled': 'Nucleus’ own XInput DLL',
  'Game.Hook.XInputReroute': 'XInput as DirectInput (over 4 pads)',
  'Game.Hook.DInputForceDisable': 'Turn DirectInput off',
  'Game.Hook.UseAlpha8CustomDll': 'Older custom DLL (Alpha 8)',
  // Proto Input
  'Game.ProtoInput.InjectStartup': 'Inject Proto Input at start',
  'Game.ProtoInput.InjectRuntime_EasyHookMethod': 'Inject once running (EasyHook)',
  'Game.ProtoInput.InjectRuntime_EasyHookStealthMethod': 'Inject once running (EasyHook stealth)',
  'Game.ProtoInput.InjectRuntime_RemoteLoadMethod': 'Inject once running (remote load)',
  'Game.ProtoInput.FocusHooks': 'Focus hooks',
  'Game.ProtoInput.FreezeExternalInputWhenInputNotLocked': 'Freeze outside input while unlocked',
  'Game.ProtoInput.MessageFilterHook': 'Message filter hook',
  'Game.ProtoInput.BlockedMessages': 'Window messages to block',
  'Game.ProtoInput.RawInputFilter': 'Raw input filter',
  'Game.ProtoInput.MouseMoveFilter': 'Mouse move filter',
  'Game.ProtoInput.MouseButtonFilter': 'Mouse button filter',
  'Game.ProtoInput.MouseWheelFilter': 'Mouse wheel filter',
  'Game.ProtoInput.MouseActivateFilter': 'Mouse activate filter',
  'Game.ProtoInput.WindowActivateFilter': 'Window activate filter',
  'Game.ProtoInput.WindowActvateAppFilter': 'App activate filter',
  'Game.ProtoInput.KeyboardButtonFilter': 'Keyboard button filter',
  'Game.ProtoInput.RegisterRawInputHook': 'Register raw input hook',
  'Game.ProtoInput.GetRawInputDataHook': 'Raw input data hook',
  'Game.ProtoInput.GetCursorPosHook': 'Hook: game reads the cursor',
  'Game.ProtoInput.SetCursorPosHook': 'Hook: game moves the cursor',
  'Game.ProtoInput.ClipCursorHook': 'Hook: game confines the cursor',
  'Game.ProtoInput.ClipCursorHookCreatesFakeClip': 'Confine the fake cursor instead',
  'Game.ProtoInput.CursorVisibilityHook': 'Hook cursor visibility',
  'Game.ProtoInput.GetKeyStateHook': 'Hook: key state',
  'Game.ProtoInput.GetAsyncKeyStateHook': 'Hook: async key state',
  'Game.ProtoInput.GetKeyboardStateHook': 'Hook: keyboard state',
  'Game.ProtoInput.SendMouseMovementMessages': 'Send mouse movement messages',
  'Game.ProtoInput.SendMouseButtonMessages': 'Send mouse button messages',
  'Game.ProtoInput.SendMouseWheelMessages': 'Send mouse wheel messages',
  'Game.ProtoInput.SendKeyboardButtonMessages': 'Send keyboard messages',
  'Game.ProtoInput.DrawFakeCursor': 'Draw a fake cursor',
  'Game.ProtoInput.EnableToggleFakeCursorVisibilityShortcut': 'Key that shows or hides the fake cursor',
  'Game.ProtoInput.XinputHook': 'XInput hook (a pad per player)',
  'Game.ProtoInput.UseOpenXinput': 'Use OpenXinput',
  'Game.ProtoInput.UseDinputRedirection': 'DirectInput redirection',
  'Game.ProtoInput.DinputDeviceHook': 'DirectInput device hook',
  'Game.ProtoInput.DinputHookAlsoHooksGetDeviceState': 'DirectInput hook: device state too',
  'Game.ProtoInput.RenameHandlesHook': 'Rename handles hook',
  'Game.ProtoInput.RenameHandles': 'Handles to rename',
  'Game.ProtoInput.RenameNamedPipes': 'Named pipes to rename',
  'Game.ProtoInput.EnableFocusMessageLoop': 'Focus message loop',
  'Game.ProtoInput.FocusLoopIntervalMilliseconds': ['Focus loop interval', 'ms'],
  'Game.ProtoInput.FocusLoop_WM_ACTIVATE': 'Focus loop: WM_ACTIVATE',
  'Game.ProtoInput.FocusLoop_WM_ACTIVATEAPP': 'Focus loop: WM_ACTIVATEAPP',
  'Game.ProtoInput.FocusLoop_WM_MOUSEACTIVATE': 'Focus loop: WM_MOUSEACTIVATE',
  'Game.ProtoInput.FocusLoop_WM_NCACTIVATE': 'Focus loop: WM_NCACTIVATE',
  'Game.ProtoInput.FocusLoop_WM_SETFOCUS': 'Focus loop: WM_SETFOCUS',
  'Game.ProtoInput.SetWindowPosHook': 'Hook: game moves its window',
  'Game.ProtoInput.SetWindowStyleHook': 'Hook: game changes its window style',
  'Game.ProtoInput.FindWindowHook': 'Hide other windows from the game',
  'Game.ProtoInput.AutoHideTaskbar': 'Auto-hide the taskbar',
};

// Words kept as they are spelled (names, acronyms), by their lower-case form.
const WORDS: Record<string, string> = {
  xinput: 'XInput', dinput: 'DirectInput', directinput: 'DirectInput', steam: 'Steam', steamless: 'Steamless', goldberg: 'Goldberg',
  nucleus: 'Nucleus', windows: 'Windows', explorer: 'Explorer', proto: 'Proto', dll: 'DLL', dlls: 'DLLs', exe: '.exe', id: 'ID', guid: 'GUID',
  cmd: 'CMD', ini: 'INI', sse: 'SSE', dpi: 'DPI', cpu: 'CPU', ui: 'UI', vkey: 'virtual key', drm: 'DRM', easyhook: 'EasyHook', sym: 'sym',
  dont: 'don’t', msg: 'message', pos: 'position',
};

/** A readable version of an API name: `KillMutexDelay` -> "Kill mutex delay", `FocusLoop_WM_SETFOCUS` -> "Focus loop WM_SETFOCUS". */
export function readableName(name: string): string {
  const out: string[] = [];
  for (const chunk of name.split('_').filter(Boolean)) {
    // A window message (WM_X) stays as written.
    if (/^[A-Z0-9]+$/.test(chunk) && out[out.length - 1] === 'WM') {
      out[out.length - 1] = `WM_${chunk}`;
      continue;
    }
    const words = chunk.replace(/XInput|Xinput/g, 'Xinput').replace(/DInput|Dinput/g, 'Dinput').replace(/SymLink/g, 'Symlink').match(/[A-Z]+(?=[A-Z][a-z])|[A-Z]?[a-z]+|[A-Z]+|\d+/g) ?? [chunk];
    for (const w of words) out.push(w);
  }
  const s = out.map((w, i) => {
    const known = WORDS[w.toLowerCase()];
    if (known) return i || known[0] === '.' ? known : known[0].toUpperCase() + known.slice(1);
    if (/^[A-Z0-9_]{2,}$/.test(w)) return w; // an acronym
    return i ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
  return s.replace(/^\.exe/, 'Exe').replace(/ \.exe/g, ' .exe');
}

/** The unit of a number option, when the docs state it plainly (the hand-written list first). */
export function unitOf(path: string, m?: Member): Unit | undefined {
  const e = LABELS[path];
  if (Array.isArray(e)) return e[1];
  if (!m || m.type !== 'number') return undefined;
  const d = (m.doc || '').replace(/\*\*/g, '');
  if (/\b(in|the) milliseconds\b|^milliseconds\b|\btime in milliseconds\b/i.test(d)) return 'ms';
  if (/\b(in|of|number of|many|# of) seconds\b/i.test(d)) return 's';
  return undefined;
}

/** What Form calls an option: a plain label, whether it was written by hand, and its unit. */
export function optionLabel(path: string, m?: Member): { label: string; written: boolean; unit?: Unit } {
  const e = LABELS[path];
  const name = path.slice(path.lastIndexOf('.') + 1);
  return { label: e ? (Array.isArray(e) ? e[0] : e) : readableName(name), written: !!e, unit: unitOf(path, m) };
}
