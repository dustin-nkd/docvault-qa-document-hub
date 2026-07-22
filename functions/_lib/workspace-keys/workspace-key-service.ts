import { canonicalize, decodeBase64Url, encodeBase64Url, exactObject, requireSafeInteger,
    requireUuidV4, sha256, type JsonValue, utf8 } from '../e2ee/canonical';
import { E2EE, type WorkspaceKeyEnvelope } from '../e2ee/primitives';
import { parsePublicJwk, type CanonicalPublicJwk } from '../e2ee/jwk';
import { PersistenceError, requireCheckedChanges, translatePersistenceError } from '../persistence/repository';

const CONTROL = /[\u0000-\u001f\u007f]/;
const REPLAY_MAX_MS = 2_592_000_000;

export type WorkspaceKeyReadiness = 'not_entitled' | 'pending_key' | 'key_ready' | 'stale_key' | 'revoked';

interface LiveContext {
    readonly actorUserId: string; readonly actorSessionId: string; readonly actorDeviceId: string;
    readonly serverTime: number;
}

interface MutationContext extends LiveContext {
    readonly mutationResultId: string; readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer; readonly auditEventId: string;
    readonly requestId: string; readonly replayExpiresAt: number;
}

export interface WorkspaceBootstrapIntentInput extends LiveContext { readonly clientMutationId: string; }
export interface WorkspaceBootstrapIntent {
    readonly workspaceId: string; readonly actorUserId: string; readonly actorDeviceId: string;
    readonly keyVersion: 1; readonly suite: typeof E2EE.workspaceSuite;
}
export interface BootstrapWorkspaceKeyInput extends MutationContext {
    readonly workspaceId: string; readonly displayName: string;
    readonly descriptionEnvelope: ArrayBuffer | null; readonly envelopeId: string;
    readonly envelope: WorkspaceKeyEnvelope;
}
export interface ProvisionWorkspaceEnvelopeInput extends MutationContext {
    readonly workspaceId: string; readonly envelopeId: string;
    readonly targetUserId: string; readonly targetDeviceId: string;
    readonly targetFingerprint: string; readonly keyVersion: number;
    readonly envelope: WorkspaceKeyEnvelope;
}
export interface WorkspaceKeyMutationResult {
    readonly workspaceId: string; readonly envelopeId: string;
    readonly targetDeviceId: string; readonly keyVersion: number; readonly readiness: 'key_ready';
    readonly httpStatus: 201;
}
export interface ProvisioningTarget {
    readonly userId: string; readonly deviceId: string; readonly fingerprint: string;
    readonly publicJwk: CanonicalPublicJwk; readonly keyVersion: number;
}
interface ValidatedEnvelope {
    readonly ephemeralPublicJwk: string; readonly hkdfSalt: ArrayBuffer;
    readonly nonce: ArrayBuffer; readonly ciphertext: ArrayBuffer; readonly aadDigest: ArrayBuffer;
}

