import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePhase7Exit, STORY_IDS, measureLazyChunk }
    from './cloudflare-phase-7-exit-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const json = relativePath => JSON.parse(read(relativePath));

const evidenceDirectory = path.join(root, 'docs/collaboration-foundation/evidence/phase-7');
const collaborationDirectory = path.join(root, 'js/collaboration');

const manifest = json('config/cloudflare/phase-7-exit-gate.json');
const collaborationSources = Object.fromEntries(fs.readdirSync(collaborationDirectory)
    .filter(name => name.endsWith('.js'))
    .map(name => [`js/collaboration/${name}`,
        fs.readFileSync(path.join(collaborationDirectory, name), 'utf8')]));

validatePhase7Exit({
    manifest,
    sprintPlan: json('config/cloudflare/phase-7-sprint-plan.json'),
    previewManifest: json('config/cloudflare/phase-7-preview-integration.json'),
    exitReport: read('docs/collaboration-foundation/phase-7-exit-report.md'),
    handoff: read('docs/collaboration-foundation/phase-8-handoff.md'),
    riskRegister: read('docs/collaboration-foundation/risk-register.md'),
    packageJson: json('package.json'),
    evidenceSources: Object.fromEntries(fs.readdirSync(evidenceDirectory)
        .filter(name => /^CF-EV-P7-.*\.md$/.test(name))
        .map(name => [name.replace(/\.md$/, ''),
            fs.readFileSync(path.join(evidenceDirectory, name), 'utf8')])),
    collaborationSources,
    decisionLog: read('docs/collaboration-foundation/decision-log.md')
});

const passing = manifest.stories.filter(story => story.status === 'PASS').length;
const measured = measureLazyChunk(collaborationSources);
const declared = json('config/cloudflare/phase-7-sprint-plan.json')
    .quality_budgets.lazy_phase_7_chunk_max_kib_gzip;

console.log('Cloudflare Phase 7 exit gate passed');
console.log(`  CF-P7-014: ${manifest.status}; ${passing} of ${STORY_IDS.length} stories PASS`);
console.log(`  P7-G5: ${manifest.exit_gate_granted ? 'GRANTED' : 'NOT GRANTED'} — `
    + 'the gate reconciles the record; it cannot supply a journey nobody ran');
console.log('  Sign-off: one blanket in-session owner authorization covering all seven roles;');
console.log('            no independent security or privacy review occurred');

if (manifest.lazy_chunk_budget.status === 'OPEN') {
    console.log('');
    console.log('  OPEN DEFECT — LAZY CHUNK BUDGET BREACHED');
    console.log(`    declared ${declared} KiB gzip; measured `
        + `${(measured.kib).toFixed(2)} KiB across ${measured.modules} modules here, `
        + `${manifest.lazy_chunk_budget.deployment_measurement.kib_gzip} KiB on the deployment`);
    console.log(`    the ${measured.phase7Modules} Phase 7 modules alone are `
        + `${(measured.phase7Bytes / 1024).toFixed(2)} KiB — no reading of it passes`);
    console.log('    OWNER DECISION REQUIRED — recorded, not amended, and not accepted:');
    for (const option of manifest.lazy_chunk_budget.options) {
        console.log(`      - ${option.option} (${option.requires})`);
    }
}

if (!manifest.exit_gate_granted) {
    console.log('');
    console.log('  PHASE 7 DOES NOT CLOSE. Open items:');
    for (const item of manifest.open_items) {
        console.log(`    - ${item.item} [${item.owner}]`);
    }
}
