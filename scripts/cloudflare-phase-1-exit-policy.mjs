const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const REQUIRED_STORIES = {
    'CF-P1-001': ['CF-EV-P1-OPS-001', 'CF-EV-P1-SEC-001'],
    'CF-P1-002': ['CF-EV-P1-STA-001', 'CF-EV-P1-STA-002', 'CF-EV-P1-STA-003'],
    'CF-P1-003': ['CF-EV-P1-STA-004', 'CF-EV-P1-OPS-002', 'CF-EV-P1-SEC-002'],
    'CF-P1-004': ['CF-EV-P1-UT-001', 'CF-EV-P1-API-001', 'CF-EV-P1-API-002', 'CF-EV-P1-API-003', 'CF-EV-P1-API-004', 'CF-EV-P1-API-005', 'CF-EV-P1-API-006', 'CF-EV-P1-SEC-003'],
    'CF-P1-005': ['CF-EV-P1-API-007', 'CF-EV-P1-SEC-004', 'CF-EV-P1-SEC-005', 'CF-EV-P1-E2E-001'],
    'CF-P1-006': ['CF-EV-P1-UT-002', 'CF-EV-P1-UT-003', 'CF-EV-P1-STA-005', 'CF-EV-P1-SEC-006'],
    'CF-P1-007': ['CF-EV-P1-INT-001', 'CF-EV-P1-INT-002', 'CF-EV-P1-INT-003', 'CF-EV-P1-INT-004', 'CF-EV-P1-INT-005', 'CF-EV-P1-SEC-007'],
    'CF-P1-008': ['CF-EV-P1-STA-006', 'CF-EV-P1-STA-007', 'CF-EV-P1-E2E-002', 'CF-EV-P1-OPS-003', 'CF-EV-P1-OPS-004'],
    'CF-P1-009': ['CF-EV-P1-OPS-005']
};

const REMOTE_BINDING_KEYS = [
    'd1_databases', 'kv_namespaces', 'r2_buckets', 'durable_objects',
    'services', 'queues', 'analytics_engine_datasets', 'hyperdrive'
];

const sorted = values => [...values].sort();
const sameSet = (actual, expected) => JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
const sameRecord = (actual, expected) => JSON.stringify(Object.entries(actual).sort()) === JSON.stringify(Object.entries(expected).sort());
const containsKey = (value, keys) => {
    if (!value || typeof value !== 'object') return false;
    if (Object.keys(value).some(key => keys.includes(key))) return true;
    return Object.values(value).some(child => containsKey(child, keys));
};

export function parseRiskRegister(source) {
    return source.split(/\r?\n/)
        .filter(line => /^\| R\d{2} \|/.test(line))
        .map(line => {
            const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
            return { id: cells[0], contractOwner: cells[4], evidenceOwner: cells[5], status: cells[9] };
        });
}

