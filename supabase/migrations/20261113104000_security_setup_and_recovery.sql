-- ==============================================================================
-- MYBENGKEL - MANDATORY SECURITY SETUP, PASSWORD/PIN RECOVERY, AND BOOKING RLS
-- Migration: 20261113_security_setup_and_recovery.sql
-- ==============================================================================

-- 1. Ensure required extensions
create extension if not exists pgcrypto with schema extensions;

-- 2. Create account_security table
-- Tracks mandatory security setup for privileged accounts (admin, master_admin, master_helpdesk)
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

create index if not exists idx_account_security_must_complete 
  on public.account_security(must_complete_security_setup);

alter table public.account_security enable row level security;

-- RLS: Authenticated users can only read their own security setup status
drop policy if exists "Users can read own account security" on public.account_security;
create policy "Users can read own account security"
  on public.account_security
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Direct client update/insert/delete is prohibited. Only SECURITY DEFINER functions can modify this table.
drop policy if exists "No direct client modifications on account security" on public.account_security;
create policy "No direct client modifications on account security"
  on public.account_security
  for all
  to authenticated
  using (false);

-- 3. Create pin_recovery_tokens table
-- Stores cryptographically hashed, single-use, time-limited recovery tokens for PIN resets
create table if not exists public.pin_recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_pin_recovery_tokens_hash on public.pin_recovery_tokens(token_hash);
create index if not exists idx_pin_recovery_tokens_user on public.pin_recovery_tokens(user_id);
create index if not exists idx_pin_recovery_tokens_expires on public.pin_recovery_tokens(expires_at);

alter table public.pin_recovery_tokens enable row level security;

-- Client cannot query recovery tokens directly
drop policy if exists "No direct client access to recovery tokens" on public.pin_recovery_tokens;
create policy "No direct client access to recovery tokens"
  on public.pin_recovery_tokens
  for all
  to authenticated
  using (false);

-- 4. RPC: Get Account Security Status
-- Securely returns setup progress for the current authenticated user
create or replace function public.get_account_security_status()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
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

  -- Determine role from public.user_roles
  select role into v_role from public.user_roles where user_id = v_uid;
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    v_is_privileged := true;
  end if;

  -- Fetch user data from auth.users
  select email, email_confirmed_at, updated_at into v_user from auth.users where id = v_uid;
  if v_user.email_confirmed_at is not null then
    v_email_confirmed := true;
  end if;

  -- Fetch or initialize account_security row
  select * into v_sec from public.account_security where user_id = v_uid;
  if v_sec is null then
    -- For privileged users, must_complete_security_setup defaults to true.
    -- For customers, it is false.
    insert into public.account_security (user_id, must_complete_security_setup)
    values (v_uid, v_is_privileged)
    returning * into v_sec;
  end if;

  -- Privileged accounts must fulfill all 3 requirements:
  if v_is_privileged then
    v_pw_done := (v_sec.password_changed_at is not null);
    v_email_done := (v_sec.email_verified_at is not null);
    v_pin_done := (v_sec.pin_created_at is not null);

    if v_pw_done then v_completed_count := v_completed_count + 1; end if;
    if v_email_done then v_completed_count := v_completed_count + 1; end if;
    if v_pin_done then v_completed_count := v_completed_count + 1; end if;

    if v_completed_count = 3 and v_sec.must_complete_security_setup then
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

-- 5. RPC: Record Security Password Changed
-- Marks password step complete when Supabase Auth password update is confirmed
create or replace function public.record_security_password_changed()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  insert into public.account_security (user_id, password_changed_at, updated_at)
  values (v_uid, now(), now())
  on conflict (user_id) do update
  set password_changed_at = now(),
      updated_at = now();

  return public.get_account_security_status();
end;
$$;

-- 6. RPC: Record Security Email Changed
-- Marks email step complete after user confirms their new email address
create or replace function public.record_security_email_changed()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_user record;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  select email, email_confirmed_at into v_user from auth.users where id = v_uid;
  if v_user.email_confirmed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Email baru belum dikonfirmasi.');
  end if;

  insert into public.account_security (user_id, email_verified_at, updated_at)
  values (v_uid, now(), now())
  on conflict (user_id) do update
  set email_verified_at = now(),
      updated_at = now();

  return public.get_account_security_status();
end;
$$;

-- 7. RPC: Set Account Security PIN
-- Validates PIN policy (digits only, min 8 digits) and securely updates hashed PIN
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
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_pin_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sesi tidak terautentikasi.');
  end if;

  -- Determine user role
  select role into v_role from public.user_roles where user_id = v_uid;

  -- For administrative roles (admin, master_admin, master_helpdesk), the security PIN is strictly 12 digits
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if length(v_clean_pin) != 12 or v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if length(v_clean_pin) < 8 or length(v_clean_pin) > 12 or v_clean_pin !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'error', 'PIN harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  select email into v_user from auth.users where id = v_uid;
  if v_user.email is null then
    return jsonb_build_object('ok', false, 'error', 'Data pengguna tidak ditemukan.');
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

  -- Update account_security
  insert into public.account_security (user_id, pin_created_at, updated_at)
  values (v_uid, now(), now())
  on conflict (user_id) do update
  set pin_created_at = now(),
      updated_at = now();

  return public.get_account_security_status();
end;
$$;

