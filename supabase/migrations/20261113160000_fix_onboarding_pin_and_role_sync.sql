-- ==============================================================================
-- MYBENGKEL - ONBOARDING ROLE SYNC, 12-DIGIT PIN VALIDATION, AND SECURITY SETUP FIX
-- Migration: 20261113160000_fix_onboarding_pin_and_role_sync.sql
-- ==============================================================================

-- 1. Ensure user_roles allows master_admin and other roles cleanly
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'master_admin', 'customer', 'admin_gudang', 'master_gudang', 'master_helpdesk'));

-- 2. Enhanced get_account_security_status with onboarding role synchronization
create or replace function public.get_account_security_status()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_meta_role text;
  v_sec record;
  v_user record;
  v_email_confirmed boolean := false;
  v_is_privileged boolean := false;
  v_pw_done boolean := false;
  v_email_done boolean := false;
  v_pin_done boolean := false;
  v_must_complete boolean := false;
  v_completed_count int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  -- Fetch user data from auth.users
  select id, email, email_confirmed_at, raw_user_meta_data, updated_at 
  into v_user 
  from auth.users 
  where id = v_uid;

  if v_user.id is null then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna auth tidak ditemukan.');
  end if;

  if v_user.email_confirmed_at is not null then
    v_email_confirmed := true;
  end if;

  -- Determine role from public.user_roles
  select role into v_role from public.user_roles where user_id = v_uid;

  -- If user_roles is not yet populated, check metadata from onboarding signUp
  if v_role is null and v_user.raw_user_meta_data is not null then
    v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
    if v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'customer') then
      v_role := v_meta_role;
      insert into public.user_roles (user_id, role)
      values (v_uid, v_role)
      on conflict (user_id) do update set role = v_role;
    end if;
  end if;

  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    v_is_privileged := true;
  end if;

  -- Fetch or initialize account_security row
  select * into v_sec from public.account_security where user_id = v_uid;
  if v_sec is null then
    insert into public.account_security (user_id, must_complete_security_setup)
    values (v_uid, v_is_privileged)
    returning * into v_sec;
  end if;

  -- Sync email_verified_at if user has confirmed email in auth.users
  if v_email_confirmed and v_sec.email_verified_at is null then
    update public.account_security
    set email_verified_at = coalesce(v_user.email_confirmed_at, now()),
        updated_at = now()
    where user_id = v_uid
    returning * into v_sec;
  end if;

  -- Calculate completion for privileged accounts
  if v_is_privileged then
    v_pw_done := (v_sec.password_changed_at is not null);
    v_email_done := (v_sec.email_verified_at is not null);
    v_pin_done := (v_sec.pin_created_at is not null);

    if v_pw_done then v_completed_count := v_completed_count + 1; end if;
    if v_email_done then v_completed_count := v_completed_count + 1; end if;
    if v_pin_done then v_completed_count := v_completed_count + 1; end if;

    if v_completed_count >= 3 and v_sec.must_complete_security_setup then
      update public.account_security
      set must_complete_security_setup = false,
          security_setup_completed_at = now(),
          updated_at = now()
      where user_id = v_uid;
      v_must_complete := false;
    else
      v_must_complete := v_sec.must_complete_security_setup;
    end if;
  else
    v_must_complete := false;
    v_completed_count := 3;
    v_pw_done := true;
    v_email_done := true;
    v_pin_done := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'user_id', v_uid,
    'email', v_user.email,
    'role', coalesce(v_role, 'customer'),
    'is_privileged', v_is_privileged,
    'must_complete_security_setup', v_must_complete,
    'password_completed', v_pw_done,
    'email_completed', v_email_done,
    'pin_completed', v_pin_done,
    'completed_count', v_completed_count,
    'total_steps', 3,
    'email_confirmed', v_email_confirmed,
    'password_changed_at', v_sec.password_changed_at,
    'email_verified_at', v_sec.email_verified_at,
    'pin_created_at', v_sec.pin_created_at,
    'security_setup_completed_at', v_sec.security_setup_completed_at
  );
end;
$$;

-- 3. Enhanced set_account_security_pin with auto role sync & completion
create or replace function public.set_account_security_pin(p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
  v_role text;
  v_meta_role text;
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_pin_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  -- Fetch user data from auth.users
  select id, email, raw_user_meta_data, email_confirmed_at 
  into v_user 
  from auth.users 
  where id = v_uid;

  if v_user.id is null then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna tidak ditemukan.');
  end if;

  -- Determine user role from public.user_roles or metadata
  select role into v_role from public.user_roles where user_id = v_uid;
  if v_role is null and v_user.raw_user_meta_data is not null then
    v_meta_role := v_user.raw_user_meta_data->>'onboarding_role';
    if v_meta_role in ('admin', 'master_admin', 'master_helpdesk', 'admin_gudang', 'master_gudang', 'customer') then
      v_role := v_meta_role;
      insert into public.user_roles (user_id, role)
      values (v_uid, v_role)
      on conflict (user_id) do update set role = v_role;
    end if;
  end if;

  -- Default to admin if still null for privileged route
  if v_role is null then
    v_role := 'admin';
    insert into public.user_roles (user_id, role)
    values (v_uid, 'admin')
    on conflict (user_id) do update set role = 'admin';
  end if;

  -- Strict 12-digit PIN validation for privileged roles
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if length(v_clean_pin) != 12 or v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if length(v_clean_pin) < 8 or length(v_clean_pin) > 12 or v_clean_pin !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  -- Hash PIN securely using Blowfish salt
  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));

  -- Upsert into public.user_security
  insert into public.user_security (user_id, email, pin_hash, updated_at)
  values (v_uid, v_user.email, v_pin_hash, now())
  on conflict (user_id) do update
  set email = v_user.email,
      pin_hash = v_pin_hash,
      updated_at = now();

  -- Update account_security marking pin and setup as completed
  insert into public.account_security (
    user_id,
    pin_created_at,
    password_changed_at,
    email_verified_at,
    must_complete_security_setup,
    security_setup_completed_at,
    updated_at
  )
  values (
    v_uid,
    now(),
    now(),
    coalesce(v_user.email_confirmed_at, now()),
    false,
    now(),
    now()
  )
  on conflict (user_id) do update
  set pin_created_at = now(),
      password_changed_at = coalesce(public.account_security.password_changed_at, now()),
      email_verified_at = coalesce(public.account_security.email_verified_at, coalesce(v_user.email_confirmed_at, now())),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now();

  return public.get_account_security_status();
end;
$$;
