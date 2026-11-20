-- ==============================================================================
-- MYBENGKEL: CUSTOMER PIN CAP (MAX 4 DIGITS, NO 5-DIGIT OPERATIONAL PIN)
-- Preserves strict 12-digit PIN + reversed 5-digit PIN for internal staff roles
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. UPDATE persist_account_credentials_to_db
-- ------------------------------------------------------------------------------
create or replace function public.persist_account_credentials_to_db(
  p_email text,
  p_password text default null,
  p_pin text default null,
  p_role text default 'customer',
  p_full_name text default null,
  p_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_role text := lower(trim(coalesce(p_role, 'customer')));
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_clean_phone text := trim(coalesce(p_phone, ''));
  v_clean_pin text := regexp_replace(coalesce(p_pin, ''), '\D', '', 'g');
  v_pin_5 text := null;
  v_uid uuid;
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text := null;
  v_role_code text;
begin
  if v_clean_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Email wajib diisi.');
  end if;

  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_clean_role = 'customer' and v_clean_pin <> '' and length(v_clean_pin) > 4 then
    return jsonb_build_object('ok', false, 'error', 'PIN konsumen maksimal 4 angka.');
  end if;

  select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;

  if coalesce(p_password, '') <> '' then
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  end if;

  if v_clean_pin <> '' then
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    if v_clean_role <> 'customer' then
      v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
      v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
    else
      v_pin_5 := null;
      v_pin_5_hash := null;
    end if;
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
    set encrypted_password = coalesce(v_pw_hash, encrypted_password),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
            'onboarding_role', v_clean_role
          ),
        updated_at = now()
    where id = v_uid;
  end if;

  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  insert into public.profiles (id, email, full_name, phone, created_at, updated_at)
  values (
    v_uid,
    v_clean_email,
    coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
    nullif(v_clean_phone, ''),
    now(),
    now()
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(excluded.full_name, ''), public.profiles.full_name),
      phone = coalesce(nullif(excluded.phone, ''), public.profiles.phone),
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
    user_id, role_code, plaintext_password, raw_password,
    pin_12, raw_pin, pin_5, raw_pin_5, pin_hash, pin_5_hash,
    must_complete_security_setup, password_changed_at, email_verified_at, pin_created_at, pin_set_at, security_setup_completed_at, updated_at
  )
  values (
    v_uid, v_role_code, nullif(p_password, ''), nullif(p_password, ''),
    nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), v_pin_5, v_pin_5, v_pin_hash, v_pin_5_hash,
    false, now(), now(),
    case when v_clean_pin <> '' then now() else null end,
    case when v_clean_pin <> '' then now() else null end,
    now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.account_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.account_security.raw_pin),
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.raw_pin_5) end,
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.account_security.pin_5_hash) end,
      must_complete_security_setup = false,
      password_changed_at = coalesce(
        case when coalesce(p_password, '') <> '' then now() else null end,
        public.account_security.password_changed_at
      ),
      pin_created_at = coalesce(
        case when v_clean_pin <> '' then now() else null end,
        public.account_security.pin_created_at
      ),
      pin_set_at = coalesce(
        case when v_clean_pin <> '' then now() else null end,
        public.account_security.pin_set_at
      ),
      updated_at = now();

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, raw_pin, pin_5, raw_pin_5, plaintext_password, raw_password, updated_at
  )
  values (
    v_uid, v_clean_email,
    coalesce(v_pin_hash, extensions.crypt('123456789012', extensions.gen_salt('bf', 8))),
    v_pin_5_hash,
    nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), v_pin_5, v_pin_5,
    nullif(p_password, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
      pin_hash = coalesce(v_pin_hash, public.user_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.user_security.pin_5_hash) end,
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.user_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.user_security.raw_pin),
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.raw_pin_5) end,
      plaintext_password = coalesce(nullif(p_password, ''), public.user_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.user_security.raw_password),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_clean_email,
    'full_name', coalesce(nullif(v_clean_name, ''), split_part(v_clean_email, '@', 1)),
    'phone', nullif(v_clean_phone, ''),
    'role', v_clean_role,
    'role_code', v_role_code,
    'raw_pin_5', v_pin_5,
    'pin_5', v_pin_5
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. UPDATE helpdesk_upsert_account & helpdesk_update_account_credentials
-- ------------------------------------------------------------------------------
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
  v_clean_role text := lower(trim(coalesce(p_role, '')));
  v_existing_role text;
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_clean_pin text := regexp_replace(coalesce(p_pin_12, ''), '\D', '', 'g');
  v_pin_5 text := null;
  v_role_code text := nullif(trim(coalesce(p_role_code, '')), '');
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text := null;
begin
  if v_clean_email = '' and v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Email atau User ID target wajib diisi.');
  end if;

  if v_uid is null and v_clean_email <> '' then
    select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;
  end if;

  if v_clean_role = '' and v_uid is not null then
    select lower(trim(role)) into v_existing_role from public.user_roles where user_id = v_uid limit 1;
    v_clean_role := coalesce(nullif(v_existing_role, ''), 'customer');
  elsif v_clean_role = '' then
    v_clean_role := 'customer';
  end if;

  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_clean_role = 'customer' and v_clean_pin <> '' and length(v_clean_pin) > 4 then
    return jsonb_build_object('ok', false, 'error', 'PIN konsumen maksimal 4 angka.');
  end if;

  if v_clean_pin <> '' then
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    if v_clean_role <> 'customer' then
      v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
      v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
    else
      v_pin_5 := null;
      v_pin_5_hash := null;
    end if;
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
    v_uid, v_role_code, nullif(p_password, ''), nullif(p_password, ''), nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), v_pin_5, v_pin_5, v_pin_hash, v_pin_5_hash,
    now(), false, now(), now(), now(), now(), now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.account_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.account_security.raw_pin),
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.raw_pin_5) end,
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.account_security.pin_5_hash) end,
      last_modified_by_helpdesk_at = now(),
      must_complete_security_setup = false,
      updated_at = now();

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, raw_pin, pin_5, raw_pin_5, plaintext_password, raw_password, updated_at
  )
  values (
    v_uid, v_clean_email, coalesce(v_pin_hash, extensions.crypt('123456789012', extensions.gen_salt('bf', 8))),
    v_pin_5_hash, nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), v_pin_5, v_pin_5, nullif(p_password, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = coalesce(nullif(excluded.email, ''), public.user_security.email),
      pin_hash = coalesce(v_pin_hash, public.user_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.user_security.pin_5_hash) end,
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.user_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.user_security.raw_pin),
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.raw_pin_5) end,
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

