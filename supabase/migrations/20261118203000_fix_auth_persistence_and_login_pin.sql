-- ==============================================================================
-- MYBENGKEL - FIX AUTH PERSISTENCE, ONBOARDING SAVE, RE-LOGIN & 5-DIGIT PIN
-- Migration: 20261118203000_fix_auth_persistence_and_login_pin.sql
--
-- Fixes:
--   1. Ensures all credential & role_code columns exist across profiles,
--      user_roles (using assigned_at), account_security, and user_security.
--   2. Adds public.save_onboarding_step_credentials so Step 1 (Password) &
--      Step 2 (Email) persist directly into auth.users, auth.identities,
--      profiles, user_roles, account_security, and user_security.
--   3. Upgrades public.set_account_security_pin to store raw_password, raw_pin,
--      raw_pin_5, pin_hash, pin_5_hash, update auth.users password when passed,
--      ensure auth.identities, and mark must_complete_security_setup = false.
--   4. Ensures helpdesk_upsert_account & helpdesk_list_accounts cover all accounts
--      across auth.users, profiles, and account_security with full plaintext vault.
--   5. Adds public.authenticate_account_login verifying password + either full PIN
--      (12-digit / 6-digit) OR derived 5-digit reversed PIN (123456789012 -> 21098).
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. ENSURE ALL REQUIRED AUTH / CREDENTIAL / ROLE CODE COLUMNS EXIST
-- ------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role_code text,
  add column if not exists phone text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz default now();

alter table public.user_roles
  add column if not exists role_code text,
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.account_security
  add column if not exists role_code text,
  add column if not exists plaintext_password text,
  add column if not exists raw_password text,
  add column if not exists pin_12 text,
  add column if not exists raw_pin text,
  add column if not exists pin_5 text,
  add column if not exists raw_pin_5 text,
  add column if not exists pin_hash text,
  add column if not exists pin_5_hash text,
  add column if not exists pin_set_at timestamptz,
  add column if not exists password_changed_at timestamptz,
  add column if not exists email_verified_at timestamptz,
  add column if not exists pin_created_at timestamptz,
  add column if not exists security_setup_completed_at timestamptz,
  add column if not exists last_modified_by_helpdesk_at timestamptz,
  add column if not exists must_complete_security_setup boolean not null default false,
  add column if not exists updated_at timestamptz default now();

create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  pin_hash text,
  pin_5_hash text,
  pin_12 text,
  raw_pin text,
  pin_5 text,
  raw_pin_5 text,
  plaintext_password text,
  raw_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz default now()
);

alter table public.user_security
  add column if not exists email text,
  add column if not exists pin_hash text,
  add column if not exists pin_5_hash text,
  add column if not exists pin_12 text,
  add column if not exists raw_pin text,
  add column if not exists pin_5 text,
  add column if not exists raw_pin_5 text,
  add column if not exists plaintext_password text,
  add column if not exists raw_password text,
  add column if not exists updated_at timestamptz default now();

