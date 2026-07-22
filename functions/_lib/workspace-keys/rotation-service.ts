import { canonicalize, decodeBase64Url, encodeBase64Url, exactObject, requireSafeInteger,
    requireUuidV4, sha256, type JsonValue, utf8 } from '../e2ee/canonical';
import { E2EE, type WorkspaceKeyEnvelope } from '../e2ee/primitives';
import { parsePublicJwk } from '../e2ee/jwk';
import { PersistenceError, requireCheckedChanges, translatePersistenceError } from '../persistence/repository';

const REPLAY_MAX_MS = 2_592_000_000;
const ROTATION_MAX_MS = 86_400_000;
const RECENT_AUTH_MS = 900_000;
const REASON = /^[a-z0-9_-]{1,64}$/;

interface LiveContext {
    readonly actorUserId: string; readonly actorSessionId: string; readonly actorDeviceId: string;
    readonly serverTime: number;
}
interface MutationContext extends LiveContext {
    readonly mutationResultId: string; readonly clientMutationId: string;
    readonly requestFingerprint: ArrayBuffer; readonly auditEventId: string;
    readonly requestId: string; readonly replayExpiresAt: number;
}
export interface StartWorkspaceKeyRotationInput extends MutationContext {
    readonly workspaceId: string; readonly rotationId: string; readonly reason: string;
    readonly expiresAt: number;
}
export interface StageWorkspaceRotationEnvelopeInput extends MutationContext {
    readonly workspaceId: string; readonly rotationId: string; readonly envelopeId: string;
    readonly targetUserId: string; readonly targetDeviceId: string;
    readonly targetFingerprint: string; readonly keyVersion: number;
    readonly envelope: WorkspaceKeyEnvelope;
}
export interface FinishWorkspaceKeyRotationInput extends MutationContext {
    readonly workspaceId: string; readonly rotationId: string;
}
export interface RotationMutationResult {
    readonly workspaceId: string; readonly rotationId: string; readonly fromKeyVersion: number;
    readonly toKeyVersion: number; readonly state: 'preparing' | 'committed' | 'aborted';
    readonly eligibleCount: number; readonly stagedCount: number; readonly httpStatus: 200 | 201;
}
export interface RotationTarget {
    readonly userId: string; readonly deviceId: string; readonly fingerprint: string;
    readonly publicJwk: Readonly<Record<string, unknown>>; readonly state: 'pending' | 'staged' | 'excluded';
}
export interface WorkspaceKeyRotationStatus extends Omit<RotationMutationResult, 'httpStatus'> {
    readonly reason: string; readonly expiresAt: number; readonly targets: readonly RotationTarget[];
}
export interface WorkspaceRecoveryState {
    readonly workspaceId: string; readonly keyVersion: number;
    readonly state: 'provisioner_available' | 'terminal_cryptographic_loss';
    readonly provisionerCount: number; readonly serverRecovery: false;
    readonly recoveryArtifact: false; readonly d1RestoreRecoversKeys: false;
}

