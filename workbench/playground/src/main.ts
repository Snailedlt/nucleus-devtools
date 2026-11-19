// Entry point of the one bundle: the page, or (inside the Web Worker it starts) the linter.
// Sharing a bundle means the linter and the API model are downloaded once.
// `require` is esbuild's (it bundles both files into this one). Not declared here: Node's types declare it when
// TypeScript finds them (the repository root's node_modules, through a dependency's types), and not otherwise.
if (typeof document === 'undefined') {
  // @ts-ignore: see above
  require('./worker');
} else {
  const s = document.currentScript as HTMLScriptElement | null;
  (globalThis as any).__WORKER_URL = s?.src || URL.createObjectURL(new Blob([s?.textContent ?? ''], { type: 'text/javascript' }));
  // @ts-ignore: see above
  require('./app');
}
