// Reports from every tool (workbench, Learn, VS Code, ncdev, ncdev lsp, Notepad++): which repository and issue form a
// report belongs to, the form's fields filled in, a details block with a checksum (the bot in scripts/issue-bots.mjs
// keeps a copy the reporter can't edit), the same report as text to paste where there's no GitHub account (the
// testers' Discord thread), and a look-up of open issues that may be the same. People never pick a repository: the
// entry point says what the report is about, and this sends it to the right form.
// No imports: the workbench's tools/report-links.test.mjs loads this file on its own. Plain data and fetch only, so it
// runs in the browser, in Node and in VS Code.

export const TOOLS_REPO = 'Snailedlt/splitscreenme-vscode';
export const WORKBENCH_REPO = 'Snailedlt/nucleuscoop-handler-testbench';
/** The testers' thread on the SplitScreen.Me Discord: for people without a GitHub account. */
export const DISCORD_THREAD = 'https://discord.com/channels/142649962839277568/1568403337613680650/1568777762221588531';
export const DISCORD = 'https://discord.gg/XxGMkqCf4r';
export const REDDIT = 'https://www.reddit.com/r/nucleuscoop/';
export const hubHandlerPage = (id: string) => `https://hub.splitscreen.me/handler/${encodeURIComponent(id)}`;

/** What a report is about. */
export type ReportKind =
  | 'problem' // something wrong in a tool
  | 'feature' // "I want to do…"
  | 'check' // this check is wrong
  | 'tryit' // Nucleus did something different from Try it
  | 'error' // the workbench itself failed (caught, never sent by itself)
  | 'docs' // a Docs search found nothing: ask for it to be documented
  | 'stuck'; // stuck in a Learn lesson
/** Where it was opened from. */
export type ReportTool = 'workbench' | 'learn' | 'site' | 'vscode' | 'ncdev' | 'lsp' | 'notepad++' | 'mcp';

/** Where the handler came from. Never its code: only what the report needs to find it again. */
export interface HandlerOrigin {
  kind: 'hub' | 'example' | 'template' | 'own' | 'unknown';
  name?: string;
  hubId?: string;
  hubVersion?: string;
  /** A link that opens it (a workbench share link, a Hub page). */
  link?: string;
}

