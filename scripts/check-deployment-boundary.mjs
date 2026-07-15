import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    validateDeploymentArtifact,
    writeDeploymentManifest
} from './cloudflare-deployment-boundary-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = validateDeploymentArtifact(path.join(root, '_site'));
writeDeploymentManifest(path.join(root, '.wrangler', 'pages-artifact-manifest.json'), manifest);

console.log('Cloudflare deployment boundary passed');
console.log('  Runtime files:', manifest.files.length);
console.log('  Payload:', manifest.total_bytes, 'bytes');
console.log('  Protected server/test/evidence/local state: absent');
console.log('  Functions invocation: /api/v1/* only');
