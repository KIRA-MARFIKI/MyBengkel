// DUMMY DATA. Prototype only.

export const ARRIVAL_TARGET = 'disetujui'; // alternative: menunggu_persetujuan

export interface Mechanic {
  id: string; // MKN-001
  nama: string;
  name: string; // alias for compatibility
  hp: string;
  alamat: string;
  active: boolean;
  deleteReason?: string;
  deletedAt?: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  plate?: string;
  engineNo?: string;
  frameNo?: string;
}

export interface Vehicle {
  plate: string;
  brand: 'Honda' | 'Yamaha' | 'Suzuki' | 'Lainnya';
  model: string;
  lastKm: number;
  customerId: string;
  engineNo: string;
  frameNo: string;
}

export type StockMovementType =
  | 'masuk'
  | 'keluar_ho'
  | 'koreksi'
  | 'keluar_wo'
  | 'kembali_batal'
  | 'keluar_penjualan'
  | 'penyesuaian';

export interface StockMovement {
  id: string;
  partId: string;
  partCode: string; // alias for compatibility with V1/Penjualan
  date: string;
  type: StockMovementType;
  quantity: number; // positive for addition, negative for reduction
  reference: string;
  reason: string;
  lineId?: string;
  receiptToken?: string;
}

export type PartJenis = 'reguler' | 'ho';
export type PartType = 'Reguler' | 'HO';

// GD-0: Part: id, kode (PRT-001), nama, satuan, jenis "reguler" | "ho",
// hargaBeli, hargaJual, stokMin (null for HO), createdAt.
// Stock is computed from movements and never stored.
export interface Part {
  id: string; // PRT-001
  kode: string; // PRT-001
  nama: string;
  satuan: string;
  jenis: PartJenis;
  hargaBeli: number;
  hargaJual: number;
  stokMin: number | null; // null for HO
  createdAt: string;

  // Compatibility aliases for Servis / Penjualan / Laporan
  code: string;
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
  minStock: number;
  partType: PartType;
}

// GD-0: PartHistory rows: partId, at, byNama, byId, field, oldValue, newValue, note.
export interface PartHistory {
  id: string;
  partId: string;
  at: string; // "YYYY-MM-DD HH.mm"
  byNama: string;
  byId: string;
  field: string;
  oldValue: string;
  newValue: string;
  note: string;
}

export type PartChangeRecord = PartHistory;

export type PurchaseRequestType = 'reguler' | 'ho';
export type PurchaseRequesterKind = 'bengkel' | 'pelanggan';
export type PurchaseRequestState =
  | 'diajukan'
  | 'belum_sampai'
  | 'sampai'
  | 'selesai'
  | 'ditolak'
  | 'batal';

export type LineFulfilState = 'dipenuhi' | 'tidak';
export type PurchaseLineState = 'belum' | 'terima' | 'batal';

export interface PurchaseRequestCustomer {
  nama: string;
  alamat: string;
  noMesin: string;
  noRangka: string;
  hp: string;
  email: string;
}

export interface PurchaseRequestLine {
  id: string;
  partId: string; // PRT-001
  qty: number;
  hargaPerkiraan: number;
  fulfil: LineFulfilState;
  lineState: PurchaseLineState;
  receivedAt?: string;
  cancelReason?: string;
  receiptToken?: string;
}

export interface PurchaseRequest {
  id: string; // PMT-0001
  type: PurchaseRequestType;
  requesterKind: PurchaseRequesterKind;
  requesterName: string; // "Admin Gudang" or the customer name
  customer?: PurchaseRequestCustomer; // pelanggan only
  dp: number;
  createdAt: string;
  requestReason: string;
  state: PurchaseRequestState;
  orderCode?: string;
  orderedAt?: string;
  arrivedAt?: string;
  processedAt?: string;
  closeReason?: string;
  closedAt?: string;
  lines: PurchaseRequestLine[];
  hoReceiptToken?: string;
  hoProcessToken?: string;
}

export type BookingStatus = 'menunggu' | 'datang' | 'batal';
export type BookingSource = 'online' | 'langsung';

export interface BookingEvent {
  time: string;
  who: string;
  what: string;
  reason?: string;
}

export interface Booking {
  id: string; // BK-0001
  customerName: string;
  plate: string;
  engineNo: string;
  frameNo: string;
  service: string;
  date: string; // YYYY-MM-DD
  hour: string; // HH.mm
  complaint: string;
  status: BookingStatus;
  source: BookingSource;
  serviceFormId?: string;
  cancelReason?: string;
  cancelledAt?: string;
  history?: BookingEvent[];
}

