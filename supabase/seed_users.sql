-- ==============================================================================
-- MYBENGKEL — SUPABASE ACCOUNT SEEDING SCRIPT
-- File: supabase/seed_users.sql
-- Purpose: Create Admin, Master Admin, and Master Helpdesk accounts in auth.users,
--          assign authoritative roles in public.user_roles, and save hashed PINs.
-- ==============================================================================

-- 1. Enable pgcrypto extension for secure password and PIN hashing
create extension if not exists pgcrypto with schema extensions;

-- 2. Create user_roles table if not exists
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  role text not null check (role in ('admin', 'master_admin', 'customer', 'admin_gudang', 'master_gudang', 'master_helpdesk')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role);
alter table public.user_roles enable row level security;

-- 3. Create user_security table for secure salted hashed PIN storage
create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  pin_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_security_email on public.user_security(email);
alter table public.user_security enable row level security;

-- 4. Create account_security table for mandatory privileged account security setup
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

create index if not exists idx_account_security_must_complete on public.account_security(must_complete_security_setup);
alter table public.account_security enable row level security;

-- 4. Helper Function: Verify User PIN (Backend-evaluated, never exposes hash or PIN)
create or replace function public.verify_user_pin(p_email text, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_stored_hash text;
begin
  select pin_hash into v_stored_hash
  from public.user_security
  where lower(trim(email)) = lower(trim(p_email));

  if v_stored_hash is null then
    return false;
  end if;

  return (v_stored_hash = extensions.crypt(p_pin, v_stored_hash));
end;
$$;

-- 5. Seed / Upsert the 3 Accounts
do $$
declare
  -- Target Account 1: Admin
  v_admin_email text := 'admin@mybengkel.com';
  v_admin_pw    text := 'admin123';
  v_admin_pin   text := '123456789012';
  v_admin_uid   uuid;

  -- Target Account 2: Master Admin
  v_master_email text := 'masteradmin@mybengkel.com';
  v_master_pw    text := 'masteradmin123';
  v_master_pin   text := '123456789012';
  v_master_uid   uuid;

  -- Target Account 3: Helpdesk
  v_hd_email text := 'helpdesk@gmail.com';
  v_hd_pw    text := 'helpdesk123';
  v_hd_pin   text := '123456789012';
  v_hd_uid   uuid;
begin

  -- ============================================================================
  -- 1. SEED ADMIN ACCOUNT
  -- ============================================================================
  select id into v_admin_uid from auth.users where lower(email) = lower(v_admin_email);

  if v_admin_uid is null then
    v_admin_uid := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_admin_uid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      v_admin_email,
      extensions.crypt(v_admin_pw, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Admin MyBengkel","role":"admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(v_admin_pw, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = '{"name":"Admin MyBengkel","role":"admin"}'::jsonb,
        updated_at = now()
    where id = v_admin_uid;
  end if;

  -- Assign Role in public.user_roles
  insert into public.user_roles (user_id, role)
  values (v_admin_uid, 'admin')
  on conflict (user_id) do update set role = 'admin', assigned_at = now();

  -- Store Hashed PIN in public.user_security
  insert into public.user_security (user_id, email, pin_hash, updated_at)
  values (v_admin_uid, v_admin_email, extensions.crypt(v_admin_pin, extensions.gen_salt('bf')), now())
  on conflict (user_id) do update
  set email = v_admin_email,
      pin_hash = extensions.crypt(v_admin_pin, extensions.gen_salt('bf')),
      updated_at = now();

  -- Initialize Account Security Status (Must complete mandatory setup)
  insert into public.account_security (user_id, must_complete_security_setup)
  values (v_admin_uid, true)
  on conflict (user_id) do nothing;

  -- ============================================================================
  -- 2. SEED MASTER ADMIN ACCOUNT
  -- ============================================================================
  select id into v_master_uid from auth.users where lower(email) = lower(v_master_email);

  if v_master_uid is null then
    v_master_uid := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_master_uid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      v_master_email,
      extensions.crypt(v_master_pw, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Master Admin MyBengkel","role":"master_admin"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(v_master_pw, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = '{"name":"Master Admin MyBengkel","role":"master_admin"}'::jsonb,
        updated_at = now()
    where id = v_master_uid;
  end if;

  -- Assign Role in public.user_roles
  insert into public.user_roles (user_id, role)
  values (v_master_uid, 'master_admin')
  on conflict (user_id) do update set role = 'master_admin', assigned_at = now();

  -- Store Hashed PIN in public.user_security
  insert into public.user_security (user_id, email, pin_hash, updated_at)
  values (v_master_uid, v_master_email, extensions.crypt(v_master_pin, extensions.gen_salt('bf')), now())
  on conflict (user_id) do update
  set email = v_master_email,
      pin_hash = extensions.crypt(v_master_pin, extensions.gen_salt('bf')),
      updated_at = now();

  -- Initialize Account Security Status (Must complete mandatory setup)
  insert into public.account_security (user_id, must_complete_security_setup)
  values (v_master_uid, true)
  on conflict (user_id) do nothing;

  -- ============================================================================
  -- 3. SEED MASTER HELPDESK ACCOUNT
  -- ============================================================================
  select id into v_hd_uid from auth.users where lower(email) = lower(v_hd_email);

  if v_hd_uid is null then
    v_hd_uid := gen_random_uuid();
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) values (
      v_hd_uid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated',
      'authenticated',
      v_hd_email,
      extensions.crypt(v_hd_pw, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"name":"Master Helpdesk MyBengkel","role":"master_helpdesk"}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
    set encrypted_password = extensions.crypt(v_hd_pw, extensions.gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = '{"name":"Master Helpdesk MyBengkel","role":"master_helpdesk"}'::jsonb,
        updated_at = now()
    where id = v_hd_uid;
  end if;

  -- Assign Role in public.user_roles
  insert into public.user_roles (user_id, role)
  values (v_hd_uid, 'master_helpdesk')
  on conflict (user_id) do update set role = 'master_helpdesk', assigned_at = now();

  -- Store Hashed PIN in public.user_security
  insert into public.user_security (user_id, email, pin_hash, updated_at)
  values (v_hd_uid, v_hd_email, extensions.crypt(v_hd_pin, extensions.gen_salt('bf')), now())
  on conflict (user_id) do update
  set email = v_hd_email,
      pin_hash = extensions.crypt(v_hd_pin, extensions.gen_salt('bf')),
      updated_at = now();

  -- Initialize Account Security Status (Must complete mandatory setup)
  insert into public.account_security (user_id, must_complete_security_setup)
  values (v_hd_uid, true)
  on conflict (user_id) do nothing;

  raise notice 'Penyimpanan akun Admin, Master Admin, dan Master Helpdesk selesai.';
end;
$$;

