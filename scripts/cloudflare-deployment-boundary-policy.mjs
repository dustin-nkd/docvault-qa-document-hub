import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT_RUNTIME_FILES = new Set([
    '.nojekyll', '_headers', '_routes.json', 'index.html', 'manifest.json',
    'storage.js', 'style.css', 'sw.js'
]);
const RUNTIME_PREFIXES = ['icons/', 'js/', 'vendor/'];
const RUNTIME_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.png', '.svg', '.woff2']);
const FORBIDDEN_PATH = /(?:^|\/)(?:\.agents|\.claude|\.github|\.wrangler|config|docs|evidence|fixtures?|functions|migrations?|scripts|src|tests?)(?:\/|$)|\.(?:db|d1|md|map|sql|sqlite|sqlite3|ts|tsx)$/i;
const FORBIDDEN_CONTENT = [
    '-----BEGIN PRIVATE KEY-----',
    'CLOUDFLARE_API_TOKEN',
    'createDeterministicRuntimeDependencies',
    'cf-p1-007-private-canary-do-not-log',
    'TEST_MIGRATIONS',
    'unit-provider-token'
];

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const normalize = value => value.replace(/\\/g, '/');

export function validatePagesRoutesDocument(routes) {
    assert(routes && typeof routes === 'object' && !Array.isArray(routes), 'Pages routes must be an object');
    assert(JSON.stringify(routes) === JSON.stringify({
        version: 1,
        include: ['/api/v1/*'],
        exclude: []
    }), 'Pages Functions must execute only for /api/v1/*');
    return true;
}

function collectArtifactFiles(outputDirectory) {
    const files = [];
    const pending = [outputDirectory];
    while (pending.length > 0) {
        const directory = pending.pop();
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolutePath = path.join(directory, entry.name);
            const relativePath = normalize(path.relative(outputDirectory, absolutePath));
            assert(!entry.isSymbolicLink(), `Deployment artifact contains a symbolic link: ${relativePath}`);
            if (entry.isDirectory()) pending.push(absolutePath);
            else if (entry.isFile()) files.push(relativePath);
            else throw new Error(`Deployment artifact contains an unsupported entry: ${relativePath}`);
        }
    }
    return files.sort();
}

function isAllowedRuntimePath(relativePath) {
    if (ROOT_RUNTIME_FILES.has(relativePath)) return true;
    return RUNTIME_PREFIXES.some(prefix => relativePath.startsWith(prefix))
        && RUNTIME_EXTENSIONS.has(path.posix.extname(relativePath));
}

export function validateDeploymentArtifact(outputDirectory, expectedRuntimeFiles = undefined) {
    assert(fs.existsSync(outputDirectory) && fs.statSync(outputDirectory).isDirectory(), 'Deployment artifact is missing');
    const files = collectArtifactFiles(outputDirectory);
    assert(files.length > 0, 'Deployment artifact is empty');
    assert(files.includes('index.html'), 'Deployment artifact is missing index.html');
    assert(files.includes('_headers'), 'Deployment artifact is missing _headers');
    assert(files.includes('_routes.json'), 'Deployment artifact is missing _routes.json');
    assert(files.includes('.nojekyll'), 'Deployment artifact is missing .nojekyll');

    if (expectedRuntimeFiles) {
        const expected = [...new Set([...expectedRuntimeFiles, '.nojekyll'])].sort();
        assert(JSON.stringify(files) === JSON.stringify(expected), 'Deployment artifact differs from the runtime dependency allowlist');
    }

    let totalBytes = 0;
    const manifestFiles = [];
    for (const relativePath of files) {
        assert(isAllowedRuntimePath(relativePath), `Deployment artifact contains a non-runtime path: ${relativePath}`);
        assert(!FORBIDDEN_PATH.test(relativePath), `Deployment artifact contains a protected path: ${relativePath}`);
        const absolutePath = path.join(outputDirectory, ...relativePath.split('/'));
        const bytes = fs.readFileSync(absolutePath);
        totalBytes += bytes.byteLength;
        if (['.css', '.html', '.js', '.json', ''].includes(path.posix.extname(relativePath))) {
            const source = bytes.toString('utf8');
            const marker = FORBIDDEN_CONTENT.find(value => source.includes(value));
            assert(!marker, `Deployment artifact contains protected content in ${relativePath}: ${marker}`);
        }
        manifestFiles.push({
            path: relativePath,
            bytes: bytes.byteLength,
            sha256: crypto.createHash('sha256').update(bytes).digest('hex')
        });
    }

    assertImportClosureIsComplete(outputDirectory, files);
    validatePagesRoutesDocument(JSON.parse(fs.readFileSync(path.join(outputDirectory, '_routes.json'), 'utf8')));
    return { schema_version: 1, files: manifestFiles, total_bytes: totalBytes };
}

/**
 * A relative module edge, in every form that creates one: `from '...'` (static
 * import and re-export), `import('...')` (dynamic), and `import '...'` alone
 * (side effect). Deliberately the same pattern `build-pages.mjs` walks with, so
 * the set this asserts is present is the set that decides inclusion; if the two
 * ever disagree, the artifact is checked against a graph nobody built it from.
 */
const MODULE_SPECIFIER = /(?:\bfrom\s*|(?:^|[^.\w])import\s*(?:\(\s*)?)(['"])(\.[^'"]*)\1/gm;

/**
 * Every module the artifact imports is in the artifact (closes R-P7-C).
 *
 * A missing module does not 404 on Cloudflare Pages. The SPA fallback answers
 * `200 text/html` with the app shell, so the browser asks for JavaScript and is
 * handed a web page — an import that fails with a MIME error and no route in the
 * server logs to point at. That is exactly how the `037fb093` artifact defect
 * shipped, and it is a class of failure that cannot be seen from a local run at
 * all: every file is on disk locally, so the graph resolves, and only the
 * deployment is broken.
 *
 * `build-pages.mjs` walks the module graph to a fixpoint and so cannot leave a
 * reachable module behind — but nothing proved that, which is what the risk
 * register recorded as the residual risk. This is the proof, and it is checked
 * against the built artifact rather than against the build script, so it also
 * bites if the artifact is assembled some other way.
 *
 * Files under `js/collaboration/` that nothing imports are correctly absent and
 * are not the subject here: the rule is about edges, not about membership.
 */
function assertImportClosureIsComplete(outputDirectory, files) {
    const present = new Set(files);
    for (const relativePath of files) {
        if (!relativePath.endsWith('.js') && !relativePath.endsWith('.mjs')) continue;
        const source = fs.readFileSync(
            path.join(outputDirectory, ...relativePath.split('/')), 'utf8');
        for (const match of source.matchAll(MODULE_SPECIFIER)) {
            const resolved = path.posix.normalize(
                path.posix.join(path.posix.dirname(relativePath), match[2]));
            assert(present.has(resolved),
                `Deployment artifact imports a module it does not contain: ${relativePath} `
                + `imports ${match[2]} (${resolved}). Cloudflare Pages answers the SPA fallback `
                + `for that path -- a 200 of text/html where the browser expected a module -- so `
                + `this builds and runs locally and is broken only once deployed.`);
        }
    }
}

export function writeDeploymentManifest(targetPath, manifest) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + '\n');
}
