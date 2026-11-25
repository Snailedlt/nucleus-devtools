// Reading the sources of the docs' Tools pages (tool-docs.mjs): what the tools say about themselves (`ncdev --help`,
// the Notepad++ plugin's menu, the extension's manifest, PORTING.md) and the data and pictures the pages are made from.
import fs from 'node:fs';
import path from 'node:path';

/** `ncdev --help` as commands: each with its usage lines and its description. */
export function parseHelp(help) {
  const lines = help.split('\n');
  const section = (name) => {
    const i = lines.findIndex((l) => l.trim() === `${name}:`);
    if (i < 0) return [];
    const out = [];
    for (const l of lines.slice(i + 1)) {
      if (!l.trim()) break;
      const indent = l.length - l.trimStart().length;
      const split = l.length > 30 && l.slice(28, 30) === '  ' && l.slice(0, 30).trim() ? 30 : l.slice(0, 30).trim() ? -1 : 0;
      if (indent >= 30) { out.at(-1).desc.push(l.trim()); continue; }
      const use = split > 0 ? l.slice(0, split).trim() : l.trim();
      const desc = split > 0 ? [l.slice(split).trim()] : [];
      // A command with two usage lines (`report …` then `report --check …`): the second starts at the same indent.
      if (indent === 2 && !(out.length && !out.at(-1).desc.length)) out.push({ use: [use], desc });
      else { out.at(-1).use.push(use); out.at(-1).desc.push(...desc); }
    }
    return out.map((c) => ({ use: c.use, desc: c.desc.join(' ') }));
  };
  const exit = /(?:^|\n)Exit code: ([\s\S]*?)(?:\n[ \t]*\n|\s*$(?![\s\S]))/.exec(help);
  return { commands: section('Commands'), options: section('Common options'), lint: section('Lint options'), exit: exit ? exit[1].replace(/\s+/g, ' ').trim() : '' };
}

/** The Notepad++ plugin's menu, in order, with a gap where the menu has a separator. */
export function parseNppMenu(cpp) {
  const block = cpp.slice(cpp.indexOf('static FuncItem funcs[] = {'), cpp.indexOf('};', cpp.indexOf('static FuncItem funcs[] = {')));
  return [...block.matchAll(/\{L"([^"]*)",[^,]*,[^,]*,[^,]*,\s*(nullptr|&(\w+))\}/g)].map((m) => ({
    label: m[1],
    keys: m[3] ? m[3].replace(/^(alt|ctrl|shift)/, (x) => x[0].toUpperCase() + x.slice(1) + '+').replace(/\+(\w)/, (x) => x.toUpperCase()) : '',
  }));
}

/** A WebP file's size in pixels (its header). */
function webpSize(file) {
  const b = fs.readFileSync(file);
  const kind = b.toString('latin1', 12, 16);
  if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (kind === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
}

/** The guide's sources, for build.mjs: the data files, the start page's gallery (each screenshot's caption) and
 *  videos (their size), the workbench's Settings sections, every gallery picture's size, and the labelled screenshot's
 *  positions (written by tools/screenshots.cjs --only map; without it the page has the list alone). `here`: playground/. */
export function readGuideSources(here) {
  const root = path.join(here, '..', '..');
  const json = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
  const start = fs.readFileSync(path.join(here, 'src', 'start.html'), 'utf8');
  const list = start.match(/var TOOLS = \[([\s\S]*?)\n  \];/);
  const looks = start.match(/var LOOKS = (\[.*\]);/);
  if (!list || !looks) throw new Error('tool docs: the gallery\'s TOOLS or LOOKS list in start.html has moved; update tool-docs-read.mjs to match.');
  const gallery = {};
  for (const t of list[1].matchAll(/\{ id: '([a-z]+)', label: '([^']+)', views: \[([\s\S]*?)\]\] \}/g))
    for (const v of t[3].matchAll(/\['([a-z0-9-]+)', '((?:\\'|[^'])*)', '((?:\\'|[^'])*)'/g)) {
      const entry = { tool: t[2], label: v[2].replace(/\\'/g, "'"), caption: v[3].replace(/\\'/g, "'") };
      if (v[1] === 'look') for (const [l, name] of JSON.parse(looks[1].replace(/'/g, '"'))) gallery[`${t[1]}-look-${l}`] = { ...entry, caption: `The ${name} look. ${entry.caption}` };
      else gallery[`${t[1]}-${v[1]}`] = entry;
    }
  const videos = Object.fromEntries([...start.matchAll(/<video[^>]*poster="videos\/([a-z]+)-poster\.jpg" width="(\d+)" height="(\d+)"/g)].map((m) => [m[1], { w: +m[2], h: +m[3] }]));
  const settingsTabs = [...fs.readFileSync(path.join(here, 'src', 'page.html'), 'utf8').matchAll(/role="tab" id="st-[a-z0-9]+"([^>]*)>([^<]+)</g)].filter((m) => !/data-beta/.test(m[1])).map((m) => m[2].trim());
  const galleryDirs = [path.join(here, '..', 'docs', 'images', 'gallery'), path.join(root, 'docs', 'images', 'gallery'), path.join(here, '..', 'docs', 'images', 'guide')];
  const sizes = {};
  for (const dir of galleryDirs) for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = /^(.*)-light\.webp$/.exec(f); if (m) sizes[m[1]] = webpSize(path.join(dir, f)); }
  const mapFile = path.join(here, '..', 'docs', 'images', 'guide', 'workbench-map.json');
  return {
    tools: json(path.join(root, 'data', 'tools.json')), editors: json(path.join(root, 'data', 'editors.json')), compare: json(path.join(root, 'data', 'tools-compare.json')),
    guide: json(path.join(here, 'src', 'guide.json')), tourParts: json(path.join(here, 'src', 'tourparts.json')),
    gallery, videos, settingsTabs, sizes, galleryDirs, map: fs.existsSync(mapFile) ? json(mapFile) : null,
  };
}

/** Read the sources from the repository (the core's root) and the workbench (its keyactions), for build.mjs. */
export function readToolSources(coreRepo) {
  const read = (p) => fs.readFileSync(path.join(coreRepo, p), 'utf8');
  return { pkg: JSON.parse(read('package.json')), nppCpp: read('npp-plugin/src/NcDev.cpp'), porting: read('PORTING.md') };
}
