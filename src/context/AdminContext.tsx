import React, { createContext, useContext, useSyncExternalStore } from 'react';
import {
  ARRIVAL_TARGET,
  Booking,
  Customer,
  CorrectionRequest,
  HelpDeskTicket,
  KnowledgeBaseArticle,
  LineFulfilState,
  ManualEntry,
  Mechanic,
  MechanicAttendance,
  Part,
  PartChangeRecord,
  PartHistory,
  PartJenis,
  PurchaseRequest,
  PurchaseRequestCustomer,
  PurchaseRequestLine,
  PurchaseRequesterKind,
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
  initialPurchaseRequests,
  initialSales,
  initialServiceForms,
  initialStockMovements,
  initialVehicles,
  initialWorkOrders,
  makePartRecord,
} from '../data/adminDummy';
import { DUMMY_ADMIN, DUMMY_ADMIN_LOGIN_PIN, DUMMY_MASTER } from '../lib/mockCredentials';
import { formatRupiah } from '../lib/format';
import { printDocument } from '../lib/printDocument';
import {
  StockOpnameSession,
  initialStockOpnames,
  createStockOpname as libCreateStockOpname,
  saveStockOpnameCount as libSaveStockOpnameCount,
  submitStockOpname as libSubmitStockOpname,
  requestStockOpnameRecount as libRequestStockOpnameRecount,
  approveStockOpname as libApproveStockOpname,
  rejectStockOpname as libRejectStockOpname,
  cancelStockOpname as libCancelStockOpname,
  StockOpnameScope,
} from '../lib/stockOpname';
import {
  AuditLog,
  initialAuditLogs,
  getNextAuditCode,
  AuditActorRole,
} from '../lib/auditTrail';

const STORAGE_KEY = 'mybengkel_admin_store_v2';

export type { StockOpnameSession, StockOpnameScope, AuditLog };
export { initialStockOpnames, initialAuditLogs };

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
  purchaseRequests: PurchaseRequest[];
  sales: Sale[];
  attendance: MechanicAttendance[];
  tickets: HelpDeskTicket[];
  correctionRequests: CorrectionRequest[];
  knowledgeBase: KnowledgeBaseArticle[];
  manualEntries: ManualEntry[];
  stockOpnames: StockOpnameSession[];
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

export const generateOrderCode = (
  type: 'reguler' | 'ho',
  existingRequests: PurchaseRequest[],
  dateIso: string = formatTodayDate()
): string => {
  const datePart = dateToSlash(dateIso);
  const suffix = type === 'ho' ? 'HO' : 'RG';
  const prefix = `${datePart}/`;
  const suffixWithSlash = `/${suffix}`;

  let maxSeq = 0;
  for (const pr of existingRequests) {
    if (!pr.orderCode) continue;
    const code = pr.orderCode.trim();
    if (code.startsWith(prefix) && code.endsWith(suffixWithSlash)) {
      const middle = code.slice(prefix.length, code.length - suffixWithSlash.length);
      const parsed = Number(middle);
      if (!Number.isNaN(parsed) && parsed > maxSeq) {
        maxSeq = parsed;
      }
    }
  }

  return `${datePart}/${String(maxSeq + 1).padStart(5, '0')}/${suffix}`;
};

const VALID_BOOKING_STATUSES = new Set<string>(['menunggu', 'datang', 'batal']);
const VALID_SF_STATUSES = new Set<string>(['menunggu_persetujuan', 'disetujui', 'batal']);
const VALID_PR_STATES = new Set<string>([
  'diajukan',
  'belum_sampai',
  'sampai',
  'selesai',
  'ditolak',
  'batal',
]);

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
  purchaseRequests: initialPurchaseRequests,
  sales: initialSales,
  attendance: initialAttendance,
  tickets: initialHelpDeskTickets,
  correctionRequests: initialCorrectionRequests,
  knowledgeBase: initialKnowledgeBase,
  manualEntries: initialManualEntries,
  stockOpnames: initialStockOpnames,
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
  const stokMin =
    jenis === 'ho' ? null : raw.stokMin !== undefined ? raw.stokMin : (raw.minStock ?? 1);
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

    const normalizedPRs = Array.isArray(parsed.purchaseRequests)
      ? parsed.purchaseRequests.filter(
          (pr) => pr && VALID_PR_STATES.has(pr.state) && Array.isArray(pr.lines)
        )
      : defaults.purchaseRequests;

    const normalizedMovements = Array.isArray(parsed.stockMovements)
      ? parsed.stockMovements.map((m) => ({
          ...m,
          partId: m.partId || m.partCode,
          partCode: m.partCode || m.partId,
        }))
      : defaults.stockMovements;

    const historyList = parsed.partHistory ?? parsed.partChanges ?? defaults.partHistory;

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
      purchaseRequests: normalizedPRs,
      sales: parsed.sales ?? defaults.sales,
      attendance: parsed.attendance ?? defaults.attendance,
      tickets: Array.isArray(parsed.tickets) && parsed.tickets.length > 0 ? parsed.tickets : defaults.tickets,
      correctionRequests: Array.isArray(parsed.correctionRequests) ? parsed.correctionRequests : defaults.correctionRequests,
      knowledgeBase: Array.isArray(parsed.knowledgeBase) ? parsed.knowledgeBase : defaults.knowledgeBase,
      manualEntries: parsed.manualEntries ?? defaults.manualEntries,
      stockOpnames: Array.isArray(parsed.stockOpnames) ? parsed.stockOpnames : defaults.stockOpnames,
      auditLogs: Array.isArray(parsed.auditLogs) ? parsed.auditLogs : defaults.auditLogs,
    };
  } catch {
    return defaults;
  }
};

