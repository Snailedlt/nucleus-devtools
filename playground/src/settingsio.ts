// Settings › Backup: export the workbench's settings to a JSON file and import them on another browser or computer.
// Only settings (an allowlist): never handlers, drafts, tabs or files, and never the WakaTime API key.
const SETTINGS = [
  'a11y', 'advanced', 'check-density', 'code-theme', 'custom-theme', 'themes', 'theme-on', 'dev-site', 'dev-mode',
  'editor', 'feedback-off', 'kb', 'keys', 'credit-off', 'layout', 'lines', 'lines-prefs', 'mascots', 'motion', 'panels', 'rail-open',
  'save-format', 'tips', 'tips-show', 'double-shift', 'view', 'sim', 'tab', 'tester-profile',
].map((k) => `nucleus-workbench-${k}`);
const FORMAT = 'nucleus-workbench-settings';

export function exportSettings(): string {
  const values: Record<string, string> = {};
  for (const k of SETTINGS) {
    try { const v = localStorage.getItem(k); if (v !== null) values[k.slice('nucleus-workbench-'.length)] = v; } catch { /* storage off */ }
  }
  return JSON.stringify({ format: FORMAT, version: 1, exported: new Date().toISOString().slice(0, 10), settings: values }, null, 2);
}

/** Applies a settings file: the settings come back exactly as they were exported, so one that isn't in the file was
 *  at its default then and goes back to it (files from every version so far list only the settings that weren't).
 *  Returns how many it set and how many it put back to their default, or throws with a message for the person. */
export function importSettings(text: string): { set: number; reset: number } {
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error("This isn't a settings file (it isn't JSON)."); }
  if (data?.format !== FORMAT || typeof data.settings !== 'object' || !data.settings || Array.isArray(data.settings)) throw new Error("This isn't a workbench settings file.");
  // Version 1 is the only one so far: a newer file may mean something else by the same names, so nothing changes.
  if (data.version !== 1) throw new Error(`This settings file is version ${String(data.version ?? 'unknown')}, and this workbench reads version 1. Nothing changed.`);
  // Only known settings, as text, and not huge (a custom theme is the biggest, a few KB).
  const values = new Map<string, string>();
  const invalid = new Set<string>(); // in the file but not usable: left as they are, not reset
  for (const [k, v] of Object.entries(data.settings)) {
    const key = `nucleus-workbench-${k}`;
    if (!SETTINGS.includes(key)) continue;
    if (typeof v === 'string' && v.length <= 200_000) values.set(key, v); else invalid.add(key);
  }
  // Settings, but none this workbench knows: not a backup of this one's (an empty file still puts back the defaults).
  if (!values.size && !invalid.size && Object.keys(data.settings).length) throw new Error('None of the settings in this file are ones this workbench knows. Nothing changed.');
  // Switched-off usage counts stay off unless the file switches them on itself (a file from before the switch
  // existed, or one that leaves it out, never turns counting back on).
  const KEEP = new Set(['nucleus-workbench-feedback-off']);
  let set = 0;
  let reset = 0;
  // What was there, to put back if the browser refuses partway through.
  const before = new Map<string, string | null>();
  try {
    for (const key of SETTINGS) {
      const v = values.get(key);
      if (v !== undefined) { before.set(key, localStorage.getItem(key)); localStorage.setItem(key, v); set++; }
      else if (!invalid.has(key) && !KEEP.has(key) && localStorage.getItem(key) !== null) { before.set(key, localStorage.getItem(key)); localStorage.removeItem(key); reset++; }
    }
  } catch {
    let restored = true;
    for (const [key, v] of before) {
      try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch { restored = false; }
    }
    throw new Error(restored ? "This browser didn't let the page store settings; nothing changed." : "This browser didn't let the page store settings, and only some were imported.");
  }
  return { set, reset };
}
