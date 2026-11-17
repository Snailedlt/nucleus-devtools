// AI votes on the docs: an AI agent that checked a doc (or its "In practice" part) against the Nucleus source or a
// handler that works says whether it is right (`ncdev docs vote`, the MCP tool nucleus_vote_doc). Sent to the same
// GoatCounter site as people's votes, under their own event names ("aivote/<part>/<name>/<up|down>"), so they are
// counted and shown apart and never count towards "Verified by people" (core/docvotes.ts). Only that path is sent: no
// handler code, no names, nothing about the person or the machine (GoatCounter sees the address the request comes
// from, as for any page view, and doesn't keep it). Off with DO_NOT_TRACK=1 or NCDEV_NO_FEEDBACK=1.
import { lookup, Entry } from './core/lookup';
import { DocPart, FEEDBACK_SITE, voteEventPath } from './core/docvotes';

export interface AiVoteResult { ok: boolean; message: string; path?: string; part?: DocPart; vote?: 'up' | 'down' }

const sent = new Set<string>();

/** Checks the vote (a real member, a part it has) and sends it. `fetchImpl` for tests. */
export async function sendAiVote(name: string, part: string, vote: string, version: string, fetchImpl: typeof fetch = fetch): Promise<AiVoteResult> {
  if (part !== 'doc' && part !== 'practice') return { ok: false, message: `part must be "doc" (the member's doc) or "practice" (its AI-written "In practice" part), not ${JSON.stringify(part)}.` };
  if (vote !== 'up' && vote !== 'down') return { ok: false, message: `vote must be "up" (it is right) or "down" (it is wrong or unclear), not ${JSON.stringify(vote)}.` };
  const r = lookup(String(name ?? ''));
  const e: Entry | undefined = r.kind === 'entries' && r.entries.length === 1 ? r.entries[0] : undefined;
  if (!e) return { ok: false, message: `${JSON.stringify(name)} is not one API member${r.kind === 'none' && r.didYouMean ? ` (did you mean ${r.didYouMean}?)` : ''}. Give its full name, e.g. "Game.KillMutex".` };
  if (part === 'doc' && !e.member.doc) return { ok: false, message: `${e.path} has no doc to vote on.` };
  if (part === 'practice' && !e.member.practice) return { ok: false, message: `${e.path} has no "In practice" part to vote on.` };
  if (process.env.DO_NOT_TRACK === '1' || process.env.NCDEV_NO_FEEDBACK === '1') return { ok: false, message: 'Not sent: DO_NOT_TRACK or NCDEV_NO_FEEDBACK is set.' };
  const key = `${part}/${e.path}`;
  if (sent.has(key)) return { ok: true, message: `Already voted on ${key} in this session.`, path: e.path, part, vote };
  const site = (process.env.NCDEV_FEEDBACK_SITE ?? FEEDBACK_SITE).trim();
  if (!/^[a-z0-9-]{2,50}$/.test(site)) return { ok: false, message: `NCDEV_FEEDBACK_SITE ${JSON.stringify(site)} isn't a GoatCounter site code.` };
  const url = `https://${site}.goatcounter.com/count?p=${encodeURIComponent('/' + voteEventPath('ai', part, e.path, vote))}&e=true&rnd=${Math.random().toString(36).slice(2)}`;
  try {
    const res = await fetchImpl(url, { headers: { 'User-Agent': `ncdev/${version} (SplitScreen.Me docs AI vote)` } });
    if (!res.ok) return { ok: false, message: `The vote counter answered ${res.status}.` };
  } catch (err) {
    return { ok: false, message: `Could not reach the vote counter: ${(err as Error).message}` };
  }
  sent.add(key);
  return { ok: true, message: `AI vote ${vote === 'up' ? '👍' : '👎'} on ${part === 'doc' ? 'the doc' : 'the "In practice" part'} of ${e.path} sent. It is counted with the AI votes, apart from people's, and shows in the docs after their next build.`, path: e.path, part, vote };
}
