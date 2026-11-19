// Vote counts for the Docs card's [👍] score [👎], as the docs pages show them: the build's daily snapshot
// (BUILD.docVotes, core/docvotes), then live from GoatCounter's public counter (BUILD.counts: the feedback site, or
// for previews the live site's, read only) so a score is about a minute behind. People's votes make the score; AIs'
// are in the tooltip only.
import { partVotes, setDocVotes, type DocPart, type PartVotes, type VoteSnapshot } from '@core/docvotes';

declare const BUILD: { docVotes?: VoteSnapshot | null; counts?: string | null };
setDocVotes(typeof BUILD !== 'undefined' ? BUILD.docVotes : null);

/** Live counts and `base`: this browser's vote when they were read (the counts hold it, if it had been sent). */
export type LiveVotes = PartVotes & { base: string };
const live = new Map<string, Promise<LiveVotes | null>>();
const n = (site: string, p: string) =>
  fetch(`https://${site}.goatcounter.com/counter/${encodeURIComponent(p)}.json`)
    .then((r) => {
      if (r.status === 404) return { count: '0' }; // nobody has voted that way yet
      if (!r.ok) throw new Error(`counter ${r.status}`); // any other error: keep the snapshot
      return r.json();
    })
    .then((j: { count?: unknown }) => parseInt(String(j.count).replace(/\D/g, ''), 10) || 0);

/** The snapshot's counts now. */
export const snapshotVotes = (path: string, part: DocPart) => partVotes(path, part);

/** Live counts (once per page load and part), or null when the counter can't be reached or none is set. `base` is this
 *  browser's vote now; the result keeps the one from when the counts were read, so a cached read is never combined
 *  with a vote changed since. */
export function liveVotes(path: string, part: DocPart, base = ''): Promise<LiveVotes | null> {
  const site = typeof BUILD !== 'undefined' ? BUILD.counts : null;
  const key = `${part}/${path}`;
  if (!site || typeof fetch === 'undefined') return Promise.resolve(null);
  if (!live.has(key)) {
    const k = ['up', 'down', 'undo-up', 'undo-down'];
    live.set(key, Promise.all([...k.map((x) => n(site, `vote/${key}/${x}`)), ...k.map((x) => n(site, `aivote/${key}/${x}`))])
      .then((c) => ({ up: Math.max(0, c[0] - c[2]), down: Math.max(0, c[1] - c[3]), aiUp: Math.max(0, c[4] - c[6]), aiDown: Math.max(0, c[5] - c[7]), base }))
      .catch(() => null));
  }
  return live.get(key)!;
}

export const scoreText = (n: number) => (n < 0 ? `−${-n}` : String(n));
/** The tooltip, as the docs pages' (site-chrome.mjs voteTipText). */
export function voteTipText(up: number, down: number, aiUp: number, aiDown: number) {
  const ppl = up + down ? `👤 People: ${up} 👍 · ${down} 👎 (${Math.round((100 * up) / (up + down))}% 👍)` : '👤 People: no votes yet';
  const ai = aiUp + aiDown ? `🤖 AIs: ${aiUp} 👍 · ${aiDown} 👎` : '🤖 AIs: no votes yet';
  return `${ppl}\n${ai}\nScore ${scoreText(up - down)}: people’s 👍 minus 👎 (AIs never count).`;
}
