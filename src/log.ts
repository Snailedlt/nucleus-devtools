// The "SplitScreen.Me" output channel (View › Output), as Python and ESLint have theirs: what the extension did and
// what went wrong, so quiet results (nothing to fix, a file that can't be formatted yet) can go to the status bar
// instead of a notification, and nothing is lost.
import * as vscode from 'vscode';

export const BRAND = 'SplitScreen.Me';

let channel: vscode.LogOutputChannel | undefined;
function out(): vscode.LogOutputChannel | undefined {
  if (!channel) {
    try {
      channel = vscode.window.createOutputChannel(BRAND, { log: true });
    } catch {
      return undefined;
    }
  }
  return channel;
}

export const log = {
  info: (msg: string) => out()?.info(msg),
  warn: (msg: string) => out()?.warn(msg),
  error: (msg: string, e?: unknown) => out()?.error(e === undefined ? msg : `${msg}: ${(e as Error)?.stack ?? (e as Error)?.message ?? String(e)}`),
  show: () => out()?.show(true),
};

/** A quiet result: a few seconds in the status bar, and a line in the output channel. */
export function status(msg: string, ms = 4000) {
  log.info(msg);
  return vscode.window.setStatusBarMessage(`${BRAND}: ${msg}`, ms);
}

export function disposeLog() {
  channel?.dispose();
  channel = undefined;
}