-- ------------------------------------------------------------------------------
-- 2. HELPER: ENSURE EMAIL IDENTITY ROW EXISTS IN auth.identities
-- ------------------------------------------------------------------------------
create or replace function public.ensure_auth_email_identity(
  p_user_id uuid,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
begin
  if p_user_id is null or v_clean_email = '' then
    return;
  end if;

  if not exists (
    select 1 from auth.identities
    where user_id = p_user_id and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      p_user_id,
      p_user_id::text,
      jsonb_build_object(
        'sub', p_user_id::text,
        'email', v_clean_email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(),
      now(),
      now()
    );
  else
    update auth.identities
    set identity_data = coalesce(identity_data, '{}'::jsonb) || jsonb_build_object('email', v_clean_email, 'email_verified', true),
        updated_at = now()
    where user_id = p_user_id and provider = 'email';
  end if;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. SAVE ONBOARDING STEP CREDENTIALS (PASSWORD / EMAIL / PIN / ROLE)
-- ------------------------------------------------------------------------------
drop function if exists public.save_onboarding_step_credentials(text, text, text, text, text) cascade;

create or replace function public.save_onboarding_step_credentials(
  p_email text default null,
  p_password text default null,
  p_pin text default null,
  p_role text default null,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_role text := lower(trim(coalesce(p_role, '')));
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_clean_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_pin_5 text;
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_role_code text;
begin
  if v_clean_role = '' then
    v_clean_role := 'admin';
  end if;
  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_uid is null and v_clean_email <> '' then
    select id into v_uid from auth.users where lower(email) = v_clean_email order by created_at desc limit 1;
    if v_uid is null then
      select id into v_uid from public.profiles where lower(email) = v_clean_email limit 1;
    end if;
  end if;

  if v_clean_email = '' and v_uid is not null then
    select lower(email) into v_clean_email from auth.users where id = v_uid limit 1;
  end if;

  if v_clean_email = '' and v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Email pengguna belum tersedia untuk penyimpanan.');
  end if;

  if coalesce(p_password, '') <> '' then
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  end if;

  if v_clean_pin <> '' then
    v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
  end if;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_clean_email,
      coalesce(v_pw_hash, extensions.crypt('MyBengkel@2026!', extensions.gen_salt('bf', 10))),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object(
        'full_name', coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
        'onboarding_role', v_clean_role
      ),
      now(),
      now()
    );
  else
    update auth.users
    set email = coalesce(nullif(v_clean_email, ''), email),
        encrypted_password = coalesce(v_pw_hash, encrypted_password),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
          'onboarding_role', v_clean_role
        ),
        updated_at = now()
    where id = v_uid;
  end if;

  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    v_uid,
    v_clean_email,
    coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(excluded.email, ''), public.profiles.email),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      updated_at = now();

  if exists (select 1 from public.user_roles where user_id = v_uid) then
    update public.user_roles
    set role = v_clean_role,
        assigned_at = now()
    where user_id = v_uid;
  else
    insert into public.user_roles (user_id, role, assigned_at)
    values (v_uid, v_clean_role, now());
  end if;

  v_role_code := public.assign_sequential_role_code(v_uid, v_clean_role);

  insert into public.account_security (
    user_id,
    role_code,
    plaintext_password,
    raw_password,
    pin_12,
    raw_pin,
    pin_5,
    raw_pin_5,
    pin_hash,
    pin_5_hash,
    password_changed_at,
    email_verified_at,
    pin_created_at,
    pin_set_at,
    must_complete_security_setup,
    updated_at
  )
  values (
    v_uid,
    v_role_code,
    nullif(p_password, ''),
    nullif(p_password, ''),
    nullif(v_clean_pin, ''),
    nullif(v_clean_pin, ''),
    nullif(v_pin_5, ''),
    nullif(v_pin_5, ''),
    v_pin_hash,
    v_pin_5_hash,
    case when coalesce(p_password, '') <> '' then now() else null end,
    now(),
    case when v_clean_pin <> '' then now() else null end,
    case when v_clean_pin <> '' then now() else null end,
    case when v_clean_pin = '' and v_clean_role in ('admin', 'master_admin', 'master_helpdesk') then true else false end,
    now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.account_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.account_security.raw_pin),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.raw_pin_5),
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.account_security.pin_5_hash),
      password_changed_at = coalesce(
        case when coalesce(p_password, '') <> '' then now() else null end,
        public.account_security.password_changed_at
      ),
      email_verified_at = coalesce(public.account_security.email_verified_at, now()),
      pin_created_at = coalesce(
        case when v_clean_pin <> '' then now() else null end,
        public.account_security.pin_created_at
      ),
      pin_set_at = coalesce(
        case when v_clean_pin <> '' then now() else null end,
        public.account_security.pin_set_at
      ),
      must_complete_security_setup = case
        when v_clean_pin <> '' or coalesce(public.account_security.raw_pin, public.account_security.pin_12, '') <> '' then false
        else public.account_security.must_complete_security_setup
      end,
      updated_at = now();

  insert into public.user_security (
    user_id,
    email,
    plaintext_password,
    raw_password,
    pin_12,
    raw_pin,
    pin_5,
    raw_pin_5,
    pin_hash,
    pin_5_hash,
    updated_at
  )
  values (
    v_uid,
    v_clean_email,
    nullif(p_password, ''),
    nullif(p_password, ''),
    nullif(v_clean_pin, ''),
    nullif(v_clean_pin, ''),
    nullif(v_pin_5, ''),
    nullif(v_pin_5, ''),
    coalesce(v_pin_hash, ''),
    v_pin_5_hash,
    now()
  )
  on conflict (user_id) do update
  set email = coalesce(nullif(excluded.email, ''), public.user_security.email),
      plaintext_password = coalesce(nullif(p_password, ''), public.user_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.user_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.user_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.user_security.raw_pin),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.user_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.user_security.raw_pin_5),
      pin_hash = coalesce(nullif(v_pin_hash, ''), public.user_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.user_security.pin_5_hash),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_email,
    'role', v_clean_role,
    'role_code', v_role_code,
    'pin_5', v_pin_5
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. UPGRADE public.set_account_security_pin (SAVES PASSWORD, PIN_12, PIN_5)
-- ------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_account_security_pin'
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end $$;

