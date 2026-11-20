-- ==============================================================================
-- MYBENGKEL: FIX AUTH.USERS NULL TOKENS & TIGHTEN EMAIL VERIFICATION GATE
-- Ensures every inserted auth.users row initializes string token columns to ''
-- (never NULL) to prevent GoTrue 500 "Database error finding user", and locks
-- Step 2 verification against bootstrap emails before saving Step 3 PIN.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. BACKFILL EXISTING AUTH.USERS ROWS WITH NULL TOKEN STRINGS
-- ------------------------------------------------------------------------------
update auth.users
set confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change = coalesce(email_change, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
where confirmation_token is null
   or recovery_token is null
   or email_change_token_new is null
   or email_change is null
   or phone_change is null
   or phone_change_token is null
   or reauthentication_token is null;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change_token_current'
  ) then
    execute 'update auth.users set email_change_token_current = coalesce(email_change_token_current, '''') where email_change_token_current is null';
  end if;
end;
$$;

-- ------------------------------------------------------------------------------
-- 2. HELPER: ENSURE EMAIL_CHANGE_TOKEN_CURRENT IS NEVER NULL ON NEW ROWS
-- ------------------------------------------------------------------------------
create or replace function public.ensure_auth_user_token_defaults(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if p_user_id is null then
    return;
  end if;

  update auth.users
  set confirmation_token = coalesce(confirmation_token, ''),
      recovery_token = coalesce(recovery_token, ''),
      email_change_token_new = coalesce(email_change_token_new, ''),
      email_change = coalesce(email_change, '')
  where id = p_user_id
    and (
      confirmation_token is null
      or recovery_token is null
      or email_change_token_new is null
      or email_change is null
    );

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users' and column_name = 'email_change_token_current'
  ) then
    execute 'update auth.users set email_change_token_current = coalesce(email_change_token_current, '''') where id = $1 and email_change_token_current is null'
    using p_user_id;
  end if;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. UPDATE persist_account_credentials_to_db (NON-NULL AUTH.USERS TOKENS)
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
      coalesce(v_pw_hash, extensions.crypt('MyBengkel@2026!', extensions.gen_salt('bf', 10))),
      now(),
      '',
      '',
      '',
      '',
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
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
            'onboarding_role', v_clean_role
          ),
        updated_at = now()
    where id = v_uid;
  end if;

  perform public.ensure_auth_user_token_defaults(v_uid);
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
-- 4. UPDATE helpdesk_upsert_account (NON-NULL AUTH.USERS TOKENS)
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
      coalesce(v_pw_hash, extensions.crypt('MyBengkel@2026!', extensions.gen_salt('bf', 10))),
      now(),
      '',
      '',
      '',
      '',
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
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
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

  perform public.ensure_auth_user_token_defaults(v_uid);
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

-- ------------------------------------------------------------------------------
-- 5. UPDATE save_onboarding_step_credentials (NON-NULL AUTH.USERS TOKENS)
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
      coalesce(v_pw_hash, extensions.crypt('MyBengkel@2026!', extensions.gen_salt('bf', 10))),
      now(),
      '',
      '',
      '',
      '',
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
        confirmation_token = coalesce(confirmation_token, ''),
        recovery_token = coalesce(recovery_token, ''),
        email_change_token_new = coalesce(email_change_token_new, ''),
        email_change = coalesce(email_change, ''),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
          'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
          'onboarding_role', v_clean_role
        ),
        updated_at = now()
    where id = v_uid;
  end if;

  perform public.ensure_auth_user_token_defaults(v_uid);
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
-- 6. HARDEN set_account_security_pin STEP 2 CHECK (NEVER ALLOW BOOTSTRAP EMAILS)
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
      and (
        (v_sec is not null and v_sec.email_verified_at is not null)
        or (v_user.email_confirmed_at is not null and not public.is_default_bootstrap_email(v_user.email))
        or coalesce(p_email_verified, false) = true
      )
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

  perform public.ensure_auth_user_token_defaults(v_user_id);
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

grant execute on function public.ensure_auth_user_token_defaults(uuid) to anon, authenticated, service_role;
grant execute on function public.persist_account_credentials_to_db(text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.helpdesk_upsert_account(uuid, text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.save_onboarding_step_credentials(text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text, text, boolean) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
