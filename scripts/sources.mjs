// Links for the AI-written docs' sources (data/claude-*.json `basis.source`), from the table in data/sources.json:
// each item's `project` names a repository (and a folder in it); its `file` is looked up in a local clone of that
// repository and becomes a permalink to the file on GitHub at the last commit that changed it (/blob/<sha>/<path>, a
// folder /tree/<sha>/<path>: the last commit that changed something in it), as of the repository's tip: the default
// branch as the clone last fetched it (`<remote>/<branch>`), or for a repository marked `"ref": "head"` (this one), the
// newest commit of the checkout that GitHub has. So a link shows the version of the file the AI-written text was
// checked against, moves exactly when that file changes (never when only something else in the repository does), and
// never breaks when a file moves later. A docs page's file links to the published page instead (its front matter's
// `slug` or `id`). npm run generate stores the link as the item's `url` and that commit as its `commit` in the model,
// and the tips it looked from (`sourceCommits`), so the tools only read them (core/api.ts aiBasisItems);
// scripts/source-changes.mjs lists the files whose commit moved, with the AI-written parts to check again. A shallow
// clone is deepened first (its history, without file contents). A file not found, a project not in the table, or a
// clone without the default branch of the GitHub repository gets no link and a warning.
// scripts/check-source-links.mjs checks the links over the network.
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

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
const tryGit = (dir, ...args) => { try { return git(dir, ...args).trim(); } catch { return null; } };
/** "owner/name" of a remote URL on GitHub (https or ssh), lower case, or null. */
const githubName = (url) => url.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?\/?$/i)?.[1].toLowerCase() ?? null;

const commits = new Map();
/** The commit a repository's links point at: { sha, dir } or { warn }. Once per repository. */
export function commitOf(repo) {
  if (commits.has(repo)) return commits.get(repo);
  const r = sources.repos[repo];
  const dir = cloneOf(repo);
  let res;
  if (!dir) res = { warn: `no clone of ${r.github} (tried ${[r.env && `$${r.env}`, ...r.clones].filter(Boolean).join(', ')})` };
  else {
    const remote = git(dir, 'remote', '-v').split('\n').map((l) => l.split(/\s+/)).find(([, url]) => url && githubName(url) === r.github.toLowerCase())?.[0];
    if (!remote) res = { warn: `the clone in ${dir} has no remote for github.com/${r.github}` };
    else if (r.ref === 'head') {
      // The newest commit of HEAD that is on one of that remote's branches (what was pushed of this checkout).
      const unpushed = new Set(git(dir, 'rev-list', 'HEAD', '--not', `--remotes=${remote}`).split('\n').filter(Boolean));
      const sha = git(dir, 'rev-list', '--topo-order', 'HEAD').split('\n').find((c) => c && !unpushed.has(c));
      res = sha ? { sha, dir } : { warn: `nothing of ${dir}'s HEAD is on github.com/${r.github} yet` };
    } else {
      const sha = tryGit(dir, 'rev-parse', '--verify', '--quiet', `refs/remotes/${remote}/${r.branch}^{commit}`);
      res = sha ? { sha, dir } : { warn: `the clone in ${dir} has no ${remote}/${r.branch} (git fetch ${remote} ${r.branch})` };
    }
    if (res.sha) res.history = deepen(dir, remote, r.ref === 'head' ? null : r.branch);
  }
  commits.set(repo, res);
  return res;
}

/** A shallow clone's history, fetched once (commits and trees, no file contents): a file's last change needs it.
 *  false (and the links fall back to the tip, with a warning) when it can't be fetched. */
function deepen(dir, remote, branch) {
  if (tryGit(dir, 'rev-parse', '--is-shallow-repository') !== 'true') return true;
  const refs = branch ? [remote, branch] : [remote];
  if (tryGit(dir, 'fetch', '--quiet', '--unshallow', '--filter=blob:none', ...refs) !== null) return true;
  if (tryGit(dir, 'fetch', '--quiet', '--unshallow', ...refs) !== null) return true;
  return tryGit(dir, 'rev-parse', '--is-shallow-repository') === 'false';
}

const changes = new Map();
/** The last commit that changed a file or folder (`p`; '' for the whole repository) as of the repository's link
 *  commit: { commit } or { warn } (with the tip as `commit`, when the history isn't there). */
function lastChange(repo, p) {
  const key = `${repo}\0${p}`;
  if (!changes.has(key)) {
    const c = commitOf(repo);
    const r = sources.repos[repo];
    let res;
    if (!c.history) res = { commit: c.sha, warn: `${c.dir} is a shallow clone and its history can't be fetched: ${p || r.github} links at the tip (git fetch --unshallow)` };
    else {
      const sha = p ? tryGit(c.dir, 'log', '-1', '--format=%H', c.sha, '--', p) : c.sha;
      res = sha ? { commit: sha } : { commit: c.sha, warn: `no commit changed ${p} in ${r.github}` };
      // This repository's own files: the link is the version on GitHub, so one changed since then is out of step.
      if (sha && r.ref === 'head' && p && fs.existsSync(path.join(c.dir, p)) && fs.statSync(path.join(c.dir, p)).isFile()
        && tryGit(c.dir, 'rev-parse', `${sha}:${p}`) !== tryGit(c.dir, 'hash-object', p)) {
        res.warn = `${p} changed since its last commit on GitHub (${sha.slice(0, 7)}): commit and push it, then npm run generate again`;
      }
    }
    changes.set(key, res);
  }
  return changes.get(key);
}