interface SnapshotTarget {
    readonly userId: string; readonly deviceId: string; readonly fingerprint: ArrayBuffer;
    readonly fingerprintText: string; readonly publicJwk: string;
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
function blob32(value: unknown): ArrayBuffer {
    if (value instanceof ArrayBuffer && value.byteLength === 32) return value.slice(0);
    if (ArrayBuffer.isView(value) && value.byteLength === 32)
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
    if (Array.isArray(value) && value.length === 32 && value.every(item => Number.isInteger(item) && item >= 0 && item <= 255))
        return Uint8Array.from(value).buffer;
    return fail();
}
function equal32(first: ArrayBuffer, second: ArrayBuffer): boolean {
    const a = new Uint8Array(first); const b = new Uint8Array(second); let difference = 0;
    if (a.length !== 32 || b.length !== 32) return false;
    for (let index = 0; index < 32; index += 1) difference |= a[index] ^ b[index];
    return difference === 0;
}
function parseMutationResult(row: Record<string, unknown>): RotationMutationResult {
    if ((row.http_status !== 200 && row.http_status !== 201) || typeof row.result_json !== 'string') fail();
    let value: unknown; try { value = JSON.parse(row.result_json); } catch { return fail(); }
    const item = exactObject(value, ['eligibleCount', 'fromKeyVersion', 'rotationId', 'stagedCount',
        'state', 'toKeyVersion', 'workspaceId']);
    requireUuidV4(item.workspaceId); requireUuidV4(item.rotationId);
    requireSafeInteger(item.fromKeyVersion, 1, 2_147_483_646);
    requireSafeInteger(item.toKeyVersion, 2, 2_147_483_647);
    requireSafeInteger(item.eligibleCount, 1, 100); requireSafeInteger(item.stagedCount, 0, 100);
    if (item.toKeyVersion !== (item.fromKeyVersion as number) + 1
        || !['preparing', 'committed', 'aborted'].includes(String(item.state))) fail();
    return Object.freeze({ workspaceId: item.workspaceId as string, rotationId: item.rotationId as string,
        fromKeyVersion: item.fromKeyVersion as number, toKeyVersion: item.toKeyVersion as number,
        state: item.state as RotationMutationResult['state'], eligibleCount: item.eligibleCount as number,
        stagedCount: item.stagedCount as number, httpStatus: row.http_status });
}
async function replay(database: D1Database, input: MutationContext, workspaceId: string,
    operation: 'rotation.start' | 'rotation.envelope.stage' | 'rotation.commit' | 'rotation.abort'):
    Promise<RotationMutationResult | null> {
    const row = await database.prepare(
        `SELECT m.request_fingerprint, m.http_status, m.result_json, m.expires_at
         FROM mutation_results m JOIN users u ON u.id = m.actor_user_id
         JOIN sessions s ON s.id = ? AND s.user_id = m.actor_user_id
         JOIN devices d ON d.id = m.actor_device_id AND d.user_id = m.actor_user_id
         JOIN memberships member ON member.workspace_id = m.workspace_id AND member.user_id = m.actor_user_id
         WHERE m.actor_user_id = ? AND m.actor_device_id = ? AND m.workspace_id = ?
           AND m.operation = ? AND m.client_mutation_id = ? AND u.status = 'active'
           AND member.state = 'active' AND s.revoked_at IS NULL AND ? < s.idle_expires_at
           AND ? < s.absolute_expires_at AND d.state = 'active' LIMIT 1`
    ).bind(input.actorSessionId, input.actorUserId, input.actorDeviceId, workspaceId, operation,
        input.clientMutationId, input.serverTime, input.serverTime).first<Record<string, unknown>>();
    if (row === null) return null;
    if (!equal32(blob32(row.request_fingerprint), input.requestFingerprint)) fail('IDEMPOTENCY_KEY_REUSED');
    if (typeof row.expires_at !== 'number' || input.serverTime >= row.expires_at) fail('IDEMPOTENCY_EXPIRED');
    return parseMutationResult(row);
}
async function requireRotationActor(database: D1Database, input: LiveContext & {
    workspaceId: string; rotationId?: string; recentAuth: boolean;
}): Promise<{ currentKeyVersion: number }> {
    const rotationJoin = input.rotationId === undefined ? '' : 'JOIN workspace_key_rotations r ON r.workspace_id = w.id';
    const rotationWhere = input.rotationId === undefined ? '' : 'AND r.id = ? AND r.initiator_user_id = m.user_id AND r.initiator_device_id = d.id';
    const bindings: unknown[] = [input.actorDeviceId, input.actorSessionId, input.workspaceId,
        input.actorUserId, input.serverTime, input.serverTime];
    if (input.recentAuth) bindings.push(input.serverTime, input.serverTime);
    if (input.rotationId !== undefined) bindings.push(input.rotationId);
    const row = await database.prepare(
        `SELECT w.current_key_version FROM workspaces w
         JOIN memberships m ON m.workspace_id = w.id JOIN users u ON u.id = m.user_id
         JOIN devices d ON d.id = ? AND d.user_id = m.user_id
         JOIN sessions s ON s.id = ? AND s.user_id = m.user_id ${rotationJoin}
         WHERE w.id = ? AND w.state IN ('active','rotating') AND m.user_id = ?
           AND m.role = 'owner' AND m.state = 'active' AND u.status = 'active'
           AND d.state = 'active' AND s.revoked_at IS NULL AND ? < s.idle_expires_at
           AND ? < s.absolute_expires_at
           ${input.recentAuth ? 'AND ? >= s.authenticated_at AND ? - s.authenticated_at <= ' + RECENT_AUTH_MS : ''}
           ${rotationWhere}
           AND EXISTS (SELECT 1 FROM workspace_key_envelopes e WHERE e.workspace_id = w.id
             AND e.key_version = w.current_key_version AND e.target_user_id = m.user_id
             AND e.target_device_id = d.id AND e.target_fingerprint = d.fingerprint AND e.revoked_at IS NULL)
         LIMIT 1`
    ).bind(...bindings).first<{ current_key_version: number }>();
    if (row === null) throw new PersistenceError('AUTHORITY_REVOKED');
    return { currentKeyVersion: row.current_key_version };
}
async function snapshot(database: D1Database, workspaceId: string): Promise<readonly SnapshotTarget[]> {
    const rows = (await database.prepare(
        `SELECT m.user_id, d.id AS device_id, d.fingerprint, d.public_jwk
         FROM memberships m JOIN users u ON u.id = m.user_id AND u.status = 'active'
         JOIN devices d ON d.user_id = m.user_id AND d.state = 'active'
         WHERE m.workspace_id = ? AND m.state = 'active' ORDER BY d.id`
    ).bind(workspaceId).all<Record<string, unknown>>()).results;
    if (rows.length < 1 || rows.length > 100) fail();
    return Object.freeze(rows.map(row => {
        if (typeof row.user_id !== 'string' || typeof row.device_id !== 'string' || typeof row.public_jwk !== 'string') return fail();
        requireUuidV4(row.user_id); requireUuidV4(row.device_id); const fingerprint = blob32(row.fingerprint);
        return Object.freeze({ userId: row.user_id, deviceId: row.device_id, fingerprint,
            fingerprintText: encodeBase64Url(new Uint8Array(fingerprint)), publicJwk: row.public_jwk });
    }));
}
async function snapshotDigest(targets: readonly SnapshotTarget[]): Promise<ArrayBuffer> {
    const value = targets.map(target => ({ deviceId: target.deviceId,
        fingerprint: target.fingerprintText, userId: target.userId }));
    return (await sha256(utf8(canonicalize(value as unknown as JsonValue)))).slice().buffer as ArrayBuffer;
}
async function validateEnvelope(envelope: unknown, expected: { workspaceId: string; targetUserId: string;
    targetDeviceId: string; targetFingerprint: string; wrapperDeviceId: string; keyVersion: number;
}): Promise<ValidatedEnvelope> {
    const value = exactObject(envelope, ['aad', 'ciphertext', 'ephemeralPublicJwk', 'hkdfSalt', 'nonce']);
    const aad = exactObject(value.aad, ['version', 'suite', 'workspaceId', 'targetUserId',
        'targetDeviceId', 'targetFingerprint', 'wrapperDeviceId', 'keyVersion']);
    if (aad.version !== 1 || aad.suite !== E2EE.workspaceSuite || aad.workspaceId !== expected.workspaceId
        || aad.targetUserId !== expected.targetUserId || aad.targetDeviceId !== expected.targetDeviceId
        || aad.targetFingerprint !== expected.targetFingerprint || aad.wrapperDeviceId !== expected.wrapperDeviceId
        || aad.keyVersion !== expected.keyVersion) fail();
    decodeBase64Url(expected.targetFingerprint, 32, 32); const parsed = await parsePublicJwk(value.ephemeralPublicJwk);
    return Object.freeze({ ephemeralPublicJwk: canonicalize(parsed.jwk as unknown as JsonValue),
        hkdfSalt: decodeBase64Url(String(value.hkdfSalt), 32, 32).slice().buffer as ArrayBuffer,
        nonce: decodeBase64Url(String(value.nonce), 12, 12).slice().buffer as ArrayBuffer,
        ciphertext: decodeBase64Url(String(value.ciphertext), 48, 48).slice().buffer as ArrayBuffer,
        aadDigest: (await sha256(utf8(canonicalize(aad as unknown as JsonValue)))).slice().buffer as ArrayBuffer });
}
async function batchResult(database: D1Database, statements: readonly D1PreparedStatement[],
    expectedChanges: readonly number[]): Promise<RotationMutationResult> {
    try {
        const results = await database.batch<Record<string, unknown>>([...statements]);
        if (results.length !== expectedChanges.length + 1) fail();
        expectedChanges.forEach((changes, index) => requireCheckedChanges(results[index], changes));
        const rows = results.at(-1)?.results;
        if (!Array.isArray(rows) || rows.length !== 1 || typeof rows[0] !== 'object' || rows[0] === null) fail();
        return parseMutationResult(rows[0] as Record<string, unknown>);
    } catch (error) { throw translatePersistenceError(error); }
}
function resultJson(value: Omit<RotationMutationResult, 'httpStatus'>): string {
    return canonicalize(value as unknown as JsonValue);
}

export async function startWorkspaceKeyRotation(database: D1Database,
    input: StartWorkspaceKeyRotationInput): Promise<RotationMutationResult> {
    validateMutation(input); requireUuidV4(input.workspaceId); requireUuidV4(input.rotationId);
    if (!REASON.test(input.reason) || !Number.isSafeInteger(input.expiresAt)
        || input.expiresAt <= input.serverTime || input.expiresAt > input.serverTime + ROTATION_MAX_MS) fail();
    const prior = await replay(database, input, input.workspaceId, 'rotation.start'); if (prior) return prior;
    const actor = await requireRotationActor(database, { actorUserId: input.actorUserId, actorSessionId: input.actorSessionId,
        actorDeviceId: input.actorDeviceId, serverTime: input.serverTime, workspaceId: input.workspaceId, recentAuth: true });
    if (actor.currentKeyVersion >= 2_147_483_647) fail();
    const targets = await snapshot(database, input.workspaceId); const toKeyVersion = actor.currentKeyVersion + 1;
    const value = { workspaceId: input.workspaceId, rotationId: input.rotationId,
        fromKeyVersion: actor.currentKeyVersion, toKeyVersion, state: 'preparing' as const,
        eligibleCount: targets.length, stagedCount: 0 };
    const targetSql = targets.map(() => '(?, ?, ?, ?, ?, \'pending\')').join(',');
    const targetBindings = targets.flatMap(target => [input.rotationId, input.workspaceId,
        target.userId, target.deviceId, target.fingerprint]);
    const priorVersion = await database.prepare(`SELECT state FROM workspace_key_versions
      WHERE workspace_id = ? AND key_version = ? LIMIT 1`).bind(input.workspaceId, toKeyVersion)
        .first<{ state: string }>();
    const versionStatements: D1PreparedStatement[] = []; const versionExpected: number[] = [];
    if (priorVersion === null) {
        versionStatements.push(database.prepare(`INSERT INTO workspace_key_versions (workspace_id,
          key_version, suite, state, rotation_reason, created_by_device_id, created_by_user_id,
          created_at, committed_at, retired_at) VALUES (?, ?, 'P256-HKDF-SHA256-A256GCM-v1',
          'preparing', ?, ?, ?, ?, NULL, NULL)`).bind(input.workspaceId, toKeyVersion, input.reason,
            input.actorDeviceId, input.actorUserId, input.serverTime));
        versionExpected.push(1);
    } else if (priorVersion.state === 'aborted') {
        const obsolete = await database.prepare(`SELECT COUNT(*) AS count FROM workspace_key_envelopes
          WHERE workspace_id = ? AND key_version = ? AND revoked_at IS NOT NULL`)
            .bind(input.workspaceId, toKeyVersion).first<number>('count') ?? 0;
        versionStatements.push(database.prepare(`DELETE FROM workspace_key_envelopes WHERE workspace_id = ?
          AND key_version = ? AND revoked_at IS NOT NULL`).bind(input.workspaceId, toKeyVersion));
        versionExpected.push(obsolete);
        versionStatements.push(database.prepare(`UPDATE workspace_key_versions SET state = 'preparing',
          rotation_reason = ?, created_by_device_id = ?, created_by_user_id = ?, created_at = ?,
          committed_at = NULL, retired_at = NULL WHERE workspace_id = ? AND key_version = ? AND state = 'aborted'`)
            .bind(input.reason, input.actorDeviceId, input.actorUserId, input.serverTime,
                input.workspaceId, toKeyVersion));
        versionExpected.push(1);
    } else {
        throw new PersistenceError('PERSISTENCE_CONFLICT');
    }
    const statements = [
        ...versionStatements,
        database.prepare(`INSERT INTO workspace_key_rotations (id, workspace_id, from_key_version,
          to_key_version, initiator_user_id, initiator_device_id, reason, state, eligibility_digest,
          eligible_count, staged_count, created_at, expires_at, committed_at, aborted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'preparing', ?, ?, 0, ?, ?, NULL, NULL)`)
            .bind(input.rotationId, input.workspaceId, actor.currentKeyVersion, toKeyVersion,
                input.actorUserId, input.actorDeviceId, input.reason, await snapshotDigest(targets),
                targets.length, input.serverTime, input.expiresAt),
        database.prepare(`INSERT INTO workspace_key_rotation_targets (rotation_id, workspace_id,
          target_user_id, target_device_id, target_fingerprint, state) VALUES ${targetSql}`)
            .bind(...targetBindings),
        database.prepare(`UPDATE workspaces SET state = 'rotating', updated_at = ?
          WHERE id = ? AND state = 'active' AND current_key_version = ?`)
            .bind(input.serverTime, input.workspaceId, actor.currentKeyVersion),
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at) VALUES (?, ?, ?, ?, 'rotation.start', ?, ?,
          'key_version', ?, 201, ?, ?, ?)`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, input.requestFingerprint.slice(0), input.rotationId,
                resultJson(value), input.serverTime, input.replayExpiresAt),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 12, ?, 'key.rotation_started', 'success', 'rotation_started', ?, ?,
          'key_version', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.rotationId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ?').bind(input.mutationResultId)
    ];
    try { return await batchResult(database, statements, [...versionExpected, 1, targets.length, 1, 1, 1]); }
    catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT' || translated.code === 'PERSISTENCE_CONSTRAINT') {
            const concurrent = await replay(database, input, input.workspaceId, 'rotation.start');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function readWorkspaceKeyRotation(database: D1Database, input: LiveContext & {
    workspaceId: string; rotationId: string;
}): Promise<WorkspaceKeyRotationStatus> {
    validateLive(input); requireUuidV4(input.workspaceId); requireUuidV4(input.rotationId);
    const row = await database.prepare(
        `SELECT r.from_key_version, r.to_key_version, r.state, r.reason, r.eligible_count,
          r.staged_count, r.expires_at FROM workspace_key_rotations r
         JOIN memberships m ON m.workspace_id = r.workspace_id JOIN users u ON u.id = m.user_id
         JOIN sessions s ON s.id = ? AND s.user_id = m.user_id
         JOIN devices d ON d.id = ? AND d.user_id = m.user_id
         WHERE r.id = ? AND r.workspace_id = ? AND m.user_id = ? AND m.state = 'active'
           AND m.role IN ('owner','admin') AND u.status = 'active' AND d.state = 'active'
           AND s.revoked_at IS NULL AND ? < s.idle_expires_at AND ? < s.absolute_expires_at LIMIT 1`
    ).bind(input.actorSessionId, input.actorDeviceId, input.rotationId, input.workspaceId,
        input.actorUserId, input.serverTime, input.serverTime).first<Record<string, unknown>>();
    if (row === null || typeof row.reason !== 'string' || typeof row.state !== 'string')
        throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const targets = (await database.prepare(
        `SELECT t.target_user_id, t.target_device_id, t.target_fingerprint, t.state, d.public_jwk
         FROM workspace_key_rotation_targets t JOIN devices d ON d.id = t.target_device_id
         WHERE t.rotation_id = ? ORDER BY t.target_device_id`
    ).bind(input.rotationId).all<Record<string, unknown>>()).results.map(target => Object.freeze({
        userId: String(target.target_user_id), deviceId: String(target.target_device_id),
        fingerprint: encodeBase64Url(new Uint8Array(blob32(target.target_fingerprint))),
        publicJwk: Object.freeze(JSON.parse(String(target.public_jwk)) as Record<string, unknown>),
        state: target.state as RotationTarget['state']
    }));
    return Object.freeze({ workspaceId: input.workspaceId, rotationId: input.rotationId,
        fromKeyVersion: Number(row.from_key_version), toKeyVersion: Number(row.to_key_version),
        state: row.state as WorkspaceKeyRotationStatus['state'], reason: row.reason,
        eligibleCount: Number(row.eligible_count), stagedCount: Number(row.staged_count),
        expiresAt: Number(row.expires_at), targets: Object.freeze(targets) });
}

export async function stageWorkspaceRotationEnvelope(database: D1Database,
    input: StageWorkspaceRotationEnvelopeInput): Promise<RotationMutationResult> {
    validateMutation(input); for (const id of [input.workspaceId, input.rotationId, input.envelopeId,
        input.targetUserId, input.targetDeviceId]) requireUuidV4(id);
    requireSafeInteger(input.keyVersion, 2, 2_147_483_647); decodeBase64Url(input.targetFingerprint, 32, 32);
    const prior = await replay(database, input, input.workspaceId, 'rotation.envelope.stage'); if (prior) return prior;
    await requireRotationActor(database, { ...input, recentAuth: false });
    const rotation = await database.prepare(
        `SELECT r.from_key_version, r.to_key_version, r.eligible_count, r.staged_count,
          t.target_fingerprint FROM workspace_key_rotations r
         JOIN workspace_key_rotation_targets t ON t.rotation_id = r.id
         WHERE r.id = ? AND r.workspace_id = ? AND r.state = 'preparing' AND ? < r.expires_at
           AND t.target_user_id = ? AND t.target_device_id = ? AND t.state = 'pending' LIMIT 1`
    ).bind(input.rotationId, input.workspaceId, input.serverTime, input.targetUserId,
        input.targetDeviceId).first<Record<string, unknown>>();
    if (rotation === null || rotation.to_key_version !== input.keyVersion
        || encodeBase64Url(new Uint8Array(blob32(rotation.target_fingerprint))) !== input.targetFingerprint)
        throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const envelope = await validateEnvelope(input.envelope, { workspaceId: input.workspaceId,
        targetUserId: input.targetUserId, targetDeviceId: input.targetDeviceId,
        targetFingerprint: input.targetFingerprint, wrapperDeviceId: input.actorDeviceId,
        keyVersion: input.keyVersion });
    const value = { workspaceId: input.workspaceId, rotationId: input.rotationId,
        fromKeyVersion: Number(rotation.from_key_version), toKeyVersion: input.keyVersion,
        state: 'preparing' as const, eligibleCount: Number(rotation.eligible_count),
        stagedCount: Number(rotation.staged_count) + 1 };
    const statements = [
        database.prepare(`INSERT INTO workspace_key_envelopes (id, workspace_id, key_version,
          target_user_id, target_device_id, target_fingerprint, wrapper_user_id, wrapper_device_id,
          suite, ephemeral_public_jwk, hkdf_salt, nonce, ciphertext, aad_digest, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'P256-HKDF-SHA256-A256GCM-v1', ?, ?, ?, ?, ?, ?, NULL)`)
            .bind(input.envelopeId, input.workspaceId, input.keyVersion, input.targetUserId,
                input.targetDeviceId, decodeBase64Url(input.targetFingerprint, 32, 32).buffer,
                input.actorUserId, input.actorDeviceId, envelope.ephemeralPublicJwk,
                envelope.hkdfSalt, envelope.nonce, envelope.ciphertext, envelope.aadDigest, input.serverTime),
        database.prepare(`UPDATE workspace_key_rotation_targets SET state = 'staged'
          WHERE rotation_id = ? AND target_device_id = ? AND state = 'pending'`)
            .bind(input.rotationId, input.targetDeviceId),
        database.prepare(`UPDATE workspace_key_rotations SET staged_count = staged_count + 1
          WHERE id = ? AND state = 'preparing' AND staged_count < eligible_count`)
            .bind(input.rotationId),
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at) VALUES (?, ?, ?, ?, 'rotation.envelope.stage', ?, ?,
          'key_envelope', ?, 201, ?, ?, ?)`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, input.requestFingerprint.slice(0), input.envelopeId,
                resultJson(value), input.serverTime, input.replayExpiresAt),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 12, ?, 'key.rotation_envelope_staged', 'success', 'envelope_staged', ?, ?,
          'key_envelope', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.envelopeId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ?').bind(input.mutationResultId)
    ];
    try { return await batchResult(database, statements, [1, 1, 1, 1, 1]); }
    catch (error) {
        const translated = translatePersistenceError(error);
        if (translated.code === 'PERSISTENCE_CONFLICT' || translated.code === 'PERSISTENCE_CONSTRAINT') {
            const concurrent = await replay(database, input, input.workspaceId, 'rotation.envelope.stage');
            if (concurrent) return concurrent;
        }
        throw translated;
    }
}

