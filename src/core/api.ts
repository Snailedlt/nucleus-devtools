// Typed access to the generated Nucleus handler API model (data/nucleus-api.json).
import raw from '../../data/nucleus-api.json';
import { JS_FUNCTIONS, JS_GLOBAL_OBJECTS, JS_OBJECTS, isJsBuiltin, mdnUrl } from './jsbuiltins';
import { DOTNET_OBJECTS } from './dotnet';
import { prettyCode, prettySignature } from './pretty';
import { DocPart, partVotes, verifiedLabel, votesLine } from './docvotes';

export type SimpleType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'string[]'
  | 'number[]'
  | 'boolean[]'
  | 'function'
  | 'array'
  | 'void'
  | 'any'
  | `enum:${string}`;

export interface Param {
  name: string;
  type: string;
  csType?: string;
  rest?: boolean;
  optional?: boolean;
  /** What to pass, in plain words (JavaScript's from TypeScript's docs; Nucleus' from data/claude-docs.json). */
  doc?: string;
  /** The doc was written by Claude (AI) from the source. */
  docBy?: 'claude';
}
export interface Overload {
  returns: string;
  params: Param[];
}
export interface Member {
  kind: 'field' | 'property' | 'method' | 'object';
  csType?: string;
  type?: SimpleType;
  ts?: string;
  ref?: string;
  default?: string;
  readonly?: boolean;
  internal?: boolean;
  /** One of the handler's own functions (its return type worked out from its code), not a Nucleus member. */
  own?: boolean;
  required?: boolean;
  doc: string;
  /** Set when the doc was written by Claude (data/claude-docs.json) rather than taken from the official docs. */
  docBy?: 'claude';
  /** What a Claude-written doc is based on (source files and functions, Hub data): AiBasis. */
  docBasis?: AiBasis;
  /** A person who checked a Claude-written doc against Nucleus (data/claude-docs.json "checkedBy"), and when. */
  docCheckedBy?: string;
  docCheckedOn?: string;
  example?: string;
  /** Where the example comes from when not the official docs: 'claude' (AI-written, data/claude-practice.json), 'hub'
   *  (the most common value or call in Hub handlers, data/hub-examples.json) or 'generated' (from its type). */
  exampleBy?: 'claude' | 'hub' | 'generated';
  /** What a 'hub' or 'generated' example is ("From Hub handlers", no counts). */
  exampleNote?: string;
  /** Where the example goes in a handler: 'top' (the top level), 'Game.Play' or another callback. */
  exampleIn?: string;
  /** "In practice": what it really does in Nucleus' source and how Hub handlers use it, written by Claude (AI) from
   *  them (data/claude-practice.json), apart from `doc`. */
  practice?: string;
  practiceBasis?: AiBasis;
  /** What the AI-written parameter docs are based on (data/claude-param-docs.json basis). */
  paramsBasis?: AiBasis;
  practiceCheckedBy?: string;
  practiceCheckedOn?: string;
  /** How many of the verified Hub handlers use it (api.hubHandlers.count of them). */
  hubUse?: number;
  /** Per engine family with enough Hub handlers (api.hubHandlers.engines): how many of its handlers use it. */
  engineUse?: Record<string, number>;
  /** "By engine: more common in Unreal Engine games, rarer in Unity games." (no counts: those are in `engineUse`): only where an engine
   *  family uses it notably more or less than all handlers (scripts/hub-engines.mjs engineLine). Mechanical, not
   *  AI-written; shown with "In practice", or alone. */
  byEngine?: string;
  category?: string;
  deprecated?: string;
  /** Legacy input option the Proto Input guide says to set to false. */
  protoInputLegacy?: boolean;
  overloads?: Overload[];
}
export interface ApiObject {
  doc: string;
  members: Record<string, Member>;
  /** Not every member is listed (.NET `System.*`): an unlisted one is allowed unless it looks like a typo. */
  open?: boolean;
}
export interface NucleusClass {
  doc: string;
  /** Parameters of the (first) constructor. */
  params: string[];
  /** All constructors, when there is more than one (or none: a static class). */
  constructors?: string[][];
  /** Static members, as an object in `objects` (Nucleus.Globals). */
  statics?: string;
  /** What `new` returns, as an object in `objects` (Nucleus.IniFile). */
  instance?: string;
}
export const constructorsOf = (c: NucleusClass): string[][] => c.constructors ?? [c.params];

