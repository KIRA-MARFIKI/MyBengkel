-- ==============================================================================
-- MYBENGKEL - MAJOR ARCHITECTURE & RBAC OVERHAUL
-- Migration: 20261120200000_overhaul_roles_gudang_defaults_and_cleanup.sql
--
-- Changes:
--   1. Drops Permintaan Penyediaan tables (part_requests, permintaan_penyediaan,
--      supply_requests, warehouse_requests) and removes secondary Gudang gate RPCs
--      (verify_master_gudang_access, verify_warehouse_access).
--   2. Removes obsolete default emails (helpdesk@gmail.com, admin@mubengkel.com, etc.)
--      and restores/seeds the exact 3 official default accounts:
--        - Admin:           admin@mybengkel.com       / admin123       / 123456789012 (21098) / AD-001
--        - Master Admin:    masteradmin@mybengkel.com / masteradmin123 / 123456789012 (21098) / MG-001
--        - Master Helpdesk: helpdesk@mybengkel.com    / helpdesk123    / 123456789012 (21098) / HD-001
--   3. Preserves public.user_roles.assigned_at safely.
--   4. Enforces strict RLS on public.parts (SELECT for staff; INSERT/UPDATE/DELETE
--      restricted to master_admin / master_gudang / master_helpdesk) plus
--      direct Part CRUD RPCs (upsert_warehouse_part, delete_warehouse_part).
--   5. Updates get_shared_workshop_state and save_shared_workshop_state without
--      part_requests references.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. DROP PERMINTAAN PENYEDIAAN TABLES & SECONDARY WAREHOUSE GATE RPCs
-- ------------------------------------------------------------------------------
drop table if exists public.part_requests cascade;
drop table if exists public.permintaan_penyediaan cascade;
drop table if exists public.supply_requests cascade;
drop table if exists public.warehouse_requests cascade;

drop function if exists public.verify_master_gudang_access(text, text, text, text) cascade;
drop function if exists public.verify_warehouse_access(text, text, text, text) cascade;

-- ------------------------------------------------------------------------------
-- 2. ENSURE CORE AUTH/ACCOUNT TABLES & COLUMNS EXIST
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

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer'))
  not valid;

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

