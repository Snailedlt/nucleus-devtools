// The basis of an AI-written doc part (data/claude-docs.json, claude-practice.json, claude-param-docs.json `basis`:
// { source: [{ project, file, what }], hub: { counted }, engines: true | [families], note }) in words, for the scripts
// (generate-api.mjs's .d.ts, issue-bots.mjs's doc-review comment). The same as core/api.ts aiBasisWords, which the
// tools use (src/test/docs.test.ts checks they agree on every entry).

/** "Nucleus GenericGameHandler.cs (…), ProcessUtil.cs" — the project named only where it changes; the note last. */
function sourceItems(b) {
  let prev = '';
  const out = (b.source ?? []).map((i) => {
    const project = i.project && i.project !== prev ? i.project : '';
    prev = i.project ?? prev;
    const head = [project, i.file ?? ''].filter(Boolean).join(' ');
    return head ? `${head}${i.what ? ` (${i.what})` : ''}` : i.what ?? '';
  });
  return b.note ? [...out, b.note] : out;
}

/** "Nucleus GenericGameHandler.cs (…), ProcessUtil.cs; verified Hub handlers, counted 2026-11-17; Hub game engines (Source)". */
export function basisWords(b) {
  if (!b) return 'the Nucleus source';
  const eng = b.engines ? `Hub game engines${Array.isArray(b.engines) && b.engines.length ? ` (${b.engines.join(', ')})` : ''}` : '';
  return [sourceItems(b).join(', '), b.hub ? `verified Hub handlers, counted ${b.hub.counted}` : '', eng].filter(Boolean).join('; ');
}

/** The source files with the project they belong to, once each: [{ project, file }]. */
export function basisFiles(b) {
  const seen = new Set();
  return (b?.source ?? []).filter((i) => i.file && !seen.has(i.file) && seen.add(i.file)).map((i) => ({ project: i.project ?? '', file: i.file }));
}
