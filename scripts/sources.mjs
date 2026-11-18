// Links for the AI-written docs' sources (data/claude-*.json `basis.source`), from the table in data/sources.json:
// each item's `project` names a repository (and a folder in it); its `file` is looked up in a local clone of that
// repository and becomes a link to the file on GitHub's default branch (no commit, no line: they'd go stale). A docs
// page's file links to the published page instead. npm run generate stores the link as the item's `url` in the
// model, so the tools only read it (core/api.ts aiBasisItems). A file not found, or a project not in the table,
// gets no link and a warning.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sources = JSON.parse(fs.readFileSync(path.join(root, 'data/sources.json'), 'utf8'));

/** The local clone of a repository from the table (its env variable first), or null. */
export function cloneOf(repo) {
  const r = sources.repos[repo];
  const tries = [r.env && process.env[r.env], ...(r.clones ?? [])].filter(Boolean).map((p) => path.resolve(root, p));
  return tries.find((p) => fs.existsSync(path.join(p, '.git'))) ?? null;
}

const fileLists = new Map();
/** The files tracked in a clone (git ls-files), once per repository. */
function filesOf(repo) {
  if (!fileLists.has(repo)) {
    const dir = cloneOf(repo);
    fileLists.set(repo, dir ? execFileSync('git', ['ls-files'], { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean) : null);
  }
  return fileLists.get(repo);
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

/** The link for one source item ({ project, file }), or { warn } saying why there is none. */
export function sourceUrl(item) {
  const proj = item.project ? sources.projects[item.project] : undefined;
  if (!proj) return { warn: `project ${JSON.stringify(item.project ?? '')} is not in data/sources.json` };
  if (proj.url) return { url: proj.url };
  const repo = sources.repos[proj.repo];
  const base = `https://github.com/${repo.github}`;
  if (!item.file) return { url: proj.dir ? `${base}/tree/${repo.branch}/${enc(proj.dir)}` : base };
  const files = filesOf(proj.repo);
  if (!files) return { warn: `no clone of ${repo.github} (tried ${[repo.env && `$${repo.env}`, ...repo.clones].filter(Boolean).join(', ')})` };
  const want = item.file.replace(/\\/g, '/').toLowerCase();
  const inDir = (f) => !proj.dir || f.startsWith(`${proj.dir}/`);
  const hits = files.filter((f) => inDir(f) && (f.toLowerCase() === want || f.toLowerCase().endsWith(`/${want}`)));
  if (!hits.length) return { warn: `${item.file} not found in ${repo.github}${proj.dir ? `/${proj.dir}` : ''}` };
  if (hits.length > 1) return { warn: `${item.file} is ambiguous in ${repo.github}: ${hits.join(', ')} (give more of its path)` };
  const site = repo.site;
  if (site && hits[0].startsWith(`${site.dir}/`) && /\.mdx?$/.test(hits[0])) return { url: site.url + hits[0].slice(site.dir.length + 1).replace(/\.mdx?$/, '') };
  return { url: `${base}/blob/${repo.branch}/${enc(hits[0])}` };
}

/** A basis with a `url` on every source item that has one; `warn(text)` for the others. */
export function linkBasis(basis, warn = () => {}) {
  if (!basis?.source) return basis;
  return {
    ...basis,
    source: basis.source.map((i) => {
      const r = sourceUrl(i);
      if (r.warn) warn(r.warn);
      return r.url ? { ...i, url: r.url } : i;
    }),
  };
}