function fail(code: ConstructorParameters<typeof PersistenceError>[0] = 'PERSISTENCE_INTEGRITY'): never {
    throw new PersistenceError(code);
}
function validateLive(input: LiveContext): void {
    requireUuidV4(input.actorUserId); requireUuidV4(input.actorSessionId); requireUuidV4(input.actorDeviceId);
    if (!Number.isSafeInteger(input.serverTime) || input.serverTime < 0) fail();
}
function validateMutation(input: MutationContext): void {
    validateLive(input);
    for (const id of [input.mutationResultId, input.clientMutationId, input.auditEventId, input.requestId]) requireUuidV4(id);
    if (!(input.requestFingerprint instanceof ArrayBuffer) || input.requestFingerprint.byteLength !== 32
        || !Number.isSafeInteger(input.replayExpiresAt) || input.replayExpiresAt <= input.serverTime
        || input.replayExpiresAt > input.serverTime + REPLAY_MAX_MS) fail();
}
function uuidFromDigest(digest: Uint8Array): string {
    const bytes = digest.slice(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function deriveWorkspaceId(input: Pick<WorkspaceBootstrapIntentInput,
    'actorUserId' | 'actorDeviceId' | 'clientMutationId'>): Promise<string> {
    return uuidFromDigest(await sha256(utf8(canonicalize({ actorDeviceId: input.actorDeviceId,
        actorUserId: input.actorUserId, clientMutationId: input.clientMutationId,
        purpose: 'docvault-workspace-bootstrap-v1' }))));
}
async function requireLiveDevice(database: D1Database, input: LiveContext): Promise<void> {
    const row = await database.prepare(
        `SELECT d.id FROM users u JOIN sessions s ON s.user_id = u.id JOIN devices d ON d.user_id = u.id
         WHERE u.id = ? AND u.status = 'active' AND s.id = ? AND s.revoked_at IS NULL
           AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
           AND d.id = ? AND d.state = 'active' LIMIT 1`
    ).bind(input.actorUserId, input.actorSessionId, input.serverTime, input.serverTime,
        input.actorDeviceId).first<{ id: string }>();
    if (row === null) throw new PersistenceError('AUTHORITY_REVOKED');
}
function blob32(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer && value.byteLength === 32) return value;
    if (Array.isArray(value) && value.length === 32
        && value.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return Uint8Array.from(value).buffer;
    if (ArrayBuffer.isView(value) && value.byteLength === 32)
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    return fail();
}
function equal32(first: ArrayBuffer, second: ArrayBuffer): boolean {
    const a = new Uint8Array(first); const b = new Uint8Array(second);
    if (a.byteLength !== 32 || b.byteLength !== 32) return false;
    let difference = 0; for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}
function parseResult(row: Record<string, unknown>): WorkspaceKeyMutationResult {
    if (row.http_status !== 201 || typeof row.result_json !== 'string') fail();
    let value: unknown; try { value = JSON.parse(row.result_json); } catch { return fail(); }
    const item = exactObject(value, ['envelopeId', 'keyVersion', 'readiness', 'targetDeviceId', 'workspaceId']);
    requireUuidV4(item.workspaceId); requireUuidV4(item.envelopeId); requireUuidV4(item.targetDeviceId);
    requireSafeInteger(item.keyVersion, 1, 2_147_483_647); if (item.readiness !== 'key_ready') fail();
    return Object.freeze({ workspaceId: item.workspaceId as string, envelopeId: item.envelopeId as string,
        targetDeviceId: item.targetDeviceId as string, keyVersion: item.keyVersion as number,
        readiness: 'key_ready', httpStatus: 201 });
}
function resultJson(result: Omit<WorkspaceKeyMutationResult, 'httpStatus'>): string {
    return canonicalize(result);
}
async function replay(database: D1Database, input: MutationContext, workspaceId: string,
    operation: 'workspace.create' | 'envelope.provision'): Promise<WorkspaceKeyMutationResult | null> {
    const row = await database.prepare(
        `SELECT m.request_fingerprint, m.http_status, m.result_json, m.expires_at
         FROM mutation_results m JOIN users u ON u.id = m.actor_user_id
         JOIN sessions s ON s.id = ? AND s.user_id = m.actor_user_id
         JOIN devices d ON d.id = m.actor_device_id AND d.user_id = m.actor_user_id
         WHERE m.actor_user_id = ? AND m.actor_device_id = ? AND m.workspace_id = ?
           AND m.operation = ? AND m.client_mutation_id = ? AND u.status = 'active'
           AND s.revoked_at IS NULL AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
           AND d.state = 'active' LIMIT 1`
    ).bind(input.actorSessionId, input.actorUserId, input.actorDeviceId, workspaceId,
        operation, input.clientMutationId, input.serverTime, input.serverTime)
        .first<Record<string, unknown>>();
    if (row === null) return null;
    if (!equal32(blob32(row.request_fingerprint), input.requestFingerprint)) fail('IDEMPOTENCY_KEY_REUSED');
    if (typeof row.expires_at !== 'number' || input.serverTime >= row.expires_at) fail('IDEMPOTENCY_EXPIRED');
    return parseResult(row);
}
async function validateEnvelope(envelope: unknown, expected: {
    workspaceId: string; targetUserId: string; targetDeviceId: string;
    targetFingerprint: string; wrapperDeviceId: string; keyVersion: number;
}): Promise<ValidatedEnvelope> {
    const value = exactObject(envelope, ['aad', 'ciphertext', 'ephemeralPublicJwk', 'hkdfSalt', 'nonce']);
    const aad = exactObject(value.aad, ['version', 'suite', 'workspaceId', 'targetUserId',
        'targetDeviceId', 'targetFingerprint', 'wrapperDeviceId', 'keyVersion']);
    if (aad.version !== 1 || aad.suite !== E2EE.workspaceSuite
        || aad.workspaceId !== expected.workspaceId || aad.targetUserId !== expected.targetUserId
        || aad.targetDeviceId !== expected.targetDeviceId || aad.targetFingerprint !== expected.targetFingerprint
        || aad.wrapperDeviceId !== expected.wrapperDeviceId || aad.keyVersion !== expected.keyVersion) fail();
    decodeBase64Url(expected.targetFingerprint, 32, 32);
    const ephemeral = await parsePublicJwk(value.ephemeralPublicJwk);
    return Object.freeze({ ephemeralPublicJwk: canonicalize(ephemeral.jwk),
        hkdfSalt: decodeBase64Url(String(value.hkdfSalt), 32, 32).slice().buffer as ArrayBuffer,
        nonce: decodeBase64Url(String(value.nonce), 12, 12).slice().buffer as ArrayBuffer,
        ciphertext: decodeBase64Url(String(value.ciphertext), 48, 48).slice().buffer as ArrayBuffer,
        aadDigest: (await sha256(utf8(canonicalize(aad)))).slice().buffer as ArrayBuffer });
}
async function executeBatch(database: D1Database, statements: readonly D1PreparedStatement[],
    writes: number): Promise<WorkspaceKeyMutationResult> {
    try {
        const results = await database.batch<Record<string, unknown>>([...statements]);
        if (results.length !== writes + 1) fail();
        for (let index = 0; index < writes; index += 1) requireCheckedChanges(results[index], 1);
        const rows = results[writes]?.results;
        if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0] !== 'object' || rows[0] === null) fail();
        return parseResult(rows[0] as Record<string, unknown>);
    } catch (error) { throw translatePersistenceError(error); }
}

