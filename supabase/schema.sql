-- ==============================================================================
-- MYBENGKEL POSTGRESQL SCHEMA FOR SUPABASE
-- Complete Production Database Schema with Types, Indexes, and RLS
-- Project Ref: gnnfykbnblhwlwwtzqry
-- ==============================================================================

-- 1. MECHANICS
create table if not exists public.mechanics (
  id text primary key,
  nama text not null,
  hp text not null,
  alamat text not null,
  active boolean not null default true,
  delete_reason text,
  deleted_at text,
  created_at timestamptz not null default now()
);

-- 2. CUSTOMERS
create table if not exists public.customers (
  id text primary key,
  name text not null,
  phone text not null,
  plate text,
  engine_no text,
  frame_no text,
  created_at timestamptz not null default now()
);

-- 3. VEHICLES
create table if not exists public.vehicles (
  plate text primary key,
  brand text not null,
  model text not null,
  last_km integer not null default 0,
  customer_id text,
  engine_no text,
  frame_no text,
  created_at timestamptz not null default now()
);

-- 4. PARTS (Master Katalog Part Gudang)
create table if not exists public.parts (
  id text primary key,
  kode text not null unique,
  nama text not null,
  satuan text not null default 'pcs',
  jenis text not null check (jenis in ('reguler', 'ho')),
  harga_beli numeric not null default 0,
  harga_jual numeric not null default 0,
  stok_min integer,
  created_at timestamptz not null default now()
);

-- 5. PART HISTORY (Audit Perubahan Harga / Spesifikasi Part)
create table if not exists public.part_history (
  id text primary key,
  part_id text not null references public.parts(id) on delete cascade,
  at text not null,
  by_nama text not null,
  by_id text not null,
  field text not null,
  old_value text,
  new_value text,
  note text,
  created_at timestamptz not null default now()
);

-- 6. STOCK MOVEMENTS (Kartu Stok Fisik Gudang)
create table if not exists public.stock_movements (
  id text primary key,
  part_id text not null references public.parts(id) on delete cascade,
  part_code text not null,
  date text not null,
  type text not null check (type in ('masuk', 'keluar_ho', 'koreksi', 'keluar_wo', 'kembali_batal', 'keluar_penjualan', 'penyesuaian')),
  quantity integer not null,
  reference text not null,
  reason text not null,
  line_id text,
  receipt_token text,
  created_at timestamptz not null default now()
);

-- 7. PURCHASE REQUESTS (Permintaan Pembelian Gudang)
create table if not exists public.purchase_requests (
  id text primary key,
  type text not null check (type in ('reguler', 'ho')),
  requester_kind text not null check (requester_kind in ('bengkel', 'pelanggan')),
  requester_name text not null,
  customer jsonb,
  dp numeric not null default 0,
  request_reason text not null,
  state text not null check (state in ('diajukan', 'belum_sampai', 'sampai', 'selesai', 'ditolak', 'batal')),
  order_code text,
  ordered_at text,
  arrived_at text,
  processed_at text,
  close_reason text,
  closed_at text,
  lines jsonb not null default '[]'::jsonb,
  ho_receipt_token text,
  ho_process_token text,
  created_at timestamptz not null default now()
);

