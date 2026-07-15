import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readPagesSnapshot, validatePagesSnapshotDocument } from './cloudflare-config-policy.mjs';
import { collectCloudflareToolchainState, validateCloudflareToolchainState } from './cloudflare-toolchain-policy.mjs';
import { parseWranglerConfig, validateDashboardToWranglerDiff, validateGeneratedWorkerTypes, validateWranglerConfig } from './cloudflare-wrangler-policy.mjs';
import { validateProductionHandlerWiring, validateProductionSourceGraph } from './cloudflare-production-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

assert(!fs.existsSync(path.join(root, 'docvault.js')), 'Legacy docvault.js must not be restored or deployed');
assert(!fs.existsSync(path.join(root, 'js/actions.js')), 'The actions monolith must not be restored');
for (const relativePath of [
    'js/actions-batch-history.js', 'js/actions-sharing.js', 'js/actions-imports.js',
    'js/actions-settings.js', 'js/actions-documents.js',
    'js/render-editor-categories.js', 'js/render-viewer-categories.js'
]) {
    assert(fs.existsSync(path.join(root, relativePath)), 'Missing modular runtime file: ' + relativePath);
}

const packageJson = JSON.parse(read('package.json'));
const directPackages = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) };
for (const packageName of ['canvas', 'jsdom', 'puppeteer']) {
    assert(!(packageName in directPackages), 'Unused dependency must not be restored: ' + packageName);
}
assert('playwright' in directPackages, 'Playwright must remain available for the browser regression suite');
assert(fs.existsSync(path.join(root, 'package-lock.json')), 'A committed npm lockfile is required');
assert('tailwindcss' in directPackages, 'Tailwind must be installed locally for deterministic CSS builds');
const packageLock = read('package-lock.json');
for (const packageName of ['canvas', 'jsdom', 'puppeteer']) {
    assert(!packageLock.includes('node_modules/' + packageName + '"'), 'Unused package remains in npm lockfile: ' + packageName);
}

const jsFiles = [
    'storage.js',
    'sw.js',
    'main.js',
    ...fs.readdirSync(path.join(root, 'js'))
        .filter((name) => name.endsWith('.js'))
        .sort()
        .map((name) => path.join('js', name))
];

for (const relativePath of jsFiles.filter((value) => value !== 'main.js')) {
    new vm.Script(read(relativePath), { filename: relativePath });
}