create or replace function public.helpdesk_update_account_credentials(
  p_target_user_id uuid,
  p_new_email text default null,
  p_new_password text default null,
  p_new_pin text default null,
  p_new_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
begin
  if p_target_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Target user_id wajib diisi.');
  end if;

  return public.helpdesk_upsert_account(
    p_target_user_id => p_target_user_id,
    p_email => p_new_email,
    p_full_name => null,
    p_role => p_new_role,
    p_password => p_new_password,
    p_pin_12 => p_new_pin,
    p_role_code => null
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. UPDATE save_onboarding_step_credentials (SUPPORT 1-4 DIGIT CUSTOMER PIN)
-- ------------------------------------------------------------------------------
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
  v_pin_5 text := null;
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text := null;
  v_role_code text;
begin
  if v_clean_role = '' then
    v_clean_role := 'admin';
  end if;
  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_clean_role = 'customer' and v_clean_pin <> '' and length(v_clean_pin) > 4 then
    return jsonb_build_object('ok', false, 'error', 'PIN konsumen maksimal 4 angka.');
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
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    if v_clean_role <> 'customer' then
      v_pin_5 := case when length(v_clean_pin) >= 5 then reverse(right(v_clean_pin, 5)) else v_clean_pin end;
      v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
    else
      v_pin_5 := null;
      v_pin_5_hash := null;
    end if;
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
    v_pin_5,
    v_pin_5,
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
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.account_security.raw_pin_5) end,
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.account_security.pin_5_hash) end,
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
    v_pin_5,
    v_pin_5,
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
      pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.pin_5) end,
      raw_pin_5 = case when v_clean_role = 'customer' then null else coalesce(v_pin_5, public.user_security.raw_pin_5) end,
      pin_hash = coalesce(nullif(v_pin_hash, ''), public.user_security.pin_hash),
      pin_5_hash = case when v_clean_role = 'customer' then null else coalesce(v_pin_5_hash, public.user_security.pin_5_hash) end,
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
-- 4. UPDATE set_account_security_pin (CUSTOMER MAX 4 DIGITS, STAFF STRICT 12)
-- ------------------------------------------------------------------------------
create or replace function public.set_account_security_pin(
  p_new_pin text default null,
  p_role text default null,
  p_email text default null,
  p_password text default null,
  p_pin text default null,
  p_email_verified boolean default null
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
  v_pin_5 text := null;
  v_user record;
  v_sec record;
  v_profile_email text;
  v_user_sec_email text;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_pin_hash text;
  v_pin_5_hash text := null;
  v_pw_hash text;
  v_step2_ok boolean := false;
  v_step1_ok boolean := false;
  v_resolved_raw_pw text;
begin
  if v_user_id is null and v_clean_email <> '' then
    select u.id
    into v_user_id
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.account_security sec on sec.user_id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
       or lower(u.email) = v_clean_email
       or lower(u.email_change) = v_clean_email
       or lower(sec.pending_email) = v_clean_email
    order by (u.email_confirmed_at is not null) desc, u.updated_at desc nulls last, u.created_at desc
    limit 1;
  end if;

  if v_user_id is null and v_clean_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
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
      'success', false,
      'error', 'Data pengguna tidak ditemukan di database. Silakan login kembali.'
    );
  end if;

  select id, email, email_change, email_confirmed_at, raw_user_meta_data
  into v_user
  from auth.users
  where id = v_user_id;

  v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
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

  if v_role = 'customer' then
    if v_clean_pin !~ '^\d{1,4}$' then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'PIN konsumen harus berupa angka maksimal 4 digit.'
      );
    end if;
    v_pin_5 := null;
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf'));
    v_pin_5_hash := null;
  else
    if v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'PIN wajib terdiri dari tepat 12 digit angka.'
      );
    end if;

    if v_clean_pin = '123456789012' then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'PIN baru tidak boleh menggunakan PIN bawaan sistem (123456789012).'
      );
    end if;

    -- Compute 5-digit reversed PIN from last 5 digits of the 12-digit PIN
    v_pin_5 := reverse(right(v_clean_pin, 5));
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf'));
    v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf'));
  end if;

  select * into v_sec from public.account_security where user_id = v_user_id;
  select lower(trim(email)) into v_profile_email from public.profiles where id = v_user_id limit 1;
  select lower(trim(email)) into v_user_sec_email from public.user_security where user_id = v_user_id limit 1;

  if v_clean_email <> '' and not public.is_default_bootstrap_email(v_clean_email) then
    v_email := v_clean_email;
  elsif v_sec is not null and coalesce(trim(v_sec.pending_email), '') <> '' and not public.is_default_bootstrap_email(v_sec.pending_email) then
    v_email := lower(trim(v_sec.pending_email));
  elsif coalesce(trim(v_user.email_change), '') <> '' and not public.is_default_bootstrap_email(v_user.email_change) then
    v_email := lower(trim(v_user.email_change));
  elsif coalesce(v_profile_email, '') <> '' and not public.is_default_bootstrap_email(v_profile_email) then
    v_email := v_profile_email;
  elsif coalesce(v_user_sec_email, '') <> '' and not public.is_default_bootstrap_email(v_user_sec_email) then
    v_email := v_user_sec_email;
  elsif coalesce(trim(v_user.email), '') <> '' and not public.is_default_bootstrap_email(v_user.email) then
    v_email := lower(trim(v_user.email));
  else
    v_email := coalesce(nullif(v_clean_email, ''), lower(trim(v_user.email)));
  end if;

  v_full_name := coalesce(
    nullif(trim((select full_name from public.profiles where id = v_user_id limit 1)), ''),
    nullif(trim(v_user.raw_user_meta_data->>'full_name'), ''),
    'Admin MyBengkel'
  );

  if v_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    v_step1_ok := (
      coalesce(trim(p_password), '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123')
      or (v_sec is not null and v_sec.password_changed_at is not null)
      or (v_sec is not null and coalesce(v_sec.raw_password, v_sec.plaintext_password, '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123'))
    );

    if not v_step1_ok then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'Langkah 1 (Ganti Kata Sandi Baru) wajib diselesaikan sebelum menyimpan PIN.'
      );
    end if;

    v_step2_ok := (
      not public.is_default_bootstrap_email(v_email)
      or (v_sec is not null and v_sec.email_verified_at is not null)
      or coalesce(p_email_verified, false) = true
    );

    if not v_step2_ok then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'Langkah 2 (Ganti & Verifikasi Email Baru) wajib diselesaikan sebelum menyimpan PIN.'
      );
    end if;
  end if;

  if coalesce(p_password, '') <> '' then
    if v_role <> 'customer' and trim(p_password) in ('admin123', 'masteradmin123', 'helpdesk123') then
      return jsonb_build_object(
        'ok', false,
        'success', false,
        'error', 'Kata sandi tidak boleh menggunakan kata sandi bawaan sistem.'
      );
    end if;
    v_pw_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
    update auth.users
    set encrypted_password = v_pw_hash,
        updated_at = now()
    where id = v_user_id;
  end if;

  perform public.sync_verified_user_email(v_user_id, v_email);

  insert into public.profiles (id, email, full_name, created_at, updated_at)
  values (
    v_user_id,
    v_email,
    v_full_name,
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

  v_role_code := public.get_or_assign_role_code(v_user_id, v_role);

  update auth.users
  set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object(
          'onboarding_completed', true,
          'onboarding_role', v_role,
          'role_code', v_role_code
        ),
      updated_at = now()
  where id = v_user_id;

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, raw_pin, pin_5, raw_pin_5, plaintext_password, raw_password, updated_at
  )
  values (
    v_user_id, v_email, v_pin_hash, v_pin_5_hash, v_clean_pin, v_clean_pin, v_pin_5, v_pin_5,
    nullif(p_password, ''), nullif(p_password, ''), now()
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
    user_id, role_code, plaintext_password, raw_password, pending_email,
    pin_12, raw_pin, pin_5, raw_pin_5, pin_hash, pin_5_hash,
    pin_created_at, pin_set_at, password_changed_at, email_verified_at,
    must_complete_security_setup, security_setup_completed_at, updated_at
  )
  values (
    v_user_id, v_role_code, nullif(p_password, ''), nullif(p_password, ''), null,
    v_clean_pin, v_clean_pin, v_pin_5, v_pin_5, v_pin_hash, v_pin_5_hash,
    now(), now(), now(), now(), false, now(), now()
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
      security_setup_completed_at = coalesce(public.account_security.security_setup_completed_at, now()),
      updated_at = now();

  select coalesce(raw_password, plaintext_password) into v_resolved_raw_pw
  from public.account_security
  where user_id = v_user_id
  limit 1;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'user_id', v_user_id,
    'email', v_email,
    'role', v_role,
    'role_code', v_role_code,
    'pin_12', v_clean_pin,
    'raw_pin', v_clean_pin,
    'pin_5', v_pin_5,
    'raw_pin_5', v_pin_5,
    'raw_password', v_resolved_raw_pw,
    'onboarding_completed', true,
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
-- 5. UPDATE verify_account_login_and_pin & helpdesk_get_all_accounts_credentials
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
  v_meta_completed boolean := false;
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
  v_is_bootstrap boolean := false;
begin
  if v_clean_email = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Email dan kata sandi wajib diisi.');
  end if;

  select
    u.id,
    u.encrypted_password,
    u.email_confirmed_at,
    coalesce((u.raw_user_meta_data->>'onboarding_completed')::boolean, false),
    coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', split_part(coalesce(p.email, u.email), '@', 1)),
    coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
    coalesce(ur.role_code, p.role_code, sec.role_code, u.raw_user_meta_data->>'role_code'),
    coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password),
    coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12),
    coalesce(sec.raw_pin_5, sec.pin_5, us.raw_pin_5, us.pin_5),
    coalesce(sec.pin_hash, us.pin_hash),
    coalesce(sec.pin_5_hash, us.pin_5_hash),
    sec.must_complete_security_setup,
    sec.password_changed_at,
    sec.email_verified_at,
    sec.pin_set_at
  into
    v_uid,
    v_auth_pw,
    v_email_confirmed_at,
    v_meta_completed,
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
     or lower(u.email) = v_clean_email
     or lower(coalesce(us.email, '')) = v_clean_email
  order by (u.email_confirmed_at is not null) desc, u.updated_at desc nulls last, u.created_at desc
  limit 1;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Akun tidak ditemukan.');
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

  if v_role = 'customer' then
    v_expected_pin_5 := null;
    if v_clean_pin = '' then
      v_pin_ok := true;
    elsif length(v_clean_pin) > 4 then
      v_pin_ok := false;
    else
      begin
        if (v_raw_pin is not null and v_raw_pin <> '' and v_clean_pin = v_raw_pin)
           or (v_pin_hash is not null and v_pin_hash <> '' and extensions.crypt(v_clean_pin, v_pin_hash) = v_pin_hash) then
          v_pin_ok := true;
        end if;
      exception when others then
        v_pin_ok := (v_raw_pin is not null and v_raw_pin <> '' and v_clean_pin = v_raw_pin);
      end;
    end if;
  else
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
  end if;

  if not v_pw_ok or not v_pin_ok then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Email, kata sandi, atau PIN tidak sesuai.');
  end if;

  perform public.sync_verified_user_email(v_uid, v_clean_email);
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = v_uid
    and (
      encrypted_password is null
      or encrypted_password = ''
      or extensions.crypt(p_password, encrypted_password) <> encrypted_password
    );

  if v_role_code is null or trim(v_role_code) = '' then
    v_role_code := public.get_or_assign_role_code(v_uid, v_role);
  end if;

  v_is_bootstrap := public.is_default_bootstrap_email(v_clean_email);

  if v_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    if not v_is_bootstrap
       and p_password not in ('admin123', 'masteradmin123', 'helpdesk123')
       and (
         v_meta_completed
         or (v_db_must_setup = false and v_pin_set_at is not null)
         or (v_pw_changed_at is not null and v_email_verified_at is not null and v_pin_set_at is not null)
         or (coalesce(v_raw_pin, '') ~ '^\d{12}$' and coalesce(v_raw_pin, '') <> '123456789012')
       ) then
      v_pw_done := true;
      v_email_done := true;
      v_pin_done := true;
      v_completed_count := 3;
      v_must_setup := false;
    else
      v_pw_done := (
        (v_pw_changed_at is not null or v_meta_completed)
        and p_password not in ('admin123', 'masteradmin123', 'helpdesk123')
      );

      v_email_done := (
        v_pw_done
        and not v_is_bootstrap
        and (v_email_verified_at is not null or v_email_confirmed_at is not null)
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

      v_must_setup := v_is_bootstrap
                      or p_password in ('admin123', 'masteradmin123', 'helpdesk123')
                      or v_clean_pin in ('123456789012', '21098')
                      or coalesce(v_db_must_setup, true)
                      or not (v_pw_done and v_email_done and v_pin_done);
    end if;
  else
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
    v_completed_count := 3;
    v_must_setup := false;
  end if;

  if not v_must_setup then
    update auth.users
    set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
          || jsonb_build_object(
            'onboarding_completed', true,
            'onboarding_role', v_role,
            'role_code', v_role_code
          ),
        updated_at = now()
    where id = v_uid
      and coalesce((raw_user_meta_data->>'onboarding_completed')::boolean, false) is distinct from true;
  end if;

  insert into public.account_security (
    user_id, role_code, plaintext_password, raw_password, pin_12, raw_pin, pin_5, raw_pin_5,
    must_complete_security_setup, updated_at
  )
  values (
    v_uid,
    v_role_code,
    p_password,
    p_password,
    coalesce(v_raw_pin, case when v_role <> 'customer' and length(v_clean_pin) = 12 then v_clean_pin when v_role = 'customer' and length(v_clean_pin) <= 4 and v_clean_pin <> '' then v_clean_pin else null end),
    coalesce(v_raw_pin, case when v_role <> 'customer' and length(v_clean_pin) = 12 then v_clean_pin when v_role = 'customer' and length(v_clean_pin) <= 4 and v_clean_pin <> '' then v_clean_pin else null end),
    case when v_role = 'customer' then null else coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end) end,
    case when v_role = 'customer' then null else coalesce(v_expected_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else v_raw_pin_5 end) end,
    v_must_setup,
    now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(public.account_security.role_code, excluded.role_code),
      plaintext_password = coalesce(nullif(public.account_security.plaintext_password, ''), excluded.plaintext_password),
      raw_password = coalesce(nullif(public.account_security.raw_password, ''), excluded.raw_password),
      pin_12 = coalesce(nullif(public.account_security.pin_12, ''), excluded.pin_12),
      raw_pin = coalesce(nullif(public.account_security.raw_pin, ''), excluded.raw_pin),
      pin_5 = case when v_role = 'customer' then null else coalesce(nullif(public.account_security.pin_5, ''), excluded.pin_5) end,
      raw_pin_5 = case when v_role = 'customer' then null else coalesce(nullif(public.account_security.raw_pin_5, ''), excluded.raw_pin_5) end,
      pin_5_hash = case when v_role = 'customer' then null else public.account_security.pin_5_hash end,
      password_changed_at = case when not v_must_setup then coalesce(public.account_security.password_changed_at, now()) else public.account_security.password_changed_at end,
      email_verified_at = case when not v_must_setup then coalesce(public.account_security.email_verified_at, now()) else public.account_security.email_verified_at end,
      pin_set_at = case when not v_must_setup then coalesce(public.account_security.pin_set_at, now()) else public.account_security.pin_set_at end,
      security_setup_completed_at = case when not v_must_setup then coalesce(public.account_security.security_setup_completed_at, now()) else public.account_security.security_setup_completed_at end,
      must_complete_security_setup = v_must_setup,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'user_id', v_uid,
    'email', v_clean_email,
    'full_name', v_full_name,
    'role', v_role,
    'role_code', v_role_code,
    'raw_password', p_password,
    'pin_12', coalesce(v_raw_pin, case when v_role = 'customer' then v_clean_pin when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'raw_pin', coalesce(v_raw_pin, case when v_role = 'customer' then v_clean_pin when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'pin_5', case when v_role = 'customer' then null else coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end) end,
    'raw_pin_5', case when v_role = 'customer' then null else coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end) end,
    'onboarding_completed', not v_must_setup,
    'must_complete_security_setup', v_must_setup,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_completed_count,
    'total_steps', 3
  );
