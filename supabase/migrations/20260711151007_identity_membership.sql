-- ============================================================================
-- 0001 · Identity & membership  (Phase 1, MVP data model v3.1 §4.1 + §5)
-- ----------------------------------------------------------------------------
-- Single-workspace collaborative model: profiles, workspace(s), members with
-- roles (owner/editor/viewer), and one-time email invitations. RLS + a
-- non-recursive SECURITY DEFINER membership helper enforce tenant isolation
-- from day one. Client writes to membership go through RPCs, never directly,
-- so role rules and last-owner protection can be enforced transactionally.
-- ============================================================================

-- Private schema for security-definer helpers. PostgREST only exposes `public`,
-- so nothing here is reachable as an API/RPC endpoint. Deny API roles outright.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to authenticated;  -- needed to call helpers in RLS

-- ── profiles ────────────────────────────────────────────────────────────────
create table public.profiles (
    id           uuid primary key references auth.users(id) on delete cascade,
    display_name text not null default '',
    avatar_path  text,
    created_at   timestamptz not null default now(),
    updated_at   timestamptz not null default now()
);

-- ── workspaces ──────────────────────────────────────────────────────────────
create table public.workspaces (
    id         uuid primary key default gen_random_uuid(),
    name       text not null check (length(name) between 1 and 120),
    created_by uuid not null references auth.users(id),
    settings   jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- ── workspace_members ───────────────────────────────────────────────────────
create table public.workspace_members (
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id      uuid not null references auth.users(id) on delete cascade,
    role         text not null check (role in ('owner','editor','viewer')),
    joined_at    timestamptz not null default now(),
    primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ── workspace_invitations ───────────────────────────────────────────────────
create table public.workspace_invitations (
    id            uuid primary key default gen_random_uuid(),
    workspace_id  uuid not null references public.workspaces(id) on delete cascade,
    invited_email text not null,
    role          text not null check (role in ('editor','viewer')), -- never invite an owner
    token_hash    text not null unique,          -- store only a hash of the token
    invited_by    uuid not null references auth.users(id),
    expires_at    timestamptz not null,
    accepted_at   timestamptz,
    revoked_at    timestamptz,
    created_at    timestamptz not null default now()
);
create index workspace_invitations_ws_idx on public.workspace_invitations (workspace_id);

-- ── membership helpers (non-recursive; SECURITY DEFINER, fixed search_path) ──
-- A policy on workspace_members that itself queries workspace_members would
-- recurse; these definer functions read it with RLS bypassed.
create or replace function private.workspace_role(p_workspace uuid, p_user uuid)
returns text language sql security definer set search_path = '' stable as $$
    select role from public.workspace_members
    where workspace_id = p_workspace and user_id = p_user;
$$;

create or replace function private.is_member(p_workspace uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
    select exists (
        select 1 from public.workspace_members
        where workspace_id = p_workspace and user_id = p_user
    );
$$;

-- co-membership test for profile visibility
create or replace function private.shares_workspace(p_other uuid, p_user uuid)
returns boolean language sql security definer set search_path = '' stable as $$
    select exists (
        select 1
        from public.workspace_members a
        join public.workspace_members b on a.workspace_id = b.workspace_id
        where a.user_id = p_user and b.user_id = p_other
    );
$$;

revoke all on function private.workspace_role(uuid,uuid)   from public;
revoke all on function private.is_member(uuid,uuid)        from public;
revoke all on function private.shares_workspace(uuid,uuid) from public;
grant execute on function private.workspace_role(uuid,uuid)   to authenticated;
grant execute on function private.is_member(uuid,uuid)        to authenticated;
grant execute on function private.shares_workspace(uuid,uuid) to authenticated;

-- ── updated_at + profile-on-signup triggers ──────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger language plpgsql security definer set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_touch  before update on public.profiles
    for each row execute function private.touch_updated_at();
create trigger workspaces_touch before update on public.workspaces
    for each row execute function private.touch_updated_at();

-- auto-create a profile row when a new auth user is created
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
    insert into public.profiles (id, display_name)
    values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;
    return new;
end; $$;

create trigger on_auth_user_created after insert on auth.users
    for each row execute function private.handle_new_user();

-- ── bootstrap RPC: create a workspace and become its owner (atomic) ───────────
create or replace function public.create_workspace(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
    if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
    insert into public.workspaces (name, created_by) values (p_name, v_uid) returning id into v_id;
    insert into public.workspace_members (workspace_id, user_id, role) values (v_id, v_uid, 'owner');
    return v_id;
end; $$;
revoke all on function public.create_workspace(text) from public, anon;
grant execute on function public.create_workspace(text) to authenticated;

-- ============================================================================
-- Row-Level Security
-- ============================================================================
alter table public.profiles              enable row level security;
alter table public.workspaces            enable row level security;
alter table public.workspace_members     enable row level security;
alter table public.workspace_invitations enable row level security;

-- Lock down direct table DML from API roles; reads are governed by policies
-- below, writes to membership/workspaces/invitations go through RPCs.
revoke all on public.profiles, public.workspaces, public.workspace_members,
             public.workspace_invitations from anon, authenticated;
grant select on public.profiles, public.workspaces, public.workspace_members,
              public.workspace_invitations to authenticated;
grant update on public.profiles  to authenticated;      -- own row only (policy)
grant update on public.workspaces to authenticated;     -- owner only (policy)

-- profiles: read own + co-members; update own only
create policy profiles_select on public.profiles for select to authenticated
    using (id = auth.uid() or private.shares_workspace(id, auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
    using (id = auth.uid()) with check (id = auth.uid());

-- workspaces: members read; owner updates
create policy workspaces_select on public.workspaces for select to authenticated
    using (private.is_member(id, auth.uid()));
create policy workspaces_update on public.workspaces for update to authenticated
    using (private.workspace_role(id, auth.uid()) = 'owner')
    with check (private.workspace_role(id, auth.uid()) = 'owner');

-- workspace_members: any member of the workspace can read the roster; all
-- writes go through RPCs (create_workspace, and invite/transfer/remove later),
-- so there is deliberately NO insert/update/delete policy here.
create policy members_select on public.workspace_members for select to authenticated
    using (private.is_member(workspace_id, auth.uid()));

-- invitations: only owners see/manage their workspace's invitations (writes via RPC)
create policy invitations_select on public.workspace_invitations for select to authenticated
    using (private.workspace_role(workspace_id, auth.uid()) = 'owner');
