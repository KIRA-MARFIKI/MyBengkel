-- ==============================================================================
-- MYBENGKEL - 100% REAL SUPABASE DATABASE FOR HELPDESK CENTER (ZERO DUMMY DATA)
-- Migration: 20261118213000_helpdesk_real_database_only.sql
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. REAL PIN RECOVERY REQUESTS TABLE & REALTIME PUBLICATION
-- ------------------------------------------------------------------------------
create table if not exists public.pin_recovery_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  role text,
  role_code text,
  status text not null default 'pending',
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text,
  notes text
);

alter table public.pin_recovery_requests
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists role text,
  add column if not exists role_code text,
  add column if not exists status text default 'pending',
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by text,
  add column if not exists notes text;

alter table public.pin_recovery_requests enable row level security;
drop policy if exists "shared_pin_recovery_requests_all" on public.pin_recovery_requests;
create policy "shared_pin_recovery_requests_all"
  on public.pin_recovery_requests
  for all
  to anon, authenticated
  using (true)
  with check (true);

do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'user_roles', 'account_security', 'pin_recovery_requests']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;

-- ------------------------------------------------------------------------------
-- 2. PERSIST ACCOUNT CREDENTIALS TO DB (CREATE / UPSERT DIRECTLY IN POSTGRES)
-- ------------------------------------------------------------------------------
drop function if exists public.persist_account_credentials_to_db(text, text, text, text, text, text) cascade;

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
  v_pin_5 text;
  v_uid uuid;
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text;
  v_role_code text;
begin
  if v_clean_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Email wajib diisi.');
  end if;

  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;

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
    nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(v_pin_5, ''), v_pin_hash, v_pin_5_hash,
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
      pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.raw_pin_5),
      pin_hash = coalesce(v_pin_hash, public.account_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.account_security.pin_5_hash),
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
    nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(v_pin_5, ''),
    nullif(p_password, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = excluded.email,
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
    'phone', nullif(v_clean_phone, ''),
    'role', v_clean_role,
    'role_code', v_role_code,
    'raw_pin_5', v_pin_5,
    'pin_5', v_pin_5
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. SEED CORE BOOTSTRAP ACCOUNTS AS REAL DB ROWS WHEN NOT PRESENT
-- ------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from auth.users where lower(email) = 'admin@mybengkel.com') then
    perform public.persist_account_credentials_to_db(
      'admin@mybengkel.com', 'admin123', '123456789012', 'admin', 'Admin MyBengkel', null
    );
  end if;

  if not exists (select 1 from auth.users where lower(email) = 'masteradmin@mybengkel.com') then
    perform public.persist_account_credentials_to_db(
      'masteradmin@mybengkel.com', 'masteradmin123', '123456789012', 'master_admin', 'Master Gudang MyBengkel', null
    );
  end if;

  if not exists (select 1 from auth.users where lower(email) = 'helpdesk@gmail.com') then
    perform public.persist_account_credentials_to_db(
      'helpdesk@gmail.com', 'helpdesk123', '123456789012', 'master_helpdesk', 'Master Helpdesk MyBengkel', null
    );
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 4. REAL HELPDESK QUERIES: ACCOUNTS & RECOVERY REQUESTS
-- ------------------------------------------------------------------------------
drop function if exists public.helpdesk_get_all_accounts_credentials() cascade;

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
        'email', coalesce(u.email, p.email),
        'full_name', coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
        'phone', p.phone,
        'role', coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
        'role_code', coalesce(p.role_code, ur.role_code, s.role_code),
        'raw_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'plaintext_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'raw_pin', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'pin_12', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'raw_pin_5', coalesce(
          s.raw_pin_5,
          s.pin_5,
          us.raw_pin_5,
          us.pin_5,
          case
            when coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12) is not null
                 and length(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12)) >= 5
            then reverse(right(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12), 5))
            else null
          end
        ),
        'pin_5', coalesce(
          s.raw_pin_5,
          s.pin_5,
          us.raw_pin_5,
          us.pin_5,
          case
            when coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12) is not null
                 and length(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12)) >= 5
            then reverse(right(coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12), 5))
            else null
          end
        ),
        'has_pin', (s.pin_hash is not null or s.raw_pin is not null or s.pin_12 is not null),
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

