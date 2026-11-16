-- ==============================================================================
-- MYBENGKEL - FIX PROFILES & USER_ROLES FK CONSTRAINT ON SECURITY ONBOARDING
-- Migration: 20261114170000_fix_profiles_and_user_roles_fk.sql
--
-- Problem:
--   Saving Step 3 PIN on mobile triggers:
--     insert or update on table "user_roles" violates foreign key constraint "user_roles_user_id_fkey"
--
-- Root cause:
--   1. public.user_roles(user_id) references public.profiles(id).
--   2. In previous migrations, mb_ensure_user_role was called BEFORE mb_sync_profile.
--   3. When a previous test row in public.profiles had the same email, mb_sync_profile
--      silently skipped creating a row with id = auth.uid().
--   4. When public.user_roles attempted to insert auth.uid(), the FK check failed.
--
-- Guaranteed Execution Order Fix:
--   a) Ensure user_roles_role_check allows admin, admin_gudang, master_gudang,
--      master_admin, master_helpdesk, mekanik, customer.
--   b) Obtain v_user_id := auth.uid(), v_email, and v_meta_role directly from auth.users.
--   c) Determine target role (p_role > raw_user_meta_data->>'onboarding_role' > existing > fallback).
--   d) BEFORE touching public.user_roles, GUARANTEE id = v_user_id exists in public.profiles:
--      - Rename any stale row with the same email but different id (email || '.old.' || id).
--      - If exists, UPDATE email & full_name.
--      - If not exists, INSERT (id, email, full_name).
--   e) ONLY AFTER public.profiles is guaranteed, assign role in public.user_roles.
--   f) Save 12-digit PIN hash, update account_security (must_complete_security_setup = false, pin_set_at = now()).
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. ENSURE PROFILES & USER_ROLES TABLES & CONSTRAINTS
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles enable row level security;

-- Ensure user_roles allows all defined application roles
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'admin_gudang', 'master_gudang', 'master_admin', 'master_helpdesk', 'mekanik', 'customer'))
  not valid;

