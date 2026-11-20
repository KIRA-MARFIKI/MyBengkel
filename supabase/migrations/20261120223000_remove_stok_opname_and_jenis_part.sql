-- ==============================================================================
-- MYBENGKEL: REMOVE STOK OPNAME & MAKE JENIS PART OPTIONAL / REMOVABLE
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. DROP ANY STOK OPNAME TABLES OR RPC FUNCTIONS IF PRESENT
-- ------------------------------------------------------------------------------
drop table if exists public.stock_opname_items cascade;
drop table if exists public.stock_opname_lines cascade;
drop table if exists public.stock_opname_sessions cascade;
drop table if exists public.stock_opnames cascade;
drop table if exists public.stok_opname cascade;

do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname ilike '%opname%'
  loop
    execute format('drop function if exists %I.%I(%s) cascade;', r.nspname, r.proname, r.args);
  end loop;
end
$$;

-- ------------------------------------------------------------------------------
-- 2. RELAX public.parts CONSTRAINTS FOR REMOVED "JENIS PART" FIELD
-- ------------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parts' and column_name = 'jenis'
  ) then
    alter table public.parts alter column jenis drop not null;
    alter table public.parts alter column jenis set default 'reguler';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parts' and column_name = 'jenis_part'
  ) then
    alter table public.parts alter column jenis_part drop not null;
    alter table public.parts alter column jenis_part set default null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parts' and column_name = 'part_type'
  ) then
    alter table public.parts alter column part_type drop not null;
    alter table public.parts alter column part_type set default null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'parts' and column_name = 'category'
  ) then
    alter table public.parts alter column category drop not null;
    alter table public.parts alter column category set default null;
  end if;
end
$$;

-- ------------------------------------------------------------------------------
-- 3. UPDATE upsert_warehouse_part SO p_jenis IS OPTIONAL (DEFAULT NULL)
-- ------------------------------------------------------------------------------
create or replace function public.upsert_warehouse_part(
  p_id text,
  p_kode text,
  p_nama text,
  p_satuan text default 'pcs',
  p_jenis text default null,
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
  v_clean_jenis text := coalesce(nullif(lower(trim(coalesce(p_jenis, ''))), ''), 'reguler');
begin
  v_effective_role := case
    when v_session_role not in ('', 'anon', 'customer') then v_session_role
    else lower(trim(coalesce(p_actor_role, 'customer')))
  end;

  if v_effective_role not in ('master_admin', 'master_gudang', 'master_helpdesk') then
    return jsonb_build_object(
      'ok', false,
      'error', 'Akses ditolak: Admin reguler hanya memiliki akses lihat pada data Gudang.'
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
    v_clean_jenis,
    greatest(0, coalesce(p_stok, 0)),
    greatest(0, coalesce(p_harga_beli, 0)),
    greatest(0, coalesce(p_harga_jual, 0)),
    greatest(0, coalesce(p_stok_min, 1)),
    p_catatan,
    coalesce(nullif(trim(p_created_at), ''), to_char(now(), 'YYYY-MM-DD HH24.MI')),
    coalesce(p_payload, '{}'::jsonb),
    now()
  )
  on conflict (id) do update
  set kode = excluded.kode,
      nama = excluded.nama,
      satuan = excluded.satuan,
      jenis = coalesce(excluded.jenis, public.parts.jenis, 'reguler'),
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

-- ------------------------------------------------------------------------------
-- 4. UPDATE save_shared_workshop_state (STRIP stockOpnames, SAFE OPTIONAL jenis)
-- ------------------------------------------------------------------------------
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
  values ('global', p_payload - 'purchaseRequests' - 'stockOpnames', v_now)
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

  -- Mirror parts (jenis optional)
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
          coalesce(nullif(v_elem->>'jenis', ''), 'reguler'),
          coalesce(nullif(v_elem->>'hargaBeli', '')::numeric, 0),
          coalesce(nullif(v_elem->>'hargaJual', '')::numeric, 0),
          coalesce(nullif(v_elem->>'stokMin', '')::integer, 1),
          v_elem->>'createdAt',
          v_elem,
          v_now
        )
        on conflict (id) do update
        set kode = excluded.kode,
            nama = excluded.nama,
            satuan = excluded.satuan,
            jenis = coalesce(excluded.jenis, public.parts.jenis, 'reguler'),
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
-- 5. GRANTS & SCHEMA RELOAD
-- ------------------------------------------------------------------------------
grant execute on function public.upsert_warehouse_part(text, text, text, text, text, integer, numeric, numeric, integer, text, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.save_shared_workshop_state(jsonb) to anon, authenticated, service_role;

notify pgrst, 'reload schema';