export interface GlobalInfo {
  type: string;
  doc: string;
  topLevel: boolean;
  /** Known (no lint warnings) but not offered in completion, e.g. Hub: written by the Hub on upload. */
  hidden?: boolean;
}
export interface EnumInfo {
  doc?: string;
  values: Record<string, number>;
}
export interface ApiModel {
  source: { nucleus: string | null; www: string | null };
  jint: string | null;
  globals: Record<string, GlobalInfo>;
  objects: Record<string, ApiObject>;
  enums: Record<string, EnumInfo>;
  nucleusClasses: Record<string, NucleusClass>;
  /** The verified Hub handlers `hubUse` counts are from (data/hub-examples.json). */
  hubHandlers?: { count: number; takenAt: string; /** Handlers per engine family (data/hub-engines.json), families with enough of them. */ engines?: Record<string, number> };
}

/** The model as objects without a prototype: a name typed in a handler (`toString`, `constructor`, `__proto__`) is
 *  never mistaken for a member, an enum or a docs page. */
function bare(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(bare);
  if (!v || typeof v !== 'object') return v;
  const o = Object.create(null);
  for (const [k, x] of Object.entries(v)) o[k] = bare(x);
  return o;
}
export const api = bare(raw) as ApiModel;
// .NET `System.*`, written by hand (core/dotnet.ts): the generator only reads the Nucleus sources.
Object.assign(api.objects, DOTNET_OBJECTS);
if (api.globals.System) api.globals.System = { ...api.globals.System, type: 'System', doc: DOTNET_OBJECTS.System.doc };

export const DOCS_URL = 'https://www.splitscreen.me/docs/handler-api';

/** What a resolved expression refers to. */
export type Resolved =
  | { kind: 'object'; type: string; of?: string } // an ApiObject (Game, Context, GameHook, ...); `of`: an Array's element type
  | { kind: 'list'; of: string } // PlayerList
  | { kind: 'nucleus' } // the Nucleus namespace
  | { kind: 'enum'; name: string } // Nucleus.Folder
  | { kind: 'enumValue'; enumName: string; value: string }
  | { kind: 'nucleusClass'; name: string }
  | { kind: 'member'; owner: string; name: string; member: Member }
  | { kind: 'opaque' }; // something we don't model (System.*, Handler, Record values, ...)

/** Type name of an API object, from a TS type string like "GameHook" or "PlayerInfo[]". */
export function objectTypeOf(ts: string | undefined): string | undefined {
  if (!ts) return undefined;
  return api.objects[ts] ? ts : undefined;
}

/** An API object by name; also JavaScript's own (String, Array, Math, JSON, Number: core/jsbuiltins.ts). */
export function objectOf(type: string): ApiObject | undefined {
  return api.objects[type] ?? JS_OBJECTS[type];
}
/** The object a value of TypeScript type `ts` is (`string` -> String, `number` -> Number, `string[]` -> an Array of
 *  strings, an API object by name), for the members of an expression's result. */
export function valueTypeOf(ts: string | undefined): Resolved | undefined {
  if (!ts) return undefined;
  const t = ts.replace(/\s*\|\s*(null|undefined)\b/g, '').trim();
  if (t === 'string') return { kind: 'object', type: 'String' };
  if (t === 'number') return { kind: 'object', type: 'Number' };
  const arr = /^(.+)\[\]$/.exec(t) ?? /^Array<(.+)>$/.exec(t);
  if (arr) return { kind: 'object', type: 'Array', of: arr[1] };
  if (/^RegExp(Match|Exec)Array$/.test(t)) return { kind: 'object', type: 'Array', of: 'string' };
  if (api.objects[t]) return { kind: 'object', type: t };
  return undefined;
}
/** What a field or property's value is, when it's a string, number or list (for `.` after it). */
function valueObject(m: Member): Resolved | undefined {
  if (m.kind === 'method' || m.kind === 'object') return undefined;
  const v = valueTypeOf(m.ts ?? m.type);
  return v && v.kind === 'object' && (v.type === 'String' || v.type === 'Number' || v.type === 'Array') ? v : undefined;
}
/** What calling `base` gives back: its return type (the first overload's). */
export function resolveCall(base: Resolved): Resolved | undefined {
  if (base.kind !== 'member' || base.member.kind !== 'method') return undefined;
  return valueTypeOf(base.member.overloads?.[0]?.returns);
}

