-- ==============================================================================
-- MYBENGKEL POSTGRESQL MIGRATION: MASTER HELPDESK & SUPPORT DASHBOARD
-- File: supabase/migrations/20261113_master_helpdesk.sql
-- Date: 2026-11-13
-- Purpose: Create authoritative user_roles, enhance helpdesk_tickets, 
--          create correction requests & knowledge base with granular RLS.
-- ==============================================================================

-- 1. USER ROLES TABLE (Authoritative Server-Side Role Assignments)
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  role text not null check (role in ('admin', 'customer', 'admin_gudang', 'master_gudang', 'master_helpdesk')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_user_roles_user_id on public.user_roles(user_id);
create index if not exists idx_user_roles_role on public.user_roles(role);

-- Enable RLS on user_roles
alter table public.user_roles enable row level security;

-- Helper security functions with pinned search_path
create or replace function public.get_auth_role(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.user_roles where user_id = p_user_id limit 1;
$$;

create or replace function public.is_master_helpdesk()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'master_helpdesk'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'master_gudang')
  );
$$;

-- RLS policies for user_roles
create policy "Users can view their own role"
  on public.user_roles for select
  using (auth.uid() = user_id);

create policy "Only admin can manage user roles"
  on public.user_roles for all
  using (public.is_admin())
  with check (public.is_admin());


-- 2. ENHANCE HELPDESK TICKETS TABLE
-- Preserve existing table and add comprehensive diagnostic & tracking columns
alter table public.helpdesk_tickets
  add column if not exists reporter_role text,
  add column if not exists affected_module text,
  add column if not exists description text,
  add column if not exists steps_to_reproduce text,
  add column if not exists expected_result text,
  add column if not exists actual_result text,
  add column if not exists related_record_id text,
  add column if not exists attachments_notes text,
  add column if not exists assigned_staff text,
  add column if not exists resolution_notes text,
  add column if not exists resolved_at text,
  add column if not exists updated_at text;

-- Create indexes for fast ticket lookup and diagnostics
create index if not exists idx_helpdesk_tickets_status on public.helpdesk_tickets(status);
create index if not exists idx_helpdesk_tickets_priority on public.helpdesk_tickets(priority);
create index if not exists idx_helpdesk_tickets_related_record on public.helpdesk_tickets(related_record_id);


