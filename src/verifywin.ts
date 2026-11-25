// The Windows side of `ncdev verify`: Nucleus' logs and the game's processes and windows, read from this PC.
// The comparison is core/verify.ts. Windows only: elsewhere there's nothing to look at.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { debugLogPath, nucleusRunning } from './nucleusrun';
import type { CrashLog, Observation } from './core/verify';
import { parseCrashLog } from './core/verify';

/** Every process called <exe> and its top-level windows, with the monitor each is on (one PowerShell call). */
const PS = `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text; using System.Collections.Generic;
public static class NcWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr p);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  public static List<object[]> Of(HashSet<uint> pids) {
    var list = new List<object[]>();
    EnumWindows((h, p) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pids.Contains(pid) && GetWindow(h, 4) == IntPtr.Zero) {
        var sb = new StringBuilder(256); GetWindowText(h, sb, 256); RECT r; GetWindowRect(h, out r);
        list.Add(new object[] { h, pid, sb.ToString(), r.L, r.T, r.R - r.L, r.B - r.T, IsWindowVisible(h), IsIconic(h) });
      }
      return true;
    }, IntPtr.Zero);
    return list;
  }
}
"@
$name = [IO.Path]::GetFileNameWithoutExtension($env:NCDEV_EXE)
$procs = @(Get-Process -Name $name)
$set = New-Object 'System.Collections.Generic.HashSet[uint32]'
foreach ($p in $procs) { [void]$set.Add([uint32]$p.Id) }
$wins = foreach ($w in [NcWin]::Of($set)) {
  $s = [System.Windows.Forms.Screen]::FromHandle([IntPtr]$w[0]).Bounds
  [pscustomobject]@{ pid = [int]$w[1]; title = $w[2]; rect = @{ x = $w[3]; y = $w[4]; width = $w[5]; height = $w[6] }; monitor = @{ x = $s.X; y = $s.Y; width = $s.Width; height = $s.Height }; visible = $w[7]; minimized = $w[8] }
}
[pscustomobject]@{
  processes = @($procs | ForEach-Object { [pscustomobject]@{ pid = $_.Id; name = $_.ProcessName + '.exe'; started = $(if ($_.StartTime) { $_.StartTime.ToString('o') } else { $null }) } })
  windows = @($wins)
} | ConvertTo-Json -Depth 5 -Compress
`;

export function observeWindows(exe: string): Observation {
  if (process.platform !== 'win32') throw new Error('Reading the game windows only works on Windows, where the session runs.');
  const out = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS], {
    windowsHide: true,
    env: { ...process.env, NCDEV_EXE: exe },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30000,
  }).toString('utf8');
  const j = JSON.parse(out.trim() || '{}');
  return { exe, processes: j.processes ?? [], windows: j.windows ?? [], nucleusRunning: nucleusRunning() };
}

/** Where Nucleus keeps app.log and its error files (LogManager.GetAppDataPath; the alpha builds use <Nucleus>\content). */
export function nucleusAppData(nucleus: string): string[] {
  const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
  return [path.join(appData, 'Nucleus Coop'), path.join(nucleus, 'content')];
}

/** The newest error file Nucleus wrote (ddMMyyyy_HHmmss.log) since `since`, read. */
export function newestCrash(nucleus: string, since?: Date): { file: string; crash: CrashLog } | undefined {
  let best: { file: string; time: number } | undefined;
  for (const dir of nucleusAppData(nucleus)) {
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const n of names) {
      if (!/^\d{8}_\d{6}\.log$/.test(n)) continue;
      const file = path.join(dir, n);
      const time = fs.statSync(file).mtimeMs;
      if (since && time < since.getTime()) continue;
      if (!best || time > best.time) best = { file, time };
    }
  }
  if (!best) return undefined;
  const crash = parseCrashLog(fs.readFileSync(best.file, 'utf8'));
  return crash ? { file: best.file, crash } : undefined;
}

export function readDebugLog(nucleus: string): string | undefined {
  try {
    return fs.readFileSync(debugLogPath(nucleus), 'utf8');
  } catch {
    return undefined;
  }
}

/** "2026-11-25 14:03:12" (local time, as Nucleus writes it) as a Date. */
export function logTime(t: string | undefined): Date | undefined {
  const m = t && /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(t);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : undefined;
}
