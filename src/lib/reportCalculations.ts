import {
  type Booking,
  type Customer,
  type Mechanic,
  type MechanicAttendance,
  type Part,
  type PurchaseRequest,
  type Sale,
  type ServiceForm,
  type StockMovement,
  type Vehicle,
  type WorkOrder,
  computeStock,
} from '../data/adminDummy';
import { formatRupiah } from './format';

export type ReportPeriodMode = 'Harian' | 'Bulanan';

export interface ReportPeriod {
  mode: ReportPeriodMode;
  dateStr: string; // YYYY-MM-DD
}

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export function getIndonesianDateLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length < 3) return dateStr;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthName = MONTH_NAMES_ID[monthIdx] || parts[1];
  return `${day} ${monthName} ${year}`;
}

export function getIndonesianMonthLabel(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 7).split('-');
  if (parts.length < 2) return dateStr;
  const year = parts[0];
  const monthIdx = Number(parts[1]) - 1;
  const monthName = MONTH_NAMES_ID[monthIdx] || parts[1];
  return `${monthName} ${year}`;
}

export function getPeriodDisplayLabel(period: ReportPeriod): string {
  if (period.mode === 'Harian') {
    return getIndonesianDateLabel(period.dateStr);
  }
  return getIndonesianMonthLabel(period.dateStr);
}