// -------------------------------------------------------------
// SINGLE MODULE-LEVEL STORE (SAVED IN LOCALSTORAGE)
// -------------------------------------------------------------

let storeState: PersistedAdminStore = loadInitialStore();
const listeners = new Set<() => void>();

const saveStore = (next: PersistedAdminStore) => {
  storeState = next;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storeState));
    } catch {
      // Ignore storage quota errors in prototype
    }
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
  format: 'Excel' | 'PDF';
  scope: 'admin' | 'master_admin';
  periodLabel: string;
}): AuditLog => {
  return recordAuditEvent({
    actorId: params.actor.id,
    actorName: params.actor.nama,
    actorRole: params.actor.role,
    event: params.scope === 'master_admin' ? 'report_export_master' : 'report_export_admin',
    category: 'akses',
    module: 'laporan',
    action: `Ekspor Laporan ${params.scope === 'master_admin' ? 'Master Admin (+ Audit Trail)' : 'Admin'} (${params.format})`,
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
  lastRegulerSubmissionSig = '';
  lastRegulerSubmissionId = '';
  lastHoSubmissionSig = '';
  lastHoSubmissionId = '';
  lastMasterPartSig = '';
  lastMasterPartCode = '';
  saveStore(createDefaultStore());
};

export const getNextPmtCode = (): string => {
  const cur = getAdminStore();
  return getNextSequentialId(
    'PMT',
    4,
    cur.purchaseRequests.map((pr) => pr.id)
  );
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
// GD-0 ATOMIC, IDEMPOTENT GUDANG OPERATIONS OUTSIDE COMPONENTS
// -------------------------------------------------------------

let lastRegulerSubmissionSig = '';
let lastRegulerSubmissionId = '';

export interface CreateRegulerLineInput {
  partId: string;
  qty: number;
  hargaPerkiraan?: number;
}

export interface CreateRegulerRequestInput {
  requestReason: string;
  lines: CreateRegulerLineInput[];
  submissionId?: string;
}

export interface CreateRegulerRequestResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function createRegulerRequest(
  input: CreateRegulerRequestInput
): CreateRegulerRequestResult {
  const state = getAdminStore();
  const reason = input.requestReason.trim();
  if (!reason) {
    return { ok: false, error: 'Alasan permintaan wajib diisi.' };
  }
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { ok: false, error: 'Tambahkan minimal 1 part.' };
  }
  if (input.lines.length > 20) {
    return { ok: false, error: 'Maksimal 20 baris part dalam satu permintaan.' };
  }

  const seenParts = new Set<string>();
  for (const line of input.lines) {
    const pid = line.partId.trim();
    if (!pid || !state.parts.some((p) => p.id === pid || p.kode === pid)) {
      return { ok: false, error: 'Pilih part yang terdaftar di Master Gudang.' };
    }
    if (seenParts.has(pid)) {
      return { ok: false, error: 'Part ini sudah ada di daftar.' };
    }
    seenParts.add(pid);
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      return { ok: false, error: 'Jumlah harus berupa angka bulat minimal 1.' };
    }
  }

  const sig =
    input.submissionId ||
    `reg|${reason}|${input.lines
      .map((l) => `${l.partId}:${l.qty}:${l.hargaPerkiraan || 0}`)
      .join(',')}`;

  if (sig && sig === lastRegulerSubmissionSig && lastRegulerSubmissionId) {
    const existing = state.purchaseRequests.find((r) => r.id === lastRegulerSubmissionId);
    if (existing) {
      return { ok: true, request: existing };
    }
  }

  const newId = getNextPmtCode();
  const now = formatNowTimestamp();

  const lines: PurchaseRequestLine[] = input.lines.map((l, idx) => ({
    id: `prl-${newId.toLowerCase()}-${idx + 1}`,
    partId: l.partId.trim(),
    qty: l.qty,
    hargaPerkiraan: l.hargaPerkiraan && l.hargaPerkiraan > 0 ? Math.round(l.hargaPerkiraan) : 0,
    fulfil: 'dipenuhi',
    lineState: 'belum',
  }));

  const newReq: PurchaseRequest = {
    id: newId,
    type: 'reguler',
    requesterKind: 'bengkel',
    requesterName: 'Admin Gudang',
    dp: 0,
    createdAt: now,
    requestReason: reason,
    state: 'diajukan',
    lines,
  };

  lastRegulerSubmissionSig = sig;
  lastRegulerSubmissionId = newId;

  saveStore({
    ...state,
    purchaseRequests: [newReq, ...state.purchaseRequests],
  });

  return { ok: true, request: newReq };
}

export function setLineFulfil(
  requestId: string,
  lineIds: string[],
  fulfil: LineFulfilState
): PurchaseRequest | null {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req) return null;

  // Only editable while state is diajukan
  if (req.state !== 'diajukan') {
    return req;
  }

  const idSet = new Set(lineIds);
  const needsUpdate = req.lines.some((l) => idSet.has(l.id) && l.fulfil !== fulfil);
  if (!needsUpdate) {
    return req;
  }

  const updatedReq: PurchaseRequest = {
    ...req,
    lines: req.lines.map((l) => (idSet.has(l.id) ? { ...l, fulfil } : l)),
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
  });

  return updatedReq;
}