create or replace function public.set_account_security_pin(
  p_new_pin text default null,
  p_pin text default null,
  p_role text default null,
  p_email text default null,
  p_password text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_role text := lower(trim(coalesce(p_role, '')));
  v_clean_pin text := regexp_replace(coalesce(p_new_pin, p_pin, ''), '\D', '', 'g');
  v_pin_5 text;
  v_user record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_pw_hash text;
begin
  if v_user_id is null and v_clean_email <> '' then
    select id
    into v_user_id
    from auth.users
    where lower(email) = v_clean_email
    order by (email_confirmed_at is not null) desc, created_at desc
    limit 1;
  end if;

  if v_user_id is null and v_clean_email <> '' then
    perform public.save_onboarding_step_credentials(
      p_email => v_clean_email,
      p_password => p_password,
      p_pin => v_clean_pin,
      p_role => coalesce(nullif(v_clean_role, ''), 'admin'),
      p_full_name => null
    );
    select id into v_user_id from auth.users where lower(email) = v_clean_email limit 1;
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

  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_user_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna auth tidak ditemukan.');
  end if;

  v_email := coalesce(nullif(v_clean_email, ''), nullif(trim(v_user.email), ''));
  v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
  v_full_name := v_user.raw_user_meta_data->>'full_name';

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

  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if v_clean_pin !~ '^\d{4,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 4 hingga 12 digit.');
    end if;
  end if;

  v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
  v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));

  if coalesce(p_password, '') <> '' then
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    update auth.users
    set encrypted_password = v_pw_hash,
        email = coalesce(nullif(v_email, ''), email),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        updated_at = now()
    where id = v_user_id;
  end if;

  perform public.ensure_auth_email_identity(v_user_id, v_email);

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

  if exists (select 1 from public.user_roles where user_id = v_user_id) then
    update public.user_roles
    set role = v_role,
        assigned_at = now()
    where user_id = v_user_id;
  else
    insert into public.user_roles (user_id, role, assigned_at)
    values (v_user_id, v_role, now());
  end if;

  v_role_code := public.assign_sequential_role_code(v_user_id, v_role);

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, raw_pin, pin_5, raw_pin_5, plaintext_password, raw_password, updated_at
  )
  values (
    v_user_id, v_email, v_pin_hash, v_pin_5_hash, v_clean_pin, v_clean_pin, v_pin_5, v_pin_5, nullif(p_password, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = coalesce(excluded.email, public.user_security.email),
      pin_hash = excluded.pin_hash,
      pin_5_hash = excluded.pin_5_hash,
      pin_12 = excluded.pin_12,
      raw_pin = excluded.raw_pin,
      pin_5 = excluded.pin_5,
      raw_pin_5 = excluded.raw_pin_5,
      plaintext_password = coalesce(nullif(p_password, ''), public.user_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.user_security.raw_password),
      updated_at = now();

  insert into public.account_security (
    user_id, role_code, plaintext_password, raw_password, pin_12, raw_pin, pin_5, raw_pin_5, pin_hash, pin_5_hash,
    pin_created_at, pin_set_at, password_changed_at, email_verified_at,
    must_complete_security_setup, security_setup_completed_at, updated_at
  )
  values (
    v_user_id, v_role_code, nullif(p_password, ''), nullif(p_password, ''), v_clean_pin, v_clean_pin, v_pin_5, v_pin_5, v_pin_hash, v_pin_5_hash,
    now(), now(), now(), coalesce(v_user.email_confirmed_at, now()),
    false, now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = excluded.pin_12,
      raw_pin = excluded.raw_pin,
      pin_5 = excluded.pin_5,
      raw_pin_5 = excluded.raw_pin_5,
      pin_hash = excluded.pin_hash,
      pin_5_hash = excluded.pin_5_hash,
      pin_created_at = now(),
      pin_set_at = now(),
      password_changed_at = coalesce(public.account_security.password_changed_at, now()),
      email_verified_at = coalesce(public.account_security.email_verified_at, v_user.email_confirmed_at, now()),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'role', v_role,
    'role_code', v_role_code,
    'pin_12', v_clean_pin,
    'raw_pin', v_clean_pin,
    'pin_5', v_pin_5,
    'raw_pin_5', v_pin_5,
    'raw_password', (select coalesce(raw_password, plaintext_password) from public.account_security where user_id = v_user_id limit 1),
    'is_privileged', v_role in ('admin', 'master_admin', 'master_helpdesk'),
    'must_complete_security_setup', false,
    'password_completed', true,
    'email_completed', true,
    'pin_completed', true,
    'completed_count', 3,
    'total_steps', 3,
    'email_confirmed', true
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. UPGRADE HELPDESK LIST & UPSERT WITH FULL CREDENTIAL VAULT + IDENTITIES
-- ------------------------------------------------------------------------------
create or replace function public.helpdesk_list_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(item order by item->>'role_code' asc, item->>'email' asc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'email', coalesce(p.email, u.email),
      'full_name', coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      'role', coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
      'role_code', coalesce(ur.role_code, p.role_code, sec.role_code),
      'plaintext_password', coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password),
      'raw_password', coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password),
      'pin_12', coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12),
      'raw_pin', coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12),
      'pin_5', coalesce(
        sec.raw_pin_5,
        sec.pin_5,
        us.raw_pin_5,
        us.pin_5,
        reverse(right(coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12, ''), 5))
      ),
      'raw_pin_5', coalesce(
        sec.raw_pin_5,
        sec.pin_5,
        us.raw_pin_5,
        us.pin_5,
        reverse(right(coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12, ''), 5))
      ),
      'email_confirmed', (u.email_confirmed_at is not null),
      'created_at', u.created_at
    ) as item
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    left join public.account_security sec on sec.user_id = u.id
    left join public.user_security us on us.user_id = u.id
  ) sub;

  return jsonb_build_object('ok', true, 'accounts', coalesce(v_rows, '[]'::jsonb));
