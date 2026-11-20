import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import {
  ARRIVAL_TARGET,
  Booking,
  Customer,
  CorrectionRequest,
  HelpDeskTicket,
  KnowledgeBaseArticle,
  ManualEntry,
  Mechanic,
  MechanicAttendance,
  Part,
  PartChangeRecord,
  PartHistory,
  PartJenis,
  Sale,
  SaleLine,
  SalePaymentMethod,
  SalePaymentStatus,
  ServiceForm,
  ServiceFormCustomer,
  ServiceFormLine,
  ServiceFormVehicle,
  StockMovement,
  Vehicle,
  WorkOrder,
  computeStock,
  computeAvailableSaleStock,
  dateToSlash,
  initialAttendance,
  initialBookings,
  initialCorrectionRequests,
  initialCustomers,
  initialHelpDeskTickets,
  initialKnowledgeBase,
  initialManualEntries,
  initialMechanics,
  initialPartHistory,
  initialParts,
  initialSales,
  initialServiceForms,
  initialStockMovements,
  initialVehicles,
  initialWorkOrders,
  makePartRecord,
} from '../data/adminDummy';
import {
  DUMMY_ADMIN,
  DUMMY_ADMIN_LOGIN_PIN,
  DUMMY_MASTER,
  getDeletedAccountEmails,
  getManagedAccounts,
  saveManagedAccounts,
  type ManagedAccountRecord,
} from '../lib/mockCredentials';
import { supabase } from '../lib/supabase';
import { formatRupiah } from '../lib/format';
import { printDocument } from '../lib/printDocument';
import {
  AuditLog,
  initialAuditLogs,
  getNextAuditCode,
  AuditActorRole,
} from '../lib/auditTrail';

const STORAGE_KEY = 'mybengkel_admin_store_v2';

export type { AuditLog };
export { initialAuditLogs };

export interface PersistedAdminStore {
  mechanics: Mechanic[];
  customers: Customer[];
  vehicles: Vehicle[];
  parts: Part[];
  partHistory: PartHistory[];
  partChanges: PartChangeRecord[];
  stockMovements: StockMovement[];
  bookings: Booking[];
  serviceForms: ServiceForm[];
  workOrders: WorkOrder[];
  sales: Sale[];
  attendance: MechanicAttendance[];
  tickets: HelpDeskTicket[];
  correctionRequests: CorrectionRequest[];
  knowledgeBase: KnowledgeBaseArticle[];
  manualEntries: ManualEntry[];
  auditLogs: AuditLog[];
}

