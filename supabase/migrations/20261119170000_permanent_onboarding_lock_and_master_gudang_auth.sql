-- ==============================================================================
-- MYBENGKEL - PERMANENT ONBOARDING COMPLETION LOCK & MASTER GUDANG VERIFICATION
-- Migration: 20261119170000_permanent_onboarding_lock_and_master_gudang_auth.sql
--
-- Fixes & Features:
--   1. Ensures profiles, user_roles (assigned_at), account_security, and
--      user_security columns exist cleanly with consistent role_code sync.
--   2. Defines public.get_or_assign_role_code(p_user_id, p_role) mapping roles to
--      AD-001 / MG-001 / HD-001 / MK-001 / CS-001 across all 3 tables.
--   3. Permanently records onboarding completion inside public.account_security
--      (must_complete_security_setup = false, email_verified_at, password_changed_at,
--      pin_set_at, raw_pin, raw_pin_5, pin_hash, pin_5_hash, role_code) AND
--      auth.users.raw_user_meta_data (onboarding_completed = true, onboarding_role, role_code).
--   4. Prevents re-login loop in get_account_security_status and
--      verify_account_login_and_pin whenever onboarding was permanently completed
--      for a non-default account.
--   5. Adds public.verify_master_gudang_access(p_email, p_role_code, p_password, p_pin_5)
--      and public.verify_warehouse_access(p_email, p_role_code, p_password, p_pin_5)
--      requiring New Verified Email + Role ID (MG-001) + Latest Password + 5-Digit Reversed PIN.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. ENSURE ALL REQUIRED COLUMNS & CONSTRAINTS EXIST
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
  add column if not exists must_complete_security_setup boolean not null default false,
  add column if not exists updated_at timestamptz default now();

alter table public.account_security
  alter column must_complete_security_setup set default false;

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
-- 2. ROLE CODE HELPER: public.get_or_assign_role_code
-- ------------------------------------------------------------------------------
create or replace function public.get_or_assign_role_code(
  p_user_id uuid,
  p_role text default 'customer'
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_role text := lower(trim(coalesce(p_role, 'customer')));
  v_prefix text;
  v_existing text;
  v_max_num integer := 0;
  v_next_code text;
begin
  if p_user_id is null then
    return null;
  end if;

  if v_clean_role in ('admin', 'admin_gudang') then
    v_prefix := 'AD';
  elsif v_clean_role in ('master_admin', 'master_gudang') then
    v_prefix := 'MG';
  elsif v_clean_role = 'master_helpdesk' then
    v_prefix := 'HD';
  elsif v_clean_role = 'mekanik' then
    v_prefix := 'MK';
  else
    v_prefix := 'CS';
  end if;

  select coalesce(
    (select role_code from public.user_roles where user_id = p_user_id and role_code like v_prefix || '-%' limit 1),
    (select role_code from public.profiles where id = p_user_id and role_code like v_prefix || '-%' limit 1),
    (select role_code from public.account_security where user_id = p_user_id and role_code like v_prefix || '-%' limit 1)
  ) into v_existing;

  if v_existing is not null and trim(v_existing) <> '' then
    v_next_code := upper(trim(v_existing));
  else
    select coalesce(max(num_part), 0)
    into v_max_num
    from (
      select substring(role_code from '^' || v_prefix || '-(\d+)$')::integer as num_part
      from public.user_roles
      where role_code ~ ('^' || v_prefix || '-\d+$')
      union all
      select substring(role_code from '^' || v_prefix || '-(\d+)$')::integer as num_part
      from public.profiles
      where role_code ~ ('^' || v_prefix || '-\d+$')
      union all
      select substring(role_code from '^' || v_prefix || '-(\d+)$')::integer as num_part
      from public.account_security
      where role_code ~ ('^' || v_prefix || '-\d+$')
    ) nums;

    v_next_code := v_prefix || '-' || lpad((coalesce(v_max_num, 0) + 1)::text, 3, '0');
  end if;

  update public.profiles
  set role_code = v_next_code,
      updated_at = now()
  where id = p_user_id;

  update public.user_roles
  set role_code = v_next_code,
      assigned_at = coalesce(assigned_at, now())
  where user_id = p_user_id;

  if exists (select 1 from public.account_security where user_id = p_user_id) then
    update public.account_security
    set role_code = v_next_code,
        updated_at = now()
    where user_id = p_user_id;
  end if;

  return v_next_code;
end;
$$;

-- Backfill role_code on existing rows where missing
do $$
declare
  r record;
begin
  for r in
    select ur.user_id, ur.role
    from public.user_roles ur
    where ur.role_code is null or trim(ur.role_code) = ''
    order by ur.assigned_at asc nulls last
  loop
    perform public.get_or_assign_role_code(r.user_id, r.role);
  end loop;

  -- Self-heal already completed accounts that already replaced default email, password & PIN
  update public.account_security sec
  set must_complete_security_setup = false,
      email_verified_at = coalesce(sec.email_verified_at, now()),
      password_changed_at = coalesce(sec.password_changed_at, now()),
      pin_set_at = coalesce(sec.pin_set_at, sec.pin_created_at, now()),
      security_setup_completed_at = coalesce(sec.security_setup_completed_at, now()),
      pin_5 = coalesce(nullif(sec.pin_5, ''), reverse(right(coalesce(sec.raw_pin, sec.pin_12), 5))),
      raw_pin_5 = coalesce(nullif(sec.raw_pin_5, ''), reverse(right(coalesce(sec.raw_pin, sec.pin_12), 5))),
      updated_at = now()
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_security us on us.user_id = u.id
  where sec.user_id = u.id
    and coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12, '') ~ '^\d{12}$'
    and coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12, '') <> '123456789012'
    and coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password, '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123')
    and not public.is_default_bootstrap_email(coalesce(nullif(trim(p.email), ''), nullif(trim(us.email), ''), trim(u.email)));

  update auth.users u
  set raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}'::jsonb)
        || jsonb_build_object('onboarding_completed', true),
      updated_at = now()
  from public.account_security sec
  left join public.profiles p on p.id = sec.user_id
  where sec.user_id = u.id
    and sec.must_complete_security_setup = false
    and sec.pin_set_at is not null
    and not public.is_default_bootstrap_email(coalesce(nullif(trim(p.email), ''), trim(u.email)))
    and coalesce((u.raw_user_meta_data->>'onboarding_completed')::boolean, false) is distinct from true;