export interface ApproveRegulerResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function approveRegulerRequest(requestId: string): ApproveRegulerResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req) {
    return { ok: false, error: 'Permintaan tidak ditemukan.' };
  }

  // Idempotent: if already approved (belum_sampai or sampai), return existing result
  if (req.state === 'belum_sampai' || req.state === 'sampai') {
    return { ok: true, request: req };
  }

  if (req.state !== 'diajukan') {
    return { ok: false, error: 'Permintaan sudah tidak dalam status diajukan.', request: req };
  }

  const fulfilledLines = req.lines.filter((l) => l.fulfil === 'dipenuhi');
  if (fulfilledLines.length === 0) {
    return {
      ok: false,
      error: 'Tidak ada part yang dipenuhi. Pilih minimal satu part.',
      request: req,
    };
  }

  const now = formatNowTimestamp();
  const orderCode = generateOrderCode('reguler', state.purchaseRequests);

  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'belum_sampai',
    orderCode,
    orderedAt: now,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
  });

  return { ok: true, request: updatedReq };
}

export interface RejectRegulerResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function rejectRegulerRequest(
  requestIdOrObj: string | { requestId: string; reason: string },
  reasonArg?: string
): RejectRegulerResult {
  const requestId =
    typeof requestIdOrObj === 'string' ? requestIdOrObj : requestIdOrObj.requestId;
  const rawReason =
    typeof requestIdOrObj === 'string' ? reasonArg || '' : requestIdOrObj.reason;

  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req) {
    return { ok: false, error: 'Permintaan tidak ditemukan.' };
  }

  // Idempotent: if already rejected, return existing
  if (req.state === 'ditolak') {
    return { ok: true, request: req };
  }

  if (req.state !== 'diajukan') {
    return { ok: false, error: 'Permintaan sudah diproses.', request: req };
  }

  const trimmedReason = rawReason.trim();
  if (!trimmedReason) {
    return { ok: false, error: 'Alasan penolakan wajib diisi.' };
  }

  const now = formatNowTimestamp();
  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'ditolak',
    closeReason: trimmedReason,
    closedAt: now,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
  });

  return { ok: true, request: updatedReq };
}

let lastHoSubmissionSig = '';
let lastHoSubmissionId = '';

export interface CreateHoLineInput {
  partId: string;
  qty: number;
  hargaPerkiraan?: number;
}

export interface CreateHoRequestInput {
  requesterKind: PurchaseRequesterKind;
  customer?: PurchaseRequestCustomer;
  dp?: number;
  requestReason?: string;
  lines: CreateHoLineInput[];
  submissionId?: string;
}

export interface CreateHoRequestResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function createHoRequest(input: CreateHoRequestInput): CreateHoRequestResult {
  const state = getAdminStore();
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    return { ok: false, error: 'Tambahkan minimal 1 part.' };
  }
  if (input.lines.length > 20) {
    return { ok: false, error: 'Maksimal 20 baris part dalam satu permintaan.' };
  }

  const seenParts = new Set<string>();
  for (const line of input.lines) {
    const pid = line.partId.trim();
    if (!pid || !state.parts.some((p) => p.id === pid || p.kode === pid)) {
      return { ok: false, error: 'Pilih part yang terdaftar di Master Gudang.' };
    }
    if (seenParts.has(pid)) {
      return { ok: false, error: 'Part ini sudah ada di daftar.' };
    }
    seenParts.add(pid);
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      return { ok: false, error: 'Jumlah harus berupa angka bulat minimal 1.' };
    }
    if (
      input.requesterKind === 'pelanggan' &&
      (line.hargaPerkiraan === undefined || line.hargaPerkiraan <= 0)
    ) {
      return { ok: false, error: 'Harga per unit wajib diisi untuk permintaan pelanggan.' };
    }
  }

  const totalHarga = input.lines.reduce(
    (sum, l) => sum + l.qty * Math.round(l.hargaPerkiraan || 0),
    0
  );
  const dpAmount = input.requesterKind === 'pelanggan' ? Math.round(input.dp || 0) : 0;

  if (input.requesterKind === 'pelanggan') {
    if (dpAmount < 0) {
      return { ok: false, error: 'DP pembayaran minimal Rp 0.' };
    }
    if (dpAmount > totalHarga) {
      return { ok: false, error: 'DP tidak boleh lebih besar dari total harga.' };
    }
  }

  const sig =
    input.submissionId ||
    `ho|${input.requesterKind}|${input.customer?.nama || ''}|${dpAmount}|${input.lines
      .map((l) => `${l.partId}:${l.qty}:${l.hargaPerkiraan || 0}`)
      .join(',')}`;

  if (sig && sig === lastHoSubmissionSig && lastHoSubmissionId) {
    const existing = state.purchaseRequests.find((r) => r.id === lastHoSubmissionId);
    if (existing) {
      return { ok: true, request: existing };
    }
  }

  const newId = getNextPmtCode();
  const now = formatNowTimestamp();
  const orderCode = generateOrderCode('ho', state.purchaseRequests);

  const lines: PurchaseRequestLine[] = input.lines.map((l, idx) => ({
    id: `prl-${newId.toLowerCase()}-${idx + 1}`,
    partId: l.partId.trim(),
    qty: l.qty,
    hargaPerkiraan: l.hargaPerkiraan && l.hargaPerkiraan > 0 ? Math.round(l.hargaPerkiraan) : 0,
    fulfil: 'dipenuhi',
    lineState: 'belum',
  }));

  const cleanCustomer: PurchaseRequestCustomer | undefined =
    input.requesterKind === 'pelanggan' && input.customer
      ? {
          nama: input.customer.nama.trim(),
          alamat: input.customer.alamat.trim(),
          noMesin: input.customer.noMesin.trim().toUpperCase(),
          noRangka: input.customer.noRangka.trim().toUpperCase(),
          hp: input.customer.hp.trim(),
          email: input.customer.email.trim(),
        }
      : undefined;

  const newReq: PurchaseRequest = {
    id: newId,
    type: 'ho',
    requesterKind: input.requesterKind,
    requesterName:
      input.requesterKind === 'pelanggan' && cleanCustomer
        ? cleanCustomer.nama
        : 'Admin Gudang',
    customer: cleanCustomer,
    dp: dpAmount,
    createdAt: now,
    requestReason:
      input.requestReason?.trim() ||
      (input.requesterKind === 'pelanggan' ? 'Permintaan pelanggan' : 'Permintaan bengkel'),
    state: 'belum_sampai',
    orderCode,
    orderedAt: now,
    lines,
  };

  lastHoSubmissionSig = sig;
  lastHoSubmissionId = newId;

  saveStore({
    ...state,
    purchaseRequests: [newReq, ...state.purchaseRequests],
  });

  return { ok: true, request: newReq };
}

