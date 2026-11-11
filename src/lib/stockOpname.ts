import { Part, StockMovement, computeStock } from '../data/adminDummy';
import { todayISO as formatTodayDate } from './format';
import type { PrintStokOpnameData } from './printDocument';

export { formatTodayDate };

export type StockOpnameStatus =
  | 'berjalan'
  | 'menunggu_persetujuan'
  | 'perlu_hitung_ulang'
  | 'disetujui'
  | 'ditolak'
  | 'dibatalkan';

export type StockOpnameScope = 'semua' | 'reguler' | 'ho';

export interface StockOpnameLineCountHistory {
  physicalQty: number;
  varianceQty: number;
  countedAt: string;
  countedById: string;
  countedByName: string;
  varianceReason?: string;
}

export interface StockOpnameLine {
  id: string; // e.g. SOL-0001
  sessionId: string;
  partId: string;
  partCodeSnapshot: string;
  partNameSnapshot: string;
  unitSnapshot: string;
  partTypeSnapshot: 'reguler' | 'ho';
  systemQtyAtCount: number;
  physicalQty: number | null; // null if uncounted
  varianceQty: number | null; // physicalQty - systemQtyAtCount
  countedAt?: string;
  countedById?: string;
  countedByName?: string;
  varianceReason?: string;
  correctionMovementId?: string;
  previousCountHistory?: StockOpnameLineCountHistory[];
}

export interface StockOpnameSession {
  id: string; // e.g. SO-0001
  code: string; // e.g. SO-0001
  scope: StockOpnameScope;
  status: StockOpnameStatus;
  startedAt: string; // YYYY-MM-DD
  createdAt: string; // YYYY-MM-DD HH.mm
  createdById: string;
  createdByName: string;
  submittedAt?: string;
  submittedById?: string;
  submittedByName?: string;
  approvedAt?: string;
  approvedById?: string;
  approvedByName?: string;
  rejectedAt?: string;
  rejectedById?: string;
  rejectedByName?: string;
  rejectionReason?: string;
  recountRequestedAt?: string;
  recountRequestedById?: string;
  recountRequestedByName?: string;
  recountReason?: string;
  notes?: string;
  lines: StockOpnameLine[];
}