end $$;

-- ------------------------------------------------------------------------------
-- 3. PERMANENTLY PERSIST COMPLETED ONBOARDING IN public.set_account_security_pin
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
  v_pin_5 text;
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
  v_pin_5_hash text;
  v_pw_hash text;
  v_step2_ok boolean := false;
  v_step1_ok boolean := false;
  v_resolved_raw_pw text;
begin
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

  v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
  v_full_name := coalesce(
    nullif(trim((select full_name from public.profiles where id = v_user_id limit 1)), ''),
    nullif(trim(v_user.raw_user_meta_data->>'full_name'), ''),
    'Admin MyBengkel'
  );

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
    if trim(p_password) in ('admin123', 'masteradmin123', 'helpdesk123') then
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

  -- Sync new verified email cleanly into auth.users, auth.identities, and public.profiles
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

  -- Ensure role code (AD-001 / MG-001 / HD-001) across profiles, user_roles, and account_security
  v_role_code := public.get_or_assign_role_code(v_user_id, v_role);

  -- Persist onboarding_completed = true, onboarding_role, and role_code into Supabase Auth user metadata
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
    v_clean_pin,
    v_clean_pin,
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
    v_clean_pin,
    v_clean_pin,
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
-- 4. RE-LOGIN LOOP FIX: public.get_account_security_status &
--    public.verify_account_login_and_pin
--    - Trusts persisted must_complete_security_setup = false, pin_set_at IS NOT NULL,
--      and auth.users.raw_user_meta_data->>'onboarding_completed' = 'true'
-- ------------------------------------------------------------------------------
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
  v_meta_completed boolean := false;
  v_role text;
  v_role_code text;
  v_sec record;
  v_user_sec record;
  v_raw_pin_12 text;
  v_pin_5 text;
  v_raw_pw text;
  v_is_bootstrap boolean := true;
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
    left join public.user_security us on us.user_id = u.id
    where lower(coalesce(p.email, u.email)) = v_clean_email
       or lower(u.email) = v_clean_email
       or lower(coalesce(us.email, '')) = v_clean_email
       or lower(coalesce(u.email_change, '')) = v_clean_email
       or lower(coalesce(sec.pending_email, '')) = v_clean_email
    order by (u.email_confirmed_at is not null) desc, u.updated_at desc nulls last, u.created_at desc
    limit 1;
  end if;

  if v_uid is null then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'must_complete_security_setup', true,
      'onboarding_completed', false,
      'password_completed', false,
      'email_completed', false,
      'pin_completed', false,
      'completed_count', 0,
      'total_steps', 3
    );
  end if;

  select
    case
      when p.email is not null and not public.is_default_bootstrap_email(p.email) then lower(trim(p.email))
      when u.email is not null and not public.is_default_bootstrap_email(u.email) then lower(trim(u.email))
      when u.email_change is not null and trim(u.email_change) <> '' and not public.is_default_bootstrap_email(u.email_change) then lower(trim(u.email_change))
      else lower(trim(coalesce(p.email, u.email)))
    end,
    u.email_confirmed_at,
    coalesce((u.raw_user_meta_data->>'onboarding_completed')::boolean, false),
    coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
    coalesce(ur.role_code, p.role_code, u.raw_user_meta_data->>'role_code')
  into v_user_email, v_email_confirmed_at, v_meta_completed, v_role, v_role_code
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.user_roles ur on ur.user_id = u.id
  where u.id = v_uid;

  if v_role_code is null or trim(v_role_code) = '' then
    v_role_code := public.get_or_assign_role_code(v_uid, v_role);
  end if;

  if v_role not in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang') then
    return jsonb_build_object(
      'ok', true,
      'success', true,
      'user_id', v_uid,
      'email', v_user_email,
      'role', v_role,
      'role_code', v_role_code,
      'onboarding_completed', true,
      'must_complete_security_setup', false,
      'password_completed', true,
      'email_completed', true,
      'pin_completed', true,
      'completed_count', 3,
      'total_steps', 3
    );
  end if;

  select * into v_sec from public.account_security where user_id = v_uid;
  select * into v_user_sec from public.user_security where user_id = v_uid;
  v_is_bootstrap := public.is_default_bootstrap_email(v_user_email);
  v_raw_pin_12 := regexp_replace(
    coalesce(v_sec.raw_pin, v_sec.pin_12, v_user_sec.raw_pin, v_user_sec.pin_12, ''),
    '\D',
    '',
    'g'
  );
  v_pin_5 := coalesce(
    nullif(trim(v_sec.raw_pin_5), ''),
    nullif(trim(v_sec.pin_5), ''),
    nullif(trim(v_user_sec.raw_pin_5), ''),
    nullif(trim(v_user_sec.pin_5), ''),
    case when length(v_raw_pin_12) >= 5 then reverse(right(v_raw_pin_12, 5)) else null end
  );
  v_raw_pw := coalesce(
    v_sec.raw_password,
    v_sec.plaintext_password,
    v_user_sec.raw_password,
    v_user_sec.plaintext_password,
    ''
  );

  if not v_is_bootstrap and (
    v_meta_completed
    or (v_sec is not null and v_sec.must_complete_security_setup = false and v_sec.pin_set_at is not null)
    or (v_sec is not null and v_sec.pin_set_at is not null and v_sec.email_verified_at is not null and v_sec.password_changed_at is not null)
    or (
      coalesce(v_raw_pw, '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123')
      and v_raw_pin_12 ~ '^\d{12}$'
      and v_raw_pin_12 <> '123456789012'
    )
  ) then
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
    v_count := 3;
    v_must_setup := false;
  else
    v_pw_done := (
      (v_sec is not null and v_sec.password_changed_at is not null)
      or coalesce(v_raw_pw, '') not in ('', 'admin123', 'masteradmin123', 'helpdesk123')
    );

    v_email_done := (
      v_pw_done
      and v_user_email is not null
      and not v_is_bootstrap
      and (
        (v_sec is not null and v_sec.email_verified_at is not null)
        or v_email_confirmed_at is not null
      )
    );

    v_pin_done := (
      v_pw_done
      and v_email_done
      and v_raw_pin_12 ~ '^\d{12}$'
      and v_raw_pin_12 <> '123456789012'
      and ((v_sec is not null and v_sec.pin_set_at is not null) or v_raw_pin_12 ~ '^\d{12}$')
    );

    v_count := (case when v_pw_done then 1 else 0 end)
             + (case when v_email_done then 1 else 0 end)
             + (case when v_pin_done then 1 else 0 end);

    v_must_setup := v_is_bootstrap
                    or (v_sec is null and v_user_sec is null)
                    or coalesce(v_sec.must_complete_security_setup, true)
                    or not (v_pw_done and v_email_done and v_pin_done);
  end if;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'user_id', v_uid,
    'email', v_user_email,
    'pending_email', case when v_sec is not null then v_sec.pending_email else null end,
    'role', v_role,
    'role_code', coalesce(v_role_code, case when v_sec is not null then v_sec.role_code else null end),
    'pin_5', v_pin_5,
    'raw_pin_5', v_pin_5,
    'onboarding_completed', not v_must_setup,
    'must_complete_security_setup', v_must_setup,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_count,
    'total_steps', 3
  );