export function formatNowTimestamp(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}.${pad(d.getMinutes())}`;
}

export function formatTodayDate(): string {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const getNextSequentialId = (prefix: string, padLen: number, existingIds: string[]): string => {
  let maxNum = 0;
  const regex = new RegExp(`^${prefix}-(\\d+)$`, 'i');
  for (const id of existingIds) {
    const m = regex.exec(id.trim());
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `${prefix}-${String(maxNum + 1).padStart(padLen, '0')}`;
};

const DUMMY_TICKET_IDS = new Set(['TKT-001', 'TKT-002', 'TKT-003', 'TKT-004']);
const DUMMY_CORRECTION_IDS = new Set(['COR-001', 'COR-002']);
const DUMMY_KB_IDS = new Set(['KB-001', 'KB-002', 'KB-003', 'KB-004', 'KB-005', 'KB-006']);

const stripLegacyDummyHelpdeskItems = (
  tickets: HelpDeskTicket[],
  corrections: CorrectionRequest[],
  kb: KnowledgeBaseArticle[]
) => ({
  tickets: tickets.filter(
    (t) => !(DUMMY_TICKET_IDS.has(t.id) && String(t.createdAt || '').startsWith('2026-11-13'))
  ),
  correctionRequests: corrections.filter(
    (c) => !(DUMMY_CORRECTION_IDS.has(c.id) && String(c.requestedAt || '').startsWith('2026-11-13'))
  ),
  knowledgeBase: kb.filter(
    (k) => !(DUMMY_KB_IDS.has(k.id) && String(k.updatedAt || '') === '2026-11-13 08.00')
  ),
});

const VALID_BOOKING_STATUSES = new Set<string>(['menunggu', 'datang', 'batal']);
const VALID_SF_STATUSES = new Set<string>(['menunggu_persetujuan', 'disetujui', 'batal']);

const createDefaultStore = (): PersistedAdminStore => ({
  mechanics: initialMechanics,
  customers: initialCustomers,
  vehicles: initialVehicles,
  parts: initialParts,
  partHistory: initialPartHistory,
  partChanges: initialPartHistory,
  stockMovements: initialStockMovements,
  bookings: initialBookings,
  serviceForms: initialServiceForms,
  workOrders: initialWorkOrders,
  sales: initialSales,
  attendance: initialAttendance,
  tickets: initialHelpDeskTickets,
  correctionRequests: initialCorrectionRequests,
  knowledgeBase: initialKnowledgeBase,
  manualEntries: initialManualEntries,
  auditLogs: initialAuditLogs,
});

const normalizePart = (raw: Partial<Part>): Part => {
  const kode = raw.kode || raw.code || raw.id || 'PRT-001';
  const nama = raw.nama || raw.name || 'Part';
  const satuan = raw.satuan || raw.unit || 'pcs';
  const jenis: PartJenis =
    raw.jenis === 'ho' || raw.partType === 'HO' ? 'ho' : 'reguler';
  const hargaBeli = raw.hargaBeli ?? raw.buyPrice ?? 0;
  const hargaJual = raw.hargaJual ?? raw.sellPrice ?? 0;
  const stokMin = raw.stokMin !== undefined && raw.stokMin !== null ? raw.stokMin : (raw.minStock ?? 1);
  const createdAt = raw.createdAt || `${formatTodayDate()} 08.00`;

  return makePartRecord({
    kode,
    nama,
    satuan,
    jenis,
    hargaBeli,
    hargaJual,
    stokMin,
    createdAt,
  });
};

const loadInitialStore = (): PersistedAdminStore => {
  const defaults = createDefaultStore();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<PersistedAdminStore>;
    const normalizedBookings = (parsed.bookings ?? defaults.bookings).map((b) => ({
      ...b,
      status: (VALID_BOOKING_STATUSES.has(b.status) ? b.status : 'batal') as Booking['status'],
      source: b.source === 'langsung' ? 'langsung' : 'online',
      hour: b.hour || '08.00',
      engineNo: b.engineNo || 'JM51E-0000',
      frameNo: b.frameNo || 'MH1JM5110PK-0000',
      complaint: b.complaint ?? '',
    })) as Booking[];

    const normalizedMechanics = (parsed.mechanics ?? defaults.mechanics).map((m) => ({
      ...m,
      nama: m.nama || m.name || 'Mekanik',
      name: m.nama || m.name || 'Mekanik',
      hp: m.hp || '081200000000',
      alamat: m.alamat || '-',
      active: m.active !== undefined ? m.active : true,
    }));

    const normalizedSFs = (parsed.serviceForms ?? defaults.serviceForms)
      .filter((sf) => sf && VALID_SF_STATUSES.has(sf.status))
      .map((sf) => ({
        ...sf,
        origin: sf.origin === 'booking' ? 'booking' : 'draft',
        jasaLines: Array.isArray(sf.jasaLines) ? sf.jasaLines : [],
        partLines: Array.isArray(sf.partLines) ? sf.partLines : [],
      })) as ServiceForm[];

    const normalizedWOs = (parsed.workOrders ?? defaults.workOrders).map((wo) => ({
      ...wo,
      endState: wo.endState === 'selesai' || wo.endState === 'batal' ? wo.endState : null,
      lines: Array.isArray(wo.lines) ? wo.lines : [],
      history: Array.isArray(wo.history) ? wo.history : [],
    })) as WorkOrder[];

    const normalizedParts = Array.isArray(parsed.parts)
      ? parsed.parts.map((p) => normalizePart(p))
      : defaults.parts;

    const normalizedMovements = Array.isArray(parsed.stockMovements)
      ? parsed.stockMovements.map((m) => ({
          ...m,
          partId: m.partId || m.partCode,
          partCode: m.partCode || m.partId,
        }))
      : defaults.stockMovements;

    const historyList = parsed.partHistory ?? parsed.partChanges ?? defaults.partHistory;

    const cleanedHelpdesk = stripLegacyDummyHelpdeskItems(
      Array.isArray(parsed.tickets) ? parsed.tickets : defaults.tickets,
      Array.isArray(parsed.correctionRequests)
        ? parsed.correctionRequests
        : defaults.correctionRequests,
      Array.isArray(parsed.knowledgeBase) ? parsed.knowledgeBase : defaults.knowledgeBase
    );

    return {
      mechanics: normalizedMechanics,
      customers: parsed.customers ?? defaults.customers,
      vehicles: parsed.vehicles ?? defaults.vehicles,
      parts: normalizedParts,
      partHistory: historyList,
      partChanges: historyList,
      stockMovements: normalizedMovements,
      bookings: normalizedBookings,
      serviceForms: normalizedSFs,
      workOrders: normalizedWOs,
      sales: parsed.sales ?? defaults.sales,
      attendance: parsed.attendance ?? defaults.attendance,
      tickets: cleanedHelpdesk.tickets,
      correctionRequests: cleanedHelpdesk.correctionRequests,
      knowledgeBase: cleanedHelpdesk.knowledgeBase,
      manualEntries: parsed.manualEntries ?? defaults.manualEntries,
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : defaults.auditLogs,
    };
  } catch {
    return defaults;
  }
};

// -------------------------------------------------------------
// SINGLE CENTRALIZED STORE (LOCALSTORAGE + SUPABASE REALTIME SYNC)
// -------------------------------------------------------------

let storeState: PersistedAdminStore = loadInitialStore();
const listeners = new Set<() => void>();
let lastLocalMutationMs = 0;
let lastSyncedSignature = '';
let pushDebounceTimer: number | null = null;
let supabaseSyncInFlight = false;

interface RemoteWorkshopPayload extends PersistedAdminStore {
  managedAccounts?: ManagedAccountRecord[];
  deletedAccountEmails?: string[];
  updatedAt?: string;
}

const buildRemotePayload = (state: PersistedAdminStore): RemoteWorkshopPayload => ({
  ...state,
  managedAccounts: getManagedAccounts(),
  deletedAccountEmails: getDeletedAccountEmails(),
  updatedAt: new Date().toISOString(),
});

const mergeRemoteBookings = (
  baseBookings: Booking[],
  tableRows: any[]
): Booking[] => {
  if (!Array.isArray(tableRows) || tableRows.length === 0) return baseBookings;
  const map = new Map<string, Booking>();
  for (const b of baseBookings) {
    if (b && b.id) map.set(b.id, b);
  }
  for (const row of tableRows) {
    const raw = (row && typeof row.payload === 'object' && row.payload ? row.payload : row) as Partial<Booking>;
    const id = String(raw.id || row.id || '').trim();
    if (!id) continue;
    if (!map.has(id)) {
      map.set(id, {
        id,
        customerName: String(raw.customerName || row.customer_name || 'Konsumen'),
        plate: String(raw.plate || row.plate || '-'),
        engineNo: String(raw.engineNo || row.engine_no || 'JM51E-0000'),
        frameNo: String(raw.frameNo || row.frame_no || 'MH1JM5110PK-0000'),
        service: String(raw.service || row.service || 'Servis Rutin'),
        date: String(raw.date || row.date || formatTodayDate()),
        hour: String(raw.hour || row.hour || '08.00'),
        complaint: String(raw.complaint ?? row.complaint ?? ''),
        status: (VALID_BOOKING_STATUSES.has(String(raw.status || row.status))
          ? (raw.status || row.status)
          : 'menunggu') as Booking['status'],
        source: (raw.source || row.source) === 'langsung' ? 'langsung' : 'online',
        customerEmail: raw.customerEmail || row.customer_email,
        serviceFormId: raw.serviceFormId || row.service_form_id,
        createdAt: raw.createdAt || formatNowTimestamp(),
        history: Array.isArray(raw.history) ? raw.history : [],
      });
    }
  }
  return Array.from(map.values());
};

const normalizeRemoteStore = (
  raw: Partial<RemoteWorkshopPayload>,
  tableBookingRows: any[] = [],
  tablePartsRows: any[] = []
): PersistedAdminStore => {
  const defaults = createDefaultStore();
  const baseBookings = Array.isArray(raw.bookings) ? raw.bookings : defaults.bookings;
  const mergedBookings = mergeRemoteBookings(baseBookings, tableBookingRows);

  const normalizedParts = Array.isArray(raw.parts)
    ? raw.parts.map((p) => normalizePart(p))
    : Array.isArray(tablePartsRows) && tablePartsRows.length > 0
      ? tablePartsRows.map((p) => normalizePart(p))
      : defaults.parts;

  const cleanedHelpdesk = stripLegacyDummyHelpdeskItems(
    Array.isArray(raw.tickets) ? raw.tickets : defaults.tickets,
    Array.isArray(raw.correctionRequests) ? raw.correctionRequests : defaults.correctionRequests,
    Array.isArray(raw.knowledgeBase) ? raw.knowledgeBase : defaults.knowledgeBase
  );

  return {
    mechanics: Array.isArray(raw.mechanics) ? raw.mechanics : defaults.mechanics,
    customers: Array.isArray(raw.customers) ? raw.customers : defaults.customers,
    vehicles: Array.isArray(raw.vehicles) ? raw.vehicles : defaults.vehicles,
    parts: normalizedParts,
    partHistory: Array.isArray(raw.partHistory)
      ? raw.partHistory
      : Array.isArray(raw.partChanges)
      ? raw.partChanges
      : defaults.partHistory,
    partChanges: Array.isArray(raw.partChanges)
      ? raw.partChanges
      : Array.isArray(raw.partHistory)
      ? raw.partHistory
      : defaults.partChanges,
    stockMovements: Array.isArray(raw.stockMovements) ? raw.stockMovements : defaults.stockMovements,
    bookings: mergedBookings.map((b) => ({
      ...b,
      status: (VALID_BOOKING_STATUSES.has(b.status) ? b.status : 'batal') as Booking['status'],
      source: b.source === 'langsung' ? 'langsung' : 'online',
      hour: b.hour || '08.00',
      engineNo: b.engineNo || 'JM51E-0000',
      frameNo: b.frameNo || 'MH1JM5110PK-0000',
      complaint: b.complaint ?? '',
    })) as Booking[],
    serviceForms: Array.isArray(raw.serviceForms) ? raw.serviceForms : defaults.serviceForms,
    workOrders: Array.isArray(raw.workOrders) ? raw.workOrders : defaults.workOrders,
    sales: Array.isArray(raw.sales) ? raw.sales : defaults.sales,
    attendance: Array.isArray(raw.attendance) ? raw.attendance : defaults.attendance,
    tickets: cleanedHelpdesk.tickets,
    correctionRequests: cleanedHelpdesk.correctionRequests,
    knowledgeBase: cleanedHelpdesk.knowledgeBase,
    manualEntries: Array.isArray(raw.manualEntries) ? raw.manualEntries : defaults.manualEntries,
    auditLogs: Array.isArray(raw.auditLogs) ? raw.auditLogs : defaults.auditLogs,
  };
};

export async function pushSharedWorkshopStateToSupabase(
  snapshot: PersistedAdminStore = storeState
): Promise<void> {
  const payload = buildRemotePayload(snapshot);
  try {
    lastSyncedSignature = JSON.stringify(snapshot);
  } catch {
    // ignore
  }
  try {
    const { error: rpcErr } = await supabase.rpc('save_shared_workshop_state', {
      p_payload: payload,
    });
    if (!rpcErr) return;
  } catch {
    // fallback to direct table upsert
  }

  try {
    await supabase.from('shared_workshop_state').upsert({
      id: 'global',
      payload,
      updated_at: new Date().toISOString(),
    });
  } catch {
    // safe fallback when offline
  }
}

export async function syncSharedWorkshopStateFromSupabase(): Promise<void> {
  if (supabaseSyncInFlight) return;
  if (Date.now() - lastLocalMutationMs < 900) return;
  supabaseSyncInFlight = true;
  try {
    let remotePayload: Partial<RemoteWorkshopPayload> | null = null;
    let bookingRows: any[] = [];
    let partsRows: any[] = [];

    try {
      const { data, error } = await supabase.rpc('get_shared_workshop_state');
      if (!error && data?.ok) {
        if (data.payload && Object.keys(data.payload).length > 0) {
          remotePayload = data.payload as Partial<RemoteWorkshopPayload>;
        }
        if (Array.isArray(data.bookings_rows)) {
          bookingRows = data.bookings_rows;
        }
        if (Array.isArray(data.parts_rows)) {
          partsRows = data.parts_rows;
        }
      }
    } catch {
      // fallback below
    }

    if (!remotePayload) {
      try {
        const { data: tableRow } = await supabase
          .from('shared_workshop_state')
          .select('payload')
          .eq('id', 'global')
          .maybeSingle();
        if (tableRow?.payload && Object.keys(tableRow.payload).length > 0) {
          remotePayload = tableRow.payload as Partial<RemoteWorkshopPayload>;
        }
      } catch {
        // ignore
      }
    }

    if (bookingRows.length === 0) {
      try {
        const { data: bRows } = await supabase.from('bookings').select('*');
        if (Array.isArray(bRows)) {
          bookingRows = bRows;
        }
      } catch {
        // ignore
      }
    }

    if (partsRows.length === 0) {
      try {
        const { data: pRows } = await supabase.from('parts').select('*');
        if (Array.isArray(pRows)) {
          partsRows = pRows;
        }
      } catch {
        // ignore
      }
    }

    if (!remotePayload && bookingRows.length === 0 && partsRows.length === 0) {
      // First initialization: push seed/local store to shared remote state
      await pushSharedWorkshopStateToSupabase(storeState);
      return;
    }

    if (Date.now() - lastLocalMutationMs < 900) return;

    if (remotePayload?.deletedAccountEmails && Array.isArray(remotePayload.deletedAccountEmails)) {
      if (typeof localStorage !== 'undefined') {
        try {
          const mergedDeleted = Array.from(
            new Set([
              ...getDeletedAccountEmails(),
              ...remotePayload.deletedAccountEmails.map((e) => String(e).toLowerCase().trim()),
            ])
          );
          localStorage.setItem('mb_deleted_accounts_v1', JSON.stringify(mergedDeleted));
        } catch {
          // ignore
        }
      }
    }

    if (remotePayload?.managedAccounts && Array.isArray(remotePayload.managedAccounts)) {
      const deletedSet = new Set(getDeletedAccountEmails());
      const filteredAccounts = remotePayload.managedAccounts.filter(
        (acc) => acc && acc.email && !deletedSet.has(acc.email.toLowerCase().trim())
      );
      if (filteredAccounts.length > 0) {
        saveManagedAccounts(filteredAccounts);
      }
    }

    const nextNormalized = normalizeRemoteStore(remotePayload || {}, bookingRows, partsRows);
    const nextSig = JSON.stringify(nextNormalized);
    if (nextSig !== lastSyncedSignature && nextSig !== JSON.stringify(storeState)) {
      lastSyncedSignature = nextSig;
      storeState = nextNormalized;
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, nextSig);
        } catch {
          // ignore
        }
      }
      listeners.forEach((l) => l());
    }
  } finally {
    supabaseSyncInFlight = false;
  }
}

const saveStore = (next: PersistedAdminStore) => {
  lastLocalMutationMs = Date.now();
  storeState = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState));
    } catch {
      // Ignore storage quota errors in prototype
    }
    if (pushDebounceTimer !== null) {
      window.clearTimeout(pushDebounceTimer);
    }
    pushDebounceTimer = window.setTimeout(() => {
      pushDebounceTimer = null;
      void pushSharedWorkshopStateToSupabase(storeState);
    }, 80);
  }
  listeners.forEach((l) => l());
};

export function appendAuditLog(
  state: PersistedAdminStore,
  entry: Omit<AuditLog, 'id' | 'occurredAt'> & { occurredAt?: string }
): { state: PersistedAdminStore; log: AuditLog } {
  const nextId = getNextAuditCode(state.auditLogs || []);
  const newLog: AuditLog = {
    ...entry,
    id: nextId,
    occurredAt: entry.occurredAt || formatNowTimestamp(),
  };
  return {
    state: {
      ...state,
      auditLogs: [newLog, ...(state.auditLogs || [])],
    },
    log: newLog,
  };
}

export const recordAuditEvent = (
  entry: Omit<AuditLog, 'id' | 'occurredAt'> & { occurredAt?: string }
): AuditLog => {
  const cur = getAdminStore();
  const { state: nextState, log } = appendAuditLog(cur, entry);
  saveStore(nextState);
  return log;
};

export const recordReportExportEvent = (params: {
  actor: { id: string; nama: string; role: AuditActorRole };
  format: 'Excel' | 'PDF' | 'CSV';
  scope: 'admin' | 'master_admin' | 'all' | 'service' | 'sales' | 'warehouse';
  periodLabel: string;
}): AuditLog => {
  return recordAuditEvent({
    actorId: params.actor.id,
    actorName: params.actor.nama,
    actorRole: params.actor.role,
    event: params.scope === 'master_admin' ? 'report_export_master' : 'report_export_admin',
    category: 'akses',
    module: 'laporan',
    action: `Ekspor Laporan ${
      params.scope === 'master_admin'
        ? 'Master Admin (+ Audit Trail)'
        : params.scope === 'admin'
        ? 'Admin'
        : params.scope.toUpperCase()
    } (${params.format})`,
    entityType: 'Export',
    entityId: `EXP-${params.format.toUpperCase()}-${Date.now().toString().slice(-4)}`,
    afterData: {
      format: params.format,
      scope: params.scope,
      period: params.periodLabel,
    },
    outcome: 'berhasil',
  });
};

export const getAdminStore = (): PersistedAdminStore => storeState;

export const subscribeAdminStore = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const resetAdminStoreToSeed = (): void => {
  lastMasterPartSig = '';
  lastMasterPartCode = '';
  saveStore(createDefaultStore());
};
export const getNextPartCode = (): string => {
  const cur = getAdminStore();
  return getNextSequentialId(
    'PRT',
    3,
    cur.parts.map((p) => p.kode)
  );
};

// -------------------------------------------------------------
// GD-3 MASTER GUDANG ATOMIC PART OPERATIONS
// -------------------------------------------------------------

let lastMasterPartSig = '';
let lastMasterPartCode = '';

async function syncWarehousePartToSupabase(
  part: Part,
  stok: number,
  catatan?: string | null,
  actorRole?: string
): Promise<void> {
  try {
    await supabase.rpc('upsert_warehouse_part', {
      p_id: part.kode,
      p_kode: part.kode,
      p_nama: part.nama,
      p_satuan: part.satuan,
      p_jenis: part.jenis || null,
      p_stok: Math.max(0, Math.round(stok)),
      p_harga_beli: part.hargaBeli,
      p_harga_jual: part.hargaJual,
      p_stok_min: part.stokMin ?? 1,
      p_catatan: catatan ?? null,
      p_created_at: part.createdAt || null,
      p_payload: part as unknown as Record<string, unknown>,
      p_actor_role: actorRole || null,
    });
  } catch {
    // fallback sync handled by shared_workshop_state
  }
}

export interface CreateMasterPartInput {
  nama: string;
  satuan: string;
  jenis?: PartJenis;
  stokAwal: number;
  hargaBeli: number;
  hargaJual: number;
  stokMin?: number | null;
  catatan?: string;
  submissionId?: string;
  byNama?: string;
  byId?: string;
  actorRole?: string;
}

export interface CreateMasterPartResult {
  ok: boolean;
  error?: string;
  part?: Part;
}

export function createMasterPart(input: CreateMasterPartInput): CreateMasterPartResult {
  const state = getAdminStore();
  const trimmedNama = input.nama.trim();
  if (!trimmedNama) {
    return { ok: false, error: 'Nama part wajib diisi.' };
  }

  const sig =
    input.submissionId ||
    `newpart|${trimmedNama.toLowerCase()}|${input.satuan}|${input.stokAwal}`;

  if (sig && sig === lastMasterPartSig && lastMasterPartCode) {
    const existing = state.parts.find((p) => p.kode === lastMasterPartCode);
    if (existing) {
      return { ok: true, part: existing };
    }
  }

  const clash = state.parts.find(
    (p) => p.nama.trim().toLowerCase() === trimmedNama.toLowerCase()
  );
  if (clash) {
    return { ok: false, error: `Nama part sudah ada: ${clash.kode}.` };
  }

  const kode = getNextPartCode();
  const now = formatNowTimestamp();
  const stokMin = Math.max(0, Math.round(input.stokMin ?? 1));
  const hargaBeli = Math.max(0, Math.round(input.hargaBeli || 0));
  const hargaJual = Math.max(0, Math.round(input.hargaJual || 0));
  const stokAwal = Math.max(0, Math.round(input.stokAwal || 0));

  const newPart = makePartRecord({
    kode,
    nama: trimmedNama,
    satuan: input.satuan,
    hargaBeli,
    hargaJual,
    stokMin,
    createdAt: now,
  });

  const newMovements: StockMovement[] =
    stokAwal > 0
      ? [
          {
            id: `mov-open-${kode}-${Date.now()}`,
            partId: kode,
            partCode: kode,
            date: now,
            type: 'masuk',
            quantity: stokAwal,
            reference: 'Stok awal',
            reason: 'Stok awal',
          },
        ]
      : [];

  const byNama = input.byNama || DUMMY_MASTER.nama;
  const byId = input.byId || DUMMY_MASTER.id;
  const trimmedCatatan = input.catatan?.trim() || 'Part baru ditambahkan';

  const historyRow: PartHistory = {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partId: kode,
    at: now,
    byNama,
    byId,
    field: 'Part baru',
    oldValue: 'Tidak ada',
    newValue: `${kode} (${trimmedNama})`,
    note: trimmedCatatan,
  };

  lastMasterPartSig = sig;
  lastMasterPartCode = kode;

  const nextHistory = [historyRow, ...state.partHistory];

  saveStore({
    ...state,
    parts: [...state.parts, newPart],
    stockMovements: [...state.stockMovements, ...newMovements],
    partHistory: nextHistory,
    partChanges: nextHistory,
  });

  void syncWarehousePartToSupabase(newPart, stokAwal, trimmedCatatan, input.actorRole);

  return { ok: true, part: newPart };
}

export interface EditMasterPartInput {
  partId: string;
  nama: string;
  satuan: string;
  hargaBeli: number;
  hargaJual: number;
  stokMin: number | null;
  stokBaru?: number;
  note: string;
  byNama?: string;
  byId?: string;
  actorRole?: string;
}

export interface EditMasterPartResult {
  ok: boolean;
  error?: string;
  part?: Part;
  newHistoryIds?: string[];
}

export function editMasterPart(input: EditMasterPartInput): EditMasterPartResult {
  const state = getAdminStore();
  const part = state.parts.find((p) => p.id === input.partId || p.kode === input.partId);
  if (!part) {
    return { ok: false, error: 'Part tidak ditemukan.' };
  }

  const trimmedNama = input.nama.trim();
  if (!trimmedNama) {
    return { ok: false, error: 'Nama part wajib diisi.' };
  }

  const clash = state.parts.find(
    (p) => p.kode !== part.kode && p.nama.trim().toLowerCase() === trimmedNama.toLowerCase()
  );
  if (clash) {
    return { ok: false, error: `Nama part sudah ada: ${clash.kode}.` };
  }

  const trimmedNote = input.note.trim();
  if (trimmedNote.length < 5) {
    return { ok: false, error: 'Catatan penyesuaian minimal 5 karakter.' };
  }

  const nextHargaBeli = Math.max(0, Math.round(input.hargaBeli));
  const nextHargaJual = Math.max(0, Math.round(input.hargaJual));
  const nextStokMin = Math.max(0, Math.round(input.stokMin ?? part.stokMin ?? 1));
  const currentStok = computeStock(part, state.stockMovements);
  const hasStockInput = typeof input.stokBaru === 'number' && !Number.isNaN(input.stokBaru);
  const nextStok = hasStockInput ? Math.max(0, Math.round(input.stokBaru!)) : currentStok;

  const changes: { field: string; oldValue: string; newValue: string }[] = [];

  if (trimmedNama !== part.nama) {
    changes.push({
      field: 'Nama Part',
      oldValue: part.nama,
      newValue: trimmedNama,
    });
  }
  if (input.satuan !== part.satuan) {
    changes.push({
      field: 'Satuan',
      oldValue: part.satuan,
      newValue: input.satuan,
    });
  }
  if (hasStockInput && nextStok !== currentStok) {
    changes.push({
      field: 'Stok',
      oldValue: String(currentStok),
      newValue: String(nextStok),
    });
  }
  if (nextHargaBeli !== part.hargaBeli) {
    changes.push({
      field: 'Harga Beli',
      oldValue: formatRupiah(part.hargaBeli),
      newValue: formatRupiah(nextHargaBeli),
    });
  }
  if (nextHargaJual !== part.hargaJual) {
    changes.push({
      field: 'Harga Jual',
      oldValue: formatRupiah(part.hargaJual),
      newValue: formatRupiah(nextHargaJual),
    });
  }
  if (nextStokMin !== part.stokMin) {
    changes.push({
      field: 'Stok Minimum',
      oldValue: String(part.stokMin ?? 0),
      newValue: String(nextStokMin ?? 0),
    });
  }

  if (changes.length === 0) {
    return { ok: false, error: 'Tidak ada perubahan.' };
  }

  const now = formatNowTimestamp();
  const byNama = input.byNama || DUMMY_MASTER.nama;
  const byId = input.byId || DUMMY_MASTER.id;

  const stockDelta = nextStok - currentStok;
  const extraMovements: StockMovement[] =
    hasStockInput && stockDelta !== 0
      ? [
          {
            id: `mov-adj-${part.kode}-${Date.now()}`,
            partId: part.kode,
            partCode: part.kode,
            date: now,
            type: 'koreksi',
            quantity: stockDelta,
            reference: 'Edit Part',
            reason: trimmedNote,
          },
        ]
      : [];

  const newRows: PartHistory[] = [
    ...changes.map((c, idx) => ({
      id: `ph-${Date.now()}-${idx + 1}`,
      partId: part.kode,
      at: now,
      byNama,
      byId,
      field: c.field,
      oldValue: c.oldValue,
      newValue: c.newValue,
      note: trimmedNote,
    })),
    {
      id: `ph-${Date.now()}-note`,
      partId: part.kode,
      at: now,
      byNama,
      byId,
      field: 'Catatan penyesuaian',
      oldValue: '-',
      newValue: trimmedNote,
      note: trimmedNote,
    },
  ];

  const updatedPart = makePartRecord({
    kode: part.kode,
    nama: trimmedNama,
    satuan: input.satuan,
    jenis: part.jenis,
    hargaBeli: nextHargaBeli,
    hargaJual: nextHargaJual,
    stokMin: nextStokMin,
    createdAt: part.createdAt,
  });

  const nextHistory = [...newRows, ...state.partHistory];

  saveStore({
    ...state,
    parts: state.parts.map((p) => (p.kode === part.kode ? updatedPart : p)),
    stockMovements:
      extraMovements.length > 0
        ? [...state.stockMovements, ...extraMovements]
        : state.stockMovements,
    partHistory: nextHistory,
    partChanges: nextHistory,
  });

  void syncWarehousePartToSupabase(updatedPart, nextStok, trimmedNote, input.actorRole);

  return {
    ok: true,
    part: updatedPart,
    newHistoryIds: newRows.map((r) => r.id),
  };
}

export interface DeleteMasterPartInput {
  partId: string;
  byNama?: string;
  byId?: string;
  actorRole?: string;
}

export interface DeleteMasterPartResult {
  ok: boolean;
  error?: string;
  deletedKode?: string;
}

export function deleteMasterPart(input: DeleteMasterPartInput): DeleteMasterPartResult {
  const state = getAdminStore();
  const part = state.parts.find((p) => p.id === input.partId || p.kode === input.partId);
  if (!part) {
    return { ok: false, error: 'Part tidak ditemukan.' };
  }

  const now = formatNowTimestamp();
  const byNama = input.byNama || DUMMY_MASTER.nama;
  const byId = input.byId || DUMMY_MASTER.id;

  const historyRow: PartHistory = {
    id: `ph-del-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partId: part.kode,
    at: now,
    byNama,
    byId,
    field: 'Hapus Part',
    oldValue: `${part.kode} (${part.nama})`,
    newValue: 'Dihapus',
    note: `Part ${part.kode} dihapus oleh ${byNama}`,
  };

  const nextHistory = [historyRow, ...state.partHistory];

  saveStore({
    ...state,
    parts: state.parts.filter((p) => p.kode !== part.kode && p.id !== part.id),
    partHistory: nextHistory,
    partChanges: nextHistory,
  });

  void (async () => {
    try {
      await supabase.rpc('delete_warehouse_part', {
        p_part_id: part.kode,
        p_actor_role: input.actorRole || null,
      });
    } catch {
      // fallback handled by shared_workshop_state
    }
  })();

  return {
    ok: true,
    deletedKode: part.kode,
  };
}

