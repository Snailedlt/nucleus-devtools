// The groups Docs browses (Game, Context, ProtoInput…) and the AI-written docs nobody has checked yet. No DOM:
// links.ts' docsView uses the keys (#docs-Context opens the group), and tools/links.test.mjs checks them.
import { allEntries } from '@core/lookup';
import { DOCS_GROUPS } from '@core/docspage';

export interface ApiGroup {
  key: string;
  title: string;
  doc: string;
  match: (path: string) => boolean;
}

let uncheckedCache: Set<string> | undefined;
/** The docs AI wrote that no person has checked yet. */
export const unchecked = () => (uncheckedCache ??= new Set(allEntries(true).filter((e) => e.member.docBy === 'claude' && !e.member.docCheckedBy).map((e) => e.path)));

// Docs with nothing typed: what's in it, so it's clear what can be found there.
export const API_GROUPS: ApiGroup[] = [
  // The docs Claude wrote that no person has checked yet: handler authors can confirm or correct them (👍/👎, an issue).
  { key: 'AI', title: 'AI-written: please check', doc: '✨ Written by AI, not yet checked by a person. Know how one works? Vote 👍 or 👎 at the bottom of its page.', match: (p) => unchecked().has(p) },
  // The rest are the core's groups (core/docspage.ts), the same ones the docs pages and VS Code's Docs panel use.
  ...DOCS_GROUPS,
];
export const API_GROUP_KEYS = API_GROUPS.map((g) => g.key);
/** The group a name is listed in (not the AI one). */
export const groupOf = (path: string) => API_GROUPS.find((g) => g.key !== 'AI' && g.match(path));
