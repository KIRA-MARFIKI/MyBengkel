-- ==============================================================================
-- MYBENGKEL - STRICT SEQUENTIAL SECURITY ONBOARDING (PASSWORD -> REAL EMAIL
-- VERIFICATION LOCK -> 12-DIGIT PIN + AUTO 5-DIGIT REVERSED PIN)
-- Migration: 20261119120000_strict_sequential_onboarding_and_pin5.sql
--
-- Default Accounts Supported & Enforced:
--   1. Admin:           admin@mubengkel.com (and admin@mybengkel.com) / admin123 / 123456789012
--   2. Master Admin:    masteradmin@mybengkel.com / masteradmin123 / 123456789012
--   3. Master Helpdesk: helpdesk@mybengkel.com (and helpdesk@gmail.com) / helpdesk123 / 123456789012
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. ENSURE ALL REQUIRED COLUMNS ON profiles, user_roles, account_security, user_security
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
  add column if not exists pending_email text,
  add column if not exists email_verification_sent_at timestamptz,
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
  add column if not exists must_complete_security_setup boolean not null default true,
  add column if not exists updated_at timestamptz default now();

alter table public.account_security
  alter column must_complete_security_setup set default true;

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
-- 2. HELPER: CHECK IF EMAIL IS A DEFAULT BOOTSTRAP EMAIL
-- ------------------------------------------------------------------------------
create or replace function public.is_default_bootstrap_email(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_email, ''))) in (
    'admin@mubengkel.com',
    'admin@mybengkel.com',
    'admin@mybengkel.id',
    'masteradmin@mybengkel.com',
    'masteradmin@mubengkel.com',
    'helpdesk@mybengkel.com',
    'helpdesk@mubengkel.com',
    'helpdesk@gmail.com',
    'mybenngkeladmin@mybengkel.com',
    'masteradminmybengkel@mybengkel.com',
    'helpdeskmybengkel@mybengkel.com'
  );
$$;

-- ------------------------------------------------------------------------------
-- 3. SEED & ENFORCE DEFAULT BOOTSTRAP ACCOUNTS WITH must_complete_security_setup = true
-- ------------------------------------------------------------------------------
create or replace function public.seed_default_bootstrap_account(
  p_email text,
  p_password text,
  p_pin_12 text,
  p_role text,
  p_full_name text,
  p_role_code text
)
returns void
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_clean_email text := lower(trim(p_email));
  v_pin_5 text := reverse(right(p_pin_12, 5));
  v_pw_hash text := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  v_pin_hash text := extensions.crypt(p_pin_12, extensions.gen_salt('bf'));
  v_pin_5_hash text := extensions.crypt(v_pin_5, extensions.gen_salt('bf'));
  v_uid uuid;
begin
  select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;

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
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change,
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
      v_pw_hash,
      now(),
      '',
      '',
      '',
      '',
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', p_full_name, 'onboarding_role', p_role),
      now(),
      now()
    );
  end if;

  perform public.repair_auth_users_gotrue_columns(v_uid);
  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  insert into public.profiles (id, email, full_name, role_code, created_at, updated_at)
  values (v_uid, v_clean_email, p_full_name, p_role_code, now(), now())
  on conflict (id) do update
  set email = coalesce(nullif(public.profiles.email, ''), excluded.email),
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      role_code = coalesce(nullif(public.profiles.role_code, ''), excluded.role_code),
      updated_at = now();

  if not exists (select 1 from public.user_roles where user_id = v_uid) then
    insert into public.user_roles (user_id, role, role_code, assigned_at)
    values (v_uid, p_role, p_role_code, now());
  end if;

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
    pin_set_at,
    pin_created_at,
    must_complete_security_setup,
    updated_at
  )
  values (
    v_uid,
    p_role_code,
    p_password,
    p_password,
    p_pin_12,
    p_pin_12,
    v_pin_5,
    v_pin_5,
    v_pin_hash,
    v_pin_5_hash,
    null,
    null,
    null,
    null,
    true,
    now()
  )
  on conflict (user_id) do update
  set must_complete_security_setup = true,
      password_changed_at = case
        when coalesce(public.account_security.raw_password, public.account_security.plaintext_password, '') in ('admin123', 'masteradmin123', 'helpdesk123') then null
        else public.account_security.password_changed_at
      end,
      email_verified_at = case
        when public.is_default_bootstrap_email(v_clean_email) then null
        else public.account_security.email_verified_at
      end,
      pin_set_at = case
        when coalesce(public.account_security.raw_pin, public.account_security.pin_12, '') in ('', '123456789012') then null
        else public.account_security.pin_set_at
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
    p_password,
    p_password,
    p_pin_12,
    p_pin_12,
    v_pin_5,
    v_pin_5,
    v_pin_hash,
    v_pin_5_hash,
    now()
  )
  on conflict (user_id) do nothing;