const maintainabilityBudgets = {
    'js/actions-batch-history.js': 500,
    'js/actions-sharing.js': 260,
    'js/actions-imports.js': 650,
    'js/actions-settings.js': 460,
    'js/actions-documents.js': 750,
    'js/render-core.js': 1700,
    'js/render-editor.js': 420,
    'js/render-editor-categories.js': 720,
    'js/render-viewer.js': 150,
    'js/render-viewer-categories.js': 850,
    'js/actions-focus.js': 220,
    'js/render-trends.js': 380
};
for (const [relativePath, maxLines] of Object.entries(maintainabilityBudgets)) {
    const lineCount = read(relativePath).split(/\r?\n/).length;
    assert(lineCount <= maxLines, relativePath + ' exceeds its maintainability budget: ' + lineCount + ' > ' + maxLines);
}
const mainSource = read('main.js');
const mainImport = mainSource.match(/^import\s+["'](.+?)["'];?\s*$/m);
assert(mainImport, 'main.js must contain a static stylesheet import');
assert(fs.existsSync(path.join(root, mainImport[1])), 'main.js imports a missing asset: ' + mainImport[1]);

const workflow = read('.github/workflows/deploy.yml');
assert(/publish_dir:\s*\.\/_site/.test(workflow), 'Production deploy must publish only the generated _site artifact');
assert(!/publish_dir:\s*\.\/\s*$/m.test(workflow), 'Production deploy must not publish the repository root');
assert(/run:\s*npm ci/.test(workflow), 'Production must install the committed lockfile with npm ci');
assert(/run:\s*npm run build:css/.test(workflow), 'Production must use the local Tailwind build script');
assert(!/npx\s+tailwind/i.test(workflow), 'Production must not download Tailwind through npx');

const pagesBaselinePath = path.join(root, 'config/cloudflare/pages-project-baseline.json');
assert(fs.existsSync(pagesBaselinePath), 'Sanitized Cloudflare Pages configuration baseline is required');
const pagesBaseline = readPagesSnapshot(pagesBaselinePath);
validatePagesSnapshotDocument(pagesBaseline, pagesBaseline);
validateCloudflareToolchainState(collectCloudflareToolchainState(root));
const wranglerConfig = parseWranglerConfig(path.join(root, 'wrangler.jsonc'));
validateWranglerConfig(wranglerConfig.config, wranglerConfig.source);
validateGeneratedWorkerTypes(read('worker-configuration.d.ts'));
validateDashboardToWranglerDiff(
    wranglerConfig.config,
    JSON.parse(read('config/cloudflare/pages-project-baseline.json')),
    JSON.parse(read('config/cloudflare/pages-wrangler-diff.json'))
);

for (const relativePath of [
    'functions/_lib/api-shell.mjs',
    'functions/api/v1/[[path]].ts',
    '_routes.json',
    'tsconfig.functions.json'
]) {
    assert(fs.existsSync(path.join(root, relativePath)), 'Missing CF-P1-004 runtime boundary: ' + relativePath);
}
const pagesRoutes = JSON.parse(read('_routes.json'));
assert(JSON.stringify(pagesRoutes) === JSON.stringify({ version: 1, include: ['/api/v1/*'], exclude: [] }),
    'Pages Functions must execute only for /api/v1/*');
const functionSource = read('functions/_lib/api-shell.mjs') + '\n' + read('functions/api/v1/[[path]].ts');
for (const forbiddenPattern of [
    /passThroughOnException/,
    /\bcontext\.next\s*\(/,
    /\bMath\.random\s*\(/,
    /api\.cloudflare\.com/,
    /\bconsole\.(?:log|info|warn|error)\s*\(/
]) {
    assert(!forbiddenPattern.test(functionSource), 'Forbidden Pages Function runtime pattern: ' + forbiddenPattern);
}
const productionFunctionGraph = validateProductionSourceGraph(root);
assert(productionFunctionGraph.includes('functions/_lib/runtime-dependencies.mjs'),
    'Production dependency implementation is missing from the Function import graph');
assert(/PLATFORM_DEPENDENCIES/.test(read('functions/api/v1/[[path]].ts')),
    'Production handler must inject the fixed platform dependency implementation');
validateProductionHandlerWiring(read('functions/api/v1/[[path]].ts'));
assert(/crypto\.randomUUID\s*\(/.test(read('functions/_lib/runtime-dependencies.mjs')),
    'Production request IDs must use Web Crypto');
assert(/COLLABORATION_UNAVAILABLE/.test(functionSource), 'Disabled API shell error is missing');
assert(!/\b(?:DB|COLLAB_DB|OAuth|SESSION_SECRET)\b/.test(functionSource), 'CF-P1-004 must not access a future binding or secret');

const html = read('index.html');
assert(/<html\s+lang=["']en["']/.test(html), 'index.html must declare lang="en"');

const localRefs = [...html.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => match[1].split('?')[0])
    .filter((value) => !/^(?:[a-z]+:|\/\/|data:)/i.test(value));
const missingHtmlRefs = localRefs.filter((value) => !fs.existsSync(path.join(root, value.replace(/^\.\//, ''))));
assert(missingHtmlRefs.length === 0, 'Missing local index.html assets: ' + missingHtmlRefs.join(', '));

const sw = read('sw.js');
const shellMatch = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
assert(shellMatch, 'Unable to read APP_SHELL from sw.js');
const shellRefs = [...shellMatch[1].matchAll(/["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
const missingShellRefs = shellRefs.filter((value) => {
    if (value === './') return false;
    return !fs.existsSync(path.join(root, value.slice(2)));
});
assert(missingShellRefs.length === 0, 'Missing service-worker app-shell assets: ' + missingShellRefs.join(', '));
assert(shellRefs.includes('./vendor/fonts/space-grotesk/runtime.css'), 'APP_SHELL must cache the runtime Space Grotesk stylesheet');
assert(shellRefs.includes('./vendor/fonts/dm-sans/runtime.css'), 'APP_SHELL must cache the runtime DM Sans stylesheet');
assert(!shellRefs.some((value) => /vendor\/fonts\/[^/]+\/(?:index|latin)\.css$/.test(value)), 'APP_SHELL still references a full font stylesheet');

const fontWeights = relativePath => [...read(relativePath).matchAll(/font-weight:\s*(\d+)/g)]
    .map(match => Number(match[1]));
const dmWeights = fontWeights('vendor/fonts/dm-sans/runtime.css');
const headingWeights = fontWeights('vendor/fonts/space-grotesk/runtime.css');
assert(JSON.stringify(dmWeights) === JSON.stringify([400, 500, 600, 700]), 'DM Sans runtime weights changed unexpectedly');
assert(JSON.stringify(headingWeights) === JSON.stringify([400, 600, 700]), 'Space Grotesk runtime weights changed unexpectedly');
assert(!read('vendor/fonts/dm-sans/runtime.css').includes('.woff)'), 'DM Sans runtime must ship WOFF2 only');
assert(!read('vendor/fonts/space-grotesk/runtime.css').includes('.woff)'), 'Space Grotesk runtime must ship WOFF2 only');

const runtimeSource = [html, ...jsFiles.map(read)].join('\n');
for (const legacyToken of ['STRINGS_VI', 'CURRENT_LANG', 'toggleLang', 'docvault_lang', 'vi-VN']) {
    assert(!runtimeSource.includes(legacyToken), 'Legacy localization token found: ' + legacyToken);
}

const constants = read('js/constants.js');
const viewerCategorySource = read('js/render-viewer-categories.js');
assert(!viewerCategorySource.includes('Superseded by the explainable release quality scorecard above.'), 'Obsolete release scorecard branch must not be restored');

const vietnameseSpecific = /[\u0102\u0103\u0110\u0111\u0128\u0129\u0168\u0169\u01A0\u01A1\u01AF\u01B0\u1EA0-\u1EF9]/u;
assert(!vietnameseSpecific.test(constants), 'Demo fixtures and document templates must remain English-only');
const dictMatch = constants.match(/const STRINGS = \{([\s\S]*?)\r?\n\};\r?\n\r?\nfunction t/);
assert(dictMatch, 'Unable to read the English STRINGS dictionary');
const dictionary = vm.runInNewContext('({' + dictMatch[1] + '\n})');
const allJsSource = jsFiles.map(read).join('\n');
const referencedKeys = new Set(
    [...allJsSource.matchAll(/\bt\(["']([A-Za-z][A-Za-z0-9]*)["']/g)].map((match) => match[1])
);
const missingKeys = [...referencedKeys].filter((key) => !(key in dictionary)).sort();
assert(missingKeys.length === 0, 'Missing English STRINGS keys: ' + missingKeys.join(', '));

console.log('Quality gate passed');
console.log('  JavaScript syntax:', jsFiles.length, 'files');
console.log('  Local HTML assets:', localRefs.length, 'references');
console.log('  Offline app shell:', shellRefs.length, 'assets');
console.log('  English UI strings:', referencedKeys.size, 'static keys');