-- 3. HELPDESK CORRECTION REQUESTS TABLE (Traceable Audit & Approval Workflow)
create table if not exists public.helpdesk_correction_requests (
  id text primary key,
  ticket_id text references public.helpdesk_tickets(id) on delete set null,
  entity_type text not null check (entity_type in ('Sale', 'WorkOrder', 'Booking', 'StockMovement', 'Part', 'Customer', 'ManualEntry')),
  entity_id text not null,
  field_name text not null,
  current_value text not null,
  proposed_value text not null,
  reason text not null,
  evidence_reference text,
  risk_level text not null check (risk_level in ('rendah', 'tinggi')),
  requested_by text not null,
  requested_at text not null,
  status text not null check (status in ('menunggu_persetujuan', 'disetujui', 'ditolak')),
  reviewed_by text,
  reviewed_at text,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_correction_requests_status on public.helpdesk_correction_requests(status);
create index if not exists idx_correction_requests_entity on public.helpdesk_correction_requests(entity_type, entity_id);

alter table public.helpdesk_correction_requests enable row level security;


-- 4. KNOWLEDGE BASE TABLE
create table if not exists public.helpdesk_knowledge_base (
  id text primary key,
  title text not null,
  category text not null,
  related_module text not null,
  symptoms text not null,
  possible_causes jsonb not null default '[]'::jsonb,
  diagnostic_steps jsonb not null default '[]'::jsonb,
  resolution_steps jsonb not null default '[]'::jsonb,
  author text not null,
  updated_at text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_kb_category on public.helpdesk_knowledge_base(category);
create index if not exists idx_kb_module on public.helpdesk_knowledge_base(related_module);

alter table public.helpdesk_knowledge_base enable row level security;


-- 5. LEAST-PRIVILEGE RLS POLICIES FOR MASTER HELPDESK

-- HelpDesk Tickets:
create policy "Helpdesk and Admin can view tickets"
  on public.helpdesk_tickets for select
  using (public.is_master_helpdesk() or public.is_admin());

create policy "Helpdesk and Admin can create tickets"
  on public.helpdesk_tickets for insert
  with check (public.is_master_helpdesk() or public.is_admin());

create policy "Helpdesk and Admin can update tickets"
  on public.helpdesk_tickets for update
  using (public.is_master_helpdesk() or public.is_admin())
  with check (public.is_master_helpdesk() or public.is_admin());

-- Correction Requests:
create policy "Helpdesk and Admin can view correction requests"
  on public.helpdesk_correction_requests for select
  using (public.is_master_helpdesk() or public.is_admin());

create policy "Helpdesk and Admin can submit correction requests"
  on public.helpdesk_correction_requests for insert
  with check (public.is_master_helpdesk() or public.is_admin());

-- Strictly enforce that ONLY Admin can review/approve/reject high-risk correction requests
create policy "Only Admin can review correction requests"
  on public.helpdesk_correction_requests for update
  using (public.is_admin())
  with check (public.is_admin());

-- Knowledge Base:
create policy "Helpdesk and Admin can view knowledge base"
  on public.helpdesk_knowledge_base for select
  using (true);

create policy "Helpdesk and Admin can manage knowledge base"
  on public.helpdesk_knowledge_base for all
  using (public.is_master_helpdesk() or public.is_admin())
  with check (public.is_master_helpdesk() or public.is_admin());

-- Diagnostic Access: Master Helpdesk Read-Only on Business Tables
create policy "Master Helpdesk can read bookings for diagnosis"
  on public.bookings for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read service forms for diagnosis"
  on public.service_forms for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read work orders for diagnosis"
  on public.work_orders for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read sales for diagnosis"
  on public.sales for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read parts for diagnosis"
  on public.parts for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read stock movements for diagnosis"
  on public.stock_movements for select
  using (public.is_master_helpdesk());

create policy "Master Helpdesk can read audit logs for diagnosis"
  on public.audit_logs for select
  using (public.is_master_helpdesk());


-- 6. RPC: SAFE ATOMIC APPROVAL OF DATA CORRECTION (Backend-Verified)
create or replace function public.approve_data_correction(
  p_correction_id text,
  p_decision text,
  p_review_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_reviewer_id uuid;
  v_reviewer_role text;
begin
  v_reviewer_id := auth.uid();
  v_reviewer_role := public.get_auth_role(v_reviewer_id);

  -- Enforce that Master Helpdesk cannot self-approve corrections
  if v_reviewer_role <> 'admin' and v_reviewer_role <> 'master_gudang' then
    raise exception 'Akses ditolak: Hanya peran Admin / Master Admin yang berwenang memberikan otorisasi koreksi.';
  end if;

  select * into v_req
  from public.helpdesk_correction_requests
  where id = p_correction_id for update;

  if not found then
    raise exception 'Permohonan koreksi tidak ditemukan.';
  end if;

  if v_req.status <> 'menunggu_persetujuan' then
    raise exception 'Permohonan ini telah diproses sebelumnya.';
  end if;

  -- Apply update to correction request record
  update public.helpdesk_correction_requests
  set status = p_decision,
      reviewed_by = (select coalesce(email, 'Admin') from auth.users where id = v_reviewer_id),
      reviewed_at = to_char(now(), 'YYYY-MM-DD HH24:MI'),
      review_notes = p_review_notes
  where id = p_correction_id;

  -- If approved, apply atomic modification to the target table according to entity_type
  if p_decision = 'disetujui' then
    if v_req.entity_type = 'Part' and v_req.field_name = 'stok_min' then
      update public.parts
      set stok_min = v_req.proposed_value::integer
      where id = v_req.entity_id or kode = v_req.entity_id;
    elsif v_req.entity_type = 'Booking' and v_req.field_name = 'status' then
      update public.bookings
      set status = v_req.proposed_value
      where id = v_req.entity_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'id', p_correction_id,
    'status', p_decision
  );
end;
$$;