export interface ReceiveLineResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
  line?: PurchaseRequestLine;
}

export function receiveLine(requestId: string, lineId: string): ReceiveLineResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req) {
    return { ok: false, error: 'Permintaan tidak ditemukan.' };
  }

  const targetLine = req.lines.find((l) => l.id === lineId);
  if (!targetLine || targetLine.fulfil !== 'dipenuhi') {
    return { ok: false, error: 'Baris part tidak ditemukan pada pemesanan ini.' };
  }

  // Idempotent: if already received, change nothing and return existing
  if (targetLine.lineState === 'terima') {
    return { ok: true, request: req, line: targetLine };
  }

  if (targetLine.lineState === 'batal') {
    return { ok: false, error: 'Baris pesanan sudah dibatalkan.', request: req, line: targetLine };
  }

  const now = formatNowTimestamp();
  const receiptToken = `rcp-${req.id}-${targetLine.id}-${Date.now()}`;

  const updatedLines = req.lines.map((l) =>
    l.id === lineId
      ? {
          ...l,
          lineState: 'terima' as const,
          receivedAt: now,
          receiptToken,
        }
      : l
  );

  const fulfilledLines = updatedLines.filter((l) => l.fulfil === 'dipenuhi');
  const allFinished =
    fulfilledLines.length > 0 &&
    fulfilledLines.every((l) => l.lineState === 'terima' || l.lineState === 'batal');
  const anyReceived = fulfilledLines.some((l) => l.lineState === 'terima');

  const updatedReq: PurchaseRequest = {
    ...req,
    lines: updatedLines,
    state: allFinished ? (anyReceived ? 'sampai' : 'batal') : req.state,
    arrivedAt: allFinished && anyReceived ? now : req.arrivedAt,
  };

  const newMovement: StockMovement = {
    id: `mov-rcp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partId: targetLine.partId,
    partCode: targetLine.partId,
    date: now,
    type: 'masuk',
    quantity: targetLine.qty,
    reference: req.orderCode || req.id,
    reason: `Penerimaan pesanan ${req.orderCode || req.id}`,
    lineId: targetLine.id,
    receiptToken,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
    stockMovements: [...state.stockMovements, newMovement],
  });

  return {
    ok: true,
    request: updatedReq,
    line: updatedLines.find((l) => l.id === lineId),
  };
}

export interface ReceiveHoOrderResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function receiveHoOrder(requestId: string): ReceiveHoOrderResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req || req.type !== 'ho') {
    return { ok: false, error: 'Permintaan HO tidak ditemukan.' };
  }

  // Idempotent: if already arrived or finished, return existing
  if (req.state === 'sampai' || req.state === 'selesai') {
    return { ok: true, request: req };
  }

  if (req.state !== 'belum_sampai') {
    return { ok: false, error: 'Permintaan HO tidak dalam status belum sampai.', request: req };
  }

  const now = formatNowTimestamp();
  const hoReceiptToken = `horcp-${req.id}-${Date.now()}`;

  const updatedLines = req.lines.map((l) =>
    l.fulfil === 'dipenuhi'
      ? {
          ...l,
          lineState: 'terima' as const,
          receivedAt: now,
          receiptToken: `${hoReceiptToken}-${l.id}`,
        }
      : l
  );

  const newMovements: StockMovement[] = updatedLines
    .filter((l) => l.fulfil === 'dipenuhi' && l.qty > 0)
    .map((l, idx) => ({
      id: `mov-hoin-${Date.now()}-${idx + 1}`,
      partId: l.partId,
      partCode: l.partId,
      date: now,
      type: 'masuk' as const,
      quantity: l.qty,
      reference: req.orderCode || req.id,
      reason: `Kedatangan barang HO ${req.orderCode || req.id}`,
      lineId: l.id,
      receiptToken: l.receiptToken,
    }));

  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'sampai',
    arrivedAt: now,
    lines: updatedLines,
    hoReceiptToken,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
    stockMovements: [...state.stockMovements, ...newMovements],
  });

  return { ok: true, request: updatedReq };
}

export interface UndoReceiveResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function undoReceive(requestId: string, lineId?: string): UndoReceiveResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req) {
    return { ok: false, error: 'Permintaan tidak ditemukan.' };
  }

  const now = formatNowTimestamp();

  if (req.type === 'reguler') {
    const targetLine = lineId
      ? req.lines.find((l) => l.id === lineId)
      : [...req.lines].reverse().find((l) => l.lineState === 'terima');

    // Idempotent: if line is not in 'terima' state, change nothing and return existing
    if (!targetLine || targetLine.lineState !== 'terima') {
      return { ok: true, request: req };
    }

    const token = targetLine.receiptToken || `rcp-fallback-${req.id}-${targetLine.id}`;
    const alreadyReversed = state.stockMovements.some(
      (m) => m.type === 'koreksi' && m.receiptToken === token
    );

    const reversalMovements: StockMovement[] = alreadyReversed
      ? []
      : [
          {
            id: `mov-kor-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            partId: targetLine.partId,
            partCode: targetLine.partId,
            date: now,
            type: 'koreksi',
            quantity: -targetLine.qty,
            reference: req.orderCode || req.id,
            reason: `Koreksi batal terima ${req.orderCode || req.id}`,
            lineId: targetLine.id,
            receiptToken: token,
          },
        ];

    const updatedLines = req.lines.map((l) =>
      l.id === targetLine.id
        ? {
            ...l,
            lineState: 'belum' as const,
            receivedAt: undefined,
            receiptToken: undefined,
          }
        : l
    );

    const updatedReq: PurchaseRequest = {
      ...req,
      state: 'belum_sampai',
      arrivedAt: undefined,
      lines: updatedLines,
    };

    saveStore({
      ...state,
      purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
      stockMovements: [...state.stockMovements, ...reversalMovements],
    });

    return { ok: true, request: updatedReq };
  }

  // HO order undo
  if (req.state !== 'sampai') {
    return { ok: true, request: req };
  }

  const receivedLines = req.lines.filter(
    (l) => l.fulfil === 'dipenuhi' && l.lineState === 'terima'
  );

  const reversalMovements: StockMovement[] = [];
  receivedLines.forEach((l, idx) => {
    const token = l.receiptToken || `horcp-fallback-${req.id}-${l.id}`;
    const alreadyReversed = state.stockMovements.some(
      (m) => m.type === 'koreksi' && m.receiptToken === token
    );
    if (!alreadyReversed) {
      reversalMovements.push({
        id: `mov-hokor-${Date.now()}-${idx + 1}`,
        partId: l.partId,
        partCode: l.partId,
        date: now,
        type: 'koreksi',
        quantity: -l.qty,
        reference: req.orderCode || req.id,
        reason: `Koreksi batal approve HO ${req.orderCode || req.id}`,
        lineId: l.id,
        receiptToken: token,
      });
    }
  });

  const updatedLines = req.lines.map((l) =>
    l.fulfil === 'dipenuhi'
      ? {
          ...l,
          lineState: 'belum' as const,
          receivedAt: undefined,
          receiptToken: undefined,
        }
      : l
  );

  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'belum_sampai',
    arrivedAt: undefined,
    hoReceiptToken: undefined,
    lines: updatedLines,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
    stockMovements: [...state.stockMovements, ...reversalMovements],
  });

  return { ok: true, request: updatedReq };
}

