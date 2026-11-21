// An esbuild plugin: ESLint's rule map (eslint/lib/rules/index.js lists all ~290 built-in rules, so a bundle carries
// them all) is replaced by one with only the rules core/jsrules.ts uses. Same Linter, same behaviour for those rules,
// about a third of the size. Every bundle with the core linter uses it (scripts/build.mjs, the workbench's build),
// the tests' bundles included, so the tests run what ships.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The ESLint rules the core uses: the keys of JS_RULES in src/core/jsrules.ts. */
export function usedRules(coreRoot = root) {
  const src = fs.readFileSync(path.join(coreRoot, 'src/core/jsrules.ts'), 'utf8');
  const block = src.slice(src.indexOf('export const JS_RULES = {'), src.indexOf('} as const satisfies'));
  const ids = [...block.matchAll(/^\s*'?([a-z][a-z-]*)'?: \{ title:/gm)].map((m) => m[1]);
  if (ids.length < 5) throw new Error('eslint-slim: could not read the rule list from src/core/jsrules.ts');
  return ids;
}

/** coreRoot: the repository whose core is being bundled (the workbench can build against another commit's). */
export function eslintSlim(coreRoot = root) {
  return {
    name: 'eslint-slim',
    setup(build) {
      // One copy of acorn: our code imports it (the ESM build) and ESLint's parser requires it (the CommonJS build),
      // which would bundle both.
      build.onResolve({ filter: /^acorn$/ }, (args) => (args.kind === 'import-statement' || args.kind === 'dynamic-import' ? build.resolve('acorn', { kind: 'require-call', resolveDir: args.resolveDir }) : undefined));
      // A core from before jsrules.ts (the workbench's compare-with-the-previous-version build) has no ESLint to trim.
      if (!fs.existsSync(path.join(coreRoot, 'src/core/jsrules.ts'))) return;
      build.onLoad({ filter: /[\\/]eslint[\\/]lib[\\/]rules[\\/]index\.js$/ }, (args) => {
        const dir = path.dirname(args.path);
        const ids = usedRules(coreRoot);
        for (const id of ids) if (!fs.existsSync(path.join(dir, `${id}.js`))) throw new Error(`eslint-slim: ESLint has no rule "${id}"`);
        return {
          contents: `"use strict";\nconst { LazyLoadingRuleMap } = require("./utils/lazy-loading-rule-map");\nmodule.exports = new LazyLoadingRuleMap(Object.entries({\n${ids.map((id) => `  ${JSON.stringify(id)}: () => require("./${id}"),`).join('\n')}\n}));\n`,
          resolveDir: dir,
          loader: 'js',
        };
      });
    },
  };
}