-- 8. RPC: Request PIN Recovery
-- Generates single-use, 15-minute token for PIN reset
create or replace function public.request_pin_recovery(p_email text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid uuid;
  v_raw_token text;
  v_token_hash text;
  v_expires_at timestamptz := now() + interval '15 minutes';
begin
  if v_email = '' then
    return jsonb_build_object('ok', false, 'error', 'Email harus diisi.');
  end if;

  -- Look up user in auth.users
  select id into v_uid from auth.users where lower(email) = v_email;

  -- Generic response to prevent account enumeration
  if v_uid is null then
    return jsonb_build_object(
      'ok', true,
      'message', 'Jika email terdaftar, instruksi pemulihan PIN telah dikirim.'
    );
  end if;

  -- Invalidate any prior pending recovery tokens for this user
  update public.pin_recovery_tokens
  set used_at = now()
  where user_id = v_uid and used_at is null;

  -- Generate cryptographically random token (32 random bytes = 64 hex characters)
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := extensions.crypt(v_raw_token, extensions.gen_salt('bf', 8));

  insert into public.pin_recovery_tokens (user_id, email, token_hash, expires_at)
  values (v_uid, v_email, v_token_hash, v_expires_at);

  return jsonb_build_object(
    'ok', true,
    'message', 'Jika email terdaftar, instruksi pemulihan PIN telah dikirim.',
    'recovery_token', v_raw_token -- For development / edge function relay
  );
end;
$$;

-- 9. RPC: Verify and Reset PIN
-- Validates single-use token and updates user PIN securely
create or replace function public.verify_and_reset_pin(p_token text, p_new_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, auth
as $$
declare
  v_clean_token text := trim(coalesce(p_token, ''));
  v_clean_pin text := trim(coalesce(p_new_pin, ''));
  v_rec record;
  v_role text;
  v_found boolean := false;
  v_new_pin_hash text;
begin
  if v_clean_token = '' then
    return jsonb_build_object('ok', false, 'error', 'Token pemulihan PIN tidak valid.');
  end if;

  -- Find active, unexpired, unused token
  for v_rec in
    select id, user_id, email, token_hash
    from public.pin_recovery_tokens
    where used_at is null and expires_at > now()
    order by created_at desc
  loop
    if v_rec.token_hash = extensions.crypt(v_clean_token, v_rec.token_hash) then
      v_found := true;
      exit;
    end if;
  end loop;

  if not v_found then
    return jsonb_build_object('ok', false, 'error', 'Tautan pemulihan PIN tidak valid atau telah kedaluwarsa.');
  end if;

  -- Check user role
  select role into v_role from public.user_roles where user_id = v_rec.user_id;

  -- Validate PIN length and numeric format:
  -- Privileged accounts (admin, master_admin, master_helpdesk) strictly require exactly 12 numeric digits
  if v_role in ('admin', 'master_admin', 'master_helpdesk') then
    if length(v_clean_pin) != 12 or v_clean_pin !~ '^\d{12}$' then
      return jsonb_build_object('ok', false, 'error', 'PIN wajib terdiri dari 12 angka.');
    end if;
  else
    if length(v_clean_pin) < 8 or length(v_clean_pin) > 12 or v_clean_pin !~ '^\d+$' then
      return jsonb_build_object('ok', false, 'error', 'PIN baru harus berupa angka antara 8 hingga 12 digit.');
    end if;
  end if;

  -- Hash new PIN
  v_new_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));

  -- Update PIN in public.user_security
  insert into public.user_security (user_id, email, pin_hash, updated_at)
  values (v_rec.user_id, v_rec.email, v_new_pin_hash, now())
  on conflict (user_id) do update
  set pin_hash = v_new_pin_hash,
      updated_at = now();

  -- Update account_security
  insert into public.account_security (user_id, pin_created_at, updated_at)
  values (v_rec.user_id, now(), now())
  on conflict (user_id) do update
  set pin_created_at = now(),
      updated_at = now();

  -- Mark token as consumed atomically
  update public.pin_recovery_tokens
  set used_at = now()
  where id = v_rec.id;

  return jsonb_build_object(
    'ok', true,
    'message', 'PIN telah diperbarui.'
  );
end;
$$;

-- 10. Update Bookings Schema & RLS for Customer Ownership
-- Ensure bookings table has user_id and customer_email with appropriate RLS
alter table public.bookings add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.bookings add column if not exists customer_email text;
create index if not exists idx_bookings_user_id on public.bookings(user_id);
create index if not exists idx_bookings_customer_email on public.bookings(customer_email);

alter table public.bookings enable row level security;

-- Customers can view only their own bookings
drop policy if exists "Customers view own bookings" on public.bookings;
create policy "Customers view own bookings"
  on public.bookings
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or lower(trim(customer_email)) = lower(trim(auth.jwt() ->> 'email'))
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
      and ur.role in ('admin', 'master_admin', 'master_helpdesk')
    )
  );

-- Customers can create bookings
drop policy if exists "Customers insert bookings" on public.bookings;
create policy "Customers insert bookings"
  on public.bookings
  for insert
  to authenticated, anon
  with check (true);

-- Admins and Helpdesk can update bookings
drop policy if exists "Staff update bookings" on public.bookings;
create policy "Staff update bookings"
  on public.bookings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
      and ur.role in ('admin', 'master_admin', 'master_helpdesk')
    )
  );