export interface CancelRegulerLineResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
  line?: PurchaseRequestLine;
}

export function cancelRegulerLine(
  requestId: string,
  lineId: string,
  reason: string
): CancelRegulerLineResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req || req.type !== 'reguler') {
    return { ok: false, error: 'Permintaan reguler tidak ditemukan.' };
  }

  const targetLine = req.lines.find((l) => l.id === lineId);
  if (!targetLine || targetLine.fulfil !== 'dipenuhi') {
    return { ok: false, error: 'Baris part tidak ditemukan.' };
  }

  // Idempotent: if already cancelled, return existing
  if (targetLine.lineState === 'batal') {
    return { ok: true, request: req, line: targetLine };
  }

  if (targetLine.lineState === 'terima') {
    return { ok: false, error: 'Part yang sudah diterima tidak dapat dibatalkan.' };
  }

  const trimmedReason = reason.trim();
  if (!trimmedReason) {
    return { ok: false, error: 'Alasan pembatalan wajib diisi.' };
  }

  const now = formatNowTimestamp();
  const updatedLines = req.lines.map((l) =>
    l.id === lineId
      ? {
          ...l,
          lineState: 'batal' as const,
          cancelReason: trimmedReason,
        }
      : l
  );

  const fulfilledLines = updatedLines.filter((l) => l.fulfil === 'dipenuhi');
  const allFinished =
    fulfilledLines.length > 0 &&
    fulfilledLines.every((l) => l.lineState === 'terima' || l.lineState === 'batal');
  const anyReceived = fulfilledLines.some((l) => l.lineState === 'terima');

  let nextState = req.state;
  let nextArrivedAt = req.arrivedAt;
  let nextCloseReason = req.closeReason;
  let nextClosedAt = req.closedAt;

  if (allFinished) {
    if (anyReceived) {
      nextState = 'sampai';
      nextArrivedAt = now;
    } else {
      nextState = 'batal';
      nextCloseReason = trimmedReason;
      nextClosedAt = now;
    }
  }

  const updatedReq: PurchaseRequest = {
    ...req,
    state: nextState,
    arrivedAt: nextArrivedAt,
    closeReason: nextCloseReason,
    closedAt: nextClosedAt,
    lines: updatedLines,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
  });

  return {
    ok: true,
    request: updatedReq,
    line: updatedLines.find((l) => l.id === lineId),
  };
}