end;
$$;

do $$
begin
  perform public.seed_default_bootstrap_account('admin@mubengkel.com', 'admin123', '123456789012', 'admin', 'Admin MyBengkel', 'AD-001');
  perform public.seed_default_bootstrap_account('admin@mybengkel.com', 'admin123', '123456789012', 'admin', 'Admin MyBengkel', 'AD-001');
  perform public.seed_default_bootstrap_account('masteradmin@mybengkel.com', 'masteradmin123', '123456789012', 'master_admin', 'Master Gudang MyBengkel', 'MG-001');
  perform public.seed_default_bootstrap_account('helpdesk@mybengkel.com', 'helpdesk123', '123456789012', 'master_helpdesk', 'Master Helpdesk MyBengkel', 'HD-001');
  perform public.seed_default_bootstrap_account('helpdesk@gmail.com', 'helpdesk123', '123456789012', 'master_helpdesk', 'Master Helpdesk MyBengkel', 'HD-001');
  perform public.repair_auth_users_gotrue_columns(null);
end $$;

-- ------------------------------------------------------------------------------
-- 4. STEP 1, STEP 2 PENDING, STEP 2 CONFIRMED, AND STRICT STATUS RPCs
-- ------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'record_security_password_changed',
        'record_security_email_pending',
        'record_security_email_changed',
        'get_account_security_status'
      )
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end $$;

-- STEP 1: Save new non-default password and unlock Step 2
create or replace function public.record_security_password_changed(
  p_new_password text default null,
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_prev_pw text;
  v_pw_hash text;
begin
  if v_uid is null and v_clean_email <> '' then
    select u.id into v_uid
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
    order by u.created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Pengguna tidak ditemukan untuk pembaruan kata sandi.');
  end if;

  if coalesce(trim(p_new_password), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Kata sandi baru wajib diisi.');
  end if;

  if trim(p_new_password) in ('admin123', 'masteradmin123', 'helpdesk123') then
    return jsonb_build_object('ok', false, 'error', 'Kata sandi baru tidak boleh sama dengan kata sandi bawaan sistem.');
  end if;

  select coalesce(raw_password, plaintext_password) into v_prev_pw
  from public.account_security
  where user_id = v_uid;

  if v_prev_pw is not null and v_prev_pw = p_new_password then
    return jsonb_build_object('ok', false, 'error', 'Kata sandi baru harus berbeda dari kata sandi sebelumnya.');
  end if;

  v_pw_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));
  update auth.users
  set encrypted_password = v_pw_hash,
      updated_at = now()
  where id = v_uid;

  perform public.repair_auth_users_gotrue_columns(v_uid);

  insert into public.account_security (
    user_id,
    plaintext_password,
    raw_password,
    password_changed_at,
    must_complete_security_setup,
    updated_at
  )
  values (
    v_uid,
    p_new_password,
    p_new_password,
    now(),
    true,
    now()
  )
  on conflict (user_id) do update
  set plaintext_password = excluded.plaintext_password,
      raw_password = excluded.raw_password,
      password_changed_at = now(),
      must_complete_security_setup = true,
      updated_at = now();

  insert into public.user_security (
    user_id,
    email,
    plaintext_password,
    raw_password,
    updated_at
  )
  values (
    v_uid,
    coalesce(nullif(v_clean_email, ''), (select lower(email) from auth.users where id = v_uid)),
    p_new_password,
    p_new_password,
    now()
  )
  on conflict (user_id) do update
  set plaintext_password = excluded.plaintext_password,
      raw_password = excluded.raw_password,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'password_completed', true
  );