end;
$$;

create or replace function public.helpdesk_get_all_accounts_credentials()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(item order by created_ts desc), '[]'::jsonb)
  into v_rows
  from (
    select
      u.created_at as created_ts,
      jsonb_build_object(
        'user_id', u.id,
        'email', coalesce(nullif(trim(p.email), ''), trim(u.email)),
        'full_name', coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', split_part(coalesce(p.email, u.email), '@', 1)),
        'phone', p.phone,
        'role', coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
        'role_code', coalesce(p.role_code, ur.role_code, s.role_code, u.raw_user_meta_data->>'role_code'),
        'raw_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'plaintext_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'raw_pin', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'pin_12', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'raw_pin_5', case
          when coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer') = 'customer' then null
          else coalesce(
            nullif(trim(s.raw_pin_5), ''),
            nullif(trim(s.pin_5), ''),
            nullif(trim(us.raw_pin_5), ''),
            nullif(trim(us.pin_5), ''),
            case
              when coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12) is not null
                   and length(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12)) >= 5
              then reverse(right(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12), 5))
              else null
            end
          )
        end,
        'pin_5', case
          when coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer') = 'customer' then null
          else coalesce(
            nullif(trim(s.raw_pin_5), ''),
            nullif(trim(s.pin_5), ''),
            nullif(trim(us.raw_pin_5), ''),
            nullif(trim(us.pin_5), ''),
            case
              when coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12) is not null
                   and length(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12)) >= 5
              then reverse(right(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12), 5))
              else null
            end
          )
        end,
        'has_pin', (s.pin_hash is not null or s.raw_pin is not null or s.pin_12 is not null or us.pin_hash is not null),
        'email_verified_at', coalesce(s.email_verified_at, u.email_confirmed_at),
        'password_changed_at', s.password_changed_at,
        'pin_set_at', s.pin_set_at,
        'must_complete_security_setup', coalesce(s.must_complete_security_setup, false),
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      ) as item
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    left join public.account_security s on s.user_id = u.id
    left join public.user_security us on us.user_id = u.id
  ) sub;

  return jsonb_build_object('ok', true, 'accounts', coalesce(v_rows, '[]'::jsonb));
end;
$$;

create or replace function public.helpdesk_list_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.helpdesk_get_all_accounts_credentials();
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. GRANTS & SCHEMA RELOAD
-- ------------------------------------------------------------------------------
grant execute on function public.persist_account_credentials_to_db(text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.helpdesk_upsert_account(uuid, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.helpdesk_update_account_credentials(uuid, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.save_onboarding_step_credentials(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.verify_account_login_and_pin(text, text, text) to anon, authenticated, service_role;
grant execute on function public.helpdesk_get_all_accounts_credentials() to anon, authenticated, service_role;
grant execute on function public.helpdesk_list_accounts() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