export interface CancelHoInput {
  requestId: string;
  reason: string;
  phoneCode?: string;
  emailCode?: string;
  expectedPhoneCode?: string;
  expectedEmailCode?: string;
  pin: string;
}

export interface CancelHoResult {
  ok: boolean;
  error?: string;
  field?: 'reason' | 'phoneCode' | 'emailCode' | 'pin';
  request?: PurchaseRequest;
}

export function cancelHo(input: CancelHoInput): CancelHoResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === input.requestId);
  if (!req || req.type !== 'ho') {
    return { ok: false, error: 'Permintaan HO tidak ditemukan.' };
  }

  // Idempotent: if already cancelled, return existing without reversing stock twice
  if (req.state === 'batal') {
    return { ok: true, request: req };
  }

  if (req.state === 'selesai') {
    return { ok: false, error: 'Permintaan HO sudah selesai diproses.', request: req };
  }

  const trimmedReason = input.reason.trim();
  if (trimmedReason.length < 5) {
    return {
      ok: false,
      error: 'Alasan pembatalan wajib diisi minimal 5 karakter.',
      field: 'reason',
    };
  }

  if (req.requesterKind === 'pelanggan') {
    if (
      input.expectedPhoneCode !== undefined &&
      (input.phoneCode || '').trim() !== input.expectedPhoneCode.trim()
    ) {
      return { ok: false, error: 'Kode HP salah.', field: 'phoneCode' };
    }
    if (
      input.expectedEmailCode !== undefined &&
      (input.emailCode || '').trim() !== input.expectedEmailCode.trim()
    ) {
      return { ok: false, error: 'Kode email salah.', field: 'emailCode' };
    }
  }

  // MOCK: verify on the server. Never check secrets in the browser.
  const cleanPin = (input.pin || '').trim();
  if (cleanPin !== DUMMY_ADMIN.pin && cleanPin !== DUMMY_ADMIN_LOGIN_PIN) {
    return { ok: false, error: 'PIN salah.', field: 'pin' };
  }

  const now = formatNowTimestamp();
  const reversalMovements: StockMovement[] = [];

  if (req.state === 'sampai') {
    const receivedLines = req.lines.filter(
      (l) => l.fulfil === 'dipenuhi' && l.lineState === 'terima'
    );
    receivedLines.forEach((l, idx) => {
      const token = l.receiptToken || `hocancel-${req.id}-${l.id}`;
      const alreadyReversed = state.stockMovements.some(
        (m) => m.type === 'koreksi' && m.receiptToken === token
      );
      if (!alreadyReversed) {
        reversalMovements.push({
          id: `mov-hocancel-${Date.now()}-${idx + 1}`,
          partId: l.partId,
          partCode: l.partId,
          date: now,
          type: 'koreksi',
          quantity: -l.qty,
          reference: req.orderCode || req.id,
          reason: `Koreksi pembatalan HO ${req.orderCode || req.id}: ${trimmedReason}`,
          lineId: l.id,
          receiptToken: token,
        });
      }
    });
  }

  const updatedLines = req.lines.map((l) => ({
    ...l,
    lineState: 'batal' as const,
    cancelReason: trimmedReason,
  }));

  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'batal',
    closeReason: trimmedReason,
    closedAt: now,
    lines: updatedLines,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
    stockMovements: [...state.stockMovements, ...reversalMovements],
  });

  return { ok: true, request: updatedReq };
}

export interface ProcessHoResult {
  ok: boolean;
  error?: string;
  request?: PurchaseRequest;
}

