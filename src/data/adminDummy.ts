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
  customerEmail?: string;
  vehicleModel?: string;
  createdAt?: string;
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

export type TicketPriority =
  | 'rendah'
  | 'normal'
  | 'tinggi'
  | 'kritis'
  | 'Rendah'
  | 'Sedang'
  | 'Tinggi';

export type TicketStatus =
  | 'baru'
  | 'ditinjau'
  | 'dalam_penanganan'
  | 'menunggu_pelapor'
  | 'menunggu_persetujuan'
  | 'dieskalasi'
  | 'selesai'
  | 'ditutup'
  | 'dibuka_kembali'
  | 'Terbuka'
  | 'Diproses'
  | 'Selesai';

export type TicketCategory =
  | 'Bug / Kendala Aplikasi'
  | 'Data Tidak Muncul'
  | 'Data Tidak Sesuai / Inkonsisten'
  | 'Akses & Login'
  | 'Booking Servis'
  | 'Servis & SPK'
  | 'Gudang & Stok'
  | 'Penjualan & Pembayaran'
  | 'Laporan & Ekspor'
  | 'Sinkronisasi & Koneksi'
  | 'Panduan Penggunaan'
  | 'Akun'
  | 'Bug'
  | 'Perangkat'
  | 'Lainnya';

export interface TicketMessage {
  id: string;
  sender: string;
  time: string;
  text: string;
}

export interface HelpDeskTicket {
  id: string;
  title: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  reportedBy: string;
  reporterRole?: string;
  affectedModule?: string;
  description?: string;
  stepsToReproduce?: string;
  expectedResult?: string;
  actualResult?: string;
  relatedRecordId?: string;
  attachmentsNotes?: string;
  assignedStaff?: string;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt?: string;
  thread: TicketMessage[];
}

export type CorrectionRiskLevel = 'rendah' | 'tinggi';
export type CorrectionStatus = 'menunggu_persetujuan' | 'disetujui' | 'ditolak';

