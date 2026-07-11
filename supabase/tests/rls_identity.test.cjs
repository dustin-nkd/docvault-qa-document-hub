// Local RLS test for 0001_identity_membership using PGlite (real Postgres in
// WASM, no Docker). Stubs the Supabase auth context (auth schema, auth.uid()
// reading the request.jwt.claims GUC, and the anon/authenticated/service_role
// roles) so the migration's policies can be exercised as different users.
//
// Run: node supabase/tests/rls_identity.test.cjs
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

const MIGRATION = path.resolve(__dirname, '../migrations/20260711151007_identity_membership.sql');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); }
}

// Supabase-faithful auth stub applied BEFORE the migration.
const AUTH_STUB = `
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
  -- mirrors Supabase's auth.uid(): the 'sub' claim from the request JWT
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
  $$;
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin noinherit; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin noinherit bypassrls; end if;
  end $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
`;

async function run() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  await db.exec(fs.readFileSync(MIGRATION, 'utf8'));

  // ── helpers ────────────────────────────────────────────────────────────────
  const sup = async (sql, params) => db.query(sql, params);          // superuser
  async function login(uid) {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claims', $1, false)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })]);
    await db.exec(`set role authenticated;`);
  }
  async function anon() {
    await db.exec(`reset role;`);
    await db.query(`select set_config('request.jwt.claims', $1, false)`, ['']);
    await db.exec(`set role anon;`);
  }
  async function asSuper() { await db.exec(`reset role;`); }
  async function expectError(fn) { try { await fn(); return false; } catch (e) { return true; } }

  // ── T1 · signup trigger creates profiles ────────────────────────────────────
  await asSuper();
  const uA = (await sup(`insert into auth.users(email) values('a@x.test') returning id`)).rows[0].id;
  const uB = (await sup(`insert into auth.users(email) values('b@x.test') returning id`)).rows[0].id;
  const profs = (await sup(`select count(*)::int n from public.profiles`)).rows[0].n;
  check('signup trigger auto-creates a profile per user', profs === 2, { profs });

  // ── T2 · bootstrap via create_workspace RPC ─────────────────────────────────
  await login(uA);
  const wsA = (await db.query(`select public.create_workspace('WS-A') as id`)).rows[0].id;
  await login(uB);
  const wsB = (await db.query(`select public.create_workspace('WS-B') as id`)).rows[0].id;
  check('create_workspace returns a workspace id', !!wsA && !!wsB && wsA !== wsB);

  // ── T3 · workspace read isolation ───────────────────────────────────────────
  await login(uA);
  const aSees = (await db.query(`select id, name from public.workspaces order by name`)).rows;
  check('owner A sees only its own workspace', aSees.length === 1 && aSees[0].name === 'WS-A', aSees);
  await login(uB);
  const bSees = (await db.query(`select name from public.workspaces`)).rows;
  check('owner B sees only its own workspace', bSees.length === 1 && bSees[0].name === 'WS-B', bSees);

  // ── T4 · membership roster + role helper ────────────────────────────────────
  await login(uA);
  const roster = (await db.query(`select user_id, role from public.workspace_members`)).rows;
  check('A sees only WS-A roster (itself as owner)', roster.length === 1 && roster[0].role === 'owner', roster);
  const roleA = (await db.query(`select private.workspace_role($1,$2) as r`, [wsA, uA])).rows[0].r;
  check('workspace_role(WS-A, A) = owner', roleA === 'owner', { roleA });

  // ── T5 · role-gated update; cross-tenant update blocked ─────────────────────
  await login(uA);
  const upd = await db.query(`update public.workspaces set name='WS-A2' where id=$1`, [wsA]);
  check('owner A can rename its workspace', upd.affectedRows === 1, { affected: upd.affectedRows });
  await login(uB);
  const hack = await db.query(`update public.workspaces set name='HACKED' where id=$1`, [wsA]);
  await asSuper();
  const nameA = (await sup(`select name from public.workspaces where id=$1`, [wsA])).rows[0].name;
  check('non-member B cannot rename WS-A (RLS blocks)', hack.affectedRows === 0 && nameA === 'WS-A2', { affected: hack.affectedRows, nameA });

  // ── T6 · direct membership write denied (must go through RPC) ───────────────
  await login(uA);
  const insBlocked = await expectError(() =>
    db.query(`insert into public.workspace_members(workspace_id,user_id,role) values($1,$2,'editor')`, [wsA, uB]));
  check('direct INSERT into workspace_members is denied for authenticated', insBlocked);

  // ── T7 · profile visibility limited to co-members ───────────────────────────
  await login(uA);
  const visP = (await db.query(`select id from public.profiles`)).rows;
  check('A (no shared workspace with B) sees only its own profile', visP.length === 1 && visP[0].id === uA, visP.map(r => r.id));

  // ── T8 · invitations visible only to the owner ──────────────────────────────
  await asSuper();
  await sup(`insert into public.workspace_invitations(workspace_id,invited_email,role,token_hash,invited_by,expires_at)
             values($1,'c@x.test','editor','hash123',$2, now()+interval '7 days')`, [wsA, uA]);
  await login(uA);
  const invOwner = (await db.query(`select count(*)::int n from public.workspace_invitations`)).rows[0].n;
  check('owner A sees WS-A invitation', invOwner === 1, { invOwner });
  await login(uB);
  const invOther = (await db.query(`select count(*)::int n from public.workspace_invitations`)).rows[0].n;
  check('non-owner B sees no WS-A invitation', invOther === 0, { invOther });

  // ── T9 · anon sees nothing ──────────────────────────────────────────────────
  await anon();
  const anonWs = await expectError(() => db.query(`select * from public.workspaces`));
  // anon has no grant → either error or 0 rows; accept either as "no access"
  let anonRows = -1;
  if (!anonWs) { try { anonRows = (await db.query(`select count(*)::int n from public.workspaces`)).rows[0].n; } catch (e) { anonRows = -1; } }
  check('anon cannot read workspaces', anonWs || anonRows === 0, { anonWs, anonRows });

  await db.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch(e => { console.error('HARNESS ERROR:', e.message); process.exit(2); });