export function processHo(requestId: string): ProcessHoResult {
  const state = getAdminStore();
  const req = state.purchaseRequests.find((r) => r.id === requestId);
  if (!req || req.type !== 'ho') {
    return { ok: false, error: 'Permintaan HO tidak ditemukan.' };
  }

  // Idempotent: if already selesai, return existing without deducting stock twice
  if (req.state === 'selesai') {
    return { ok: true, request: req };
  }

  if (req.state !== 'sampai') {
    return {
      ok: false,
      error: 'Barang belum sampai. Approve di Pengelolaan Gudang, tab Akan Datang.',
      request: req,
    };
  }

  const now = formatNowTimestamp();
  const processToken = req.hoProcessToken || `hoproc-${req.id}`;
  const keluarMovements: StockMovement[] = [];

  // Customer HO creates one "keluar_ho" movement per line; Workshop HO creates none.
  if (req.requesterKind === 'pelanggan') {
    const fulfilledLines = req.lines.filter((l) => l.fulfil === 'dipenuhi' && l.qty > 0);
    fulfilledLines.forEach((l, idx) => {
      const lineToken = `${processToken}-${l.id}`;
      const alreadyOut = state.stockMovements.some(
        (m) => m.type === 'keluar_ho' && m.receiptToken === lineToken
      );
      if (!alreadyOut) {
        keluarMovements.push({
          id: `mov-hoout-${Date.now()}-${idx + 1}`,
          partId: l.partId,
          partCode: l.partId,
          date: now,
          type: 'keluar_ho',
          quantity: -l.qty,
          reference: req.orderCode || req.id,
          reason: `Penyerahan part HO pelanggan ${req.orderCode || req.id}`,
          lineId: l.id,
          receiptToken: lineToken,
        });
      }
    });
  }

  const updatedReq: PurchaseRequest = {
    ...req,
    state: 'selesai',
    processedAt: now,
    hoProcessToken: processToken,
  };

  saveStore({
    ...state,
    purchaseRequests: state.purchaseRequests.map((r) => (r.id === req.id ? updatedReq : r)),
    stockMovements: [...state.stockMovements, ...keluarMovements],
  });

  return { ok: true, request: updatedReq };
}

// -------------------------------------------------------------
// GD-3 MASTER GUDANG ATOMIC PART OPERATIONS
// -------------------------------------------------------------

let lastMasterPartSig = '';
let lastMasterPartCode = '';

export interface CreateMasterPartInput {
  nama: string;
  satuan: string;
  jenis: PartJenis;
  stokAwal: number;
  hargaBeli: number;
  hargaJual: number;
  stokMin?: number | null;
  catatan?: string;
  submissionId?: string;
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
    `newpart|${trimmedNama.toLowerCase()}|${input.satuan}|${input.jenis}|${input.stokAwal}`;

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
  const jenis: PartJenis = input.jenis === 'ho' ? 'ho' : 'reguler';
  const stokMin = jenis === 'ho' ? null : Math.max(0, Math.round(input.stokMin ?? 1));
  const hargaBeli = Math.max(0, Math.round(input.hargaBeli || 0));
  const hargaJual = Math.max(0, Math.round(input.hargaJual || 0));
  const stokAwal = Math.max(0, Math.round(input.stokAwal || 0));

