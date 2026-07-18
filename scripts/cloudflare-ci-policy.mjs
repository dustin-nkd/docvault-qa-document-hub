const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const orderedIndex = (source, token, after, label) => {
    const index = source.indexOf(token, after);
    assert(index > after, `CI step is missing or out of order: ${label}`);
    return index;
};

export function validateCloudflareCiBoundary(packageJson, workflow) {
    const scripts = packageJson.scripts || {};
    assert(scripts.check === 'npm run check:base && npm run check:cloudflare', 'The release check must compose base and Cloudflare gates');
    assert(scripts['check:base'] === 'node scripts/quality-check.mjs && npm run check:functions && npm test', 'The base quality gate drifted');
    assert(scripts['check:cloudflare'] === 'npm run cf:toolchain:check && npm run cf:config:check && npm run cf:types:check && npm run cf:burst:config:check && npm run cf:burst:types:check && npm run cf:burst:build && npm run test:collab:unit && npm run cf:test && npm run cf:rollback:rehearse && npm run cf:pages:dry-run && npm run cf:phase1:check && npm run cf:phase2:schema:check && npm run cf:phase2:migrations:check && npm run cf:phase2:readiness:check && npm run cf:phase2:persistence:check && npm run cf:phase2:recipes:check && npm run cf:phase2:quality:check && npm run cf:phase2:preview:check && npm run cf:phase2:recovery:check && npm run cf:phase2:exit:check && npm run cf:phase3:sprint:check && npm run cf:phase3:contract:check && npm run cf:phase3:primitives:check && npm run cf:phase3:oauth:check && npm run cf:phase3:callback:check && npm run cf:phase3:session:check && npm run cf:phase3:request-policy:check && npm run cf:phase3:abuse:check && npm run cf:phase3:preview-identity:check && npm run cf:phase3:exit:check', 'The Cloudflare release gate is incomplete or out of order');
    assert(scripts['check:deployment-boundary'] === 'node scripts/check-deployment-boundary.mjs', 'The deployment artifact gate drifted');
    assert(!/\|\|\s*true|--passWithNoTests|continue-on-error/i.test(Object.values(scripts).join('\n')), 'A required release gate can be bypassed');
    assert(/fetch-depth:\s*0/.test(workflow), 'Full Git history is required for rollback-target verification');

    let cursor = -1;
    cursor = orderedIndex(workflow, 'run: npm ci', cursor, 'locked install');
    cursor = orderedIndex(workflow, 'run: npm run check', cursor, 'full production and Cloudflare gate');
    cursor = orderedIndex(workflow, 'run: npm run build:css', cursor, 'CSS build');
    cursor = orderedIndex(workflow, 'run: npm run build:pages', cursor, 'Pages artifact build');
    cursor = orderedIndex(workflow, 'run: npm run check:deployment-boundary', cursor, 'deployment artifact boundary');
    cursor = orderedIndex(workflow, 'run: npx playwright install --with-deps chromium', cursor, 'browser install');
    cursor = orderedIndex(workflow, 'run: npm run test:e2e', cursor, 'browser regression');
    orderedIndex(workflow, 'uses: peaceiris/actions-gh-pages@', cursor, 'deployment');
    assert(!/continue-on-error\s*:\s*true|if\s*:\s*always\(\)/i.test(workflow), 'CI must not deploy after a failed gate');
    return true;
}