// -------------------------------------------------------------
// SV-0 ATOMIC, IDEMPOTENT PLAIN FUNCTIONS OUTSIDE COMPONENTS
// -------------------------------------------------------------

let lastDraftSubmissionSignature = '';
let lastDraftSubmissionId = '';

export interface CreateServiceFromDraftInput {
  customer: ServiceFormCustomer;
  vehicle: ServiceFormVehicle;
  temuan: string;
  jasaLines?: ServiceFormLine[];
  partLines?: ServiceFormLine[];
  submissionId?: string;
}

export function createServiceFromDraft(input: CreateServiceFromDraftInput): ServiceForm {
  const state = getAdminStore();
  const normalizedPlate = input.vehicle.plat.trim().replace(/\s+/g, ' ');
  const signature =
    input.submissionId ||
    `${normalizedPlate}|${input.customer.nama.trim()}|${input.vehicle.rangka.trim()}|${input.vehicle.mesin.trim()}|${input.temuan.trim()}`;

  if (signature && signature === lastDraftSubmissionSignature && lastDraftSubmissionId) {
    const existing = state.serviceForms.find((sf) => sf.id === lastDraftSubmissionId);
    if (existing) return existing;
  }

  const newId = getNextSequentialId(
    'SF',
    4,
    state.serviceForms.map((sf) => sf.id)
  );
  const newSF: ServiceForm = {
    id: newId,
    origin: 'draft',
    customer: {
      nama: input.customer.nama.trim(),
      jenisKonsumen: input.customer.jenisKonsumen,
      hp: input.customer.hp.trim(),
      alamat: input.customer.alamat.trim(),
    },
    vehicle: {
      rangka: input.vehicle.rangka.trim(),
      mesin: input.vehicle.mesin.trim(),
      plat: normalizedPlate,
      tipeMotor: input.vehicle.tipeMotor,
      tipeManual: input.vehicle.tipeManual.trim(),
      warna: input.vehicle.warna.trim(),
    },
    temuan: input.temuan.trim(),
    jasaLines: input.jasaLines ? [...input.jasaLines] : [],
    partLines: input.partLines ? [...input.partLines] : [],
    status: 'menunggu_persetujuan',
    createdAt: formatTodayDate(),
  };

  lastDraftSubmissionSignature = signature;
  lastDraftSubmissionId = newId;

  saveStore({
    ...state,
    serviceForms: [newSF, ...state.serviceForms],
  });

  return newSF;
}

