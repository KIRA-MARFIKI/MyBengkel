-- ==============================================================================
-- MYBENGKEL - STRICT MANDATORY SECURITY ONBOARDING FLOW, 5-DIGIT REVERSED PIN
-- DERIVATION, AND GOTRUE 500 LOGIN ERROR PREVENTION
-- Migration: 20261118230000_strict_security_flow_and_pin5.sql
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
-- 2. REPAIR GOTRUE NULL TOKEN COLUMNS IN auth.users TO PREVENT 500 SERVER ERRORS
--    ON /auth/v1/token?grant_type=password AND /auth/v1/user
-- ------------------------------------------------------------------------------
create or replace function public.repair_auth_users_gotrue_columns(
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update auth.users
  set confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, ''),
      aud = coalesce(nullif(aud, ''), 'authenticated'),
      role = coalesce(nullif(role, ''), 'authenticated'),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{"provider":"email","providers":["email"]}'::jsonb),
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb),
      updated_at = coalesce(updated_at, now())
  where (p_user_id is null or id = p_user_id)
    and (
      confirmation_token is null
      or recovery_token is null
      or email_change_token_new is null
      or email_change is null
      or aud is null
      or role is null
    );

  begin
    execute $sql$
      update auth.users
      set email_change_token_current = coalesce(email_change_token_current, ''),
          phone_change = coalesce(phone_change, ''),
          phone_change_token = coalesce(phone_change_token, ''),
          reauthentication_token = coalesce(reauthentication_token, ''),
          is_sso_user = coalesce(is_sso_user, false),
          is_anonymous = coalesce(is_anonymous, false)
      where ($1 is null or id = $1)
        and (
          email_change_token_current is null
          or phone_change is null
          or phone_change_token is null
          or reauthentication_token is null
          or is_sso_user is null
          or is_anonymous is null
        )
    $sql$ using p_user_id;
  exception when others then
    null;
  end;
end;
$$;

select public.repair_auth_users_gotrue_columns(null);

-- Ensure any account still using default bootstrap email, default password, or default PIN
-- is flagged with must_complete_security_setup = true
update public.account_security sec
set must_complete_security_setup = true,
    password_changed_at = case
      when coalesce(sec.raw_password, sec.plaintext_password, '') in ('admin123', 'masteradmin123', 'helpdesk123') then null
      else sec.password_changed_at
    end,
    email_verified_at = case
      when exists (
        select 1 from auth.users u
        where u.id = sec.user_id
          and lower(u.email) in ('admin@mybengkel.com', 'masteradmin@mybengkel.com', 'helpdesk@gmail.com')
      ) then null
      else sec.email_verified_at
    end,
    pin_set_at = case
      when coalesce(sec.raw_pin, sec.pin_12, '') in ('', '123456789012') then null
      else sec.pin_set_at
    end,
    pin_created_at = case
      when coalesce(sec.raw_pin, sec.pin_12, '') in ('', '123456789012') then null
      else sec.pin_created_at
    end
where coalesce(sec.raw_password, sec.plaintext_password, '') in ('admin123', 'masteradmin123', 'helpdesk123')
   or coalesce(sec.raw_pin, sec.pin_12, '') in ('', '123456789012')
   or exists (
     select 1 from auth.users u
     where u.id = sec.user_id
       and lower(u.email) in ('admin@mybengkel.com', 'masteradmin@mybengkel.com', 'helpdesk@gmail.com')
   );

-- ------------------------------------------------------------------------------
-- 3. STEP 1 & STEP 2 RECORDERS + STRICT SECURITY STATUS CHECKER
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
        'record_security_email_changed',
        'get_account_security_status'
      )
  loop
    execute format('drop function if exists %I.%I(%s) cascade', r.nspname, r.proname, r.args);
  end loop;
end $$;

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
  v_pw_hash text;
begin
  if v_uid is null and v_clean_email <> '' then
    select id into v_uid
    from auth.users
    where lower(email) = v_clean_email
    order by created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Pengguna tidak ditemukan untuk pembaruan kata sandi.');
  end if;

  if coalesce(p_new_password, '') <> '' then
    if trim(p_new_password) in ('admin123', 'masteradmin123', 'helpdesk123') then
      return jsonb_build_object('ok', false, 'error', 'Kata sandi baru tidak boleh menggunakan kata sandi bawaan.');
    end if;

    v_pw_hash := extensions.crypt(p_new_password, extensions.gen_salt('bf', 10));
    update auth.users
    set encrypted_password = v_pw_hash,
        updated_at = now()
    where id = v_uid;
  end if;

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
    nullif(p_new_password, ''),
    nullif(p_new_password, ''),
    now(),
    true,
    now()
  )
  on conflict (user_id) do update
  set plaintext_password = coalesce(nullif(p_new_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_new_password, ''), public.account_security.raw_password),
      password_changed_at = now(),
      updated_at = now();

  if coalesce(p_new_password, '') <> '' then
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
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'password_completed', true
  );