  const newPart = makePartRecord({
    kode,
    nama: trimmedNama,
    satuan: input.satuan,
    jenis,
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

  const historyRow: PartHistory = {
    id: `ph-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    partId: kode,
    at: now,
    byNama: DUMMY_MASTER.nama,
    byId: DUMMY_MASTER.id,
    field: 'Part baru',
    oldValue: 'Tidak ada',
    newValue: `${kode} (${trimmedNama})`,
    note: input.catatan?.trim() || 'Part baru ditambahkan',
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

  return { ok: true, part: newPart };
}

export interface EditMasterPartInput {
  partId: string;
  nama: string;
  satuan: string;
  hargaBeli: number;
  hargaJual: number;
  stokMin: number | null;
  note: string;
  byNama?: string;
  byId?: string;
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
  const nextStokMin =
    part.jenis === 'ho' ? null : Math.max(0, Math.round(input.stokMin ?? part.stokMin ?? 1));

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
  if (part.jenis === 'reguler' && nextStokMin !== part.stokMin) {
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
  const byNama = input.byNama || DUMMY_ADMIN.nama;
  const byId = input.byId || DUMMY_ADMIN.id;

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
    partHistory: nextHistory,
    partChanges: nextHistory,
  });

  return {
    ok: true,
    part: updatedPart,
    newHistoryIds: newRows.map((r) => r.id),
  };
}

// -------------------------------------------------------------
// WH-0 STOCK OPNAME OPERATIONS (PLAIN FUNCTIONS OUTSIDE COMPONENTS)
// -------------------------------------------------------------

export function createStockOpnameRecord(params: {
  scope: StockOpnameScope;
  notes?: string;
  user: { id: string; nama: string };
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const res = libCreateStockOpname({
    scope: params.scope,
    notes: params.notes,
    user: params.user,
    parts: state.parts,
    movements: state.stockMovements,
    existingSessions: state.stockOpnames,
  });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: [res.session, ...state.stockOpnames],
  });
  return res;
}

export function saveStockOpnameLineCount(params: {
  sessionId: string;
  lineId: string;
  physicalQty: number;
  varianceReason?: string;
  user: { id: string; nama: string };
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  const res = libSaveStockOpnameCount({
    session,
    lineId: params.lineId,
    physicalQty: params.physicalQty,
    varianceReason: params.varianceReason,
    user: params.user,
    movements: state.stockMovements,
  });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
  });
  return res;
}

export function submitStockOpnameRecord(params: {
  sessionId: string;
  user: { id: string; nama: string };
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  const res = libSubmitStockOpname({ session, user: params.user });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
  });
  return res;
}

export function requestStockOpnameRecountRecord(params: {
  sessionId: string;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  const res = libRequestStockOpnameRecount({ session, user: params.user, reason: params.reason });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
  });
  return res;
}

export function rejectStockOpnameRecord(params: {
  sessionId: string;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  const res = libRejectStockOpname({ session, user: params.user, reason: params.reason });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
  });
  return res;
}

export function cancelStockOpnameRecord(params: {
  sessionId: string;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  const res = libCancelStockOpname({ session, user: params.user, reason: params.reason });
  if (!res.ok || !res.session) {
    return res;
  }
  saveStore({
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
  });
  return res;
}

export function approveStockOpnameRecord(params: {
  sessionId: string;
  user: { id: string; nama: string };
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const state = getAdminStore();
  const session = state.stockOpnames.find((s) => s.id === params.sessionId || s.code === params.sessionId);
  if (!session) {
    return { ok: false, error: 'Sesi stok opname tidak ditemukan.' };
  }
  let movSeq = 0;
  const res = libApproveStockOpname({
    session,
    user: params.user,
    currentMovements: state.stockMovements,
    getNextMovementId: () => {
      movSeq++;
      return getNextSequentialId('SM', 4, [...state.stockMovements.map((m) => m.id), `SM-${movSeq}`]);
    },
  });
  if (!res.ok || !res.session) {
    return res;
  }

  const nextBaseState = {
    ...state,
    stockOpnames: state.stockOpnames.map((s) => (s.id === session.id ? res.session! : s)),
    stockMovements: [...state.stockMovements, ...res.newMovements],
  };

  const { state: finalState } = appendAuditLog(nextBaseState, {
    actorId: params.user.id || 'MG-001',
    actorName: params.user.nama || 'Master Gudang Dummy',
    actorRole: 'master_gudang',
    event: 'stock_opname_approved',
    category: 'bisnis',
    module: 'stock_opname',
    action: `Persetujuan hasil stok opname ${res.session.code} & pembukuan koreksi`,
    entityType: 'StockOpnameSession',
    entityId: res.session.code,
    reference: res.newMovements?.[0]?.id,
    afterData: { status: 'disetujui', correctionsCount: res.newMovements.length },
    reason: 'Verifikasi fisik disahkan oleh Master Gudang.',
    outcome: 'berhasil',
  });

  saveStore(finalState);
  return res;
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
    `${normalizedPlate}|${input.customer.nama.trim()}|${input.customer.ktp.trim()}|${input.vehicle.rangka.trim()}|${input.vehicle.mesin.trim()}|${input.temuan.trim()}`;

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
      ktp: input.customer.ktp.trim(),
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
      ktp: '',
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
  getNextPmtCode: () => string;
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

  // GD-0 operations
  createRegulerRequest: typeof createRegulerRequest;
  setLineFulfil: typeof setLineFulfil;
  approveRegulerRequest: typeof approveRegulerRequest;
  rejectRegulerRequest: typeof rejectRegulerRequest;
  createHoRequest: typeof createHoRequest;
  receiveLine: typeof receiveLine;
  receiveHoOrder: typeof receiveHoOrder;
  undoReceive: typeof undoReceive;
  cancelRegulerLine: typeof cancelRegulerLine;
  cancelHo: typeof cancelHo;
  processHo: typeof processHo;
  createMasterPart: typeof createMasterPart;
  editMasterPart: typeof editMasterPart;

  // POS operations
  getAvailableSalePartStock: typeof getAvailableSalePartStock;
  validateSaleStock: typeof validateSaleStock;
  completeCashSale: typeof completeCashSale;
  createSaleCheckout: typeof createSaleCheckout;
  confirmSalePayment: typeof confirmSalePayment;
  cancelPendingSale: typeof cancelPendingSale;
  expirePendingSale: typeof expirePendingSale;
  printSalesReceipt: typeof printSalesReceipt;

  // WH-0 operations
  createStockOpnameRecord: typeof createStockOpnameRecord;
  saveStockOpnameLineCount: typeof saveStockOpnameLineCount;
  submitStockOpnameRecord: typeof submitStockOpnameRecord;
  requestStockOpnameRecountRecord: typeof requestStockOpnameRecountRecord;
  rejectStockOpnameRecord: typeof rejectStockOpnameRecord;
  cancelStockOpnameRecord: typeof cancelStockOpnameRecord;
  approveStockOpnameRecord: typeof approveStockOpnameRecord;

  // EXPORT-0 operations
  recordAuditEvent: typeof recordAuditEvent;
  recordReportExportEvent: typeof recordReportExportEvent;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const state = useSyncExternalStore(subscribeAdminStore, getAdminStore, getAdminStore);

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
        getNextPmtCode,
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
        createRegulerRequest,
        setLineFulfil,
        approveRegulerRequest,
        rejectRegulerRequest,
        createHoRequest,
        receiveLine,
        receiveHoOrder,
        undoReceive,
        cancelRegulerLine,
        cancelHo,
        processHo,
        createMasterPart,
        editMasterPart,
        getAvailableSalePartStock,
        validateSaleStock,
        completeCashSale,
        createSaleCheckout,
        confirmSalePayment,
        cancelPendingSale,
        expirePendingSale,
        printSalesReceipt,
        createStockOpnameRecord,
        saveStockOpnameLineCount,
        submitStockOpnameRecord,
        requestStockOpnameRecountRecord,
        rejectStockOpnameRecord,
        cancelStockOpnameRecord,
        approveStockOpnameRecord,
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
