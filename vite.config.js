import { defineConfig } from 'vite';
import { cpSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Phase-0 baseline: the app's JavaScript is still classic, global-scope
// `<script>` files (storage.js + js/*.js) plus two vendored non-module
// libraries. Vite/Rollup can only bundle ES modules, so it cannot fingerprint
// these yet — it hashes the CSS and static assets and leaves the <script src>
// tags pointing at their original relative paths. This plugin copies those
// still-classic files into dist verbatim so the built app runs identically.
// As the scripts are converted to ES modules in later steps, they drop out of
// this list and Vite fingerprints them instead.
function copyLegacyRuntime() {
  return {
    name: 'copy-legacy-runtime',
    apply: 'build',
    closeBundle() {
      const out = resolve(root, 'dist');
      // [from, to] relative to repo root / dist respectively.
      const items = [
        ['storage.js', 'storage.js'],
        ['js', 'js'],
        ['vendor/toastui/toastui-editor-all.min.js', 'vendor/toastui/toastui-editor-all.min.js'],
        ['vendor/morphdom/morphdom-umd.min.js', 'vendor/morphdom/morphdom-umd.min.js'],
        ['sw.js', 'sw.js'],
        // Vite emits the hashed webmanifest under assets/ but keeps its icon
        // src paths relative ("icons/..."), so they resolve to assets/icons/*.
        ['icons', 'assets/icons'],
      ];
      for (const [from, to] of items) {
        const src = resolve(root, from);
        if (existsSync(src)) cpSync(src, resolve(out, to), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  // Relative base so the build works under a GitHub Pages project subpath,
  // matching how the current (non-built) app loads everything relatively.
  base: './',
  plugins: [copyLegacyRuntime()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