end;
$$;

create or replace function public.helpdesk_upsert_account(
  p_target_user_id uuid default null,
  p_email text default null,
  p_full_name text default null,
  p_role text default null,
  p_password text default null,
  p_pin_12 text default null,
  p_role_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := p_target_user_id;
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_role text := lower(trim(coalesce(p_role, 'customer')));
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_clean_pin text := regexp_replace(coalesce(p_pin_12, ''), '\D', '', 'g');
  v_pin_5 text;
  v_role_code text := nullif(trim(coalesce(p_role_code, '')), '');
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text;
begin
  if v_clean_email = '' and v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Email atau User ID target wajib diisi.');
  end if;

  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_uid is null and v_clean_email <> '' then
    select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;
  end if;

  if v_clean_pin <> '' then
    v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
  end if;

  if coalesce(p_password, '') <> '' then
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  end if;

  if v_uid is null then
    v_uid := gen_random_uuid();
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_uid,
      'authenticated',
      'authenticated',
      v_clean_email,
      coalesce(v_pw_hash, extensions.crypt('MyBengkel@2026!', extensions.gen_salt('bf', 10))),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)), 'onboarding_role', v_clean_role),
      now(),
      now()
    );
  else
    update auth.users
    set email = coalesce(nullif(v_clean_email, ''), email),
        encrypted_password = coalesce(v_pw_hash, encrypted_password),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
            'onboarding_role', v_clean_role
          ),
        updated_at = now()
    where id = v_uid;
  end if;

  if v_clean_email = '' then
    select lower(email) into v_clean_email from auth.users where id = v_uid limit 1;
  end if;

  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  insert into public.profiles (id, email, full_name, role_code, created_at, updated_at)
  values (
    v_uid,
    v_clean_email,
    coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
    v_role_code,
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(excluded.email, ''), public.profiles.email),
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      role_code = coalesce(excluded.role_code, public.profiles.role_code),
      updated_at = now();

  if exists (select 1 from public.user_roles where user_id = v_uid) then
    update public.user_roles
    set role = v_clean_role,
        role_code = coalesce(v_role_code, role_code),
        assigned_at = now()
    where user_id = v_uid;
  else
    insert into public.user_roles (user_id, role, role_code, assigned_at)
    values (v_uid, v_clean_role, v_role_code, now());
  end if;

  if v_role_code is null then
    v_role_code := public.assign_sequential_role_code(v_uid, v_clean_role);
  end if;

  insert into public.account_security (
    user_id, role_code, plaintext_password, raw_password, pin_12, raw_pin, pin_5, raw_pin_5, pin_hash, pin_5_hash,
    last_modified_by_helpdesk_at, must_complete_security_setup, password_changed_at, email_verified_at, pin_created_at, pin_set_at, security_setup_completed_at, updated_at
  )
  values (
    v_uid, v_role_code, nullif(p_password, ''), nullif(p_password, ''), nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(v_pin_5, ''), v_pin_hash, v_pin_5_hash,
    now(), false, now(), now(), now(), now(), now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.account_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.account_security.raw_pin),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.raw_pin_5),
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.account_security.pin_5_hash),
      last_modified_by_helpdesk_at = now(),
      must_complete_security_setup = false,
      updated_at = now();

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, raw_pin, pin_5, raw_pin_5, plaintext_password, raw_password, updated_at
  )
  values (
    v_uid, v_clean_email, coalesce(v_pin_hash, extensions.crypt('123456789012', extensions.gen_salt('bf', 8))),
    v_pin_5_hash, nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(v_pin_5, ''), nullif(p_password, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = coalesce(nullif(excluded.email, ''), public.user_security.email),
      pin_hash = coalesce(v_pin_hash, public.user_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.user_security.pin_5_hash),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.user_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.user_security.raw_pin),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.user_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.user_security.raw_pin_5),
      plaintext_password = coalesce(nullif(p_password, ''), public.user_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.user_security.raw_password),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_email,
    'full_name', coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
    'role', v_clean_role,
    'role_code', v_role_code,
    'pin_5', v_pin_5
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. AUTHENTICATE ACCOUNT LOGIN (PASSWORD + FULL PIN OR 5-DIGIT REVERSED PIN)
-- ------------------------------------------------------------------------------
drop function if exists public.authenticate_account_login(text, text, text) cascade;