export function isDateInPeriod(targetDateStr: string | undefined, period: ReportPeriod): boolean {
  if (!targetDateStr) return false;
  const clean = targetDateStr.trim().replace(/\//g, '-');
  if (period.mode === 'Harian') {
    return clean.startsWith(period.dateStr.slice(0, 10));
  }
  // Monthly mode
  const targetMonth = clean.slice(0, 7);
  const selectedMonth = period.dateStr.slice(0, 7);
  return targetMonth === selectedMonth;
}

// Extract hour (e.g. 8 .. 17) or return null
export function extractHourFromTimestamp(stamp?: string): number | null {
  if (!stamp) return null;
  // Match HH:mm or HH.mm
  const m = stamp.match(/(\d{1,2})[:.](\d{2})/);
  if (m) {
    const hr = Number(m[1]);
    return hr >= 0 && hr <= 23 ? hr : null;
  }
  return null;
}

// Extract day of month (1 .. 31)
export function extractDayOfMonth(stamp?: string): number | null {
  if (!stamp) return null;
  const parts = stamp.slice(0, 10).split(/[-/]/);
  if (parts.length >= 3) {
    const day = Number(parts[2]);
    return !Number.isNaN(day) && day >= 1 && day <= 31 ? day : null;
  }
  return null;
}

// ============================================================================
// 1. SERVICE REPORT DATA TYPES & CALCULATIONS
// ============================================================================

export interface ServiceWorkOrderRow {
  nomorWo: string;
  namaKonsumen: string;
  nomorHp: string;
  nomorPlat: string;
  nomorMesin: string;
  nomorRangka: string;
  tipeMotor: string;
  warnaMotor: string;
  mekanik: string;
  tanggalMasuk: string;
  tanggalSelesai: string;
  statusWo: 'Berjalan' | 'Selesai' | 'Batal';
  totalJasa: number;
  totalPart: number;
  totalServis: number;
}

export interface ServiceBookingRow {
  kodeBooking: string;
  namaKonsumen: string;
  platNomor: string;
  layanan: string;
  tanggal: string;
  jam: string;
  status: string;
  sumberBooking: string;
}

export interface ServiceJasaDetailRow {
  nomorWo: string;
  namaKonsumen: string;
  namaJasa: string;
  qty: number;
  hargaSatuan: number;
  subtotal: number;
}

export interface ServicePartDetailRow {
  nomorWo: string;
  namaKonsumen: string;
  kodePart: string;
  namaPart: string;
  qty: number;
  hargaSatuan: number;
  subtotal: number;
}

export interface ServiceMechanicPerformanceRow {
  mekanik: string;
  jumlahWo: number;
  jamKerja: string;
  jumlahWoSelesai: number;
  totalNilaiJasa: number;
}

export interface ServiceReportData {
  period: ReportPeriod;
  periodLabel: string;
  kpis: {
    totalBooking: number;
    totalServiceForm: number;
    totalWorkOrder: number;
    woBerjalan: number;
    woSelesai: number;
    woBatal: number;
    totalOmzetJasa: number;
    totalNilaiPartSelesai: number;
    totalWoPeriod: number;
  };
  charts: {
    statusWoDoughnut: {
      berjalan: number;
      selesai: number;
      batal: number;
      total: number;
    };
    kendaraanDoughnut: {
      honda: number;
      yamaha: number;
      suzuki: number;
      lainnya: number;
      total: number;
    };
    aktivitasBarChart: {
      labels: string[];
      woMasukSeries: number[];
      woSelesaiSeries: number[];
    };
  };
  tables: {
    mainWorkOrders: ServiceWorkOrderRow[];
    bookings: ServiceBookingRow[];
    jasaDetails: ServiceJasaDetailRow[];
    partDetails: ServicePartDetailRow[];
    mechanicPerformances: ServiceMechanicPerformanceRow[];
  };
}

export function calculateServiceReport(
  period: ReportPeriod,
  store: {
    bookings: Booking[];
    serviceForms: ServiceForm[];
    workOrders: WorkOrder[];
    mechanics: Mechanic[];
    attendance?: MechanicAttendance[];
    customers: Customer[];
    vehicles: Vehicle[];
  }
): ServiceReportData {
  const { bookings, serviceForms, workOrders, mechanics, customers, vehicles } = store;
  const periodLabel = getPeriodDisplayLabel(period);

  // 1. Filter Bookings in period
  const periodBookings = bookings.filter((b) => isDateInPeriod(b.date, period));

  // 2. Filter Service Forms in period
  const periodSFs = serviceForms.filter((sf) => isDateInPeriod(sf.createdAt, period));
  const sfIdSet = new Set(periodSFs.map((sf) => sf.id));

  // 3. Filter Work Orders in period (created, completed, or linked to SF in period)
  const periodWOs = workOrders.filter((wo) => {
    const linkedSf = serviceForms.find((sf) => sf.id === wo.serviceFormId);
    const dateMatches =
      isDateInPeriod(wo.updatedAt, period) ||
      isDateInPeriod(wo.endedAt, period) ||
      (linkedSf && isDateInPeriod(linkedSf.createdAt, period));
    return dateMatches || (wo.serviceFormId && sfIdSet.has(wo.serviceFormId));
  });

  // KPI Calculations
  let woBerjalan = 0;
  let woSelesai = 0;
  let woBatal = 0;
  let totalOmzetJasa = 0;
  let totalNilaiPartSelesai = 0;

  for (const wo of periodWOs) {
    if (wo.endState === 'selesai') {
      woSelesai++;
      const jasaSum = wo.lines
        .filter((l) => l.type === 'Jasa')
        .reduce((sum, l) => sum + l.subtotal, 0);
      const partSum = wo.lines
        .filter((l) => l.type === 'Part')
        .reduce((sum, l) => sum + l.subtotal, 0);
      totalOmzetJasa += jasaSum;
      totalNilaiPartSelesai += partSum;
    } else if (wo.endState === 'batal') {
      woBatal++;
    } else {
      woBerjalan++;
    }
  }

  // Vehicle Brand Grouping (Honda, Yamaha, Suzuki, Lainnya/Tidak diketahui)
  let hondaCount = 0;
  let yamahaCount = 0;
  let suzukiCount = 0;
  let lainnyaCount = 0;

  for (const wo of periodWOs) {
    const sf = serviceForms.find((s) => s.id === wo.serviceFormId);
    const plat = sf?.vehicle.plat || '';
    const matchedVeh = vehicles.find((v) => v.plate === plat);
    const brandStr = (
      matchedVeh?.brand ||
      sf?.vehicle.tipeMotor ||
      sf?.vehicle.tipeManual ||
      ''
    ).toLowerCase();

    if (brandStr.includes('honda') || brandStr.includes('vario') || brandStr.includes('beat')) {
      hondaCount++;
    } else if (brandStr.includes('yamaha') || brandStr.includes('nmax') || brandStr.includes('aerox')) {
      yamahaCount++;
    } else if (brandStr.includes('suzuki') || brandStr.includes('satria') || brandStr.includes('gsx')) {
      suzukiCount++;
    } else {
      lainnyaCount++;
    }
  }

  // Bar Chart: Aktivitas Servis (Grouped bars: WO Masuk vs WO Selesai)
  let barLabels: string[] = [];
  let woMasukSeries: number[] = [];
  let woSelesaiSeries: number[] = [];

  if (period.mode === 'Harian') {
    // 08.00 .. 17.00
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    barLabels = hours.map((h) => `${String(h).padStart(2, '0')}.00`);
    woMasukSeries = new Array(hours.length).fill(0);
    woSelesaiSeries = new Array(hours.length).fill(0);

    for (const wo of periodWOs) {
      const sf = serviceForms.find((s) => s.id === wo.serviceFormId);
      const inHr = extractHourFromTimestamp(sf?.createdAt || wo.updatedAt);
      if (inHr !== null) {
        const idx = hours.indexOf(inHr);
        if (idx >= 0) woMasukSeries[idx]++;
      }
      if (wo.endState === 'selesai') {
        const outHr = extractHourFromTimestamp(wo.endedAt || wo.updatedAt);
        if (outHr !== null) {
          const idx = hours.indexOf(outHr);
          if (idx >= 0) woSelesaiSeries[idx]++;
        }
      }
    }
  } else {
    // Monthly mode: days 1..31
    const parts = period.dateStr.split('-');
    const year = Number(parts[0]) || 2026;
    const month = Number(parts[1]) || 11;
    const daysInMonth = new Date(year, month, 0).getDate();

    barLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    woMasukSeries = new Array(daysInMonth).fill(0);
    woSelesaiSeries = new Array(daysInMonth).fill(0);

    for (const wo of periodWOs) {
      const sf = serviceForms.find((s) => s.id === wo.serviceFormId);
      const inDay = extractDayOfMonth(sf?.createdAt || wo.updatedAt);
      if (inDay !== null && inDay >= 1 && inDay <= daysInMonth) {
        woMasukSeries[inDay - 1]++;
      }
      if (wo.endState === 'selesai') {
        const outDay = extractDayOfMonth(wo.endedAt || wo.updatedAt);
        if (outDay !== null && outDay >= 1 && outDay <= daysInMonth) {
          woSelesaiSeries[outDay - 1]++;
        }
      }
    }
  }

  // Main Table: Data Work Order (Strictly 15 columns, NO vehicle year!)
  const mainWorkOrders: ServiceWorkOrderRow[] = periodWOs.map((wo) => {
    const sf = serviceForms.find((s) => s.id === wo.serviceFormId);
    const plat = sf?.vehicle.plat || '';
    const cust = customers.find((c) => c.plate === plat || c.name === sf?.customer.nama);
    const veh = vehicles.find((v) => v.plate === plat);
    const mech = mechanics.find((m) => m.id === wo.mechanicId);

    const totalJasa = wo.lines
      .filter((l) => l.type === 'Jasa')
      .reduce((sum, l) => sum + l.subtotal, 0);
    const totalPart = wo.lines
      .filter((l) => l.type === 'Part')
      .reduce((sum, l) => sum + l.subtotal, 0);

    return {
      nomorWo: wo.id,
      namaKonsumen: sf?.customer.nama || cust?.name || 'Belum diisi',
      nomorHp: sf?.customer.hp || cust?.phone || 'Belum diisi',
      nomorPlat: plat || cust?.plate || 'Belum diisi',
      nomorMesin: sf?.vehicle.mesin || cust?.engineNo || veh?.engineNo || 'Belum diisi',
      nomorRangka: sf?.vehicle.rangka || cust?.frameNo || veh?.frameNo || 'Belum diisi',
      tipeMotor: sf?.vehicle.tipeMotor || sf?.vehicle.tipeManual || veh?.model || 'Belum diisi',
      warnaMotor: sf?.vehicle.warna || 'Belum diisi',
      mekanik: mech?.nama || 'Belum ditugaskan',
      tanggalMasuk: sf?.createdAt || 'Belum diisi',
      tanggalSelesai: wo.endedAt || (wo.endState === 'selesai' ? wo.updatedAt : '-'),
      statusWo: wo.endState === 'selesai' ? 'Selesai' : wo.endState === 'batal' ? 'Batal' : 'Berjalan',
      totalJasa,
      totalPart,
      totalServis: totalJasa + totalPart,
    };
  });

  // Table 2: Booking dan Kedatangan
  const bookingRows: ServiceBookingRow[] = periodBookings.map((b) => ({
    kodeBooking: b.id,
    namaKonsumen: b.customerName,
    platNomor: b.plate,
    layanan: b.service,
    tanggal: b.date,
    jam: b.hour,
    status: b.status === 'datang' ? 'Datang' : b.status === 'batal' ? 'Batal' : 'Menunggu',
    sumberBooking: b.source === 'online' ? 'Online' : 'Langsung',
  }));

  // Table 3: Rincian Jasa
  const jasaDetails: ServiceJasaDetailRow[] = [];
  // Table 4: Rincian Part Work Order
  const partDetails: ServicePartDetailRow[] = [];

  for (const wo of periodWOs) {
    const sf = serviceForms.find((s) => s.id === wo.serviceFormId);
    const custName = sf?.customer.nama || 'Konsumen';

    for (const l of wo.lines) {
      if (l.type === 'Jasa') {
        jasaDetails.push({
          nomorWo: wo.id,
          namaKonsumen: custName,
          namaJasa: l.name,
          qty: l.qty,
          hargaSatuan: l.unitPrice,
          subtotal: l.subtotal,
        });
      } else {
        partDetails.push({
          nomorWo: wo.id,
          namaKonsumen: custName,
          kodePart: l.partCode || '-',
          namaPart: l.name,
          qty: l.qty,
          hargaSatuan: l.unitPrice,
          subtotal: l.subtotal,
        });
      }
    }
  }

  // Table 5: Kinerja Mekanik
  const mechanicPerformances: ServiceMechanicPerformanceRow[] = mechanics.map((m) => {
    const assignedWOs = periodWOs.filter((w) => w.mechanicId === m.id);
    const finishedWOs = assignedWOs.filter((w) => w.endState === 'selesai');
    const totalJasaVal = finishedWOs.reduce(
      (sum, w) =>
        sum +
        w.lines.filter((l) => l.type === 'Jasa').reduce((s, l) => s + l.subtotal, 0),
      0
    );

    return {
      mekanik: m.nama,
      jumlahWo: assignedWOs.length,
      jamKerja: `${assignedWOs.length * 2} jam`,
      jumlahWoSelesai: finishedWOs.length,
      totalNilaiJasa: totalJasaVal,
    };
  });

  return {
    period,
    periodLabel,
    kpis: {
      totalBooking: periodBookings.length,
      totalServiceForm: periodSFs.length,
      totalWorkOrder: periodWOs.length,
      woBerjalan,
      woSelesai,
      woBatal,
      totalOmzetJasa,
      totalNilaiPartSelesai,
      totalWoPeriod: periodWOs.length,
    },
    charts: {
      statusWoDoughnut: {
        berjalan: woBerjalan,
        selesai: woSelesai,
        batal: woBatal,
        total: periodWOs.length,
      },
      kendaraanDoughnut: {
        honda: hondaCount,
        yamaha: yamahaCount,
        suzuki: suzukiCount,
        lainnya: lainnyaCount,
        total: periodWOs.length,
      },
      aktivitasBarChart: {
        labels: barLabels,
        woMasukSeries,
        woSelesaiSeries,
      },
    },
    tables: {
      mainWorkOrders,
      bookings: bookingRows,
      jasaDetails,
      partDetails,
      mechanicPerformances,
    },
  };
}

// ============================================================================
// 2. SALES REPORT DATA TYPES & CALCULATIONS
// ============================================================================

export interface SalesPosLineRow {
  kodeTransaksi: string;
  tanggalTransaksi: string;
  namaKonsumen: string;
  kodePart: string;
  namaPart: string;
  jumlah: number;
  hargaSatuan: number;
  subtotal: number;
  metodePembayaran: string;
  statusPembayaran: string;
  nomorReferensi: string;
  kasir: string;
}

export interface SalesWoPartLineRow {
  nomorWo: string;
  tanggalSelesai: string;
  namaKonsumen: string;
  platNomor: string;
  kodePart: string;
  namaPart: string;
  jumlah: number;
  hargaSatuan: number;
  subtotal: number;
  mekanik: string;
  statusWo: string;
}

export interface SalesPartPerformanceRow {
  kodePart: string;
  namaPart: string;
  satuan: string;
  totalQtyTerjual: number;
  nilaiPenjualan: number;
  hargaBeli: number;
  estimasiMargin: number;
}

export interface SalesReportData {
  period: ReportPeriod;
  periodLabel: string;
  kpis: {
    totalOmzetPos: number;
    totalNilaiPartWoSelesai: number;
    totalPenjualanPartGabungan: number;
    totalTransaksiPosDibayar: number;
    totalWoSelesaiGunakanPart: number;
    totalJumlahPartTerjual: number;
    rataRataTransaksiPos: number;
    partTerlarisNama: string;
    partTerlarisQty: number;
  };
  charts: {
    sumberPenjualanDoughnut: {
      posValue: number;
      posCount: number;
      woValue: number;
      woCount: number;
      totalValue: number;
    };
    metodePembayaranDoughnut: {
      cash: number;
      transfer: number;
      qr: number;
      total: number;
    };
    trenPenjualanBarChart: {
      labels: string[];
      posSeries: number[];
      woSeries: number[];
    };
  };
  tables: {
    posLines: SalesPosLineRow[];
    woPartLines: SalesWoPartLineRow[];
    partPerformances: SalesPartPerformanceRow[];
  };
}

export function calculateSalesReport(
  period: ReportPeriod,
  store: {
    sales: Sale[];
    workOrders: WorkOrder[];
    serviceForms: ServiceForm[];
    parts: Part[];
    mechanics: Mechanic[];
  }
): SalesReportData {
  const { sales, workOrders, serviceForms, parts, mechanics } = store;
  const periodLabel = getPeriodDisplayLabel(period);

  // 1. Filter completed & paid POS transactions in period
  const paidPosSales = sales.filter(
    (s) =>
      s.paymentStatus === 'dibayar' &&
      isDateInPeriod(s.paidAt || s.createdAt || s.date, period)
  );

  // 2. Filter completed Work Orders in period that have parts
  const finishedWOs = workOrders.filter(
    (w) =>
      w.endState === 'selesai' &&
      isDateInPeriod(w.endedAt || w.updatedAt, period) &&
      w.lines.some((l) => l.type === 'Part')
  );

  // Totals
  const totalOmzetPos = paidPosSales.reduce((sum, s) => sum + s.total, 0);
  let totalNilaiPartWoSelesai = 0;
  let totalQtyPos = 0;
  let totalQtyWo = 0;

  // Breakdown tables
  const posLines: SalesPosLineRow[] = [];
  const partQtyMap = new Map<
    string,
    { name: string; qty: number; revenue: number; unitPrice: number }
  >();

  for (const s of paidPosSales) {
    for (const l of s.lines) {
      const code = l.partCode || l.partId || 'PRT-001';
      totalQtyPos += l.qty;
      posLines.push({
        kodeTransaksi: s.number || s.id,
        tanggalTransaksi: s.paidAt || s.createdAt || s.date,
        namaKonsumen: s.customerName || 'Umum',
        kodePart: code,
        namaPart: l.name,
        jumlah: l.qty,
        hargaSatuan: l.price,
        subtotal: l.subtotal,
        metodePembayaran: s.method,
        statusPembayaran: 'Dibayar',
        nomorReferensi: s.paymentReference || '-',
        kasir: s.cashierName || 'Kasir Utama',
      });

      const existing = partQtyMap.get(code) || {
        name: l.name,
        qty: 0,
        revenue: 0,
        unitPrice: l.price,
      };
      existing.qty += l.qty;
      existing.revenue += l.subtotal;
      partQtyMap.set(code, existing);
    }
  }

  const woPartLines: SalesWoPartLineRow[] = [];
  for (const w of finishedWOs) {
    const sf = serviceForms.find((s) => s.id === w.serviceFormId);
    const mech = mechanics.find((m) => m.id === w.mechanicId);
    const custName = sf?.customer.nama || 'Konsumen';
    const plat = sf?.vehicle.plat || '-';

    for (const l of w.lines) {
      if (l.type === 'Part') {
        const code = l.partCode || 'PRT-001';
        totalNilaiPartWoSelesai += l.subtotal;
        totalQtyWo += l.qty;

        woPartLines.push({
          nomorWo: w.id,
          tanggalSelesai: w.endedAt || w.updatedAt,
          namaKonsumen: custName,
          platNomor: plat,
          kodePart: code,
          namaPart: l.name,
          jumlah: l.qty,
          hargaSatuan: l.unitPrice,
          subtotal: l.subtotal,
          mekanik: mech?.nama || 'Mekanik',
          statusWo: 'Selesai',
        });

        const existing = partQtyMap.get(code) || {
          name: l.name,
          qty: 0,
          revenue: 0,
          unitPrice: l.unitPrice,
        };
        existing.qty += l.qty;
        existing.revenue += l.subtotal;
        partQtyMap.set(code, existing);
      }
    }
  }

  const totalPenjualanPartGabungan = totalOmzetPos + totalNilaiPartWoSelesai;
  const totalJumlahPartTerjual = totalQtyPos + totalQtyWo;
  const totalTransaksiPosDibayar = paidPosSales.length;
  const rataRataTransaksiPos =
    totalTransaksiPosDibayar > 0
      ? Math.round(totalOmzetPos / totalTransaksiPosDibayar)
      : 0;

  // Best seller part
  let partTerlarisNama = '-';
  let partTerlarisQty = 0;
  for (const [, item] of partQtyMap.entries()) {
    if (item.qty > partTerlarisQty) {
      partTerlarisQty = item.qty;
      partTerlarisNama = item.name;
    }
  }

  // Part Performance Table
  const partPerformances: SalesPartPerformanceRow[] = Array.from(partQtyMap.entries()).map(
    ([code, data]) => {
      const p = parts.find((pt) => pt.kode === code || pt.code === code);
      const buyPrice = p?.hargaBeli ?? p?.buyPrice ?? 0;
      const unit = p?.satuan ?? p?.unit ?? 'pcs';
      const estimatedCost = buyPrice * data.qty;
      const margin = data.revenue - estimatedCost;

      return {
        kodePart: code,
        namaPart: data.name,
        satuan: unit,
        totalQtyTerjual: data.qty,
        nilaiPenjualan: data.revenue,
        hargaBeli: buyPrice,
        estimasiMargin: margin,
      };
    }
  ).sort((a, b) => b.totalQtyTerjual - a.totalQtyTerjual);

  // Doughnut 2: Payment Methods for paid POS
  let cashCount = 0;
  let transferCount = 0;
  let qrCount = 0;
  for (const s of paidPosSales) {
    if (s.method === 'Tunai') cashCount++;
    else if (s.method === 'Transfer') transferCount++;
    else if (s.method === 'QR') qrCount++;
  }

  // Bar Chart: Tren Penjualan Part (Grouped series: Penjualan POS vs Part WO Selesai)
  let barLabels: string[] = [];
  let posSeries: number[] = [];
  let woSeries: number[] = [];

  if (period.mode === 'Harian') {
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    barLabels = hours.map((h) => `${String(h).padStart(2, '0')}.00`);
    posSeries = new Array(hours.length).fill(0);
    woSeries = new Array(hours.length).fill(0);

    for (const s of paidPosSales) {
      const hr = extractHourFromTimestamp(s.paidAt || s.createdAt);
      if (hr !== null) {
        const idx = hours.indexOf(hr);
        if (idx >= 0) posSeries[idx] += s.total;
      }
    }

    for (const w of finishedWOs) {
      const hr = extractHourFromTimestamp(w.endedAt || w.updatedAt);
      if (hr !== null) {
        const idx = hours.indexOf(hr);
        if (idx >= 0) {
          const partSum = w.lines
            .filter((l) => l.type === 'Part')
            .reduce((sum, l) => sum + l.subtotal, 0);
          woSeries[idx] += partSum;
        }
      }
    }
  } else {
    // Monthly mode
    const partsDate = period.dateStr.split('-');
    const year = Number(partsDate[0]) || 2026;
    const month = Number(partsDate[1]) || 11;
    const daysInMonth = new Date(year, month, 0).getDate();

    barLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    posSeries = new Array(daysInMonth).fill(0);
    woSeries = new Array(daysInMonth).fill(0);

    for (const s of paidPosSales) {
      const day = extractDayOfMonth(s.paidAt || s.createdAt || s.date);
      if (day !== null && day >= 1 && day <= daysInMonth) {
        posSeries[day - 1] += s.total;
      }
    }

    for (const w of finishedWOs) {
      const day = extractDayOfMonth(w.endedAt || w.updatedAt);
      if (day !== null && day >= 1 && day <= daysInMonth) {
        const partSum = w.lines
          .filter((l) => l.type === 'Part')
          .reduce((sum, l) => sum + l.subtotal, 0);
        woSeries[day - 1] += partSum;
      }
    }
  }

  return {
    period,
    periodLabel,
    kpis: {
      totalOmzetPos,
      totalNilaiPartWoSelesai,
      totalPenjualanPartGabungan,
      totalTransaksiPosDibayar,
      totalWoSelesaiGunakanPart: finishedWOs.length,
      totalJumlahPartTerjual,
      rataRataTransaksiPos,
      partTerlarisNama,
      partTerlarisQty,
    },
    charts: {
      sumberPenjualanDoughnut: {
        posValue: totalOmzetPos,
        posCount: paidPosSales.length,
        woValue: totalNilaiPartWoSelesai,
        woCount: finishedWOs.length,
        totalValue: totalPenjualanPartGabungan,
      },
      metodePembayaranDoughnut: {
        cash: cashCount,
        transfer: transferCount,
        qr: qrCount,
        total: paidPosSales.length,
      },
      trenPenjualanBarChart: {
        labels: barLabels,
        posSeries,
        woSeries,
      },
    },
    tables: {
      posLines,
      woPartLines,
      partPerformances,
    },
  };
}

// ============================================================================
// 3. WAREHOUSE REPORT DATA TYPES & CALCULATIONS
// ============================================================================

export interface WarehousePartConditionRow {
  kodePart: string;
  namaPart: string;
  satuan: string;
  stok: number;
  hargaBeli: number;
  hargaJual: number;
  stokMinimum: number | string;
  jenis: 'reguler' | 'ho';
  status: 'Aman' | 'Kritis' | 'HO';
  tanggalDibuat: string;
  tanggalPermintaan: string;
  tanggalTerimaTerakhir: string;
}

export interface WarehouseMovementRow {
  tanggal: string;
  kodePart: string;
  namaPart: string;
  jenisMutasi: string;
  qtyMasuk: number;
  qtyKeluar: number;
  referensiTransaksi: string;
  sumberMutasi: string;
  dicatatOleh: string;
  catatan: string;
}

export interface WarehouseRequestRow {
  kodePermintaan: string;
  jenisPermintaan: string;
  pemohon: string;
  kodePart: string;
  namaPart: string;
  jumlah: number;
  statusPart: string;
  statusPermintaan: string;
  kodePemesanan: string;
  tanggalDiajukan: string;
  tanggalDiterima: string;
  alasan: string;
}

export interface WarehouseOrderRow {
  kodePemesanan: string;
  jenis: string;
  namaPemohon: string;
  jumlahPart: number;
  status: string;
  tanggalPesan: string;
  tanggalSampai: string;
  tanggalDiproses: string;
  alasanBatal: string;
}

import {
  StockOpnameSession,
  StockOpnameStatus,
  STOCK_OPNAME_STATUS_LABELS,
} from './stockOpname';

export interface WarehouseStockOpnameRow {
  kodeOpname: string;
  tanggalOpname: string;
  petugas: string;
  jumlahPart: number;
  partSesuai: number;
  partLebih: number;
  partKurang: number;
  status: StockOpnameStatus;
  disetujuiOleh: string;
  tanggalPersetujuan: string;
  sessionRef: StockOpnameSession;
}

export interface WarehouseReportData {
  period: ReportPeriod;
  periodLabel: string;
  kpis: {
    totalJenisPart: number;
    partAmanCount: number;
    partKritisCount: number;
    partHoCount: number;
    totalStokTersedia: number;
    totalBarangMasuk: number;
    totalBarangKeluar: number;
    totalPermintaanPending: number;
    totalPesananBelumSampai: number;
  };
  charts: {
    kondisiStokDoughnut: {
      aman: number;
      kritis: number;
      ho: number;
      total: number;
    };
    komposisiMutasiDoughnut: {
      masuk: number;
      keluarWo: number;
      keluarHo: number;
      keluarPenjualan: number;
      koreksi: number;
      total: number;
    };
    pergerakanStokBarChart: {
      labels: string[];
      masukSeries: number[];
      keluarSeries: number[];
    };
  };
  tables: {
    partConditions: WarehousePartConditionRow[];
    movements: WarehouseMovementRow[];
    requests: WarehouseRequestRow[];
    orders: WarehouseOrderRow[];
  };
  stockOpname: {
    kpis: {
      totalSesiOpname: number;
      totalSesiDisetujui: number;
      totalSesiMenunggu: number;
      totalPartDihitung: number;
      totalPartSelisih: number;
      totalPartLebih: number;
      totalPartKurang: number;
      totalSesiDitolak: number;
    };
    rows: WarehouseStockOpnameRow[];
  };
}

export function calculateWarehouseReport(
  period: ReportPeriod,
  store: {
    parts: Part[];
    stockMovements: StockMovement[];
    purchaseRequests: PurchaseRequest[];
    stockOpnames?: StockOpnameSession[];
  }
): WarehouseReportData {
  const { parts, stockMovements, purchaseRequests, stockOpnames = [] } = store;
  const periodLabel = getPeriodDisplayLabel(period);

  // Filter movements in period
  const periodMovements = stockMovements.filter((m) => isDateInPeriod(m.date, period));

  // Filter purchase requests in period (created or arrived)
  const periodRequests = purchaseRequests.filter((pr) =>
    isDateInPeriod(pr.createdAt, period) || isDateInPeriod(pr.arrivedAt, period)
  );

  // Filter stock opnames in period
  const periodOpnames = stockOpnames.filter((so) =>
    isDateInPeriod(so.startedAt || so.createdAt, period)
  );

  // Compute stock condition per part from the movement ledger
  let partAmanCount = 0;
  let partKritisCount = 0;
  let partHoCount = 0;
  let totalStokTersedia = 0;

  const partConditions: WarehousePartConditionRow[] = parts.map((p) => {
    const code = p.kode || p.code || 'PRT-001';
    const isHo = p.jenis === 'ho' || p.partType === 'HO';
    const minStock = isHo ? '-' : p.stokMin ?? p.minStock ?? 1;
    const currentStock = computeStock(code, stockMovements);
    totalStokTersedia += currentStock;

    let status: 'Aman' | 'Kritis' | 'HO' = 'Aman';
    if (isHo) {
      status = 'HO';
      partHoCount++;
    } else {
      const minNum = Number(minStock) || 0;
      if (currentStock < minNum) {
        status = 'Kritis';
        partKritisCount++;
      } else {
        status = 'Aman';
        partAmanCount++;
      }
    }

    // Find last request and receive date for this part
    let lastReqDate = '-';
    let lastRcpDate = '-';
    for (const pr of purchaseRequests) {
      const hasPart = pr.lines.some((l) => (l.partId === code));
      if (hasPart) {
        if (pr.createdAt && (lastReqDate === '-' || pr.createdAt > lastReqDate)) {
          lastReqDate = pr.createdAt;
        }
        if (pr.arrivedAt && (lastRcpDate === '-' || pr.arrivedAt > lastRcpDate)) {
          lastRcpDate = pr.arrivedAt;
        }
      }
    }

    return {
      kodePart: code,
      namaPart: p.nama || p.name || 'Part',
      satuan: p.satuan || p.unit || 'pcs',
      stok: currentStock,
      hargaBeli: p.hargaBeli ?? p.buyPrice ?? 0,
      hargaJual: p.hargaJual ?? p.sellPrice ?? 0,
      stokMinimum: minStock,
      jenis: isHo ? 'ho' : 'reguler',
      status,
      tanggalDibuat: p.createdAt || '-',
      tanggalPermintaan: lastReqDate,
      tanggalTerimaTerakhir: lastRcpDate,
    };
  });

  // Movement Breakdown
  let totalBarangMasuk = 0;
  let totalBarangKeluar = 0;
  let mutasiMasukQty = 0;
  let mutasiKeluarWoQty = 0;
  let mutasiKeluarHoQty = 0;
  let mutasiKeluarPenjualanQty = 0;
  let mutasiKoreksiQty = 0;

  const movementRows: WarehouseMovementRow[] = periodMovements.map((m) => {
    const code = m.partCode || m.partId || 'PRT-001';
    const p = parts.find((pt) => pt.kode === code || pt.code === code);
    const qty = m.quantity;
    const isMasuk = qty > 0;
    const absQty = Math.abs(qty);

    if (isMasuk) {
      totalBarangMasuk += absQty;
      mutasiMasukQty += absQty;
    } else {
      totalBarangKeluar += absQty;
      if (m.type === 'keluar_wo') mutasiKeluarWoQty += absQty;
      else if (m.type === 'keluar_ho') mutasiKeluarHoQty += absQty;
      else if (m.type === 'keluar_penjualan') mutasiKeluarPenjualanQty += absQty;
      else if (m.type === 'koreksi') mutasiKoreksiQty += absQty;
      else mutasiKeluarWoQty += absQty;
    }

    return {
      tanggal: m.date,
      kodePart: code,
      namaPart: p?.nama || p?.name || code,
      jenisMutasi: m.type,
      qtyMasuk: isMasuk ? absQty : 0,
      qtyKeluar: isMasuk ? 0 : absQty,
      referensiTransaksi: m.reference || '-',
      sumberMutasi:
        m.type === 'masuk'
          ? 'Penerimaan Gudang'
          : m.type === 'keluar_wo'
          ? 'Work Order'
          : m.type === 'keluar_penjualan'
          ? 'Kasir POS'
          : m.type === 'keluar_ho'
          ? 'Penyelesaian HO'
          : 'Koreksi Stok',
      dicatatOleh: 'Admin Gudang',
      catatan: m.reason || '-',
    };
  });

  // Requests Table
  const requestRows: WarehouseRequestRow[] = [];
  let pendingRequestCount = 0;
  let orderBelumSampaiCount = 0;

  for (const pr of periodRequests) {
    if (pr.state === 'diajukan' || pr.state === 'belum_sampai') {
      pendingRequestCount++;
    }
    if (pr.state === 'belum_sampai') {
      orderBelumSampaiCount++;
    }

    for (const l of pr.lines) {
      const code = l.partId;
      const p = parts.find((pt) => pt.kode === code || pt.code === code);
      requestRows.push({
        kodePermintaan: pr.id,
        jenisPermintaan: pr.type === 'ho' ? 'Head Office (HO)' : 'Reguler',
        pemohon: pr.requesterName || 'Admin Gudang',
        kodePart: code,
        namaPart: p?.nama || p?.name || code,
        jumlah: l.qty,
        statusPart: l.lineState === 'terima' ? 'Terima' : l.lineState === 'batal' ? 'Batal' : 'Belum',
        statusPermintaan:
          pr.state === 'selesai'
            ? 'Selesai'
            : pr.state === 'sampai'
            ? 'Sampai'
            : pr.state === 'belum_sampai'
            ? 'Belum sampai'
            : pr.state === 'ditolak'
            ? 'Ditolak'
            : pr.state === 'batal'
            ? 'Batal'
            : 'Diajukan',
        kodePemesanan: pr.orderCode || '-',
        tanggalDiajukan: pr.createdAt || '-',
        tanggalDiterima: l.receivedAt || pr.arrivedAt || '-',
        alasan: pr.requestReason || '-',
      });
    }
  }

  // Orders Table (Grouped by orderCode)
  const orderRows: WarehouseOrderRow[] = periodRequests
    .filter((pr) => Boolean(pr.orderCode))
    .map((pr) => {
      const totalPartQty = pr.lines.reduce((s, l) => s + l.qty, 0);
      return {
        kodePemesanan: pr.orderCode || pr.id,
        jenis: pr.type === 'ho' ? 'HO' : 'Reguler',
        namaPemohon: pr.requesterName || 'Admin Gudang',
        jumlahPart: totalPartQty,
        status:
          pr.state === 'selesai'
            ? 'Selesai'
            : pr.state === 'sampai'
            ? 'Sampai'
            : pr.state === 'belum_sampai'
            ? 'Belum sampai'
            : pr.state === 'ditolak'
            ? 'Ditolak'
            : 'Batal',
        tanggalPesan: pr.orderedAt || pr.createdAt || '-',
        tanggalSampai: pr.arrivedAt || '-',
        tanggalDiproses: pr.processedAt || '-',
        alasanBatal: pr.closeReason || '-',
      };
    });

  // Bar Chart: Pergerakan Stok (Grouped bars: Masuk vs Keluar)
  let barLabels: string[] = [];
  let masukSeries: number[] = [];
  let keluarSeries: number[] = [];

  if (period.mode === 'Harian') {
    const hours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
    barLabels = hours.map((h) => `${String(h).padStart(2, '0')}.00`);
    masukSeries = new Array(hours.length).fill(0);
    keluarSeries = new Array(hours.length).fill(0);

    for (const m of periodMovements) {
      const hr = extractHourFromTimestamp(m.date);
      if (hr !== null) {
        const idx = hours.indexOf(hr);
        if (idx >= 0) {
          if (m.quantity > 0) masukSeries[idx] += m.quantity;
          else keluarSeries[idx] += Math.abs(m.quantity);
        }
      }
    }
  } else {
    // Monthly mode
    const partsDate = period.dateStr.split('-');
    const year = Number(partsDate[0]) || 2026;
    const month = Number(partsDate[1]) || 11;
    const daysInMonth = new Date(year, month, 0).getDate();

    barLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1));
    masukSeries = new Array(daysInMonth).fill(0);
    keluarSeries = new Array(daysInMonth).fill(0);

    for (const m of periodMovements) {
      const day = extractDayOfMonth(m.date);
      if (day !== null && day >= 1 && day <= daysInMonth) {
        if (m.quantity > 0) masukSeries[day - 1] += m.quantity;
        else keluarSeries[day - 1] += Math.abs(m.quantity);
      }
    }
  }

  // Stock Opname Calculations
  let totalSesiDisetujui = 0;
  let totalSesiMenunggu = 0;
  let totalSesiDitolak = 0;
  let totalPartDihitung = 0;
  let totalPartSelisih = 0;
  let totalPartLebih = 0;
  let totalPartKurang = 0;

  const stockOpnameRows: WarehouseStockOpnameRow[] = periodOpnames.map((so) => {
    if (so.status === 'disetujui') totalSesiDisetujui++;
    if (so.status === 'menunggu_persetujuan') totalSesiMenunggu++;
    if (so.status === 'ditolak') totalSesiDitolak++;

    let sesiSesuai = 0;
    let sesiLebih = 0;
    let sesiKurang = 0;

    for (const line of so.lines) {
      if (line.physicalQty !== null) {
        totalPartDihitung++;
        const v = line.varianceQty ?? 0;
        if (v === 0) {
          sesiSesuai++;
        } else if (v > 0) {
          sesiLebih++;
          totalPartSelisih++;
          totalPartLebih++;
        } else {
          sesiKurang++;
          totalPartSelisih++;
          totalPartKurang++;
        }
      }
    }

    return {
      kodeOpname: so.code,
      tanggalOpname: so.startedAt || so.createdAt,
      petugas: so.createdByName,
      jumlahPart: so.lines.length,
      partSesuai: sesiSesuai,
      partLebih: sesiLebih,
      partKurang: sesiKurang,
      status: so.status,
      disetujuiOleh: so.approvedByName || '-',
      tanggalPersetujuan: so.approvedAt || '-',
      sessionRef: so,
    };
  });

  return {
    period,
    periodLabel,
    kpis: {
      totalJenisPart: parts.length,
      partAmanCount,
      partKritisCount,
      partHoCount,
      totalStokTersedia,
      totalBarangMasuk,
      totalBarangKeluar,
      totalPermintaanPending: pendingRequestCount,
      totalPesananBelumSampai: orderBelumSampaiCount,
    },
    charts: {
      kondisiStokDoughnut: {
        aman: partAmanCount,
        kritis: partKritisCount,
        ho: partHoCount,
        total: parts.length,
      },
      komposisiMutasiDoughnut: {
        masuk: mutasiMasukQty,
        keluarWo: mutasiKeluarWoQty,
        keluarHo: mutasiKeluarHoQty,
        keluarPenjualan: mutasiKeluarPenjualanQty,
        koreksi: mutasiKoreksiQty,
        total: mutasiMasukQty + mutasiKeluarWoQty + mutasiKeluarHoQty + mutasiKeluarPenjualanQty + mutasiKoreksiQty,
      },
      pergerakanStokBarChart: {
        labels: barLabels,
        masukSeries,
        keluarSeries,
      },
    },
    tables: {
      partConditions,
      movements: movementRows,
      requests: requestRows,
      orders: orderRows,
    },
    stockOpname: {
      kpis: {
        totalSesiOpname: periodOpnames.length,
        totalSesiDisetujui,
        totalSesiMenunggu,
        totalPartDihitung,
        totalPartSelisih,
        totalPartLebih,
        totalPartKurang,
        totalSesiDitolak,
      },
      rows: stockOpnameRows,
    },
  };
}
