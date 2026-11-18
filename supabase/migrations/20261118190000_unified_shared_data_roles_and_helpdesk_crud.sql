-- ==============================================================================
-- MYBENGKEL - UNIFIED SHARED WORKSHOP DATA, ROLE CODES, AND HELPDESK CRUD
-- Migration: 20261118190000_unified_shared_data_roles_and_helpdesk_crud.sql
--
-- Features:
--   1. Sequential role codes (AD-001, MG-001, HD-001, MK-001, CS-001) and
--      derived 5-digit PIN (reverse(right(pin_12, 5)), e.g. 123456789012 -> 21098).
--   2. Centralized shared workshop state & normalized shared tables without
--      per-admin user_id isolation across Admin, Master Gudang, and Helpdesk.
--   3. Realtime publication & open workshop RLS policies for shared datasets.
--   4. SECURITY DEFINER Helpdesk Superuser CRUD RPCs (list, upsert, delete).
--   5. Full GRANTS and PostgREST schema cache reload.
-- ==============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------------------------
-- 1. ROLE CODE, PIN, AND PLAINTEXT COLUMNS ON AUTH/SECURITY TABLES
-- ------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists role_code text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.user_roles
  add column if not exists role_code text,
  add column if not exists assigned_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Expand role constraint on public.user_roles safely
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.user_roles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop
    execute format('alter table public.user_roles drop constraint if exists %I', c.conname);
  end loop;
end;
$$;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer'));