end;
$$;

-- STEP 2A: Record pending email verification (locks Step 3 until email_verified_at is confirmed)
create or replace function public.record_security_email_pending(
  p_pending_email text,
  p_current_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_pending text := lower(trim(coalesce(p_pending_email, '')));
  v_clean_current text := lower(trim(coalesce(p_current_email, '')));
  v_pw_changed_at timestamptz;
begin
  if v_clean_pending = '' then
    return jsonb_build_object('ok', false, 'error', 'Email baru wajib diisi.');
  end if;

  if public.is_default_bootstrap_email(v_clean_pending) then
    return jsonb_build_object('ok', false, 'error', 'Email baru tidak boleh menggunakan email bawaan sistem.');
  end if;

  if v_uid is null and v_clean_current <> '' then
    select u.id into v_uid
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_current
    order by u.created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi pengguna tidak ditemukan.');
  end if;

  select password_changed_at into v_pw_changed_at
  from public.account_security
  where user_id = v_uid;

  if v_pw_changed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Wajib menyelesaikan Langkah 1 (Kata Sandi Baru) terlebih dahulu.');
  end if;

  update public.account_security
  set pending_email = v_clean_pending,
      email_verification_sent_at = now(),
      email_verified_at = null,
      must_complete_security_setup = true,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'pending_email', v_clean_pending,
    'email_completed', false
  );
end;
$$;

-- STEP 2B: Confirm email verification after user clicks the real verification link
create or replace function public.record_security_email_changed(
  p_new_email text default null,
  p_old_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_new text := lower(trim(coalesce(p_new_email, '')));
  v_clean_old text := lower(trim(coalesce(p_old_email, '')));
  v_pw_changed_at timestamptz;
begin
  if v_uid is null and v_clean_new <> '' then
    select u.id into v_uid
    from auth.users u
    left join public.account_security sec on sec.user_id = u.id
    where lower(u.email) = v_clean_new
       or lower(u.email_change) = v_clean_new
       or lower(sec.pending_email) = v_clean_new
    order by u.updated_at desc nulls last, u.created_at desc
    limit 1;
  end if;

  if v_uid is null and v_clean_old <> '' then
    select id into v_uid
    from auth.users
    where lower(email) = v_clean_old
    order by created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi pengguna tidak ditemukan untuk verifikasi email.');
  end if;

  select password_changed_at, coalesce(nullif(v_clean_new, ''), lower(pending_email))
  into v_pw_changed_at, v_clean_new
  from public.account_security
  where user_id = v_uid;

  if v_pw_changed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Langkah 1 (Kata Sandi Baru) belum diselesaikan.');
  end if;

  if v_clean_new = '' then
    select lower(coalesce(nullif(email_change, ''), email)) into v_clean_new
    from auth.users
    where id = v_uid;
  end if;

  if public.is_default_bootstrap_email(v_clean_new) then
    return jsonb_build_object('ok', false, 'error', 'Email baru tidak boleh menggunakan email bawaan sistem.');
  end if;

  update auth.users
  set email = v_clean_new,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      email_change = '',
      email_change_token_new = '',
      updated_at = now()
  where id = v_uid;

  perform public.repair_auth_users_gotrue_columns(v_uid);
  perform public.ensure_auth_email_identity(v_uid, v_clean_new);

  update public.profiles
  set email = v_clean_new,
      updated_at = now()
  where id = v_uid;

  update public.user_security
  set email = v_clean_new,
      updated_at = now()
  where user_id = v_uid;

  update public.account_security
  set pending_email = null,
      email_verified_at = now(),
      must_complete_security_setup = true,
      updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_new,
    'email_completed', true
  );
end;
$$;

