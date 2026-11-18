#!/usr/bin/env node
// Generates data/nucleus-api.json and types/nucleus.d.ts from the Nucleus Co-op
// C# sources (the source of truth for what a handler can touch) and the
// SplitScreen.Me docs (the source of descriptions/examples).
//
// Usage:
//   node scripts/generate-api.mjs --nucleus ../splitscreenme-nucleus --www ../splitscreenme-www
//
// Both repos are public:
//   https://github.com/SplitScreen-Me/splitscreenme-nucleus
//   https://github.com/SplitScreen-Me/splitscreenme-www

import { engineLine } from './hub-engines.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const nucleusRepo = path.resolve(args.nucleus ?? process.env.NUCLEUS_REPO ?? '../splitscreenme-nucleus');
const wwwRepo = path.resolve(args.www ?? process.env.WWW_REPO ?? '../splitscreenme-www');
const gaming = path.join(nucleusRepo, 'Master', 'NucleusGaming');

for (const p of [gaming, path.join(wwwRepo, 'docs')]) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${p}. Pass --nucleus <path> and --www <path>.`);
    process.exit(1);
  }
}

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

// ---------------------------------------------------------------------------
// C# parsing
// ---------------------------------------------------------------------------

/** Find `class Name` / `enum Name` and return the text between its braces. */
function findTypeBody(text, kind, name) {
  const re = new RegExp(`\\b${kind}\\s+${name}\\b[^{;]*\\{`, 'g');
  const m = re.exec(text);
  if (!m) throw new Error(`${kind} ${name} not found`);
  const start = m.index + m[0].length;
  const end = matchBrace(text, start - 1);
  return text.slice(start, end);
}

/** Given index of `{`, return index of matching `}` (skips strings, chars and comments). */
function matchBrace(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const skip = skipNonCode(text, i);
    if (skip !== i) {
      i = skip - 1;
      continue;
    }
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced braces');
}

/** If a string/char/comment starts at i, return the index right after it; else i. */
function skipNonCode(text, i) {
  const c = text[i];
  const n = text[i + 1];
  if (c === '/' && n === '/') {
    const e = text.indexOf('\n', i);
    return e < 0 ? text.length : e;
  }
  if (c === '/' && n === '*') {
    const e = text.indexOf('*/', i + 2);
    return e < 0 ? text.length : e + 2;
  }
  let j = i;
  let verbatim = false;
  while (text[j] === '$' || text[j] === '@') {
    if (text[j] === '@') verbatim = true;
    j++;
  }
  if (text[j] === '"') {
    j++;
    while (j < text.length) {
      if (verbatim && text[j] === '"' && text[j + 1] === '"') j += 2;
      else if (!verbatim && text[j] === '\\') j += 2;
      else if (text[j] === '"') return j + 1;
      else j++;
    }
    return j;
  }
  if (j === i && c === "'") {
    j++;
    while (j < text.length && text[j] !== "'") j += text[j] === '\\' ? 2 : 1;
    return j + 1;
  }
  return i;
}

const xmlDoc = (lines) =>
  lines
    .join(' ')
    .replace(/<\/?summary>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Split a class body into depth-0 member declarations, keeping /// docs and
 * same-line trailing // comments.
 */
function members(body) {
  const out = [];
  let buf = '';
  let docLines = [];
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '/' && body[i + 1] === '/') {
      const e = body.indexOf('\n', i);
      const end = e < 0 ? body.length : e;
      const comment = body.slice(i, end);
      if (comment.startsWith('///')) docLines.push(comment.slice(3));
      else if (!buf.trim() && out.length && out[out.length - 1].sameLine) {
        out[out.length - 1].trailing = comment.slice(2).trim();
      }
      i = end - 1;
      continue;
    }
    if (c === '\n' && out.length) out[out.length - 1].sameLine = false;
    const skip = skipNonCode(body, i);
    if (skip !== i) {
      buf += body.slice(i, skip);
      i = skip - 1;
      continue;
    }
    if (c === ';') {
      if (buf.trim()) out.push({ decl: norm(buf), doc: xmlDoc(docLines), sameLine: true, block: false });
      buf = '';
      docLines = [];
    } else if (c === '{') {
      const close = matchBrace(body, i);
      // `Type Name { get; set; } = init;` / `Name => ...` handled by decl text
      if (buf.trim()) {
        const isProp = !/\(/.test(buf) && !/\b(class|enum|struct|interface)\b/.test(buf);
        out.push({ decl: norm(buf), doc: xmlDoc(docLines), sameLine: true, block: true, isProp });
      }
      buf = '';
      docLines = [];
      i = close;
      // swallow optional `= init;` after auto-property
      const rest = body.slice(i + 1).match(/^\s*=[^;]*;/);
      if (rest) i += rest[0].length;
    } else {
      buf += c;
    }
  }
  return out.filter((m) => /^\s*public\b/.test(m.decl));
}

const norm = (s) => s.replace(/\[[A-Za-z]+(\([^)]*\))?\]/g, '').replace(/\s+/g, ' ').trim();

const TYPE = String.raw`[\w.]+(?:<[^<>()=;]*(?:<[^<>()=;]*>)?[^<>()=;]*>)?(?:\[\])?\??`;
const MOD = String.raw`(?:(?:static|readonly|extern|virtual|override|new|unsafe|async|const)\s+)*`;

function classify(m, className) {
  const d = m.decl;
  if (/\b(class|enum|struct|interface|delegate|event)\b/.test(d.split('(')[0])) return null;
  const isStatic = /\bstatic\b/.test(d.split('(')[0]);
  let r;
  // methods (incl. extern), but not constructors
  if ((r = d.match(new RegExp(`^public\\s+${MOD}(${TYPE})\\s+(\\w+)\\s*\\(([\\s\\S]*)\\)\\s*(?:=>[\\s\\S]*)?$`)))) {
    if (r[1] === 'override') return null;
    return { kind: 'method', csType: r[1], name: r[2], params: parseParams(r[3]), isStatic };
  }
  if (new RegExp(`^public\\s+${className}\\s*\\(`).test(d)) return null;
  // expression-bodied property
  if ((r = d.match(new RegExp(`^public\\s+${MOD}(${TYPE})\\s+(\\w+)\\s*=>`)))) {
    return { kind: 'property', csType: r[1], name: r[2], readonly: true, isStatic };
  }
  // block property
  if (m.block && m.isProp && (r = d.match(new RegExp(`^public\\s+${MOD}(${TYPE})\\s+(\\w+)$`)))) {
    return { kind: 'property', csType: r[1], name: r[2], readonly: false, isStatic };
  }
  // field
  if ((r = d.match(new RegExp(`^public\\s+${MOD}(${TYPE})\\s+(\\w+)\\s*(?:=\\s*([\\s\\S]+))?$`)))) {
    return {
      kind: 'field',
      csType: r[1],
      name: r[2],
      default: r[3]?.trim(),
      readonly: /\b(readonly|const)\b/.test(d),
      isStatic,
    };
  }
  return null;
}

function parseParams(s) {
  s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').trim();
  if (!s) return [];
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const c of s) {
    if (c === '<' || c === '(') depth++;
    if (c === '>' || c === ')') depth--;
    if (c === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => {
    p = p.replace(/\/\*.*?\*\//g, '').trim();
    const r = p.match(new RegExp(`^(params\\s+|out\\s+|ref\\s+)?(${TYPE})\\s+(\\w+)(?:\\s*=\\s*(.+))?$`));
    if (!r) return { name: p, csType: 'object' };
    return {
      name: r[3],
      csType: r[2],
      ...(r[1]?.trim() === 'params' ? { rest: true } : {}),
      ...(r[1]?.trim() === 'out' ? { out: true } : {}),
      ...(r[4] !== undefined ? { optional: true, default: r[4].trim() } : {}),
    };
  });
}

function parseEnum(text, name) {
  const body = findTypeBody(text, 'enum', name);
  const values = {};
  let next = 0;
  for (const raw of body.replace(/\/\/.*$/gm, '').split(',')) {
    const t = raw.trim();
    if (!t) continue;
    const [k, v] = t.split('=').map((x) => x.trim());
    let val = next;
    if (v !== undefined) {
      if (/^-?\d+$/.test(v)) val = Number(v);
      else if (/^0x[0-9a-f]+$/i.test(v)) val = parseInt(v, 16);
      else if (values[v] !== undefined) val = values[v];
    }
    values[k] = val;
    next = val + 1;
  }
  return values;
}

function parseClass(file, className) {
  const text = read(gaming, file);
  return members(findTypeBody(text, 'class', className))
    .map((m) => {
      const c = classify(m, className);
      if (!c) return null;
      const doc = [m.doc, m.trailing && !/^TODO/i.test(m.trailing) ? m.trailing : ''].filter(Boolean).join(' ').trim();
      return { ...c, ...(doc ? { sourceDoc: doc } : {}) };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Docs parsing
// ---------------------------------------------------------------------------

/** key -> { doc, example, category, deprecated } */
const docs = new Map();
const MEMBER_LINE = /^\s*((?:Game|Context|Hub|ProtoInput)(?:\.\w+)*)\.(\w+)(\s*(?:=|\(|;|\/\/|$).*)$/;

// handler-api.mdx lists Context's functions (files, registry, processes, helpers) under "Path variables" with the
// paths: give each the category of what it does.
const FUNCTION_CATEGORIES = [
  [/^Context\.(\w*TextFile|ChangeXmlNode\w*|FindFiles|CopyScriptFolder|RunAdditionalFiles|CreatedDate|ModifiedDate|ModifySaveFile|\w*Backup\w*)$/, 'Files'],
  [/^Context\.\w*RegKey$/, 'Registry'],
  [/^Context\.KillProcesses\w*$/, 'Processes'],
  [/^Context\.(Convert\w+|GCD|Random\w+|Log)$/, 'Helpers'],
];
/** Options whose docs example contradicts their doc (sets it off where the doc says to enable it). */
const offExample = new Set();
function setDoc(key, info, override = false) {
  if (info.category === 'Path variables') { const c = FUNCTION_CATEGORIES.find(([re]) => re.test(key)); if (c) info = { ...info, category: c[1] }; }
  const prev = docs.get(key);
  if (prev && !override) {
    for (const [k, v] of Object.entries(info)) if (v && !prev[k]) prev[k] = v;
    return;
  }
  docs.set(key, { ...(prev ?? {}), ...Object.fromEntries(Object.entries(info).filter(([, v]) => v)) });
}

const cleanMd = (s) =>
  s
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/:::\w*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const undocumented = (s) => !s || /^(\(undocumented\)|no documentation yet\.?)$/i.test(s.trim());

function parseHandlerApiMdx() {
  const text = read(wwwRepo, 'docs', 'handler-api.mdx');
  let category = '';
  let prose = [];
  let code = null;
  const flush = () => {
    prose = [];
  };
  for (const line of text.split('\n')) {
    const h = line.match(/^\s*#{2,4}\s+(?:\d+\.\s*)?(.+?)\s*$/);
    if (code) {
      if (/^```/.test(line)) {
        handleBlock(code, prose.join('\n'), category);
        code = null;
        flush();
      } else code.push(line);
      continue;
    }
    if (/^```js/.test(line)) code = [];
    else if (h) {
      category = h[1].trim();
      flush();
    } else if (/^---\s*$/.test(line)) flush();
    else if (/^Game(\.\w+)+\b[^/]*\/\//.test(line)) {
      // A bare `Game.X; // description` or `Game.X = value; // description` line outside a code block (handler-api.mdx
      // has them for GamePlayAfterLaunch, HexEditFileAddress, RenameAndOrMoveFiles, CMDBatchClose, ...): its own doc,
      // not prose for the next block (that gave IgnoreDeleteFilesPrompt the line about HexEditFileAddress).
      const m = line.match(/^(Game(?:\.\w+)*)\.(\w+)\s*([^/]*?)\s*\/\/\s*(.*)$/);
      if (m) {
        const value = m[3].replace(/;\s*$/, '').replace(/^=\s*/, '').trim();
        const doc = m[4].trim();
        // `Game.CMDBatchClose ["cmd1", "cmd2"];` lacks its `=`: the example has it.
        setDoc(`${m[1]}.${m[2]}`, { doc: undocumented(doc) ? '' : doc, example: value ? `${m[1]}.${m[2]} = ${value};` : undefined, category });
      }
    } else prose.push(line);
  }
}