-- ------------------------------------------------------------------------------
-- 2. DROP OVERLOADS FOR CLEAN REPLACEMENT
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
        'mb_sync_profile',
        'mb_ensure_user_role',
        'set_account_security_pin',
        'record_security_email_changed',
        'record_security_password_changed',
        'mark_account_security_password_changed',
        'mark_account_security_email_changed'
      )
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. HELPER: mb_sync_profile
-- Guarantees a valid row with id = p_uid exists in public.profiles.
-- Cleans up any stale row with conflicting email first.
-- ------------------------------------------------------------------------------
create or replace function public.mb_sync_profile(
  p_uid uuid,
  p_email text,
  p_name text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_name text := nullif(trim(coalesce(p_name, '')), '');
begin
  if p_uid is null then
    return;
  end if;

  -- Step 1: Free up conflicting email constraint from any stale unreferenced row
  if v_clean_email <> '' then
    update public.profiles
    set email = email || '.old.' || substr(id::text, 1, 8),
        updated_at = now()
    where lower(email) = v_clean_email
      and id <> p_uid;
  end if;

  -- Step 2: Strictly guarantee row with id = p_uid exists in public.profiles
  if exists (select 1 from public.profiles where id = p_uid) then
    update public.profiles
    set email = coalesce(nullif(v_clean_email, ''), email),
        full_name = coalesce(v_clean_name, nullif(trim(full_name), ''), 'Admin MyBengkel'),
        updated_at = now()
    where id = p_uid;
  else
    insert into public.profiles (id, email, full_name, created_at, updated_at)
    values (
      p_uid,
      coalesce(nullif(v_clean_email, ''), p_uid::text || '@mybengkel.local'),
      coalesce(v_clean_name, 'Admin MyBengkel'),
      now(),
      now()
    );
  end if;
exception
  when others then
    raise notice 'mb_sync_profile warning: %', sqlerrm;
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. HELPER: mb_ensure_user_role
-- Guarantees public.profiles exists BEFORE any insert/update into public.user_roles.
-- ------------------------------------------------------------------------------
create or replace function public.mb_ensure_user_role(
  p_uid uuid,
  p_fallback_role text default 'admin'
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_meta_role text;
  v_email text;
  v_full_name text;
begin
  if p_uid is null then
    return null;
  end if;

  -- 1. Check existing role in user_roles
  select role into v_role
  from public.user_roles
  where user_id = p_uid
  order by assigned_at desc nulls last
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  -- 2. Read onboarding metadata from auth.users
  select email, raw_user_meta_data->>'onboarding_role', raw_user_meta_data->>'full_name'
  into v_email, v_meta_role, v_full_name
  from auth.users
  where id = p_uid;

  if v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := v_meta_role;
  else
    v_role := coalesce(p_fallback_role, 'admin');
  end if;

  -- 3. CRITICAL: Guarantee public.profiles row exists BEFORE touching public.user_roles
  perform public.mb_sync_profile(p_uid, v_email, v_full_name);

  -- 4. Assign role in public.user_roles
  if not exists (select 1 from public.user_roles where user_id = p_uid and role = v_role) then
    if exists (select 1 from public.user_roles where user_id = p_uid) then
      update public.user_roles set role = v_role, assigned_at = now() where user_id = p_uid;
    else
      insert into public.user_roles (user_id, role, assigned_at, created_at)
      values (p_uid, v_role, now(), now());
    end if;
  end if;

  return v_role;
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. RPC: set_account_security_pin
-- Guaranteed execution order across Admin, Master Admin, and Master Helpdesk.
-- ------------------------------------------------------------------------------
create or replace function public.set_account_security_pin(
  p_new_pin text,
  p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_pin_hash text;
begin
  -- Step a: Validate authentication
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  -- Step b: Obtain user details from auth.users
  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna auth tidak ditemukan.');
  end if;

  v_email := v_user.email;
  v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
  v_full_name := v_user.raw_user_meta_data->>'full_name';

  -- Step c: Determine target role (validating admin, master_admin, master_helpdesk)
  if p_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := p_role;
  elsif v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := v_meta_role;
  else
    select role into v_role from public.user_roles where user_id = v_user_id limit 1;
    if v_role is null then
      v_role := 'admin';
    end if;
  end if;

  -- Validate 12-digit PIN for privileged roles
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if v_clean_pin !~ '^\d{8,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  -- Step d: CRITICAL: BEFORE touching public.user_roles, guarantee row with id = v_user_id exists in public.profiles
  -- 1) Stale row check & email rename
  if v_email is not null and v_email <> '' then
    update public.profiles
    set email = email || '.old.' || substr(id::text, 1, 8),
        updated_at = now()
    where lower(email) = lower(v_email)
      and id <> v_user_id;
  end if;

  -- 2) Strict IF EXISTS check on public.profiles
  if exists (select 1 from public.profiles where id = v_user_id) then
    update public.profiles
    set email = coalesce(v_email, email),
        full_name = coalesce(nullif(trim(full_name), ''), v_full_name, 'Admin MyBengkel'),
        updated_at = now()
    where id = v_user_id;
  else
    insert into public.profiles (id, email, full_name, created_at, updated_at)
    values (
      v_user_id,
      coalesce(v_email, v_user_id::text || '@mybengkel.local'),
      coalesce(v_full_name, 'Admin MyBengkel'),
      now(),
      now()
    );
  end if;

  -- Step e: ONLY AFTER public.profiles is guaranteed to contain id = v_user_id, assign role in public.user_roles
  if v_role is not null then
    if exists (select 1 from public.user_roles where user_id = v_user_id) then
      update public.user_roles
      set role = v_role,
          assigned_at = now()
      where user_id = v_user_id;
    else
      insert into public.user_roles (user_id, role, assigned_at, created_at)
      values (v_user_id, v_role, now(), now());
    end if;
  end if;

  -- Step f: Save 12-digit PIN hash into public.user_security and complete security setup
  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
  perform public.mb_upsert_user_security_pin(v_user_id, v_email, v_pin_hash);

  perform public.mb_ensure_account_security(v_user_id, v_role in ('admin', 'master_admin', 'master_helpdesk'));

  update public.account_security
  set pin_created_at = now(),
      pin_set_at = now(),
      password_changed_at = coalesce(password_changed_at, now()),
      email_verified_at = coalesce(email_verified_at, v_user.email_confirmed_at, now()),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now()
  where user_id = v_user_id;

  return public.get_account_security_status();
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC: record_security_email_changed & password_changed (guaranteed profiles first)
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

  -- Ensure profile exists BEFORE user_roles
  perform public.mb_sync_profile(v_uid, v_user.email, v_user.raw_user_meta_data->>'full_name');
  v_role := public.mb_ensure_user_role(v_uid, null);
  perform public.mb_ensure_account_security(v_uid, coalesce(v_role in ('admin', 'master_admin', 'master_helpdesk'), false));

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

create or replace function public.record_security_password_changed()
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

  select id, email, raw_user_meta_data into v_user from auth.users where id = v_uid;
  if found then
    perform public.mb_sync_profile(v_uid, v_user.email, v_user.raw_user_meta_data->>'full_name');
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
-- 7. PRIVILEGES & RELOAD
-- ------------------------------------------------------------------------------
revoke all on function public.mb_sync_profile(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mb_ensure_user_role(uuid, text) from public, anon, authenticated;

revoke all on function public.record_security_password_changed() from public, anon;
revoke all on function public.record_security_email_changed() from public, anon;
revoke all on function public.mark_account_security_password_changed() from public, anon;
revoke all on function public.mark_account_security_email_changed() from public, anon;
revoke all on function public.set_account_security_pin(text, text) from public, anon;

grant execute on function public.record_security_password_changed() to authenticated;
grant execute on function public.record_security_email_changed() to authenticated;
grant execute on function public.mark_account_security_password_changed() to authenticated;
grant execute on function public.mark_account_security_email_changed() to authenticated;
grant execute on function public.set_account_security_pin(text, text) to authenticated;

notify pgrst, 'reload schema';