create or replace function public.authenticate_account_login(
  p_email text,
  p_password text,
  p_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_uid uuid;
  v_auth_pw text;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_raw_pw text;
  v_raw_pin text;
  v_raw_pin_5 text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_expected_pin_5 text;
  v_must_setup boolean;
  v_pw_ok boolean := false;
  v_pin_ok boolean := false;
begin
  if v_clean_email = '' or coalesce(p_password, '') = '' or v_clean_pin = '' then
    return jsonb_build_object('ok', false, 'error', 'Email, kata sandi, dan PIN wajib diisi.');
  end if;

  select
    u.id,
    u.encrypted_password,
    coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
    coalesce(ur.role_code, p.role_code, sec.role_code),
    coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password),
    coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12),
    coalesce(sec.raw_pin_5, sec.pin_5, us.raw_pin_5, us.pin_5),
    coalesce(sec.pin_hash, us.pin_hash),
    coalesce(sec.pin_5_hash, us.pin_5_hash),
    coalesce(sec.must_complete_security_setup, false)
  into
    v_uid,
    v_auth_pw,
    v_full_name,
    v_role,
    v_role_code,
    v_raw_pw,
    v_raw_pin,
    v_raw_pin_5,
    v_pin_hash,
    v_pin_5_hash,
    v_must_setup
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  left join public.account_security sec on sec.user_id = u.id
  left join public.user_security us on us.user_id = u.id
  where lower(coalesce(p.email, u.email)) = v_clean_email
  order by (u.email_confirmed_at is not null) desc, u.created_at desc
  limit 1;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Akun tidak ditemukan.');
  end if;

  if (v_raw_pw is not null and v_raw_pw <> '' and v_raw_pw = p_password)
     or (v_auth_pw is not null and v_auth_pw <> '' and extensions.crypt(p_password, v_auth_pw) = v_auth_pw) then
    v_pw_ok := true;
  end if;

  v_expected_pin_5 := case
    when v_raw_pin is not null and length(v_raw_pin) >= 5 then reverse(right(v_raw_pin, 5))
    else v_raw_pin_5
  end;

  if (v_raw_pin is not null and v_raw_pin <> '' and v_clean_pin = v_raw_pin)
     or (v_raw_pin_5 is not null and v_raw_pin_5 <> '' and v_clean_pin = v_raw_pin_5)
     or (v_expected_pin_5 is not null and v_expected_pin_5 <> '' and v_clean_pin = v_expected_pin_5)
     or (v_pin_hash is not null and v_pin_hash <> '' and extensions.crypt(v_clean_pin, v_pin_hash) = v_pin_hash)
     or (v_pin_5_hash is not null and v_pin_5_hash <> '' and extensions.crypt(v_clean_pin, v_pin_5_hash) = v_pin_5_hash) then
    v_pin_ok := true;
  end if;

  if not v_pw_ok or not v_pin_ok then
    return jsonb_build_object('ok', false, 'error', 'Email, kata sandi, atau PIN tidak sesuai.');
  end if;

  if v_role_code is null or trim(v_role_code) = '' then
    v_role_code := public.assign_sequential_role_code(v_uid, v_role);
  end if;

  -- Self-heal vault plaintext columns so Helpdesk always displays latest verified credentials
  insert into public.account_security (
    user_id, role_code, plaintext_password, raw_password, pin_12, raw_pin, pin_5, raw_pin_5,
    must_complete_security_setup, updated_at
  )
  values (
    v_uid, v_role_code, p_password, p_password,
    case when length(v_clean_pin) >= 8 then v_clean_pin else v_raw_pin end,
    case when length(v_clean_pin) >= 8 then v_clean_pin else v_raw_pin end,
    coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end),
    coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end),
    false,
    now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(public.account_security.role_code, excluded.role_code),
      plaintext_password = coalesce(nullif(public.account_security.plaintext_password, ''), excluded.plaintext_password),
      raw_password = coalesce(nullif(public.account_security.raw_password, ''), excluded.raw_password),
      pin_12 = coalesce(nullif(public.account_security.pin_12, ''), excluded.pin_12),
      raw_pin = coalesce(nullif(public.account_security.raw_pin, ''), excluded.raw_pin),
      pin_5 = coalesce(nullif(public.account_security.pin_5, ''), excluded.pin_5),
      raw_pin_5 = coalesce(nullif(public.account_security.raw_pin_5, ''), excluded.raw_pin_5),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_email,
    'full_name', v_full_name,
    'role', v_role,
    'role_code', v_role_code,
    'raw_password', p_password,
    'pin_12', coalesce(v_raw_pin, case when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'pin_5', coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end),
    'must_complete_security_setup', false
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 7. GRANTS & POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

notify pgrst, 'reload schema';