export type ServiceFormStatus = 'menunggu_persetujuan' | 'disetujui' | 'batal';
export type ServiceFormOrigin = 'draft' | 'booking';

export interface ServiceFormLine {
  id: string;
  type: 'Jasa' | 'Part';
  partCode?: string;
  name: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface ServiceFormCustomer {
  nama: string;
  jenisKonsumen: 'Pemilik' | 'Pemakai' | '';
  hp: string;
  ktp: string;
  alamat: string;
}

export interface ServiceFormVehicle {
  rangka: string;
  mesin: string;
  plat: string;
  tipeMotor: string;
  tipeManual: string;
  warna: string;
}

export interface ServiceForm {
  id: string; // SF-0001
  origin: ServiceFormOrigin;
  bookingId?: string;
  customer: ServiceFormCustomer;
  vehicle: ServiceFormVehicle;
  temuan: string;
  jasaLines: ServiceFormLine[];
  partLines: ServiceFormLine[];
  status: ServiceFormStatus;
  createdAt: string; // Tanggal masuk (YYYY-MM-DD)
  cancelReason?: string;
  cancelledAt?: string;
  workOrderId?: string;
}

export interface WorkOrderHistory {
  time: string;
  action: string;
  reason?: string;
  performedBy?: string;
}

export type WorkOrderEndState = null | 'selesai' | 'batal';

export interface WorkOrder {
  id: string; // WO-0001
  serviceFormId: string;
  mechanicId?: string;
  lines: ServiceFormLine[];
  endState: WorkOrderEndState;
  endedAt?: string;
  updatedAt: string;
  history: WorkOrderHistory[];
  saleId?: string;
}

export type SalePaymentMethod = 'Tunai' | 'Transfer' | 'QR';
export type SalePaymentStatus = 'menunggu_pembayaran' | 'dibayar' | 'dibatalkan' | 'kedaluwarsa';

export interface SaleLine {
  partId?: string;
  partCode: string;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

export interface Sale {
  id: string;
  number: string;
  date: string;
  createdAt?: string;
  origin: string;
  customerName: string;
  lines: SaleLine[];
  subtotal?: number;
  total: number;
  method: SalePaymentMethod;
  paymentStatus: SalePaymentStatus;
  paymentReference?: string;
  cashReceived?: number;
  change?: number;
  cashierName?: string;
  paidAt?: string;
  cancelledAt?: string;
  workOrderId?: string;
}

export interface MechanicAttendance {
  id: string;
  mechanicId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  workHoursMinutes?: number;
  relatedWorkOrders: string[];
  notes?: string;
}

export type TicketPriority = 'Rendah' | 'Sedang' | 'Tinggi';
export type TicketStatus = 'Terbuka' | 'Diproses' | 'Selesai';

export interface TicketMessage {
  id: string;
  sender: string;
  time: string;
  text: string;
}

export interface HelpDeskTicket {
  id: string;
  title: string;
  category: 'Akun' | 'Bug' | 'Perangkat' | 'Lainnya';
  priority: TicketPriority;
  status: TicketStatus;
  reportedBy: string;
  createdAt: string;
  thread: TicketMessage[];
}

export interface ManualEntry {
  id: string;
  date: string;
  category: 'Pengeluaran operasional' | 'Pemasukan lain';
  amount: number;
  notes: string;
  recordedBy: string;
  isCorrected?: boolean;
  correctionReason?: string;
  originalValues?: {
    category: 'Pengeluaran operasional' | 'Pemasukan lain';
    amount: number;
    notes: string;
  };
}

// -------------------------------------------------------------
// DUMMY DATA SEEDING & HELPERS
// -------------------------------------------------------------

const today = new Date();
const formatDate = (d: Date) => {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const todayStr = formatDate(today);

const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);
export const tomorrowStr = formatDate(tomorrow);

const dayAfter = new Date(today);
dayAfter.setDate(dayAfter.getDate() + 2);
export const dayAfterStr = formatDate(dayAfter);

export const daysAgo = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return formatDate(d);
};

export const dateToSlash = (isoDate: string): string =>
  isoDate.slice(0, 10).replace(/-/g, '/');

export function makePartRecord(input: {
  kode: string;
  nama: string;
  satuan: string;
  jenis: PartJenis;
  hargaBeli: number;
  hargaJual: number;
  stokMin: number | null;
  createdAt: string;
}): Part {
  const jenis = input.jenis === 'ho' ? 'ho' : 'reguler';
  const stokMin = jenis === 'ho' ? null : input.stokMin ?? 1;
  return {
    id: input.kode,
    kode: input.kode,
    nama: input.nama,
    satuan: input.satuan,
    jenis,
    hargaBeli: input.hargaBeli,
    hargaJual: input.hargaJual,
    stokMin,
    createdAt: input.createdAt,
    // Compatibility properties
    code: input.kode,
    name: input.nama,
    unit: input.satuan,
    buyPrice: input.hargaBeli,
    sellPrice: input.hargaJual,
    minStock: stokMin ?? 0,
    partType: jenis === 'ho' ? 'HO' : 'Reguler',
  };
}

// Stock is computed strictly from movements and never stored on Part.
export const computeStock = (
  partOrCode: Pick<Part, 'id' | 'kode' | 'code'> | string,
  movements: StockMovement[]
): number => {
  const kode =
    typeof partOrCode === 'string'
      ? partOrCode
      : partOrCode.kode || partOrCode.id || partOrCode.code;
  return movements
    .filter((m) => m.partId === kode || m.partCode === kode)
    .reduce((acc, m) => acc + m.quantity, 0);
};

// Sellable available stock accounts for active pending checkouts:
export const computeAvailableSaleStock = (
  partOrCode: Pick<Part, 'id' | 'kode' | 'code'> | string,
  movements: StockMovement[],
  sales: Sale[]
): number => {
  const physical = computeStock(partOrCode, movements);
  const kode =
    typeof partOrCode === 'string'
      ? partOrCode
      : partOrCode.kode || partOrCode.id || partOrCode.code;

  const reserved = sales
    .filter((s) => s.paymentStatus === 'menunggu_pembayaran')
    .reduce((sum, s) => {
      const line = s.lines.find((l) => (l.partCode || l.partId) === kode);
      return sum + (line ? line.qty : 0);
    }, 0);

  return Math.max(0, physical - reserved);
};

// Computed PurchaseRequest helpers (never stored)
export const computeRequestTotalHarga = (pr: PurchaseRequest): number => {
  const activeLines = pr.lines.filter((l) => l.fulfil === 'dipenuhi');
  const source = activeLines.length > 0 ? activeLines : pr.lines;
  return source.reduce((sum, l) => sum + l.qty * (l.hargaPerkiraan || 0), 0);
};

export const computeRequestSisaBayar = (pr: PurchaseRequest): number => {
  return computeRequestTotalHarga(pr) - (pr.dp || 0);
};

export const computeRequestFulfilledQty = (pr: PurchaseRequest): number => {
  return pr.lines
    .filter((l) => l.fulfil === 'dipenuhi')
    .reduce((sum, l) => sum + l.qty, 0);
};

export const getRequestStatusLabel = (
  stateOrReq: PurchaseRequestState | Pick<PurchaseRequest, 'state'>
): 'Belum sampai' | 'Sampai' | 'Selesai' | 'Ditolak' | 'Batal' => {
  const state = typeof stateOrReq === 'string' ? stateOrReq : stateOrReq.state;
  if (state === 'diajukan' || state === 'belum_sampai') return 'Belum sampai';
  if (state === 'sampai') return 'Sampai';
  if (state === 'selesai') return 'Selesai';
  if (state === 'ditolak') return 'Ditolak';
  return 'Batal';
};

export const getLineStatusLabel = (
  stateOrLine: PurchaseLineState | Pick<PurchaseRequestLine, 'lineState'>
): 'Terima' | 'Belum diterima' | 'Dibatalkan' => {
  const lineState = typeof stateOrLine === 'string' ? stateOrLine : stateOrLine.lineState;
  if (lineState === 'terima') return 'Terima';
  if (lineState === 'batal') return 'Dibatalkan';
  return 'Belum diterima';
};

// Initial data arrays (empty - ready for backend / Supabase data layer)
export const initialMechanics: Mechanic[] = [];
export const initialCustomers: Customer[] = [];
export const initialVehicles: Vehicle[] = [];
export const initialParts: Part[] = [];
export const initialPurchaseRequests: PurchaseRequest[] = [];
export const initialStockMovements: StockMovement[] = [];
export const initialBookings: Booking[] = [];
export const initialServiceForms: ServiceForm[] = [];
export const initialWorkOrders: WorkOrder[] = [];
export const initialSales: Sale[] = [];
export const initialAttendance: MechanicAttendance[] = [];
export const initialHelpDeskTickets: HelpDeskTicket[] = [];
export const initialManualEntries: ManualEntry[] = [];
export const initialPartHistory: PartHistory[] = [];
export const initialPartChanges: PartChangeRecord[] = initialPartHistory;
