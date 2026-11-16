-- ==============================================================================
-- MYBENGKEL - FIX user_roles COLUMNS (assigned_at INSTEAD OF created_at/updated_at)
-- Migration: 20261116113000_fix_user_roles_columns.sql
--
-- Problem:
--   Production threw `column "created_at" of relation "user_roles" does not exist`
--   during POST /rest/v1/rpc/set_account_security_pin because public.user_roles
--   in the core schema uses `assigned_at`, not `created_at`.
--
-- Fix:
--   1. Add missing timestamp columns (assigned_at, created_at, updated_at) with
--      DEFAULT now() on public.user_roles for backward compatibility.
--   2. Update mb_ensure_user_role and set_account_security_pin so all INSERT/UPDATE
--      statements on public.user_roles reference `assigned_at` only.
--   3. Reload PostgREST schema cache.
-- ==============================================================================

alter table public.user_roles
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.mb_ensure_user_role(
  p_uid uuid,
  p_fallback_role text default 'admin'
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role text;
  v_meta_role text;
  v_email text;
  v_full_name text;
begin
  if p_uid is null then
    return null;
  end if;

  select role into v_role
  from public.user_roles
  where user_id = p_uid
  order by assigned_at desc nulls last
  limit 1;

  if v_role is not null then
    return v_role;
  end if;

  select email, raw_user_meta_data->>'onboarding_role', raw_user_meta_data->>'full_name'
  into v_email, v_meta_role, v_full_name
  from auth.users
  where id = p_uid;

  if v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'mekanik', 'customer') then
    v_role := v_meta_role;
  else
    v_role := coalesce(p_fallback_role, 'admin');
  end if;

  perform public.mb_sync_profile(p_uid, v_email, v_full_name);

  if not exists (select 1 from public.user_roles where user_id = p_uid and role = v_role) then
    if exists (select 1 from public.user_roles where user_id = p_uid) then
      update public.user_roles set role = v_role, assigned_at = now() where user_id = p_uid;
    else
      insert into public.user_roles (user_id, role, assigned_at)
      values (p_uid, v_role, now());
    end if;
  end if;

  return v_role;
end;
$$;

create or replace function public.set_account_security_pin(
  p_new_pin text default null,
  p_pin text default null,
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
  v_clean_pin text := regexp_replace(coalesce(nullif(trim(p_new_pin), ''), nullif(trim(p_pin), ''), ''), '\D', '', 'g');
  v_user record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_pin_hash text;
begin
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
    if v_clean_pin !~ '^\d{8,12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

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

  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
  perform public.mb_upsert_user_security_pin(v_user_id, v_email, v_pin_hash);

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

grant usage on schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
grant execute on function public.set_account_security_pin(text, text, text, text) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