/** A field or property that holds a string: its value has JavaScript's string methods. */
export const isStringMember = (m: Member) => m.kind !== 'method' && m.kind !== 'object' && (m.type === 'string' || m.ts === 'string');

export function resolveGlobal(name: string): Resolved | undefined {
  // JavaScript's Math and JSON, and its global functions (parseInt…): for hover, completion and parameter hints.
  if (JS_GLOBAL_OBJECTS.includes(name) && !api.globals[name]) return { kind: 'object', type: name };
  if (JS_FUNCTIONS[name] && !api.globals[name]) return { kind: 'member', owner: '', name, member: JS_FUNCTIONS[name] };
  const g = api.globals[name];
  if (!g) return undefined;
  if (name === 'Nucleus') return { kind: 'nucleus' };
  if (name === 'PlayerList') return { kind: 'list', of: 'PlayerInfo' };
  if (api.objects[g.type]) return { kind: 'object', type: g.type };
  return { kind: 'opaque' };
}

export interface StepResult {
  resolved?: Resolved;
  /** Set when `name` is not a member of a modelled object. */
  unknown?: { owner: string; ownerLabel: string; candidates: string[] };
}

/**
 * Jint 2.x (ObjectWrapper.EqualsIgnoreCasing) matches .NET member names with only the
 * FIRST character case-insensitive: `Context.width` finds `Width`, but
 * `Game.IgnoreWindowBordercheck` does not find `IgnoreWindowBorderCheck`.
 */
export function jintMemberName(members: Record<string, unknown>, name: string): string | undefined {
  if (name in members) return name;
  if (!name) return undefined;
  const alt = (name[0] === name[0].toUpperCase() ? name[0].toLowerCase() : name[0].toUpperCase()) + name.slice(1);
  return alt in members ? alt : undefined;
}

/** Resolve `.name` on top of `base`. */
export function resolveMember(base: Resolved, name: string): StepResult {
  switch (base.kind) {
    case 'object': {
      const obj = objectOf(base.type)!;
      const key = jintMemberName(obj.members, name);
      if (!key && obj.open && !looksLikeTypo(name, Object.keys(obj.members))) return { resolved: { kind: 'opaque' } };
      if (!key) return { unknown: { owner: base.type, ownerLabel: base.type, candidates: Object.keys(obj.members) } };
      return { resolved: { kind: 'member', owner: base.type, name: key, member: obj.members[key] } };
    }
    case 'member': {
      const ref = base.member.ref;
      if (base.member.kind === 'object' && ref && api.objects[ref]) return resolveMember({ kind: 'object', type: ref }, name);
      if (isStringMember(base.member)) return resolveMember({ kind: 'object', type: 'String' }, name);
      const v = valueObject(base.member);
      if (v) return resolveMember(v, name);
      return { resolved: { kind: 'opaque' } };
    }
    case 'list':
      if (name === 'Count') return { resolved: { kind: 'opaque' } };
      return { resolved: { kind: 'opaque' } };
    case 'nucleus': {
      if (api.enums[name]) return { resolved: { kind: 'enum', name } };
      if (api.nucleusClasses[name]) return { resolved: { kind: 'nucleusClass', name } };
      // Sub-namespaces (e.g. Nucleus.Coop) and other types are reachable but not modelled.
      if (/^[A-Z]/.test(name) && !looksLikeTypo(name, [...Object.keys(api.enums), ...Object.keys(api.nucleusClasses)])) {
        return { resolved: { kind: 'opaque' } };
      }
      return { unknown: { owner: 'Nucleus', ownerLabel: 'Nucleus', candidates: [...Object.keys(api.enums), ...Object.keys(api.nucleusClasses)] } };
    }
    case 'enum': {
      const e = api.enums[base.name];
      if (!(name in e.values)) return { unknown: { owner: `Nucleus.${base.name}`, ownerLabel: `Nucleus.${base.name}`, candidates: Object.keys(e.values) } };
      return { resolved: { kind: 'enumValue', enumName: base.name, value: name } };
    }
    case 'nucleusClass': {
      const statics = api.nucleusClasses[base.name].statics;
      if (statics) {
        const r = resolveMember({ kind: 'object', type: statics }, name);
        return r.unknown ? { unknown: { ...r.unknown, ownerLabel: `Nucleus.${base.name}` } } : r;
      }
      return { resolved: { kind: 'opaque' } };
    }
    default:
      return { resolved: { kind: 'opaque' } };
  }
}