/** Where a handler came from, read from its code: the Hub.Handler.* lines the Hub writes on upload. */
export function handlerOrigin(code: string | undefined, known: Partial<HandlerOrigin> = {}): HandlerOrigin {
  const text = code ?? '';
  const id = text.match(/^\s*Hub\.Handler\.Id\s*=\s*["']([^"'\r\n]+)["']/m)?.[1];
  const version = text.match(/^\s*Hub\.Handler\.Version\s*=\s*["']?([\w.-]+)/m)?.[1];
  const name = text.match(/^\s*Game\.GameName\s*=\s*["']([^"'\r\n]+)["']/m)?.[1];
  const o: HandlerOrigin = { kind: id ? 'hub' : 'own', ...known };
  if (id && !o.hubId) o.hubId = id;
  if (version && !o.hubVersion) o.hubVersion = version;
  if (name && !o.name) o.name = name;
  if (o.hubId && !o.kind) o.kind = 'hub';
  return o;
}

/** One line saying where the handler came from. */
export function originText(o: HandlerOrigin | undefined): string {
  if (!o) return '';
  const name = o.name ? `${o.name}, ` : '';
  if (o.kind === 'hub' || o.hubId) return `${name}Hub ${o.hubId ?? '?'}${o.hubVersion ? ` v${o.hubVersion}` : ''}${o.hubId ? ` (${hubHandlerPage(o.hubId)})` : ''}`;
  if (o.kind === 'example') return `${name}an example in the tools${o.link ? ` (${o.link})` : ''}`;
  if (o.kind === 'template') return `${name}a template${o.link ? ` (${o.link})` : ''}`;
  if (o.kind === 'own') return `${name}own code (not included)`;
  return `${name}unknown`;
}

export interface ReportInput {
  kind: ReportKind;
  tool: ReportTool;
  /** For ncdev lsp: the editor that asked (Notepad++, Neovim). */
  editor?: string;
  /** "VS Code extension 0.8.0", "ncdev 0.8.0", "workbench 9589434": the form's Version field. */
  version?: string;
  /** Lines for the details block (versions, OS, settings), without a checksum. */
  details?: string[];
  title?: string;
  /** What happened / what Nucleus really did, when the tool already asked for it. */
  what?: string;
  // A check: its id, the message, the first flagged line (1-based) and the flagged lines' code (only if the person
  // chose to include it).
  rule?: string;
  message?: string;
  /** check-wrong.yml's "What's wrong" (one of CHECK_VERDICTS). */
  verdict?: string;
  line?: number;
  code?: string;
  handler?: HandlerOrigin;
  /** Try it: what the simulation showed, compact (simSummary). */
  sim?: string;
  /** The workbench's own error. */
  error?: { message: string; stack?: string; count?: number };
  /** A Docs search that found nothing. */
  query?: string;
  /** A Learn lesson: its id and title. */
  lesson?: { id: string; title: string };
  /** For a feature request: the area, when the tool knows it. */
  area?: string;
}

export interface Report {
  repo: string;
  template: string;
  title: string;
  /** The form's fields by id, as the link fills them. */
  fields: Record<string, string>;
  /** The prefilled form. */
  url: string;
  /** The same report as text, for people without a GitHub account (paste it in the Discord thread). */
  text: string;
  /** A GitHub search for open issues that may be the same (searchUrl), or '' when there's nothing stable to match. */
  search: string;
  /** The details block, with its checksum. */
  details: string;
}

/** The forms these links fill: their field labels by id (the form's own words, for the copied text; src/test/bots.test.ts
 *  checks them against .github/ISSUE_TEMPLATE in both repositories). */
export const FORMS: Record<string, { repo: string; name: string; labels: Record<string, string> }> = {
  'tester-feedback.yml': { repo: TOOLS_REPO, name: 'Tester feedback', labels: { area: 'Where', what: 'What happened, and what did you expect?', simulated: 'What Try it showed', handler: 'Handler', version: 'Version', context: 'Details from the tool' } },
  'check-wrong.yml': { repo: TOOLS_REPO, name: 'This check is wrong', labels: { rule: 'Which check', message: 'What it said', verdict: "What's wrong", what: 'What Nucleus really does', code: 'The flagged code', handler: 'Where the handler is from', version: 'Version', context: 'Details from the tool' } },
  'feature-request.yml': { repo: TOOLS_REPO, name: 'I want to do…', labels: { goal: 'What are you trying to do?', blocker: "What's in the way?", idea: 'How could it work? (optional)', area: 'Where', code: 'Code (optional)', version: 'Version', context: 'Details from the tool' } },
  'feedback.yml': { repo: WORKBENCH_REPO, name: 'Feedback', labels: { area: 'Where', what: 'What happened, and what did you expect?', error: 'The error', handler: 'Handler', version: 'Version', context: 'Details from the tool' } },
  'wb-feature-request.yml': { repo: WORKBENCH_REPO, name: 'I want to do…', labels: { goal: 'What are you trying to do?', blocker: "What's in the way?", idea: 'How could it work? (optional)', area: 'Where', code: 'Code (optional)', version: 'Version', context: 'Details from the tool' } },
};
/** The workbench's feature request form has the same file name as the tools' one; FORMS keys it apart. */
const fileOf = (key: string) => key.replace(/^wb-/, '');

/** The "Where" choices of the tools' forms (tester-feedback.yml and feature-request.yml). */
export const TOOLS_AREAS = {
  checks: 'Checks (a wrong or missing warning)',
  tryit: 'Try it or the debugger (what it says Nucleus does is wrong)',
  docs: 'Suggestions, hovers or docs',
  vscode: 'VS Code extension',
  npp: 'Notepad++ plugin',
  ncdev: 'ncdev (command line)',
  lsp: 'Another editor (through ncdev lsp)',
  agents: 'AI agent kit (Claude Code plugin, MCP)',
  other: 'Something else',
} as const;
/** The "Where" choices of the workbench's forms (feedback.yml and feature-request.yml there). */
export const WORKBENCH_AREAS = { workbench: 'Workbench', learn: 'Learn', pages: 'Docs and check pages', home: 'Home and tools pages', other: 'Something else' } as const;
/** check-wrong.yml's "What's wrong" choices. */
export const CHECK_VERDICTS = ["It's a false alarm (the handler works in Nucleus)", 'The explanation or the fix is wrong', 'Something else'] as const;

const web = (t: ReportTool) => t === 'workbench' || t === 'learn' || t === 'site';
function toolArea(t: ReportTool): string {
  return t === 'vscode' ? TOOLS_AREAS.vscode : t === 'notepad++' ? TOOLS_AREAS.npp : t === 'ncdev' ? TOOLS_AREAS.ncdev : t === 'lsp' ? TOOLS_AREAS.lsp : t === 'mcp' ? TOOLS_AREAS.agents : TOOLS_AREAS.other;
}
function webArea(t: ReportTool): string {
  return t === 'learn' ? WORKBENCH_AREAS.learn : t === 'site' ? WORKBENCH_AREAS.home : WORKBENCH_AREAS.workbench;
}

/** FNV-1a over the lines: the same function as the issue bot's (scripts/issue-bots.mjs) and the workbench's
 *  (playground/src/checksum.ts); src/test/report.test.ts checks they agree. */
export function checksum(lines: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of lines.map((l) => l.trim()).filter(Boolean).join('\n')) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
/** The details lines with their checksum as the last line. */
export function withChecksum(lines: string[]): string {
  const l = lines.map((x) => x.replace(/[\r\n]+/g, ' ').trim()).filter(Boolean);
  return [...l, `Check: ${checksum(l)}`].join('\n');
}

const one = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
/** Text cut to a size, on a line boundary where it can, saying it was cut. */
export function cut(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max);
  const at = head.lastIndexOf('\n');
  return `${at > max / 2 ? head.slice(0, at) : head}\n… (cut: ${s.length - (at > max / 2 ? at : max)} more characters)`;
}

/** The workbench error's id: its message with numbers and addresses taken out, and the top frames' function names,
 *  so the same error groups once (in the page, with a count) and on GitHub (the id is searched for). */
export function errorId(message: string, stack = ''): string {
  const msg = normalizeError(message);
  const frames = stack
    .split('\n')
    .map((l) => l.trim().match(/^at (?:async )?([\w$.<>]+) \(|^([\w$.<>]+)@/))
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m![1] ?? m![2]);
  return checksum([msg, ...frames]);
}
/** An error message without what changes between runs (numbers, URLs, quoted values longer than a name). */
export function normalizeError(message: string): string {
  return String(message)
    .replace(/\b(?:https?|blob|data|chrome-extension|moz-extension):\S+/g, '<url>')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/** The form, its fields and title for a report. */
export function buildReport(r: ReportInput): Report {
  const version = r.version ?? '';
  const origin = r.handler ? originText(r.handler) : '';
  const extra: string[] = [];
  let key: string;
  let title = r.title ?? '';
  const f: Record<string, string> = {};
  let search = '';
  switch (r.kind) {
    case 'check': {
      key = 'check-wrong.yml';
      title ||= `Check is wrong: ${r.rule ?? '?'}`;
      Object.assign(f, { rule: r.rule ?? '', message: one(r.message ?? '', 300), verdict: r.verdict ?? '', what: r.what ?? '', code: r.code ?? '', handler: origin });
      extra.push(`Report: this check is wrong`, `Rule: ${r.rule ?? '?'}`, r.line ? `Line: ${r.line}` : '');
      if (r.rule) search = `"Check is wrong: ${r.rule}" in:title`;
      break;
    }
    case 'tryit':
      key = 'tester-feedback.yml';
      title ||= 'Try it: Nucleus did something different';
      Object.assign(f, { area: TOOLS_AREAS.tryit, what: r.what ?? '', simulated: r.sim ?? '', handler: origin });
      extra.push('Report: Nucleus did something different from Try it');
      break;
    case 'error': {
      key = 'feedback.yml';
      const id = errorId(r.error?.message ?? '', r.error?.stack);
      title ||= `${r.tool === 'learn' ? 'Learn' : 'Workbench'} error: ${one(r.error?.message ?? 'unknown', 80)}`;
      Object.assign(f, { area: webArea(r.tool), what: r.what ?? '', error: `${r.error?.message ?? ''}\n${r.error?.stack ?? ''}`.trim() });
      extra.push(`Report: an error in the ${r.tool === 'learn' ? 'Learn page' : 'workbench'}`, `Error id: ${id}`, r.error?.count && r.error.count > 1 ? `Seen: ${r.error.count} times in this visit` : '');
      search = `"Error id: ${id}" in:body`;
      break;
    }
    case 'docs':
      key = 'feature-request.yml';
      title ||= `Document: ${one(r.query ?? '', 60)}`;
      Object.assign(f, { area: TOOLS_AREAS.docs, goal: r.what ?? `Find the docs for "${r.query ?? ''}".`, blocker: `A Docs search for "${r.query ?? ''}" finds nothing.` });
      extra.push('Report: ask for this to be documented', `Search: ${one(r.query ?? '', 80)}`);
      if (r.query?.trim()) search = `"${one(r.query, 60).replace(/"/g, '')}" in:title`;
      break;
    case 'stuck':
      key = 'wb-feature-request.yml';
      title ||= `Stuck in Learn: ${r.lesson?.title ?? '?'}`;
      Object.assign(f, { area: WORKBENCH_AREAS.learn, goal: `Finish the lesson "${r.lesson?.title ?? '?'}".`, blocker: r.what ?? '', code: r.code ?? '' });
      extra.push(`Report: stuck in a Learn lesson`, `Lesson: ${r.lesson?.id ?? '?'}`);
      if (r.lesson) search = `"Stuck in Learn: ${r.lesson.title.replace(/"/g, '')}" in:title`;
      break;
    case 'feature':
      key = web(r.tool) ? 'wb-feature-request.yml' : 'feature-request.yml';
      Object.assign(f, { area: r.area ?? (web(r.tool) ? webArea(r.tool) : toolArea(r.tool)), goal: r.what ?? '', code: r.code ?? '' });
      extra.push('Report: a feature request');
      break;
    default:
      key = web(r.tool) ? 'feedback.yml' : 'tester-feedback.yml';
      Object.assign(f, { area: r.area ?? (web(r.tool) ? webArea(r.tool) : toolArea(r.tool)), what: r.what ?? '', handler: origin });
      extra.push('Report: a problem');
  }
  const form = FORMS[key];
  if (version) f.version = version;
  const details = withChecksum([...(r.details ?? []), ...(r.editor ? [`Editor: ${r.editor}`] : []), ...(origin ? [`Handler: ${origin}`] : []), ...extra]);
  f.context = details;
  for (const k of Object.keys(f)) if (!f[k]) delete f[k];
  // Room on the link: GitHub refuses very long addresses, so the biggest free-text fields are cut first.
  const size = () => formUrl(form.repo, fileOf(key), title, f).length;
  const fit = (budget: number) => {
    for (const k of ['code', 'error', 'simulated', 'what', 'blocker']) {
      for (let i = 0; i < 6 && f[k] && f[k].length > 200 && size() > budget; i++) {
        // Encoded text is longer than the text: shrink by the ratio, a little more each round.
        f[k] = cut(f[k], Math.max(200, Math.floor(f[k].length * (budget / size()) * 0.8)));
      }
    }
  };
  fit(7000);
  const url = formUrl(form.repo, fileOf(key), title, f);
  return { repo: form.repo, template: fileOf(key), title, fields: f, url, text: reportText(key, title, f), search, details };
}

function formUrl(repo: string, template: string, title: string, fields: Record<string, string>): string {
  const q = new URLSearchParams({ template });
  if (title) q.set('title', title);
  for (const [k, v] of Object.entries(fields)) q.set(k, v);
  return `https://github.com/${repo}/issues/new?${q}`;
}

/** The report as Markdown text to paste (Discord, a forum): the form's labels and answers, the details in a block. */
function reportText(key: string, title: string, f: Record<string, string>): string {
  const form = FORMS[key];
  const out = [`**${title || form.name}** (${form.name}, SplitScreen.Me tools)`];
  for (const [id, label] of Object.entries(form.labels)) {
    if (id === 'context' || !f[id]) continue;
    const v = cut(f[id], id === 'code' || id === 'error' || id === 'simulated' ? 700 : 500);
    out.push(v.includes('\n') ? `**${label}**\n\`\`\`${id === 'code' ? 'js' : ''}\n${v.replace(/```/g, "'''")}\n\`\`\`` : `**${label}** ${v}`);
  }
  out.push(`\`\`\`text\n${f.context}\n\`\`\``);
  return out.join('\n');
}