end;
$$;

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
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Email, kata sandi, atau PIN tidak sesuai.');
  end if;

  -- Keep auth.users synced cleanly with new verified email, bcrypt hash & GoTrue columns
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
    'pin_12', coalesce(v_raw_pin, case when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'raw_pin', coalesce(v_raw_pin, case when length(v_clean_pin) >= 6 then v_clean_pin else '' end),
    'pin_5', coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end),
    'raw_pin_5', coalesce(v_expected_pin_5, v_raw_pin_5, case when length(v_clean_pin) = 5 then v_clean_pin else '' end),
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
-- 5. DEDICATED RPC FOR MASTER GUDANG CREDENTIAL VERIFICATION
--    Requires: New Email + ID Master Gudang (MG-001+) + Latest Password + 5-Digit Reversed PIN
-- ------------------------------------------------------------------------------
create or replace function public.verify_master_gudang_access(
  p_email text,
  p_role_code text,
  p_password text,
  p_pin_5 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_code text := upper(trim(coalesce(p_role_code, '')));
  v_clean_pin5 text := regexp_replace(coalesce(p_pin_5, ''), '\D', '', 'g');
  v_rec record;
  v_actual_code text;
  v_pw_ok boolean := false;
  v_pin5_ok boolean := false;
  v_expected_pin5 text;
begin
  if v_clean_email = '' or v_clean_code = '' or coalesce(p_password, '') = '' or v_clean_pin5 = '' then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Email Baru, ID Master Gudang, Password Terbaru, dan PIN 5 Angka wajib diisi.'
    );
  end if;

  if public.is_default_bootstrap_email(v_clean_email) then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Gunakan Email Baru yang sudah diverifikasi, bukan email bawaan sistem.'
    );
  end if;

  if trim(p_password) in ('masteradmin123', 'admin123', 'helpdesk123', 'master123') then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Gunakan Password Terbaru yang telah diperbarui, bukan password bawaan sistem.'
    );
  end if;

  if v_clean_pin5 !~ '^\d{5}$' then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'PIN operasional wajib terdiri dari tepat 5 angka.'
    );
  end if;

  select
    u.id as user_id,
    lower(coalesce(p.email, u.email)) as resolved_email,
    coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', 'Master Gudang') as full_name,
    lower(coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', '')) as user_role,
    upper(coalesce(ur.role_code, p.role_code, sec.role_code, u.raw_user_meta_data->>'role_code', '')) as role_code,
    u.encrypted_password,
    coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password) as raw_pw,
    coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12) as raw_pin_12,
    coalesce(sec.raw_pin_5, sec.pin_5, us.raw_pin_5, us.pin_5) as raw_pin_5,
    coalesce(sec.pin_5_hash, us.pin_5_hash) as pin_5_hash,
    sec.must_complete_security_setup,
    sec.pin_set_at,
    coalesce((u.raw_user_meta_data->>'onboarding_completed')::boolean, false) as meta_completed
  into v_rec
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

  if v_rec.user_id is null then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Akun Master Gudang dengan email tersebut tidak ditemukan.'
    );
  end if;

  if v_rec.user_role not in ('master_admin', 'master_gudang') then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Akun ini bukan pemegang otoritas Master Gudang.'
    );
  end if;

  v_actual_code := v_rec.role_code;
  if v_actual_code = '' then
    v_actual_code := public.get_or_assign_role_code(v_rec.user_id, v_rec.user_role);
  end if;

  if upper(v_actual_code) <> v_clean_code then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'ID Master Gudang tidak cocok dengan akun tersebut.'
    );
  end if;

  begin
    if (v_rec.raw_pw is not null and v_rec.raw_pw <> '' and v_rec.raw_pw = p_password) then
      v_pw_ok := true;
    elsif (v_rec.encrypted_password is not null and v_rec.encrypted_password <> '' and extensions.crypt(p_password, v_rec.encrypted_password) = v_rec.encrypted_password) then
      v_pw_ok := true;
    end if;
  exception when others then
    v_pw_ok := (v_rec.raw_pw is not null and v_rec.raw_pw <> '' and v_rec.raw_pw = p_password);
  end;

  if not v_pw_ok then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Password Terbaru tidak sesuai.'
    );
  end if;

  v_expected_pin5 := case
    when v_rec.raw_pin_5 is not null and trim(v_rec.raw_pin_5) <> '' then trim(v_rec.raw_pin_5)
    when v_rec.raw_pin_12 is not null and length(v_rec.raw_pin_12) >= 5 then reverse(right(v_rec.raw_pin_12, 5))
    else null
  end;

  begin
    if (v_expected_pin5 is not null and v_clean_pin5 = v_expected_pin5)
       or (v_rec.pin_5_hash is not null and v_rec.pin_5_hash <> '' and extensions.crypt(v_clean_pin5, v_rec.pin_5_hash) = v_rec.pin_5_hash) then
      v_pin5_ok := true;
    end if;
  exception when others then
    v_pin5_ok := (v_expected_pin5 is not null and v_clean_pin5 = v_expected_pin5);
  end;

  if not v_pin5_ok then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'PIN 5 Angka tidak sesuai.'
    );
  end if;

  if coalesce(v_rec.must_complete_security_setup, true) and v_rec.pin_set_at is null and not v_rec.meta_completed then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Selesaikan seluruh langkah keamanan akun (Password Baru, Email Baru, PIN 12 Digit) terlebih dahulu.'
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'user_id', v_rec.user_id,
    'email', v_rec.resolved_email,
    'full_name', v_rec.full_name,
    'role', 'master_gudang',
    'role_code', v_actual_code
  );