function handleBlock(lines, proseText, category) {
  const refs = lines.map((l) => l.match(MEMBER_LINE)).filter(Boolean);
  const description = cleanMd(proseText);
  const deprecated = /deprecated/i.test(description) ? description : undefined;
  const single = refs.length === 1 || (refs.length > 1 && new Set(refs.map((r) => r[1] + '.' + r[2])).size === 1);
  for (const r of refs) {
    const key = `${r[1]}.${r[2]}`;
    const rest = r[3];
    const inline = rest.match(/\/\/(.*)$/)?.[1]?.trim();
    const example = r[0].replace(/\s*\/\/.*$/, '').trim();
    const isSig = /^\s*\(/.test(rest);
    let doc = single && !undocumented(description) ? description : '';
    if (!doc && inline && !undocumented(inline)) doc = inline;
    setDoc(key, {
      doc,
      example: isSig ? undefined : example,
      signatureDoc: isSig ? example : undefined,
      category,
      deprecated: deprecated ? 'Deprecated: use Proto Input instead (see https://www.splitscreen.me/docs/protoinput).' : undefined,
    });
  }
}

function parseCreateHandlersMd() {
  const text = read(wwwRepo, 'docs', 'create-handlers.md');
  for (const line of text.split('\n')) {
    const r = line.match(/^\s*`?((?:Game|Context)(?:\.\w+)+)\s*(=[^|]*?)?;?`?\s*\|\s*(.+)$/);
    if (!r) continue;
    const parts = r[1].split('.');
    const name = parts.pop();
    setDoc(`${parts.join('.')}.${name}`, { doc: cleanMd(r[3].replace(/\|\s*$/, '')), example: (r[1] + ' ' + (r[2] ?? '')).trim() + ';' });
  }
}

function parseProtoInputMd() {
  const text = read(wwwRepo, 'docs', 'protoinput.md');
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    const cell = cells.find((c) => c.includes('`Game.ProtoInput.'));
    if (!cell) continue;
    const pieces = cell.split(/<br\s*\/?>\s*<br\s*\/?>/);
    const desc = cleanMd(pieces.slice(1).join('\n\n'));
    // Only the options the cell starts with: its description can mention others (Block Raw Input's says to add
    // `Game.ProtoInput.BlockedMessages = [ 0x00FF ];`), and those must not get this row's description.
    for (const m of pieces[0].matchAll(/`(Game\.ProtoInput\.(\w+)\s*=[^`]*?);?`/g)) {
      setDoc(`Game.ProtoInput.${m[2]}`, { doc: desc, example: m[1].trim() + ';', category: 'Proto Input' });
    }
  }
  // Code blocks: `Game.ProtoInput.X = ...; // comment`. A comment describes an option when it is on the same line, or
  // directly above it with no other option before the next blank line (`// This is identical to the setting in
  // ProtoInputHost...` above FreezeExternalInputWhenInputNotLocked); a comment above a group of options describes
  // the group, and one after a blank line belongs to the next option, not this one (the old `\s*` reached it:
  // "Automatically locks input once the instances are set up" became InjectRuntime_EasyHookStealthMethod's doc).
  // A block with one option takes the paragraph just above it ("Enable this for games that don't have an in-game
  // cursor"). From "Multiple controller indices" on, the blocks are example code whose comments describe that
  // code ("This is set in the input locking"): examples only there.
  const lines = text.split('\n');
  const examplesFrom = lines.findIndex((l) => /^#{2,4}\s+(Multiple controller indices|Advanced scripting)/.test(l));
  const OPT = /^[ \t]*(Game\.ProtoInput\.(\w+)[ \t]*=[^;\n]*;)[ \t]*(?:\/\/[ \t]*(.*))?$/;
  for (let i = 0; i < lines.length; i++) {
    if (!/^```js/.test(lines[i])) continue;
    let end = i + 1;
    while (end < lines.length && !/^```/.test(lines[end])) end++;
    const body = lines.slice(i + 1, end);
    const docsHere = examplesFrom < 0 || i < examplesFrom;
    const opts = body.map((l, k) => [l.match(OPT), k]).filter(([m]) => m);
    // A block with one option: the paragraph just above it (and one right below it, with no blank line between)
    // describes that option. A group's paragraph is about the group ("These options should always be enabled"),
    // too general for each option's own doc.
    let para = '';
    if (docsHere && opts.length === 1) {
      const prose = (l) => l.trim() && !/^(#|```|\|)/.test(l);
      const above = [];
      const below = [];
      for (let k = lines[i - 1]?.trim() ? i - 1 : i - 2; k >= 0 && prose(lines[k]); k--) above.unshift(lines[k]);
      for (let k = end + 1; k < lines.length && prose(lines[k]); k++) below.push(lines[k]);
      para = cleanMd([above.join(' '), below.join(' ')].filter(Boolean).join('\n\n'));
    }
    for (const [m, k] of opts) {
      let doc = docsHere ? m[3] : undefined;
      if (docsHere && !doc) {
        const above = [];
        for (let a = k - 1; a >= 0 && /^\s*\/\//.test(body[a]); a--) above.unshift(body[a].replace(/^\s*\/\/\s*/, ''));
        let alone = true;
        for (let b = k + 1; b < body.length && body[b].trim(); b++) if (OPT.test(body[b]) || /^\s*Game\./.test(body[b])) alone = false;
        if (above.length && alone) doc = above.join(' ');
      }
      // An example that turns the option off, under a doc that says to turn it on ("Enable this for…"), contradicts
      // it: left out (an example from the Hub or the type takes its place).
      const said = para || doc || '';
      const off = /=\s*(false|0)\s*;?\s*$/.test(m[1]) && /^\s*(enable|turn on|use)\b/i.test(said);
      const key = `Game.ProtoInput.${m[2]}`;
      if (off) offExample.add(key); // nor from a later block (one that sets it in the input locking, say)
      setDoc(key, { example: off || offExample.has(key) ? undefined : m[1], doc: said || undefined, category: 'Proto Input' });
    }
    i = end;
  }
}

function parseMasterHandler() {
  const text = read(nucleusRepo, 'Master', 'NucleusCoopTool', 'copyoutput', 'handlers', 'MasterHandler.js');
  for (const m of text.matchAll(/^\s*((?:Game)(?:\.\w+)*)\.(\w+)\s*=\s*(\[?)[^\n]*?\/\/\s*(.+)$/gm)) {
    setDoc(`${m[1]}.${m[2]}`, { doc: m[4].replace(/\s+/g, ' ').trim() });
  }
}

parseHandlerApiMdx();
parseCreateHandlersMd();
parseProtoInputMd();
parseMasterHandler();

// handler-api.mdx marks the whole legacy multi-keyboard section deprecated. The Proto Input
// guide refines that: options in its "deprecated, must explicitly be set to false" block stay
// deprecated (and must be turned off when using Proto Input, since some default to true);
// the other plain Game.* options it sets (SupportsMultipleKeyboardsAndMice, LockInputAtStart,
// LockInputToggleKey, ...) are still in use.
const protoLegacy = new Set();
{
  let inLegacyBlock = false;
  for (const line of read(wwwRepo, 'docs', 'protoinput.md').split('\n')) {
    if (/^\s*\/\/.*deprecated/i.test(line)) inLegacyBlock = true;
    else if (/^\s*(\/\/|$|```)/.test(line)) inLegacyBlock = false;
    const m = line.match(/^\s*Game\.(?!ProtoInput\.)(\w+)\s*=/);
    if (!m) continue;
    const d = docs.get(`Game.${m[1]}`) ?? (docs.set(`Game.${m[1]}`, {}), docs.get(`Game.${m[1]}`));
    if (inLegacyBlock) protoLegacy.add(m[1]);
    else delete d.deprecated;
  }
}

// ---------------------------------------------------------------------------
// Assemble the model
// ---------------------------------------------------------------------------

const enumSources = {
  Folder: ['Coop/Generic/Folder.cs', 'Location of a folder used by `Context.GetFolder(...)`.'],
  SaveType: ['Coop/Generic/SaveType.cs', 'Format of a save/config file for `Context.ModifySaveFile(...)`.'],
  SearchType: ['Coop/Generic/SearchType.cs', 'How a text line is matched by the text-file helpers.'],
  RegType: ['Coop/Generic/RegType.cs', 'Registry value kind for `Context.EditRegKey(...)`.'],
  DPIHandling: ['Coop/Generic/DPIHandling.cs', 'How Nucleus compensates for Windows DPI scaling when sizing windows.'],
  DpiAwarenessMode: ['Tools/Hdpi/GameDpiAwareness.cs', 'DPI awareness compatibility flag applied to the game executable.'],
};
const enums = {};
for (const [name, [file, doc]] of Object.entries(enumSources)) enums[name] = { doc, values: parseEnum(read(gaming, file), name) };

// The Proto Input option enums are declared in namespace Nucleus.Gaming too, so handlers can
// use them as Nucleus.SetWindowPosHook.DontResize etc. (verified with Jint 2.11.58).
const protoEnumFile = read(gaming, 'Coop/ProtoInput/ProtoInputEnumsOptions.cs');
if (!/namespace\s+Nucleus\.Gaming\s*[{;\n]/.test(protoEnumFile)) throw new Error('ProtoInputEnumsOptions.cs moved out of Nucleus.Gaming');
const protoEnumDocs = {
  SetWindowPosHook: 'Value for `Game.ProtoInput.SetWindowPosHook`. `true` is the same as `True`.',
  MoveWindowHook: 'Value for `Game.ProtoInput.MoveWindowHook`. `true` is the same as `True`.',
  DrawFakeCursor: 'Value for `Game.ProtoInput.DrawFakeCursor`. `true` is the same as `True`.',
  PutMouseInsideWindow: 'Value for `Game.ProtoInput.PutMouseInsideWindow`. `true` is the same as `True`.',
  SetRemoveBorderHook: 'Value for `Game.ProtoInput.SetRemoveBorderHook`. `true` is the same as `True`.',
  Key: 'Virtual key codes.',
};
for (const m of protoEnumFile.matchAll(/public\s+enum\s+(\w+)/g)) {
  enums[m[1]] = { doc: protoEnumDocs[m[1]] ?? 'Proto Input option values.', values: parseEnum(protoEnumFile, m[1]) };
}

const enumNames = new Set(Object.keys(enums));

const NUM = new Set(['int', 'uint', 'long', 'ulong', 'double', 'float', 'short', 'ushort', 'byte', 'sbyte', 'decimal', 'IntPtr']);
/** Simplified type used by the linter: string|boolean|number|string[]|number[]|function|enum:X|object:X|any */
function simpleType(cs) {
  cs = cs.replace(/\?$/, '');
  if (cs === 'string') return 'string';
  if (cs === 'bool') return 'boolean';
  if (NUM.has(cs)) return 'number';
  if (cs === 'string[]') return 'string[]';
  if (/^(int|uint|float|double|byte|long)\[\]$/.test(cs)) return 'number[]';
  if (cs === 'bool[]') return 'boolean[]';
  if (cs === 'Action' || cs.startsWith('Action<') || cs.startsWith('Func<')) return 'function';
  if (enumNames.has(cs)) return `enum:${cs}`;
  if (cs === 'void') return 'void';
  if (/^(List|IList)</.test(cs) || cs.endsWith('[]')) return 'array';
  return 'any';
}

const objRefs = {
  GameHookInfo: 'GameHook',
  ProtoInputOptions: 'GameProtoInput',
  Hub: 'Hub',
  GenericContext: 'Context',
  UserInfo: 'UserInfo',
};

function tsType(cs) {
  cs = cs.replace(/\?$/, '');
  const st = simpleType(cs);
  if (st.startsWith('enum:')) {
    const n = st.slice(5);
    return enums[n] ? `Nucleus.${n} | number | boolean` : `number | boolean`;
  }
  switch (st) {
    case 'string':
    case 'boolean':
    case 'number':
    case 'void':
      return st;
    case 'string[]':
      return 'string[]';
    case 'number[]':
      return cs === 'byte[]' ? 'number[]' : 'number[]';
    case 'boolean[]':
      return 'boolean[]';
    case 'function':
      return '() => void';
  }
  if (objRefs[cs]) return objRefs[cs];
  if (cs === 'object') return 'any';
  if (cs === 'SaveInfo' || cs === 'SaveInfo[]') return cs.replace('SaveInfo', 'Nucleus.SaveInfo');
  if (cs === 'Rectangle' || cs === 'RectangleF') return 'Rectangle';
  if (cs === 'List<PlayerInfo>') return 'PlayerInfo[]';
  if (cs === 'List<string>') return 'string[]';
  if (cs.startsWith('Dictionary<string')) return 'Record<string, any>';
  if (cs === 'GameOption') return 'GameOption';
  if (cs === 'CustomStep') return 'CustomStep';
  if (cs === 'Type') return 'any';
  if (/^(List|IList)</.test(cs)) return 'any[]';
  return 'any';
}

// Fields that exist on the CLR object but are set by Nucleus itself, or are
// plumbing that handlers should not touch. Not flagged as unknown, but hidden
// from completion and marked as read-only where appropriate.
const INTERNAL = {
  Game: new Set([
    'UpdateAvailable', 'Hub', 'Favorite', 'Options', 'CustomSteps', 'JsFileName', 'HandlerType', 'MetaInfo', 'IsUpdateAvailable',
    'LoadCustomAssemblies', 'SetPlayerList', 'SetProtoInputValues', 'PrePlay', 'CreateContext', 'SaveType', 'SavePath',
    'Profiles_ConfigPath', 'Profiles_SavePath', 'Profiles_Documents_ConfigPath', 'Profiles_Documents_SavePath',
    'Players_BackupPath', 'Content_Folder', 'HandlerId',
    'SetupSse', // never called by Nucleus: the linter says so where it's set (callback-misuse)
  ]),
  Context: new Set(['HandlerType', 'bHasKeyboardPlayer', 'searchType', 'Error', 'Interval']),
};
const READONLY = { Game: new Set(['EpicLang', 'GogLang', 'SteamLang', 'Hub', 'Hook', 'ProtoInput', 'MetaInfo']) };

const REQUIRED_GAME = ['GUID', 'GameName', 'ExecutableName'];

const looseParam = (t) => (t === 'string' ? 'string | number | boolean' : t);

// Docs written by Claude from the source (data/claude-docs.json): used where no human doc exists (or with
// "override", where the official text is wrong), and marked as such (docBy, docBasis) so the tools can say so.
const claudeDocs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'claude-docs.json'), 'utf8')).docs;
const usedClaude = new Set();
function pickDoc(key, human) {
  const c = claudeDocs[key];
  if (c && (c.override || !human)) {
    usedClaude.add(key);
    return { doc: c.doc, docBy: 'claude', docBasis: c.basis, ...(c.checkedBy ? { docCheckedBy: c.checkedBy, docCheckedOn: c.checkedOn } : {}) };
  }
  return { doc: human || '' };
}

// Parameter docs written by Claude from the source (data/claude-param-docs.json), marked docBy: 'claude'.
const claudeParamDocs = JSON.parse(fs.readFileSync(path.join(root, 'data', 'claude-param-docs.json'), 'utf8')).params;
const usedParamDocs = new Set();
const paramDoc = (key, name) => {
  const d = claudeParamDocs[key]?.params?.[name];
  if (!d) return {};
  usedParamDocs.add(key);
  return { doc: d, docBy: 'claude' };
};

function buildObject(objName, docPrefix, parsed) {
  const result = {};
  for (const m of parsed) {
    if (m.isStatic && m.kind !== 'method') continue;
    const key = `${docPrefix}.${m.name}`;
    const d = docs.get(key) ?? {};
    const internal = INTERNAL[objName]?.has(m.name) || undefined;
    if (m.kind === 'method') {
      const entry = (result[m.name] ??= {
        kind: 'method',
        ...pickDoc(key, d.doc || m.sourceDoc),
        overloads: [],
        ...(internal ? { internal } : {}),
        ...(d.category ? { category: d.category } : {}),
      });
      entry.overloads.push({
        returns: tsType(m.csType),
        params: m.params.filter((p) => !p.out).map((p) => ({
          name: p.name,
          // Jint converts JS primitives to string arguments, so numbers/booleans are accepted.
          type: looseParam(p.rest ? tsType(p.csType.replace(/\[\]$/, '')) : tsType(p.csType)),
          csType: p.csType,
          ...(p.rest ? { rest: true } : {}),
          ...paramDoc(key, p.name),
          // C# default values don't make a parameter optional in Jint 2.11: it only matches
          // overloads with exactly as many parameters as arguments (testbench probe 110:
          // Context.RandomString(8) throws, RandomString(8, false) works). So they're required.
          ...(p.optional ? { csDefault: p.default } : {}),
        })),
      });
      continue;
    }
    if (result[m.name]) continue;
    const ref = objRefs[m.csType];
    result[m.name] = {
      kind: ref && m.csType !== 'GenericContext' ? 'object' : m.kind === 'property' ? 'property' : 'field',
      csType: m.csType,
      type: simpleType(m.csType),
      ts: tsType(m.csType),
      ...(ref ? { ref } : {}),
      ...(m.default !== undefined ? { default: m.default } : {}),
      ...(m.readonly || READONLY[objName]?.has(m.name) ? { readonly: true } : {}),
      ...(internal ? { internal } : {}),
      ...pickDoc(key, d.doc || m.sourceDoc),
      ...(d.example ? { example: d.example } : {}),
      ...(d.category ? { category: d.category } : {}),
      ...(d.deprecated ? { deprecated: d.deprecated } : {}),
      ...(objName === 'Game' && protoLegacy.has(m.name) ? { protoInputLegacy: true } : {}),
      ...(objName === 'Game' && REQUIRED_GAME.includes(m.name) ? { required: true } : {}),
    };
  }
  return result;
}

const gameParsed = parseClass('Coop/Generic/GenericGameInfo.cs', 'GenericGameInfo');
const hookParsed = parseClass('Coop/Generic/GameHookInfo.cs', 'GameHookInfo');
const protoOptParsed = parseClass('Coop/ProtoInput/ProtoInputOptions.cs', 'ProtoInputOptions');
const contextParsed = parseClass('Coop/Generic/GenericContext.cs', 'GenericContext');
const playerParsed = parseClass('Coop/PlayerInfo.cs', 'PlayerInfo');
const protoRtText = read(gaming, 'Coop/ProtoInput/ProtoInput.cs');
const protoRtParsed = members(findTypeBody(protoRtText, 'class', 'ProtoInput'))
  .map((m) => classify(m, 'ProtoInput'))
  .filter((m) => m && m.kind === 'method');
const exposedParsed = parseClass('Coop/ProtoInput/ProtoInput.cs', 'ExposedValues');

// Facts checked in the Nucleus source; these replace the docs site's text.

const model = {
  $comment: 'Generated by scripts/generate-api.mjs. Do not edit by hand.',
  source: {
    nucleus: gitRev(nucleusRepo),
    www: gitRev(wwwRepo),
  },
  jint: jintVersion(),
  globals: {
    Game: { type: 'Game', doc: 'The handler being defined. Set options on it at the top level of the file; define `Game.Play` to customise each instance.', topLevel: true },
    // Hub.* lines are written by hub.splitscreen.me on upload: known to the linter (no warnings on
    // published handlers) but not offered in completion.
    Hub: { type: 'Hub', doc: 'Hub metadata. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.', topLevel: true, hidden: true },
    Nucleus: { type: 'Nucleus', doc: 'The `Nucleus.Gaming` .NET namespace: enums such as `Nucleus.Folder` and helper classes such as `Nucleus.IniSaveInfo`.', topLevel: true },
    System: { type: 'any', doc: '.NET `System` namespace (e.g. `System.IO.File.Copy`, `System.IO.Path.Combine`).', topLevel: true },
    importNamespace: { type: 'function', doc: 'Imports a .NET namespace, e.g. `importNamespace("System.IO")`.', topLevel: true },
    Context: { type: 'Context', doc: 'Per-instance context. Only available inside `Game.Play` and other callbacks.', topLevel: false },
    Player: { type: 'PlayerInfo', doc: 'The player whose instance is being set up. Only available inside `Game.Play` and other callbacks.', topLevel: false },
    PlayerList: { type: 'PlayerInfo[]', doc: 'All players of the session (`PlayerList.Count`). Only available inside callbacks.', topLevel: false },
    Handler: { type: 'any', doc: 'The running `GenericGameHandler`. Only available inside callbacks.', topLevel: false },
    ProtoInput: { type: 'ProtoInputRuntime', doc: 'Proto Input runtime API (install hooks, toggle message filters). Only available inside callbacks such as `Game.ProtoInput.OnInputLocked`.', topLevel: false },
  },
  objects: {
    Game: { doc: 'Handler definition (`GenericGameInfo`).', members: buildObject('Game', 'Game', gameParsed) },
    GameHook: { doc: 'Custom xinput/x360ce hook settings (`Game.Hook`).', members: buildObject('GameHook', 'Game.Hook', hookParsed) },
    GameProtoInput: { doc: 'Proto Input options (`Game.ProtoInput`).', members: buildObject('GameProtoInput', 'Game.ProtoInput', protoOptParsed) },
    Context: { doc: 'Per-instance context (`GenericContext`).', members: buildObject('Context', 'Context', contextParsed) },
    PlayerInfo: {
      doc: 'A player (`PlayerInfo`).',
      members: buildObject('PlayerInfo', 'Player', playerParsed.filter((m) => m.name !== 'Image')),
    },
    Hub: {
      doc: 'Hub metadata. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.',
      members: {
        Maintainer: { kind: 'object', ref: 'HubMaintainer', type: 'any', ts: 'HubMaintainer', internal: true, doc: 'Handler maintainer on hub.splitscreen.me. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
        Handler: { kind: 'object', ref: 'HubHandler', type: 'any', ts: 'HubHandler', internal: true, doc: 'Handler identity on hub.splitscreen.me, used for update checks. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
      },
    },
    HubMaintainer: {
      doc: 'Hub maintainer.',
      members: {
        Name: { kind: 'field', type: 'string', ts: 'string', internal: true, doc: 'Maintainer display name. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
        Id: { kind: 'field', type: 'string', ts: 'string', internal: true, doc: 'Maintainer user id on the hub. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
      },
    },
    HubHandler: {
      doc: 'Hub handler identity.',
      members: {
        Version: { kind: 'field', type: 'number', ts: 'number', internal: true, doc: 'Published version number. Nucleus compares it with the hub to offer updates. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
        Id: { kind: 'field', type: 'string', ts: 'string', internal: true, doc: 'Handler id on hub.splitscreen.me. Written by hub.splitscreen.me when the handler is uploaded, and kept up to date there. Don\'t add or edit these lines yourself.' },
      },
    },
    ProtoInputRuntime: {
      doc: 'Proto Input runtime API.',
      members: {
        ...buildObject('ProtoInputRuntime', 'ProtoInput', protoRtParsed.map((m) => ({ ...m, params: m.params.map((p) => ({ ...p, csType: /HookIDs|FilterIDs/.test(p.csType) ? 'uint' : p.csType })) }))),
        Values: { kind: 'object', ref: 'ProtoInputValues', type: 'any', ts: 'ProtoInputValues', readonly: true, doc: 'Hook and message filter IDs for `InstallHook`, `EnableMessageFilter`, ...' },
      },
    },
    ProtoInputValues: { doc: 'Proto Input hook/filter ids.', members: buildObject('ProtoInputValues', 'ProtoInput.Values', exposedParsed) },
    UserInfo: { doc: 'User info.', members: { GetLocalIP: { kind: 'method', doc: 'Local IP address.', overloads: [{ returns: 'string', params: [] }] } } },
    // Globals.cs / IO/IniFile.cs (hand-picked: the members useful to handlers).
    NucleusGlobals: {
      doc: 'Nucleus\' global paths and settings.',
      members: {
        NucleusInstallRoot: { kind: 'property', csType: 'string', type: 'string', ts: 'string', readonly: true, doc: 'The Nucleus install folder (where NucleusCoop.exe is).' },
        UserEnvironmentRoot: { kind: 'property', csType: 'string', type: 'string', ts: 'string', readonly: true, doc: 'The user\'s profile folder, e.g. `C:\\Users\\me`.' },
        UserDocumentsRoot: { kind: 'field', csType: 'string', type: 'string', ts: 'string', doc: 'The user\'s Documents folder.' },
        GameProfilesFolder: { kind: 'property', csType: 'string', type: 'string', ts: 'string', readonly: true, doc: 'Folder where Nucleus keeps saved game profiles.' },
        NucleusMaxPlayers: { kind: 'field', csType: 'int', type: 'number', ts: 'number', readonly: true, doc: 'Maximum number of players Nucleus supports (32).' },
        IsOneDriveEnabled: { kind: 'field', csType: 'bool', type: 'boolean', ts: 'boolean', doc: 'True if the Documents folder is inside OneDrive.' },
      },
    },
    IniFile: {
      doc: 'An INI file opened with `new Nucleus.IniFile(path)`.',
      members: {
        Path: { kind: 'property', csType: 'string', type: 'string', ts: 'string', readonly: true, doc: 'The file\'s path.' },
        IniWriteValue: { kind: 'method', doc: 'Sets `Key` in `[Section]` (creating them if needed) and saves the file.', overloads: [{ returns: 'void', params: [{ name: 'Section', type: 'string | number | boolean', csType: 'string' }, { name: 'Key', type: 'string | number | boolean', csType: 'string' }, { name: 'Value', type: 'string | number | boolean', csType: 'string' }] }] },
        IniReadValue: { kind: 'method', doc: 'Reads `Key` from `[Section]`; an empty string if it isn\'t there.', overloads: [{ returns: 'string', params: [{ name: 'Section', type: 'string | number | boolean', csType: 'string' }, { name: 'Key', type: 'string | number | boolean', csType: 'string' }] }] },
      },
    },
  },
  enums,
  nucleusClasses: {
    IniSaveInfo: { doc: 'A key in an INI file, for `Context.ModifySaveFile(..., Nucleus.SaveType.INI, [...])`.', params: ['section', 'key', 'value'] },
    CfgSaveInfo: { doc: 'A key in a CFG file, for `Context.ModifySaveFile(..., Nucleus.SaveType.CFG, [...])`.', params: ['section', 'key', 'value'] },
    // Context.ModifySaveFile skips entries that aren't IniSaveInfo (INI) / CfgSaveInfo (CFG).
    SaveInfo: { doc: 'Base class of save file entries. `Context.ModifySaveFile` skips plain `SaveInfo` entries: use `IniSaveInfo` for INI files and `CfgSaveInfo` for CFG files.', params: ['section', 'key', 'value'], constructors: [['section', 'key', 'value'], []] },
    IniFile: { doc: 'Reads and writes keys in an INI file directly (Nucleus.Gaming.IniFile): `var ini = new Nucleus.IniFile(path); ini.IniWriteValue("Section", "Key", "Value");`', params: ['path'], instance: 'IniFile' },
    Globals: { doc: 'Nucleus\' global paths (static class Nucleus.Gaming.Globals): `Nucleus.Globals.NucleusInstallRoot`, `Nucleus.Globals.UserDocumentsRoot`, ...', params: [], constructors: [], statics: 'NucleusGlobals' },
  },
};

// GenericGameInfo.CreateContext copies Game's values onto same-named Context members of the same
// kind (field to field, property to writable property) and the same type, so those Context.X
// mirror Game.X: reuse its docs. Others (Options, the UserProfile/Documents paths, ...) are set
// by GenericGameHandler or not at all, and keep their own docs.
for (const [k, m] of Object.entries(model.objects.Context.members)) {
  const g = model.objects.Game.members[k];
  const copied = g && m.kind !== 'method' && g.kind === m.kind && g.csType === m.csType && !(m.kind === 'property' && m.readonly);
  if (copied) {
    if (!m.doc && g.doc) Object.assign(m, { doc: g.doc }, g.docBy ? { docBy: g.docBy, docBasis: g.docBasis } : {});
    m.doc = `${m.doc ? m.doc + '\n\n' : ''}Copied from \`Game.${k}\` for the current instance.`;
  }
}

// The Hub objects are written out by hand above: their docs come from data/claude-docs.json too.
for (const [obj, prefix] of [['Hub', 'Hub'], ['HubHandler', 'Hub.Handler'], ['HubMaintainer', 'Hub.Maintainer']]) {
  for (const [name, m] of Object.entries(model.objects[obj].members)) Object.assign(m, pickDoc(`${prefix}.${name}`, ''), m.doc && !claudeDocs[`${prefix}.${name}`] ? { doc: m.doc } : {});
}
// "In practice" (data/claude-practice.json): what a member really does in Nucleus' source and how Hub handlers use it,
// written by Claude (AI) and kept apart from the doc above (human or AI), so each part is labelled and voted on by
// itself. Examples: the official docs' (human) first; else one Claude wrote (claude-practice.json "example"); else,
// mechanically, the most common value or call in the verified Hub handlers (data/hub-examples.json,
// scripts/hub-examples.mjs), when enough of them agree on it. `exampleIn` says where it goes in a handler (the top
// level, Game.Play or the callback most Hub handlers call it from), for the workbench's "Insert into handler".
const practiceFile = JSON.parse(fs.readFileSync(path.join(root, 'data', 'claude-practice.json'), 'utf8')).practice;
const hubFile = JSON.parse(fs.readFileSync(path.join(root, 'data', 'hub-examples.json'), 'utf8'));
const usedPractice = new Set();
const LABELS = { Game: 'Game', GameHook: 'Game.Hook', GameProtoInput: 'Game.ProtoInput', Context: 'Context', PlayerInfo: 'Player', ProtoInputRuntime: 'ProtoInput', ProtoInputValues: 'ProtoInput.Values' };
const CALLBACKS = /^(Game\.(Play|OnFinishedSetup|OnStop|PrePlay)|Game\.ProtoInput\.(OnInputLocked|OnInputUnlocked))$/;
for (const [obj, label] of Object.entries(LABELS)) {
  for (const [name, m] of Object.entries(model.objects[obj].members)) {
    const key = `${label}.${name}`;
    const hub = hubFile.members[key];
    if (hub && !m.internal) m.hubUse = hub.n;
    // Per engine family (data/hub-engines.json, through hub-examples.json): how many of its handlers use it, and the
    // "By engine" line where a family differs notably from all handlers (scripts/hub-engines.mjs engineLine).
    if (hub && !m.internal && hubFile.engines) {
      m.engineUse = Object.fromEntries(Object.keys(hubFile.engines).map((k) => [k, hub.engines?.[k] ?? 0]));
      const line = engineLine(hub.engines, hub.n, hubFile.engines, hubFile.handlers);
      if (line) m.byEngine = line;
    }
    const p = practiceFile[key];
    if (p) {
      usedPractice.add(key);
      Object.assign(m, { practice: p.text, practiceBasis: p.basis }, p.checkedBy ? { practiceCheckedBy: p.checkedBy, practiceCheckedOn: p.checkedOn } : {});
    }
    if (m.internal || m.kind === 'object') continue;
    // Where it goes: options at the top level; Context, Player and ProtoInput calls in the callback Hub handlers use
    // most (Game.Play when they don't say).
    const where = hub?.where?.find(([w]) => CALLBACKS.test(w))?.[0];
    const inCallback = label === 'Context' || label === 'Player' || label === 'ProtoInput' || label === 'ProtoInput.Values';
    const exampleIn = p?.exampleIn ?? (m.kind === 'method' ? where ?? (inCallback ? 'Game.Play' : 'top') : inCallback ? where ?? 'Game.Play' : 'top');
    if (m.example) {
      m.exampleIn = exampleIn;
      continue;
    }
    if (p?.example) {
      Object.assign(m, { example: p.example, exampleBy: 'claude', exampleIn });
      continue;
    }
    // The most common value (options) or call (methods), when at least 5 handlers and a fifth of its users agree.
    const [top, count] = (m.kind === 'method' ? hub?.calls : !inCallback && !m.readonly ? hub?.values : undefined)?.[0] ?? [];
    // (Not an "off" value the docs' own example was left out for: it would contradict the doc just the same.)
    if (top && count >= 5 && count >= hub.n / 5 && !(offExample.has(key) && /^(false|0)$/.test(String(top).trim()))) {
      // A call on `player` (Proto Input's, in the lock callbacks, which get no arguments): in the loop that defines it.
      const code = m.kind === 'method' ? (/\bplayer\./.test(top) ? forEachPlayer(`${top};`) : `${top};`) : `${key} = ${top};`;
      Object.assign(m, { example: code, exampleBy: 'hub', exampleNote: m.kind === 'method' ? `The most common call in Hub handlers: ${count} of the ${hub.n} that use it.` : `The most common value in Hub handlers: ${count} of the ${hub.n} that set it.`, exampleIn });
      continue;
    }
    // Otherwise, mechanically from the type: a switch set to the value that changes something (the opposite of its
    // default), a value a member's readers get. Said so where it shows ("Generated from its type").
    if (m.kind === 'method') continue;
    const generated = (code) => Object.assign(m, { example: code, exampleBy: 'generated', exampleNote: 'Generated from its type and default, not from the docs or Hub handlers.', exampleIn });
    if (m.readonly || inCallback) {
      if (label !== 'ProtoInput.Values') generated(`var ${name[0].toLowerCase()}${name.slice(1)} = ${key};`);
      // A hook or filter id goes to the call that takes it, in the callback Hub handlers use for it.
      // (Not GetCursorInfoID: Nucleus gives it RemoveBorderHookID, so installing it installs another hook.)
      else if (/HookI[Dd]$/.test(name)) Object.assign(generated(forEachPlayer(`ProtoInput.InstallHook(player.ProtoInputInstanceHandle, ${key});`)), { exampleIn: 'Game.ProtoInput.OnInputLocked' });
      else if (/FilterID$/.test(name)) Object.assign(generated(forEachPlayer(`ProtoInput.EnableMessageFilter(player.ProtoInputInstanceHandle, ${key});`)), { exampleIn: 'Game.ProtoInput.OnInputLocked' });
    } else if (m.type === 'boolean') generated(`${key} = ${m.default === 'true' ? 'false' : 'true'};`);
    else if (m.type === 'number' && m.default !== undefined && /^-?\d+(\.\d+)?$/.test(m.default) && m.default !== '0') generated(`${key} = ${m.default};`);
  }
}
const unusedPractice = Object.keys(practiceFile).filter((k) => !usedPractice.has(k));
if (unusedPractice.length) throw new Error(`data/claude-practice.json: no such member: ${unusedPractice.join(', ')}`);
model.hubHandlers = { count: hubFile.handlers, takenAt: hubFile.takenAt, ...(hubFile.engines ? { engines: hubFile.engines } : {}) };

const unusedClaude = Object.keys(claudeDocs).filter((k) => !usedClaude.has(k));
if (unusedClaude.length) console.log(`data/claude-docs.json entries not used (a human doc exists now, or no such member): ${unusedClaude.join(', ')}`);
const unusedParamDocs = Object.keys(claudeParamDocs).filter((k) => !usedParamDocs.has(k));
if (unusedParamDocs.length) console.log(`data/claude-param-docs.json entries not used (no such method): ${unusedParamDocs.join(', ')}`);
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.writeFileSync(path.join(root, 'data', 'nucleus-api.json'), JSON.stringify(model, null, 1) + '\n');

// ---------------------------------------------------------------------------
// TypeScript declarations
// ---------------------------------------------------------------------------

const claudeNote = (m) => (m.docBy === 'claude' ? [`(AI-written, based on ${m.docBasis}.${m.docCheckedBy ? ` Checked by ${m.docCheckedBy}${m.docCheckedOn ? ` on ${m.docCheckedOn}` : ''}.` : ' Not from the official docs.'})`] : []);
/** A statement about `player`, in the loop over the players that Hub handlers write in the Proto Input callbacks. */
function forEachPlayer(stmt) {
  // A call too long for 60 columns: one argument per line, as prettier lays it out (the loop is kept as written).
  const call = /^([\w.]+)\((.*)\);$/.exec(stmt);
  // (Only arguments without quotes or brackets are split at their commas: a comma inside a string stays.)
  const body = `  ${stmt}`.length > 60 && call && !/["'([{]/.test(call[2]) ? `  ${call[1]}(\n${call[2].split(/,\s*/).map((a) => `    ${a}`).join(',\n')}\n  );` : `  ${stmt}`;
  return `for (var i = 0; i < PlayerList.Count; i++) {\n  var player = PlayerList[i];\n${body}\n}`;
}
const exampleTag = (m) => (m.exampleBy === 'claude' ? ' (AI-written example)' : m.exampleBy === 'hub' ? ` (${m.exampleNote})` : '');
// Where the example comes from goes on its own line before @example, so the example stays copyable code.
const exampleLines = (m) => (m.example ? [...(exampleTag(m) ? [exampleTag(m).trim().replace(/^\((.*)\)$/, '$1').replace(/\.$/, '') + ':'] : []), `@example ${m.example}`] : []);
// The AI-written "In practice" part, as a paragraph of its own with its label.
const practiceNote = (m) => [
  ...(m.practice ? ['', `In practice: ${m.practice}`, `(AI-written, based on ${m.practiceBasis}.${m.practiceCheckedBy ? ` Checked by ${m.practiceCheckedBy}.` : ''})`] : []),
  // The mechanical per-engine counts (not AI-written), after "In practice" or alone.
  ...(m.byEngine ? ['', m.byEngine] : []),
];
const jsdoc = (doc, extra = [], indent = '  ') => {
  const lines = [...(doc ? doc.split('\n') : []), ...extra].map((l) => l.replace(/\*\//g, '*\\/'));
  if (!lines.length) return '';
  return `${indent}/**\n${lines.map((l) => `${indent} * ${l}`.trimEnd()).join('\n')}\n${indent} */\n`;
};

function iface(name, obj) {
  let s = jsdoc(obj.doc, [], '');
  s += `interface ${name} {\n`;
  for (const [k, m] of Object.entries(obj.members)) {
    if (m.kind === 'method') {
      for (const o of m.overloads) {
        const variants = [o.params.map((p) => `${p.rest ? '...' : ''}${safeIdent(p.name)}${p.optional ? '?' : ''}: ${p.rest ? `(${p.type})[]` : p.type}`)];
        // .NET `params T[]` also accepts a single JS array.
        if (o.params.some((p) => p.rest)) variants.push(o.params.map((p) => `${safeIdent(p.name)}${p.optional ? '?' : ''}: ${p.rest ? `(${p.type})[]` : p.type}`));
        for (const params of variants) {
          const paramTags = o.params.filter((p) => p.doc).map((p) => `@param ${safeIdent(p.name)} ${p.doc}${p.docBy === 'claude' ? ' (AI-written)' : ''}`);
          s += jsdoc(m.doc, [...claudeNote(m), ...practiceNote(m), ...paramTags, ...exampleLines(m), ...(m.internal ? ['@internal'] : [])]);
          s += `  ${k}(${params.join(', ')}): ${o.returns};\n`;
        }
      }
    } else {
      const extra = [...claudeNote(m), ...practiceNote(m)];
      if (m.default !== undefined) extra.push(`@default ${m.default}`);
      extra.push(...exampleLines(m));
      if (m.deprecated) extra.push(`@deprecated ${m.deprecated}`);
      s += jsdoc(m.doc, extra);
      let t = m.ts;
      if (t === '() => void') t = '(() => void) | null';
      s += `  ${m.readonly ? 'readonly ' : ''}${k}: ${t};\n`;
    }
  }
  return s + '}\n';
}
const RESERVED = new Set(['function', 'default', 'new', 'class', 'var', 'in', 'delete', 'type']);
const safeIdent = (n) => (RESERVED.has(n) ? `_${n}` : n);

let dts = `// Type definitions for Nucleus Co-op game handlers.
// Generated by splitscreenme-vscode (scripts/generate-api.mjs) from
// SplitScreen-Me/splitscreenme-nucleus@${model.source.nucleus ?? 'unknown'}.
// Do not edit by hand.

interface Rectangle { X: number; Y: number; Width: number; Height: number; }
interface GameOption { Name: string; Description: string; Key: string; Value: any; DefaultValue: any; Hidden: boolean; }
interface CustomStep { Option: GameOption; Title: string; Required: boolean; UpdateRequired: (() => void) | null; }
/** A .NET List exposed to JavaScript. */
interface DotNetList<T> { Count: number; [index: number]: T; }

`;
for (const [name, obj] of Object.entries(model.objects)) dts += iface(name, obj) + '\n';

dts += `declare namespace Nucleus {\n`;
for (const [name, e] of Object.entries(enums)) {
  dts += jsdoc(e.doc);
  dts += `  enum ${name} {\n${Object.entries(e.values).map(([k, v]) => `    ${k} = ${v},`).join('\n')}\n  }\n`;
}
for (const [name, c] of Object.entries(model.nucleusClasses)) {
  if (c.statics) {
    dts += jsdoc(c.doc) + `  const ${name}: globalThis.${c.statics};\n`;
  } else if (c.instance) {
    dts += jsdoc(c.doc) + `  const ${name}: new (${c.params.map((p) => `${p}: string`).join(', ')}) => globalThis.${c.instance};\n`;
  } else {
    const ctors = (c.constructors ?? [c.params]).map((ps) => `constructor(${ps.map((p) => `${p}: string | number | boolean`).join(', ')});`).join(' ');
    dts += jsdoc(c.doc) + `  class ${name}${name === 'SaveInfo' ? '' : ' extends SaveInfo'} { ${ctors} Section: string; Key: string; Value: string; }\n`;
  }
}
dts += `}\n\n`;

for (const [name, g] of Object.entries(model.globals)) {
  if (name === 'Nucleus') continue;
  let t = g.type;
  if (name === 'PlayerList') t = 'DotNetList<PlayerInfo>';
  if (name === 'importNamespace') {
    dts += jsdoc(g.doc, [], '') + `declare function importNamespace(name: string): any;\n`;
    continue;
  }
  dts += jsdoc(g.doc, [], '') + `declare const ${name}: ${t};\n`;
}

fs.mkdirSync(path.join(root, 'types'), { recursive: true });
fs.writeFileSync(path.join(root, 'types', 'nucleus.d.ts'), dts);

const count = (o) => Object.keys(o.members).length;
console.log(
  `Wrote data/nucleus-api.json and types/nucleus.d.ts: ` +
    Object.entries(model.objects).map(([k, o]) => `${k}=${count(o)}`).join(' '),
);
const undocumentedGame = Object.entries(model.objects.Game.members).filter(([, m]) => !m.doc && !m.internal).map(([k]) => k);
console.log(`Game members without docs (${undocumentedGame.length}): ${undocumentedGame.join(', ')}`);

function gitRev(dir) {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}
function jintVersion() {
  try {
    return read(gaming, 'packages.config').match(/id="Jint" version="([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}