drop function if exists public.helpdesk_get_recovery_requests() cascade;

create or replace function public.helpdesk_get_recovery_requests()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(item order by req_ts desc), '[]'::jsonb)
  into v_rows
  from (
    select
      r.requested_at as req_ts,
      jsonb_build_object(
        'id', r.id,
        'user_id', r.user_id,
        'email', coalesce(r.email, p.email),
        'full_name', p.full_name,
        'role', coalesce(r.role, ur.role, 'customer'),
        'role_code', coalesce(r.role_code, p.role_code, ur.role_code),
        'status', r.status,
        'requested_at', r.requested_at,
        'resolved_at', r.resolved_at,
        'resolved_by', r.resolved_by,
        'notes', r.notes
      ) as item
    from public.pin_recovery_requests r
    left join public.profiles p on p.id = r.user_id
    left join public.user_roles ur on ur.user_id = r.user_id
  ) sub;

  return jsonb_build_object('ok', true, 'requests', coalesce(v_rows, '[]'::jsonb));
end;
$$;

-- Log real PIN recovery requests into public.pin_recovery_requests when user requests reset
create or replace function public.request_pin_recovery(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid uuid;
  v_role text;
  v_role_code text;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Email harus diisi.');
  end if;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is null then
    return jsonb_build_object(
      'ok', true,
      'message', 'Jika email terdaftar, instruksi pemulihan PIN telah dikirim.'
    );
  end if;

  select role, role_code into v_role, v_role_code
  from public.user_roles where user_id = v_uid limit 1;

  update public.pin_recovery_tokens
  set used_at = now()
  where user_id = v_uid and used_at is null;

  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := extensions.crypt(v_raw_token, extensions.gen_salt('bf', 8));

  insert into public.pin_recovery_tokens (user_id, email, token_hash, expires_at)
  values (v_uid, v_email, v_token_hash, v_expires_at);

  insert into public.pin_recovery_requests (user_id, email, role, role_code, status, requested_at, notes)
  values (v_uid, v_email, v_role, v_role_code, 'pending', now(), 'Permintaan pemulihan PIN dari halaman Masuk');

  return jsonb_build_object(
    'ok', true,
    'message', 'Jika email terdaftar, instruksi pemulihan PIN telah dikirim.',
    'recovery_token', v_raw_token
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 5. UPDATE & DELETE CREDENTIAL RPCs
-- ------------------------------------------------------------------------------
drop function if exists public.helpdesk_update_account_credentials(uuid, text, text, text, text) cascade;

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

drop function if exists public.helpdesk_delete_account(uuid) cascade;
drop function if exists public.helpdesk_delete_account(uuid, text) cascade;

create or replace function public.helpdesk_delete_account(
  p_target_user_id uuid default null,
  p_target_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := p_target_user_id;
  v_clean_email text := lower(trim(coalesce(p_target_email, '')));
begin
  if v_uid is null and v_clean_email <> '' then
    select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;
    if v_uid is null then
      select id into v_uid from public.profiles where lower(email) = v_clean_email limit 1;
    end if;
  end if;

  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Akun target tidak ditemukan di database.');
  end if;

  delete from public.user_security where user_id = v_uid;
  delete from public.account_security where user_id = v_uid;
  delete from public.pin_recovery_requests where user_id = v_uid;
  delete from public.pin_recovery_tokens where user_id = v_uid;
  delete from public.user_roles where user_id = v_uid;
  delete from public.profiles where id = v_uid;
  delete from auth.identities where user_id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'deleted_user_id', v_uid,
    'deleted_email', v_clean_email
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. GRANTS & POSTGREST SCHEMA RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

notify pgrst, 'reload schema';
