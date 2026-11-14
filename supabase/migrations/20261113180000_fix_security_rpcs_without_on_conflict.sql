-- ==============================================================================
-- MYBENGKEL - SECURITY RPCs WITHOUT ON CONFLICT (FIX POSTGRES 42P10)
-- Migration: 20261113180000_fix_security_rpcs_without_on_conflict.sql
--
-- Root cause:
--   public.user_security is not created by any migration (only by seed_users.sql),
--   and public.account_security uses "create table if not exists". On the remote
--   database these tables can exist WITHOUT a unique/primary key on user_id, so every
--   "ON CONFLICT (user_id)" clause fails with:
--     42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification
--
-- Fix:
--   1. Make sure tables and columns exist (idempotent, non-destructive).
--   2. Replace every security RPC with explicit UPDATE ... IF NOT FOUND THEN INSERT logic.
--      No ON CONFLICT clause remains, so 42P10 can never happen again.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. TABLES AND COLUMNS (idempotent)
-- ------------------------------------------------------------------------------
create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_security add column if not exists email text;
alter table public.user_security add column if not exists pin_hash text;
alter table public.user_security add column if not exists created_at timestamptz not null default now();
alter table public.user_security add column if not exists updated_at timestamptz not null default now();
alter table public.user_security enable row level security;

create table if not exists public.account_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  must_complete_security_setup boolean not null default true,
  password_changed_at timestamptz,
  email_verified_at timestamptz,
  pin_created_at timestamptz,
  security_setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_security add column if not exists must_complete_security_setup boolean not null default true;
alter table public.account_security add column if not exists password_changed_at timestamptz;
alter table public.account_security add column if not exists email_verified_at timestamptz;
alter table public.account_security add column if not exists pin_created_at timestamptz;
alter table public.account_security add column if not exists pin_set_at timestamptz;
alter table public.account_security add column if not exists security_setup_completed_at timestamptz;
alter table public.account_security add column if not exists created_at timestamptz not null default now();
alter table public.account_security add column if not exists updated_at timestamptz not null default now();
alter table public.account_security enable row level security;

-- Allow every application role in user_roles (NOT VALID keeps legacy rows untouched)
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'master_admin', 'customer', 'admin_gudang', 'master_gudang', 'master_helpdesk'))
  not valid;

-- ------------------------------------------------------------------------------
-- 2. DROP EVERY EXISTING OVERLOAD OF THE FUNCTIONS WE REPLACE
--    (remote may contain versions with different signatures or return types)
-- ------------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'get_account_security_status',
        'record_security_password_changed',
        'record_security_email_changed',
        'mark_account_security_password_changed',
        'mark_account_security_email_changed',
        'set_account_security_pin',
        'verify_and_reset_pin',
        'mb_sync_profile',
        'mb_ensure_user_role',
        'mb_ensure_account_security',
        'mb_upsert_user_security_pin'
      )
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. INTERNAL HELPERS (no ON CONFLICT)
-- ------------------------------------------------------------------------------