export interface MarkBookingArrivedResult {
  booking: Booking;
  serviceForm: ServiceForm;
  workOrder?: WorkOrder;
}

export function markBookingArrived(bookingId: string): MarkBookingArrivedResult | null {
  const state = getAdminStore();
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;

  if (booking.status === 'datang' && booking.serviceFormId) {
    const existingSF = state.serviceForms.find((sf) => sf.id === booking.serviceFormId);
    if (existingSF) {
      const existingWO = existingSF.workOrderId
        ? state.workOrders.find((wo) => wo.id === existingSF.workOrderId)
        : undefined;
      return { booking, serviceForm: existingSF, workOrder: existingWO };
    }
  }

  if (booking.status !== 'menunggu') {
    const existingSF = booking.serviceFormId
      ? state.serviceForms.find((sf) => sf.id === booking.serviceFormId)
      : undefined;
    if (existingSF) {
      const existingWO = existingSF.workOrderId
        ? state.workOrders.find((wo) => wo.id === existingSF.workOrderId)
        : undefined;
      return { booking, serviceForm: existingSF, workOrder: existingWO };
    }
    return null;
  }

  const now = formatNowTimestamp();
  const today = formatTodayDate();
  const newSfId = getNextSequentialId(
    'SF',
    4,
    state.serviceForms.map((sf) => sf.id)
  );
  const targetStatus = ARRIVAL_TARGET as ServiceForm['status'];
  const createWoImmediately = targetStatus === 'disetujui';
  const newWoId = createWoImmediately
    ? getNextSequentialId(
        'WO',
        4,
        state.workOrders.map((wo) => wo.id)
      )
    : undefined;

  const updatedBooking: Booking = {
    ...booking,
    status: 'datang',
    serviceFormId: newSfId,
    history: [
      ...(booking.history || []),
      { time: now, who: 'Admin', what: 'Konsumen datang, masuk ke pemeriksaan' },
    ],
  };

  const temuanText = booking.complaint
    ? `${booking.service}. Keluhan: ${booking.complaint}`
    : booking.service;

  const newServiceForm: ServiceForm = {
    id: newSfId,
    origin: 'booking',
    bookingId: booking.id,
    customer: {
      nama: booking.customerName,
      jenisKonsumen: '',
      hp: '',
      alamat: '',
    },
    vehicle: {
      rangka: booking.frameNo,
      mesin: booking.engineNo,
      plat: booking.plate,
      tipeMotor: '',
      tipeManual: '',
      warna: '',
    },
    temuan: temuanText,
    jasaLines: [],
    partLines: [],
    status: targetStatus,
    createdAt: today,
    workOrderId: newWoId,
  };

  const newWorkOrder: WorkOrder | undefined = newWoId
    ? {
        id: newWoId,
        serviceFormId: newSfId,
        mechanicId: undefined,
        lines: [],
        endState: null,
        updatedAt: now,
        history: [
          {
            time: now,
            action: `Work order dibuat dari kedatangan booking ${booking.id}`,
            performedBy: 'Admin',
          },
        ],
      }
    : undefined;

  const nextBaseState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? updatedBooking : b)),
    serviceForms: [newServiceForm, ...state.serviceForms],
    workOrders: newWorkOrder ? [newWorkOrder, ...state.workOrders] : state.workOrders,
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: 'Admin Dummy',
    actorRole: 'admin',
    event: 'booking_arrived',
    category: 'bisnis',
    module: 'booking',
    action: `Konfirmasi kedatangan booking ${booking.id} (${booking.customerName})`,
    entityType: 'Booking',
    entityId: booking.id,
    reference: booking.plate,
    beforeData: { status: booking.status },
    afterData: { status: 'datang', serviceFormId: newSfId, workOrderId: newWoId },
    outcome: 'berhasil',
  });

  saveStore(finalState);

  return {
    booking: updatedBooking,
    serviceForm: newServiceForm,
    workOrder: newWorkOrder,
  };
}

export function cancelBooking(bookingId: string, reason?: string): Booking | null {
  const state = getAdminStore();
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;

  if (booking.status === 'batal') {
    return booking;
  }

  const now = formatNowTimestamp();
  const cleanReason = reason?.trim() || 'Tidak dicatat';
  const updatedBooking: Booking = {
    ...booking,
    status: 'batal',
    cancelReason: cleanReason,
    cancelledAt: now,
    history: [
      ...(booking.history || []),
      { time: now, who: 'Admin', what: 'Booking dibatalkan', reason: cleanReason },
    ],
  };

  const nextBaseState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? updatedBooking : b)),
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: 'Admin Dummy',
    actorRole: 'admin',
    event: 'booking_cancelled',
    category: 'bisnis',
    module: 'booking',
    action: `Pembatalan booking ${booking.id} (${booking.customerName})`,
    entityType: 'Booking',
    entityId: booking.id,
    reference: booking.plate,
    beforeData: { status: booking.status },
    afterData: { status: 'batal' },
    reason: cleanReason,
    outcome: 'berhasil',
  });

  saveStore(finalState);

  return updatedBooking;
}

export function restoreBooking(bookingId: string): Booking | null {
  const state = getAdminStore();
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  if (booking.status === 'menunggu') return booking;

  const now = formatNowTimestamp();
  const updatedBooking: Booking = {
    ...booking,
    status: 'menunggu',
    cancelReason: undefined,
    cancelledAt: undefined,
    history: [
      ...(booking.history || []),
      { time: now, who: 'Admin', what: 'Pembatalan diurungkan, kembali ke menunggu' },
    ],
  };

  const nextBaseState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? updatedBooking : b)),
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: 'Admin Dummy',
    actorRole: 'admin',
    event: 'booking_restored',
    category: 'bisnis',
    module: 'booking',
    action: `Pemulihan booking ${booking.id} (${booking.customerName}) ke status menunggu`,
    entityType: 'Booking',
    entityId: booking.id,
    reference: booking.plate,
    beforeData: { status: booking.status },
    afterData: { status: 'menunggu' },
    outcome: 'berhasil',
  });

  saveStore(finalState);

  saveStore({
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? updatedBooking : b)),
  });

  return updatedBooking;
}

export interface ApproveToWorkOrderResult {
  ok: boolean;
  error?: string;
  serviceForm?: ServiceForm;
  workOrder?: WorkOrder;
}

export function approveToWorkOrder(serviceFormId: string): ApproveToWorkOrderResult {
  const state = getAdminStore();
  const sf = state.serviceForms.find((item) => item.id === serviceFormId);
  if (!sf) {
    return { ok: false, error: 'Service Form tidak ditemukan.' };
  }

  if (sf.status === 'disetujui' && sf.workOrderId) {
    const existingWO = state.workOrders.find((wo) => wo.id === sf.workOrderId);
    if (existingWO) {
      return { ok: true, serviceForm: sf, workOrder: existingWO };
    }
  }

  if (sf.status === 'batal') {
    return { ok: false, error: 'Service Form sudah dibatalkan.' };
  }

  const requiredByCode = new Map<string, { qty: number; name: string }>();
  for (const pl of sf.partLines) {
    if (!pl.partCode) continue;
    const prev = requiredByCode.get(pl.partCode);
    requiredByCode.set(pl.partCode, {
      qty: (prev?.qty ?? 0) + pl.qty,
      name: pl.name,
    });
  }

  for (const [partCode, req] of requiredByCode.entries()) {
    const part = state.parts.find((p) => p.code === partCode || p.kode === partCode);
    const available = part ? computeStock(part, state.stockMovements) : 0;
    const partName = part?.name ?? req.name;
    if (req.qty > available) {
      return {
        ok: false,
        error: `Stok ${partName} tersisa ${available}, tidak cukup untuk ${req.qty}.`,
      };
    }
  }

  const now = formatNowTimestamp();
  const today = formatTodayDate();
  const newWoId = getNextSequentialId(
    'WO',
    4,
    state.workOrders.map((wo) => wo.id)
  );

  let nextMovIndex = state.stockMovements.length + 1;
  const newMovements: StockMovement[] = sf.partLines
    .filter((pl) => Boolean(pl.partCode) && pl.qty > 0)
    .map((pl) => {
      const movId = `mov-${String(nextMovIndex++).padStart(3, '0')}`;
      return {
        id: movId,
        partId: pl.partCode!,
        partCode: pl.partCode!,
        date: today,
        type: 'keluar_wo',
        quantity: -pl.qty,
        reference: newWoId,
        reason: `Pemakaian Work Order ${newWoId}`,
      };
    });

  const historyRows = [
    {
      time: now,
      action: `Work order dibuat dari Service Form ${sf.id}`,
      performedBy: 'Admin',
    },
    ...sf.partLines
      .filter((pl) => Boolean(pl.partCode) && pl.qty > 0)
      .map((pl) => {
        const part = state.parts.find((p) => p.code === pl.partCode || p.kode === pl.partCode);
        return {
          time: now,
          action: `Part ${pl.partCode} (${pl.qty} ${part?.unit || 'Pcs'}) diambil dari gudang`,
          performedBy: 'Admin',
        };
      }),
  ];

  const newWO: WorkOrder = {
    id: newWoId,
    serviceFormId: sf.id,
    mechanicId: undefined,
    lines: [...sf.jasaLines, ...sf.partLines],
    endState: null,
    updatedAt: now,
    history: historyRows,
  };

  const updatedSF: ServiceForm = {
    ...sf,
    status: 'disetujui',
    workOrderId: newWoId,
  };

  saveStore({
    ...state,
    serviceForms: state.serviceForms.map((item) => (item.id === sf.id ? updatedSF : item)),
    workOrders: [newWO, ...state.workOrders],
    stockMovements: [...state.stockMovements, ...newMovements],
  });

  return {
    ok: true,
    serviceForm: updatedSF,
    workOrder: newWO,
  };
}

