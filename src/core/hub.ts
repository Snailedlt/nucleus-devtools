// The public SplitScreen.Me hub API (https://hub.splitscreen.me): types and URLs. Node hosts read it only
// through src/hubcache.ts (cache, shared requests, retries, our User-Agent).

import { REPO_URL } from './report';

export const HUB = 'https://hub.splitscreen.me';

export interface HubHandler {
  _id: string;
  title: string;
  gameName: string;
  ownerName: string;
  description?: string;
  downloadCount?: number;
  stars?: number;
  verified?: boolean;
  currentVersion: number;
  currentPackage: string;
  maxPlayers?: number;
  playableControllers?: boolean;
  playableMouseKeyboard?: boolean;
  playableMultiMouseKeyboard?: boolean;
  updatedAt?: string;
}

export async function fetchHandlers(fetchImpl: typeof fetch = fetch): Promise<HubHandler[]> {
  const res = await fetchImpl(`${HUB}/api/v1/allhandlers`);
  if (!res.ok) throw new Error(`Hub returned ${res.status}`);
  const json = (await res.json()) as { Handlers?: HubHandler[] };
  return (json.Handlers ?? []).sort((a, b) => (b.downloadCount ?? 0) - (a.downloadCount ?? 0));
}

export function packageUrl(h: Pick<HubHandler, '_id' | 'currentPackage' | 'currentVersion'>): string {
  return `${HUB}/cdn/storage/packages/${h.currentPackage}/original/handler-${h._id}-v${h.currentVersion}.nc`;
}

/**
 * Handlers for a search, best first. A word counts where a word of the handler starts with it ("war" finds
 * "Warfare", not "Software"); the title and game name count double. `match` is "all" when every word was found
 * and "some" otherwise: those are only the closest, not a handler for what was asked. All "all" come first, then
 * by score and downloads. No words: every handler, by downloads.
 */
export function rankHandlers<T extends Pick<HubHandler, 'title' | 'gameName' | 'ownerName' | 'description' | 'downloadCount'>>(list: T[], words: string[]): { h: T; match: 'all' | 'some' }[] {
  const starts = words.map((w) => new RegExp(`(^|[^a-z0-9])${w.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  return list
    .map((h) => {
      const title = `${h.title} ${h.gameName}`.toLowerCase();
      const rest = `${h.ownerName} ${h.description ?? ''}`.toLowerCase();
      const scores = starts.map((r) => (r.test(title) ? 2 : r.test(rest) ? 1 : 0));
      return { h, score: starts.length ? scores.reduce<number>((a, b) => a + b, 0) : 1, match: (scores.every(Boolean) ? 'all' : 'some') as 'all' | 'some' };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => Number(b.match === 'all') - Number(a.match === 'all') || b.score - a.score || (b.h.downloadCount ?? 0) - (a.h.downloadCount ?? 0))
    .map(({ h, match }) => ({ h, match }));
}

export function handlerPageUrl(id: string): string {
  return `${HUB}/handler/${id}`;
}

/** The repository named in our User-Agent, so the Hub's maintainers can reach us. */
export const DEVTOOLS_URL = REPO_URL;
/** Which of our tools sent a request: `vscode-extension`, `ncdev-cli`, `ncdev-lsp` (`ncdev-lsp/<editor>`),
 *  `ncdev-mcp`, `notepadpp-plugin`, `claude-skill`, `workbench`. */
export type HubTool = string;
/** Where in the tool: `hub-list`, `hub-search`, `hub-fetch`, `hub-popular`, `hub-browse` (VS Code's Browse the
 *  Hub), `package-compare` (the guid-changed check); a list request adds where it went: `/index` (our daily index
 *  on GitHub) or `/index-fallback` (the Hub's API, because the index failed). */
export type HubFeature = 'hub-list' | 'hub-search' | 'hub-fetch' | 'hub-popular' | 'hub-browse' | 'package-compare';

/** Lowercase letters, digits, `-`, `+`, `/` and `.` only, short: an id, never free text. */
export const slugId = (s: string) => String(s).toLowerCase().replace(/[^a-z0-9+./-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'unknown';

/**
 * The headers every request to hub.splitscreen.me (and to our Hub index) carries, so the Hub's maintainers can
 * tell our devtools' traffic apart and see which tool and which feature sent it:
 *   User-Agent:       SplitScreenMe-DevTools/<version> (<tool>; <feature>; +<repo>)   (Node callers only; browsers
 *                     don't let a page set it)
 *   X-Requested-With: SplitScreenMe-DevTools/<version> <tool> <feature>              (every caller: the one custom
 *                     request header the Hub's CORS allows)
 * Nothing else: no search text, file paths, handler code, user or machine names, OS details or ids. Free of Node
 * APIs, so the browser workbench can use it too.
 */
export function hubClientHeaders(tool: HubTool, feature: string, version: string, o: { browser?: boolean } = {}): Record<string, string> {
  const v = slugId(version);
  const t = slugId(tool);
  const f = slugId(feature);
  const headers: Record<string, string> = { 'x-requested-with': `SplitScreenMe-DevTools/${v} ${t} ${f}` };
  if (!o.browser) headers['user-agent'] = `SplitScreenMe-DevTools/${v} (${t}; ${f}; +${DEVTOOLS_URL})`;
  return headers;
}