export interface CorrectionRequest {
  id: string; // COR-001
  ticketId?: string;
  entityType:
    | 'Sale'
    | 'WorkOrder'
    | 'Booking'
    | 'StockMovement'
    | 'ManualEntry'
    | 'Customer'
    | 'Part';
  entityId: string;
  fieldName: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  evidenceReference?: string;
  riskLevel: CorrectionRiskLevel;
  requestedBy: string;
  requestedAt: string;
  status: CorrectionStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export interface KnowledgeBaseArticle {
  id: string; // KB-001
  title: string;
  category: TicketCategory;
  relatedModule: string;
  symptoms: string;
  possibleCauses: string[];
  diagnosticSteps: string[];
  resolutionSteps: string[];
  author: string;
  updatedAt: string;
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
export const initialHelpDeskTickets: HelpDeskTicket[] = [
  {
    id: 'TKT-001',
    title: 'Work Order WO-0002 status penyelesaian tertahan',
    category: 'Servis & SPK',
    priority: 'tinggi',
    status: 'dalam_penanganan',
    reportedBy: 'Budi Santoso',
    reporterRole: 'Admin Counter',
    affectedModule: 'work_order',
    description: 'Saat mekanik menyelesaikan servis berkala, tombol penyelesaian SPK tidak merespons dan sistem tidak membuat tagihan kasir.',
    stepsToReproduce: '1. Buka menu Servis > Work Order\n2. Buka WO-0002\n3. Klik tombol Selesaikan SPK',
    expectedResult: 'SPK berstatus selesai dan rincian biaya dialihkan ke penjualan kasir.',
    actualResult: 'Muncul peringatan bahwa mekanik utama belum ditugaskan.',
    relatedRecordId: 'WO-0002',
    assignedStaff: 'Master Helpdesk',
    createdAt: '2026-11-13 07.30',
    thread: [
      {
        id: 'msg-1',
        sender: 'Budi Santoso',
        time: '2026-11-13 07.30',
        text: 'Tolong bantu cek SPK WO-0002 tidak bisa ditutup dari tadi pagi.',
      },
      {
        id: 'msg-2',
        sender: 'Master Helpdesk',
        time: '2026-11-13 07.45',
        text: 'Sedang kami periksa keterkaitan data mekanik pada SPK terkait.',
      },
    ],
  },
  {
    id: 'TKT-002',
    title: 'Booking online BK-0003 belum masuk antrean counter',
    category: 'Data Tidak Muncul',
    priority: 'normal',
    status: 'baru',
    reportedBy: 'Siti Rahma',
    reporterRole: 'Pelanggan',
    affectedModule: 'booking',
    description: 'Pelanggan sudah booking online untuk servis ganti oli besok pagi, namun saat menelepon bengkel datanya dikatakan belum tercatat.',
    expectedResult: 'Booking BK-0003 terdaftar di daftar antrean servis tanggal terkait.',
    actualResult: 'Admin counter belum melihat karena filter tanggal masih terkunci hari ini.',
    relatedRecordId: 'BK-0003',
    createdAt: '2026-11-13 08.00',
    thread: [
      {
        id: 'msg-3',
        sender: 'Siti Rahma',
        time: '2026-11-13 08.00',
        text: 'Mohon konfirmasi booking saya BK-0003 untuk motor Vario besok.',
      },
    ],
  },
  {
    id: 'TKT-003',
    title: 'Perbedaan fisik oli mesin pada kartu stok PRT-001',
    category: 'Gudang & Stok',
    priority: 'kritis',
    status: 'menunggu_persetujuan',
    reportedBy: 'Agus Gudang',
    reporterRole: 'Admin Gudang',
    affectedModule: 'gudang',
    description: 'Terdapat selisih 1 botol oli pada rak fisik gudang setelah retur batal servis kemarin.',
    relatedRecordId: 'PRT-001',
    assignedStaff: 'Master Helpdesk',
    createdAt: '2026-11-13 08.05',
    thread: [
      {
        id: 'msg-4',
        sender: 'Agus Gudang',
        time: '2026-11-13 08.05',
        text: 'Mohon koreksi stok oli PRT-001 ada pengembalian part batal servis.',
      },
    ],
  },
  {
    id: 'TKT-004',
    title: 'Status pembayaran transfer penjualan kasir PJ-0001',
    category: 'Penjualan & Pembayaran',
    priority: 'tinggi',
    status: 'ditinjau',
    reportedBy: 'Kasir Utama',
    reporterRole: 'Kasir',
    affectedModule: 'pos',
    description: 'Pelanggan mengirim bukti transfer manual setelah barcode QRIS kedaluwarsa.',
    relatedRecordId: 'PJ-0001',
    assignedStaff: 'Master Helpdesk',
    createdAt: '2026-11-13 08.10',
    thread: [
      {
        id: 'msg-5',
        sender: 'Kasir Utama',
        time: '2026-11-13 08.10',
        text: 'Bukti transfer BCA sudah ada di whatsapp kasir, mohon verifikasi otorisasi pelunasan.',
      },
    ],
  },
];
export const initialManualEntries: ManualEntry[] = [];
export const initialPartHistory: PartHistory[] = [];
export const initialPartChanges: PartChangeRecord[] = initialPartHistory;

export const initialCorrectionRequests: CorrectionRequest[] = [
  {
    id: 'COR-001',
    ticketId: 'TKT-003',
    entityType: 'Part',
    entityId: 'PRT-001',
    fieldName: 'stokMin',
    currentValue: '5',
    proposedValue: '10',
    reason: 'Kebutuhan stok minimum meningkat sesuai lonjakan servis reguler bulanan.',
    evidenceReference: 'Rekomendasi Manajer Bengkel No. 12/BKG/XI/2026',
    riskLevel: 'rendah',
    requestedBy: 'Master Helpdesk',
    requestedAt: '2026-11-13 08.00',
    status: 'menunggu_persetujuan',
  },
  {
    id: 'COR-002',
    ticketId: 'TKT-004',
    entityType: 'Sale',
    entityId: 'PJ-0001',
    fieldName: 'paymentStatus',
    currentValue: 'menunggu_pembayaran',
    proposedValue: 'dibayar',
    reason: 'Pelanggan mengirim bukti transfer bank manual setelah batas waktu QRIS habis.',
    evidenceReference: 'Bukti Mutasi Bank BCA Ref #88291039',
    riskLevel: 'tinggi',
    requestedBy: 'Master Helpdesk',
    requestedAt: '2026-11-13 08.15',
    status: 'menunggu_persetujuan',
  },
];

export const initialKnowledgeBase: KnowledgeBaseArticle[] = [
  {
    id: 'KB-001',
    title: 'Booking Servis Tidak Muncul di Antrean Counter',
    category: 'Booking Servis',
    relatedModule: 'booking',
    symptoms: 'Pelanggan menyatakan sudah booking online tetapi admin counter tidak melihat data tersebut.',
    possibleCauses: [
      'Filter tanggal pada antrean aktif tidak mencakup tanggal jadwal servis.',
      'Status booking sudah dibatalkan atau telah terkonversi menjadi Service Form.',
      'Akun pelanggan belum menyelesaikan penyimpanan draft pemesanan.',
    ],
    diagnosticSteps: [
      'Gunakan Ruang Diagnostik dengan memasukkan Kode Booking (BK-xxxx) atau Nomor Plat.',
      'Periksa tanggal jadwal dan jam booking pada data entitas.',
      'Periksa apakah field serviceFormId sudah terisi yang menandakan kendaraan sudah dibuatkan estimasi.',
    ],
    resolutionSteps: [
      'Bila tanggal berbeda, arahkan counter untuk memilih filter Semua Tanggal atau tanggal yang sesuai.',
      'Bila booking berstatus batal, jelaskan alasan pembatalan kepada pelanggan atau buatkan jadwal baru.',
      'Bila belum tersimpan, pandu pelanggan untuk mengirim ulang formulir melalui halaman beranda.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
  {
    id: 'KB-002',
    title: 'Work Order Tidak Dapat Diselesaikan (Status Selesai Tertahan)',
    category: 'Servis & SPK',
    relatedModule: 'work_order',
    symptoms: 'Tombol Selesaikan SPK tidak aktif atau sistem menolak penutupan Work Order.',
    possibleCauses: [
      'Mekanik belum ditentukan pada form SPK.',
      'Terdapat item part atau jasa tanpa rincian pekerjaan.',
      'SPK sudah ditutup sebelumnya atau telah diterbitkan invoice kasir.',
    ],
    diagnosticSteps: [
      'Buka Ruang Diagnostik dan cari ID SPK (WO-xxxx).',
      'Periksa field mechanicId dan array history.',
      'Periksa apakah saleId sudah terisi di SPK terkait.',
    ],
    resolutionSteps: [
      'Tetapkan mekanik yang bertugas sebelum menyelesaikan SPK.',
      'Jika SPK telah memiliki saleId, arahkan kasir untuk memeriksa transaksi di menu Penjualan Kasir.',
      'Jangan menghapus atau membuat ulang SPK secara manual.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
  {
    id: 'KB-003',
    title: 'Total Stok Part Tidak Sesuai Fisik atau Riwayat Kartu Stok',
    category: 'Gudang & Stok',
    relatedModule: 'gudang',
    symptoms: 'Jumlah sisa part di katalog master berbeda dengan hasil hitung fisik di rak gudang.',
    possibleCauses: [
      'Barang keluar untuk SPK servis belum tercatat melalui mutasi keluar_wo.',
      'Pengambilan part darurat tanpa dokumen PO atau Permintaan Penyediaan.',
      'Terdapat transaksi penjualan kasir langsung yang belum tersinkronisasi.',
    ],
    diagnosticSteps: [
      'Cari kode part (PRT-xxxx) di Ruang Diagnostik untuk menelusuri seluruh baris stock_movements.',
      'Hitung akumulasi kuantitas mutasi: masuk, keluar_wo, keluar_penjualan, dan koreksi.',
      'Bandingkan dengan sesi Stok Opname terakhir.',
    ],
    resolutionSteps: [
      'Dilarang keras mengubah angka stok secara langsung di database.',
      'Ajukan permohonan sesi Stok Opname resmi melalui menu Master Gudang.',
      'Catat hasil selisih fisik melalui mekanisme koreksi stok opname yang disetujui Master Admin.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
  {
    id: 'KB-004',
    title: 'Status Pembayaran QRIS atau Transfer Menggantung',
    category: 'Penjualan & Pembayaran',
    relatedModule: 'pos',
    symptoms: 'Kasir melaporkan pelanggan sudah bayar transfer namun status penjualan tetap menunggu_pembayaran.',
    possibleCauses: [
      'Webhook notifikasi pembayaran bank belum diterima server atau terputus.',
      'Pelanggan salah memasukkan nominal kode unik transaksi.',
      'Waktu sesi pembayaran telah kedaluwarsa sebelum transfer selesai.',
    ],
    diagnosticSteps: [
      'Cari ID Penjualan (PJ-xxxx) di Ruang Diagnostik.',
      'Minta bukti mutasi transfer resmi (nomor referensi bank dan stempel jam transaksi).',
      'Cocokkan nilai rupiah total penjualan dengan nilai mutasi rekening bengkel.',
    ],
    resolutionSteps: [
      'Helpdesk tidak diperkenankan menandai lunas secara sepihak.',
      'Kirim Pengajuan Koreksi Data tingkat Tinggi dengan melampirkan nomor referensi mutasi bank.',
      'Tunggu persetujuan otorisasi dari Master Admin sebelum status diperbarui.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
  {
    id: 'KB-005',
    title: 'Laporan Penjualan atau Servis Tampak Kosong',
    category: 'Laporan & Ekspor',
    relatedModule: 'laporan',
    symptoms: 'Admin membuka menu Laporan namun tabel kosong atau grafik tidak menampilkan angka.',
    possibleCauses: [
      'Rentang tanggal (tanggal awal dan tanggal akhir) berada di luar tanggal transaksi.',
      'Filter metode pembayaran atau kategori mengesampingkan seluruh baris data.',
      'Penyimpanan lokal browser mengalami penumpukan cache tanggal lama.',
    ],
    diagnosticSteps: [
      'Periksa filter tanggal aktif di header laporan.',
      'Gunakan tombol Segarkan Data di Pusat Pemulihan Data untuk memuat ulang cache memori.',
      'Pastikan ada data transaksi riil pada rentang tanggal yang dipilih.',
    ],
    resolutionSteps: [
      'Atur filter tanggal ke rentang yang valid (contoh: bulan berjalan).',
      'Jangan mengubah data sumber hanya agar laporan menampilkan angka.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
  {
    id: 'KB-006',
    title: 'Gagal Masuk atau Kendala Akses Akun Pengguna',
    category: 'Akses & Login',
    relatedModule: 'auth',
    symptoms: 'Pengguna atau pelanggan menerima pesan kesalahan Email, kata sandi, atau PIN tidak sesuai.',
    possibleCauses: [
      'Kesalahan penulisan email (huruf besar/kecil atau spasi tersembunyi).',
      'Format PIN tidak sesuai (admin wajib 12 digit programmer PIN, pelanggan 1-6 digit).',
      'Akun pelanggan belum terdaftar di sistem penyimpanan lokal atau database.',
    ],
    diagnosticSteps: [
      'Periksa daftar registrasi pelanggan di penyimpanan terverifikasi.',
      'Pastikan akun tidak sedang dibatasi hak aksesnya.',
    ],
    resolutionSteps: [
      'Arahkan pengguna untuk memastikan email tidak mengandung spasi.',
      'Helpdesk dilarang melihat atau meminta kata sandi / PIN pengguna.',
      'Jika pelanggan baru, arahkan ke halaman Daftar Akun.',
    ],
    author: 'Tim Arsitektur MyBengkel',
    updatedAt: '2026-11-13 08.00',
  },
];