-- 3a. Optional profile sync. public.profiles is not part of MyBengkel migrations,
--     so this helper only acts when the table and the needed columns exist and it
--     never raises (a profile problem must not block PIN setup).
create or replace function public.mb_sync_profile(p_uid uuid, p_email text, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_id boolean;
  v_has_email boolean;
  v_has_name boolean;
  v_exists boolean;
begin
  if to_regclass('public.profiles') is null then
    return;
  end if;

  select
    bool_or(column_name = 'id'),
    bool_or(column_name = 'email'),
    bool_or(column_name = 'full_name')
  into v_has_id, v_has_email, v_has_name
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles';

  if not coalesce(v_has_id, false) then
    return;
  end if;

  execute 'select exists (select 1 from public.profiles where id = $1)'
    into v_exists using p_uid;

  if not v_exists and coalesce(v_has_email, false) and p_email is not null then
    execute 'select exists (select 1 from public.profiles where lower(email) = lower($1))'
      into v_exists using p_email;
    if v_exists then
      return; -- a profile with this email already belongs to another row, do not touch it
    end if;
  end if;

  if v_exists then
    if coalesce(v_has_email, false) then
      execute 'update public.profiles set email = $2 where id = $1' using p_uid, p_email;
    end if;
  else
    if coalesce(v_has_email, false) and coalesce(v_has_name, false) then
      execute 'insert into public.profiles (id, email, full_name) values ($1, $2, $3)'
        using p_uid, p_email, p_name;
    elsif coalesce(v_has_email, false) then
      execute 'insert into public.profiles (id, email) values ($1, $2)' using p_uid, p_email;
    else
      execute 'insert into public.profiles (id) values ($1)' using p_uid;
    end if;
  end if;
exception
  when others then
    raise notice 'mb_sync_profile skipped: %', sqlerrm;
end;
$$;

-- 3b. Resolve the role of a user. Keeps the existing authoritative role row;
--     only inserts when no role row exists (from onboarding metadata).
create or replace function public.mb_ensure_user_role(p_uid uuid, p_fallback_role text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_meta_role text;
begin
  select role into v_role
  from public.user_roles
  where user_id = p_uid
  order by assigned_at desc nulls last
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  select raw_user_meta_data->>'onboarding_role' into v_meta_role
  from auth.users
  where id = p_uid;

  if v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'customer') then
    v_role := v_meta_role;
  else
    v_role := p_fallback_role;
  end if;

  if v_role is null then
    return null;
  end if;

  if not exists (select 1 from public.user_roles where user_id = p_uid and role = v_role) then
    if exists (select 1 from public.user_roles where user_id = p_uid) then
      update public.user_roles set role = v_role, assigned_at = now() where user_id = p_uid;
    else
      insert into public.user_roles (user_id, role) values (p_uid, v_role);
    end if;
  end if;

  return v_role;
end;
$$;

-- 3c. Make sure an account_security row exists for the user.
create or replace function public.mb_ensure_account_security(p_uid uuid, p_privileged boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.account_security where user_id = p_uid) then
    insert into public.account_security (user_id, must_complete_security_setup, created_at, updated_at)
    values (p_uid, coalesce(p_privileged, false), now(), now());
  end if;
end;
$$;

-- 3d. Store a hashed PIN in user_security.
create or replace function public.mb_upsert_user_security_pin(p_uid uuid, p_email text, p_pin_hash text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_security
  set email = p_email,
      pin_hash = p_pin_hash,
      updated_at = now()
  where user_id = p_uid;

  if not found then
    insert into public.user_security (user_id, email, pin_hash, created_at, updated_at)
    values (p_uid, p_email, p_pin_hash, now(), now());
  end if;
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. RPC: get_account_security_status
-- ------------------------------------------------------------------------------
create or replace function public.get_account_security_status()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_sec record;
  v_role text;
  v_is_privileged boolean := false;
  v_email_confirmed boolean := false;
  v_pw_done boolean := false;
  v_email_done boolean := false;
  v_pin_done boolean := false;
  v_must_complete boolean := false;
  v_completed_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  select id, email, email_confirmed_at into v_user from auth.users where id = v_uid;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna auth tidak ditemukan.');
  end if;

  v_email_confirmed := v_user.email_confirmed_at is not null;
  v_role := public.mb_ensure_user_role(v_uid, null);
  v_is_privileged := coalesce(v_role in ('admin', 'master_admin', 'master_helpdesk'), false);

  perform public.mb_ensure_account_security(v_uid, v_is_privileged);

  -- Sync email verification from auth.users
  if v_email_confirmed then
    update public.account_security
    set email_verified_at = coalesce(email_verified_at, v_user.email_confirmed_at),
        updated_at = now()
    where user_id = v_uid and email_verified_at is null;
  end if;

  select must_complete_security_setup, password_changed_at, email_verified_at,
         pin_created_at, security_setup_completed_at
  into v_sec
  from public.account_security
  where user_id = v_uid
  order by updated_at desc nulls last
  limit 1;

  if v_is_privileged then
    v_pw_done := v_sec.password_changed_at is not null;
    v_email_done := v_sec.email_verified_at is not null;
    v_pin_done := v_sec.pin_created_at is not null;
    v_completed_count := (case when v_pw_done then 1 else 0 end)
                       + (case when v_email_done then 1 else 0 end)
                       + (case when v_pin_done then 1 else 0 end);

    if v_completed_count >= 3 and v_sec.must_complete_security_setup then
      update public.account_security
      set must_complete_security_setup = false,
          security_setup_completed_at = coalesce(security_setup_completed_at, now()),
          updated_at = now()
      where user_id = v_uid;
      v_must_complete := false;
    else
      v_must_complete := coalesce(v_sec.must_complete_security_setup, true) and v_completed_count < 3;
    end if;
  else
    v_must_complete := false;
    v_completed_count := 3;
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_user.email,
    'role', coalesce(v_role, 'customer'),
    'is_privileged', v_is_privileged,
    'must_complete_security_setup', v_must_complete,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_completed_count,
    'total_steps', 3,
    'email_confirmed', v_email_confirmed,
    'password_changed_at', v_sec.password_changed_at,
    'email_verified_at', v_sec.email_verified_at,
    'pin_created_at', v_sec.pin_created_at,
    'security_setup_completed_at', v_sec.security_setup_completed_at
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. RPC: record_security_password_changed (+ alias mark_account_security_password_changed)
-- ------------------------------------------------------------------------------
create or replace function public.record_security_password_changed()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  v_role := public.mb_ensure_user_role(v_uid, null);
  perform public.mb_ensure_account_security(v_uid, coalesce(v_role in ('admin', 'master_admin', 'master_helpdesk'), false));

  update public.account_security
  set password_changed_at = now(),
      updated_at = now()
  where user_id = v_uid;

  return public.get_account_security_status();
end;
$$;

create or replace function public.mark_account_security_password_changed()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.record_security_password_changed();
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC: record_security_email_changed (+ alias mark_account_security_email_changed)
-- ------------------------------------------------------------------------------
create or replace function public.record_security_email_changed()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_role text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna tidak ditemukan.');
  end if;

  if v_user.email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Email baru belum dikonfirmasi.');
  end if;

  v_role := public.mb_ensure_user_role(v_uid, null);
  perform public.mb_ensure_account_security(v_uid, coalesce(v_role in ('admin', 'master_admin', 'master_helpdesk'), false));
  perform public.mb_sync_profile(v_uid, v_user.email, v_user.raw_user_meta_data->>'full_name');

  update public.account_security
  set email_verified_at = coalesce(email_verified_at, v_user.email_confirmed_at, now()),
      updated_at = now()
  where user_id = v_uid;

  return public.get_account_security_status();
end;
$$;

create or replace function public.mark_account_security_email_changed()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.record_security_email_changed();
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC: set_account_security_pin
-- ------------------------------------------------------------------------------
create or replace function public.set_account_security_pin(p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_role text;
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_pin_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_uid;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna tidak ditemukan.');
  end if;

  -- Role from user_roles, then onboarding metadata, then admin (privileged onboarding route)
  v_role := public.mb_ensure_user_role(v_uid, 'admin');

  -- Strict 12-digit PIN for privileged roles
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if v_clean_pin !~ '^\d{8,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));

  perform public.mb_upsert_user_security_pin(v_uid, v_user.email, v_pin_hash);
  perform public.mb_sync_profile(v_uid, v_user.email, v_user.raw_user_meta_data->>'full_name');
  perform public.mb_ensure_account_security(v_uid, v_role in ('admin', 'master_admin', 'master_helpdesk'));

  update public.account_security
  set pin_created_at = now(),
      pin_set_at = now(),
      password_changed_at = coalesce(password_changed_at, now()),
      email_verified_at = coalesce(email_verified_at, v_user.email_confirmed_at, now()),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now()
  where user_id = v_uid;

  return public.get_account_security_status();
end;
$$;

-- ------------------------------------------------------------------------------
-- 8. RPC: verify_and_reset_pin (PIN recovery, no ON CONFLICT)
-- ------------------------------------------------------------------------------
create or replace function public.verify_and_reset_pin(p_token text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_clean_token text := trim(coalesce(p_token, ''));
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_rec record;
  v_role text;
  v_found boolean := false;
  v_new_pin_hash text;
begin
  if v_clean_token = '' then
    return jsonb_build_object('ok', false, 'error', 'Token pemulihan PIN tidak valid.');
  end if;

  for v_rec in
    select id, user_id, email, token_hash
    from public.pin_recovery_tokens
    where used_at is null and expires_at > now()
    order by created_at desc
  loop
    if v_rec.token_hash = extensions.crypt(v_clean_token, v_rec.token_hash) then
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    return jsonb_build_object('ok', false, 'error', 'Tautan pemulihan PIN tidak valid atau telah kedaluwarsa.');
  end if;

  select role into v_role from public.user_roles where user_id = v_rec.user_id limit 1;

  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if v_clean_pin !~ '^\d{8,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN baru harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  v_new_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));

  perform public.mb_upsert_user_security_pin(v_rec.user_id, v_rec.email, v_new_pin_hash);
  perform public.mb_ensure_account_security(v_rec.user_id, v_role in ('admin', 'master_admin', 'master_helpdesk'));

  update public.account_security
  set pin_created_at = now(),
      pin_set_at = now(),
      updated_at = now()
  where user_id = v_rec.user_id;

  update public.pin_recovery_tokens
  set used_at = now()
  where id = v_rec.id;

  return jsonb_build_object('ok', true, 'message', 'PIN telah diperbarui.');
end;
$$;

-- ------------------------------------------------------------------------------
-- 9. PRIVILEGES
-- ------------------------------------------------------------------------------
-- Internal helpers: not callable from the client
revoke all on function public.mb_sync_profile(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mb_ensure_user_role(uuid, text) from public, anon, authenticated;
revoke all on function public.mb_ensure_account_security(uuid, boolean) from public, anon, authenticated;
revoke all on function public.mb_upsert_user_security_pin(uuid, text, text) from public, anon, authenticated;

-- Authenticated security RPCs
revoke all on function public.get_account_security_status() from public, anon;
revoke all on function public.record_security_password_changed() from public, anon;
revoke all on function public.record_security_email_changed() from public, anon;
revoke all on function public.mark_account_security_password_changed() from public, anon;
revoke all on function public.mark_account_security_email_changed() from public, anon;
revoke all on function public.set_account_security_pin(text) from public, anon;

grant execute on function public.get_account_security_status() to authenticated;
grant execute on function public.record_security_password_changed() to authenticated;
grant execute on function public.record_security_email_changed() to authenticated;
grant execute on function public.mark_account_security_password_changed() to authenticated;
grant execute on function public.mark_account_security_email_changed() to authenticated;
grant execute on function public.set_account_security_pin(text) to authenticated;

-- Recovery flow is used before login (token based)
grant execute on function public.verify_and_reset_pin(text, text) to anon, authenticated;

-- Refresh PostgREST schema cache so the new signatures are visible immediately
notify pgrst, 'reload schema';
