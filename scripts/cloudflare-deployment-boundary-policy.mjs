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

    validatePagesRoutesDocument(JSON.parse(fs.readFileSync(path.join(outputDirectory, '_routes.json'), 'utf8')));
    return { schema_version: 1, files: manifestFiles, total_bytes: totalBytes };
}

export function writeDeploymentManifest(targetPath, manifest) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, JSON.stringify(manifest, null, 2) + '\n');
}
