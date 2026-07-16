import fs from 'node:fs';
import path from 'node:path';

const ENTRYPOINT = 'functions/api/v1/[[path]].ts';
const TEST_PATH_PATTERN = /(?:^|\/)(?:tests?|fixtures?|__mocks__)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]s$/i;
const TEST_ARTIFACT_MARKERS = [
    'createDeterministicRuntimeDependencies',
    'unit-provider-token',
    'Injected failure at',
    'MOCK_OAUTH',
    'FIXED_TOKEN',
    'TEST_MODE',
    'TEST_ONLY',
    'FAULT_FLAG'
];

const normalize = value => value.replace(/\\/g, '/');

export function validateProductionSourceText(relativePath, source) {
    const prohibited = [
        { pattern: /\bas\s+unknown\s+as\b/, label: 'unsafe double cast' },
        { pattern: /\{\s*any\s*\}|:\s*any\b/, label: 'explicit any' },
        { pattern: /@(?:ts-ignore|ts-expect-error)\b/, label: 'TypeScript suppression' },
        { pattern: /^(?:export\s+)?(?:let|var)\s+[A-Za-z_$]/m, label: 'module-level mutable state' },
        {
            pattern: /\b(?:TEST_MODE|TEST_ONLY|MOCK_OAUTH|FIXED_TOKEN|FAULT_FLAG|USE_TEST_ADAPTER)\b/,
            label: 'runtime test selector'
        },
        {
            pattern: /\b[A-Za-z_$][\w$]*(?:secret|password|verifier|signature)[\w$]*\s*(?:===|!==)|(?:===|!==)\s*[A-Za-z_$][\w$]*(?:secret|password|verifier|signature)[\w$]*/i,
            label: 'direct secret comparison'
        }
    ];
    for (const rule of prohibited) {
        if (rule.pattern.test(source)) throw new Error(`${relativePath} contains prohibited ${rule.label}`);
    }
    return true;
}

export function validateProductionHandlerWiring(source) {
    if (!/import\s+\{\s*PLATFORM_DEPENDENCIES\s*\}\s+from\s+['"]\.\.\/\.\.\/_lib\/runtime-dependencies\.mjs['"]/.test(source)) {
        throw new Error('Production handler must import the platform dependency implementation directly');
    }
    if (!/handleApiRequest\(context\.request,\s*context\.env,\s*PLATFORM_DEPENDENCIES\)/.test(source)) {
        throw new Error('Production handler must inject only PLATFORM_DEPENDENCIES');
    }
    const references = source.match(/PLATFORM_DEPENDENCIES/g) || [];
    if (references.length !== 2) throw new Error('Production dependency wiring contains an unexpected selector');
    return true;
}

function relativeImports(source) {
    const imports = [];
    const pattern = /(?:import\s+(?:[^'";]*?\s+from\s+)?|export\s+[^'";]*?\s+from\s+)['"]([^'"]+)['"]/g;
    for (const match of source.matchAll(pattern)) {
        if (match[1].startsWith('.')) imports.push(match[1]);
    }
    return imports;
}

function resolveSourceImport(fromFile, specifier) {
    const candidate = path.resolve(path.dirname(fromFile), specifier);
    for (const resolved of [candidate, `${candidate}.ts`, `${candidate}.mjs`]) {
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) return resolved;
    }
    return candidate;
}

export function validateProductionSourceGraph(root) {
    const functionsRoot = path.resolve(root, 'functions');
    const pending = [path.resolve(root, ENTRYPOINT)];
    const visited = new Set();

    while (pending.length > 0) {
        const filePath = pending.pop();
        if (visited.has(filePath)) continue;
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            throw new Error(`Production import is missing: ${normalize(path.relative(root, filePath))}`);
        }
        const relativePath = normalize(path.relative(root, filePath));
        if (TEST_PATH_PATTERN.test(relativePath)) throw new Error(`Production imports test code: ${relativePath}`);
        if (filePath !== path.resolve(root, ENTRYPOINT)
            && filePath !== functionsRoot
            && !filePath.startsWith(functionsRoot + path.sep)) {
            throw new Error(`Production import escapes functions/: ${relativePath}`);
        }

        const source = fs.readFileSync(filePath, 'utf8');
        validateProductionSourceText(relativePath, source);
        if (relativePath === ENTRYPOINT) validateProductionHandlerWiring(source);
        visited.add(filePath);
        for (const specifier of relativeImports(source)) {
            pending.push(resolveSourceImport(filePath, specifier));
        }
    }

    return [...visited].map(filePath => normalize(path.relative(root, filePath))).sort();
}

export function validateProductionMetafile(metafile, bundleSource) {
    const inputs = Object.keys(metafile?.inputs || {}).map(normalize);
    const leakedInput = inputs.find(input => TEST_PATH_PATTERN.test(input));
    if (leakedInput) throw new Error(`Compiled Worker imports test code: ${leakedInput}`);

    const leakedMarker = TEST_ARTIFACT_MARKERS.find(marker => bundleSource.includes(marker));
    if (leakedMarker) throw new Error(`Compiled Worker contains test artifact marker: ${leakedMarker}`);
    return true;
}

export function validateCompiledWorkerArtifact(outputDirectory) {
    const metafilePath = path.join(outputDirectory, 'meta.json');
    const bundlePath = path.join(outputDirectory, 'index.js');
    if (!fs.existsSync(metafilePath) || !fs.existsSync(bundlePath)) {
        throw new Error('Compiled Worker artifact or metafile is missing');
    }
    return validateProductionMetafile(
        JSON.parse(fs.readFileSync(metafilePath, 'utf8')),
        fs.readFileSync(bundlePath, 'utf8')
    );
}