/** Element type when indexing (`PlayerList[i]`). */
export function resolveIndex(base: Resolved): Resolved {
  if (base.kind === 'list') return { kind: 'object', type: base.of };
  if (base.kind === 'object' && base.type === 'Array' && base.of) return valueTypeOf(base.of) ?? { kind: 'opaque' };
  if (base.kind === 'object' && base.type === 'String') return { kind: 'object', type: 'String' };
  if (base.kind === 'member') {
    const v = valueObject(base.member);
    if (v) return resolveIndex(v);
  }
  return { kind: 'opaque' };
}

/** Members to offer for completion after `base.`. */
export function membersOf(base: Resolved): { name: string; member?: Member; enumValue?: number; detail?: string }[] {
  switch (base.kind) {
    case 'object':
      return Object.entries(objectOf(base.type)!.members)
        .filter(([, m]) => !m.internal)
        .map(([name, member]) => ({ name, member }));
    case 'member':
      if (base.member.kind === 'object' && base.member.ref && api.objects[base.member.ref]) {
        return membersOf({ kind: 'object', type: base.member.ref });
      }
      if (isStringMember(base.member)) return membersOf({ kind: 'object', type: 'String' });
      {
        const v = valueObject(base.member);
        if (v) return membersOf(v);
      }
      return [];
    case 'list':
      return [{ name: 'Count', detail: 'number' }];
    case 'nucleus':
      return [
        ...Object.keys(api.enums).map((name) => ({ name, detail: 'enum' })),
        ...Object.keys(api.nucleusClasses).map((name) => ({ name, detail: 'class' })),
      ];
    case 'enum':
      return Object.entries(api.enums[base.name].values).map(([name, v]) => ({ name, enumValue: v, detail: `= ${v}` }));
    case 'nucleusClass': {
      const statics = api.nucleusClasses[base.name].statics;
      return statics ? membersOf({ kind: 'object', type: statics }) : [];
    }
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Best "did you mean" candidate, or undefined if nothing is close. */
export function suggest(name: string, candidates: string[]): string | undefined {
  const lower = name.toLowerCase();
  const exactCi = candidates.find((c) => c.toLowerCase() === lower);
  if (exactCi) return exactCi;
  let best: string | undefined;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = levenshtein(lower, c.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  const limit = Math.max(2, Math.floor(name.length / 4));
  return bestScore <= limit ? best : undefined;
}

export function looksLikeTypo(name: string, candidates: string[]): boolean {
  return suggest(name, candidates) !== undefined;
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/** A parameter's type as hints and signatures show it. The model types a C# `string` parameter
 *  `string | number | boolean`, since Jint turns a number or boolean into text there (so the checks accept them);
 *  what the method wants is still a string, and that's what a person should read. The same for an enum. */
export function paramType(p: Param): string {
  const cs = (p.csType ?? '').replace(/\[\]$/, '');
  if (p.type === 'string | number | boolean' && /^(string|String|System\.String)$/.test(cs)) return 'string';
  // An enum parameter (`Nucleus.SaveType | number | boolean`): its values are what to pass.
  return p.type.match(/^(Nucleus\.\w+) \| number \| boolean$/)?.[1] ?? p.type;
}

export function memberSignature(owner: string, name: string, m: Member): string[] {
  const label = ownerLabel(owner);
  const full = label ? `${label}.${name}` : name;
  if (m.kind === 'method') {
    return (m.overloads ?? []).map(
      (o) => `${full}(${o.params.map((p) => `${p.rest ? '...' : ''}${p.name}${p.optional ? '?' : ''}: ${paramType(p)}`).join(', ')}): ${o.returns}`,
    );
  }
  const t = m.kind === 'object' ? m.ref ?? m.ts : m.ts;
  return [`${m.readonly ? '(read-only) ' : ''}${full}: ${t}`];
}

/** "GameHook" -> "Game.Hook" etc., for messages. */
export function ownerLabel(owner: string): string {
  switch (owner) {
    case 'GameHook':
      return 'Game.Hook';
    case 'GameProtoInput':
      return 'Game.ProtoInput';
    case 'PlayerInfo':
      return 'Player';
    case 'ProtoInputRuntime':
      return 'ProtoInput';
    case 'ProtoInputValues':
      return 'ProtoInput.Values';
    case 'HubMaintainer':
      return 'Hub.Maintainer';
    case 'HubHandler':
      return 'Hub.Handler';
    case 'NucleusGlobals':
      return 'Nucleus.Globals';
    default:
      return owner;
  }
}

/** The label shown with a doc Claude wrote (empty for human-written docs). */
export const claudeNote = (m: { docBy?: string; docBasis?: AiBasis; docCheckedBy?: string; docCheckedOn?: string }) =>
  m.docBy !== 'claude' ? ''
  : m.docCheckedBy ? `AI-written, based on ${aiBasisWords(m.docBasis)}. Checked by ${m.docCheckedBy}${m.docCheckedOn ? ` on ${m.docCheckedOn}` : ''}.`
  : `AI-written, based on ${aiBasisWords(m.docBasis)}. Not from the official docs.`;

/** The "Doc review" issue form for a Claude-written doc, with its name filled in (.github/ISSUE_TEMPLATE/doc-review.yml;
 *  the doc-review workflow adds the doc itself as a comment the reporter can't remove). */
export const docReviewUrl = (path: string) =>
  `https://github.com/Snailedlt/splitscreenme-vscode/issues/new?template=doc-review.yml&title=${encodeURIComponent(`Doc review: ${path}`)}&member=${encodeURIComponent(path)}`;
/** The same form for feedback after a 👍 (something to add, a better example): titled as feedback. */
export const docFeedbackUrl = (path: string) =>
  `https://github.com/Snailedlt/splitscreenme-vscode/issues/new?template=doc-review.yml&title=${encodeURIComponent(`Doc feedback: ${path}`)}&member=${encodeURIComponent(path)}`;

/** The label of an AI-written "In practice" part (empty without one). */
export const practiceNote = (m: Member) =>
  !m.practice ? ''
  : `AI-written, based on ${aiBasisWords(m.practiceBasis)}.${m.practiceCheckedBy ? ` Checked by ${m.practiceCheckedBy}${m.practiceCheckedOn ? ` on ${m.practiceCheckedOn}` : ''}.` : ''}`;
/** "Used by 564 of 899 Hub handlers" (empty when no Hub handler uses it). Not shown with "In practice", which has no
 *  counts; kept for the workbench. */
export const hubUseText = (m: Member) => (m.hubUse && api.hubHandlers ? `Used by ${m.hubUse} of ${api.hubHandlers.count} Hub handlers` : '');
/** Where an example comes from, in a few words ('' for the official docs'). */
export const exampleSource = (m: Member) => (m.exampleBy === 'claude' ? 'AI-written' : m.exampleBy ? m.exampleNote ?? '' : '');

/** The votes and the verified label of one doc part, as a Markdown line ('' with no votes). */
function votesMarkdown(path: string, part: DocPart, aiWritten: boolean): string {
  const v = partVotes(path, part);
  const verified = aiWritten ? verifiedLabel(v) : '';
  return [verified ? `**✓ ${verified}**` : '', votesLine(v)].filter(Boolean).join(' · ');
}

/**
 * The first sentence of a Markdown doc, for a hover: the first paragraph up to its first full stop (not one in code,
 * a name such as `Game.Play`, or "e.g."), or the official docs' " | " separator; a very short one ("Optional.") takes
 * the next sentence too. Cut at a word with "…" past `max`.
 */
export function firstSentence(md: string, max = 200): string {
  const para = (md.split(/\n\s*\n/).find((x) => x.trim() && !x.trim().startsWith('```')) ?? '').replace(/\s*\n\s*/g, ' ').trim();
  let code = false;
  let end = para.length;
  for (let i = 0; i < para.length; i++) {
    const c = para[i];
    if (c === '`') code = !code;
    if (code) continue;
    const bar = c === ' ' && para.slice(i, i + 3) === ' | ';
    const stop = (c === '.' || c === '!' || c === '?') && (i + 1 === para.length || /\s/.test(para[i + 1]));
    if (!bar && !stop) continue;
    if (stop && c === '.' && /(?:\be\.g|\bi\.e|\betc|\bvs|\bcf)$/i.test(para.slice(0, i))) continue;
    if (i < 25 && !bar) continue; // "Optional.", "Hub metadata.": too little on its own
    end = bar ? i : i + 1;
    break;
  }
  let out = para.slice(0, end).trim();
  if (out.length > max) {
    const cut = out.lastIndexOf(' ', max);
    out = out.slice(0, cut > max / 2 ? cut : max).replace(/[,;:(\s]+$/, '');
    // An unclosed code span would swallow the rest of the hover.
    if ((out.match(/`/g) ?? []).length % 2) out += '`';
    out += '…';
  } else if (out && !/[.!?…:]$/.test(out)) out += '.';
  return out;
}

/**
 * A member's hover: the signature, the doc's first sentence (a ✨ before it when AI wrote it) and nothing else. The full doc,
 * "In practice", votes, the engine line and examples stay in the Docs view and the completion docs (memberMarkdown):
 * help on request, not on screen. The caller adds the links to the full docs.
 */
export function memberHoverMarkdown(owner: string, name: string, m: Member): string {
  const parts: string[] = ['```ts\n' + memberSignature(owner, name, m).map((x) => prettySignature(x)).join('\n') + '\n```'];
  if (m.deprecated) parts.push(`**${m.deprecated}**`);
  const first = m.doc ? firstSentence(m.doc) : '';
  // An AI-written doc: a ✨ before it, where it comes from on its own small line.
  if (first) parts.push(isAiPart(m, 'doc') ? `${AI_MARK} ${first}` : first);
  if (first && isAiPart(m, 'doc')) parts.push(aiBasisLine(m, 'doc'));
  if (m.required) parts.push('**Required**');
  if (isJsBuiltin(owner)) parts.push(`[MDN: ${owner ? `${owner}.` : ''}${name}](${mdnUrl(owner, name)})`);
  return parts.join('\n\n');
}

/** A place in memberMarkdown's text for a control the caller puts there itself (VS Code's Docs panel and the docs
 *  pages: each part's 👍/👎 inside it; 'practice-open'/'practice-close' around "In practice"; 'ai-doc', 'ai-params'
 *  and 'ai-example' open the frame of an AI-written part, 'ai-close' ends it: core/aimark.ts placeAiFrames). A
 *  paragraph of its own. */
export const docSlot = (name: 'doc' | 'practice' | 'practice-open' | 'practice-close' | 'ai-doc' | 'ai-params' | 'ai-example' | 'ai-close') => `@@slot:${name}@@`;

/** The mark before AI-written text where there is no frame (Markdown: hovers, suggestion docs, parameter hints). */
export const AI_MARK = '✨';
/** The parts of a doc AI can have written. */
export type AiPart = 'doc' | 'practice' | 'params' | 'example';
/** Whether that part of the member is AI-written. */
export function isAiPart(m: Member, part: AiPart): boolean {
  if (part === 'doc') return m.docBy === 'claude' && Boolean(m.doc);
  if (part === 'practice') return Boolean(m.practice);
  if (part === 'example') return m.exampleBy === 'claude' && Boolean(m.example);
  return (m.overloads ?? []).some((o) => o.params.some((p) => p.doc && p.docBy === 'claude'));
}
/** One source an AI-written part rests on (data/claude-*.json `basis.source`): `project` (Nucleus, ProtoInputHooks,
 *  Proto Input guide, …), `file` (shown as code) and `what` in it (functions, call sites); each optional. */
export interface AiSource { project?: string; file?: string; what?: string }
/** What an AI-written part is based on, as data (data/claude-docs.json, claude-practice.json, claude-param-docs.json
 *  `basis`): the `source` files, the verified Hub handlers (`hub.counted`: the date they were counted), the Hub games'
 *  engines (`engines`: true, or the families the text names) and a `note` for anything else. Every place that shows
 *  it builds its text from these fields: the sparkle's tooltip (core/aimark.ts aiTip), the Markdown line
 *  (aiBasisSummary), the words for agents (aiBasisWords; scripts/generate-api.mjs has the same for the .d.ts). */
export interface AiBasis { source?: AiSource[]; hub?: { counted: string }; engines?: true | string[]; note?: string }

/** The basis of an AI-written part (undefined when the part isn't AI-written). */
export function aiBasisOf(m: Member, part: AiPart): AiBasis | undefined {
  if (!isAiPart(m, part)) return undefined;
  const b = part === 'doc' ? m.docBasis : part === 'params' ? m.paramsBasis : m.practiceBasis;
  return b ?? { note: 'the Nucleus source' };
}
/** The source items as text, the project named only where it changes ("Nucleus GenericGameHandler.cs (StartGame)",
 *  "ProcessUtil.cs"); the note last. `code` wraps a file name (HTML callers make it <code>). */
export function aiSourceItems(b: AiBasis, code: (file: string) => string = (f) => f, text: (s: string) => string = (s) => s): string[] {
  let prev = '';
  const out = (b.source ?? []).map((i) => {
    const project = i.project && i.project !== prev ? i.project : '';
    prev = i.project ?? prev;
    const head = [project ? text(project) : '', i.file ? code(i.file) : ''].filter(Boolean).join(' ');
    return head ? `${head}${i.what ? ` (${text(i.what)})` : ''}` : text(i.what ?? '');
  });
  return b.note ? [...out, text(b.note)] : out;
}
/** "verified handlers, counted 2026-11-17" ('' without Hub data). */
export const aiHubText = (b: AiBasis) => (b.hub ? `verified handlers, counted ${b.hub.counted}` : '');
/** "Source games, from Hub game engines (Wikidata/IGDB)" ('' without engine data). */
export const aiEnginesText = (b: AiBasis) =>
  !b.engines ? '' : `${Array.isArray(b.engines) && b.engines.length ? `${b.engines.join(', ')} games, f` : 'F'}rom Hub game engines (Wikidata/IGDB)`;
/** The repo files behind the Hub data (for the docs pages, where developers look). */
export const aiDataFiles = (b: AiBasis) => [b.hub ? 'data/hub-examples.json' : '', b.engines ? 'data/hub-engines.json' : ''].filter(Boolean);
/** The labelled groups on one line, for Markdown: "Source: … · Hub handlers: … · Engines: …". */
export function aiBasisSummary(b: AiBasis): string {
  const src = aiSourceItems(b);
  return [src.length ? `Source: ${src.join(', ')}` : '', b.hub ? `Hub handlers: ${aiHubText(b)}` : '', b.engines ? `Engines: ${aiEnginesText(b)}` : ''].filter(Boolean).join(' · ');
}
/** The basis in words, for agents (CLI, MCP, api.md: "AI-written, based on …"): "Nucleus GenericGameHandler.cs (…),
 *  ProcessUtil.cs; verified Hub handlers, counted 2026-11-17; Hub game engines (Source)". scripts/generate-api.mjs
 *  basisWords is the same for the .d.ts (a test checks they agree). */
export function aiBasisWords(b: AiBasis | undefined): string {
  if (!b) return 'the Nucleus source';
  const eng = b.engines ? `Hub game engines${Array.isArray(b.engines) && b.engines.length ? ` (${b.engines.join(', ')})` : ''}` : '';
  return [aiSourceItems(b).join(', '), b.hub ? `verified Hub handlers, counted ${b.hub.counted}` : '', eng].filter(Boolean).join('; ');
}
/** Where an AI-written part comes from, on one labelled line ('' when the part isn't AI-written): aiBasisSummary. */
export function aiBasis(m: Member, part: AiPart): string {
  const b = aiBasisOf(m, part);
  return b ? aiBasisSummary(b) : '';
}
/** "Checked by Ann on 2026-11-01" for an AI-written part a person checked ('' otherwise): stays visible, small. */
export function aiChecked(m: Member, part: AiPart): string {
  const [by, on] = part === 'doc' ? [m.docCheckedBy, m.docCheckedOn] : part === 'practice' ? [m.practiceCheckedBy, m.practiceCheckedOn] : [];
  return by && isAiPart(m, part) ? `Checked by ${by}${on ? ` on ${on}` : ''}` : '';
}
/** The small line under an AI-written part in Markdown: where it comes from, and who checked it. */
const aiBasisLine = (m: Member, part: AiPart) => `_${aiBasis(m, part)}${aiChecked(m, part) ? ` · ✓ ${aiChecked(m, part)}` : ''}_`;
/** Text with the ✨ before its first paragraph (on its own when the text starts with a code block or a list). */
const withMark = (md: string) => (/^(```|- |\d+\. |#)/.test(md.trimStart()) ? `${AI_MARK}\n\n${md}` : `${AI_MARK} ${md}`);

/**
 * `slots`: put docSlot markers in, and leave out the "Is it wrong? Tell us" links (the caller's votes lead there).
 * AI-written parts (the doc, the parameters, "In practice", the example): in Markdown a ✨ before the text and the
 * basis on its own small line; with `slots` the caller frames them (core/aimark.ts), so neither is in the text.
 */
export function memberMarkdown(owner: string, name: string, m: Member, slots = false): string {
  const parts: string[] = [];
  const tellUs = (checked: unknown, path: string) => (checked || slots ? '' : ` [Is it wrong? Tell us](${docReviewUrl(path)})`);
  // Each overload laid out as prettier would (one parameter per line when it's long), the example too.
  parts.push('```ts\n' + memberSignature(owner, name, m).map((x) => prettySignature(x)).join('\n') + '\n```');
  if (m.deprecated) parts.push(`**${m.deprecated}**`);
  const path = `${ownerLabel(owner)}${ownerLabel(owner) ? '.' : ''}${name}`;
  const aiDoc = isAiPart(m, 'doc');
  if (aiDoc && slots) parts.push(docSlot('ai-doc'));
  if (m.doc) parts.push(aiDoc && !slots ? withMark(m.doc) : m.doc);
  if (aiDoc && !slots) parts.push(`${aiBasisLine(m, 'doc')}${tellUs(m.docCheckedBy, path)}`);
  const docVotes = m.doc ? votesMarkdown(path, 'doc', aiDoc) : '';
  if (docVotes) parts.push(docVotes);
  if (slots && m.doc) parts.push(docSlot('doc'));
  if (aiDoc && slots) parts.push(docSlot('ai-close'));
  // What to pass for each parameter (every name once, from whichever overload has it). The AI-written ones: a ✨ each
  // in Markdown; with slots, after the others in their own frame.
  const params = new Map<string, Param>();
  for (const o of m.overloads ?? []) for (const p of o.params) if (p.doc && !params.has(p.name)) params.set(p.name, p);
  const item = (p: Param) => `- \`${p.name}\`: ${p.docBy === 'claude' && !slots ? `${AI_MARK} ` : ''}${p.doc}`;
  const human = [...params.values()].filter((p) => p.docBy !== 'claude'), ai = [...params.values()].filter((p) => p.docBy === 'claude');
  if (slots) {
    if (human.length) parts.push(human.map(item).join('\n'));
    if (ai.length) parts.push(docSlot('ai-params'), ai.map(item).join('\n'), docSlot('ai-close'));
  } else if (params.size) parts.push([...params.values()].map(item).join('\n') + (ai.length ? `\n\n${aiBasisLine(m, 'params')}` : ''));
  const meta: string[] = [];
  if (m.default !== undefined) meta.push(`Default: \`${m.default}\``);
  if (m.category) meta.push(`Category: ${m.category}`);
  if (m.required) meta.push('**Required**');
  if (meta.length) parts.push(meta.join(' · '));
  // "In practice": AI-written, its own basis and votes, apart from the doc above.
  if (m.practice) {
    const pv = votesMarkdown(path, 'practice', true);
    if (slots) parts.push([docSlot('practice-open'), '**In practice**', m.practice, ...(pv ? [pv] : []), docSlot('practice'), docSlot('practice-close')].join('\n\n'));
    else parts.push(`**${AI_MARK} In practice**\n\n${m.practice}\n\n${aiBasisLine(m, 'practice')}${tellUs(m.practiceCheckedBy, path)}${pv ? `\n\n${pv}` : ''}`);
  }
  // Where one engine's handlers use it notably more or less: mechanical, not AI-written, under "In practice" or alone.
  if (m.byEngine) parts.push(`${m.practice ? '' : '**In practice**\n\n'}_${m.byEngine}_`);
  if (m.example) {
    const code = '```js\n' + prettyCode(m.example) + '\n```';
    if (isAiPart(m, 'example')) parts.push(...(slots ? [docSlot('ai-example'), `_Example_\n\n${code}`, docSlot('ai-close')] : [`_${AI_MARK} Example_\n\n${code}`]));
    else parts.push((exampleSource(m) ? `_Example: ${exampleSource(m)}_\n\n` : '') + code);
  }
  parts.push(isJsBuiltin(owner) ? `[MDN: ${owner ? `${owner}.` : ''}${name}](${mdnUrl(owner, name)})` : `[Handler API docs](${DOCS_URL})`);
  return parts.join('\n\n');
}
