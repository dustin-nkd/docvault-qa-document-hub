const CLOUDFLARE_ORIGIN = 'https://docvault-qa-document-hub.pages.dev';
const GITHUB_ORIGIN = 'https://dustin-nkd.github.io';
const GITHUB_SITE = `${GITHUB_ORIGIN}/docvault-qa-document-hub`;

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

async function readBounded(response, limit = 256_000) {
    const length = Number(response.headers.get('content-length') || 0);
    assert(length <= limit, `Smoke response exceeds ${limit} bytes`);
    const source = await response.text();
    assert(Buffer.byteLength(source) <= limit, `Smoke response exceeds ${limit} bytes`);
    return source;
}

async function request(url, accept) {
    return fetch(url, {
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: accept }
    });
}

const cloudflareGuest = await request(`${CLOUDFLARE_ORIGIN}/?guest=1`, 'text/html');
const cloudflareGuestBody = await readBounded(cloudflareGuest);
assert(cloudflareGuest.status === 200 && cloudflareGuestBody.includes('<title>DocVault'), 'Cloudflare guest smoke failed');

const cloudflareApi = await request(`${CLOUDFLARE_ORIGIN}/api/v1/session`, 'application/json');
const cloudflareApiBody = await readBounded(cloudflareApi, 16_384);
assert(cloudflareApi.status === 503, 'Cloudflare disabled API must return 503');
assert(cloudflareApi.headers.get('content-type')?.startsWith('application/json'), 'Cloudflare API must return JSON');
assert(cloudflareApi.headers.get('cache-control') === 'no-store, private', 'Cloudflare API must remain non-cacheable');
assert(/^req_[0-9a-f-]{36}$/.test(cloudflareApi.headers.get('x-request-id') || ''), 'Cloudflare API request ID is missing');
assert(JSON.parse(cloudflareApiBody).error?.code === 'COLLABORATION_UNAVAILABLE', 'Cloudflare API did not fail closed');

const githubGuest = await request(`${GITHUB_SITE}/?guest=1`, 'text/html');
const githubGuestBody = await readBounded(githubGuest);
assert(githubGuest.status === 200 && githubGuestBody.includes('<title>DocVault'), 'GitHub Pages guest smoke failed');

const githubApi = await request(`${GITHUB_ORIGIN}/api/v1/session`, 'application/json');
const githubApiBody = await readBounded(githubApi, 64_000);
assert(githubApi.status === 404, 'GitHub Pages must not expose the collaboration API');
assert(!githubApi.headers.get('content-type')?.startsWith('application/json'), 'GitHub Pages must not imitate the API envelope');
assert(!githubApiBody.includes('COLLABORATION_UNAVAILABLE'), 'GitHub Pages returned a collaboration API response');

console.log('Production boundary smoke passed');
console.log('  Cloudflare guest: 200');
console.log('  Cloudflare API: 503 COLLABORATION_UNAVAILABLE, no-store');
console.log('  GitHub Pages guest: 200');
console.log('  GitHub Pages API: absent (404)');
