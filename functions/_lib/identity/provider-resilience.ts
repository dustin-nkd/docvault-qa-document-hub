import type { GitHubIdentity, GitHubOAuthAdapter, GitHubOAuthResolutionInput } from './github-oauth-adapter';
import { GitHubOAuthAdapterError } from './github-oauth-adapter';

export interface ProviderCircuit {
    beforeRequest(): Promise<'closed' | 'probe' | 'open'>;
    record(outcome: 'success' | 'failure'): Promise<void>;
}

export function withProviderCircuit(provider: GitHubOAuthAdapter, circuit: ProviderCircuit): GitHubOAuthAdapter {
    return Object.freeze({
        async resolveIdentity(input: GitHubOAuthResolutionInput): Promise<GitHubIdentity> {
            let state: 'closed' | 'probe' | 'open';
            try { state = await circuit.beforeRequest(); } catch { throw new GitHubOAuthAdapterError(); }
            if (state !== 'closed' && state !== 'probe' && state !== 'open') throw new GitHubOAuthAdapterError();
            if (state === 'open') throw new GitHubOAuthAdapterError();
            try {
                const identity = await provider.resolveIdentity(input);
                await circuit.record('success');
                return identity;
            } catch (error) {
                try { await circuit.record('failure'); } catch { /* keep provider error generic */ }
                if (error instanceof GitHubOAuthAdapterError) throw error;
                throw new GitHubOAuthAdapterError();
            }
        }
    });
}