-- 8. BOOKINGS (Booking Servis Konsumen)
create table if not exists public.bookings (
  id text primary key,
  customer_name text not null,
  plate text not null,
  engine_no text,
  frame_no text,
  service text not null,
  date text not null,
  hour text not null,
  complaint text,
  status text not null check (status in ('menunggu', 'datang', 'batal')),
  source text not null check (source in ('online', 'langsung')),
  service_form_id text,
  cancel_reason text,
  cancelled_at text,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 9. SERVICE FORMS (Penerimaan Kendaraan & Form Estimasi)
create table if not exists public.service_forms (
  id text primary key,
  origin text not null check (origin in ('draft', 'booking')),
  booking_id text,
  customer jsonb not null,
  vehicle jsonb not null,
  temuan text,
  jasa_lines jsonb not null default '[]'::jsonb,
  part_lines jsonb not null default '[]'::jsonb,
  status text not null check (status in ('menunggu_persetujuan', 'disetujui', 'batal')),
  cancel_reason text,
  cancelled_at text,
  work_order_id text,
  created_at timestamptz not null default now()
);

-- 10. WORK ORDERS (Perintah Kerja Bengkel / SPK)
create table if not exists public.work_orders (
  id text primary key,
  service_form_id text not null,
  mechanic_id text,
  lines jsonb not null default '[]'::jsonb,
  end_state text check (end_state in ('selesai', 'batal')),
  ended_at text,
  updated_at text not null,
  history jsonb not null default '[]'::jsonb,
  sale_id text,
  created_at timestamptz not null default now()
);

-- 11. SALES (Kasir Point of Sale / POS & Penjualan Part)
create table if not exists public.sales (
  id text primary key,
  number text not null,
  date text not null,
  origin text not null default 'Counter',
  customer_name text not null,
  lines jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  total numeric not null default 0,
  method text not null check (method in ('Tunai', 'Transfer', 'QR')),
  payment_status text not null check (payment_status in ('menunggu_pembayaran', 'dibayar', 'dibatalkan', 'kedaluwarsa')),
  payment_reference text,
  cash_received numeric,
  change numeric,
  cashier_name text,
  paid_at text,
  cancelled_at text,
  work_order_id text,
  created_at timestamptz not null default now()
);

-- 12. MECHANIC ATTENDANCE (Absensi Harian Mekanik)
create table if not exists public.mechanic_attendance (
  id text primary key,
  mechanic_id text not null references public.mechanics(id) on delete cascade,
  date text not null,
  check_in text,
  check_out text,
  work_hours_minutes integer,
  related_work_orders jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

-- 13. HELPDESK TICKETS (Tiket Kendala & Bantuan)
create table if not exists public.helpdesk_tickets (
  id text primary key,
  title text not null,
  category text not null check (category in ('Akun', 'Bug', 'Perangkat', 'Lainnya')),
  priority text not null check (priority in ('Rendah', 'Sedang', 'Tinggi')),
  status text not null check (status in ('Terbuka', 'Diproses', 'Selesai')),
  reported_by text not null,
  thread jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 14. MANUAL ENTRIES (Pemasukan Lain & Pengeluaran Operasional)
create table if not exists public.manual_entries (
  id text primary key,
  date text not null,
  category text not null check (category in ('Pengeluaran operasional', 'Pemasukan lain')),
  amount numeric not null default 0,
  notes text not null,
  recorded_by text not null,
  is_corrected boolean not null default false,
  correction_reason text,
  original_values jsonb,
  created_at timestamptz not null default now()
);

-- 15. STOCK OPNAME SESSIONS (Audit Fisik Stok Opname)
create table if not exists public.stock_opname_sessions (
  id text primary key,
  code text not null unique,
  scope text not null check (scope in ('semua', 'reguler', 'ho')),
  status text not null check (status in ('draft', 'menunggu_persetujuan', 'disetujui', 'ditolak', 'dibatalkan')),
  started_at text not null,
  created_by_id text not null,
  created_by_name text not null,
  submitted_at text,
  submitted_by_id text,
  submitted_by_name text,
  approved_at text,
  approved_by_id text,
  approved_by_name text,
  notes text,
  lines jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- 16. AUDIT LOGS (Catatan Aktivitas Admin & Ekspor)
create table if not exists public.audit_logs (
  id text primary key,
  actor_id text not null,
  actor_name text not null,
  actor_role text not null,
  event text not null,
  category text not null check (category in ('bisnis', 'akses')),
  module text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  reference text,
  occurred_at text not null,
  outcome text not null check (outcome in ('berhasil', 'gagal')),
  metadata jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

-- ==============================================================================
-- INDEXES FOR PERFORMANCE
-- ==============================================================================
create index if not exists idx_parts_kode on public.parts(kode);
create index if not exists idx_stock_movements_part_id on public.stock_movements(part_id);
create index if not exists idx_stock_movements_date on public.stock_movements(date);
create index if not exists idx_bookings_date on public.bookings(date);
create index if not exists idx_bookings_status on public.bookings(status);
create index if not exists idx_service_forms_status on public.service_forms(status);
create index if not exists idx_work_orders_service_form_id on public.work_orders(service_form_id);
create index if not exists idx_sales_date on public.sales(date);
create index if not exists idx_sales_payment_status on public.sales(payment_status);
create index if not exists idx_mechanic_attendance_date on public.mechanic_attendance(date);
create index if not exists idx_audit_logs_occurred_at on public.audit_logs(occurred_at);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
-- Enable RLS across all tables
alter table public.mechanics enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.parts enable row level security;
alter table public.part_history enable row level security;
alter table public.stock_movements enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.bookings enable row level security;
alter table public.service_forms enable row level security;
alter table public.work_orders enable row level security;
alter table public.sales enable row level security;
alter table public.mechanic_attendance enable row level security;
alter table public.helpdesk_tickets enable row level security;
alter table public.manual_entries enable row level security;
alter table public.stock_opname_sessions enable row level security;
alter table public.audit_logs enable row level security;

-- Default Development Policies (Allow full access with Publishable Anon Key for authorized client)
-- When switching to Supabase Auth roles later, these can be restricted per user role.
create policy "Allow all on mechanics" on public.mechanics for all using (true) with check (true);
create policy "Allow all on customers" on public.customers for all using (true) with check (true);
create policy "Allow all on vehicles" on public.vehicles for all using (true) with check (true);
create policy "Allow all on parts" on public.parts for all using (true) with check (true);
create policy "Allow all on part_history" on public.part_history for all using (true) with check (true);
create policy "Allow all on stock_movements" on public.stock_movements for all using (true) with check (true);
create policy "Allow all on purchase_requests" on public.purchase_requests for all using (true) with check (true);
create policy "Allow all on bookings" on public.bookings for all using (true) with check (true);
create policy "Allow all on service_forms" on public.service_forms for all using (true) with check (true);
create policy "Allow all on work_orders" on public.work_orders for all using (true) with check (true);
create policy "Allow all on sales" on public.sales for all using (true) with check (true);
create policy "Allow all on mechanic_attendance" on public.mechanic_attendance for all using (true) with check (true);
create policy "Allow all on helpdesk_tickets" on public.helpdesk_tickets for all using (true) with check (true);
create policy "Allow all on manual_entries" on public.manual_entries for all using (true) with check (true);
create policy "Allow all on stock_opname_sessions" on public.stock_opname_sessions for all using (true) with check (true);
create policy "Allow all on audit_logs" on public.audit_logs for all using (true) with check (true);