export function validatePhase1ExitGate({
    manifest,
    evidenceSources,
    packageJson,
    wrangler,
    configurationDiff,
    riskRegister,
    exitReport,
    asOf = new Date()
}) {
    assert(manifest?.schema_version === 1 && manifest.phase === 'CF-P1', 'Unsupported Phase 1 exit manifest');
    assert(manifest.story === 'CF-P1-009' && manifest.status === 'PASS', 'Phase 1 exit story must pass');
    assert(manifest.recommendation?.phase_2_foundation_implementation === 'GO', 'Phase 2 implementation recommendation must be explicit GO');
    assert(manifest.recommendation?.collaboration_activation === 'NO-GO', 'Collaboration activation must remain NO-GO');

    const reviewDue = new Date(`${manifest.review_due}T23:59:59Z`);
    assert(Number.isFinite(reviewDue.getTime()) && asOf <= reviewDue, 'Phase 1 Critical/High risk review has expired');

    const stories = manifest.stories || [];
    assert(sameSet(stories.map(story => story.id), Object.keys(REQUIRED_STORIES)), 'Phase 1 story inventory drifted');
    const referencedEvidence = [];
    for (const story of stories) {
        assert(story.status === 'PASS', `${story.id} is not PASS`);
        assert(Array.isArray(story.owners) && story.owners.length > 0, `${story.id} has no owner`);
        assert(Array.isArray(story.reviewers) && story.reviewers.length > 0, `${story.id} has no reviewer`);
        assert(new Set([...story.owners, ...story.reviewers]).has('Senior QA'), `${story.id} lacks Senior QA accountability`);
        assert(story.requirements?.length > 0 && story.risks?.length > 0, `${story.id} lacks traceability`);
        assert(sameSet(story.evidence || [], REQUIRED_STORIES[story.id]), `${story.id} evidence inventory drifted`);
        referencedEvidence.push(...story.evidence);
    }
    assert(new Set(referencedEvidence).size === referencedEvidence.length, 'Evidence IDs must belong to one story');
    assert(sameSet(Object.keys(evidenceSources), referencedEvidence), 'Committed Phase 1 evidence files and manifest differ');
    for (const [id, source] of Object.entries(evidenceSources)) {
        assert(source.startsWith(`# ${id} `), `${id} heading is invalid`);
        assert(/^Status: PASS$/m.test(source), `${id} is not PASS`);
        const story = stories.find(candidate => candidate.evidence.includes(id));
        assert(source.includes(story.id), `${id} does not identify ${story.id}`);
    }

    const exceptions = manifest.quality_exceptions || {};
    const requiredZeroLists = [
        'p0_p1_skipped', 'p0_p1_quarantined', 'disabled_cases', 'accepted_flakiness',
        'secret_or_privacy_canary_matches', 'unexpected_side_effects', 'open_p0_p1_defects',
        'unowned_or_expired_critical_high_risks'
    ];
    for (const key of requiredZeroLists) assert(Array.isArray(exceptions[key]) && exceptions[key].length === 0, `Phase 1 exception is not zero: ${key}`);

    assert(sameRecord(manifest.dependency_inventory || {}, packageJson.devDependencies || {}), 'Dependency inventory drifted');
    assert(manifest.production_boundary?.collaboration_enabled === 'false', 'Production collaboration must remain disabled');
    assert(manifest.production_boundary?.user_or_workspace_data === 'absent-no-remote-storage-binding', 'Production data boundary is not empty');
    assert(sameSet(manifest.production_boundary?.functions_include || [], ['/api/v1/*']), 'Functions route boundary drifted');
    assert((manifest.production_boundary?.remote_binding_names || []).length === 0, 'Exit manifest contains a remote binding');
    const states = [wrangler.vars, wrangler.env?.preview?.vars, wrangler.env?.production?.vars];
    assert(states.every(vars => vars?.COLLABORATION_ENABLED === 'false'), 'Wrangler no longer fails closed in every environment');
    assert(!containsKey(withoutApprovedPreviewD1(wrangler), REMOTE_BINDING_KEYS), 'Wrangler contains an unapproved remote binding');
    assert((configurationDiff.remote_binding_names?.preview || []).length === 0
        && (configurationDiff.remote_binding_names?.production || []).length === 0, 'Reviewed configuration diff contains a remote binding');

    const risks = parseRiskRegister(riskRegister);
    assert(sameSet(risks.map(risk => risk.id), Array.from({ length: 22 }, (_, index) => `R${String(index + 1).padStart(2, '0')}`)), 'Risk register must contain R01-R22 exactly once');
    assert(risks.every(risk => risk.contractOwner && risk.evidenceOwner), 'Critical/High risk ownership is incomplete');
    assert(risks.every(risk => !/^Open\b/i.test(risk.status)), 'An open risk remains at Phase 1 exit');

    assert(/^Status: PASS$/m.test(exitReport), 'Phase 1 exit report is not PASS');
    assert(exitReport.includes('Phase 2 foundation implementation: `GO`'), 'Exit report lacks Phase 2 GO');
    assert(exitReport.includes('Collaboration activation: `NO-GO`'), 'Exit report lacks activation NO-GO');
    assert(exitReport.includes('Product Owner') && exitReport.includes('Security Reviewer')
        && exitReport.includes('Operations') && exitReport.includes('UX Lead')
        && exitReport.includes('Technical Lead') && exitReport.includes('Senior QA'), 'Cross-functional review record is incomplete');
    return true;
}

export { REQUIRED_STORIES };
import { withoutApprovedPreviewD1 } from './cloudflare-wrangler-policy.mjs';