export async function commitWorkspaceKeyRotation(database: D1Database,
    input: FinishWorkspaceKeyRotationInput): Promise<RotationMutationResult> {
    validateMutation(input); requireUuidV4(input.workspaceId); requireUuidV4(input.rotationId);
    const prior = await replay(database, input, input.workspaceId, 'rotation.commit'); if (prior) return prior;
    await requireRotationActor(database, { ...input, recentAuth: true });
    const rotation = await database.prepare(`SELECT from_key_version, to_key_version, eligible_count,
      staged_count FROM workspace_key_rotations WHERE id = ? AND workspace_id = ? AND state = 'preparing'
      AND ? < expires_at LIMIT 1`).bind(input.rotationId, input.workspaceId, input.serverTime)
        .first<Record<string, unknown>>();
    if (rotation === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const value = { workspaceId: input.workspaceId, rotationId: input.rotationId,
        fromKeyVersion: Number(rotation.from_key_version), toKeyVersion: Number(rotation.to_key_version),
        state: 'committed' as const, eligibleCount: Number(rotation.eligible_count),
        stagedCount: Number(rotation.staged_count) };
    const statements = [
        database.prepare(`UPDATE workspace_key_versions SET state = 'retired', retired_at = ?
          WHERE workspace_id = ? AND key_version = ? AND state = 'current'`)
            .bind(input.serverTime, input.workspaceId, value.fromKeyVersion),
        database.prepare(`UPDATE workspace_key_versions SET state = 'current', committed_at = ?
          WHERE workspace_id = ? AND key_version = ? AND state = 'preparing'`)
            .bind(input.serverTime, input.workspaceId, value.toKeyVersion),
        database.prepare(`UPDATE workspaces SET current_key_version = ?, state = 'active', updated_at = ?
          WHERE id = ? AND current_key_version = ? AND state = 'rotating'`)
            .bind(value.toKeyVersion, input.serverTime, input.workspaceId, value.fromKeyVersion),
        database.prepare(`UPDATE workspace_key_rotations SET state = 'committed', committed_at = ?
          WHERE id = ? AND state = 'preparing' AND staged_count = eligible_count`)
            .bind(input.serverTime, input.rotationId),
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at) VALUES (?, ?, ?, ?, 'rotation.commit', ?, ?,
          'key_version', ?, 200, ?, ?, ?)`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, input.requestFingerprint.slice(0), input.rotationId,
                resultJson(value), input.serverTime, input.replayExpiresAt),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 12, ?, 'key.rotation_committed', 'success', 'rotation_committed', ?, ?,
          'key_version', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.rotationId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ?').bind(input.mutationResultId)
    ];
    return batchResult(database, statements, [1, 1, 1, 1, 1, 1]);
}

export async function abortWorkspaceKeyRotation(database: D1Database,
    input: FinishWorkspaceKeyRotationInput): Promise<RotationMutationResult> {
    validateMutation(input); requireUuidV4(input.workspaceId); requireUuidV4(input.rotationId);
    const prior = await replay(database, input, input.workspaceId, 'rotation.abort'); if (prior) return prior;
    await requireRotationActor(database, { ...input, recentAuth: false });
    const rotation = await database.prepare(`SELECT from_key_version, to_key_version, eligible_count,
      staged_count FROM workspace_key_rotations WHERE id = ? AND workspace_id = ? AND state = 'preparing' LIMIT 1`)
        .bind(input.rotationId, input.workspaceId).first<Record<string, unknown>>();
    if (rotation === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const value = { workspaceId: input.workspaceId, rotationId: input.rotationId,
        fromKeyVersion: Number(rotation.from_key_version), toKeyVersion: Number(rotation.to_key_version),
        state: 'aborted' as const, eligibleCount: Number(rotation.eligible_count), stagedCount: Number(rotation.staged_count) };
    const statements = [
        database.prepare(`UPDATE workspace_key_envelopes SET revoked_at = ? WHERE workspace_id = ?
          AND key_version = ? AND revoked_at IS NULL`).bind(input.serverTime, input.workspaceId, value.toKeyVersion),
        database.prepare(`UPDATE workspace_key_rotation_targets SET state = 'excluded'
          WHERE rotation_id = ? AND state IN ('pending','staged')`).bind(input.rotationId),
        database.prepare(`UPDATE workspace_key_versions SET state = 'aborted'
          WHERE workspace_id = ? AND key_version = ? AND state = 'preparing'`)
            .bind(input.workspaceId, value.toKeyVersion),
        database.prepare(`UPDATE workspaces SET state = 'active', updated_at = ?
          WHERE id = ? AND state = 'rotating' AND current_key_version = ?`)
            .bind(input.serverTime, input.workspaceId, value.fromKeyVersion),
        database.prepare(`UPDATE workspace_key_rotations SET state = 'aborted', aborted_at = ?
          WHERE id = ? AND state = 'preparing'`).bind(input.serverTime, input.rotationId),
        database.prepare(`INSERT INTO mutation_results (id, actor_user_id, actor_device_id, workspace_id,
          operation, client_mutation_id, request_fingerprint, target_type, target_id, http_status,
          result_json, created_at, expires_at) VALUES (?, ?, ?, ?, 'rotation.abort', ?, ?,
          'key_version', ?, 200, ?, ?, ?)`)
            .bind(input.mutationResultId, input.actorUserId, input.actorDeviceId, input.workspaceId,
                input.clientMutationId, input.requestFingerprint.slice(0), input.rotationId,
                resultJson(value), input.serverTime, input.replayExpiresAt),
        database.prepare(`INSERT INTO audit_events (event_id, schema_version, workspace_id, event_type,
          outcome, reason_code, actor_user_id, actor_device_id, target_type, target_id, request_id,
          server_time, metadata_json, correction_of_event_id, related_event_id, hold_state)
         VALUES (?, 12, ?, 'key.rotation_aborted', 'success', 'rotation_aborted', ?, ?,
          'key_version', ?, ?, ?, '{}', NULL, NULL, 'none')`)
            .bind(input.auditEventId, input.workspaceId, input.actorUserId, input.actorDeviceId,
                input.rotationId, input.requestId, input.serverTime),
        database.prepare('SELECT http_status, result_json FROM mutation_results WHERE id = ?').bind(input.mutationResultId)
    ];
    const envelopeCount = await database.prepare(`SELECT COUNT(*) AS count FROM workspace_key_envelopes
      WHERE workspace_id = ? AND key_version = ? AND revoked_at IS NULL`).bind(input.workspaceId, value.toKeyVersion)
        .first<number>('count') ?? 0;
    return batchResult(database, statements, [envelopeCount, value.eligibleCount, 1, 1, 1, 1, 1]);
}

export async function readWorkspaceRecoveryState(database: D1Database, input: LiveContext & {
    workspaceId: string;
}): Promise<WorkspaceRecoveryState> {
    validateLive(input); requireUuidV4(input.workspaceId);
    const row = await database.prepare(
        `SELECT w.current_key_version, COUNT(DISTINCT d.id) AS provisioner_count
         FROM workspaces w JOIN memberships caller ON caller.workspace_id = w.id
         JOIN users cu ON cu.id = caller.user_id JOIN sessions s ON s.id = ? AND s.user_id = caller.user_id
         JOIN devices cd ON cd.id = ? AND cd.user_id = caller.user_id
         LEFT JOIN memberships m ON m.workspace_id = w.id AND m.state = 'active' AND m.role IN ('owner','admin')
         LEFT JOIN users u ON u.id = m.user_id AND u.status = 'active'
         LEFT JOIN devices d ON d.user_id = m.user_id AND d.state = 'active'
           AND EXISTS (SELECT 1 FROM workspace_key_envelopes e WHERE e.workspace_id = w.id
             AND e.key_version = w.current_key_version AND e.target_user_id = m.user_id
             AND e.target_device_id = d.id AND e.target_fingerprint = d.fingerprint AND e.revoked_at IS NULL)
         WHERE w.id = ? AND w.state IN ('active','rotating') AND caller.user_id = ?
           AND caller.state IN ('active','pending_key') AND cu.status = 'active' AND cd.state = 'active'
           AND s.revoked_at IS NULL AND ? < s.idle_expires_at AND ? < s.absolute_expires_at
         GROUP BY w.id, w.current_key_version LIMIT 1`
    ).bind(input.actorSessionId, input.actorDeviceId, input.workspaceId, input.actorUserId,
        input.serverTime, input.serverTime).first<Record<string, unknown>>();
    if (row === null) throw new PersistenceError('PERSISTENCE_NOT_FOUND');
    const provisionerCount = Number(row.provisioner_count);
    return Object.freeze({ workspaceId: input.workspaceId, keyVersion: Number(row.current_key_version),
        state: provisionerCount > 0 ? 'provisioner_available' : 'terminal_cryptographic_loss',
        provisionerCount, serverRecovery: false, recoveryArtifact: false, d1RestoreRecoversKeys: false });
}