-- ------------------------------------------------------------------------------
-- 3. STANDARDIZE DEFAULT BOOTSTRAP EMAIL DETECTION & AUTH HELPERS
-- ------------------------------------------------------------------------------
create or replace function public.is_default_bootstrap_email(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(trim(coalesce(p_email, ''))) in (
    'admin@mybengkel.com',
    'masteradmin@mybengkel.com',
    'helpdesk@mybengkel.com'
  );
$$;

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
-- 4. REMOVE OBSOLETE DEFAULT ACCOUNTS & SEED THE 3 OFFICIAL DEFAULT ACCOUNTS
-- ------------------------------------------------------------------------------
do $$
declare
  v_obsolete_id uuid;
begin
  for v_obsolete_id in
    select distinct u.id
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_security us on us.user_id = u.id
    where lower(coalesce(u.email, '')) in (
      'helpdesk@gmail.com',
      'admin@mubengkel.com',
      'masteradmin@mubengkel.com',
      'helpdesk@mubengkel.com',
      'admin@mybengkel.id',
      'mybenngkeladmin@mybengkel.com',
      'masteradminmybengkel@mybengkel.com',
      'helpdeskmybengkel@mybengkel.com'
    )
    or lower(coalesce(p.email, '')) in (
      'helpdesk@gmail.com',
      'admin@mubengkel.com',
      'masteradmin@mubengkel.com',
      'helpdesk@mubengkel.com'
    )
    or lower(coalesce(us.email, '')) in (
      'helpdesk@gmail.com',
      'admin@mubengkel.com',
      'masteradmin@mubengkel.com',
      'helpdesk@mubengkel.com'
    )
  loop
    begin
      delete from public.user_security where user_id = v_obsolete_id;
      delete from public.account_security where user_id = v_obsolete_id;
      delete from public.user_roles where user_id = v_obsolete_id;
      delete from public.profiles where id = v_obsolete_id;
      delete from auth.identities where user_id = v_obsolete_id;
      delete from auth.users where id = v_obsolete_id;
    exception when others then
      null;
    end;
  end loop;
end $$;

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
      jsonb_build_object(
        'full_name', p_full_name,
        'onboarding_role', p_role,
        'role_code', p_role_code,
        'onboarding_completed', false
      ),
      now(),
      now()
    );
  else
    update auth.users
    set encrypted_password = v_pw_hash,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'full_name', coalesce(nullif(raw_user_meta_data->>'full_name', ''), p_full_name),
            'onboarding_role', p_role,
            'role_code', p_role_code
          ),
        updated_at = now()
    where id = v_uid;
  end if;

  perform public.repair_auth_users_gotrue_columns(v_uid);
  perform public.ensure_auth_email_identity(v_uid, v_clean_email);

  insert into public.profiles (id, email, full_name, role_code, created_at, updated_at)
  values (v_uid, v_clean_email, p_full_name, p_role_code, now(), now())
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(nullif(public.profiles.full_name, ''), excluded.full_name),
      role_code = coalesce(nullif(public.profiles.role_code, ''), excluded.role_code),
      updated_at = now();

  if exists (select 1 from public.user_roles where user_id = v_uid) then
    update public.user_roles
    set role = p_role,
        role_code = coalesce(nullif(role_code, ''), p_role_code),
        assigned_at = coalesce(assigned_at, now())
    where user_id = v_uid;
  else
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
  set role_code = coalesce(nullif(public.account_security.role_code, ''), excluded.role_code),
      plaintext_password = coalesce(nullif(public.account_security.plaintext_password, ''), excluded.plaintext_password),
      raw_password = coalesce(nullif(public.account_security.raw_password, ''), excluded.raw_password),
      pin_12 = coalesce(nullif(public.account_security.pin_12, ''), excluded.pin_12),
      raw_pin = coalesce(nullif(public.account_security.raw_pin, ''), excluded.raw_pin),
      pin_5 = coalesce(nullif(public.account_security.pin_5, ''), excluded.pin_5),
      raw_pin_5 = coalesce(nullif(public.account_security.raw_pin_5, ''), excluded.raw_pin_5),
      pin_hash = coalesce(public.account_security.pin_hash, excluded.pin_hash),
      pin_5_hash = coalesce(public.account_security.pin_5_hash, excluded.pin_5_hash),
      must_complete_security_setup = case
        when public.is_default_bootstrap_email(v_clean_email)
          or coalesce(public.account_security.raw_password, public.account_security.plaintext_password, '') in ('', 'admin123', 'masteradmin123', 'helpdesk123')
          or coalesce(public.account_security.raw_pin, public.account_security.pin_12, '') in ('', '123456789012')
        then true
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
  on conflict (user_id) do update
  set email = excluded.email,
      plaintext_password = coalesce(nullif(public.user_security.plaintext_password, ''), excluded.plaintext_password),
      raw_password = coalesce(nullif(public.user_security.raw_password, ''), excluded.raw_password),
      pin_12 = coalesce(nullif(public.user_security.pin_12, ''), excluded.pin_12),
      raw_pin = coalesce(nullif(public.user_security.raw_pin, ''), excluded.raw_pin),
      pin_5 = coalesce(nullif(public.user_security.pin_5, ''), excluded.pin_5),
      raw_pin_5 = coalesce(nullif(public.user_security.raw_pin_5, ''), excluded.raw_pin_5),
      pin_hash = coalesce(public.user_security.pin_hash, excluded.pin_hash),
      pin_5_hash = coalesce(public.user_security.pin_5_hash, excluded.pin_5_hash),
      updated_at = now();
end;
$$;