// -------------------------------------------------------------
// HELPER: Asia/Jakarta TIMESTAMP
// -------------------------------------------------------------
export const formatNowJakarta = (): string => {
  const d = new Date();
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat('id-ID', options).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}.${get('minute')}`;
};

// -------------------------------------------------------------
// GET STOCK BALANCE AT SPECIFIC TIMESTAMP FROM LEDGER
// -------------------------------------------------------------
export const getStockBalanceAt = (
  partIdOrCode: string,
  atTimestamp: string | undefined,
  movements: StockMovement[]
): number => {
  const relevant = movements.filter(
    (m) => m.partId === partIdOrCode || m.partCode === partIdOrCode
  );
  if (!atTimestamp) {
    return relevant.reduce((sum, m) => sum + m.quantity, 0);
  }
  return relevant
    .filter((m) => m.date <= atTimestamp)
    .reduce((sum, m) => sum + m.quantity, 0);
};

// -------------------------------------------------------------
// STATUS DISPLAY LABELS
// -------------------------------------------------------------
export const STOCK_OPNAME_STATUS_LABELS: Record<StockOpnameStatus, string> = {
  berjalan: 'Berjalan',
  menunggu_persetujuan: 'Menunggu Persetujuan',
  perlu_hitung_ulang: 'Perlu Hitung Ulang',
  disetujui: 'Disetujui',
  ditolak: 'Ditolak',
  dibatalkan: 'Dibatalkan',
};

// -------------------------------------------------------------
// CODE GENERATOR
// -------------------------------------------------------------
export const getNextOpnameCode = (existingSessions: StockOpnameSession[]): string => {
  let maxNum = 0;
  const regex = /^SO-(\d+)$/i;
  for (const s of existingSessions) {
    const m = regex.exec(s.code.trim());
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `SO-${String(maxNum + 1).padStart(4, '0')}`;
};

// Initial empty stock opname sessions (production ready)
export const initialStockOpnames: StockOpnameSession[] = [];

// -------------------------------------------------------------
// CENTRALIZED OPERATIONS (PLAIN FUNCTIONS OUTSIDE COMPONENTS)
// -------------------------------------------------------------

export function createStockOpname(params: {
  scope: StockOpnameScope;
  notes?: string;
  user: { id: string; nama: string };
  parts: Part[];
  movements: StockMovement[];
  existingSessions: StockOpnameSession[];
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { scope, notes, user, parts, movements, existingSessions } = params;

  // Filter parts based on scope
  const targetParts = parts.filter((p) => {
    if (scope === 'reguler') return p.jenis === 'reguler';
    if (scope === 'ho') return p.jenis === 'ho';
    return true; // 'semua'
  });

  if (targetParts.length === 0) {
    return { ok: false, error: 'Tidak ada part yang cocok dengan cakupan yang dipilih.' };
  }

  const code = getNextOpnameCode(existingSessions);
  const sessionId = code;
  const createdAt = formatNowJakarta();
  const startedAt = formatTodayDate();

  const lines: StockOpnameLine[] = targetParts.map((p, idx) => {
    const currentStock = computeStock(p, movements);
    return {
      id: `SOL-${code.replace('SO-', '')}-${String(idx + 1).padStart(3, '0')}`,
      sessionId,
      partId: p.kode,
      partCodeSnapshot: p.kode,
      partNameSnapshot: p.nama,
      unitSnapshot: p.satuan,
      partTypeSnapshot: p.jenis,
      systemQtyAtCount: currentStock,
      physicalQty: null,
      varianceQty: null,
      previousCountHistory: [],
    };
  });

  const session: StockOpnameSession = {
    id: sessionId,
    code,
    scope,
    status: 'berjalan',
    startedAt,
    createdAt,
    createdById: user.id,
    createdByName: user.nama,
    notes: (notes || '').trim(),
    lines,
  };

  return { ok: true, session };
}

export function saveStockOpnameCount(params: {
  session: StockOpnameSession;
  lineId: string;
  physicalQty: number;
  varianceReason?: string;
  user: { id: string; nama: string };
  movements: StockMovement[];
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { session, lineId, physicalQty, varianceReason, user, movements } = params;

  if (session.status !== 'berjalan' && session.status !== 'perlu_hitung_ulang') {
    return { ok: false, error: 'Sesi stok opname ini sudah tidak dapat diedit.' };
  }

  if (physicalQty < 0 || Number.isNaN(physicalQty)) {
    return { ok: false, error: 'Jumlah fisik tidak boleh negatif.' };
  }

  const lineIndex = session.lines.findIndex((l) => l.id === lineId);
  if (lineIndex < 0) {
    return { ok: false, error: 'Item part opname tidak ditemukan.' };
  }

  const oldLine = session.lines[lineIndex];
  const now = formatNowJakarta();

  // If this line already had a count, preserve previous count in history
  const previousHistory = [...(oldLine.previousCountHistory || [])];
  if (oldLine.physicalQty !== null && oldLine.countedAt) {
    previousHistory.push({
      physicalQty: oldLine.physicalQty,
      varianceQty: oldLine.varianceQty ?? 0,
      countedAt: oldLine.countedAt,
      countedById: oldLine.countedById || user.id,
      countedByName: oldLine.countedByName || user.nama,
      varianceReason: oldLine.varianceReason,
    });
  }

  // Calculate system stock at count time from ledger
  const systemQty = getStockBalanceAt(oldLine.partId, now, movements);
  const variance = physicalQty - systemQty;

  const updatedLine: StockOpnameLine = {
    ...oldLine,
    systemQtyAtCount: systemQty,
    physicalQty,
    varianceQty: variance,
    countedAt: now,
    countedById: user.id,
    countedByName: user.nama,
    varianceReason: variance !== 0 ? (varianceReason || '').trim() : undefined,
    previousCountHistory: previousHistory,
  };

  const updatedLines = [...session.lines];
  updatedLines[lineIndex] = updatedLine;

  const updatedSession: StockOpnameSession = {
    ...session,
    lines: updatedLines,
  };

  return { ok: true, session: updatedSession };
}

export function submitStockOpname(params: {
  session: StockOpnameSession;
  user: { id: string; nama: string };
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { session, user } = params;

  if (session.status !== 'berjalan' && session.status !== 'perlu_hitung_ulang') {
    return { ok: false, error: 'Sesi tidak dalam status berjalan atau perlu hitung ulang.' };
  }

  // Check if any part is uncounted
  const uncounted = session.lines.filter((l) => l.physicalQty === null);
  if (uncounted.length > 0) {
    return {
      ok: false,
      error: `Masih ada ${uncounted.length} part yang belum dihitung fisiknya.`,
    };
  }

  // Check if any line with variance has missing or too short reason (min 5 chars)
  const invalidVariance = session.lines.filter(
    (l) => l.varianceQty !== null && l.varianceQty !== 0 && (!l.varianceReason || l.varianceReason.trim().length < 5)
  );
  if (invalidVariance.length > 0) {
    return {
      ok: false,
      error: `${invalidVariance.length} part memiliki selisih namun belum diisi alasan selisih (minimal 5 karakter).`,
    };
  }

  const submittedSession: StockOpnameSession = {
    ...session,
    status: 'menunggu_persetujuan',
    submittedAt: formatNowJakarta(),
    submittedById: user.id,
    submittedByName: user.nama,
  };

  return { ok: true, session: submittedSession };
}

export function requestStockOpnameRecount(params: {
  session: StockOpnameSession;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { session, user, reason } = params;

  if (session.status !== 'menunggu_persetujuan') {
    return { ok: false, error: 'Hanya sesi yang menunggu persetujuan yang dapat diminta hitung ulang.' };
  }

  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, error: 'Alasan permintaan hitung ulang minimal 5 karakter.' };
  }

  const updatedSession: StockOpnameSession = {
    ...session,
    status: 'perlu_hitung_ulang',
    recountRequestedAt: formatNowJakarta(),
    recountRequestedById: user.id,
    recountRequestedByName: user.nama,
    recountReason: trimmed,
  };

  return { ok: true, session: updatedSession };
}

export function rejectStockOpname(params: {
  session: StockOpnameSession;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { session, user, reason } = params;

  if (session.status !== 'menunggu_persetujuan') {
    return { ok: false, error: 'Hanya sesi yang menunggu persetujuan yang dapat ditolak.' };
  }

  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, error: 'Alasan penolakan minimal 5 karakter.' };
  }

  const updatedSession: StockOpnameSession = {
    ...session,
    status: 'ditolak',
    rejectedAt: formatNowJakarta(),
    rejectedById: user.id,
    rejectedByName: user.nama,
    rejectionReason: trimmed,
  };

  return { ok: true, session: updatedSession };
}

export function cancelStockOpname(params: {
  session: StockOpnameSession;
  user: { id: string; nama: string };
  reason: string;
}): { ok: boolean; session?: StockOpnameSession; error?: string } {
  const { session, user, reason } = params;

  if (session.status === 'disetujui') {
    return { ok: false, error: 'Sesi yang sudah disetujui tidak dapat dibatalkan.' };
  }

  const updatedSession: StockOpnameSession = {
    ...session,
    status: 'dibatalkan',
    rejectionReason: (reason || 'Dibatalkan oleh petugas').trim(),
    rejectedAt: formatNowJakarta(),
    rejectedById: user.id,
    rejectedByName: user.nama,
  };

  return { ok: true, session: updatedSession };
}

export function approveStockOpname(params: {
  session: StockOpnameSession;
  user: { id: string; nama: string };
  currentMovements: StockMovement[];
  getNextMovementId: () => string;
}): {
  ok: boolean;
  session?: StockOpnameSession;
  newMovements: StockMovement[];
  error?: string;
} {
  const { session, user, currentMovements, getNextMovementId } = params;

  if (session.status !== 'menunggu_persetujuan') {
    return { ok: false, newMovements: [], error: 'Hanya sesi yang menunggu persetujuan yang dapat disetujui.' };
  }

  // Idempotency check: check if any movement already references this session
  const alreadyCorrected = currentMovements.some(
    (m) => m.reference === session.code && m.type === 'koreksi'
  );
  if (alreadyCorrected) {
    return { ok: false, newMovements: [], error: 'Sesi ini sudah pernah disetujui dan dikoreksi sebelumnya.' };
  }

  const approvedAt = formatNowJakarta();
  const newMovements: StockMovement[] = [];

  const updatedLines = session.lines.map((line) => {
    const variance = line.varianceQty ?? 0;
    if (variance === 0) {
      return line;
    }

    const movId = getNextMovementId();
    const movement: StockMovement = {
      id: movId,
      partId: line.partId,
      partCode: line.partCodeSnapshot,
      date: approvedAt,
      type: 'koreksi',
      quantity: variance, // positive adds stock, negative reduces stock
      reference: session.code,
      reason: `Stok opname ${session.code}: ${line.varianceReason || 'Penyesuaian stok fisik'}`,
      lineId: line.id,
    };
    newMovements.push(movement);

    return {
      ...line,
      correctionMovementId: movId,
    };
  });

  const approvedSession: StockOpnameSession = {
    ...session,
    status: 'disetujui',
    approvedAt,
    approvedById: user.id,
    approvedByName: user.nama,
    lines: updatedLines,
  };

  return {
    ok: true,
    session: approvedSession,
    newMovements,
  };
}

// -------------------------------------------------------------
// BUILD PRINT DATA FOR STOK OPNAME
// -------------------------------------------------------------
export function buildPrintStokOpnameData(session: StockOpnameSession): PrintStokOpnameData {
  const countedLines = session.lines.filter((l) => l.physicalQty !== null);
  const matchingLines = countedLines.filter((l) => (l.varianceQty ?? 0) === 0);
  const surplusLines = countedLines.filter((l) => (l.varianceQty ?? 0) > 0);
  const deficitLines = countedLines.filter((l) => (l.varianceQty ?? 0) < 0);
  const correctedLines = countedLines.filter((l) => Boolean(l.correctionMovementId));

  const printLines = session.lines.map((l) => {
    const variance = l.varianceQty ?? 0;
    const action =
      variance > 0
        ? `Koreksi +${variance} ${l.unitSnapshot}`
        : variance < 0
        ? `Koreksi ${variance} ${l.unitSnapshot}`
        : 'Sesuai (Tanpa koreksi)';

    return {
      kodePart: l.partCodeSnapshot,
      namaPart: l.partNameSnapshot,
      satuan: l.unitSnapshot,
      jenis: l.partTypeSnapshot.toUpperCase(),
      stokSistem: l.systemQtyAtCount,
      stokFisik: l.physicalQty ?? 0,
      selisih: variance,
      alasanSelisih: l.varianceReason || '-',
      tindakanKoreksi: action,
    };
  });

  return {
    kodeOpname: session.code,
    tanggalWaktu: session.createdAt,
    cakupan: session.scope === 'semua' ? 'Semua Part' : session.scope === 'reguler' ? 'Reguler' : 'HO',
    namaPetugas: session.createdByName,
    namaMasterGudang: session.approvedByName || 'Master Gudang Dummy',
    tanggalPersetujuan: session.approvedAt || session.createdAt,
    totalPartDihitung: countedLines.length,
    totalPartSesuai: matchingLines.length,
    totalPartLebih: surplusLines.length,
    totalPartKurang: deficitLines.length,
    jumlahBarisDikoreksi: correctedLines.length || surplusLines.length + deficitLines.length,
    lines: printLines,
    waktuCetak: formatNowJakarta(),
  };
}

