// Votes on the docs: 👍/👎 per doc part, from people (the workbench's and the docs pages' buttons) and, kept apart,
// from AIs (`ncdev docs vote`, the MCP tool nucleus_vote_doc). A part is "doc/<name>" (the member's doc, human or
// AI-written) or "practice/<name>" (its AI-written "In practice" part). The counts come from a snapshot of the votes
// report (data/doc-votes.json, scripts/doc-votes.mjs; the workbench's build passes a newer one with setDocVotes): the
// tools are static, so a label changes when they are next built.
//
// The rule (AGENTS.md "Docs written by Claude"): an AI-written part with at least 10 votes from people, at least 90% of
// them 👍, is "Verified by people (N votes)". AI votes are shown, but never count towards it.
import snapshot from '../../data/doc-votes.json';

export type DocPart = 'doc' | 'practice';
export interface VoteSnapshot { takenAt?: string; people: Record<string, [number, number]>; ais: Record<string, [number, number]> }
export interface PartVotes { up: number; down: number; aiUp: number; aiDown: number }

export const VERIFY_MIN_VOTES = 10;
export const VERIFY_MIN_SHARE = 0.9;

let votes: VoteSnapshot = snapshot as unknown as VoteSnapshot;
/** A newer snapshot (the workbench's build reads the data branch's votes.json). */
export function setDocVotes(s: VoteSnapshot | null | undefined) {
  if (s && s.people && s.ais) votes = s;
}
export const docVotesTakenAt = () => votes.takenAt ?? '';

export function partVotes(path: string, part: DocPart): PartVotes {
  const [up, down] = votes.people[`${part}/${path}`] ?? [0, 0];
  const [aiUp, aiDown] = votes.ais[`${part}/${path}`] ?? [0, 0];
  return { up, down, aiUp, aiDown };
}

/** People's votes only: at least 10, at least 90% 👍. */
export const verifiedByPeople = (v: PartVotes) => v.up + v.down >= VERIFY_MIN_VOTES && v.up / (v.up + v.down) >= VERIFY_MIN_SHARE;
/** "Verified by people (12 votes)", or '' while it isn't. */
export const verifiedLabel = (v: PartVotes) => (verifiedByPeople(v) ? `Verified by people (${v.up + v.down} votes)` : '');

/** "People: 12 👍 1 👎 · AIs: 4 👍 1 👎" (each only when there are some; '' with none). */
export function votesLine(v: PartVotes): string {
  const parts: string[] = [];
  if (v.up + v.down) parts.push(`People: ${v.up} 👍 ${v.down} 👎`);
  if (v.aiUp + v.aiDown) parts.push(`AIs: ${v.aiUp} 👍 ${v.aiDown} 👎`);
  return parts.join(' · ');
}

/** GoatCounter event paths: people's votes "vote/<part>/<name>/<up|down>" (and undo-…), AIs' "aivote/<part>/<name>/<up|down>". */
export const voteEventPath = (who: 'people' | 'ai', part: DocPart, path: string, v: 'up' | 'down' | 'undo-up' | 'undo-down') => `${who === 'ai' ? 'aivote' : 'vote'}/${part}/${path}/${v}`;
/** The GoatCounter site the votes go to (the workbench's; public, it is in every page of the site). */
export const FEEDBACK_SITE = 'nucleus-workbench';

/** The snapshot from a votes report (the testbench's votes.json: docs, practice, aiDocs, aiPractice; each [{ id, up, down }]).
 *  scripts/doc-votes.mjs writes the same shape into data/doc-votes.json. */
export function snapshotFromReport(report: any): VoteSnapshot {
  const pairs = (list: any, part: DocPart): [string, [number, number]][] => (Array.isArray(list) ? list : []).filter((x) => x && typeof x.id === 'string' && (x.up > 0 || x.down > 0)).map((x) => [`${part}/${x.id}`, [Math.max(0, Number(x.up) || 0), Math.max(0, Number(x.down) || 0)]]);
  return {
    takenAt: String(report?.takenAt ?? '').slice(0, 10),
    people: Object.fromEntries([...pairs(report?.docs, 'doc'), ...pairs(report?.practice, 'practice')]),
    ais: Object.fromEntries([...pairs(report?.aiDocs, 'doc'), ...pairs(report?.aiPractice, 'practice')]),
  };
}