export interface CancelServiceFormResult {
  ok: boolean;
  error?: string;
  serviceForm?: ServiceForm;
  workOrder?: WorkOrder;
}

export function cancelServiceForm(idOrWoId: string, reason: string): CancelServiceFormResult {
  const state = getAdminStore();
  const sf = state.serviceForms.find(
    (item) => item.id === idOrWoId || item.workOrderId === idOrWoId
  );
  if (!sf) {
    return { ok: false, error: 'Service Form tidak ditemukan.' };
  }

  const linkedWO = sf.workOrderId
    ? state.workOrders.find((wo) => wo.id === sf.workOrderId)
    : state.workOrders.find((wo) => wo.serviceFormId === sf.id);

  if (sf.status === 'batal') {
    return { ok: true, serviceForm: sf, workOrder: linkedWO };
  }

  if (linkedWO && linkedWO.endState === 'selesai') {
    return { ok: false, error: 'Work order sudah selesai.' };
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: 'Alasan pembatalan wajib diisi.' };
  }

  const now = formatNowTimestamp();
  const today = formatTodayDate();

  const updatedSF: ServiceForm = {
    ...sf,
    status: 'batal',
    cancelReason: trimmedReason,
    cancelledAt: now,
  };

  let updatedWOs = state.workOrders;
  let updatedMovements = state.stockMovements;
  let updatedWO: WorkOrder | undefined = undefined;

  if (linkedWO) {
    const alreadyReturned = state.stockMovements.some(
      (m) => m.type === 'kembali_batal' && m.reference === linkedWO.id
    );

    const partLinesToReturn = alreadyReturned
      ? []
      : linkedWO.lines.filter((l) => l.type === 'Part' && Boolean(l.partCode) && l.qty > 0);

    let nextMovIndex = state.stockMovements.length + 1;
    const returnMovements: StockMovement[] = partLinesToReturn.map((pl) => ({
      id: `mov-${String(nextMovIndex++).padStart(3, '0')}`,
      partId: pl.partCode!,
      partCode: pl.partCode!,
      date: today,
      type: 'kembali_batal',
      quantity: pl.qty,
      reference: linkedWO.id,
      reason: `Pembatalan ${linkedWO.id}: ${trimmedReason}`,
    }));

    updatedWO = {
      ...linkedWO,
      endState: 'batal',
      endedAt: now,
      updatedAt: now,
      history: [
        ...linkedWO.history,
        {
          time: now,
          action: 'Pemeriksaan dibatalkan',
          reason: trimmedReason,
          performedBy: 'Admin',
        },
        ...partLinesToReturn.map((pl) => {
          const part = state.parts.find((p) => p.code === pl.partCode || p.kode === pl.partCode);
          return {
            time: now,
            action: `Part ${pl.partCode} (${pl.qty} ${part?.unit || 'Pcs'}) dikembalikan ke gudang`,
            performedBy: 'Admin',
          };
        }),
      ],
    };

    updatedWOs = state.workOrders.map((wo) => (wo.id === linkedWO.id ? updatedWO! : wo));
    updatedMovements = [...state.stockMovements, ...returnMovements];
  }

  saveStore({
    ...state,
    serviceForms: state.serviceForms.map((item) => (item.id === sf.id ? updatedSF : item)),
    workOrders: updatedWOs,
    stockMovements: updatedMovements,
  });

  return {
    ok: true,
    serviceForm: updatedSF,
    workOrder: updatedWO,
  };
}

export interface FinishWorkOrderResult {
  ok: boolean;
  error?: string;
  workOrder?: WorkOrder;
}

export function finishWorkOrder(workOrderId: string): FinishWorkOrderResult {
  const state = getAdminStore();
  const wo = state.workOrders.find((item) => item.id === workOrderId);
  if (!wo) {
    return { ok: false, error: 'Work order tidak ditemukan.' };
  }

  if (wo.endState === 'selesai') {
    return { ok: true, workOrder: wo };
  }

  if (wo.endState === 'batal') {
    return { ok: false, error: 'Work order sudah dibatalkan.' };
  }

  if (wo.lines.length === 0) {
    return {
      ok: false,
      error: 'Tambahkan jasa atau part sebelum menandai selesai.',
    };
  }

  const now = formatNowTimestamp();
  const updatedWO: WorkOrder = {
    ...wo,
    endState: 'selesai',
    endedAt: now,
    updatedAt: now,
    history: [
      ...wo.history,
      {
        time: now,
        action: 'Work order selesai dilaksanakan',
        performedBy: 'Admin',
      },
    ],
  };

  const nextBaseState = {
    ...state,
    workOrders: state.workOrders.map((item) => (item.id === wo.id ? updatedWO : item)),
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: 'Admin Dummy',
    actorRole: 'admin',
    event: 'work_order_completed',
    category: 'bisnis',
    module: 'work_order',
    action: `Penyelesaian pengerjaan Work Order ${wo.id}`,
    entityType: 'WorkOrder',
    entityId: wo.id,
    beforeData: { endState: wo.endState },
    afterData: { endState: 'selesai', totalLines: wo.lines.length },
    outcome: 'berhasil',
  });

  saveStore(finalState);

  return { ok: true, workOrder: updatedWO };
}

export interface CreateBookingInput {
  customerName: string;
  plate: string;
  engineNo: string;
  frameNo: string;
  service: string;
  date: string;
  hour: string;
  complaint?: string;
  source: Booking['source'];
  customerEmail?: string;
  vehicleModel?: string;
  createdAt?: string;
}

export function createBookingRecord(input: CreateBookingInput): Booking {
  const state = getAdminStore();
  const newId = getNextSequentialId(
    'BK',
    4,
    state.bookings.map((b) => b.id)
  );
  const now = input.createdAt || formatNowTimestamp();
  const newBooking: Booking = {
    id: newId,
    customerName: input.customerName.trim(),
    plate: input.plate.trim().replace(/\s+/g, ' '),
    engineNo: input.engineNo.trim(),
    frameNo: input.frameNo.trim(),
    service: input.service,
    date: input.date,
    hour: input.hour,
    complaint: (input.complaint ?? '').trim(),
    status: 'menunggu',
    source: input.source,
    customerEmail: input.customerEmail ? input.customerEmail.trim() : undefined,
    vehicleModel: input.vehicleModel ? input.vehicleModel.trim() : undefined,
    createdAt: now,
    history: [
      {
        time: now,
        who: input.source === 'online' ? 'Konsumen' : 'Admin',
        what: `Booking dibuat (${input.source})`,
      },
    ],
  };

  const existingCustomer = state.customers.find(
    (c) => c.name.trim().toLowerCase() === newBooking.customerName.toLowerCase()
  );
  const updatedCustomers = existingCustomer
    ? state.customers.map((c) =>
        c.id === existingCustomer.id
          ? {
              ...c,
              plate: c.plate || newBooking.plate,
              engineNo: c.engineNo || newBooking.engineNo,
              frameNo: c.frameNo || newBooking.frameNo,
            }
          : c
      )
    : [
        ...state.customers,
        {
          id: `cust-${String(state.customers.length + 1).padStart(2, '0')}`,
          name: newBooking.customerName,
          phone: '',
          plate: newBooking.plate,
          engineNo: newBooking.engineNo,
          frameNo: newBooking.frameNo,
        },
      ];

  saveStore({
    ...state,
    bookings: [newBooking, ...state.bookings],
    customers: updatedCustomers,
  });

  return newBooking;
}