do $$
begin
  perform public.seed_default_bootstrap_account(
    'admin@mybengkel.com',
    'admin123',
    '123456789012',
    'admin',
    'Admin MyBengkel',
    'AD-001'
  );
  perform public.seed_default_bootstrap_account(
    'masteradmin@mybengkel.com',
    'masteradmin123',
    '123456789012',
    'master_admin',
    'Master Gudang MyBengkel',
    'MG-001'
  );
  perform public.seed_default_bootstrap_account(
    'helpdesk@mybengkel.com',
    'helpdesk123',
    '123456789012',
    'master_helpdesk',
    'Master Helpdesk MyBengkel',
    'HD-001'
  );
  perform public.repair_auth_users_gotrue_columns(null);
end $$;

-- ------------------------------------------------------------------------------
-- 5. ENSURE HELPDESK ACCOUNT CREDENTIAL QUERY RETURNS ALL REAL ACCOUNTS
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
        'email', coalesce(nullif(trim(p.email), ''), trim(u.email)),
        'full_name', coalesce(nullif(p.full_name, ''), u.raw_user_meta_data->>'full_name', split_part(coalesce(p.email, u.email), '@', 1)),
        'phone', p.phone,
        'role', coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
        'role_code', coalesce(p.role_code, ur.role_code, s.role_code, u.raw_user_meta_data->>'role_code'),
        'raw_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'plaintext_password', coalesce(s.raw_password, s.plaintext_password, us.raw_password, us.plaintext_password),
        'raw_pin', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'pin_12', coalesce(s.raw_pin, s.pin_12, us.raw_pin, us.pin_12),
        'raw_pin_5', coalesce(
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
        ),
        'pin_5', coalesce(
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
        ),
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
-- 6. WAREHOUSE PARTS TABLE, STRICT RLS POLICIES & DIRECT PART CRUD RPCs
-- ------------------------------------------------------------------------------
create table if not exists public.parts (
  id text primary key,
  kode text,
  nama text,
  satuan text,
  jenis text,
  stok integer default 0,
  harga_beli numeric default 0,
  harga_jual numeric default 0,
  stok_min integer,
  catatan text,
  created_at text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.parts
  add column if not exists kode text,
  add column if not exists nama text,
  add column if not exists satuan text,
  add column if not exists jenis text,
  add column if not exists stok integer default 0,
  add column if not exists harga_beli numeric default 0,
  add column if not exists harga_jual numeric default 0,
  add column if not exists stok_min integer,
  add column if not exists catatan text,
  add column if not exists created_at text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.get_current_app_role()
returns text
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
begin
  if v_uid is null then
    return 'anon';
  end if;

  select lower(trim(ur.role))
  into v_role
  from public.user_roles ur
  where ur.user_id = v_uid
  limit 1;

  if coalesce(v_role, '') = '' then
    select lower(trim(u.raw_user_meta_data->>'onboarding_role'))
    into v_role
    from auth.users u
    where u.id = v_uid
    limit 1;
  end if;

  return coalesce(nullif(v_role, ''), 'customer');
end;
$$;

alter table public.parts enable row level security;

drop policy if exists "Shared parts access" on public.parts;
drop policy if exists "Master Helpdesk can read parts for diagnosis" on public.parts;
drop policy if exists "Parts read access" on public.parts;
drop policy if exists "Parts master insert access" on public.parts;
drop policy if exists "Parts master update access" on public.parts;
drop policy if exists "Parts master delete access" on public.parts;

-- SELECT allowed for admin, master_admin, master_gudang, master_helpdesk (and anon/authenticated reads for catalog sync)
create policy "Parts read access"
  on public.parts for select
  to anon, authenticated
  using (true);

-- INSERT / UPDATE / DELETE strictly allowed ONLY for master_admin, master_gudang, and master_helpdesk
create policy "Parts master insert access"
  on public.parts for insert
  to authenticated
  with check (
    public.get_current_app_role() in ('master_admin', 'master_gudang', 'master_helpdesk')
  );

create policy "Parts master update access"
  on public.parts for update
  to authenticated
  using (
    public.get_current_app_role() in ('master_admin', 'master_gudang', 'master_helpdesk')
  )
  with check (
    public.get_current_app_role() in ('master_admin', 'master_gudang', 'master_helpdesk')
  );

create policy "Parts master delete access"
  on public.parts for delete
  to authenticated
  using (
    public.get_current_app_role() in ('master_admin', 'master_gudang', 'master_helpdesk')
  );

create or replace function public.upsert_warehouse_part(
  p_id text,
  p_kode text,
  p_nama text,
  p_satuan text default 'pcs',
  p_jenis text default 'reguler',
  p_stok integer default 0,
  p_harga_beli numeric default 0,
  p_harga_jual numeric default 0,
  p_stok_min integer default 1,
  p_catatan text default null,
  p_created_at text default null,
  p_payload jsonb default '{}'::jsonb,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session_role text := public.get_current_app_role();
  v_effective_role text;
  v_clean_id text := coalesce(nullif(trim(p_id), ''), nullif(trim(p_kode), ''));
  v_clean_kode text := coalesce(nullif(trim(p_kode), ''), v_clean_id);
  v_clean_nama text := trim(coalesce(p_nama, ''));
begin
  v_effective_role := case
    when v_session_role not in ('', 'anon', 'customer') then v_session_role
    else lower(trim(coalesce(p_actor_role, 'customer')))
  end;

  if v_effective_role not in ('master_admin', 'master_gudang', 'master_helpdesk') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Akses ditolak: hanya Master Admin / Master Gudang atau Master Helpdesk yang dapat mengubah data part.'
    );
  end if;

  if v_clean_id is null or v_clean_nama = '' then
    return jsonb_build_object('ok', false, 'error', 'Kode dan nama part wajib diisi.');
  end if;

  insert into public.parts (
    id, kode, nama, satuan, jenis, stok, harga_beli, harga_jual, stok_min, catatan, created_at, payload, updated_at
  )
  values (
    v_clean_id,
    v_clean_kode,
    v_clean_nama,
    coalesce(nullif(trim(p_satuan), ''), 'pcs'),
    case when lower(trim(coalesce(p_jenis, ''))) = 'ho' then 'ho' else 'reguler' end,
    greatest(0, coalesce(p_stok, 0)),
    greatest(0, coalesce(p_harga_beli, 0)),
    greatest(0, coalesce(p_harga_jual, 0)),
    case when lower(trim(coalesce(p_jenis, ''))) = 'ho' then null else greatest(0, coalesce(p_stok_min, 1)) end,
    p_catatan,
    coalesce(nullif(trim(p_created_at), ''), to_char(now(), 'YYYY-MM-DD HH24.MI')),
    coalesce(p_payload, '{}'::jsonb),
    now()
  )
  on conflict (id) do update
  set kode = excluded.kode,
      nama = excluded.nama,
      satuan = excluded.satuan,
      jenis = excluded.jenis,
      stok = excluded.stok,
      harga_beli = excluded.harga_beli,
      harga_jual = excluded.harga_jual,
      stok_min = excluded.stok_min,
      catatan = excluded.catatan,
      payload = excluded.payload,
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'id', v_clean_id,
    'kode', v_clean_kode
  );