// ------------------------------------------------------------------------------------------------------------------
// Possible duplicates: GitHub's search, without signing in (10 searches a minute per address), so answers are kept
// and a failure (offline, rate limited) just means no list.

export interface IssueHit { number: number; title: string; url: string; thumbs: number; comments: number }
/** The search API address for a report's query in its repository (open issues only). */
export function searchUrl(repo: string, query: string): string {
  return `https://api.github.com/search/issues?per_page=5&q=${encodeURIComponent(`repo:${repo} is:issue is:open ${query}`)}`;
}
export function parseSearch(json: unknown): IssueHit[] {
  const items = (json as { items?: any[] })?.items;
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && typeof i.number === 'number' && typeof i.html_url === 'string' && !i.pull_request && /^https:\/\/github\.com\/Snailedlt\//.test(i.html_url))
    .map((i) => ({ number: i.number, title: String(i.title ?? ''), url: i.html_url, thumbs: Number(i.reactions?.['+1'] ?? 0), comments: Number(i.comments ?? 0) }));
}
const found = new Map<string, { at: number; hits: IssueHit[] }>();
/** Open issues that may be the same as this report; [] when there's nothing to match or GitHub can't be reached. */
export async function findDuplicates(report: Pick<Report, 'repo' | 'search'>, o: { fetch?: typeof fetch; timeoutMs?: number; userAgent?: string } = {}): Promise<IssueHit[]> {
  if (!report.search) return [];
  const url = searchUrl(report.repo, report.search);
  const kept = found.get(url);
  if (kept && Date.now() - kept.at < 10 * 60_000) return kept.hits;
  const f = o.fetch ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!f) return [];
  const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
  const timer = setTimeout(() => ctl?.abort(), o.timeoutMs ?? 4000);
  try {
    const res = await f(url, { headers: { accept: 'application/vnd.github+json', ...(o.userAgent ? { 'user-agent': o.userAgent } : {}) }, signal: ctl?.signal });
    if (!res.ok) return [];
    const hits = parseSearch(await res.json());
    found.set(url, { at: Date.now(), hits });
    return hits;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------------------------------------------------------
// A problem with one Hub handler (the game doesn't start, a mod is missing) isn't ours to fix: it belongs with the
// handler's author on the Hub, or on the community's Discord and Reddit.

export interface HandlerHelp { title: string; links: { label: string; url: string }[]; note: string }
export function handlerHelp(o: HandlerOrigin | undefined): HandlerHelp {
  const links = [
    ...(o?.hubId ? [{ label: "The handler's Hub page (comments, its author)", url: hubHandlerPage(o.hubId) }] : []),
    { label: 'Ask on the SplitScreen.Me Discord', url: DISCORD },
    { label: 'Ask on r/nucleuscoop', url: REDDIT },
  ];
  return {
    title: 'A problem in this handler',
    links,
    note: "Problems with one handler (a game that doesn't start, splits wrong, or needs a fix in the handler) are for its author and the community, not these tools: we can't fix other people's handlers.",
  };
}

/** The question that sends a report to the right place, when a Hub handler is open. */
export const HANDLER_OR_TOOLS = {
  question: 'Is the problem in the tools, or in this handler?',
  tools: 'In the tools (a check, Try it, the editor)',
  handler: "In this handler (the game doesn't work right)",
};

// ------------------------------------------------------------------------------------------------------------------
// Try it's result, compact, for "Nucleus did something different".

export interface SimLike {
  loaded: boolean;
  loadError?: string;
  sessionEnded?: unknown;
  players: { index: number; window: string; startArguments?: string; effects: string[]; error?: string }[];
  ignored?: string[];
}
/** What Try it showed, in a few lines: each player's window, arguments and file changes (counted when long). */
export function simSummary(r: SimLike, o: { players: number; keyboard?: string; resolution?: string } = { players: r.players.length }): string {
  const head = `Try it: ${o.players} player${o.players === 1 ? '' : 's'}${o.resolution ? `, ${o.resolution}` : ''}${o.keyboard ? `, keyboard: ${o.keyboard}` : ''}`;
  if (!r.loaded) return `${head}\nThe handler doesn't load: ${one(r.loadError ?? '?', 200)}`;
  const lines = [head, ...(r.sessionEnded ? ['The session ends (an error in Game.Play or a callback).'] : [])];
  for (const p of r.players) {
    lines.push(`Player ${p.index + 1}: ${one(p.window, 100)}${p.startArguments ? ` · args: ${one(p.startArguments, 160)}` : ''}${p.error ? ` · error: ${one(p.error, 160)}` : ''}`);
    for (const e of p.effects.slice(0, 6)) lines.push(`  - ${one(e, 140)}`);
    if (p.effects.length > 6) lines.push(`  - …and ${p.effects.length - 6} more changes`);
  }
  if (r.ignored?.length) lines.push(`Settings Nucleus skips: ${r.ignored.length}`);
  return cut(lines.join('\n'), 1500);
}
