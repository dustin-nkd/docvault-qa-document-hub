import type { GuardedBatchRecipe, GuardedBatchStatement } from './atomic-batch';
import { PersistenceError } from './repository';

export type SecurityMutationOperation =
    | 'workspace.create'
    | 'invitation.replace'
    | 'invitation.accept'
    | 'membership.change'
    | 'envelope.provision'
    | 'document.update'
    | 'rotation.commit';

export type BindValue = string | number | ArrayBuffer | null;

export interface RecipeBindings {
    readonly guard: readonly BindValue[];
    readonly domain: readonly (readonly BindValue[])[];
    readonly audit: readonly BindValue[];
    readonly result: readonly BindValue[];
}

export interface StoredMutationResult {
    readonly id: string;
    readonly httpStatus: number;
    readonly resultJson: string;
}

interface RecipeContract {
    readonly ledger: 'mutation_results' | 'transition_guards';
    readonly guard: string;
    readonly domain: readonly string[];
    readonly auditEvent: string;
    readonly auditTarget: 'workspace' | 'invitation' | 'membership' | 'key_envelope' | 'document' | 'key_version';
}

export const SECURITY_RECIPE_CONTRACTS: Readonly<Record<SecurityMutationOperation, RecipeContract>> = Object.freeze({
    'workspace.create': {
        ledger: 'transition_guards',
        guard: `INSERT INTO transition_guards (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, invitation_id, credential_digest,
          http_status, result_json, created_at, expires_at, authority_guard)
         VALUES (?, ?, ?, ?, 'workspace.create', ?, ?, NULL, NULL, 201, ?, ?, ?, 1)`,
        domain: [
            `INSERT INTO workspaces (id, display_name, description_envelope, state,
              current_key_version, created_by, created_at, updated_at, deleted_at)
             VALUES (?, ?, ?, 'active', 1, ?, ?, ?, NULL)`,
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, ?, ?, NULL, 1)`,
        ], auditEvent: 'workspace.created', auditTarget: 'workspace'
    },
    'invitation.accept': {
        ledger: 'transition_guards',
        guard: `INSERT INTO transition_guards (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, invitation_id, credential_digest,
          http_status, result_json, created_at, expires_at, authority_guard)
         VALUES (?, ?, ?, ?, 'invitation.accept', ?, ?, ?, ?, 200, ?, ?, ?, 1)`,
        domain: [
            `UPDATE invitations SET state = 'accepted', accepted_by = ?, accepted_at = ?
             WHERE id = ? AND workspace_id = ? AND state = 'pending'
               AND target_provider_subject = (SELECT provider_subject FROM users WHERE id = ?)
               AND token_digest = ? AND expires_at >= ?`,
            `INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
              accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
             SELECT ?, ?, offered_role, 'pending_key', invited_by, ?, NULL, ?, NULL, NULL, 1
             FROM invitations WHERE id = ? AND state = 'accepted'`
        ], auditEvent: 'invitation.accepted', auditTarget: 'invitation'
    },
    'invitation.replace': {
        ledger: 'mutation_results',
        guard: `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'invitation.replace', ?, ?, 'invitation', ?, 200,
           (SELECT ? FROM memberships m JOIN devices d ON d.user_id = m.user_id
            WHERE m.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
              AND m.role IN ('owner', 'admin') AND d.id = ? AND d.state = 'active'), ?, ?)`,
        domain: [
            `UPDATE invitations SET state = 'revoked', revoked_at = ?
             WHERE id = ? AND workspace_id = ? AND state = 'pending'`,
            `INSERT INTO invitations (id, workspace_id, target_provider, target_provider_subject,
              target_login_snapshot, offered_role, token_digest, state, invited_by, accepted_by,
              created_at, expires_at, accepted_at, revoked_at, expired_at, replacement_of)
             VALUES (?, ?, 'github', ?, ?, ?, ?, 'pending', ?, NULL, ?, ?, NULL, NULL, NULL, ?)`
        ], auditEvent: 'invitation.replaced', auditTarget: 'invitation'
    },
    'membership.change': {
        ledger: 'mutation_results',
        guard: `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'membership.change', ?, ?, 'membership', ?, 200,
           (SELECT ? FROM memberships actor JOIN devices d ON d.user_id = actor.user_id
            JOIN memberships target ON target.workspace_id = actor.workspace_id
            WHERE actor.workspace_id = ? AND actor.user_id = ? AND actor.role = 'owner'
              AND actor.state = 'active' AND d.id = ? AND d.state = 'active'
              AND target.user_id = ? AND target.state = 'active' AND target.role_version = ?
              AND (target.role <> 'owner' OR ? = 'owner' OR
                (SELECT COUNT(*) FROM memberships owners WHERE owners.workspace_id = ?
                  AND owners.role = 'owner' AND owners.state = 'active') > 1)), ?, ?)`,
        domain: [`UPDATE memberships SET role = ?, role_version = role_version + 1
          WHERE workspace_id = ? AND user_id = ? AND role_version = ? AND state = 'active'`],
        auditEvent: 'membership.changed', auditTarget: 'membership'
    },
    'envelope.provision': {
        ledger: 'mutation_results',
        guard: `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'envelope.provision', ?, ?, 'key_envelope', ?, 201,
           (SELECT ? FROM memberships wrapper JOIN devices wd ON wd.user_id = wrapper.user_id
            JOIN memberships target ON target.workspace_id = wrapper.workspace_id
            JOIN devices td ON td.user_id = target.user_id
            JOIN workspace_key_versions kv ON kv.workspace_id = wrapper.workspace_id
            WHERE wrapper.workspace_id = ? AND wrapper.user_id = ? AND wrapper.state = 'active'
              AND wrapper.role IN ('owner', 'admin') AND wd.id = ? AND wd.state = 'active'
              AND target.user_id = ? AND target.state = 'pending_key'
              AND td.id = ? AND td.state = 'active' AND td.fingerprint = ?
              AND kv.key_version = ? AND kv.state IN ('current', 'preparing')), ?, ?)`,
        domain: [
            `INSERT INTO workspace_key_envelopes (id, workspace_id, key_version, target_user_id,
              target_device_id, target_fingerprint, wrapper_user_id, wrapper_device_id, suite,
              ephemeral_public_jwk, hkdf_salt, nonce, ciphertext, aad_digest, created_at, revoked_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, ?, NULL)`,
            `UPDATE memberships SET state = 'active', activated_at = ?, role_version = role_version + 1
             WHERE workspace_id = ? AND user_id = ? AND state = 'pending_key'`
        ], auditEvent: 'envelope.provisioned', auditTarget: 'key_envelope'
    },
    'document.update': {
        ledger: 'mutation_results',
        guard: `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'document.update', ?, ?, 'document', ?, 200,
           (SELECT ? FROM memberships m JOIN devices d ON d.user_id = m.user_id
            JOIN documents doc ON doc.workspace_id = m.workspace_id
            JOIN workspace_key_versions kv ON kv.workspace_id = doc.workspace_id
            WHERE m.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
              AND m.role IN ('owner', 'admin', 'editor') AND d.id = ? AND d.state = 'active'
              AND doc.id = ? AND doc.state = 'active' AND doc.current_revision = ?
              AND kv.key_version = ? AND kv.state = 'current'), ?, ?)`,
        domain: [
            `INSERT INTO document_revisions (document_id, workspace_id, revision, base_revision,
              operation, key_version, ciphertext_envelope, ciphertext_digest, ciphertext_bytes,
              actor_user_id, actor_device_id, client_mutation_id, server_time)
             VALUES (?, ?, ?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?)`,
            `UPDATE documents SET current_revision = ?, current_key_version = ?,
              current_ciphertext_digest = ?, ciphertext_bytes = ?, updated_at = ?
             WHERE id = ? AND workspace_id = ? AND current_revision = ? AND state = 'active'`
        ], auditEvent: 'document.updated', auditTarget: 'document'
    },
    'rotation.commit': {
        ledger: 'mutation_results',
        guard: `INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'rotation.commit', ?, ?, 'key_version', ?, 200,
           (SELECT ? FROM memberships owner JOIN devices d ON d.user_id = owner.user_id
            JOIN workspaces w ON w.id = owner.workspace_id
            JOIN workspace_key_versions next ON next.workspace_id = w.id
            WHERE owner.workspace_id = ? AND owner.user_id = ? AND owner.role = 'owner'
              AND owner.state = 'active' AND d.id = ? AND d.state = 'active'
              AND w.state = 'rotating' AND w.current_key_version = ?
              AND next.key_version = ? AND next.state = 'preparing'
              AND NOT EXISTS (SELECT 1 FROM memberships m JOIN devices md ON md.user_id = m.user_id
                WHERE m.workspace_id = w.id AND m.state = 'active' AND md.state = 'active'
                  AND NOT EXISTS (SELECT 1 FROM workspace_key_envelopes e
                    WHERE e.workspace_id = w.id AND e.key_version = next.key_version
                      AND e.target_device_id = md.id AND e.revoked_at IS NULL))), ?, ?)`,
        domain: [
            `UPDATE workspace_key_versions SET state = 'retired', retired_at = ?
             WHERE workspace_id = ? AND key_version = ? AND state = 'current'`,
            `UPDATE workspace_key_versions SET state = 'current', committed_at = ?
             WHERE workspace_id = ? AND key_version = ? AND state = 'preparing'`,
            `UPDATE workspaces SET current_key_version = ?, state = 'active', updated_at = ?
             WHERE id = ? AND current_key_version = ? AND state = 'rotating'`
        ], auditEvent: 'rotation.committed', auditTarget: 'key_version'
    }
});

function mapStoredResult(row: Record<string, unknown>): StoredMutationResult {
    if (typeof row.id !== 'string' || typeof row.http_status !== 'number'
        || typeof row.result_json !== 'string') throw new PersistenceError('PERSISTENCE_INTEGRITY');
    return { id: row.id, httpStatus: row.http_status, resultJson: row.result_json };
}

export function buildSecurityMutationRecipe(
    database: Pick<D1Database, 'prepare'>,
    operation: SecurityMutationOperation,
    bindings: RecipeBindings
): GuardedBatchRecipe<StoredMutationResult> {
    const contract = SECURITY_RECIPE_CONTRACTS[operation];
    if (bindings.domain.length !== contract.domain.length) {
        throw new PersistenceError('PERSISTENCE_INTEGRITY');
    }
    const statements: GuardedBatchStatement[] = [
        { role: 'guard', statement: database.prepare(contract.guard).bind(...bindings.guard), expectedChanges: 1 },
        ...contract.domain.map((sql, index) => ({
            role: 'domain' as const,
            statement: database.prepare(sql).bind(...bindings.domain[index]),
            expectedChanges: 1
        })),
        {
            role: 'audit', expectedChanges: 1,
            statement: database.prepare(
                `INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
                  outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id,
                  request_id, server_time, metadata_json, correction_of_event_id,
                  related_event_id, hold_state)
                 VALUES (?, 8, ?, ?, 'success', 'committed', ?, ?, ?, ?, ?, ?, '{}', NULL, NULL, 'none')`
            ).bind(...bindings.audit.slice(0, 2), contract.auditEvent, ...bindings.audit.slice(2, 4),
                contract.auditTarget, ...bindings.audit.slice(4))
        },
        {
            role: 'result',
            statement: database.prepare(
                contract.ledger === 'transition_guards'
                    ? 'SELECT id, http_status, result_json FROM transition_guards WHERE id = ? LIMIT 1'
                    : 'SELECT id, http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1'
            ).bind(...bindings.result)
        }
    ];
    return { statements, mapResult: mapStoredResult };
}

export const buildWorkspaceCreateRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'workspace.create', bindings);
export const buildInvitationReplaceRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'invitation.replace', bindings);
export const buildInvitationAcceptRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'invitation.accept', bindings);
export const buildMembershipChangeRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'membership.change', bindings);
export const buildEnvelopeProvisionRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'envelope.provision', bindings);
export const buildDocumentMutationRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'document.update', bindings);
export const buildRotationCommitRecipe = (db: Pick<D1Database, 'prepare'>, bindings: RecipeBindings) =>
    buildSecurityMutationRecipe(db, 'rotation.commit', bindings);