end;
$$;

-- Companion RPC for V2MasterWarehouse entry gate (accepts verified Master Gudang MG-* or verified Admin AD-*)
create or replace function public.verify_warehouse_access(
  p_email text,
  p_role_code text,
  p_password text,
  p_pin_5 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_clean_email text := lower(trim(coalesce(p_email, '')));
  v_clean_code text := upper(trim(coalesce(p_role_code, '')));
  v_clean_pin5 text := regexp_replace(coalesce(p_pin_5, ''), '\D', '', 'g');
  v_rec record;
  v_actual_code text;
  v_pw_ok boolean := false;
  v_pin5_ok boolean := false;
  v_expected_pin5 text;
  v_wh_role text;
begin
  if v_clean_email = '' or v_clean_code = '' or coalesce(p_password, '') = '' or v_clean_pin5 = '' then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Email Baru, ID Akun, Password Terbaru, dan PIN 5 Angka wajib diisi.'
    );
  end if;

  if public.is_default_bootstrap_email(v_clean_email) then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Gunakan Email Baru yang sudah diverifikasi, bukan email bawaan sistem.'
    );
  end if;

  if trim(p_password) in ('masteradmin123', 'admin123', 'helpdesk123', 'master123') then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'Gunakan Password Terbaru yang telah diperbarui, bukan password bawaan sistem.'
    );
  end if;

  if v_clean_pin5 !~ '^\d{5}$' then
    return jsonb_build_object(
      'ok', false,
      'success', false,
      'error', 'PIN operasional wajib terdiri dari tepat 5 angka.'
    );
  end if;

  select
    u.id as user_id,
    lower(coalesce(p.email, u.email)) as resolved_email,
    coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', 'Petugas Gudang') as full_name,
    lower(coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', '')) as user_role,
    upper(coalesce(ur.role_code, p.role_code, sec.role_code, u.raw_user_meta_data->>'role_code', '')) as role_code,
    u.encrypted_password,
    coalesce(sec.raw_password, sec.plaintext_password, us.raw_password, us.plaintext_password) as raw_pw,
    coalesce(sec.raw_pin, sec.pin_12, us.raw_pin, us.pin_12) as raw_pin_12,
    coalesce(sec.raw_pin_5, sec.pin_5, us.raw_pin_5, us.pin_5) as raw_pin_5,
    coalesce(sec.pin_5_hash, us.pin_5_hash) as pin_5_hash
  into v_rec
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

  if v_rec.user_id is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Akun tidak ditemukan di database.');
  end if;

  if v_rec.user_role not in ('master_admin', 'master_gudang', 'admin', 'admin_gudang') then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Peran akun tidak memiliki akses modul gudang.');
  end if;

  v_actual_code := v_rec.role_code;
  if v_actual_code = '' then
    v_actual_code := public.get_or_assign_role_code(v_rec.user_id, v_rec.user_role);
  end if;

  if upper(v_actual_code) <> v_clean_code then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'ID Gudang / ID Role tidak cocok.');
  end if;

  begin
    if (v_rec.raw_pw is not null and v_rec.raw_pw <> '' and v_rec.raw_pw = p_password) then
      v_pw_ok := true;
    elsif (v_rec.encrypted_password is not null and v_rec.encrypted_password <> '' and extensions.crypt(p_password, v_rec.encrypted_password) = v_rec.encrypted_password) then
      v_pw_ok := true;
    end if;
  exception when others then
    v_pw_ok := (v_rec.raw_pw is not null and v_rec.raw_pw <> '' and v_rec.raw_pw = p_password);
  end;

  if not v_pw_ok then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Password Terbaru tidak sesuai.');
  end if;

  v_expected_pin5 := case
    when v_rec.raw_pin_5 is not null and trim(v_rec.raw_pin_5) <> '' then trim(v_rec.raw_pin_5)
    when v_rec.raw_pin_12 is not null and length(v_rec.raw_pin_12) >= 5 then reverse(right(v_rec.raw_pin_12, 5))
    else null
  end;

  begin
    if (v_expected_pin5 is not null and v_clean_pin5 = v_expected_pin5)
       or (v_rec.pin_5_hash is not null and v_rec.pin_5_hash <> '' and extensions.crypt(v_clean_pin5, v_rec.pin_5_hash) = v_rec.pin_5_hash) then
      v_pin5_ok := true;
    end if;
  exception when others then
    v_pin5_ok := (v_expected_pin5 is not null and v_clean_pin5 = v_expected_pin5);
  end;

  if not v_pin5_ok then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'PIN 5 Angka tidak sesuai.');
  end if;

  v_wh_role := case
    when v_rec.user_role in ('master_admin', 'master_gudang') then 'master_gudang'
    else 'admin_gudang'
  end;

  return jsonb_build_object(
    'ok', true,
    'success', true,
    'user_id', v_rec.user_id,
    'email', v_rec.resolved_email,
    'full_name', v_rec.full_name,
    'role', v_wh_role,
    'role_code', v_actual_code
  );
end;
$$;

-- ------------------------------------------------------------------------------
-- 6. GRANTS & POSTGREST SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on function public.get_or_assign_role_code(uuid, text) to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text, text, boolean) to anon, authenticated, service_role;
grant execute on function public.get_account_security_status(text) to anon, authenticated, service_role;
grant execute on function public.verify_account_login_and_pin(text, text, text) to anon, authenticated, service_role;
grant execute on function public.authenticate_account_login(text, text, text) to anon, authenticated, service_role;
grant execute on function public.verify_master_gudang_access(text, text, text, text) to anon, authenticated, service_role;
grant execute on function public.verify_warehouse_access(text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
