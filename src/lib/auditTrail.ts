// Centralized Admin Activity Audit Trail & Export Authorization System
import {
  DUMMY_ADMIN,
  DUMMY_ADMIN_PIN,
  DUMMY_ADMIN_LOGIN_PIN,
  DUMMY_MASTER,
  DUMMY_ADMIN_GUDANG,
} from './mockCredentials';
import { formatNowJakarta } from './stockOpname';

export type AuditCategory = 'bisnis' | 'akses';

export type AuditModule =
  | 'auth'
  | 'booking'
  | 'service_form'
  | 'work_order'
  | 'absen_mekanik'
  | 'gudang'
  | 'pos'
  | 'wo_part'
  | 'stock_opname'
  | 'persetujuan'
  | 'input_manual'
  | 'helpdesk'
  | 'laporan';

export type AuditOutcome = 'berhasil' | 'gagal';

export type AuditActorRole =
  | 'admin'
  | 'master_gudang'
  | 'master_admin'
  | 'master_helpdesk'
  | 'admin_gudang'
  | 'mekanik'
  | 'sistem'
  | 'kustomer';

export interface AuditLog {
  id: string; // e.g. AUD-0001
  actorId: string; // e.g. ADM-001, MG-001, ADMG-001
  actorName: string;
  actorRole: AuditActorRole;
  event: string; // short code, e.g. 'wo_completed', 'stock_opname_approved'
  category: AuditCategory;
  module: AuditModule;
  action: string; // Readable Indonesian action description
  entityType: string; // e.g. 'WorkOrder', 'Booking', 'StockOpname', 'Sale', 'Part'
  entityId: string; // e.g. WO-0001, BKG-0001, SO-0001, TRX-0001
  beforeData?: Record<string, any> | string;
  afterData?: Record<string, any> | string;
  reason?: string;
  reference?: string; // related transaction code, movement ID, etc.
  occurredAt: string; // YYYY-MM-DD HH.mm.ss or YYYY-MM-DD HH.mm
  outcome: AuditOutcome;
  metadata?: Record<string, any>;
  requestId?: string;
}

// Indonesian Readable Display Labels
export const AUDIT_MODULE_LABELS: Record<AuditModule, string> = {
  auth: 'Login & Logout',
  booking: 'Booking Servis',
  service_form: 'Service Form',
  work_order: 'Work Order',
  absen_mekanik: 'Absen Mekanik',
  gudang: 'Gudang & Part',
  pos: 'Penjualan Kasir POS',
  wo_part: 'Penjualan Part WO',
  stock_opname: 'Stok Opname',
  persetujuan: 'Persetujuan & Otorisasi',
  input_manual: 'Input Manual',
  helpdesk: 'Help Desk',
  laporan: 'Pelaporan & Ekspor',
};

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  bisnis: 'Log Audit Bisnis',
  akses: 'Riwayat Akses & Tinjauan',
};

// -------------------------------------------------------------
// VERIFY EXPORT PIN
// -------------------------------------------------------------
export interface ExportAuthResult {
  ok: boolean;
  role?: 'admin' | 'master_admin';
  actor?: {
    id: string;
    nama: string;
    role: AuditActorRole;
  };
  error?: string;
}

export function verifyExportPin(pin: string): ExportAuthResult {
  const clean = pin.trim();

  if (!clean) {
    return { ok: false, error: 'PIN wajib diisi.' };
  }

  // 1. Check Master Gudang / Master Admin PIN: 12345
  if (clean === DUMMY_MASTER.pin) {
    return {
      ok: true,
      role: 'master_admin',
      actor: {
        id: DUMMY_MASTER.id, // MG-001
        nama: DUMMY_MASTER.nama, // Master Gudang Dummy
        role: 'master_admin',
      },
    };
  }

  // 2. Check Admin PIN: 123456 or 123456789012
  if (clean === DUMMY_ADMIN_PIN || clean === DUMMY_ADMIN_LOGIN_PIN || clean === DUMMY_ADMIN.pin) {
    return {
      ok: true,
      role: 'admin',
      actor: {
        id: DUMMY_ADMIN.id, // ADM-001
        nama: DUMMY_ADMIN.nama, // Admin Dummy
        role: 'admin',
      },
    };
  }

  // Admin Gudang (ADMG-001) cannot export all reports or audit trail.
  // Any mismatch yields generic security message:
  return {
    ok: false,
    error: 'PIN tidak sesuai atau akses tidak diizinkan.',
  };
}

// -------------------------------------------------------------
// AUDIT LOG CODE GENERATOR
// -------------------------------------------------------------
export function getNextAuditCode(existingLogs: AuditLog[]): string {
  let maxNum = 0;
  const regex = /^AUD-(\d+)$/i;
  for (const log of existingLogs) {
    const m = regex.exec(log.id.trim());
    if (m) {
      const n = Number(m[1]);
      if (n > maxNum) maxNum = n;
    }
  }
  return `AUD-${String(maxNum + 1).padStart(4, '0')}`;
}

// -------------------------------------------------------------
export const initialAuditLogs: AuditLog[] = [];