-- STRICT STATUS CHECKER
create or replace function public.get_account_security_status(
  p_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_user_email text;
  v_email_confirmed_at timestamptz;
  v_role text;
  v_sec record;
  v_pw_done boolean := false;
  v_email_done boolean := false;
  v_pin_done boolean := false;
  v_must_setup boolean := true;
  v_count int := 0;
begin
  if v_uid is null and v_clean_email <> '' then
    select u.id into v_uid
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.account_security sec on sec.user_id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
       or lower(sec.pending_email) = v_clean_email
    order by (u.email_confirmed_at is not null) desc, u.created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'must_complete_security_setup', true,
      'password_completed', false,
      'email_completed', false,
      'pin_completed', false,
      'completed_count', 0,
      'total_steps', 3
    );
  end if;

  select lower(coalesce(p.email, u.email)), u.email_confirmed_at, coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer')
  into v_user_email, v_email_confirmed_at, v_role
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  where u.id = v_uid;

  if v_role not in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    return jsonb_build_object(
      'ok', true,
      'user_id', v_uid,
      'email', v_user_email,
      'role', v_role,
      'must_complete_security_setup', false,
      'password_completed', true,
      'email_completed', true,
      'pin_completed', true,
      'completed_count', 3,
      'total_steps', 3
    );
  end if;

  select * into v_sec from public.account_security where user_id = v_uid;

  v_pw_done := (
    v_sec is not null
    and v_sec.password_changed_at is not null
    and coalesce(v_sec.raw_password, v_sec.plaintext_password, '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123')
  );

  v_email_done := (
    v_pw_done
    and v_user_email is not null
    and not public.is_default_bootstrap_email(v_user_email)
    and v_email_confirmed_at is not null
    and v_sec is not null
    and v_sec.email_verified_at is not null
  );

  v_pin_done := (
    v_pw_done
    and v_email_done
    and v_sec is not null
    and v_sec.pin_set_at is not null
    and coalesce(v_sec.raw_pin, v_sec.pin_12, '') ~ '^\d{12}$'
    and coalesce(v_sec.raw_pin, v_sec.pin_12, '') <> '123456789012'
  );

  v_count := (case when v_pw_done then 1 else 0 end)
           + (case when v_email_done then 1 else 0 end)
           + (case when v_pin_done then 1 else 0 end);

  v_must_setup := coalesce(v_sec.must_complete_security_setup, true)
                  or not (v_pw_done and v_email_done and v_pin_done);

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_user_email,
    'pending_email', v_sec.pending_email,
    'role', v_role,
    'must_complete_security_setup', v_must_setup,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_count,
    'total_steps', 3
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. STEP 3 RPC: public.set_account_security_pin
--    - Requires Step 1 (password_changed_at) and Step 2 (email_verified_at) first!
--    - Validates 12-digit PIN (different from 123456789012)
--    - Derives 5-digit reversed PIN: reverse(right(v_clean_pin_12, 5))
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
  p_role text default null,
  p_email text default null,
  p_password text default null,
  p_pin text default null
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
  v_clean_pin_12 text := regexp_replace(coalesce(p_new_pin, p_pin, ''), '\D', '', 'g');
  v_pin_5 text;
  v_user record;
  v_sec record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_pw_hash text;
