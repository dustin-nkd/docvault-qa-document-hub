import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Dispatch } from './cloudflare-phase-7-dispatch-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');

validatePhase7Dispatch({
    manifest: JSON.parse(read('config/cloudflare/phase-7-dispatch.json')),
    environmentSource: read('functions/_lib/identity/environment.ts'),
    apiShellSource: read('functions/_lib/api-shell.mjs'),
    routeSource: read('functions/api/v1/[[path]].ts'),
    identityRuntimeTestSource: read('tests/cloudflare/identity-runtime.workers.test.ts'),
    identityPrimitivesTestSource: read('tests/cloudflare/identity-primitives.workers.test.ts'),
    evidence: read('docs/collaboration-foundation/evidence/phase-7/CF-EV-P7-OPS-006.md'),
    decisionLog: read('docs/collaboration-foundation/decision-log.md')
});

console.log('Cloudflare Phase 7 dispatch gate passed');
console.log('  CF-P7-017: PASS; the flag\'s polarity is corrected, api-shell.mjs\'s dead branch is gone');
console.log('  The three dispatch doors were already composed correctly in [[path]].ts; nothing new was built');
console.log('  Five workers-test fixtures updated; an explicit on/off contrast proves both directions');
console.log('  Production is unaffected; CF-P7-013 and P7-G5 remain open for reasons this story does not touch');
