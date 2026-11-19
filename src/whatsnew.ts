// What's new: after the extension updates, one note with the highlights of this version's
// CHANGELOG.md section and a button to read it all. Not on a first install; off with
// splitscreenme.showWhatsNew. "Nucleus: What's New" opens the changelog any time, at the installed version.
import * as vscode from 'vscode';
import fs from 'node:fs';

const KEY = 'splitscreenme.lastVersion';

/** The bold summaries of a version's CHANGELOG.md section ("## 0.6.0 · 2026-11-13"; older ones say "(beta)"). */
export function highlights(changelog: string, version: string): string[] {
  const parts = changelog.split(/^## /m);
  const section = parts.find((p) => p.startsWith(version + ' ') || p.startsWith(version + '\n'));
  if (!section) return [];
  return section
    .split(/^### 🙏.*$/m)[0] // what changed, not the thanks
    .split('\n')
    .filter((l) => l.startsWith('- '))
    .map((l) => (l.match(/^- \*\*(.+?)\*\*/)?.[1] ?? l.slice(2)).replace(/\.$/, ''));
}

const REPO_FILES = 'https://github.com/Snailedlt/splitscreenme-vscode/blob/main/';
const REPO_RAW = 'https://raw.githubusercontent.com/Snailedlt/splitscreenme-vscode/main/';

/** The changelog as What's New shows it: from the installed version down, without "Unreleased" (and anything newer
 *  than this version) or the notes for whoever writes it. Exported for tests. */
export function whatsNewMarkdown(changelog: string, version: string): string {
  const text = changelog.replace(/<!--[\s\S]*?-->\n*/g, '');
  const parts = text.split(/^(?=## )/m);
  const head = parts[0].trimEnd();
  const sections = parts.slice(1);
  let at = sections.findIndex((p) => p.startsWith(`## ${version} `) || p.startsWith(`## ${version}\n`));
  // No section of its own: the newest release below this version (never notes for a newer one); for a build
  // ahead of every release, the newest released.
  const num = (v: string) => v.split('.').map((x) => parseInt(x, 10) || 0);
  const below = (a: string, b: string) => {
    const x = num(a), y = num(b);
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0);
    return false;
  };
  const released = (p: string) => p.match(/^## (\d+\.\d+\.\d+)\b/)?.[1];
  if (at < 0 && /^\d+\.\d+\.\d+/.test(version)) at = sections.findIndex((p) => !!released(p) && below(released(p)!, version));
  // Without a numeric version, the newest released (a numeric one with nothing older released gets no section).
  else if (at < 0) at = sections.findIndex((p) => !/^## Unreleased/i.test(p));
  // The copy is opened from the extension's storage: relative links lead to the repository's files instead.
  const body = (at < 0 ? [] : sections.slice(at)).join('').replace(/^---\n+/, '').replace(/(!?)\[([^\]]*)\]\((?![a-z][\w+.-]*:|#|\/)([^)\s]+)\)/gi, (_m, img: string, label: string, t: string) => `${img}[${label}](${img ? REPO_RAW : REPO_FILES}${t.replace(/^\.\//, '')})`);
  return `${head}\n\n${body}`;
}

export function registerWhatsNew(context: vscode.ExtensionContext) {
  // vsce stores it as changelog.md; from a checkout it is CHANGELOG.md (names are case-sensitive on Linux and macOS).
  const changelog = () => {
    const names = ['changelog.md', 'CHANGELOG.md'].map((n) => vscode.Uri.joinPath(context.extensionUri, n));
    return names.find((u) => fs.existsSync(u.fsPath)) ?? names[1];
  };
  // Opens at the installed version: a copy of the changelog from it down, in the extension's own storage.
  const open = async () => {
    const version: string = context.extension?.packageJSON?.version ?? '';
    let uri = changelog();
    try {
      const md = whatsNewMarkdown(fs.readFileSync(uri.fsPath, 'utf8'), version);
      const out = vscode.Uri.joinPath(context.globalStorageUri, `whats-new-${version || 'dev'}.md`);
      await vscode.workspace.fs.writeFile(out, Buffer.from(md, 'utf8'));
      uri = out;
    } catch {
      /* the whole changelog, then */
    }
    return vscode.commands.executeCommand('markdown.showPreview', uri);
  };
  context.subscriptions.push(vscode.commands.registerCommand('splitscreenme.whatsNew', open));
  if (!context.extensionUri) return;

  const version: string | undefined = context.extension?.packageJSON?.version;
  const previous = context.globalState?.get<string>(KEY);
  if (!version || previous === version) return;
  void context.globalState?.update(KEY, version);
  if (!previous || !vscode.workspace.getConfiguration('splitscreenme').get<boolean>('showWhatsNew', true)) return;
  let list: string[] = [];
  try {
    list = highlights(fs.readFileSync(changelog().fsPath, 'utf8'), version);
  } catch {}
  const text = `Nucleus handler tools updated to ${version}${list.length ? `: ${list.slice(0, 3).join(' · ')}${list.length > 3 ? ` (+${list.length - 3} more)` : ''}` : '.'}`;
  void vscode.window.showInformationMessage(text, "What's new", "Don't show again").then((choice) => {
    if (choice === "What's new") open();
    else if (choice === "Don't show again") void vscode.workspace.getConfiguration('splitscreenme').update('showWhatsNew', false, vscode.ConfigurationTarget.Global);
  });
}