const fileLists = new Map();
/** The files in a repository at its link commit (git ls-tree), once per repository. */
function filesOf(repo) {
  if (!fileLists.has(repo)) {
    const c = commitOf(repo);
    fileLists.set(repo, c.sha ? git(c.dir, 'ls-tree', '-r', '--name-only', c.sha).split('\n').filter(Boolean) : null);
  }
  return fileLists.get(repo);
}

const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

/** A docs page's address on the site: its front matter's `slug`, else its `id`, else its file name (Docusaurus). */
function sitePage(repo, file) {
  const { sha, dir } = commitOf(repo);
  const site = sources.repos[repo].site;
  const rel = file.slice(site.dir.length + 1).replace(/\.mdx?$/, '');
  const text = tryGit(dir, 'show', `${sha}:${file}`) ?? '';
  const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? '';
  const field = (k) => fm.match(new RegExp(`^${k}:\\s*['"]?([^'"\\r\\n]+?)['"]?\\s*$`, 'm'))?.[1];
  const slug = field('slug');
  if (slug) return site.url + (slug.startsWith('/') ? slug.slice(1) : rel.replace(/[^/]+$/, slug));
  const id = field('id');
  return site.url + (id ? rel.replace(/[^/]+$/, id) : rel);
}

/** A file or folder in a repository: its permalink at the last commit that changed it, and that `commit`; or { warn }.
 *  `warn` may also come with a link (a shallow clone's tip, a file changed since its commit). */
export function repoUrl(repo, { file, dir } = {}) {
  const r = sources.repos[repo];
  const base = `https://github.com/${r.github}`;
  const c = commitOf(repo);
  if (!c.sha) return { warn: c.warn };
  if (!file) {
    const { commit, warn } = lastChange(repo, dir ?? '');
    return { url: dir ? `${base}/tree/${commit}/${enc(dir)}` : `${base}/tree/${commit}`, commit, warn };
  }
  const files = filesOf(repo);
  const want = file.replace(/\\/g, '/').toLowerCase();
  const inDir = (f) => !dir || f.startsWith(`${dir}/`);
  const hits = files.filter((f) => inDir(f) && (f.toLowerCase() === want || f.toLowerCase().endsWith(`/${want}`)));
  if (!hits.length) return { warn: `${file} not found in ${r.github}${dir ? `/${dir}` : ''} at ${c.sha.slice(0, 7)}` };
  if (hits.length > 1) return { warn: `${file} is ambiguous in ${r.github}: ${hits.join(', ')} (give more of its path)` };
  const { commit, warn } = lastChange(repo, hits[0]);
  if (r.site && hits[0].startsWith(`${r.site.dir}/`) && /\.mdx?$/.test(hits[0])) return { url: sitePage(repo, hits[0]), commit, warn };
  return { url: `${base}/blob/${commit}/${enc(hits[0])}`, commit, warn };
}

/** The link for one source item ({ project, file }), or { warn } saying why there is none. */
export function sourceUrl(item) {
  const proj = item.project ? sources.projects[item.project] : undefined;
  if (!proj) return { warn: `project ${JSON.stringify(item.project ?? '')} is not in data/sources.json` };
  if (proj.url) return { url: proj.url };
  return repoUrl(proj.repo, { file: item.file, dir: proj.dir });
}

/** A basis with a `url` on every source item that has one; `warn(text)` for the others. */
export function linkBasis(basis, warn = () => {}) {
  if (!basis?.source) return basis;
  return {
    ...basis,
    source: basis.source.map((i) => {
      const r = sourceUrl(i);
      if (r.warn) warn(r.warn);
      return r.url ? { ...i, url: r.url, ...(r.commit ? { commit: r.commit } : {}) } : i;
    }),
  };
}

/** The other kinds of basis' links (data/sources.json `data`): a fixed `url`, or a `repo` + `file` permalink. */
export function dataLinks(warn = () => {}) {
  return Object.fromEntries(Object.entries(sources.data).map(([k, d]) => {
    if (d.url) return [k, d.url];
    const r = repoUrl(d.repo, { file: d.file });
    if (r.warn) warn(r.warn);
    return [k, r.url ?? null];
  }));
}

/** The tip each repository's links were looked up from, per GitHub repository ("owner/name": sha), for the
 *  repositories used so far (each link itself is at its file's last change, before or at this commit). */
export function usedCommits() {
  return Object.fromEntries([...commits].filter(([, c]) => c.sha).map(([repo, c]) => [sources.repos[repo].github, c.sha]));
}