alter table public.account_security
  add column if not exists role_code text,
  add column if not exists plaintext_password text,
  add column if not exists raw_password text,
  add column if not exists pin_12 text,
  add column if not exists raw_pin text,
  add column if not exists pin_5 text,
  add column if not exists raw_pin_5 text,
  add column if not exists pin_5_hash text,
  add column if not exists last_modified_by_helpdesk_at timestamptz,
  add column if not exists pin_set_at timestamptz,
  add column if not exists must_complete_security_setup boolean not null default true,
  add column if not exists password_changed_at timestamptz,
  add column if not exists email_verified_at timestamptz,
  add column if not exists pin_created_at timestamptz,
  add column if not exists security_setup_completed_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_security (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  pin_hash text,
  pin_5_hash text,
  pin_12 text,
  pin_5 text,
  plaintext_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_security
  add column if not exists email text,
  add column if not exists pin_hash text,
  add column if not exists pin_5_hash text,
  add column if not exists pin_12 text,
  add column if not exists pin_5 text,
  add column if not exists plaintext_password text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_profiles_role_code on public.profiles(role_code);
create index if not exists idx_user_roles_role_code on public.user_roles(role_code);

-- ------------------------------------------------------------------------------
-- 2. SEQUENTIAL ROLE CODE ASSIGNMENT HELPER
-- Maps role -> AD-001, MG-001, HD-001, MK-001, CS-001
-- ------------------------------------------------------------------------------
create or replace function public.assign_sequential_role_code(
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

  if v_existing is not null and v_existing <> '' then
    v_next_code := v_existing;
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

create or replace function public.generate_role_code(
  p_role text,
  p_user_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_clean_role text := lower(trim(coalesce(p_role, 'customer')));
  v_prefix text;
  v_max_num integer := 0;
begin
  if p_user_id is not null then
    return public.assign_sequential_role_code(p_user_id, v_clean_role);
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

  return v_prefix || '-' || lpad((coalesce(v_max_num, 0) + 1)::text, 3, '0');
end;
$$;

-- Backfill role_code on existing user_roles / profiles without a code
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
    perform public.assign_sequential_role_code(r.user_id, r.role);
  end loop;
end;
$$;

-- ------------------------------------------------------------------------------
-- 3. CENTRALIZED SHARED WORKSHOP STATE & NORMALIZED TABLES (ZERO ISOLATION)
-- ------------------------------------------------------------------------------
create table if not exists public.shared_workshop_state (
  id text primary key default 'global',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id text primary key,
  customer_name text,
  customer_email text,
  customer_phone text,
  plate text,
  engine_no text,
  frame_no text,
  service text,
  date text,
  hour text,
  status text default 'menunggu',
  source text default 'online',
  complaint text,
  service_form_id text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bookings
  add column if not exists customer_name text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists plate text,
  add column if not exists engine_no text,
  add column if not exists frame_no text,
  add column if not exists service text,
  add column if not exists date text,
  add column if not exists hour text,
  add column if not exists status text,
  add column if not exists source text,
  add column if not exists complaint text,
  add column if not exists service_form_id text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.service_orders (
  id text primary key,
  booking_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.work_orders (
  id text primary key,
  service_form_id text,
  mechanic_id text,
  end_state text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.work_orders
  add column if not exists service_form_id text,
  add column if not exists mechanic_id text,
  add column if not exists end_state text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.parts (
  id text primary key,
  kode text,
  nama text,
  satuan text,
  jenis text,
  harga_beli numeric default 0,
  harga_jual numeric default 0,
  stok_min integer,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.parts
  add column if not exists kode text,
  add column if not exists nama text,
  add column if not exists satuan text,
  add column if not exists jenis text,
  add column if not exists harga_beli numeric default 0,
  add column if not exists harga_jual numeric default 0,
  add column if not exists stok_min integer,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.part_requests (
  id text primary key,
  order_code text,
  type text,
  state text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.part_sales (
  id text primary key,
  number text,
  customer_name text,
  total numeric default 0,
  payment_status text,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Enable RLS with shared workshop visibility across Admin, Master Gudang, Helpdesk
alter table public.shared_workshop_state enable row level security;
alter table public.bookings enable row level security;
alter table public.service_orders enable row level security;
alter table public.work_orders enable row level security;
alter table public.parts enable row level security;
alter table public.part_requests enable row level security;
alter table public.part_sales enable row level security;

drop policy if exists "Shared workshop state read all" on public.shared_workshop_state;
create policy "Shared workshop state read all"
  on public.shared_workshop_state for select
  to anon, authenticated
  using (true);

drop policy if exists "Shared workshop state write all" on public.shared_workshop_state;
create policy "Shared workshop state write all"
  on public.shared_workshop_state for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Customers view own bookings" on public.bookings;
drop policy if exists "Customers insert bookings" on public.bookings;
drop policy if exists "Staff update bookings" on public.bookings;
drop policy if exists "Shared workshop bookings read all" on public.bookings;
drop policy if exists "Shared workshop bookings write all" on public.bookings;

create policy "Shared workshop bookings read all"
  on public.bookings for select
  to anon, authenticated
  using (true);

create policy "Shared workshop bookings write all"
  on public.bookings for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Shared service orders access" on public.service_orders;
create policy "Shared service orders access"
  on public.service_orders for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Shared work orders access" on public.work_orders;
create policy "Shared work orders access"
  on public.work_orders for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Shared parts access" on public.parts;
create policy "Shared parts access"
  on public.parts for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Shared part requests access" on public.part_requests;
create policy "Shared part requests access"
  on public.part_requests for all
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "Shared part sales access" on public.part_sales;
create policy "Shared part sales access"
  on public.part_sales for all
  to anon, authenticated
  using (true)
  with check (true);

-- Add shared tables to Supabase Realtime publication cleanly
do $$
begin
  alter publication supabase_realtime add table public.shared_workshop_state;
exception when others then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.bookings;
exception when others then null;
end;
$$;

-- ------------------------------------------------------------------------------
-- 4. CENTRALIZED SHARED DATA RPCs (GET & SAVE WORKSHOP STATE)
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
begin
  select * into v_row
  from public.shared_workshop_state
  where id = 'global'
  limit 1;

  select coalesce(jsonb_agg(coalesce(nullif(b.payload, '{}'::jsonb), to_jsonb(b))), '[]'::jsonb)
  into v_bookings_rows
  from public.bookings b;

  return jsonb_build_object(
    'ok', true,
    'payload', coalesce(v_row.payload, '{}'::jsonb),
    'bookings_rows', coalesce(v_bookings_rows, '[]'::jsonb),
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
  values ('global', p_payload, v_now)
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
          id, kode, nama, satuan, jenis, harga_beli, harga_jual, stok_min, payload, updated_at
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

  -- Mirror purchaseRequests -> part_requests
  if jsonb_typeof(p_payload->'purchaseRequests') = 'array' then
    for v_elem in select * from jsonb_array_elements(p_payload->'purchaseRequests')
    loop
      if coalesce(v_elem->>'id', '') <> '' then
        insert into public.part_requests (id, order_code, type, state, payload, updated_at)
        values (v_elem->>'id', v_elem->>'orderCode', v_elem->>'type', v_elem->>'state', v_elem, v_now)
        on conflict (id) do update
        set order_code = excluded.order_code,
            type = excluded.type,
            state = excluded.state,
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
-- 5. UPDATE set_account_security_pin TO PERSIST pin_12, pin_5 & role_code
-- ------------------------------------------------------------------------------
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
  v_pin_5 text;
  v_user record;
  v_email text;
  v_meta_role text;
  v_full_name text;
  v_role text;
  v_role_code text;
  v_pin_hash text;
  v_pin_5_hash text;
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

  -- Compute 5-digit derived PIN: reverse of last 5 digits (123456789012 -> 21098)
  v_pin_5 := reverse(right(v_clean_pin, 5));

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

  v_role_code := public.assign_sequential_role_code(v_user_id, coalesce(v_role, 'admin'));

  v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
  v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));

  insert into public.user_security (user_id, email, pin_hash, pin_5_hash, pin_12, pin_5, updated_at)
  values (v_user_id, v_email, v_pin_hash, v_pin_5_hash, v_clean_pin, v_pin_5, now())
  on conflict (user_id) do update
  set email = excluded.email,
      pin_hash = excluded.pin_hash,
      pin_5_hash = excluded.pin_5_hash,
      pin_12 = excluded.pin_12,
      pin_5 = excluded.pin_5,
      updated_at = now();

  insert into public.account_security (
    user_id, role_code, pin_12, raw_pin, pin_5, raw_pin_5, pin_5_hash,
    pin_created_at, pin_set_at, password_changed_at, email_verified_at,
    must_complete_security_setup, security_setup_completed_at, updated_at
  )
  values (
    v_user_id, v_role_code, v_clean_pin, v_clean_pin, v_pin_5, v_pin_5, v_pin_5_hash,
    now(), now(), now(), coalesce(v_user.email_confirmed_at, now()),
    false, now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      pin_12 = excluded.pin_12,
      raw_pin = excluded.raw_pin,
      pin_5 = excluded.pin_5,
      raw_pin_5 = excluded.raw_pin_5,
      pin_5_hash = excluded.pin_5_hash,
      pin_created_at = now(),
      pin_set_at = now(),
      password_changed_at = coalesce(public.account_security.password_changed_at, now()),
      email_verified_at = coalesce(public.account_security.email_verified_at, v_user.email_confirmed_at, now()),
      must_complete_security_setup = false,
      security_setup_completed_at = now(),
      updated_at = now();

  return jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'role', coalesce(v_role, 'admin'),
    'role_code', v_role_code,
    'pin_5', v_pin_5,
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

-- ------------------------------------------------------------------------------
-- 6. HELPDESK DEVELOPER SUPERUSER ACCOUNT CRUD RPCs
-- ------------------------------------------------------------------------------
create or replace function public.helpdesk_list_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_rows jsonb;
begin
  select coalesce(jsonb_agg(item order by item->>'role_code' asc, item->>'email' asc), '[]'::jsonb)
  into v_rows
  from (
    select jsonb_build_object(
      'user_id', u.id,
      'email', coalesce(p.email, u.email),
      'full_name', coalesce(nullif(trim(p.full_name), ''), u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      'role', coalesce(ur.role, u.raw_user_meta_data->>'onboarding_role', 'customer'),
      'role_code', coalesce(ur.role_code, p.role_code, sec.role_code),
      'plaintext_password', coalesce(sec.plaintext_password, sec.raw_password, us.plaintext_password),
      'raw_password', coalesce(sec.raw_password, sec.plaintext_password, us.plaintext_password),
      'pin_12', coalesce(sec.pin_12, sec.raw_pin, us.pin_12),
      'raw_pin', coalesce(sec.raw_pin, sec.pin_12, us.pin_12),
      'pin_5', coalesce(sec.pin_5, sec.raw_pin_5, us.pin_5, reverse(right(coalesce(sec.pin_12, sec.raw_pin, us.pin_12, ''), 5))),
      'raw_pin_5', coalesce(sec.raw_pin_5, sec.pin_5, us.pin_5, reverse(right(coalesce(sec.pin_12, sec.raw_pin, us.pin_12, ''), 5))),
      'email_confirmed', (u.email_confirmed_at is not null),
      'created_at', u.created_at
    ) as item
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.user_roles ur on ur.user_id = u.id
    left join public.account_security sec on sec.user_id = u.id
    left join public.user_security us on us.user_id = u.id
  ) sub;

  return jsonb_build_object('ok', true, 'accounts', coalesce(v_rows, '[]'::jsonb));
end;
$$;

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
  v_clean_role text := lower(trim(coalesce(p_role, 'customer')));
  v_clean_name text := trim(coalesce(p_full_name, ''));
  v_clean_pin text := regexp_replace(coalesce(p_pin_12, ''), '\D', '', 'g');
  v_pin_5 text;
  v_role_code text := nullif(trim(coalesce(p_role_code, '')), '');
  v_pw_hash text;
  v_pin_hash text;
  v_pin_5_hash text;
begin
  if v_clean_email = '' and v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Email atau User ID target wajib diisi.');
  end if;

  if v_clean_role not in ('admin', 'admin_gudang', 'master_admin', 'master_gudang', 'master_helpdesk', 'mekanik', 'customer') then
    v_clean_role := 'customer';
  end if;

  if v_uid is null and v_clean_email <> '' then
    select id into v_uid from auth.users where lower(email) = v_clean_email limit 1;
  end if;

  if v_clean_pin <> '' then
    v_pin_5 := reverse(right(v_clean_pin, 5));
    v_pin_hash := extensions.crypt(v_clean_pin, extensions.gen_salt('bf', 8));
    v_pin_5_hash := extensions.crypt(v_pin_5, extensions.gen_salt('bf', 8));
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
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) ||
          jsonb_build_object(
            'full_name', coalesce(nullif(v_clean_name, ''), raw_user_meta_data->>'full_name'),
            'onboarding_role', v_clean_role
          ),
        updated_at = now()
    where id = v_uid;
  end if;

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
    user_id, role_code, plaintext_password, raw_password, pin_12, raw_pin, pin_5, raw_pin_5, pin_5_hash,
    last_modified_by_helpdesk_at, must_complete_security_setup, password_changed_at, email_verified_at, pin_created_at, security_setup_completed_at, updated_at
  )
  values (
    v_uid, v_role_code, nullif(p_password, ''), nullif(p_password, ''), nullif(v_clean_pin, ''), nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(v_pin_5, ''), v_pin_5_hash,
    now(), false, now(), now(), now(), now(), now()
  )
  on conflict (user_id) do update
  set role_code = coalesce(excluded.role_code, public.account_security.role_code),
      plaintext_password = coalesce(nullif(p_password, ''), public.account_security.plaintext_password),
      raw_password = coalesce(nullif(p_password, ''), public.account_security.raw_password),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.account_security.pin_12),
      raw_pin = coalesce(nullif(v_clean_pin, ''), public.account_security.raw_pin),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.pin_5),
      raw_pin_5 = coalesce(nullif(v_pin_5, ''), public.account_security.raw_pin_5),
      pin_5_hash = coalesce(v_pin_5_hash, public.account_security.pin_5_hash),
      last_modified_by_helpdesk_at = now(),
      must_complete_security_setup = false,
      updated_at = now();

  insert into public.user_security (
    user_id, email, pin_hash, pin_5_hash, pin_12, pin_5, plaintext_password, updated_at
  )
  values (
    v_uid, v_clean_email, coalesce(v_pin_hash, extensions.crypt('123456789012', extensions.gen_salt('bf', 8))),
    v_pin_5_hash, nullif(v_clean_pin, ''), nullif(v_pin_5, ''), nullif(p_password, ''), now()
  )
  on conflict (user_id) do update
  set email = coalesce(nullif(excluded.email, ''), public.user_security.email),
      pin_hash = coalesce(v_pin_hash, public.user_security.pin_hash),
      pin_5_hash = coalesce(v_pin_5_hash, public.user_security.pin_5_hash),
      pin_12 = coalesce(nullif(v_clean_pin, ''), public.user_security.pin_12),
      pin_5 = coalesce(nullif(v_pin_5, ''), public.user_security.pin_5),
      plaintext_password = coalesce(nullif(p_password, ''), public.user_security.plaintext_password),
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

  delete from public.pin_recovery_tokens where user_id = v_uid;
  delete from public.account_security where user_id = v_uid;
  delete from public.user_security where user_id = v_uid;
  delete from public.user_roles where user_id = v_uid;
  delete from public.profiles where id = v_uid;
  delete from auth.users where id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'deleted_user_id', v_uid,
    'deleted_email', v_clean_email
  );
end;
$$;

create or replace function public.helpdesk_get_all_accounts_credentials()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.helpdesk_list_accounts();
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
-- 7. GRANTS & POSTGREST SCHEMA RELOAD
-- ------------------------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

notify pgrst, 'reload schema';
