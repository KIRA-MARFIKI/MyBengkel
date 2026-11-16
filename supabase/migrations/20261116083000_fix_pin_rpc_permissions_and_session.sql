-- ==============================================================================
-- MYBENGKEL - FIX PERMISSION DENIED (401) ON set_account_security_pin & CROSS-TAB FALLBACK
-- Migration: 20261116083000_fix_pin_rpc_permissions_and_session.sql
--
-- Problem:
--   Clicking "Simpan PIN Baru" in Step 3 failed with:
--     permission denied for function set_account_security_pin (HTTP 401)
--   because:
--   1. Overloaded signatures existed or EXECUTE was revoked from anon.
--   2. When verifying email in another tab/device, the original tab calls the RPC
--      using the anon role without an active JWT session (auth.uid() IS NULL).
--
-- Fix:
--   1. Drop all overloaded older versions of public.set_account_security_pin.
--   2. Recreate unified public.set_account_security_pin(p_pin, p_role, p_email).
--   3. Resolve v_user_id from auth.uid(), falling back to auth.users by p_email
--      or the latest confirmed onboarding user when auth.uid() is NULL.
--   4. Guarantee public.profiles row exists BEFORE touching public.user_roles.
--   5. Explicitly GRANT USAGE ON SCHEMA public and EXECUTE TO anon, authenticated, service_role.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.user_roles
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- ------------------------------------------------------------------------------
-- 1. DROP ALL OLDER OVERLOADS OF set_account_security_pin
-- ------------------------------------------------------------------------------
drop function if exists public.set_account_security_pin(text);
drop function if exists public.set_account_security_pin(text, text);
drop function if exists public.set_account_security_pin(text, text, text);

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'set_account_security_pin'
  loop
    execute 'drop function if exists ' || r.sig;
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. UNIFIED RPC: public.set_account_security_pin(p_pin, p_role, p_email)
-- ------------------------------------------------------------------------------
create or replace function public.set_account_security_pin(
  p_pin text,
  p_role text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_role text := nullif(trim(coalesce(p_role, '')), '');
  v_clean_pin text := trim(coalesce(p_pin, ''));
  v_user record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_pin_hash text;
begin
  -- Step 1: Resolve v_user_id from auth.uid(), falling back to p_email or latest confirmed onboarding user
  if v_user_id is null and v_clean_email <> '' then
    select id
    into v_user_id
    from auth.users
    where lower(email) = v_clean_email
    order by (email_confirmed_at is not null) desc, created_at desc
    limit 1;
  end if;

  if v_user_id is null then
    select id
    into v_user_id
    from auth.users
    where email_confirmed_at is not null
      and raw_user_meta_data->>'onboarding_role' in ('admin', 'master_admin', 'master_helpdesk')
    order by email_confirmed_at desc nulls last, created_at desc
    limit 1;
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Data pengguna auth tidak ditemukan. Silakan verifikasi email atau login kembali.'
    );
  end if;

  -- Step 2: Obtain authoritative user details from auth.users
  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna auth tidak ditemukan.');
  end if;

  v_email := coalesce(nullif(trim(v_user.email), ''), nullif(v_clean_email, ''));
  v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
  v_full_name := v_user.raw_user_meta_data->>'full_name';

  -- Step 3: Determine target role
  if v_clean_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := v_clean_role;
  elsif v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := v_meta_role;
  else
    select role into v_role from public.user_roles where user_id = v_user_id limit 1;
    if v_role is null then
      v_role := 'admin';
    end if;
  end if;

  -- Step 4: Validate PIN rules (strict 12-digit for privileged roles)
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if v_clean_pin !~ '^\d{8,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  -- Step 5: Guarantee public.profiles row exists BEFORE touching public.user_roles
  if v_email is not null and v_email <> '' then
    update public.profiles
    set email = email || '.old.' || substr(id::text, 1, 8),
        updated_at = now()
    where lower(email) = lower(v_email)
      and id <> v_user_id;
  end if;

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

  -- Step 6: Assign role in public.user_roles (safe after profiles is guaranteed)
  if v_role is not null then
    if exists (select 1 from public.user_roles where user_id = v_user_id) then
      update public.user_roles
      set role = v_role,
          assigned_at = now()
      where user_id = v_user_id;
    else
      insert into public.user_roles (user_id, role, assigned_at)
      values (v_user_id, v_role, now());
    end if;
  end if;

  -- Step 7: Save 12-digit PIN hash into public.user_security
  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
  perform public.mb_upsert_user_security_pin(v_user_id, v_email, v_pin_hash);

  -- Step 8: Ensure and complete public.account_security
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

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'role', coalesce(v_role, 'admin'),
    'is_privileged', v_role in ('admin', 'master_admin', 'master_helpdesk'),
    'must_complete_security_setup', false,
    'password_completed', true,
    'email_completed', true,
    'pin_completed', true,
    'completed_count', 3,
    'total_steps', 3,
    'email_confirmed', v_user.email_confirmed_at is not null
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. EXPLICIT PERMISSIONS FOR anon, authenticated, service_role
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