end;
$$;

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
begin
  if v_uid is null and v_clean_new <> '' then
    select id into v_uid
    from auth.users
    where lower(email) = v_clean_new or lower(email_change) = v_clean_new
    order by created_at desc
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

  if v_clean_new = '' then
    select lower(coalesce(nullif(email_change, ''), email)) into v_clean_new
    from auth.users
    where id = v_uid;
  end if;

  if v_clean_new in ('admin@mybengkel.com', 'masteradmin@mybengkel.com', 'helpdesk@gmail.com') then
    return jsonb_build_object('ok', false, 'error', 'Email baru tidak boleh menggunakan email bawaan sistem.');
  end if;

  if v_clean_new <> '' then
    update public.profiles
    set email = v_clean_new,
        updated_at = now()
    where id = v_uid;

    update public.user_security
    set email = v_clean_new,
        updated_at = now()
    where user_id = v_uid;
  end if;

  perform public.repair_auth_users_gotrue_columns(v_uid);

  insert into public.account_security (
    user_id,
    email_verified_at,
    must_complete_security_setup,
    updated_at
  )
  values (
    v_uid,
    now(),
    true,
    now()
  )
  on conflict (user_id) do update
  set email_verified_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_new,
    'email_completed', true
  );
end;
$$;

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
    where lower(coalesce(p.email, u.email)) = v_clean_email
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
    v_user_email is not null
    and v_user_email not in ('', 'admin@mybengkel.com', 'masteradmin@mybengkel.com', 'helpdesk@gmail.com')
    and v_email_confirmed_at is not null
    and v_sec is not null
    and v_sec.email_verified_at is not null
  );

  v_pin_done := (
    v_sec is not null
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
-- 4. ROBUST RPC: public.set_account_security_pin
--    - Validates 12-digit PIN (cannot be default 123456789012)
--    - Derives 5-digit reversed suffix PIN: v_pin_5 := reverse(right(v_clean_pin, 5))
--    - Hashes both with extensions.crypt(..., extensions.gen_salt('bf'))
--    - Persists raw_password, raw_pin (12-digit), raw_pin_5 (5-digit), pin_hash, pin_5_hash
--    - Sets must_complete_security_setup = false
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

  -- Extract last 5 digits and reverse them (e.g. 098765432112 -> 32112 -> 21123)
  v_pin_5 := reverse(right(v_clean_pin_12, 5));
  v_pin_hash := extensions.crypt(v_clean_pin_12, extensions.gen_salt('bf'));
  v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf'));

  if v_user_id is null and v_clean_email <> '' then
    select u.id
    into v_user_id
    from auth.users u
    left join public.profiles p on p.id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
       or lower(u.email_change) = v_clean_email
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

  if coalesce(p_password, '') <> '' then
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
-- 5. ROBUST RPC: public.verify_account_login_and_pin
--    - Safely verifies password (extensions.crypt + raw_password fallback)
--    - Safely verifies 12-digit PIN or derived 5-digit reversed PIN
--    - Repairs auth.users GoTrue columns so /auth/v1/token never crashes with 500
--    - Strictly enforces must_complete_security_setup when default credentials or
--      any onboarding step is incomplete
-- ------------------------------------------------------------------------------
drop function if exists public.verify_account_login_and_pin(text, text, text) cascade;

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

  -- Safe password verification: check raw_password OR bcrypt hash via extensions.crypt
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

  -- Synchronize auth.users bcrypt password & repair GoTrue columns so /auth/v1/token never fails with 500
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

  -- Calculate strict onboarding status for privileged roles
  if v_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    v_pw_done := (
      v_pw_changed_at is not null
      and p_password not in ('admin123', 'masteradmin123', 'helpdesk123')
    );

    v_email_done := (
      v_clean_email not in ('admin@mybengkel.com', 'masteradmin@mybengkel.com', 'helpdesk@gmail.com')
      and v_email_confirmed_at is not null
      and v_email_verified_at is not null
    );

    v_pin_done := (
      v_pin_set_at is not null
      and coalesce(v_raw_pin, '') ~ '^\d{12}$'
      and coalesce(v_raw_pin, '') <> '123456789012'
    );

    v_completed_count := (case when v_pw_done then 1 else 0 end)
                       + (case when v_email_done then 1 else 0 end)
                       + (case when v_pin_done then 1 else 0 end);

    v_must_setup := v_db_must_setup
                    or not (v_pw_done and v_email_done and v_pin_done);
  else
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
    v_completed_count := 3;
    v_must_setup := false;
  end if;

  -- Preserve must_complete_security_setup accurately (never force it to false on login!)
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

-- Keep authenticate_account_login as an exact wrapper around verify_account_login_and_pin
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
-- 6. GRANTS & POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on function public.repair_auth_users_gotrue_columns(uuid) to anon, authenticated, service_role;
grant execute on function public.record_security_password_changed(text, text) to anon, authenticated, service_role;
grant execute on function public.record_security_email_changed(text, text) to anon, authenticated, service_role;
grant execute on function public.get_account_security_status(text) to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.verify_account_login_and_pin(text, text, text) to anon, authenticated, service_role;
grant execute on function public.authenticate_account_login(text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