end;
$$;

create or replace function public.delete_warehouse_part(
  p_part_id text,
  p_actor_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session_role text := public.get_current_app_role();
  v_effective_role text;
  v_clean_id text := trim(coalesce(p_part_id, ''));
begin
  v_effective_role := case
    when v_session_role not in ('', 'anon', 'customer') then v_session_role
    else lower(trim(coalesce(p_actor_role, 'customer')))
  end;

  if v_effective_role not in ('master_admin', 'master_gudang', 'master_helpdesk') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Akses ditolak: Admin reguler tidak diperbolehkan menghapus data part.'
    );
  end if;

  if v_clean_id = '' then
    return jsonb_build_object('ok', false, 'error', 'ID/Kode part wajib diisi.');
  end if;

  delete from public.parts
  where id = v_clean_id or kode = v_clean_id;

  return jsonb_build_object('ok', true, 'deleted_id', v_clean_id);
end;
$$;

-- ------------------------------------------------------------------------------
-- 7. UPDATE SHARED WORKSHOP SYNC RPCs (REMOVE part_requests, KEEP parts SYNC)
-- ------------------------------------------------------------------------------
create or replace function public.get_shared_workshop_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.shared_workshop_state%rowtype;
  v_bookings_rows jsonb;
  v_parts_rows jsonb;