export function addLineToWorkOrder(
  workOrderId: string,
  line: Omit<ServiceFormLine, 'id'>
): { ok: boolean; error?: string; workOrder?: WorkOrder } {
  const state = getAdminStore();
  const wo = state.workOrders.find((item) => item.id === workOrderId);
  if (!wo) return { ok: false, error: 'Work order tidak ditemukan.' };
  if (wo.endState !== null) {
    return { ok: false, error: 'Work order sudah ditutup dan tidak dapat diubah.' };
  }

  const now = formatNowTimestamp();
  const today = formatTodayDate();
  const newLine: ServiceFormLine = {
    ...line,
    id: `wol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  };

  let nextMovements = state.stockMovements;
  let historyEntryAction = `Jasa "${newLine.name}" ditambahkan`;

  if (newLine.type === 'Part') {
    if (!newLine.partCode) {
      return { ok: false, error: 'Pilih part terlebih dahulu.' };
    }
    const part = state.parts.find(
      (p) => p.code === newLine.partCode || p.kode === newLine.partCode
    );
    const available = part ? computeStock(part, state.stockMovements) : 0;
    const partName = part?.name ?? newLine.name;
    if (newLine.qty > available) {
      return {
        ok: false,
        error: `Stok ${partName} tersisa ${available}, tidak cukup untuk ${newLine.qty}.`,
      };
    }

    const newMov: StockMovement = {
      id: `mov-${String(state.stockMovements.length + 1).padStart(3, '0')}`,
      partId: newLine.partCode,
      partCode: newLine.partCode,
      date: today,
      type: 'keluar_wo',
      quantity: -newLine.qty,
      reference: wo.id,
      reason: `Pemakaian Work Order ${wo.id}`,
    };
    nextMovements = [...state.stockMovements, newMov];
    historyEntryAction = `Part ${newLine.partCode} (${newLine.qty} ${part?.unit || 'Pcs'}) diambil dari gudang`;
  }

  const updatedWO: WorkOrder = {
    ...wo,
    lines: [...wo.lines, newLine],
    updatedAt: now,
    history: [
      ...wo.history,
      { time: now, action: historyEntryAction, performedBy: 'Admin' },
    ],
  };

  saveStore({
    ...state,
    workOrders: state.workOrders.map((item) => (item.id === wo.id ? updatedWO : item)),
    stockMovements: nextMovements,
  });

  return { ok: true, workOrder: updatedWO };
}

export function removeLineFromWorkOrder(
  workOrderId: string,
  lineId: string
): { ok: boolean; error?: string; workOrder?: WorkOrder } {
  const state = getAdminStore();
  const wo = state.workOrders.find((item) => item.id === workOrderId);
  if (!wo) return { ok: false, error: 'Work order tidak ditemukan.' };
  if (wo.endState !== null) {
    return { ok: false, error: 'Work order sudah ditutup dan tidak dapat diubah.' };
  }

  const targetLine = wo.lines.find((l) => l.id === lineId);
  if (!targetLine) return { ok: true, workOrder: wo };

  const now = formatNowTimestamp();
  const today = formatTodayDate();
  let nextMovements = state.stockMovements;
  let historyEntryAction = `Jasa "${targetLine.name}" dihapus`;

  if (targetLine.type === 'Part' && targetLine.partCode) {
    const part = state.parts.find(
      (p) => p.code === targetLine.partCode || p.kode === targetLine.partCode
    );
    const returnMov: StockMovement = {
      id: `mov-${String(state.stockMovements.length + 1).padStart(3, '0')}`,
      partId: targetLine.partCode,
      partCode: targetLine.partCode,
      date: today,
      type: 'kembali_batal',
      quantity: targetLine.qty,
      reference: wo.id,
      reason: `Batal pakai part di ${wo.id}`,
    };
    nextMovements = [...state.stockMovements, returnMov];
    historyEntryAction = `Part ${targetLine.partCode} (${targetLine.qty} ${part?.unit || 'Pcs'}) dikembalikan ke gudang`;
  }

  const updatedWO: WorkOrder = {
    ...wo,
    lines: wo.lines.filter((l) => l.id !== lineId),
    updatedAt: now,
    history: [
      ...wo.history,
      { time: now, action: historyEntryAction, performedBy: 'Admin' },
    ],
  };

  saveStore({
    ...state,
    workOrders: state.workOrders.map((item) => (item.id === wo.id ? updatedWO : item)),
    stockMovements: nextMovements,
  });

  return { ok: true, workOrder: updatedWO };
}

export function assignMechanicToWorkOrder(
  workOrderId: string,
  mechanicId: string | undefined
): WorkOrder | null {
  const state = getAdminStore();
  const wo = state.workOrders.find((item) => item.id === workOrderId);
  if (!wo || wo.endState !== null) return null;

  const now = formatNowTimestamp();
  const mech = state.mechanics.find((m) => m.id === mechanicId);
  const mechLabel = mech ? mech.nama : 'Belum ditugaskan';
  const updatedWO: WorkOrder = {
    ...wo,
    mechanicId: mechanicId || undefined,
    updatedAt: now,
    history: [
      ...wo.history,
      { time: now, action: `Mekanik diubah ke ${mechLabel}`, performedBy: 'Admin' },
    ],
  };

  saveStore({
    ...state,
    workOrders: state.workOrders.map((item) => (item.id === wo.id ? updatedWO : item)),
  });

  return updatedWO;
}

export function addMechanicRecord(input: {
  nama: string;
  hp: string;
  alamat: string;
}): Mechanic {
  const state = getAdminStore();
  const newId = getNextSequentialId(
    'MKN',
    3,
    state.mechanics.map((m) => m.id)
  );
  const trimmedName = input.nama.trim();
  const newMechanic: Mechanic = {
    id: newId,
    nama: trimmedName,
    name: trimmedName,
    hp: input.hp.trim(),
    alamat: input.alamat.trim(),
    active: true,
  };

  saveStore({
    ...state,
    mechanics: [...state.mechanics, newMechanic],
  });

  return newMechanic;
}

export function deactivateMechanicRecord(
  mechanicId: string,
  reason?: string
): {
  ok: boolean;
  activeWoCount?: number;
  error?: string;
} {
  const state = getAdminStore();
  const activeWOs = state.workOrders.filter(
    (wo) => wo.endState === null && wo.mechanicId === mechanicId
  );
  if (activeWOs.length > 0) {
    return {
      ok: false,
      activeWoCount: activeWOs.length,
      error: `Mekanik masih ditugaskan di ${activeWOs.length} work order berjalan. Pindahkan dulu.`,
    };
  }

  const cleanReason = reason?.trim();
  if (!cleanReason) {
    return {
      ok: false,
      error: 'Alasan penghapusan wajib diisi.',
    };
  }

  const now = formatNowTimestamp();
  saveStore({
    ...state,
    mechanics: state.mechanics.map((m) =>
      m.id === mechanicId
        ? { ...m, active: false, deleteReason: cleanReason, deletedAt: now }
        : m
    ),
  });

  return { ok: true };
}

// -------------------------------------------------------------
// POS (POINT OF SALE) OPERATIONS
// -------------------------------------------------------------

export const getNextSaleId = (sales: Sale[]): string => {
  return getNextSequentialId('PJ', 4, sales.map((s) => s.number || s.id));
};

export const getAvailableSalePartStock = (partCode: string): number => {
  const cur = getAdminStore();
  return computeAvailableSaleStock(partCode, cur.stockMovements, cur.sales);
};

export interface ValidateStockResult {
  valid: boolean;
  error?: string;
  insufficientLine?: {
    partCode: string;
    name: string;
    requested: number;
    available: number;
  };
}

export function validateSaleStock(
  lines: SaleLine[],
  excludeSaleId?: string
): ValidateStockResult {
  const cur = getAdminStore();
  const relevantSales = excludeSaleId
    ? cur.sales.filter((s) => s.id !== excludeSaleId && s.number !== excludeSaleId)
    : cur.sales;

  // Group requested quantity by partCode
  const requestedByPart = new Map<string, { qty: number; name: string }>();
  for (const line of lines) {
    const code = line.partCode || line.partId;
    if (!code) continue;
    const existing = requestedByPart.get(code) || { qty: 0, name: line.name };
    requestedByPart.set(code, { qty: existing.qty + line.qty, name: line.name });
  }

  for (const [code, { qty, name }] of requestedByPart.entries()) {
    const available = computeAvailableSaleStock(code, cur.stockMovements, relevantSales);
    if (available < qty) {
      return {
        valid: false,
        error: `Stok ${name} tersisa ${available}, tidak cukup untuk ${qty}.`,
        insufficientLine: {
          partCode: code,
          name,
          requested: qty,
          available,
        },
      };
    }
  }

  return { valid: true };
}

export interface CompleteCashSaleParams {
  customerName: string;
  lines: SaleLine[];
  cashReceived: number;
  cashierName?: string;
}

export interface SaleOperationResult {
  ok: boolean;
  sale?: Sale;
  error?: string;
}

export function completeCashSale(params: CompleteCashSaleParams): SaleOperationResult {
  const { customerName, lines, cashReceived, cashierName = 'Kasir Utama' } = params;
  if (!customerName || !customerName.trim()) {
    return { ok: false, error: 'Nama konsumen wajib diisi.' };
  }
  if (!lines || lines.length === 0) {
    return { ok: false, error: 'Daftar part masih kosong.' };
  }

  const grandTotal = lines.reduce((acc, l) => acc + l.subtotal, 0);
  if (cashReceived < grandTotal) {
    return {
      ok: false,
      error: `Uang tunai kurang dari total belanja (${formatRupiah(grandTotal)}).`,
    };
  }

  const val = validateSaleStock(lines);
  if (!val.valid) {
    return { ok: false, error: val.error };
  }

  const cur = getAdminStore();
  const saleId = getNextSaleId(cur.sales);
  const now = formatNowTimestamp();
  const today = formatTodayDate();

  let nextMovIdx = cur.stockMovements.length + 1;
  const newMovements: StockMovement[] = lines.map((l) => {
    const code = l.partCode || l.partId || 'PRT-001';
    return {
      id: `mov-${String(nextMovIdx++).padStart(3, '0')}`,
      partId: code,
      partCode: code,
      date: today,
      type: 'keluar_penjualan',
      quantity: -l.qty,
      reference: saleId,
      reason: `Penjualan langsung ${saleId}`,
    };
  });

  const change = Math.max(0, cashReceived - grandTotal);
  const newSale: Sale = {
    id: saleId,
    number: saleId,
    date: today,
    createdAt: now,
    origin: 'POS',
    customerName: customerName.trim(),
    lines: lines.map((l) => ({ ...l })),
    subtotal: grandTotal,
    total: grandTotal,
    method: 'Tunai',
    paymentStatus: 'dibayar',
    cashReceived,
    change,
    cashierName,
    paidAt: now,
  };

  const nextBaseState = {
    ...cur,
    sales: [newSale, ...cur.sales],
    stockMovements: [...cur.stockMovements, ...newMovements],
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: cashierName,
    actorRole: 'admin',
    event: 'pos_cash_sale_completed',
    category: 'bisnis',
    module: 'pos',
    action: `Finalisasi transaksi kasir tunai POS ${saleId} (${customerName.trim()})`,
    entityType: 'Sale',
    entityId: saleId,
    reference: newMovements[0]?.id,
    afterData: { total: grandTotal, cashReceived, change, linesCount: lines.length },
    outcome: 'berhasil',
  });

  saveStore(finalState);

  return { ok: true, sale: newSale };
}

export interface CreateSaleCheckoutParams {
  customerName: string;
  lines: SaleLine[];
  method: 'Transfer' | 'QR';
  cashierName?: string;
}

export function createSaleCheckout(params: CreateSaleCheckoutParams): SaleOperationResult {
  const { customerName, lines, method, cashierName = 'Kasir Utama' } = params;
  if (!customerName || !customerName.trim()) {
    return { ok: false, error: 'Nama konsumen wajib diisi.' };
  }
  if (!lines || lines.length === 0) {
    return { ok: false, error: 'Daftar part masih kosong.' };
  }

  const val = validateSaleStock(lines);
  if (!val.valid) {
    return { ok: false, error: val.error };
  }

  const cur = getAdminStore();
  const saleId = getNextSaleId(cur.sales);
  const now = formatNowTimestamp();
  const today = formatTodayDate();
  const grandTotal = lines.reduce((acc, l) => acc + l.subtotal, 0);

  const refPrefix = method === 'Transfer' ? 'TRF' : 'QRIS';
  const paymentReference = `${refPrefix}-${Math.floor(100000 + Math.random() * 900000)}`;

  const newSale: Sale = {
    id: saleId,
    number: saleId,
    date: today,
    createdAt: now,
    origin: 'POS',
    customerName: customerName.trim(),
    lines: lines.map((l) => ({ ...l })),
    subtotal: grandTotal,
    total: grandTotal,
    method,
    paymentStatus: 'menunggu_pembayaran',
    paymentReference,
    cashierName,
  };

  // Stock movements are NOT created yet (logical reservation holds stock)
  saveStore({
    ...cur,
    sales: [newSale, ...cur.sales],
  });

  return { ok: true, sale: newSale };
}

export function confirmSalePayment(saleId: string, reference?: string): SaleOperationResult {
  const cur = getAdminStore();
  const existing = cur.sales.find((s) => s.id === saleId || s.number === saleId);
  if (!existing) {
    return { ok: false, error: 'Transaksi tidak ditemukan.' };
  }

  // Idempotent: already paid
  if (existing.paymentStatus === 'dibayar') {
    return { ok: true, sale: existing };
  }

  if (existing.paymentStatus === 'dibatalkan' || existing.paymentStatus === 'kedaluwarsa') {
    return { ok: false, error: `Transaksi sudah ${existing.paymentStatus}.` };
  }

  // Physical stock check (excluding this pending sale's reservation)
  const val = validateSaleStock(existing.lines, existing.id);
  if (!val.valid) {
    return { ok: false, error: val.error };
  }

  const now = formatNowTimestamp();
  const today = formatTodayDate();
  let nextMovIdx = cur.stockMovements.length + 1;

  const newMovements: StockMovement[] = existing.lines.map((l) => {
    const code = l.partCode || l.partId || 'PRT-001';
    return {
      id: `mov-${String(nextMovIdx++).padStart(3, '0')}`,
      partId: code,
      partCode: code,
      date: today,
      type: 'keluar_penjualan',
      quantity: -l.qty,
      reference: existing.number || existing.id,
      reason: `Penjualan ${existing.method} ${existing.number || existing.id}`,
    };
  });

  const updatedSale: Sale = {
    ...existing,
    paymentStatus: 'dibayar',
    paidAt: now,
    paymentReference: reference || existing.paymentReference,
  };

  const nextBaseState = {
    ...cur,
    sales: cur.sales.map((s) => (s.id === existing.id ? updatedSale : s)),
    stockMovements: [...cur.stockMovements, ...newMovements],
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: 'ADM-001',
    actorName: existing.cashierName || 'Kasir Utama',
    actorRole: 'admin',
    event: 'pos_digital_payment_confirmed',
    category: 'bisnis',
    module: 'pos',
    action: `Konfirmasi pembayaran ${existing.method} transaksi POS ${existing.id}`,
    entityType: 'Sale',
    entityId: existing.id,
    reference: reference || existing.paymentReference,
    beforeData: { paymentStatus: 'menunggu_pembayaran' },
    afterData: { paymentStatus: 'dibayar', paidAt: now },
    outcome: 'berhasil',
  });

  saveStore(finalState);

  return { ok: true, sale: updatedSale };
}

export function cancelPendingSale(saleId: string, reason?: string): SaleOperationResult {
  const cur = getAdminStore();
  const existing = cur.sales.find((s) => s.id === saleId || s.number === saleId);
  if (!existing) {
    return { ok: false, error: 'Transaksi tidak ditemukan.' };
  }

  if (existing.paymentStatus === 'dibatalkan') {
    return { ok: true, sale: existing };
  }

  if (existing.paymentStatus === 'dibayar') {
    return { ok: false, error: 'Transaksi yang sudah lunas tidak dapat dibatalkan.' };
  }

  const now = formatNowTimestamp();
  const updatedSale: Sale = {
    ...existing,
    paymentStatus: 'dibatalkan',
    cancelledAt: now,
  };

  // Releases logical reservation, no stock movements created
  saveStore({
    ...cur,
    sales: cur.sales.map((s) => (s.id === existing.id ? updatedSale : s)),
  });

  return { ok: true, sale: updatedSale };
}

export function expirePendingSale(saleId: string): SaleOperationResult {
  const cur = getAdminStore();
  const existing = cur.sales.find((s) => s.id === saleId || s.number === saleId);
  if (!existing) {
    return { ok: false, error: 'Transaksi tidak ditemukan.' };
  }

  if (existing.paymentStatus !== 'menunggu_pembayaran') {
    return { ok: true, sale: existing };
  }

  const now = formatNowTimestamp();
  const updatedSale: Sale = {
    ...existing,
    paymentStatus: 'kedaluwarsa',
    cancelledAt: now,
  };

  saveStore({
    ...cur,
    sales: cur.sales.map((s) => (s.id === existing.id ? updatedSale : s)),
  });

  return { ok: true, sale: updatedSale };
}

export function printSalesReceipt(sale: Sale): void {
  printDocument('nota_penjualan', {
    transactionCode: sale.number || sale.id,
    customerName: sale.customerName,
    date: sale.paidAt || sale.createdAt || sale.date,
    cashierName: sale.cashierName || 'Kasir Utama',
    lines: sale.lines.map((l) => ({
      partCode: l.partCode || l.partId || 'PRT-001',
      name: l.name,
      qty: l.qty,
      price: l.price,
      subtotal: l.subtotal,
    })),
    subtotal: sale.subtotal ?? sale.total,
    total: sale.total,
    method: sale.method,
    paymentReference: sale.paymentReference,
    cashReceived: sale.cashReceived,
    change: sale.change,
  });
}

// -------------------------------------------------------------
// REACT CONTEXT & HOOK
// -------------------------------------------------------------

interface AdminContextType extends PersistedAdminStore {
  addBooking: (b: CreateBookingInput) => Booking;
  updateBookingStatus: (id: string, status: Booking['status'], reason?: string) => void;
  addServiceForm: (sf: CreateServiceFromDraftInput) => ServiceForm;
  updateServiceForm: (id: string, updates: Partial<ServiceForm>) => void;
  addWorkOrder: (wo: Omit<WorkOrder, 'id'>) => WorkOrder;
  updateWorkOrder: (id: string, updates: Partial<WorkOrder>) => void;
  addStockMovement: (m: Omit<StockMovement, 'id' | 'partId'> & { partId?: string }) => StockMovement;
  updatePart: (code: string, updates: Partial<Part>) => void;
  addPartChange: (c: Omit<PartHistory, 'id'>) => PartHistory;
  getNextPartCode: () => string;
  addSale: (s: Omit<Sale, 'id'>) => Sale;
  updateAttendance: (id: string, updates: Partial<MechanicAttendance>) => void;
  addAttendanceCheckIn: (mechanicId: string, date: string, time: string) => void;
  addTicket: (
    t: Omit<HelpDeskTicket, 'id' | 'createdAt' | 'thread'>,
    firstMessage?: string
  ) => HelpDeskTicket;
  replyTicket: (id: string, text: string, sender?: string) => void;
  updateTicketStatus: (id: string, status: HelpDeskTicket['status']) => void;
  updateTicket: (id: string, updates: Partial<HelpDeskTicket>) => void;
  assignTicket: (id: string, staffName: string) => void;
  resolveTicket: (id: string, resolutionNotes: string) => void;
  reopenTicket: (id: string, reason: string) => void;
  createCorrectionRequest: (
    req: Omit<CorrectionRequest, 'id' | 'requestedAt' | 'status'>
  ) => CorrectionRequest;
  reviewCorrectionRequest: (
    id: string,
    decision: 'disetujui' | 'ditolak',
    reviewerName: string,
    notes?: string
  ) => void;
  addKnowledgeBaseArticle: (
    article: Omit<KnowledgeBaseArticle, 'id' | 'updatedAt'>
  ) => KnowledgeBaseArticle;
  refreshDataStore: () => void;
  addManualEntry: (e: Omit<ManualEntry, 'id'>) => ManualEntry;
  correctManualEntry: (id: string, newEntry: Omit<ManualEntry, 'id'>, reason: string) => void;
  getPartStock: (partCode: string) => number;

  // SV-0 operations
  createServiceFromDraft: typeof createServiceFromDraft;
  markBookingArrived: typeof markBookingArrived;
  cancelBooking: typeof cancelBooking;
  restoreBooking: typeof restoreBooking;
  approveToWorkOrder: typeof approveToWorkOrder;
  cancelServiceForm: typeof cancelServiceForm;
  finishWorkOrder: typeof finishWorkOrder;
  addLineToWorkOrder: typeof addLineToWorkOrder;
  removeLineFromWorkOrder: typeof removeLineFromWorkOrder;
  assignMechanicToWorkOrder: typeof assignMechanicToWorkOrder;
  addMechanicRecord: typeof addMechanicRecord;
  deactivateMechanicRecord: typeof deactivateMechanicRecord;

  // GD-3 Master Gudang / Warehouse Part operations
  createMasterPart: typeof createMasterPart;
  editMasterPart: typeof editMasterPart;
  deleteMasterPart: typeof deleteMasterPart;

  // POS operations
  getAvailableSalePartStock: typeof getAvailableSalePartStock;
  validateSaleStock: typeof validateSaleStock;
  completeCashSale: typeof completeCashSale;
  createSaleCheckout: typeof createSaleCheckout;
  confirmSalePayment: typeof confirmSalePayment;
  cancelPendingSale: typeof cancelPendingSale;
  expirePendingSale: typeof expirePendingSale;
  printSalesReceipt: typeof printSalesReceipt;

  // EXPORT-0 operations
  recordAuditEvent: typeof recordAuditEvent;
  recordReportExportEvent: typeof recordReportExportEvent;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(subscribeAdminStore, getAdminStore, getAdminStore);

  useEffect(() => {
    void syncSharedWorkshopStateFromSupabase();

    const handleStorage = (ev: StorageEvent) => {
      if (ev.key === STORAGE_KEY) {
        storeState = loadInitialStore();
        listeners.forEach((l) => l());
      }
    };

    const handleFocusOrVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void syncSharedWorkshopStateFromSupabase();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', handleFocusOrVisible);
    document.addEventListener('visibilitychange', handleFocusOrVisible);

    const pollTimer = window.setInterval(() => {
      void syncSharedWorkshopStateFromSupabase();
    }, 4000);

    const channel = supabase
      .channel('mybengkel-shared-workshop-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shared_workshop_state' },
        () => {
          void syncSharedWorkshopStateFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => {
          void syncSharedWorkshopStateFromSupabase();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', handleFocusOrVisible);
      document.removeEventListener('visibilitychange', handleFocusOrVisible);
      window.clearInterval(pollTimer);
      void supabase.removeChannel(channel);
    };
  }, []);

  const getPartStock = (partCode: string): number => {
    const cur = getAdminStore();
    return computeStock(partCode, cur.stockMovements);
  };

  const addBooking = (b: CreateBookingInput): Booking => createBookingRecord(b);

  const updateBookingStatus = (id: string, status: Booking['status'], reason?: string) => {
    if (status === 'datang') {
      markBookingArrived(id);
      return;
    }
    if (status === 'batal') {
      cancelBooking(id, reason);
      return;
    }
    restoreBooking(id);
  };

  const addServiceForm = (sf: CreateServiceFromDraftInput): ServiceForm =>
    createServiceFromDraft(sf);

  const updateServiceForm = (id: string, updates: Partial<ServiceForm>) => {
    const cur = getAdminStore();
    saveStore({
      ...cur,
      serviceForms: cur.serviceForms.map((sf) => (sf.id === id ? { ...sf, ...updates } : sf)),
    });
  };

  const addWorkOrder = (wo: Omit<WorkOrder, 'id'>): WorkOrder => {
    const cur = getAdminStore();
    const newId = getNextSequentialId(
      'WO',
      4,
      cur.workOrders.map((item) => item.id)
    );
    const newWO: WorkOrder = { ...wo, id: newId };
    saveStore({
      ...cur,
      workOrders: [newWO, ...cur.workOrders],
    });
    return newWO;
  };

  const updateWorkOrder = (id: string, updates: Partial<WorkOrder>) => {
    const cur = getAdminStore();
    saveStore({
      ...cur,
      workOrders: cur.workOrders.map((wo) => (wo.id === id ? { ...wo, ...updates } : wo)),
    });
  };

  const addStockMovement = (
    m: Omit<StockMovement, 'id' | 'partId'> & { partId?: string }
  ): StockMovement => {
    const cur = getAdminStore();
    const newId = `mov-${String(cur.stockMovements.length + 1).padStart(3, '0')}`;
    const resolvedPartId = m.partId || m.partCode;
    const newM: StockMovement = {
      ...m,
      id: newId,
      partId: resolvedPartId,
      partCode: resolvedPartId,
    };
    saveStore({
      ...cur,
      stockMovements: [...cur.stockMovements, newM],
    });
    return newM;
  };

  const updatePart = (code: string, updates: Partial<Part>) => {
    const cur = getAdminStore();
    saveStore({
      ...cur,
      parts: cur.parts.map((p) =>
        p.kode === code || p.code === code ? normalizePart({ ...p, ...updates }) : p
      ),
    });
  };

  const addPartChange = (c: Omit<PartHistory, 'id'>): PartHistory => {
    const cur = getAdminStore();
    const newId = `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const record: PartHistory = { ...c, id: newId };
    const nextHistory = [record, ...cur.partHistory];
    saveStore({
      ...cur,
      partHistory: nextHistory,
      partChanges: nextHistory,
    });
    return record;
  };

  const addSale = (s: Omit<Sale, 'id'>): Sale => {
    const cur = getAdminStore();
    const newId = `SL-${String(cur.sales.length + 1).padStart(3, '0')}`;
    const newSale: Sale = { ...s, id: newId };
    saveStore({
      ...cur,
      sales: [newSale, ...cur.sales],
    });
    return newSale;
  };

  const updateAttendance = (id: string, updates: Partial<MechanicAttendance>) => {
    const cur = getAdminStore();
    saveStore({
      ...cur,
      attendance: cur.attendance.map((att) => (att.id === id ? { ...att, ...updates } : att)),
    });
  };

  const addAttendanceCheckIn = (mechanicId: string, date: string, time: string) => {
    const cur = getAdminStore();
    const existing = cur.attendance.find(
      (a) => a.mechanicId === mechanicId && a.date === date
    );
    if (existing) {
      updateAttendance(existing.id, { checkIn: time });
    } else {
      const newAtt: MechanicAttendance = {
        id: `att-${cur.attendance.length + 1}`,
        mechanicId,
        date,
        checkIn: time,
        relatedWorkOrders: [],
      };
      saveStore({
        ...cur,
        attendance: [...cur.attendance, newAtt],
      });
    }
  };

  const addTicket = (
    t: Omit<HelpDeskTicket, 'id' | 'createdAt' | 'thread'>,
    firstMessage?: string
  ): HelpDeskTicket => {
    const cur = getAdminStore();
    const newId = `TKT-${String(cur.tickets.length + 1).padStart(3, '0')}`;
    const nowStr = formatNowTimestamp();
    const newTicket: HelpDeskTicket = {
      ...t,
      id: newId,
      createdAt: nowStr,
      updatedAt: nowStr,
      thread: firstMessage
        ? [
            {
              id: `msg-${Date.now()}`,
              sender: t.reportedBy,
              time: nowStr,
              text: firstMessage,
            },
          ]
        : [],
    };
    saveStore({
      ...cur,
      tickets: [newTicket, ...cur.tickets],
    });
    recordAuditEvent({
      actorId: 'HD-001',
      actorName: 'Master Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'ticket_created',
      category: 'bisnis',
      module: 'helpdesk',
      action: `Membuat tiket kendala ${newId}: ${newTicket.title}`,
      entityType: 'HelpDeskTicket',
      entityId: newId,
      afterData: newTicket,
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
    return newTicket;
  };

  const replyTicket = (id: string, text: string, sender: string = 'Admin') => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              updatedAt: nowStr,
              thread: [
                ...t.thread,
                {
                  id: `msg-${Date.now()}`,
                  sender,
                  time: nowStr,
                  text,
                },
              ],
            }
          : t
      ),
    });
  };

  const updateTicketStatus = (id: string, status: HelpDeskTicket['status']) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) => (t.id === id ? { ...t, status, updatedAt: nowStr } : t)),
    });
  };

  const updateTicket = (id: string, updates: Partial<HelpDeskTicket>) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: nowStr } : t)),
    });
  };

  const assignTicket = (id: string, staffName: string) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) =>
        t.id === id ? { ...t, assignedStaff: staffName, updatedAt: nowStr } : t
      ),
    });
    recordAuditEvent({
      actorId: 'HD-001',
      actorName: 'Master Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'ticket_assigned',
      category: 'bisnis',
      module: 'helpdesk',
      action: `Menugaskan tiket ${id} kepada ${staffName}`,
      entityType: 'HelpDeskTicket',
      entityId: id,
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
  };

  const resolveTicket = (id: string, resolutionNotes: string) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'selesai',
              resolutionNotes,
              resolvedAt: nowStr,
              updatedAt: nowStr,
            }
          : t
      ),
    });
    recordAuditEvent({
      actorId: 'HD-001',
      actorName: 'Master Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'ticket_resolved',
      category: 'bisnis',
      module: 'helpdesk',
      action: `Menyelesaikan tiket kendala ${id}`,
      entityType: 'HelpDeskTicket',
      entityId: id,
      reason: resolutionNotes,
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
  };

  const reopenTicket = (id: string, reason: string) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    saveStore({
      ...cur,
      tickets: cur.tickets.map((t) =>
        t.id === id
          ? {
              ...t,
              status: 'dibuka_kembali',
              updatedAt: nowStr,
              thread: [
                ...t.thread,
                {
                  id: `msg-${Date.now()}`,
                  sender: 'Master Helpdesk',
                  time: nowStr,
                  text: `Tiket dibuka kembali: ${reason}`,
                },
              ],
            }
          : t
      ),
    });
    recordAuditEvent({
      actorId: 'HD-001',
      actorName: 'Master Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'ticket_reopened',
      category: 'bisnis',
      module: 'helpdesk',
      action: `Membuka kembali tiket ${id}`,
      entityType: 'HelpDeskTicket',
      entityId: id,
      reason,
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
  };

  const createCorrectionRequest = (
    req: Omit<CorrectionRequest, 'id' | 'requestedAt' | 'status'>
  ): CorrectionRequest => {
    const cur = getAdminStore();
    const newId = `COR-${String(cur.correctionRequests.length + 1).padStart(3, '0')}`;
    const nowStr = formatNowTimestamp();
    const newReq: CorrectionRequest = {
      ...req,
      id: newId,
      requestedAt: nowStr,
      status: 'menunggu_persetujuan',
    };
    saveStore({
      ...cur,
      correctionRequests: [newReq, ...cur.correctionRequests],
    });
    recordAuditEvent({
      actorId: 'HD-001',
      actorName: 'Master Helpdesk',
      actorRole: 'master_helpdesk',
      event: 'correction_requested',
      category: 'bisnis',
      module: 'helpdesk',
      action: `Mengajukan koreksi data ${newReq.entityType} ${newReq.entityId} (Tingkat Risiko: ${newReq.riskLevel})`,
      entityType: newReq.entityType,
      entityId: newReq.entityId,
      reason: newReq.reason,
      beforeData: { [newReq.fieldName]: newReq.currentValue },
      afterData: { [newReq.fieldName]: newReq.proposedValue },
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
    return newReq;
  };

  const reviewCorrectionRequest = (
    id: string,
    decision: 'disetujui' | 'ditolak',
    reviewerName: string,
    notes?: string
  ) => {
    const cur = getAdminStore();
    const nowStr = formatNowTimestamp();
    const target = cur.correctionRequests.find((c) => c.id === id);
    if (!target) return;

    // Apply the correction to store if approved
    const updatedStore = { ...cur };
    if (decision === 'disetujui') {
      if (target.entityType === 'Part') {
        updatedStore.parts = updatedStore.parts.map((p) =>
          p.kode === target.entityId || p.id === target.entityId
            ? { ...p, [target.fieldName]: target.proposedValue }
            : p
        );
      } else if (target.entityType === 'Sale') {
        updatedStore.sales = updatedStore.sales.map((s) =>
          s.id === target.entityId || s.number === target.entityId
            ? { ...s, [target.fieldName]: target.proposedValue }
            : s
        );
      } else if (target.entityType === 'Booking') {
        updatedStore.bookings = updatedStore.bookings.map((b) =>
          b.id === target.entityId
            ? { ...b, [target.fieldName]: target.proposedValue }
            : b
        );
      }
    }

    updatedStore.correctionRequests = updatedStore.correctionRequests.map((c) =>
      c.id === id
        ? {
            ...c,
            status: decision,
            reviewedBy: reviewerName,
            reviewedAt: nowStr,
            reviewNotes: notes,
          }
        : c
    );

    saveStore(updatedStore);

    recordAuditEvent({
      actorId: 'ADM-001',
      actorName: reviewerName,
      actorRole: 'admin',
      event: decision === 'disetujui' ? 'correction_approved' : 'correction_rejected',
      category: 'bisnis',
      module: 'helpdesk',
      action: `${decision === 'disetujui' ? 'Menyetujui' : 'Menolak'} koreksi data ${target.entityType} ${target.entityId}`,
      entityType: target.entityType,
      entityId: target.entityId,
      reason: notes || target.reason,
      occurredAt: nowStr,
      outcome: 'berhasil',
    });
  };

  const addKnowledgeBaseArticle = (
    article: Omit<KnowledgeBaseArticle, 'id' | 'updatedAt'>
  ): KnowledgeBaseArticle => {
    const cur = getAdminStore();
    const newId = `KB-${String(cur.knowledgeBase.length + 1).padStart(3, '0')}`;
    const nowStr = formatNowTimestamp();
    const newArticle: KnowledgeBaseArticle = {
      ...article,
      id: newId,
      updatedAt: nowStr,
    };
    saveStore({
      ...cur,
      knowledgeBase: [newArticle, ...cur.knowledgeBase],
    });
    return newArticle;
  };

  const refreshDataStore = () => {
    storeState = loadInitialStore();
    listeners.forEach((l) => l());
    void syncSharedWorkshopStateFromSupabase();
  };

  const addManualEntry = (e: Omit<ManualEntry, 'id'>): ManualEntry => {
    const cur = getAdminStore();
    const newId = `MNL-${String(cur.manualEntries.length + 1).padStart(3, '0')}`;
    const newEntry: ManualEntry = { ...e, id: newId };
    saveStore({
      ...cur,
      manualEntries: [newEntry, ...cur.manualEntries],
    });
    return newEntry;
  };

  const correctManualEntry = (
    id: string,
    newEntry: Omit<ManualEntry, 'id'>,
    reason: string
  ) => {
    const cur = getAdminStore();
    saveStore({
      ...cur,
      manualEntries: cur.manualEntries.map((m) =>
        m.id === id
          ? {
              ...newEntry,
              id: m.id,
              isCorrected: true,
              correctionReason: reason,
              originalValues: {
                category: m.category,
                amount: m.amount,
                notes: m.notes,
              },
            }
          : m
      ),
    });
  };

  return (
    <AdminContext.Provider
      value={{
        ...state,
        addBooking,
        updateBookingStatus,
        addServiceForm,
        updateServiceForm,
        addWorkOrder,
        updateWorkOrder,
        addStockMovement,
        updatePart,
        addPartChange,
        getNextPartCode,
        addSale,
        updateAttendance,
        addAttendanceCheckIn,
        addTicket,
        replyTicket,
        updateTicketStatus,
        updateTicket,
        assignTicket,
        resolveTicket,
        reopenTicket,
        createCorrectionRequest,
        reviewCorrectionRequest,
        addKnowledgeBaseArticle,
        refreshDataStore,
        addManualEntry,
        correctManualEntry,
        getPartStock,
        createServiceFromDraft,
        markBookingArrived,
        cancelBooking,
        restoreBooking,
        approveToWorkOrder,
        cancelServiceForm,
        finishWorkOrder,
        addLineToWorkOrder,
        removeLineFromWorkOrder,
        assignMechanicToWorkOrder,
        addMechanicRecord,
        deactivateMechanicRecord,
        createMasterPart,
        editMasterPart,
        deleteMasterPart,
        getAvailableSalePartStock,
        validateSaleStock,
        completeCashSale,
        createSaleCheckout,
        confirmSalePayment,
        cancelPendingSale,
        expirePendingSale,
        printSalesReceipt,
        recordAuditEvent,
        recordReportExportEvent,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdmin = (): AdminContextType => {
  const context = useContext(AdminContext);
  if (!context) {
    throw new Error('useAdmin must be used within an AdminProvider');
  }
  return context;
};