begin
  if v_clean_pin_12 !~ '^\d{12}$' then
    return jsonb_build_object(
      'ok', false,
      'error', 'PIN wajib terdiri dari tepat 12 digit angka.'
    );
  end if;

  if v_clean_pin_12 = '123456789012' then
    return jsonb_build_object(
      'ok', false,
      'error', 'PIN baru tidak boleh menggunakan PIN bawaan sistem (123456789012).'
    );
  end if;

  -- Extract last 5 digits and reverse them (e.g. 123456789012 -> 21098, 098765432112 -> 21123)
  v_pin_5 := reverse(right(v_clean_pin_12, 5));
  v_pin_hash := extensions.crypt(v_clean_pin_12, extensions.gen_salt('bf'));
  v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf'));

  if v_user_id is null and v_clean_email <> '' then
    select u.id
    into v_user_id
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.account_security sec on sec.user_id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
       or lower(u.email_change) = v_clean_email
       or lower(sec.pending_email) = v_clean_email
    order by (u.email_confirmed_at is not null) desc, u.created_at desc
    limit 1;
  end if;

  if v_user_id is null and v_clean_role in ('admin', 'master_admin', 'master_helpdesk') then
    select u.id
    into v_user_id
    from auth.users u
    left join public.user_roles ur on ur.user_id = u.id
    where coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role') = v_clean_role
    order by u.updated_at desc nulls last, u.created_at desc
    limit 1;
  end if;

  if v_user_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Data pengguna tidak ditemukan di database. Silakan login kembali.'
    );
  end if;

  select id, email, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_user_id;

  select * into v_sec from public.account_security where user_id = v_user_id;

  v_email := coalesce(nullif(v_clean_email, ''), lower(trim(v_user.email)));
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

  -- Strict sequential precondition check in PostgreSQL for privileged accounts
  if v_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    if public.is_default_bootstrap_email(v_email) then
      return jsonb_build_object(
        'ok', false,
        'error', 'Langkah 2 (Ganti & Verifikasi Email Baru) wajib diselesaikan sebelum menyimpan PIN.'
      );
    end if;

    if v_sec is not null and v_sec.password_changed_at is null and coalesce(p_password, '') in ('', 'admin123', 'masteradmin123', 'helpdesk123') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Langkah 1 (Ganti Kata Sandi Baru) wajib diselesaikan sebelum menyimpan PIN.'
      );
    end if;
  end if;

  if coalesce(p_password, '') <> '' then
    if trim(p_password) in ('admin123', 'masteradmin123', 'helpdesk123') then
      return jsonb_build_object(
        'ok', false,
        'error', 'Kata sandi tidak boleh menggunakan kata sandi bawaan sistem.'
      );
    end if;
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  end if;

  update auth.users
  set email = coalesce(nullif(v_email, ''), email),
      encrypted_password = coalesce(v_pw_hash, encrypted_password),
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      email_change = '',
      email_change_token_new = '',
      confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      updated_at = now()
  where id = v_user_id;

  perform public.repair_auth_users_gotrue_columns(v_user_id);
  perform public.ensure_auth_email_identity(v_user_id, v_email);

  if v_email is not null and v_email <> '' then
    update public.profiles
    set email = email || '.old.' || substr(id::text, 1, 8),
        updated_at = now()
    where lower(email) = lower(v_email)
      and id <> v_user_id;
  end if;

  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    v_user_id,
    v_email,
    coalesce(nullif(trim(v_full_name), ''), 'Admin MyBengkel'),
    now(),
    now()
  )
  on conflict (id) do update
  set email = coalesce(nullif(excluded.email, ''), public.profiles.email),
      full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name),
      updated_at = now();

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
    user_id,
    email,
    pin_hash,
    pin_5_hash,
    pin_12,
    raw_pin,
    pin_5,
    raw_pin_5,
    plaintext_password,
    raw_password,
    updated_at
  )
  values (
    v_user_id,
    v_email,
    v_pin_hash,
    v_pin_5_hash,
    v_clean_pin_12,
    v_clean_pin_12,
    v_pin_5,
    v_pin_5,
    nullif(p_password, ''),
    nullif(p_password, ''),
    now()
  )
  on conflict (user_id) do update
  set email = coalesce(nullif(excluded.email, ''), public.user_security.email),
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
    user_id,
    role_code,
    plaintext_password,
    raw_password,
    pending_email,
    pin_12,
    raw_pin,
    pin_5,
    raw_pin_5,
    pin_hash,
    pin_5_hash,
    pin_created_at,
    pin_set_at,
    password_changed_at,
    email_verified_at,
    must_complete_security_setup,
    security_setup_completed_at,
    updated_at
  )
  values (
    v_user_id,
    v_role_code,
    nullif(p_password, ''),
    nullif(p_password, ''),
    null,
    v_clean_pin_12,
    v_clean_pin_12,
    v_pin_5,
    v_pin_5,
    v_pin_hash,
    v_pin_5_hash,
    now(),
    now(),
    now(),
    now(),
    false,
    now(),
    now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pending_email = null,
      pin_12 = excluded.pin_12,
      raw_pin = excluded.raw_pin,
      pin_5 = excluded.pin_5,
      raw_pin_5 = excluded.raw_pin_5,
      pin_hash = excluded.pin_hash,
      pin_5_hash = excluded.pin_5_hash,
      pin_created_at = now(),
      pin_set_at = now(),
      password_changed_at = coalesce(public.account_security.password_changed_at, now()),
      email_verified_at = coalesce(public.account_security.email_verified_at, now()),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'role', v_role,
    'role_code', v_role_code,
    'pin_12', v_clean_pin_12,
    'raw_pin', v_clean_pin_12,
    'pin_5', v_pin_5,
    'raw_pin_5', v_pin_5,
    'raw_password', (select coalesce(raw_password, plaintext_password) from public.account_security where user_id = v_user_id limit 1),
    'must_complete_security_setup', false,
    'password_completed', true,
    'email_completed', true,
    'pin_completed', true,
    'completed_count', 3,
    'total_steps', 3
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. LOGIN RPC: public.verify_account_login_and_pin & public.authenticate_account_login
-- ------------------------------------------------------------------------------
create or replace function public.verify_account_login_and_pin(
  p_email text,
  p_password text,
  p_pin text default null
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
  v_email_confirmed_at timestamptz;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_raw_pw text;
  v_raw_pin text;
  v_raw_pin_5 text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_expected_pin_5 text;
  v_db_must_setup boolean;
  v_pw_changed_at timestamptz;
  v_email_verified_at timestamptz;
  v_pin_set_at timestamptz;
  v_pw_ok boolean := false;
  v_pin_ok boolean := false;
  v_pw_done boolean := false;
  v_email_done boolean := false;
  v_pin_done boolean := false;
  v_must_setup boolean := true;
  v_completed_count int := 0;
begin
  if v_clean_email = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Email dan kata sandi wajib diisi.');
  end if;

  select
    u.id,
    u.encrypted_password,
    u.email_confirmed_at,
    coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
    coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
    coalesce(ur.role_code, p.role_code, sec.role_code),
    coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password),
    coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12),
    coalesce(sec.raw_pin_5, sec.pin_5, us.raw_pin_5, us.pin_5),
    coalesce(sec.pin_hash, us.pin_hash),
    coalesce(sec.pin_5_hash, us.pin_5_hash),
    coalesce(sec.must_complete_security_setup, true),
    sec.password_changed_at,
    sec.email_verified_at,
    sec.pin_set_at
  into
    v_uid,
    v_auth_pw,
    v_email_confirmed_at,
    v_full_name,
    v_role,
    v_role_code,
    v_raw_pw,
    v_raw_pin,
    v_raw_pin_5,
    v_pin_hash,
    v_pin_5_hash,
    v_db_must_setup,
    v_pw_changed_at,
    v_email_verified_at,
    v_pin_set_at
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

  begin
    if (v_raw_pw is not null and v_raw_pw <> '' and v_raw_pw = p_password) then
      v_pw_ok := true;
    elsif (v_auth_pw is not null and v_auth_pw <> '' and extensions.crypt(p_password, v_auth_pw) = v_auth_pw) then
      v_pw_ok := true;
    end if;
  exception when others then
    v_pw_ok := (v_raw_pw is not null and v_raw_pw <> '' and v_raw_pw = p_password);
  end;

  v_expected_pin_5 := case
    when v_raw_pin is not null and length(v_raw_pin) >= 5 then reverse(right(v_raw_pin, 5))
    else v_raw_pin_5
  end;

  if v_clean_pin = '' then
    v_pin_ok := true;
  else
    begin
      if (v_raw_pin is not null and v_raw_pin <> '' and v_clean_pin = v_raw_pin)
         or (v_raw_pin_5 is not null and v_raw_pin_5 <> '' and v_clean_pin = v_raw_pin_5)
         or (v_expected_pin_5 is not null and v_expected_pin_5 <> '' and v_clean_pin = v_expected_pin_5)
         or (v_pin_hash is not null and v_pin_hash <> '' and extensions.crypt(v_clean_pin, v_pin_hash) = v_pin_hash)
         or (v_pin_5_hash is not null and v_pin_5_hash <> '' and extensions.crypt(v_clean_pin, v_pin_5_hash) = v_pin_5_hash) then
        v_pin_ok := true;
      end if;
    exception when others then
      v_pin_ok := (
        (v_raw_pin is not null and v_raw_pin <> '' and v_clean_pin = v_raw_pin)
        or (v_raw_pin_5 is not null and v_raw_pin_5 <> '' and v_clean_pin = v_raw_pin_5)
        or (v_expected_pin_5 is not null and v_expected_pin_5 <> '' and v_clean_pin = v_expected_pin_5)
      );
    end;
  end if;

  if not v_pw_ok or not v_pin_ok then
    return jsonb_build_object('ok', false, 'error', 'Email, kata sandi, atau PIN tidak sesuai.');
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = v_uid
    and (
      encrypted_password is null
      or encrypted_password = ''
      or extensions.crypt(p_password, encrypted_password) <> encrypted_password
    );

  perform public.repair_auth_users_gotrue_columns(v_uid);
  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  if v_role_code is null or trim(v_role_code) = '' then
    v_role_code := public.assign_sequential_role_code(v_uid, v_role);
  end if;

  if v_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    v_pw_done := (
      v_pw_changed_at is not null
      and p_password not in ('admin123', 'masteradmin123', 'helpdesk123')
    );

    v_email_done := (
      v_pw_done
      and not public.is_default_bootstrap_email(v_clean_email)
      and v_email_confirmed_at is not null
      and v_email_verified_at is not null
    );

    v_pin_done := (
      v_pw_done
      and v_email_done
      and v_pin_set_at is not null
      and coalesce(v_raw_pin, '') ~ '^\d{12}$'
      and coalesce(v_raw_pin, '') <> '123456789012'
    );

    v_completed_count := (case when v_pw_done then 1 else 0 end)
                       + (case when v_email_done then 1 else 0 end)
                       + (case when v_pin_done then 1 else 0 end);

    v_must_setup := v_db_must_setup
                    or public.is_default_bootstrap_email(v_clean_email)
                    or p_password in ('admin123', 'masteradmin123', 'helpdesk123')
                    or v_clean_pin in ('123456789012', '21098')
                    or not (v_pw_done and v_email_done and v_pin_done);
  else
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
    v_completed_count := 3;
    v_must_setup := false;
  end if;

  insert into public.account_security (
    user_id,
    role_code,
    plaintext_password,
    raw_password,
    pin_12,
    raw_pin,
    pin_5,
    raw_pin_5,
    must_complete_security_setup,
    updated_at
  )
  values (
    v_uid,
    v_role_code,
    p_password,
    p_password,
    coalesce(v_raw_pin, case when length(v_clean_pin) = 12 then v_clean_pin else null end),
    coalesce(v_raw_pin, case when length(v_clean_pin) = 12 then v_clean_pin else null end),
    coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end),
    coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end),
    v_must_setup,
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
      must_complete_security_setup = v_must_setup,
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
    'raw_pin', coalesce(v_raw_pin, case when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'pin_5', coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end),
    'raw_pin_5', coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end),
    'must_complete_security_setup', v_must_setup,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_completed_count,
    'total_steps', 3
  );
end;
$$;

create or replace function public.authenticate_account_login(
  p_email text,
  p_password text,
  p_pin text
)
returns jsonb
language sql
security definer
set search_path = public, extensions, auth
as $$
  select public.verify_account_login_and_pin(p_email, p_password, p_pin);
$$;

-- ------------------------------------------------------------------------------
-- 7. GRANTS & POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on function public.is_default_bootstrap_email(text) to anon, authenticated, service_role;
grant execute on function public.seed_default_bootstrap_account(text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.repair_auth_users_gotrue_columns(uuid) to anon, authenticated, service_role;
grant execute on function public.record_security_password_changed(text, text) to anon, authenticated, service_role;
grant execute on function public.record_security_email_pending(text, text) to anon, authenticated, service_role;
grant execute on function public.record_security_email_changed(text, text) to anon, authenticated, service_role;
grant execute on function public.get_account_security_status(text) to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.verify_account_login_and_pin(text, text, text) to anon, authenticated, service_role;
grant execute on function public.authenticate_account_login(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
