import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  type ServiceReportData,
  type SalesReportData,
  type WarehouseReportData,
} from './reportCalculations';
import { formatRupiah, nowTime, todayISO } from './format';
import type { AuditLog } from './auditTrail';
import { STOCK_OPNAME_STATUS_LABELS } from './stockOpname';

// Helper to sanitize filenames
function sanitizeFilename(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-]/g, '_');
}

// Helper to auto-fit Excel column widths
function fitColumnWidths(data: (string | number)[][]): { wch: number }[] {
  if (!data || data.length === 0) return [];
  const colCount = data[0].length;
  const colWidths: number[] = new Array(colCount).fill(10);

  for (const row of data) {
    row.forEach((val, colIdx) => {
      const len = val !== null && val !== undefined ? String(val).length : 0;
      if (len > colWidths[colIdx]) {
        colWidths[colIdx] = Math.min(45, Math.max(10, len + 2));
      }
    });
  }

  return colWidths.map((wch) => ({ wch }));
}

// ============================================================================
// EXCEL EXPORT FUNCTIONS
// ============================================================================

export function exportExcelServiceReport(data: ServiceReportData): void {
  const wb = XLSX.utils.book_new();

  // 1. Ringkasan Servis Sheet
  const kpiRows: (string | number)[][] = [
    ['LAPORAN OPERASIONAL SERVIS - MYBENGKEL'],
    ['Periode', data.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['METRIK UTAMA', 'NILAI'],
    ['Total Booking', data.kpis.totalBooking],
    ['Total Service Form Masuk', data.kpis.totalServiceForm],
    ['Total Work Order Masuk', data.kpis.totalWorkOrder],
    ['Work Order Berjalan', data.kpis.woBerjalan],
    ['Work Order Selesai', data.kpis.woSelesai],
    ['Work Order Batal', data.kpis.woBatal],
    ['Total Omzet Jasa (WO Selesai)', data.kpis.totalOmzetJasa],
    ['Total Nilai Part (WO Selesai)', data.kpis.totalNilaiPartSelesai],
    ['Total Pendapatan Servis', data.kpis.totalOmzetJasa + data.kpis.totalNilaiPartSelesai],
  ];
  const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpi['!cols'] = fitColumnWidths(kpiRows);
  XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan Servis');

  // 2. Data Work Order Sheet (Strictly 15 columns, NO vehicle year!)
  const woHeaders = [
    'Nomor WO',
    'Nama Konsumen',
    'Nomor HP',
    'Nomor Plat',
    'Nomor Mesin',
    'Nomor Rangka',
    'Tipe Motor',
    'Warna Motor',
    'Mekanik',
    'Tanggal Masuk',
    'Tanggal Selesai',
    'Status WO',
    'Total Jasa (Rp)',
    'Total Part (Rp)',
    'Total Servis (Rp)',
  ];
  const woRows: (string | number)[][] = [
    woHeaders,
    ...data.tables.mainWorkOrders.map((r) => [
      r.nomorWo,
      r.namaKonsumen,
      r.nomorHp,
      r.nomorPlat,
      r.nomorMesin,
      r.nomorRangka,
      r.tipeMotor,
      r.warnaMotor,
      r.mekanik,
      r.tanggalMasuk,
      r.tanggalSelesai,
      r.statusWo,
      r.totalJasa,
      r.totalPart,
      r.totalServis,
    ]),
  ];
  const wsWo = XLSX.utils.aoa_to_sheet(woRows);
  wsWo['!cols'] = fitColumnWidths(woRows);
  XLSX.utils.book_append_sheet(wb, wsWo, 'Data Work Order');

  // 3. Booking Sheet
  const bkgHeaders = [
    'Kode Booking',
    'Nama Konsumen',
    'Plat Nomor',
    'Layanan',
    'Tanggal',
    'Jam',
    'Status',
    'Sumber Booking',
  ];
  const bkgRows: (string | number)[][] = [
    bkgHeaders,
    ...data.tables.bookings.map((b) => [
      b.kodeBooking,
      b.namaKonsumen,
      b.platNomor,
      b.layanan,
      b.tanggal,
      b.jam,
      b.status,
      b.sumberBooking,
    ]),
  ];
  const wsBkg = XLSX.utils.aoa_to_sheet(bkgRows);
  wsBkg['!cols'] = fitColumnWidths(bkgRows);
  XLSX.utils.book_append_sheet(wb, wsBkg, 'Booking');

  // 4. Rincian Jasa Sheet
  const jasaHeaders = [
    'Nomor WO',
    'Nama Konsumen',
    'Nama Jasa',
    'Qty',
    'Harga Satuan (Rp)',
    'Subtotal (Rp)',
  ];
  const jasaRows: (string | number)[][] = [
    jasaHeaders,
    ...data.tables.jasaDetails.map((j) => [
      j.nomorWo,
      j.namaKonsumen,
      j.namaJasa,
      j.qty,
      j.hargaSatuan,
      j.subtotal,
    ]),
  ];
  const wsJasa = XLSX.utils.aoa_to_sheet(jasaRows);
  wsJasa['!cols'] = fitColumnWidths(jasaRows);
  XLSX.utils.book_append_sheet(wb, wsJasa, 'Rincian Jasa');

  // 5. Rincian Part WO Sheet
  const partHeaders = [
    'Nomor WO',
    'Nama Konsumen',
    'Kode Part',
    'Nama Part',
    'Qty',
    'Harga Satuan (Rp)',
    'Subtotal (Rp)',
  ];
  const partRows: (string | number)[][] = [
    partHeaders,
    ...data.tables.partDetails.map((p) => [
      p.nomorWo,
      p.namaKonsumen,
      p.kodePart,
      p.namaPart,
      p.qty,
      p.hargaSatuan,
      p.subtotal,
    ]),
  ];
  const wsPart = XLSX.utils.aoa_to_sheet(partRows);
  wsPart['!cols'] = fitColumnWidths(partRows);
  XLSX.utils.book_append_sheet(wb, wsPart, 'Rincian Part WO');

  // 6. Kinerja Mekanik Sheet
  const mechHeaders = [
    'Mekanik',
    'Jumlah WO Ditugaskan',
    'Estimasi Jam Kerja',
    'Jumlah WO Selesai',
    'Total Nilai Jasa (Rp)',
  ];
  const mechRows: (string | number)[][] = [
    mechHeaders,
    ...data.tables.mechanicPerformances.map((m) => [
      m.mekanik,
      m.jumlahWo,
      m.jamKerja,
      m.jumlahWoSelesai,
      m.totalNilaiJasa,
    ]),
  ];
  const wsMech = XLSX.utils.aoa_to_sheet(mechRows);
  wsMech['!cols'] = fitColumnWidths(mechRows);
  XLSX.utils.book_append_sheet(wb, wsMech, 'Kinerja Mekanik');

  const filename = `MyBengkel_Laporan_Servis_${sanitizeFilename(data.periodLabel)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportExcelSalesReport(data: SalesReportData): void {
  const wb = XLSX.utils.book_new();

  // 1. Ringkasan Penjualan Sheet
  const kpiRows: (string | number)[][] = [
    ['LAPORAN PENJUALAN PART - MYBENGKEL'],
    ['Periode', data.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['METRIK PENJUALAN', 'NILAI'],
    ['Total Omzet Part POS', data.kpis.totalOmzetPos],
    ['Total Nilai Part dari WO Selesai', data.kpis.totalNilaiPartWoSelesai],
    ['Total Penjualan Part Gabungan', data.kpis.totalPenjualanPartGabungan],
    ['Total Transaksi POS Dibayar', data.kpis.totalTransaksiPosDibayar],
    ['Total WO Selesai Menggunakan Part', data.kpis.totalWoSelesaiGunakanPart],
    ['Total Jumlah Part Terjual (pcs)', data.kpis.totalJumlahPartTerjual],
    ['Rata-rata Transaksi POS', data.kpis.rataRataTransaksiPos],
    ['Part Terlaris', `${data.kpis.partTerlarisNama} (${data.kpis.partTerlarisQty} pcs)`],
  ];
  const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpi['!cols'] = fitColumnWidths(kpiRows);
  XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan Penjualan');

  // 2. Penjualan POS Sheet
  const posHeaders = [
    'Kode Transaksi',
    'Tanggal Transaksi',
    'Nama Konsumen',
    'Kode Part',
    'Nama Part',
    'Jumlah',
    'Harga Satuan (Rp)',
    'Subtotal (Rp)',
    'Metode Pembayaran',
    'Status Pembayaran',
    'Nomor Referensi',
    'Kasir',
  ];
  const posRows: (string | number)[][] = [
    posHeaders,
    ...data.tables.posLines.map((p) => [
      p.kodeTransaksi,
      p.tanggalTransaksi,
      p.namaKonsumen,
      p.kodePart,
      p.namaPart,
      p.jumlah,
      p.hargaSatuan,
      p.subtotal,
      p.metodePembayaran,
      p.statusPembayaran,
      p.nomorReferensi,
      p.kasir,
    ]),
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posRows);
  wsPos['!cols'] = fitColumnWidths(posRows);
  XLSX.utils.book_append_sheet(wb, wsPos, 'Penjualan POS');

  // 3. Penjualan Part WO Sheet
  const woHeaders = [
    'Nomor WO',
    'Tanggal Selesai',
    'Nama Konsumen',
    'Plat Nomor',
    'Kode Part',
    'Nama Part',
    'Jumlah',
    'Harga Satuan (Rp)',
    'Subtotal (Rp)',
    'Mekanik',
    'Status WO',
  ];
  const woRows: (string | number)[][] = [
    woHeaders,
    ...data.tables.woPartLines.map((w) => [
      w.nomorWo,
      w.tanggalSelesai,
      w.namaKonsumen,
      w.platNomor,
      w.kodePart,
      w.namaPart,
      w.jumlah,
      w.hargaSatuan,
      w.subtotal,
      w.mekanik,
      w.statusWo,
    ]),
  ];
  const wsWo = XLSX.utils.aoa_to_sheet(woRows);
  wsWo['!cols'] = fitColumnWidths(woRows);
  XLSX.utils.book_append_sheet(wb, wsWo, 'Penjualan Part WO');

  // 4. Performa Part Sheet
  const perfHeaders = [
    'Kode Part',
    'Nama Part',
    'Satuan',
    'Total Qty Terjual',
    'Nilai Penjualan (Rp)',
    'Harga Beli Snapshot (Rp)',
    'Estimasi Margin (Rp)',
  ];
  const perfRows: (string | number)[][] = [
    perfHeaders,
    ...data.tables.partPerformances.map((p) => [
      p.kodePart,
      p.namaPart,
      p.satuan,
      p.totalQtyTerjual,
      p.nilaiPenjualan,
      p.hargaBeli,
      p.estimasiMargin,
    ]),
  ];
  const wsPerf = XLSX.utils.aoa_to_sheet(perfRows);
  wsPerf['!cols'] = fitColumnWidths(perfRows);
  XLSX.utils.book_append_sheet(wb, wsPerf, 'Performa Part');

  const filename = `MyBengkel_Laporan_Penjualan_${sanitizeFilename(data.periodLabel)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportExcelWarehouseReport(data: WarehouseReportData): void {
  const wb = XLSX.utils.book_new();

  // 1. Ringkasan Gudang Sheet
  const kpiRows: (string | number)[][] = [
    ['LAPORAN PENGELOLAAN GUDANG - MYBENGKEL'],
    ['Periode', data.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['METRIK GUDANG', 'NILAI'],
    ['Total Jenis Part', data.kpis.totalJenisPart],
    ['Total Part Aman', data.kpis.partAmanCount],
    ['Total Part Kritis', data.kpis.partKritisCount],
    ['Total Jenis Part HO', data.kpis.partHoCount],
    ['Total Qty Stok Tersedia', data.kpis.totalStokTersedia],
    ['Total Barang Masuk (pcs)', data.kpis.totalBarangMasuk],
    ['Total Barang Keluar (pcs)', data.kpis.totalBarangKeluar],
    ['Total Permintaan Pending', data.kpis.totalPermintaanPending],
    ['Total Pesanan Belum Sampai', data.kpis.totalPesananBelumSampai],
  ];
  const wsKpi = XLSX.utils.aoa_to_sheet(kpiRows);
  wsKpi['!cols'] = fitColumnWidths(kpiRows);
  XLSX.utils.book_append_sheet(wb, wsKpi, 'Ringkasan Gudang');

  // 2. Master Part Sheet
  const partHeaders = [
    'Kode Part',
    'Nama Part',
    'Satuan',
    'Stok Saat Ini',
    'Harga Beli (Rp)',
    'Harga Jual (Rp)',
    'Stok Minimum',
    'Jenis',
    'Status',
    'Tanggal Dibuat',
    'Tanggal Permintaan Terakhir',
    'Tanggal Terima Terakhir',
  ];
  const partRows: (string | number)[][] = [
    partHeaders,
    ...data.tables.partConditions.map((p) => [
      p.kodePart,
      p.namaPart,
      p.satuan,
      p.stok,
      p.hargaBeli,
      p.hargaJual,
      p.stokMinimum,
      p.jenis,
      p.status,
      p.tanggalDibuat,
      p.tanggalPermintaan,
      p.tanggalTerimaTerakhir,
    ]),
  ];
  const wsPart = XLSX.utils.aoa_to_sheet(partRows);
  wsPart['!cols'] = fitColumnWidths(partRows);
  XLSX.utils.book_append_sheet(wb, wsPart, 'Master Part');

  // 3. Mutasi Stok Sheet
  const movHeaders = [
    'Tanggal',
    'Kode Part',
    'Nama Part',
    'Jenis Mutasi',
    'Qty Masuk',
    'Qty Keluar',
    'Referensi Transaksi',
    'Sumber Mutasi',
    'Dicatat Oleh',
    'Catatan',
  ];
  const movRows: (string | number)[][] = [
    movHeaders,
    ...data.tables.movements.map((m) => [
      m.tanggal,
      m.kodePart,
      m.namaPart,
      m.jenisMutasi,
      m.qtyMasuk,
      m.qtyKeluar,
      m.referensiTransaksi,
      m.sumberMutasi,
      m.dicatatOleh,
      m.catatan,
    ]),
  ];
  const wsMov = XLSX.utils.aoa_to_sheet(movRows);
  wsMov['!cols'] = fitColumnWidths(movRows);
  XLSX.utils.book_append_sheet(wb, wsMov, 'Mutasi Stok');

  // 4. Permintaan Penyediaan Sheet
  const reqHeaders = [
    'Kode Permintaan',
    'Jenis Permintaan',
    'Pemohon',
    'Kode Part',
    'Nama Part',
    'Jumlah',
    'Status Part',
    'Status Permintaan',
    'Kode Pemesanan',
    'Tanggal Diajukan',
    'Tanggal Diterima',
    'Alasan',
  ];
  const reqRows: (string | number)[][] = [
    reqHeaders,
    ...data.tables.requests.map((r) => [
      r.kodePermintaan,
      r.jenisPermintaan,
      r.pemohon,
      r.kodePart,
      r.namaPart,
      r.jumlah,
      r.statusPart,
      r.statusPermintaan,
      r.kodePemesanan,
      r.tanggalDiajukan,
      r.tanggalDiterima,
      r.alasan,
    ]),
  ];
  const wsReq = XLSX.utils.aoa_to_sheet(reqRows);
  wsReq['!cols'] = fitColumnWidths(reqRows);
  XLSX.utils.book_append_sheet(wb, wsReq, 'Permintaan Penyediaan');

  // 5. Riwayat Pemesanan Sheet
  const ordHeaders = [
    'Kode Pemesanan',
    'Jenis',
    'Nama Pemohon',
    'Jumlah Part',
    'Status',
    'Tanggal Pesan',
    'Tanggal Sampai',
    'Tanggal Diproses',
    'Alasan Batal',
  ];
  const ordRows: (string | number)[][] = [
    ordHeaders,
    ...data.tables.orders.map((o) => [
      o.kodePemesanan,
      o.jenis,
      o.namaPemohon,
      o.jumlahPart,
      o.status,
      o.tanggalPesan,
      o.tanggalSampai,
      o.tanggalDiproses,
      o.alasanBatal,
    ]),
  ];
  const wsOrd = XLSX.utils.aoa_to_sheet(ordRows);
  wsOrd['!cols'] = fitColumnWidths(ordRows);
  XLSX.utils.book_append_sheet(wb, wsOrd, 'Riwayat Pemesanan');

  const filename = `MyBengkel_Laporan_Gudang_${sanitizeFilename(data.periodLabel)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Helper to build and append the 14 standard worksheets
function appendStandard14Sheets(
  wb: XLSX.WorkBook,
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData
): void {
  // 1. Servis - Ringkasan
  const kpiServiceRows = [
    ['RINGKASAN EKSEKUTIF SERVIS - MYBENGKEL'],
    ['Periode', serviceData.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['Total Booking', serviceData.kpis.totalBooking],
    ['Total Service Form Masuk', serviceData.kpis.totalServiceForm],
    ['Total Work Order Masuk', serviceData.kpis.totalWorkOrder],
    ['Work Order Berjalan', serviceData.kpis.woBerjalan],
    ['Work Order Selesai', serviceData.kpis.woSelesai],
    ['Work Order Batal', serviceData.kpis.woBatal],
    ['Omzet Jasa (Rp)', serviceData.kpis.totalOmzetJasa],
    ['Nilai Part WO Selesai (Rp)', serviceData.kpis.totalNilaiPartSelesai],
    ['Total Pendapatan Servis (Rp)', serviceData.kpis.totalOmzetJasa + serviceData.kpis.totalNilaiPartSelesai],
  ];
  const wsKpiS = XLSX.utils.aoa_to_sheet(kpiServiceRows);
  wsKpiS['!cols'] = fitColumnWidths(kpiServiceRows);
  XLSX.utils.book_append_sheet(wb, wsKpiS, 'Servis - Ringkasan');

  // 2. Servis - Data Work Order (15 columns, strictly NO vehicle year!)
  const woRows = [
    [
      'Nomor WO',
      'Nama Konsumen',
      'Nomor HP',
      'Nomor Plat',
      'Nomor Mesin',
      'Nomor Rangka',
      'Tipe Motor',
      'Warna Motor',
      'Mekanik',
      'Tanggal Masuk',
      'Tanggal Selesai',
      'Status WO',
      'Total Jasa',
      'Total Part',
      'Total Servis',
    ],
    ...serviceData.tables.mainWorkOrders.map((r) => [
      r.nomorWo,
      r.namaKonsumen,
      r.nomorHp,
      r.nomorPlat,
      r.nomorMesin,
      r.nomorRangka,
      r.tipeMotor,
      r.warnaMotor,
      r.mekanik,
      r.tanggalMasuk,
      r.tanggalSelesai,
      r.statusWo,
      r.totalJasa,
      r.totalPart,
      r.totalServis,
    ]),
  ];
  const wsWo = XLSX.utils.aoa_to_sheet(woRows);
  wsWo['!cols'] = fitColumnWidths(woRows);
  XLSX.utils.book_append_sheet(wb, wsWo, 'Servis - Data Work Order');

  // 3. Servis - Rincian Jasa
  const jasaRows = [
    ['Nomor WO', 'Nama Konsumen', 'Nama Jasa', 'Qty', 'Harga Satuan (Rp)', 'Subtotal (Rp)'],
    ...serviceData.tables.jasaDetails.map((j) => [
      j.nomorWo,
      j.namaKonsumen,
      j.namaJasa,
      j.qty,
      j.hargaSatuan,
      j.subtotal,
    ]),
  ];
  const wsJasa = XLSX.utils.aoa_to_sheet(jasaRows);
  wsJasa['!cols'] = fitColumnWidths(jasaRows);
  XLSX.utils.book_append_sheet(wb, wsJasa, 'Servis - Rincian Jasa');

  // 4. Servis - Rincian Part WO
  const partWoRows = [
    ['Nomor WO', 'Nama Konsumen', 'Kode Part', 'Nama Part', 'Qty', 'Harga Satuan (Rp)', 'Subtotal (Rp)'],
    ...serviceData.tables.partDetails.map((p) => [
      p.nomorWo,
      p.namaKonsumen,
      p.kodePart,
      p.namaPart,
      p.qty,
      p.hargaSatuan,
      p.subtotal,
    ]),
  ];
  const wsPartWo = XLSX.utils.aoa_to_sheet(partWoRows);
  wsPartWo['!cols'] = fitColumnWidths(partWoRows);
  XLSX.utils.book_append_sheet(wb, wsPartWo, 'Servis - Rincian Part WO');

  // 5. Penjualan - Ringkasan
  const kpiSalesRows = [
    ['RINGKASAN EKSEKUTIF PENJUALAN - MYBENGKEL'],
    ['Periode', salesData.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['Total Omzet POS (Rp)', salesData.kpis.totalOmzetPos],
    ['Nilai Part WO Selesai (Rp)', salesData.kpis.totalNilaiPartWoSelesai],
    ['Total Penjualan Part Gabungan (Rp)', salesData.kpis.totalPenjualanPartGabungan],
    ['Transaksi POS Dibayar', salesData.kpis.totalTransaksiPosDibayar],
    ['Total Part Terjual (pcs)', salesData.kpis.totalJumlahPartTerjual],
    ['Rata-rata Transaksi POS (Rp)', salesData.kpis.rataRataTransaksiPos],
    ['Part Terlaris', `${salesData.kpis.partTerlarisNama} (${salesData.kpis.partTerlarisQty} pcs)`],
  ];
  const wsKpiSales = XLSX.utils.aoa_to_sheet(kpiSalesRows);
  wsKpiSales['!cols'] = fitColumnWidths(kpiSalesRows);
  XLSX.utils.book_append_sheet(wb, wsKpiSales, 'Penjualan - Ringkasan');

  // 6. Penjualan - Kasir POS
  const posRows = [
    [
      'Kode Transaksi',
      'Tanggal',
      'Konsumen',
      'Kode Part',
      'Nama Part',
      'Qty',
      'Harga Satuan',
      'Subtotal',
      'Metode',
      'Status',
      'Referensi',
      'Kasir',
    ],
    ...salesData.tables.posLines.map((p) => [
      p.kodeTransaksi,
      p.tanggalTransaksi,
      p.namaKonsumen,
      p.kodePart,
      p.namaPart,
      p.jumlah,
      p.hargaSatuan,
      p.subtotal,
      p.metodePembayaran,
      p.statusPembayaran,
      p.nomorReferensi,
      p.kasir,
    ]),
  ];
  const wsPos = XLSX.utils.aoa_to_sheet(posRows);
  wsPos['!cols'] = fitColumnWidths(posRows);
  XLSX.utils.book_append_sheet(wb, wsPos, 'Penjualan - Kasir POS');

  // 7. Penjualan - Part WO
  const woPartRows = [
    [
      'Nomor WO',
      'Tanggal Selesai',
      'Konsumen',
      'Plat Nomor',
      'Kode Part',
      'Nama Part',
      'Qty',
      'Harga Satuan',
      'Subtotal',
      'Mekanik',
      'Status WO',
    ],
    ...salesData.tables.woPartLines.map((w) => [
      w.nomorWo,
      w.tanggalSelesai,
      w.namaKonsumen,
      w.platNomor,
      w.kodePart,
      w.namaPart,
      w.jumlah,
      w.hargaSatuan,
      w.subtotal,
      w.mekanik,
      w.statusWo,
    ]),
  ];
  const wsWoPart = XLSX.utils.aoa_to_sheet(woPartRows);
  wsWoPart['!cols'] = fitColumnWidths(woPartRows);
  XLSX.utils.book_append_sheet(wb, wsWoPart, 'Penjualan - Part WO');

  // 8. Penjualan - Performa Part
  const perfRows = [
    ['Kode Part', 'Nama Part', 'Satuan', 'Qty Terjual', 'Nilai Penjualan (Rp)', 'Harga Beli (Rp)', 'Estimasi Margin (Rp)'],
    ...salesData.tables.partPerformances.map((perf) => [
      perf.kodePart,
      perf.namaPart,
      perf.satuan,
      perf.totalQtyTerjual,
      perf.nilaiPenjualan,
      perf.hargaBeli,
      perf.estimasiMargin,
    ]),
  ];
  const wsPerf = XLSX.utils.aoa_to_sheet(perfRows);
  wsPerf['!cols'] = fitColumnWidths(perfRows);
  XLSX.utils.book_append_sheet(wb, wsPerf, 'Penjualan - Performa Part');

  // 9. Gudang - Ringkasan
  const kpiWhRows = [
    ['RINGKASAN EKSEKUTIF GUDANG - MYBENGKEL'],
    ['Periode', warehouseData.periodLabel],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    ['Total Jenis Part', warehouseData.kpis.totalJenisPart],
    ['Total Part Aman', warehouseData.kpis.partAmanCount],
    ['Total Part Kritis', warehouseData.kpis.partKritisCount],
    ['Total Part HO', warehouseData.kpis.partHoCount],
    ['Total Qty Stok Tersedia', warehouseData.kpis.totalStokTersedia],
    ['Barang Masuk (pcs)', warehouseData.kpis.totalBarangMasuk],
    ['Barang Keluar (pcs)', warehouseData.kpis.totalBarangKeluar],
    ['Permintaan Pending', warehouseData.kpis.totalPermintaanPending],
    ['Pesanan Belum Sampai', warehouseData.kpis.totalPesananBelumSampai],
  ];
  const wsKpiWh = XLSX.utils.aoa_to_sheet(kpiWhRows);
  wsKpiWh['!cols'] = fitColumnWidths(kpiWhRows);
  XLSX.utils.book_append_sheet(wb, wsKpiWh, 'Gudang - Ringkasan');

  // 10. Gudang - Master Part
  const partRows = [
    [
      'Kode Part',
      'Nama Part',
      'Satuan',
      'Stok',
      'Harga Beli',
      'Harga Jual',
      'Min Stok',
      'Jenis',
      'Status',
      'Tanggal Dibuat',
    ],
    ...warehouseData.tables.partConditions.map((p) => [
      p.kodePart,
      p.namaPart,
      p.satuan,
      p.stok,
      p.hargaBeli,
      p.hargaJual,
      p.stokMinimum,
      p.jenis.toUpperCase(),
      p.status,
      p.tanggalDibuat,
    ]),
  ];
  const wsParts = XLSX.utils.aoa_to_sheet(partRows);
  wsParts['!cols'] = fitColumnWidths(partRows);
  XLSX.utils.book_append_sheet(wb, wsParts, 'Gudang - Master Part');

  // 11. Gudang - Mutasi Stok
  const movRows = [
    [
      'Tanggal',
      'Kode Part',
      'Nama Part',
      'Jenis Mutasi',
      'Qty Masuk',
      'Qty Keluar',
      'Referensi Transaksi',
      'Sumber Mutasi',
      'Dicatat Oleh',
      'Catatan',
    ],
    ...warehouseData.tables.movements.map((m) => [
      m.tanggal,
      m.kodePart,
      m.namaPart,
      m.jenisMutasi,
      m.qtyMasuk,
      m.qtyKeluar,
      m.referensiTransaksi,
      m.sumberMutasi,
      m.dicatatOleh,
      m.catatan,
    ]),
  ];
  const wsMov = XLSX.utils.aoa_to_sheet(movRows);
  wsMov['!cols'] = fitColumnWidths(movRows);
  XLSX.utils.book_append_sheet(wb, wsMov, 'Gudang - Mutasi Stok');

  // 12. Gudang - Permintaan Part
  const reqRows = [
    [
      'Kode Permintaan',
      'Jenis Permintaan',
      'Pemohon',
      'Kode Part',
      'Nama Part',
      'Jumlah',
      'Status Part',
      'Status Permintaan',
      'Kode Pemesanan',
      'Tanggal Diajukan',
      'Tanggal Diterima',
      'Alasan',
    ],
    ...warehouseData.tables.requests.map((r) => [
      r.kodePermintaan,
      r.jenisPermintaan,
      r.pemohon,
      r.kodePart,
      r.namaPart,
      r.jumlah,
      r.statusPart,
      r.statusPermintaan,
      r.kodePemesanan,
      r.tanggalDiajukan,
      r.tanggalDiterima,
      r.alasan,
    ]),
  ];
  const wsReq = XLSX.utils.aoa_to_sheet(reqRows);
  wsReq['!cols'] = fitColumnWidths(reqRows);
  XLSX.utils.book_append_sheet(wb, wsReq, 'Gudang - Permintaan Part');

  // 13. Gudang - Riwayat Pesanan
  const ordRows = [
    [
      'Kode Pemesanan',
      'Jenis',
      'Nama Pemohon',
      'Jumlah Part',
      'Status',
      'Tanggal Pesan',
      'Tanggal Sampai',
      'Tanggal Diproses',
      'Alasan Batal',
    ],
    ...warehouseData.tables.orders.map((o) => [
      o.kodePemesanan,
      o.jenis,
      o.namaPemohon,
      o.jumlahPart,
      o.status,
      o.tanggalPesan,
      o.tanggalSampai,
      o.tanggalDiproses,
      o.alasanBatal,
    ]),
  ];
  const wsOrd = XLSX.utils.aoa_to_sheet(ordRows);
  wsOrd['!cols'] = fitColumnWidths(ordRows);
  XLSX.utils.book_append_sheet(wb, wsOrd, 'Gudang - Riwayat Pesanan');

  // 14. Gudang - Stok Opname
  const opnameRows = [
    [
      'Kode Opname',
      'Tanggal Opname',
      'Petugas',
      'Total Part',
      'Part Sesuai',
      'Part Lebih',
      'Part Kurang',
      'Status',
      'Disetujui Oleh',
      'Tanggal Persetujuan',
    ],
    ...warehouseData.stockOpname.rows.map((so) => [
      so.kodeOpname,
      so.tanggalOpname,
      so.petugas,
      so.jumlahPart,
      so.partSesuai,
      so.partLebih,
      so.partKurang,
      STOCK_OPNAME_STATUS_LABELS[so.status] || so.status,
      so.disetujuiOleh,
      so.tanggalPersetujuan,
    ]),
  ];
  const wsOpname = XLSX.utils.aoa_to_sheet(opnameRows);
  wsOpname['!cols'] = fitColumnWidths(opnameRows);
  XLSX.utils.book_append_sheet(wb, wsOpname, 'Gudang - Stok Opname');
}

// Helper to create an audit worksheet
function createAuditSheet(
  logs: AuditLog[],
  title: string
): XLSX.WorkSheet {
  const headers = [
    'ID Log',
    'Waktu',
    'Pelaku',
    'ID Pelaku',
    'Role Pelaku',
    'Kategori',
    'Modul',
    'Event',
    'Aksi',
    'Tipe Entitas',
    'ID Entitas',
    'Data Sebelum',
    'Data Sesudah',
    'Alasan',
    'Referensi',
    'Status',
    'Request ID',
  ];

  const rows: (string | number)[][] = [
    [title.toUpperCase()],
    ['Jumlah Catatan', logs.length],
    ['Dicetak Pada', `${todayISO()} ${nowTime()}`],
    [],
    headers,
    ...(logs.length > 0
      ? logs.map((l) => [
          l.id,
          l.occurredAt,
          l.actorName,
          l.actorId,
          l.actorRole,
          l.category,
          l.module,
          l.event,
          l.action,
          l.entityType,
          l.entityId,
          l.beforeData ? JSON.stringify(l.beforeData) : '-',
          l.afterData ? JSON.stringify(l.afterData) : '-',
          l.reason || '-',
          l.reference || '-',
          l.outcome,
          l.requestId || '-',
        ])
      : [['Tidak ada riwayat aktivitas pada kategori ini.']]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = fitColumnWidths(rows);
  return ws;
}

export function exportExcelAllReports(
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData
): void {
  const wb = XLSX.utils.book_new();

  // Append standard 14 sheets (Admin Export)
  appendStandard14Sheets(wb, serviceData, salesData, warehouseData);

  const filename = `MyBengkel_Laporan_Lengkap_${sanitizeFilename(serviceData.periodLabel)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

export function exportExcelMasterAdminReports(
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData,
  auditLogs: AuditLog[],
  auditPeriodLabel: string
): void {
  const wb = XLSX.utils.book_new();

  // 1-14. Standard Reports
  appendStandard14Sheets(wb, serviceData, salesData, warehouseData);

  // 15-30. Complete Historical Activity Worksheets (Master Admin Exclusive)
  // 15. Riwayat Aktivitas Admin (All logs)
  const ws15 = createAuditSheet(auditLogs, `Riwayat Aktivitas Admin - ${auditPeriodLabel}`);
  XLSX.utils.book_append_sheet(wb, ws15, 'Audit - Semua Aktivitas');

  // 16. Riwayat Login Logout
  const authLogs = auditLogs.filter((l) => l.module === 'auth');
  const ws16 = createAuditSheet(authLogs, 'Riwayat Login & Logout Pengguna');
  XLSX.utils.book_append_sheet(wb, ws16, 'Audit - Login Logout');

  // 17. Riwayat Booking
  const bookingLogs = auditLogs.filter((l) => l.module === 'booking');
  const ws17 = createAuditSheet(bookingLogs, 'Riwayat Operasional Booking & Antrean');
  XLSX.utils.book_append_sheet(wb, ws17, 'Audit - Booking');

  // 18. Riwayat Service Form
  const sfLogs = auditLogs.filter((l) => l.module === 'service_form');
  const ws18 = createAuditSheet(sfLogs, 'Riwayat Pembuatan & Modifikasi Service Form');
  XLSX.utils.book_append_sheet(wb, ws18, 'Audit - Service Form');

  // 19. Riwayat Work Order
  const woLogs = auditLogs.filter((l) => l.module === 'work_order');
  const ws19 = createAuditSheet(woLogs, 'Riwayat Eksekusi Work Order');
  XLSX.utils.book_append_sheet(wb, ws19, 'Audit - Work Order');

  // 20. Riwayat Absen Mekanik
  const absenLogs = auditLogs.filter((l) => l.module === 'absen_mekanik');
  const ws20 = createAuditSheet(absenLogs, 'Riwayat Absensi & Kehadiran Mekanik');
  XLSX.utils.book_append_sheet(wb, ws20, 'Audit - Absen Mekanik');

  // 21. Riwayat Gudang
  const whLogs = auditLogs.filter((l) => l.module === 'gudang');
  const ws21 = createAuditSheet(whLogs, 'Riwayat Aktivitas Pengelolaan Gudang');
  XLSX.utils.book_append_sheet(wb, ws21, 'Audit - Gudang');

  // 22. Riwayat Mutasi Stok
  const mutasiLogs = auditLogs.filter(
    (l) =>
      l.entityType === 'stock_movement' ||
      l.action.toLowerCase().includes('stock') ||
      l.action.toLowerCase().includes('mutasi') ||
      l.event.toLowerCase().includes('stock')
  );
  const ws22 = createAuditSheet(mutasiLogs, 'Riwayat Mutasi & Pergerakan Stok');
  XLSX.utils.book_append_sheet(wb, ws22, 'Audit - Mutasi Stok');

  // 23. Riwayat Penjualan POS
  const posLogs = auditLogs.filter((l) => l.module === 'pos');
  const ws23 = createAuditSheet(posLogs, 'Riwayat Transaksi Penjualan Kasir POS');
  XLSX.utils.book_append_sheet(wb, ws23, 'Audit - Penjualan POS');

  // 24. Riwayat Penjualan WO
  const woPartLogs = auditLogs.filter((l) => l.module === 'wo_part');
  const ws24 = createAuditSheet(woPartLogs, 'Riwayat Alokasi Part Work Order');
  XLSX.utils.book_append_sheet(wb, ws24, 'Audit - Penjualan WO');

  // 25. Riwayat Purchase Request
  const prLogs = auditLogs.filter(
    (l) =>
      l.entityType === 'purchase_request' ||
      l.action.toLowerCase().includes('order') ||
      l.action.toLowerCase().includes('request') ||
      l.event.toLowerCase().includes('request')
  );
  const ws25 = createAuditSheet(prLogs, 'Riwayat Permintaan Penyediaan Part');
  XLSX.utils.book_append_sheet(wb, ws25, 'Audit - Purchase Request');

  // 26. Riwayat Persetujuan
  const persetujuanLogs = auditLogs.filter(
    (l) =>
      l.module === 'persetujuan' ||
      l.action.toLowerCase().includes('setuj') ||
      l.action.toLowerCase().includes('tolak') ||
      l.event.toLowerCase().includes('approve')
  );
  const ws26 = createAuditSheet(persetujuanLogs, 'Riwayat Otorisasi & Persetujuan');
  XLSX.utils.book_append_sheet(wb, ws26, 'Audit - Persetujuan');

  // 27. Riwayat Stok Opname
  const opnameLogs = auditLogs.filter((l) => l.module === 'stock_opname');
  const ws27 = createAuditSheet(opnameLogs, 'Riwayat Sesi & Persetujuan Stok Opname');
  XLSX.utils.book_append_sheet(wb, ws27, 'Audit - Stok Opname');

  // 28. Riwayat Input Manual
  const inputManualLogs = auditLogs.filter((l) => l.module === 'input_manual');
  const ws28 = createAuditSheet(inputManualLogs, 'Riwayat Penyesuaian Input Manual');
  XLSX.utils.book_append_sheet(wb, ws28, 'Audit - Input Manual');

  // 29. Riwayat Help Desk
  const helpdeskLogs = auditLogs.filter((l) => l.module === 'helpdesk');
  const ws29 = createAuditSheet(helpdeskLogs, 'Riwayat Bantuan & Help Desk');
  XLSX.utils.book_append_sheet(wb, ws29, 'Audit - Help Desk');

  // 30. Riwayat Export
  const exportLogs = auditLogs.filter(
    (l) =>
      l.module === 'laporan' ||
      l.action.toLowerCase().includes('export') ||
      l.event.toLowerCase().includes('export')
  );
  const ws30 = createAuditSheet(exportLogs, 'Riwayat Ekspor Laporan & Dokumen');
  XLSX.utils.book_append_sheet(wb, ws30, 'Audit - Riwayat Export');

  const filename = `MyBengkel_Laporan_MasterAdmin_${sanitizeFilename(serviceData.periodLabel)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// ============================================================================
// PDF EXPORT FUNCTIONS (VECTORED PDF WITH JSPDF & AUTOTABLE)
// ============================================================================

function addPdfHeader(
  doc: jsPDF,
  categoryTitle: string,
  periodLabel: string
): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 34, 48); // #1E2230
  doc.text('MYBENGKEL', 14, 15);

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 100, 176); // #1A64B0
  doc.text(categoryTitle.toUpperCase(), 14, 22);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 107, 124); // #646B7C
  doc.text(`Periode Laporan: ${periodLabel}`, 14, 28);
  doc.text(`Waktu Cetak: ${todayISO()} ${nowTime()} WIB`, 14, 33);

  doc.setDrawColor(220, 224, 232);
  doc.line(14, 36, doc.internal.pageSize.getWidth() - 14, 36);

  return 42;
}

function addPdfFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(240, 240, 240);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(140, 140, 140);
    doc.text('MyBengkel Management System - Dokumen Laporan Resmi', 14, pageHeight - 7);
    doc.text(
      `Halaman ${i} dari ${pageCount}`,
      pageWidth - 14,
      pageHeight - 7,
      { align: 'right' }
    );
  }
}

export function exportPdfServiceReport(data: ServiceReportData): void {
  // A4 Landscape for detailed table width
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addPdfHeader(doc, 'Laporan Operasional Servis', data.periodLabel);

  // Summary Metrics Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RINGKASAN EKSEKUTIF', 14, startY);

  const kpiText = [
    `Total Booking: ${data.kpis.totalBooking}`,
    `Total Work Order: ${data.kpis.totalWorkOrder} (Selesai: ${data.kpis.woSelesai}, Berjalan: ${data.kpis.woBerjalan}, Batal: ${data.kpis.woBatal})`,
    `Total Omzet Jasa (WO Selesai): ${formatRupiah(data.kpis.totalOmzetJasa)}`,
    `Total Nilai Part WO Selesai: ${formatRupiah(data.kpis.totalNilaiPartSelesai)}`,
    `Total Nilai Servis Gabungan: ${formatRupiah(data.kpis.totalOmzetJasa + data.kpis.totalNilaiPartSelesai)}`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  let curY = startY + 5;
  kpiText.forEach((t) => {
    doc.text(`• ${t}`, 16, curY);
    curY += 4.5;
  });

  // Table 1: Main Data Work Order (15 columns, strictly NO vehicle year!)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('DATA WORK ORDER', 14, curY + 4);

  const woTableRows = data.tables.mainWorkOrders.map((r) => [
    r.nomorWo,
    r.namaKonsumen,
    r.nomorHp,
    r.nomorPlat,
    r.nomorMesin,
    r.nomorRangka,
    r.tipeMotor,
    r.warnaMotor,
    r.mekanik,
    r.tanggalMasuk,
    r.tanggalSelesai,
    r.statusWo,
    formatRupiah(r.totalJasa),
    formatRupiah(r.totalPart),
    formatRupiah(r.totalServis),
  ]);

  autoTable(doc, {
    startY: curY + 7,
    head: [[
      'No. WO',
      'Konsumen',
      'No. HP',
      'No. Plat',
      'No. Mesin',
      'No. Rangka',
      'Tipe Motor',
      'Warna',
      'Mekanik',
      'Tgl Masuk',
      'Tgl Selesai',
      'Status',
      'Jasa',
      'Part',
      'Total',
    ]],
    body: woTableRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Booking Table
  const finalY1 = (doc as any).lastAutoTable.finalY + 10;
  if (finalY1 > 170) doc.addPage();

  const nextY1 = finalY1 > 170 ? 20 : finalY1;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('BOOKING DAN KEDATANGAN', 14, nextY1);

  const bkgRows = data.tables.bookings.map((b) => [
    b.kodeBooking,
    b.namaKonsumen,
    b.platNomor,
    b.layanan,
    b.tanggal,
    b.jam,
    b.status,
    b.sumberBooking,
  ]);

  autoTable(doc, {
    startY: nextY1 + 3,
    head: [['Kode', 'Konsumen', 'Plat', 'Layanan', 'Tanggal', 'Jam', 'Status', 'Sumber']],
    body: bkgRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 50, 70], textColor: [255, 255, 255] },
  });

  addPdfFooter(doc);
  doc.save(`MyBengkel_Laporan_Servis_${sanitizeFilename(data.periodLabel)}.pdf`);
}

export function exportPdfSalesReport(data: SalesReportData): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addPdfHeader(doc, 'Laporan Penjualan Sparepart', data.periodLabel);

  // Summary Metrics Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RINGKASAN EKSEKUTIF PENJUALAN', 14, startY);

  const kpiText = [
    `Total Omzet Part Kasir POS: ${formatRupiah(data.kpis.totalOmzetPos)} (${data.kpis.totalTransaksiPosDibayar} transaksi lunas)`,
    `Total Nilai Part WO Selesai: ${formatRupiah(data.kpis.totalNilaiPartWoSelesai)} (${data.kpis.totalWoSelesaiGunakanPart} work order)`,
    `Total Penjualan Part Gabungan: ${formatRupiah(data.kpis.totalPenjualanPartGabungan)}`,
    `Total Jumlah Part Terjual: ${data.kpis.totalJumlahPartTerjual} pcs`,
    `Rata-rata Transaksi POS: ${formatRupiah(data.kpis.rataRataTransaksiPos)}`,
    `Part Terlaris: ${data.kpis.partTerlarisNama} (${data.kpis.partTerlarisQty} pcs)`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  let curY = startY + 5;
  kpiText.forEach((t) => {
    doc.text(`• ${t}`, 16, curY);
    curY += 4.5;
  });

  // Table 1: Penjualan Part Konsumen (POS)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('PENJUALAN PART KONSUMEN (KASIR POS)', 14, curY + 4);

  const posRows = data.tables.posLines.map((p) => [
    p.kodeTransaksi,
    p.tanggalTransaksi,
    p.namaKonsumen,
    p.kodePart,
    p.namaPart,
    p.jumlah,
    formatRupiah(p.hargaSatuan),
    formatRupiah(p.subtotal),
    p.metodePembayaran,
    p.kasir,
  ]);

  autoTable(doc, {
    startY: curY + 7,
    head: [[
      'No. Transaksi',
      'Tanggal',
      'Konsumen',
      'Kode Part',
      'Nama Part',
      'Qty',
      'Harga',
      'Subtotal',
      'Metode',
      'Kasir',
    ]],
    body: posRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });

  // Table 2: Penjualan Part WO
  const finalY1 = (doc as any).lastAutoTable.finalY + 10;
  if (finalY1 > 165) doc.addPage();
  const nextY1 = finalY1 > 165 ? 20 : finalY1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('PENJUALAN PART DARI WORK ORDER SELESAI', 14, nextY1);

  const woRows = data.tables.woPartLines.map((w) => [
    w.nomorWo,
    w.tanggalSelesai,
    w.namaKonsumen,
    w.platNomor,
    w.kodePart,
    w.namaPart,
    w.jumlah,
    formatRupiah(w.hargaSatuan),
    formatRupiah(w.subtotal),
    w.mekanik,
  ]);

  autoTable(doc, {
    startY: nextY1 + 3,
    head: [[
      'No. WO',
      'Tgl Selesai',
      'Konsumen',
      'Plat',
      'Kode Part',
      'Nama Part',
      'Qty',
      'Harga',
      'Subtotal',
      'Mekanik',
    ]],
    body: woRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 50, 70], textColor: [255, 255, 255] },
  });

  addPdfFooter(doc);
  doc.save(`MyBengkel_Laporan_Penjualan_${sanitizeFilename(data.periodLabel)}.pdf`);
}

export function exportPdfWarehouseReport(data: WarehouseReportData): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const startY = addPdfHeader(doc, 'Laporan Pengelolaan Gudang', data.periodLabel);

  // Summary Metrics Box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RINGKASAN EKSEKUTIF GUDANG', 14, startY);

  const kpiText = [
    `Total Jenis Part: ${data.kpis.totalJenisPart} (Aman: ${data.kpis.partAmanCount}, Kritis: ${data.kpis.partKritisCount}, HO: ${data.kpis.partHoCount})`,
    `Total Qty Stok Tersedia: ${data.kpis.totalStokTersedia} pcs`,
    `Mutasi Barang Periode Ini: Masuk ${data.kpis.totalBarangMasuk} pcs, Keluar ${data.kpis.totalBarangKeluar} pcs`,
    `Permintaan Penyediaan Pending: ${data.kpis.totalPermintaanPending}`,
    `Pesanan Belum Sampai: ${data.kpis.totalPesananBelumSampai}`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  let curY = startY + 5;
  kpiText.forEach((t) => {
    doc.text(`• ${t}`, 16, curY);
    curY += 4.5;
  });

  // Table 1: Master Part
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('SELURUH DATA PART GUDANG', 14, curY + 4);

  const partRows = data.tables.partConditions.map((p) => [
    p.kodePart,
    p.namaPart,
    p.satuan,
    p.stok,
    formatRupiah(p.hargaBeli),
    formatRupiah(p.hargaJual),
    p.stokMinimum,
    p.jenis.toUpperCase(),
    p.status,
    p.tanggalDibuat,
  ]);

  autoTable(doc, {
    startY: curY + 7,
    head: [[
      'Kode Part',
      'Nama Part',
      'Satuan',
      'Stok',
      'Harga Beli',
      'Harga Jual',
      'Min Stok',
      'Jenis',
      'Status',
      'Tgl Dibuat',
    ]],
    body: partRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });

  // Table 2: Mutasi Stok
  const finalY1 = (doc as any).lastAutoTable.finalY + 10;
  if (finalY1 > 165) doc.addPage();
  const nextY1 = finalY1 > 165 ? 20 : finalY1;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RIWAYAT PERGERAKAN STOK', 14, nextY1);

  const movRows = data.tables.movements.map((m) => [
    m.tanggal,
    m.kodePart,
    m.namaPart,
    m.jenisMutasi,
    m.qtyMasuk > 0 ? m.qtyMasuk : '-',
    m.qtyKeluar > 0 ? m.qtyKeluar : '-',
    m.referensiTransaksi,
    m.sumberMutasi,
  ]);

  autoTable(doc, {
    startY: nextY1 + 3,
    head: [['Tanggal', 'Kode Part', 'Nama Part', 'Jenis', 'Masuk', 'Keluar', 'Referensi', 'Sumber']],
    body: movRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 50, 70], textColor: [255, 255, 255] },
  });

  addPdfFooter(doc);
  doc.save(`MyBengkel_Laporan_Gudang_${sanitizeFilename(data.periodLabel)}.pdf`);
}

// Helper to add the 5 standard report sections to PDF
function addStandardPdfSections(
  doc: jsPDF,
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData
): void {
  // 1. Service Section
  const startY1 = addPdfHeader(
    doc,
    'Laporan Terintegrasi - Bagian 1: Operasional Servis',
    serviceData.periodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('DATA WORK ORDER SERVIS', 14, startY1);

  const woRows = serviceData.tables.mainWorkOrders.map((r) => [
    r.nomorWo,
    r.namaKonsumen,
    r.nomorHp,
    r.nomorPlat,
    r.tipeMotor,
    r.warnaMotor,
    r.mekanik,
    r.tanggalMasuk,
    r.tanggalSelesai,
    r.statusWo,
    formatRupiah(r.totalServis),
  ]);

  autoTable(doc, {
    startY: startY1 + 3,
    head: [['No. WO', 'Konsumen', 'HP', 'Plat', 'Tipe', 'Warna', 'Mekanik', 'Masuk', 'Selesai', 'Status', 'Total']],
    body: woRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });

  // 2. Sales Section (New page)
  doc.addPage();
  const startY2 = addPdfHeader(
    doc,
    'Laporan Terintegrasi - Bagian 2: Penjualan Sparepart',
    salesData.periodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('PENJUALAN PART KASIR POS & WORK ORDER', 14, startY2);

  const posRows = salesData.tables.posLines.map((p) => [
    p.kodeTransaksi,
    p.tanggalTransaksi,
    p.namaKonsumen,
    p.kodePart,
    p.namaPart,
    p.jumlah,
    formatRupiah(p.subtotal),
    p.metodePembayaran,
    p.kasir,
  ]);

  autoTable(doc, {
    startY: startY2 + 3,
    head: [['No. Transaksi', 'Tanggal', 'Konsumen', 'Kode', 'Nama Part', 'Qty', 'Subtotal', 'Metode', 'Kasir']],
    body: posRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });

  // 3. Warehouse Section (New page)
  doc.addPage();
  const startY3 = addPdfHeader(
    doc,
    'Laporan Terintegrasi - Bagian 3: Gudang & Mutasi Stok',
    warehouseData.periodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('KONDISI MASTER PART GUDANG', 14, startY3);

  const partRows = warehouseData.tables.partConditions.map((p) => [
    p.kodePart,
    p.namaPart,
    p.satuan,
    p.stok,
    formatRupiah(p.hargaJual),
    p.stokMinimum,
    p.jenis.toUpperCase(),
    p.status,
  ]);

  autoTable(doc, {
    startY: startY3 + 3,
    head: [['Kode Part', 'Nama Part', 'Satuan', 'Stok', 'Harga Jual', 'Min Stok', 'Jenis', 'Status']],
    body: partRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });

  // 4. Warehouse Requests & Orders (New page)
  doc.addPage();
  const startY4 = addPdfHeader(
    doc,
    'Laporan Terintegrasi - Bagian 4: Pengadaan & Pemesanan Part',
    warehouseData.periodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('PERMINTAAN PENYEDIAAN PART', 14, startY4);

  const reqRows = warehouseData.tables.requests.map((r) => [
    r.kodePermintaan,
    r.jenisPermintaan,
    r.pemohon,
    r.kodePart,
    r.namaPart,
    r.jumlah,
    r.statusPart,
    r.statusPermintaan,
    r.tanggalDiajukan,
  ]);

  autoTable(doc, {
    startY: startY4 + 3,
    head: [['Kode Req', 'Jenis', 'Pemohon', 'Kode Part', 'Nama Part', 'Qty', 'Status Part', 'Status Req', 'Tgl Ajukan']],
    body: reqRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [40, 50, 70], textColor: [255, 255, 255] },
  });

  // 5. Stock Opname Section (New page)
  doc.addPage();
  const startY5 = addPdfHeader(
    doc,
    'Laporan Terintegrasi - Bagian 5: Audit Stok Opname',
    warehouseData.periodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RIWAYAT SESI AUDIT STOK OPNAME', 14, startY5);

  const soRows = warehouseData.stockOpname.rows.map((s) => [
    s.kodeOpname,
    s.tanggalOpname,
    s.petugas,
    s.jumlahPart,
    s.partSesuai,
    s.partLebih,
    s.partKurang,
    STOCK_OPNAME_STATUS_LABELS[s.status] || s.status,
    s.disetujuiOleh,
  ]);

  autoTable(doc, {
    startY: startY5 + 3,
    head: [['Kode Opname', 'Tgl Opname', 'Petugas', 'Total Part', 'Sesuai', 'Lebih', 'Kurang', 'Status', 'Disetujui Oleh']],
    body: soRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [26, 100, 176], textColor: [255, 255, 255] },
  });
}

// Helper to add an audit section to PDF
function addPdfAuditSection(
  doc: jsPDF,
  sectionNum: number,
  title: string,
  periodLabel: string,
  logs: AuditLog[]
): void {
  doc.addPage();
  const startY = addPdfHeader(
    doc,
    `Audit Master Admin - Bagian ${sectionNum}: ${title}`,
    periodLabel
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text(`CATATAN AUDIT: ${title.toUpperCase()} (${logs.length} entri)`, 14, startY);

  const rows =
    logs.length > 0
      ? logs.map((l) => [
          l.occurredAt,
          `${l.actorName} (${l.actorId})`,
          l.actorRole,
          l.module,
          l.action,
          l.reference || '-',
          l.outcome.toUpperCase(),
        ])
      : [['-', '-', '-', '-', 'Tidak ada riwayat aktivitas pada kategori ini.', '-', '-']];

  autoTable(doc, {
    startY: startY + 3,
    head: [['Waktu', 'Pelaku', 'Role', 'Modul', 'Aktivitas / Aksi', 'Referensi', 'Status']],
    body: rows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] },
  });
}

export function exportPdfAllReports(
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // 5 Standard Report Sections (Admin Export)
  addStandardPdfSections(doc, serviceData, salesData, warehouseData);

  addPdfFooter(doc);
  doc.save(`MyBengkel_Laporan_Lengkap_${sanitizeFilename(serviceData.periodLabel)}.pdf`);
}

export function exportPdfMasterAdminReports(
  serviceData: ServiceReportData,
  salesData: SalesReportData,
  warehouseData: WarehouseReportData,
  auditLogs: AuditLog[],
  auditPeriodLabel: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // 1 to 5: Standard Sections
  addStandardPdfSections(doc, serviceData, salesData, warehouseData);

  // 6 to 14: Audit Sections (9 sections)
  // 6. Ringkasan Aktivitas Master Admin
  doc.addPage();
  const startY6 = addPdfHeader(
    doc,
    'Audit Master Admin - Bagian 6: Ringkasan Aktivitas Admin',
    auditPeriodLabel
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 34, 48);
  doc.text('RINGKASAN METRIK AUDIT TRAIL', 14, startY6);

  const bisnisCount = auditLogs.filter((l) => l.category === 'bisnis').length;
  const aksesCount = auditLogs.filter((l) => l.category === 'akses').length;
  const successCount = auditLogs.filter((l) => l.outcome === 'berhasil').length;

  const kpis = [
    `Total Catatan Aktivitas: ${auditLogs.length}`,
    `Log Transaksi Bisnis: ${bisnisCount}`,
    `Log Akses & Otentikasi: ${aksesCount}`,
    `Operasi Sukses: ${successCount} / ${auditLogs.length}`,
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  let curY = startY6 + 5;
  kpis.forEach((k) => {
    doc.text(`• ${k}`, 16, curY);
    curY += 4.5;
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(30, 34, 48);
  doc.text('15 AKTIVITAS TERAKHIR SISTEM', 14, curY + 4);

  const recentRows = auditLogs.slice(0, 15).map((l) => [
    l.occurredAt,
    `${l.actorName} (${l.actorId})`,
    l.module,
    l.action,
    l.reference || '-',
    l.outcome.toUpperCase(),
  ]);

  autoTable(doc, {
    startY: curY + 7,
    head: [['Waktu', 'Pelaku', 'Modul', 'Aktivitas', 'Referensi', 'Status']],
    body: recentRows,
    theme: 'grid',
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
  });

  // 7. Riwayat Akses & Otentikasi
  addPdfAuditSection(
    doc,
    7,
    'Riwayat Akses & Otentikasi',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'auth')
  );

  // 8. Riwayat Operasional Servis & Booking
  addPdfAuditSection(
    doc,
    8,
    'Riwayat Operasional Servis & Form',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'booking' || l.module === 'service_form' || l.module === 'work_order')
  );

  // 9. Riwayat Gudang & Mutasi Stok
  addPdfAuditSection(
    doc,
    9,
    'Riwayat Gudang & Mutasi Stok',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'gudang' || l.entityType === 'stock_movement')
  );

  // 10. Riwayat Transaksi Penjualan
  addPdfAuditSection(
    doc,
    10,
    'Riwayat Penjualan Kasir POS & WO',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'pos' || l.module === 'wo_part')
  );

  // 11. Riwayat Absen Mekanik
  addPdfAuditSection(
    doc,
    11,
    'Riwayat Absensi Mekanik',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'absen_mekanik')
  );

  // 12. Riwayat Persetujuan & Otorisasi
  addPdfAuditSection(
    doc,
    12,
    'Riwayat Persetujuan & Otorisasi',
    auditPeriodLabel,
    auditLogs.filter(
      (l) =>
        l.module === 'persetujuan' ||
        l.action.toLowerCase().includes('setuj') ||
        l.action.toLowerCase().includes('tolak')
    )
  );

  // 13. Riwayat Stok Opname
  addPdfAuditSection(
    doc,
    13,
    'Riwayat Sesi Stok Opname',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'stock_opname')
  );

  // 14. Riwayat Ekspor Laporan
  addPdfAuditSection(
    doc,
    14,
    'Riwayat Ekspor Laporan & Dokumen',
    auditPeriodLabel,
    auditLogs.filter((l) => l.module === 'laporan' || l.action.toLowerCase().includes('export'))
  );

  addPdfFooter(doc);
  doc.save(`MyBengkel_Laporan_MasterAdmin_${sanitizeFilename(serviceData.periodLabel)}.pdf`);
}