export async function createWorkspaceBootstrapIntent(database: D1Database,
    input: WorkspaceBootstrapIntentInput): Promise<WorkspaceBootstrapIntent> {
    validateLive(input); requireUuidV4(input.clientMutationId); await requireLiveDevice(database, input);
    return Object.freeze({ workspaceId: await deriveWorkspaceId(input), actorUserId: input.actorUserId,
        actorDeviceId: input.actorDeviceId, keyVersion: 1, suite: E2EE.workspaceSuite });
}

export async function bootstrapWorkspaceKey(database: D1Database,
    input: BootstrapWorkspaceKeyInput): Promise<WorkspaceKeyMutationResult> {
    validateMutation(input); requireUuidV4(input.workspaceId); requireUuidV4(input.envelopeId);
    const requestFingerprint = input.requestFingerprint.slice(0);
    const boundRequestFingerprint = requestFingerprint.slice(0);
    const replayInput = { ...input, requestFingerprint };
    if (input.workspaceId !== await deriveWorkspaceId(input)) fail();
    const length = [...input.displayName].length;
    if (input.displayName !== input.displayName.trim() || length < 1 || length > 80 || CONTROL.test(input.displayName)
        || input.descriptionEnvelope !== null && (!(input.descriptionEnvelope instanceof ArrayBuffer)
            || input.descriptionEnvelope.byteLength < 18 || input.descriptionEnvelope.byteLength > 8192)) fail();
    const device = await database.prepare(
        `SELECT fingerprint FROM devices WHERE id = ? AND user_id = ? AND state = 'active' LIMIT 1`
    ).bind(input.actorDeviceId, input.actorUserId).first<{ fingerprint: ArrayBuffer }>();
    if (device === null) throw new PersistenceError('AUTHORITY_REVOKED');
    const deviceFingerprint = blob32(device.fingerprint);
    const targetFingerprint = encodeBase64Url(new Uint8Array(deviceFingerprint));
    const envelope = await validateEnvelope(input.envelope, { workspaceId: input.workspaceId,
        targetUserId: input.actorUserId, targetDeviceId: input.actorDeviceId, targetFingerprint,
        wrapperDeviceId: input.actorDeviceId, keyVersion: 1 });
    const prior = await replay(database, replayInput, input.workspaceId, 'workspace.create'); if (prior) return prior;
    const resultValue = { envelopeId: input.envelopeId, keyVersion: 1, readiness: 'key_ready' as const,
        targetDeviceId: input.actorDeviceId, workspaceId: input.workspaceId };
    const json = resultJson(resultValue);
    const statements = [
        database.prepare(`INSERT INTO workspaces (id, display_name, description_envelope, state,
          current_key_version, created_by, created_at, updated_at, deleted_at)
         SELECT ?, ?, ?, 'active', 1, ?, ?, ?, NULL WHERE EXISTS (
           SELECT 1 FROM users u JOIN sessions s ON s.user_id = u.id JOIN devices d ON d.user_id = u.id
           WHERE u.id = ? AND u.status = 'active' AND s.id = ? AND s.revoked_at IS NULL
             AND ? < s.idle_expires_at AND ? < s.absolute_expires_at AND d.id = ? AND d.state = 'active')`)
            .bind(input.workspaceId, input.displayName, input.descriptionEnvelope, input.actorUserId,
                input.serverTime, input.serverTime, input.actorUserId, input.actorSessionId,
                input.serverTime, input.serverTime, input.actorDeviceId),
        database.prepare(`INSERT INTO memberships (workspace_id, user_id, role, state, invited_by,
          accepted_by, removed_by, created_at, activated_at, removed_at, role_version)
         VALUES (?, ?, 'owner', 'active', NULL, ?, NULL, ?, ?, NULL, 1)`)
            .bind(input.workspaceId, input.actorUserId, input.actorUserId, input.serverTime, input.serverTime),
        database.prepare(`INSERT INTO workspace_key_versions (workspace_id, key_version, suite, state,
          rotation_reason, created_by_device_id, created_by_user_id, created_at, committed_at, retired_at)
         VALUES (?, 1, 'P256-HKDF-SHA256-A256GCM-v1', 'current', 'initial_provision', ?, ?, ?, ?, NULL)`)
            .bind(input.workspaceId, input.actorDeviceId, input.actorUserId, input.serverTime, input.serverTime),
        database.prepare(`INSERT INTO workspace_key_envelopes (id, workspace_id, key_version,
          target_user_id, target_device_id, target_fingerprint, wrapper_user_id, wrapper_device_id,
          suite, ephemeral_public_jwk, hkdf_salt, nonce, ciphertext, aad_digest, created_at, revoked_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, ?, NULL)`)
            .bind(input.envelopeId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                deviceFingerprint, input.actorUserId, input.actorDeviceId, envelope.ephemeralPublicJwk,
                envelope.hkdfSalt, envelope.nonce, envelope.ciphertext, envelope.aadDigest, input.serverTime),
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         VALUES (?, ?, ?, ?, 'workspace.create', ?, ?, 'workspace', ?, 201, ?, ?, ?)`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, boundRequestFingerprint, input.workspaceId, json,
                input.serverTime, input.replayExpiresAt),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 8, ?, 'workspace.created', 'success', 'committed', ?, ?, 'workspace', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.workspaceId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1')
            .bind(input.mutationResultId)
    ];
    try { return await executeBatch(database, statements, 6); }
    catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT' || translated.code === 'PERSISTENCE_CONSTRAINT') {
            const concurrent = await replay(database, replayInput, input.workspaceId, 'workspace.create');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function readProvisioningTarget(database: D1Database, input: LiveContext & {
    workspaceId: string; targetUserId: string; targetDeviceId: string;
}): Promise<ProvisioningTarget> {
    validateLive(input); requireUuidV4(input.workspaceId); requireUuidV4(input.targetUserId); requireUuidV4(input.targetDeviceId);
    const row = await database.prepare(
        `SELECT td.public_jwk, td.fingerprint, w.current_key_version
         FROM workspaces w JOIN memberships wrapper ON wrapper.workspace_id = w.id
         JOIN users wu ON wu.id = wrapper.user_id AND wu.status = 'active'
         JOIN devices wd ON wd.id = ? AND wd.user_id = wrapper.user_id
         JOIN sessions s ON s.id = ? AND s.user_id = wrapper.user_id
         JOIN memberships target ON target.workspace_id = w.id
         JOIN users tu ON tu.id = target.user_id AND tu.status = 'active'
         JOIN devices td ON td.id = ? AND td.user_id = target.user_id
         WHERE w.id = ? AND w.state = 'active' AND wrapper.user_id = ? AND wrapper.state = 'active'
           AND wrapper.role IN ('owner','admin') AND wd.state = 'active' AND s.revoked_at IS NULL
           AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
           AND target.user_id = ? AND target.state IN ('pending_key','active') AND td.state = 'active'
           AND EXISTS (SELECT 1 FROM workspace_key_envelopes e WHERE e.workspace_id = w.id
             AND e.key_version = w.current_key_version AND e.target_user_id = wrapper.user_id
             AND e.target_device_id = wd.id AND e.revoked_at IS NULL) LIMIT 1`
    ).bind(input.actorDeviceId, input.actorSessionId, input.targetDeviceId, input.workspaceId,
        input.actorUserId, input.serverTime, input.serverTime, input.targetUserId)
        .first<Record<string, unknown>>();
    if (row === null || typeof row.public_jwk !== 'string'
        || typeof row.current_key_version !== 'number') throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    return Object.freeze({ userId: input.targetUserId, deviceId: input.targetDeviceId,
        fingerprint: encodeBase64Url(new Uint8Array(blob32(row.fingerprint))),
        publicJwk: (await parsePublicJwk(JSON.parse(row.public_jwk))).jwk,
        keyVersion: row.current_key_version });
}

export async function provisionWorkspaceEnvelope(database: D1Database,
    input: ProvisionWorkspaceEnvelopeInput): Promise<WorkspaceKeyMutationResult> {
    validateMutation(input); for (const id of [input.workspaceId, input.envelopeId,
        input.targetUserId, input.targetDeviceId]) requireUuidV4(id);
    requireSafeInteger(input.keyVersion, 1, 2_147_483_647); decodeBase64Url(input.targetFingerprint, 32, 32);
    const requestFingerprint = input.requestFingerprint.slice(0);
    const boundRequestFingerprint = requestFingerprint.slice(0);
    const replayInput = { ...input, requestFingerprint };
    const envelope = await validateEnvelope(input.envelope, { workspaceId: input.workspaceId,
        targetUserId: input.targetUserId, targetDeviceId: input.targetDeviceId,
        targetFingerprint: input.targetFingerprint, wrapperDeviceId: input.actorDeviceId,
        keyVersion: input.keyVersion });
    const prior = await replay(database, replayInput, input.workspaceId, 'envelope.provision'); if (prior) return prior;
    const fingerprint = decodeBase64Url(input.targetFingerprint, 32, 32).buffer;
    const resultValue = { envelopeId: input.envelopeId, keyVersion: input.keyVersion,
        readiness: 'key_ready' as const, targetDeviceId: input.targetDeviceId, workspaceId: input.workspaceId };
    const json = resultJson(resultValue);
    const authority = `FROM workspaces w JOIN memberships wrapper ON wrapper.workspace_id = w.id
      JOIN users wu ON wu.id = wrapper.user_id AND wu.status = 'active'
      JOIN devices wd ON wd.id = ? AND wd.user_id = wrapper.user_id
      JOIN sessions s ON s.id = ? AND s.user_id = wrapper.user_id
      JOIN memberships target ON target.workspace_id = w.id
      JOIN users tu ON tu.id = target.user_id AND tu.status = 'active'
      JOIN devices td ON td.id = ? AND td.user_id = target.user_id
      WHERE w.id = ? AND w.state = 'active' AND w.current_key_version = ?
        AND wrapper.user_id = ? AND wrapper.state = 'active' AND wrapper.role IN ('owner','admin')
        AND wd.state = 'active' AND s.revoked_at IS NULL AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
        AND target.user_id = ? AND target.state IN ('pending_key','active')
        AND td.state = 'active' AND td.fingerprint = ?
        AND EXISTS (SELECT 1 FROM workspace_key_envelopes current WHERE current.workspace_id = w.id
          AND current.key_version = w.current_key_version AND current.target_user_id = wrapper.user_id
          AND current.target_device_id = wd.id AND current.revoked_at IS NULL)`;
    const authorityBindings = [input.actorDeviceId, input.actorSessionId, input.targetDeviceId,
        input.workspaceId, input.keyVersion, input.actorUserId, input.serverTime, input.serverTime,
        input.targetUserId, fingerprint] as const;
    const statements = [
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at)
         SELECT ?, ?, ?, ?, 'envelope.provision', ?, ?, 'key_envelope', ?, 201, ?, ?, ? ${authority}`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, boundRequestFingerprint, input.envelopeId, json,
                input.serverTime, input.replayExpiresAt, ...authorityBindings),
        database.prepare(`INSERT INTO workspace_key_envelopes (id, workspace_id, key_version,
          target_user_id, target_device_id, target_fingerprint, wrapper_user_id, wrapper_device_id,
          suite, ephemeral_public_jwk, hkdf_salt, nonce, ciphertext, aad_digest, created_at, revoked_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, ?, NULL ${authority}`)
            .bind(input.envelopeId, input.workspaceId, input.keyVersion, input.targetUserId,
                input.targetDeviceId, fingerprint, input.actorUserId, input.actorDeviceId,
                envelope.ephemeralPublicJwk, envelope.hkdfSalt, envelope.nonce, envelope.ciphertext,
                envelope.aadDigest, input.serverTime, ...authorityBindings),
        database.prepare(`UPDATE memberships SET state = 'active', activated_at = COALESCE(activated_at, ?),
          role_version = role_version + CASE WHEN state = 'pending_key' THEN 1 ELSE 0 END
         WHERE workspace_id = ? AND user_id = ? AND state IN ('pending_key','active')
           AND EXISTS (SELECT 1 FROM workspace_key_envelopes e WHERE e.workspace_id = ?
             AND e.key_version = ? AND e.target_device_id = ? AND e.revoked_at IS NULL)`)
            .bind(input.serverTime, input.workspaceId, input.targetUserId, input.workspaceId,
                input.keyVersion, input.targetDeviceId),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 8, ?, 'envelope.provisioned', 'success', 'committed', ?, ?, 'key_envelope', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.envelopeId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ? LIMIT 1')
            .bind(input.mutationResultId)
    ];
    try { return await executeBatch(database, statements, 4); }
    catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT' || translated.code === 'PERSISTENCE_CONSTRAINT') {
            const concurrent = await replay(database, replayInput, input.workspaceId, 'envelope.provision');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function readWorkspaceKeyReadiness(database: D1Database, input: {
    actorUserId: string; workspaceId: string; deviceId: string;
}): Promise<WorkspaceKeyReadiness> {
    requireUuidV4(input.actorUserId); requireUuidV4(input.workspaceId); requireUuidV4(input.deviceId);
    const row = await database.prepare(
        `SELECT m.state AS membership_state, d.state AS device_state,
          CASE WHEN EXISTS (SELECT 1 FROM workspace_key_envelopes e
            WHERE e.workspace_id = w.id AND e.key_version = w.current_key_version
              AND e.target_user_id = m.user_id AND e.target_device_id = d.id
              AND e.target_fingerprint = d.fingerprint AND e.revoked_at IS NULL) THEN 1 ELSE 0 END AS ready
         FROM memberships m JOIN users u ON u.id = m.user_id AND u.status = 'active'
         JOIN workspaces w ON w.id = m.workspace_id AND w.state IN ('active','rotating')
         LEFT JOIN devices d ON d.id = ? AND d.user_id = m.user_id
         WHERE m.workspace_id = ? AND m.user_id = ? LIMIT 1`
    ).bind(input.deviceId, input.workspaceId, input.actorUserId).first<Record<string, unknown>>();
    if (row === null || row.membership_state === 'removed') return 'not_entitled';
    if (row.device_state === 'revoked') return 'revoked';
    if (row.device_state !== 'active' || row.membership_state === 'pending_key') return 'pending_key';
    return row.ready === 1 ? 'key_ready' : 'stale_key';
}