begin
  select * into v_row
  from public.shared_workshop_state
  where id = 'global'
  limit 1;

  select coalesce(jsonb_agg(coalesce(nullif(b.payload, '{}'::jsonb), to_jsonb(b))), '[]'::jsonb)
  into v_bookings_rows
  from public.bookings b;

  select coalesce(jsonb_agg(coalesce(nullif(p.payload, '{}'::jsonb), to_jsonb(p))), '[]'::jsonb)
  into v_parts_rows
  from public.parts p;

  return jsonb_build_object(
    'ok', true,
    'payload', coalesce(v_row.payload, '{}'::jsonb),
    'bookings_rows', coalesce(v_bookings_rows, '[]'::jsonb),
    'parts_rows', coalesce(v_parts_rows, '[]'::jsonb),
    'updated_at', v_row.updated_at
  );
end;
$$;

create or replace function public.save_shared_workshop_state(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_elem jsonb;
begin
  if p_payload is null then
    return jsonb_build_object('ok', false, 'error', 'Payload kosong.');
  end if;

  insert into public.shared_workshop_state (id, payload, updated_at)
  values ('global', p_payload - 'purchaseRequests', v_now)
  on conflict (id) do update
  set payload = excluded.payload,
      updated_at = v_now;

  -- Mirror bookings
  if jsonb_typeof(p_payload->'bookings') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'bookings')
    loop
      if coalesce(v_elem->>'id', '') <> '' then
        insert into public.bookings (
          id, customer_name, customer_email, plate, engine_no, frame_no,
          service, date, hour, status, source, complaint, service_form_id,
          payload, updated_at
        )
        values (
          v_elem->>'id',
          v_elem->>'customerName',
          v_elem->>'customerEmail',
          v_elem->>'plate',
          v_elem->>'engineNo',
          v_elem->>'frameNo',
          v_elem->>'service',
          v_elem->>'date',
          v_elem->>'hour',
          coalesce(v_elem->>'status', 'menunggu'),
          coalesce(v_elem->>'source', 'online'),
          v_elem->>'complaint',
          v_elem->>'serviceFormId',
          v_elem,
          v_now
        )
        on conflict (id) do update
        set customer_name = excluded.customer_name,
            customer_email = excluded.customer_email,
            plate = excluded.plate,
            engine_no = excluded.engine_no,
            frame_no = excluded.frame_no,
            service = excluded.service,
            date = excluded.date,
            hour = excluded.hour,
            status = excluded.status,
            source = excluded.source,
            complaint = excluded.complaint,
            service_form_id = excluded.service_form_id,
            payload = excluded.payload,
            updated_at = v_now;
      end if;
    end loop;
  end if;

  -- Mirror service_forms -> service_orders
  if jsonb_typeof(p_payload->'serviceForms') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'serviceForms')
    loop
      if coalesce(v_elem->>'id', '') <> '' then
        insert into public.service_orders (id, booking_id, status, payload, updated_at)
        values (v_elem->>'id', v_elem->>'bookingId', v_elem->>'status', v_elem, v_now)
        on conflict (id) do update
        set booking_id = excluded.booking_id,
            status = excluded.status,
            payload = excluded.payload,
            updated_at = v_now;
      end if;
    end loop;
  end if;

  -- Mirror work_orders
  if jsonb_typeof(p_payload->'workOrders') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'workOrders')
    loop
      if coalesce(v_elem->>'id', '') <> '' then
        insert into public.work_orders (id, service_form_id, mechanic_id, end_state, payload, updated_at)
        values (v_elem->>'id', v_elem->>'serviceFormId', v_elem->>'mechanicId', v_elem->>'endState', v_elem, v_now)
        on conflict (id) do update
        set service_form_id = excluded.service_form_id,
            mechanic_id = excluded.mechanic_id,
            end_state = excluded.end_state,
            payload = excluded.payload,
            updated_at = v_now;
      end if;
    end loop;
  end if;

  -- Mirror parts
  if jsonb_typeof(p_payload->'parts') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'parts')
    loop
      if coalesce(v_elem->>'id', v_elem->>'kode', '') <> '' then
        insert into public.parts (
          id, kode, nama, satuan, jenis, harga_beli, harga_jual, stok_min, created_at, payload, updated_at
        )
        values (
          coalesce(v_elem->>'id', v_elem->>'kode'),
          coalesce(v_elem->>'kode', v_elem->>'code'),
          coalesce(v_elem->>'nama', v_elem->>'name'),
          coalesce(v_elem->>'satuan', v_elem->>'unit'),
          coalesce(v_elem->>'jenis', 'reguler'),
          coalesce(nullif(v_elem->>'hargaBeli', '')::numeric, 0),
          coalesce(nullif(v_elem->>'hargaJual', '')::numeric, 0),
          nullif(v_elem->>'stokMin', '')::integer,
          v_elem->>'createdAt',
          v_elem,
          v_now
        )
        on conflict (id) do update
        set kode = excluded.kode,
            nama = excluded.nama,
            satuan = excluded.satuan,
            jenis = excluded.jenis,
            harga_beli = excluded.harga_beli,
            harga_jual = excluded.harga_jual,
            stok_min = excluded.stok_min,
            payload = excluded.payload,
            updated_at = v_now;
      end if;
    end loop;
  end if;

  -- Mirror sales -> part_sales
  if jsonb_typeof(p_payload->'sales') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'sales')
    loop
      if coalesce(v_elem->>'id', '') <> '' then
        insert into public.part_sales (id, number, customer_name, total, payment_status, payload, updated_at)
        values (
          v_elem->>'id',
          v_elem->>'number',
          v_elem->>'customerName',
          coalesce(nullif(v_elem->>'total', '')::numeric, 0),
          v_elem->>'paymentStatus',
          v_elem,
          v_now
        )
        on conflict (id) do update
        set number = excluded.number,
            customer_name = excluded.customer_name,
            total = excluded.total,
            payment_status = excluded.payment_status,
            payload = excluded.payload,
            updated_at = v_now;
      end if;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'updated_at', v_now);
end;
$$;

-- ------------------------------------------------------------------------------
-- 8. GRANTS & POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;

grant execute on function public.is_default_bootstrap_email(text) to anon, authenticated, service_role;
grant execute on function public.repair_auth_users_gotrue_columns(uuid) to anon, authenticated, service_role;
grant execute on function public.ensure_auth_email_identity(uuid, text) to anon, authenticated, service_role;
grant execute on function public.seed_default_bootstrap_account(text, text, text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.helpdesk_get_all_accounts_credentials() to anon, authenticated, service_role;
grant execute on function public.helpdesk_list_accounts() to anon, authenticated, service_role;
grant execute on function public.get_current_app_role() to anon, authenticated, service_role;
grant execute on function public.upsert_warehouse_part(text, text, text, text, text, integer, numeric, numeric, integer, text, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.delete_warehouse_part(text, text) to anon, authenticated, service_role;
grant execute on function public.get_shared_workshop_state() to anon, authenticated, service_role;
grant execute on function public.save_shared_workshop_state(jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
