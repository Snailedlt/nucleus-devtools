// Checks every link the AI docs' sources lead to (npm run check-links): each source item's `url` in the generated
// model (docBasis, practiceBasis, paramsBasis), the Hub and engines links (`basisLinks`) and the fixed links in
// data/sources.json. Fails (exit 1) on a broken one, with the reason. Needs the network, so it isn't part of npm test
// (which checks offline that every source has a link and GitHub links are permalinks at the last commit that changed
// the file); the Sync workflow and CI run
// it. A GitHub file is checked on raw.githubusercontent.com (no rate limit to speak of), a folder on github.com (the
// API, then a file of the model's under it, when github.com refuses). A few requests at a time, retried on 429/5xx.
//   node scripts/check-source-links.mjs [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(fs.readFileSync(path.join(root, 'data/nucleus-api.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(root, 'data/sources.json'), 'utf8'));
const verbose = process.argv.includes('--verbose');

/** Every link to check: url -> where it is used (one example). */
export function sourceLinks(m = model, s = sources) {
  const links = new Map();
  const add = (url, where) => { if (url && !links.has(url)) links.set(url, where); };
  // Every basis in the model (docBasis, practiceBasis, paramsBasis, wherever they sit).
  const walk = (v, at) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, at));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (/Basis$/.test(k)) for (const i of x?.source ?? []) add(i.url, `${at} ${k}`);
        else walk(x, at ? `${at}.${k}` : k);
      }
    }
  };
  walk(m.objects, '');
  for (const [k, url] of Object.entries(m.basisLinks ?? {})) add(url, `basisLinks.${k}`);
  for (const [k, p] of Object.entries(s.projects)) add(p.url, `sources.json projects.${k}`);
  for (const [k, d] of Object.entries(s.data)) add(d.url, `sources.json data.${k}`);
  return links;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { 'user-agent': 'nucleus-devtools-link-check' };
const apiHeaders = { ...headers, accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

/** The HTTP status of a URL (redirects followed), retried on 429/5xx and network errors. */
async function status(url, method = 'HEAD', h = headers) {
  for (let attempt = 0; ; attempt++) {
    try {
      const r = await fetch(url, { method, headers: h, redirect: 'follow', signal: AbortSignal.timeout(30000) });
      if (method === 'GET') await r.body?.cancel();
      if ((r.status === 429 || r.status >= 500) && attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
      if (r.status === 405 && method === 'HEAD') return status(url, 'GET', h);
      return r.status;
    } catch (e) {
      if (attempt < 3) { await sleep(2000 * 2 ** attempt); continue; }
      return `network error (${e.cause?.code ?? e.message})`;
    }
  }
}

const GH = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/(blob|tree)\/([0-9a-f]{40})(?:\/(.*))?$/;

/** null when the link works, else why it doesn't. */
async function check(url, all) {
  const gh = url.match(GH);
  if (gh) {
    const [, owner, repo, kind, sha, p = ''] = gh;
    if (kind === 'blob') {
      const s = await status(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${p}`);
      return s === 200 ? null : s === 404 ? `no such file at ${sha.slice(0, 7)} (or the repository is private)` : `HTTP ${s}`;
    }
    const s = await status(url);
    if (s === 200) return null;
    if (s === 404) return `no such folder at ${sha.slice(0, 7)} (or the repository is private)`;
    const a = await status(`https://api.github.com/repos/${owner}/${repo}/contents/${p}?ref=${sha}`, 'GET', apiHeaders);
    if (a === 200) return null;
    if (a === 404) return `no such folder at ${sha.slice(0, 7)}`;
    // github.com and its API refused (a proxy, a rate limit): a file under the folder at that commit shows it exists.
    const inside = [...all.keys()].find((u) => u.startsWith(`https://github.com/${owner}/${repo}/blob/${sha}/${p ? `${p}/` : ''}`));
    if (inside) {
      const f = await check(inside, all);
      return f ? `its file ${inside} is broken: ${f}` : null;
    }
    return `HTTP ${s} (github.com), ${a} (API): could not check`;
  }
  if (/^https:\/\/github\.com\//.test(url) && /\/(blob|tree)\//.test(url)) return 'not a permalink (/blob/<commit sha>/…)';
  const s = await status(url);
  return s >= 200 && s < 300 ? null : `HTTP ${s}`;
}

async function main() {
  const links = sourceLinks();
  const urls = [...links.keys()];
  const broken = [];
  let next = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const why = await check(url, links);
      if (why) broken.push({ url, why, where: links.get(url) });
      else if (verbose) console.log(`ok ${url}`);
      await sleep(100);
    }
  }));
  for (const b of broken) console.log(`broken: ${b.url}\n  ${b.why} (used by ${b.where})`);
  console.log(`${urls.length - broken.length} ok, ${broken.length} broken`);
  if (broken.length) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
