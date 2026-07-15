import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validateDeploymentArtifact,
    writeDeploymentManifest
} from './cloudflare-deployment-boundary-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '_site');
const queue = [];
const included = new Set();

function normalizeLocal(value, from = '') {
    const clean = String(value || '').trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
    if (!clean || /^(?:[a-z]+:|\/\/|data:|#)/i.test(clean)) return null;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(from), clean.replace(/\\/g, '/')));
    if (resolved === '.' || resolved.startsWith('../') || path.posix.isAbsolute(resolved)) return null;
    return resolved.replace(/^\.\//, '');
}

function include(relativePath) {
    const normalized = normalizeLocal(relativePath);
    if (!normalized || included.has(normalized)) return;
    const sourcePath = path.join(root, ...normalized.split('/'));
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
        throw new Error('Runtime dependency is missing: ' + normalized);
    }
    included.add(normalized);
    queue.push(normalized);
}

include('index.html');
include('sw.js');
include('_headers');
include('_routes.json');

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const match of html.matchAll(/\b(?:src|href)=["']([^"'#]+)["']/g)) include(match[1]);

const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const shell = sw.match(/const APP_SHELL = \[([\s\S]*?)\];/);
if (!shell) throw new Error('Unable to read APP_SHELL from sw.js');
for (const match of shell[1].matchAll(/["'](\.\/[^"']+)["']/g)) {
    if (match[1] !== './') include(match[1]);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
for (const icon of manifest.icons || []) include(icon.src);

while (queue.length > 0) {
    const relativePath = queue.shift();
    if (!relativePath.endsWith('.css')) continue;
    const css = fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8');
    for (const match of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        const dependency = normalizeLocal(match[2], relativePath);
        if (dependency) include(dependency);
    }
}

fs.rmSync(output, { recursive: true, force: true });
let totalBytes = 0;
for (const relativePath of [...included].sort()) {
    const sourcePath = path.join(root, ...relativePath.split('/'));
    const targetPath = path.join(output, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    totalBytes += fs.statSync(sourcePath).size;
}
fs.writeFileSync(path.join(output, '.nojekyll'), '');

const forbidden = [
    'docvault.js', 'package.json', 'README.md', 'tests', 'scripts', 'src',
    '.github', '.agents', '.claude', 'wrangler.jsonc', 'worker-configuration.d.ts',
    'config', 'functions', 'tsconfig.functions.json'
];
for (const relativePath of forbidden) {
    if (fs.existsSync(path.join(output, relativePath))) {
        throw new Error('Non-runtime asset leaked into deployment artifact: ' + relativePath);
    }
}
for (const relativePath of included) {
    if (!fs.existsSync(path.join(output, ...relativePath.split('/')))) {
        throw new Error('Deployment artifact is incomplete: ' + relativePath);
    }
}

const artifactManifest = validateDeploymentArtifact(output, included);
writeDeploymentManifest(path.join(root, '.wrangler', 'pages-artifact-manifest.json'), artifactManifest);

console.log('Production artifact ready');
console.log('  Runtime files:', included.size);
console.log('  Payload:', totalBytes, 'bytes');
console.log('  Output:', output);
