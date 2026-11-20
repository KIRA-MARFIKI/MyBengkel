import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { useAuth } from '../../lib/mockAuth';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, type Column } from '../../components/admin/DataTable';
import { ActionButton, DownloadIcon } from '../../components/admin/ActionButton';
import { StatusChip } from '../../components/admin/StatusChip';
import { RollingNumber, useActionIsland } from '../../components/admin/island/IslandSystem';
import { formatRupiah, todayISO } from '../../lib/format';
import {
  type ReportPeriod,
  type ServiceReportData,
  type SalesReportData,
  type WarehouseReportData,
  type ServiceWorkOrderRow,
  type ServiceBookingRow,
  type ServiceJasaDetailRow,
  type ServicePartDetailRow,
  type ServiceMechanicPerformanceRow,
  type SalesPosLineRow,
  type SalesWoPartLineRow,
  type SalesPartPerformanceRow,
  type WarehousePartConditionRow,
  type WarehouseMovementRow,
  calculateServiceReport,
  calculateSalesReport,
  calculateWarehouseReport,
  isDateInPeriod,
} from '../../lib/reportCalculations';
import { ReportDoughnutChart, ReportBarChart } from '../../components/admin/ReportCharts';
import { ReportPeriodSelector } from '../../components/admin/ReportPeriodSelector';
import {
  exportExcelServiceReport,
  exportExcelSalesReport,
  exportExcelWarehouseReport,
  exportExcelAllReports,
  exportExcelMasterAdminReports,
  exportPdfServiceReport,
  exportPdfSalesReport,
  exportPdfWarehouseReport,
  exportPdfAllReports,
  exportPdfMasterAdminReports,
} from '../../lib/reportExport';
import { CenterDialog } from '../../components/admin/CenterDialog';
import { ExportPinModal } from '../../components/admin/ExportPinModal';
import type { AuditLog, ExportAuthResult } from '../../lib/auditTrail';
import {
  DUMMY_ADMIN,
  DUMMY_MASTER,
} from '../../lib/mockCredentials';

// Mask sensitive fields in audit log payloads
function maskSensitiveData(data: any): any {
  if (!data) return data;
  if (typeof data === 'string') return data;
  if (typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(maskSensitiveData);
  const copy: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('pin') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret')
    ) {
      copy[key] = '••••••';
    } else if (typeof value === 'object' && value !== null) {
      copy[key] = maskSensitiveData(value);
    } else {
      copy[key] = value;
    }
  }
  return copy;
}

interface AdminReportsProps {
  mode?: 'semua' | 'servis' | 'penjualan' | 'gudang';
}

export const AdminReports: React.FC<AdminReportsProps> = ({ mode = 'semua' }) => {
  const adminStore = useAdmin();
  const { user, role } = useAuth();
  const { notify } = useActionIsland();
  const canAccessWarehouseReport = role === 'master_admin' || role === 'master_helpdesk';

  // Export PIN Gate & Master Admin Access State
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pendingExportKind, setPendingExportKind] = useState<'excel' | 'pdf' | null>(null);
  const [isMasterUnlocked, setIsMasterUnlocked] = useState(false);

  // Master Admin Activity Audit Filters
  const [auditPeriodFilter, setAuditPeriodFilter] = useState<'periode' | 'semua'>('semua');
  const [auditModuleFilter, setAuditModuleFilter] = useState<string>('semua');
  const [auditSearch, setAuditSearch] = useState('');
  const [selectedAuditLog, setSelectedAuditLog] = useState<AuditLog | null>(null);

  // Unified Period State across entire reporting system
  const [period, setPeriod] = useState<ReportPeriod>({
    mode: 'Bulanan',
    dateStr: todayISO(),
  });

  // Calculate Reports for the selected period
  const serviceData: ServiceReportData = useMemo(
    () => calculateServiceReport(period, adminStore),
    [period, adminStore]
  );

  const salesData: SalesReportData = useMemo(
    () => calculateSalesReport(period, adminStore),
    [period, adminStore]
  );

  const warehouseData: WarehouseReportData = useMemo(
    () => calculateWarehouseReport(period, adminStore),
    [period, adminStore]
  );

  // Search filter states for tables
  const [serviceWoSearch, setServiceWoSearch] = useState('');
  const [salesPartSearch, setSalesPartSearch] = useState('');
  const [warehousePartSearch, setWarehousePartSearch] = useState('');

  // -------------------------------------------------------------
  // COLUMNS: SERVIS
  // -------------------------------------------------------------

  // 1. Data Work Order (Strictly 15 columns, NO vehicle year!)
  const mainWoColumns: Column<ServiceWorkOrderRow>[] = [
    {
      key: 'nomorWo',
      header: 'No. WO',
      render: (r) => <samp className="font-mono font-semibold text-[#1E2230] text-[12px]">{r.nomorWo}</samp>,
    },
    { key: 'namaKonsumen', header: 'Konsumen', render: (r) => <span className="font-medium text-[#1E2230]">{r.namaKonsumen}</span> },
    { key: 'nomorHp', header: 'No. HP', render: (r) => <span className="font-mono text-[12px] text-[#4B5563]">{r.nomorHp}</span> },
    { key: 'nomorPlat', header: 'Plat Nomor', render: (r) => <samp className="font-mono font-medium">{r.nomorPlat}</samp> },
    { key: 'nomorMesin', header: 'No. Mesin', render: (r) => <span className="font-mono text-[11px] text-[#646B7C]">{r.nomorMesin}</span> },
    { key: 'nomorRangka', header: 'No. Rangka', render: (r) => <span className="font-mono text-[11px] text-[#646B7C]">{r.nomorRangka}</span> },
    { key: 'tipeMotor', header: 'Tipe Motor', render: (r) => <span>{r.tipeMotor}</span> },
    { key: 'warnaMotor', header: 'Warna', render: (r) => <span>{r.warnaMotor}</span> },
    { key: 'mekanik', header: 'Mekanik', render: (r) => <span>{r.mekanik}</span> },
    { key: 'tanggalMasuk', header: 'Tgl Masuk', render: (r) => <span className="tabular-nums text-[12px] text-[#646B7C]">{r.tanggalMasuk}</span> },
    { key: 'tanggalSelesai', header: 'Tgl Selesai', render: (r) => <span className="tabular-nums text-[12px] text-[#646B7C]">{r.tanggalSelesai}</span> },
    {
      key: 'statusWo',
      header: 'Status WO',
      align: 'center',
      render: (r) => (
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            r.statusWo === 'Selesai'
              ? 'bg-[#DEF7EC] text-[#03543F]'
              : r.statusWo === 'Batal'
              ? 'bg-[#FDE3E9] text-[#B4234A]'
              : 'bg-[#FFF1DA] text-[#8A5A00]'
          }`}
        >
          {r.statusWo}
        </span>
      ),
    },
    {
      key: 'totalJasa',
      header: 'Total Jasa',
      align: 'right',
      render: (r) => <span className="tabular-nums font-mono text-[12px]">{formatRupiah(r.totalJasa)}</span>,
    },
    {
      key: 'totalPart',
      header: 'Total Part',
      align: 'right',
      render: (r) => <span className="tabular-nums font-mono text-[12px]">{formatRupiah(r.totalPart)}</span>,
    },
    {
      key: 'totalServis',
      header: 'Total Servis',
      align: 'right',
      render: (r) => <span className="tabular-nums font-sans font-bold text-[13px] text-[#1A64B0]">{formatRupiah(r.totalServis)}</span>,
    },
  ];

  const bookingColumns: Column<ServiceBookingRow>[] = [
    { key: 'kodeBooking', header: 'Kode Booking', render: (r) => <samp className="font-mono font-medium">{r.kodeBooking}</samp> },
    { key: 'namaKonsumen', header: 'Konsumen' },
    { key: 'platNomor', header: 'Plat Nomor', render: (r) => <samp className="font-mono">{r.platNomor}</samp> },
    { key: 'layanan', header: 'Layanan' },
    { key: 'tanggal', header: 'Tanggal', render: (r) => <span className="tabular-nums">{r.tanggal}</span> },
    { key: 'jam', header: 'Jam', render: (r) => <span className="tabular-nums font-mono">{r.jam}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          r.status === 'Datang' ? 'bg-[#DEF7EC] text-[#03543F]' : r.status === 'Batal' ? 'bg-[#FDE3E9] text-[#B4234A]' : 'bg-[#FFF1DA] text-[#8A5A00]'
        }`}>
          {r.status}
        </span>
      ),
    },
    { key: 'sumberBooking', header: 'Sumber' },
  ];

  const jasaColumns: Column<ServiceJasaDetailRow>[] = [
    { key: 'nomorWo', header: 'No. WO', render: (r) => <samp className="font-mono">{r.nomorWo}</samp> },
    { key: 'namaKonsumen', header: 'Konsumen' },
    { key: 'namaJasa', header: 'Nama Jasa' },
    { key: 'qty', header: 'Qty', align: 'center', render: (r) => <span className="tabular-nums">{r.qty}</span> },
    { key: 'hargaSatuan', header: 'Harga Satuan', align: 'right', render: (r) => <span className="tabular-nums">{formatRupiah(r.hargaSatuan)}</span> },
    { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r) => <span className="tabular-nums font-semibold">{formatRupiah(r.subtotal)}</span> },
  ];

  const partWoColumns: Column<ServicePartDetailRow>[] = [
    { key: 'nomorWo', header: 'No. WO', render: (r) => <samp className="font-mono">{r.nomorWo}</samp> },
    { key: 'namaKonsumen', header: 'Konsumen' },
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part' },
    { key: 'qty', header: 'Qty', align: 'center', render: (r) => <span className="tabular-nums">{r.qty}</span> },
    { key: 'hargaSatuan', header: 'Harga Satuan', align: 'right', render: (r) => <span className="tabular-nums">{formatRupiah(r.hargaSatuan)}</span> },
    { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r) => <span className="tabular-nums font-semibold">{formatRupiah(r.subtotal)}</span> },
  ];

  const mechanicColumns: Column<ServiceMechanicPerformanceRow>[] = [
    { key: 'mekanik', header: 'Mekanik', render: (r) => <strong className="text-[#1E2230]">{r.mekanik}</strong> },
    { key: 'jumlahWo', header: 'Jumlah WO', align: 'center', render: (r) => <span className="tabular-nums">{r.jumlahWo}</span> },
    { key: 'jamKerja', header: 'Estimasi Jam Kerja', align: 'center', render: (r) => <span className="tabular-nums font-mono">{r.jamKerja}</span> },
    { key: 'jumlahWoSelesai', header: 'WO Selesai', align: 'center', render: (r) => <span className="tabular-nums font-semibold text-[#15803D]">{r.jumlahWoSelesai}</span> },
    { key: 'totalNilaiJasa', header: 'Total Nilai Jasa', align: 'right', render: (r) => <span className="tabular-nums font-bold text-[#1A64B0]">{formatRupiah(r.totalNilaiJasa)}</span> },
  ];

  // -------------------------------------------------------------
  // COLUMNS: PENJUALAN
  // -------------------------------------------------------------

  const posLineColumns: Column<SalesPosLineRow>[] = [
    { key: 'kodeTransaksi', header: 'No. Transaksi', render: (r) => <samp className="font-mono font-semibold text-[#1E2230]">{r.kodeTransaksi}</samp> },
    { key: 'tanggalTransaksi', header: 'Waktu', render: (r) => <span className="text-[12px] text-[#646B7C] tabular-nums">{r.tanggalTransaksi}</span> },
    { key: 'namaKonsumen', header: 'Konsumen' },
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part' },
    { key: 'jumlah', header: 'Qty', align: 'center', render: (r) => <span className="tabular-nums font-semibold">{r.jumlah}</span> },
    { key: 'hargaSatuan', header: 'Harga Satuan', align: 'right', render: (r) => <span className="tabular-nums">{formatRupiah(r.hargaSatuan)}</span> },
    { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r) => <span className="tabular-nums font-bold text-[#1E2230]">{formatRupiah(r.subtotal)}</span> },
    { key: 'metodePembayaran', header: 'Metode', render: (r) => <span className="text-[12px]">{r.metodePembayaran}</span> },
    { key: 'statusPembayaran', header: 'Status', align: 'center', render: () => <StatusChip status="dibayar" /> },
    { key: 'kasir', header: 'Kasir', render: (r) => <span className="text-[12px] text-[#646B7C]">{r.kasir}</span> },
  ];

  const woPartSaleColumns: Column<SalesWoPartLineRow>[] = [
    { key: 'nomorWo', header: 'No. WO', render: (r) => <samp className="font-mono font-semibold text-[#1E2230]">{r.nomorWo}</samp> },
    { key: 'tanggalSelesai', header: 'Tgl Selesai', render: (r) => <span className="text-[12px] text-[#646B7C] tabular-nums">{r.tanggalSelesai}</span> },
    { key: 'namaKonsumen', header: 'Konsumen' },
    { key: 'platNomor', header: 'Plat Nomor', render: (r) => <samp className="font-mono">{r.platNomor}</samp> },
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part' },
    { key: 'jumlah', header: 'Qty', align: 'center', render: (r) => <span className="tabular-nums font-semibold">{r.jumlah}</span> },
    { key: 'hargaSatuan', header: 'Harga Satuan', align: 'right', render: (r) => <span className="tabular-nums">{formatRupiah(r.hargaSatuan)}</span> },
    { key: 'subtotal', header: 'Subtotal', align: 'right', render: (r) => <span className="tabular-nums font-bold text-[#1E2230]">{formatRupiah(r.subtotal)}</span> },
    { key: 'mekanik', header: 'Mekanik' },
  ];

  const partPerfColumns: Column<SalesPartPerformanceRow>[] = [
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono font-semibold text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part', render: (r) => <strong className="text-[#1E2230]">{r.namaPart}</strong> },
    { key: 'satuan', header: 'Satuan', render: (r) => <span className="text-[12px] text-[#646B7C]">{r.satuan}</span> },
    { key: 'totalQtyTerjual', header: 'Total Terjual', align: 'center', render: (r) => <span className="tabular-nums font-bold text-[14px]">{r.totalQtyTerjual}</span> },
    { key: 'nilaiPenjualan', header: 'Total Nilai (Rp)', align: 'right', render: (r) => <span className="tabular-nums font-semibold text-[#1E2230]">{formatRupiah(r.nilaiPenjualan)}</span> },
    { key: 'hargaBeli', header: 'Harga Beli (Rp)', align: 'right', render: (r) => <span className="tabular-nums text-[#646B7C]">{formatRupiah(r.hargaBeli)}</span> },
    { key: 'estimasiMargin', header: 'Estimasi Margin (Rp)', align: 'right', render: (r) => <span className="tabular-nums font-bold text-[#15803D]">{formatRupiah(r.estimasiMargin)}</span> },
  ];

  // -------------------------------------------------------------
  // COLUMNS: GUDANG
  // -------------------------------------------------------------

  const masterPartColumns: Column<WarehousePartConditionRow>[] = [
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono font-semibold text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part', render: (r) => <span className="font-medium text-[#1E2230]">{r.namaPart}</span> },
    { key: 'satuan', header: 'Satuan' },
    { key: 'stok', header: 'Stok', align: 'center', render: (r) => <span className="tabular-nums font-bold text-[14px]">{r.stok}</span> },
    { key: 'hargaBeli', header: 'Harga Beli', align: 'right', render: (r) => <span className="tabular-nums text-[#646B7C]">{formatRupiah(r.hargaBeli)}</span> },
    { key: 'hargaJual', header: 'Harga Jual', align: 'right', render: (r) => <span className="tabular-nums font-semibold">{formatRupiah(r.hargaJual)}</span> },
    { key: 'stokMinimum', header: 'Min Stok', align: 'center', render: (r) => <span className="tabular-nums">{r.stokMinimum}</span> },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
          r.status === 'Aman' ? 'bg-[#DEF7EC] text-[#03543F]' : 'bg-[#FDE3E9] text-[#B4234A]'
        }`}>
          {r.status}
        </span>
      ),
    },
    { key: 'tanggalDibuat', header: 'Tgl Dibuat', render: (r) => <span className="tabular-nums text-[12px] text-[#646B7C]">{r.tanggalDibuat}</span> },
  ];

  const movementColumns: Column<WarehouseMovementRow>[] = [
    { key: 'tanggal', header: 'Tanggal', render: (r) => <span className="tabular-nums text-[12px]">{r.tanggal}</span> },
    { key: 'kodePart', header: 'Kode Part', render: (r) => <samp className="font-mono text-[#1A64B0]">{r.kodePart}</samp> },
    { key: 'namaPart', header: 'Nama Part' },
    { key: 'jenisMutasi', header: 'Jenis Mutasi', render: (r) => <span className="font-mono text-[11px]">{r.jenisMutasi}</span> },
    { key: 'qtyMasuk', header: 'Masuk', align: 'center', render: (r) => <span className={`tabular-nums font-semibold ${r.qtyMasuk > 0 ? 'text-[#15803D]' : 'text-[#9CA3AF]'}`}>{r.qtyMasuk > 0 ? `+${r.qtyMasuk}` : '-'}</span> },
    { key: 'qtyKeluar', header: 'Keluar', align: 'center', render: (r) => <span className={`tabular-nums font-semibold ${r.qtyKeluar > 0 ? 'text-[#B4234A]' : 'text-[#9CA3AF]'}`}>{r.qtyKeluar > 0 ? `-${r.qtyKeluar}` : '-'}</span> },
    { key: 'referensiTransaksi', header: 'Referensi', render: (r) => <samp className="font-mono text-[11px]">{r.referensiTransaksi}</samp> },
    { key: 'sumberMutasi', header: 'Sumber', render: (r) => <span className="text-[12px] text-[#646B7C]">{r.sumberMutasi}</span> },
  ];

  // Filtered rows for search fields
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const handleExport = (key: string, fn: () => void) => {
    if (exportingKey) return;
    setExportingKey(key);
    setTimeout(() => {
      try {
        fn();
      } finally {
        setTimeout(() => {
          setExportingKey(null);
        }, 600);
      }
    }, 40);
  };

  const handleDownloadCsv = (targetScope: 'all' | 'service' | 'sales' | 'warehouse') => {
    if (targetScope === 'warehouse' && !canAccessWarehouseReport) {
      notify('Akses ditolak: Admin bengkel tidak diperbolehkan mengunduh Laporan Gudang.');
      return;
    }
    const csvKey = `${targetScope}-csv`;
    handleExport(csvKey, () => {
      const escapeCell = (val: unknown): string => {
        const s = val === null || val === undefined ? '' : String(val);
        if (/[",\r\n]/.test(s)) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };
      const lines: string[] = [];
      const pushRow = (cols: unknown[]) => {
        lines.push(cols.map(escapeCell).join(','));
      };

      pushRow(['Laporan MyBengkel', `Cakupan: ${targetScope.toUpperCase()}`, `Periode: ${serviceData.periodLabel}`, `Tanggal Ekspor: ${todayISO()}`]);
      pushRow([]);

      if (targetScope === 'all' || targetScope === 'service') {
        pushRow(['=== BAGIAN 1: LAPORAN OPERASIONAL SERVIS ===']);
        pushRow(['Metrik', 'Nilai']);
        pushRow(['Total Booking', serviceData.kpis.totalBooking]);
        pushRow(['Total Service Form', serviceData.kpis.totalServiceForm]);
        pushRow(['Total Work Order', serviceData.kpis.totalWorkOrder]);
        pushRow(['WO Berjalan', serviceData.kpis.woBerjalan]);
        pushRow(['WO Selesai', serviceData.kpis.woSelesai]);
        pushRow(['WO Batal', serviceData.kpis.woBatal]);
        pushRow(['Total Omzet Jasa', serviceData.kpis.totalOmzetJasa]);
        pushRow(['Total Nilai Part Selesai', serviceData.kpis.totalNilaiPartSelesai]);
        pushRow([]);
        pushRow(['No. WO', 'Konsumen', 'No. HP', 'Plat Nomor', 'Tipe Motor', 'Warna', 'Mekanik', 'Tgl Masuk', 'Tgl Selesai', 'Status WO', 'Total Jasa', 'Total Part', 'Total Servis']);
        for (const r of serviceData.tables.mainWorkOrders) {
          pushRow([r.nomorWo, r.namaKonsumen, r.nomorHp, r.nomorPlat, r.tipeMotor, r.warnaMotor, r.mekanik, r.tanggalMasuk, r.tanggalSelesai, r.statusWo, r.totalJasa, r.totalPart, r.totalServis]);
        }
        pushRow([]);
        pushRow(['Kode Booking', 'Konsumen', 'Plat Nomor', 'Layanan', 'Tanggal', 'Jam', 'Status', 'Sumber']);
        for (const r of serviceData.tables.bookings) {
          pushRow([r.kodeBooking, r.namaKonsumen, r.platNomor, r.layanan, r.tanggal, r.jam, r.status, r.sumberBooking]);
        }
        pushRow([]);
      }

      if (targetScope === 'all' || targetScope === 'sales') {
        pushRow(['=== BAGIAN 2: LAPORAN PENJUALAN SPAREPART ===']);
        pushRow(['Metrik', 'Nilai']);
        pushRow(['Omzet Part Kasir POS', salesData.kpis.totalOmzetPos]);
        pushRow(['Nilai Part WO Selesai', salesData.kpis.totalNilaiPartWoSelesai]);
        pushRow(['Total Penjualan Gabungan', salesData.kpis.totalPenjualanPartGabungan]);
        pushRow(['Transaksi POS Dibayar', salesData.kpis.totalTransaksiPosDibayar]);
        pushRow(['Total Qty Part Terjual', salesData.kpis.totalJumlahPartTerjual]);
        pushRow([]);
        pushRow(['No. Transaksi POS', 'Waktu', 'Konsumen', 'Kode Part', 'Nama Part', 'Qty', 'Harga Satuan', 'Subtotal', 'Metode', 'Status', 'Kasir']);
        for (const r of salesData.tables.posLines) {
          pushRow([r.kodeTransaksi, r.tanggalTransaksi, r.namaKonsumen, r.kodePart, r.namaPart, r.jumlah, r.hargaSatuan, r.subtotal, r.metodePembayaran, r.statusPembayaran, r.kasir]);
        }
        pushRow([]);
        pushRow(['No. WO (Part)', 'Tgl Selesai', 'Konsumen', 'Plat Nomor', 'Kode Part', 'Nama Part', 'Qty', 'Harga Satuan', 'Subtotal', 'Mekanik', 'Status WO']);
        for (const r of salesData.tables.woPartLines) {
          pushRow([r.nomorWo, r.tanggalSelesai, r.namaKonsumen, r.platNomor, r.kodePart, r.namaPart, r.jumlah, r.hargaSatuan, r.subtotal, r.mekanik, r.statusWo]);
        }
        pushRow([]);
      }

      if ((targetScope === 'all' && canAccessWarehouseReport) || targetScope === 'warehouse') {
        pushRow(['=== BAGIAN 3: LAPORAN PENGELOLAAN GUDANG ===']);
        pushRow(['Metrik', 'Nilai']);
        pushRow(['Total Item Part', warehouseData.kpis.totalItemPart]);
        pushRow(['Part Stok Aman', warehouseData.kpis.partAmanCount]);
        pushRow(['Part Stok Kritis', warehouseData.kpis.partKritisCount]);
        pushRow(['Total Stok Fisik', warehouseData.kpis.totalStokTersedia]);
        pushRow(['Total Barang Masuk', warehouseData.kpis.totalBarangMasuk]);
        pushRow(['Total Barang Keluar', warehouseData.kpis.totalBarangKeluar]);
        pushRow([]);
        pushRow(['Kode Part', 'Nama Part', 'Satuan', 'Stok', 'Stok Minimum', 'Harga Beli', 'Harga Jual', 'Status', 'Tgl Dibuat']);
        for (const r of warehouseData.tables.partConditions) {
          pushRow([r.kodePart, r.namaPart, r.satuan, r.stok, r.stokMinimum, r.hargaBeli, r.hargaJual, r.status, r.tanggalDibuat]);
        }
        pushRow([]);
        pushRow(['Tanggal Mutasi', 'Kode Part', 'Nama Part', 'Jenis Mutasi', 'Masuk', 'Keluar', 'Referensi', 'Sumber', 'Dicatat Oleh']);
        for (const r of warehouseData.tables.movements) {
          pushRow([r.tanggal, r.kodePart, r.namaPart, r.jenisMutasi, r.qtyMasuk, r.qtyKeluar, r.referensiTransaksi, r.sumberMutasi, r.dicatatOleh]);
        }
      }

      const bom = '\uFEFF';
      const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safePeriod = serviceData.periodLabel.replace(/[^a-zA-Z0-9_-]+/g, '_');
      a.download = `MyBengkel_Laporan_${targetScope}_${safePeriod}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      adminStore.recordReportExportEvent?.({
        actor: {
          id:
            user?.roleCode ||
            (role === 'master_admin'
              ? DUMMY_MASTER.id
              : role === 'master_helpdesk'
              ? 'HD-001'
              : DUMMY_ADMIN.id),
          nama: user?.name || 'Admin',
          role: (role || 'admin') as any,
        },
        format: 'CSV',
        scope: targetScope,
        periodLabel: serviceData.periodLabel,
      });
      notify(`Laporan ${targetScope.toUpperCase()} berhasil diunduh sebagai CSV.`);
    });
  };

  const handlePinVerified = (result: ExportAuthResult) => {
    setPinModalOpen(false);
    if (result.role === 'master_admin') {
      setIsMasterUnlocked(true);
    }

    const actor = result.actor || {
      id:
        user?.roleCode ||
        (result.role === 'master_admin'
          ? DUMMY_MASTER.id
          : role === 'master_helpdesk'
          ? 'HD-001'
          : DUMMY_ADMIN.id),
      nama:
        user?.name ||
        (result.role === 'master_admin'
          ? DUMMY_MASTER.nama
          : role === 'master_helpdesk'
          ? 'Master Helpdesk'
          : DUMMY_ADMIN.nama),
      role: (result.role || role || 'admin') as any,
    };

    if (!pendingExportKind) {
      notify(`Akses Master Admin aktif untuk ${actor.nama}.`);
      return;
    }

    const kind = pendingExportKind;
    setPendingExportKind(null);
    setExportingKey(`all-${kind}`);

    setTimeout(() => {
      try {
        if (result.role === 'master_admin') {
          const allLogs = adminStore.auditLogs || [];
          if (kind === 'excel') {
            exportExcelMasterAdminReports(
              serviceData,
              salesData,
              warehouseData,
              allLogs,
              serviceData.periodLabel
            );
          } else {
            exportPdfMasterAdminReports(
              serviceData,
              salesData,
              warehouseData,
              allLogs,
              serviceData.periodLabel
            );
          }
          adminStore.recordReportExportEvent({
            actor,
            format: kind === 'excel' ? 'Excel' : 'PDF',
            scope: 'master_admin',
            periodLabel: serviceData.periodLabel,
          });
          notify(
            `Laporan Master Admin telah diekspor (${kind.toUpperCase()}).`
          );
        } else {
          // Admin or non-master export: enforce warehouse visibility RBAC
          if (kind === 'excel') {
            exportExcelAllReports(serviceData, salesData, warehouseData, canAccessWarehouseReport);
          } else {
            exportPdfAllReports(serviceData, salesData, warehouseData, canAccessWarehouseReport);
          }
          adminStore.recordReportExportEvent({
            actor,
            format: kind === 'excel' ? 'Excel' : 'PDF',
            scope: 'admin',
            periodLabel: serviceData.periodLabel,
          });
          notify(
            canAccessWarehouseReport
              ? 'Laporan lengkap (Servis, Penjualan, Gudang) telah diekspor.'
              : 'Laporan Servis & Penjualan telah diekspor (Admin).'
          );
        }
      } catch (err) {
        console.error('Export error:', err);
        notify('Gagal memproses ekspor laporan.');
      } finally {
        setTimeout(() => {
          setExportingKey(null);
        }, 600);
      }
    }, 50);
  };

  const filteredServiceWos = useMemo(() => {
    if (!serviceWoSearch.trim()) return serviceData.tables.mainWorkOrders;
    const q = serviceWoSearch.toLowerCase();
    return serviceData.tables.mainWorkOrders.filter(
      (r) =>
        r.nomorWo.toLowerCase().includes(q) ||
        r.namaKonsumen.toLowerCase().includes(q) ||
        r.nomorPlat.toLowerCase().includes(q) ||
        r.mekanik.toLowerCase().includes(q)
    );
  }, [serviceData.tables.mainWorkOrders, serviceWoSearch]);

  const filteredSalesParts = useMemo(() => {
    if (!salesPartSearch.trim()) return salesData.tables.partPerformances;
    const q = salesPartSearch.toLowerCase();
    return salesData.tables.partPerformances.filter(
      (r) => r.kodePart.toLowerCase().includes(q) || r.namaPart.toLowerCase().includes(q)
    );
  }, [salesData.tables.partPerformances, salesPartSearch]);

  const filteredWarehouseParts = useMemo(() => {
    if (!warehousePartSearch.trim()) return warehouseData.tables.partConditions;
    const q = warehousePartSearch.toLowerCase();
    return warehouseData.tables.partConditions.filter(
      (r) => r.kodePart.toLowerCase().includes(q) || r.namaPart.toLowerCase().includes(q)
    );
  }, [warehouseData.tables.partConditions, warehousePartSearch]);

  const filteredAuditLogs = useMemo(() => {
    let logs = adminStore.auditLogs || [];

    // 1. Period filter
    if (auditPeriodFilter === 'periode') {
      logs = logs.filter((l) => isDateInPeriod(l.occurredAt, period));
    }

    // 2. Module filter
    if (auditModuleFilter !== 'semua') {
      if (auditModuleFilter === 'servis') {
        logs = logs.filter((l) =>
          ['booking', 'service_form', 'work_order'].includes(l.module)
        );
      } else if (auditModuleFilter === 'penjualan') {
        logs = logs.filter((l) => ['pos', 'wo_part'].includes(l.module));
      } else if (auditModuleFilter === 'gudang') {
        logs = logs.filter(
          (l) => l.module === 'gudang' || l.entityType === 'stock_movement'
        );
      } else if (auditModuleFilter === 'persetujuan') {
        logs = logs.filter(
          (l) =>
            l.module === 'persetujuan' ||
            l.action.toLowerCase().includes('setuj') ||
            l.action.toLowerCase().includes('tolak')
        );
      } else {
        logs = logs.filter((l) => l.module === auditModuleFilter);
      }
    }

    // 3. Search query
    if (auditSearch.trim()) {
      const q = auditSearch.toLowerCase();
      logs = logs.filter(
        (l) =>
          l.id.toLowerCase().includes(q) ||
          l.actorName.toLowerCase().includes(q) ||
          l.actorId.toLowerCase().includes(q) ||
          l.action.toLowerCase().includes(q) ||
          l.event.toLowerCase().includes(q) ||
          (l.reference && l.reference.toLowerCase().includes(q)) ||
          (l.reason && l.reason.toLowerCase().includes(q))
      );
    }

    return logs;
  }, [adminStore.auditLogs, auditPeriodFilter, auditModuleFilter, auditSearch, period]);

  const auditColumns: Column<AuditLog>[] = [
    {
      key: 'occurredAt',
      header: 'Waktu Kejadian',
      render: (l) => (
        <div className="font-mono text-[12px] text-[#1E2230] tabular-nums whitespace-nowrap">
          {l.occurredAt}
        </div>
      ),
    },
    {
      key: 'actor',
      header: 'Pelaku',
      render: (l) => (
        <div className="text-[12px]">
          <div className="font-medium text-[#1E2230]">{l.actorName}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="font-mono text-[11px] bg-[#EEF2F6] text-[#475569] px-1.5 py-0.5 rounded font-semibold">
              {l.actorId}
            </span>
            <span className="text-[11px] text-[#646B7C] capitalize">
              {l.actorRole.replace('_', ' ')}
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'module',
      header: 'Modul',
      render: (l) => (
        <span className="inline-block px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-[#F1F5F9] text-[#334155] uppercase tracking-wider">
          {l.module.replace('_', ' ')}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Aktivitas / Aksi',
      render: (l) => (
        <div className="text-[12px] max-w-xs">
          <div className="font-medium text-[#1E2230] leading-snug">{l.action}</div>
          <div className="text-[11px] text-[#646B7C] font-mono mt-0.5">
            {l.event} • {l.entityType}
          </div>
        </div>
      ),
    },
    {
      key: 'reference',
      header: 'Referensi',
      render: (l) =>
        l.reference ? (
          <span className="font-mono text-[12px] font-semibold text-[#1A64B0] bg-[#E4F2FE] px-2 py-0.5 rounded-[6px]">
            {l.reference}
          </span>
        ) : (
          <span className="text-[12px] text-[#9CA3AF]">-</span>
        ),
    },
    {
      key: 'outcome',
      header: 'Status',
      render: (l) => (
        <StatusChip status={l.outcome === 'berhasil' ? 'Selesai' : 'Ditolak'} />
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (l) => (
        <ActionButton
          type="button"
          intent="neutral"
          onClick={() => setSelectedAuditLog(l)}
          className="!h-7 !px-2.5 !text-[12px]"
        >
          Detail
        </ActionButton>
      ),
    },
  ];

  if (mode === 'gudang' && !canAccessWarehouseReport) {
    return <Navigate to="/admin/laporan/servis" replace />;
  }

  const showServis = mode === 'semua' || mode === 'servis';
  const showPenjualan = mode === 'semua' || mode === 'penjualan';
  const showGudang = canAccessWarehouseReport && (mode === 'semua' || mode === 'gudang');

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER CONTROLS & EXPORT ACTIONS                          */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold text-[#1E2230]">
            {mode === 'semua'
              ? 'Laporan Terintegrasi MyBengkel'
              : mode === 'servis'
              ? 'Laporan Operasional Servis'
              : mode === 'penjualan'
              ? 'Laporan Penjualan Sparepart'
              : 'Laporan Pengelolaan Gudang'}
          </h1>
          <p className="text-[13px] text-[#646B7C] mt-0.5">
            Informasi analitik, tren visual, data operasional, dan ekspor dokumen resmi
          </p>
        </div>

        {/* Export Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {mode === 'semua' ? (
            <>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => handleDownloadCsv('all')}
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey === 'all-csv' ? 'Memproses...' : 'Download CSV'}
              </ActionButton>
              <ActionButton
                intent="start"
                disabled={Boolean(exportingKey)}
                onClick={() => {
                  setPendingExportKind('excel');
                  setPinModalOpen(true);
                }}
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey === 'all-excel' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export Semua Excel'
                )}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => {
                  setPendingExportKind('pdf');
                  setPinModalOpen(true);
                }}
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey === 'all-pdf' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export Semua PDF'
                )}
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleDownloadCsv(
                    mode === 'servis'
                      ? 'service'
                      : mode === 'penjualan'
                      ? 'sales'
                      : 'warehouse'
                  )
                }
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey?.endsWith('-csv') ? 'Memproses...' : 'Download CSV'}
              </ActionButton>
              <ActionButton
                intent="start"
                disabled={Boolean(exportingKey)}
                onClick={() => {
                  if (mode === 'servis') {
                    handleExport('servis-excel', () => exportExcelServiceReport(serviceData));
                  } else if (mode === 'penjualan') {
                    handleExport('penjualan-excel', () => exportExcelSalesReport(salesData));
                  } else if (canAccessWarehouseReport) {
                    handleExport('gudang-excel', () => exportExcelWarehouseReport(warehouseData));
                  }
                }}
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey?.endsWith('-excel') ? 'Memproses...' : 'Export Excel'}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => {
                  if (mode === 'servis') {
                    handleExport('servis-pdf', () => exportPdfServiceReport(serviceData));
                  } else if (mode === 'penjualan') {
                    handleExport('penjualan-pdf', () => exportPdfSalesReport(salesData));
                  } else if (canAccessWarehouseReport) {
                    handleExport('gudang-pdf', () => exportPdfWarehouseReport(warehouseData));
                  }
                }}
                className="!h-9 !text-[13px] disabled:opacity-50"
              >
                {exportingKey?.endsWith('-pdf') ? 'Memproses...' : 'Export PDF'}
              </ActionButton>
            </>
          )}
        </div>
      </div>

      {/* Global Unified Period Selector */}
      <ReportPeriodSelector period={period} onChange={setPeriod} />

      {/* ============================================================= */}
      {/* 1. SECTION: LAPORAN SERVIS                                    */}
      {/* ============================================================= */}
      {showServis && (
        <section className="space-y-6 pt-4 border-t border-[#EEF0F4]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#1A64B0] bg-[#E4F2FE] px-2.5 py-0.5 rounded-full">
                Bagian 1
              </span>
              <h2 className="text-[18px] font-bold text-[#1E2230] mt-1">Laporan Operasional Servis</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => handleDownloadCsv('service')}
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'service-csv' ? 'Memproses...' : 'Download CSV'}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('servis-excel', () =>
                    exportExcelServiceReport(serviceData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'servis-excel' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export Excel'
                )}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('servis-pdf', () =>
                    exportPdfServiceReport(serviceData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'servis-pdf' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export PDF'
                )}
              </ActionButton>
            </div>
          </div>

          {/* Service KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Total Booking</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={serviceData.kpis.totalBooking} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Reservasi masuk</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Work Order Masuk</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={serviceData.kpis.totalWorkOrder} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Perintah kerja dibuat</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Work Order Selesai</div>
              <div className="text-[22px] font-extrabold text-[#15803D] mt-1 tabular-nums">
                <RollingNumber value={serviceData.kpis.woSelesai} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Pengerjaan tuntas</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">WO Berjalan / Batal</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                {serviceData.kpis.woBerjalan} / <span className="text-[#B4234A]">{serviceData.kpis.woBatal}</span>
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Status aktif & batal</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#BFDBFE] bg-gradient-to-br from-white to-[#F0F7FF] shadow-sm col-span-2 md:col-span-1">
              <div className="text-[12px] font-semibold text-[#1A64B0]">Total Omzet Jasa</div>
              <div className="text-[20px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={serviceData.kpis.totalOmzetJasa} format={formatRupiah} />
              </div>
              <div className="text-[11px] text-[#646B7C] mt-0.5">Dari WO selesai resmi</div>
            </div>
          </div>

          {/* Service Charts: Exactly 2 Doughnuts & 1 Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Doughnut 1: Status Work Order (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Status Work Order"
                centerLabel="Total WO"
                centerValue={serviceData.charts.statusWoDoughnut.total}
                segments={[
                  { label: 'Selesai', value: serviceData.charts.statusWoDoughnut.selesai, color: '#10B981' },
                  { label: 'Berjalan', value: serviceData.charts.statusWoDoughnut.berjalan, color: '#F59E0B' },
                  { label: 'Batal', value: serviceData.charts.statusWoDoughnut.batal, color: '#EF4444' },
                ]}
              />
            </div>

            {/* Doughnut 2: Distribusi Tipe Kendaraan (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Distribusi Tipe Kendaraan"
                centerLabel="Unit"
                centerValue={serviceData.charts.kendaraanDoughnut.total}
                segments={[
                  { label: 'Honda', value: serviceData.charts.kendaraanDoughnut.honda, color: '#DC2626' },
                  { label: 'Yamaha', value: serviceData.charts.kendaraanDoughnut.yamaha, color: '#2563EB' },
                  { label: 'Suzuki', value: serviceData.charts.kendaraanDoughnut.suzuki, color: '#059669' },
                  { label: 'Lainnya', value: serviceData.charts.kendaraanDoughnut.lainnya, color: '#6B7280' },
                ]}
              />
            </div>

            {/* Bar Chart: Aktivitas Servis (6 cols) */}
            <div className="lg:col-span-6">
              <ReportBarChart
                title="Aktivitas Servis (WO Masuk vs Selesai)"
                labels={serviceData.charts.aktivitasBarChart.labels}
                series={[
                  { name: 'WO Masuk', data: serviceData.charts.aktivitasBarChart.woMasukSeries, color: '#3B82F6' },
                  { name: 'WO Selesai', data: serviceData.charts.aktivitasBarChart.woSelesaiSeries, color: '#10B981' },
                ]}
              />
            </div>
          </div>

          {/* Main Service Table: Data Work Order (Strictly 15 columns, NO vehicle year!) */}
          <DataCard
            title="Data Work Order"
            actions={
              <input
                type="text"
                value={serviceWoSearch}
                onChange={(e) => setServiceWoSearch(e.target.value)}
                placeholder="Cari WO, plat, konsumen..."
                className="admin-input !h-8 text-[12px] w-full sm:w-56"
              />
            }
          >
            <DataTable
              columns={mainWoColumns}
              data={filteredServiceWos}
              keyExtractor={(r) => r.nomorWo}
              swapKey={`service-wo-${period.mode}-${period.dateStr}-${serviceWoSearch}`}
              emptyMessage="Tidak ada aktivitas servis pada periode ini."
            />
          </DataCard>

          {/* Additional Service Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataCard title="Booking dan Kedatangan">
              <DataTable
                columns={bookingColumns}
                data={serviceData.tables.bookings}
                keyExtractor={(b) => b.kodeBooking}
                swapKey={`service-booking-${period.mode}-${period.dateStr}`}
                emptyMessage="Tidak ada booking pada periode ini."
              />
            </DataCard>

            <DataCard title="Kinerja Mekanik">
              <DataTable
                columns={mechanicColumns}
                data={serviceData.tables.mechanicPerformances}
                keyExtractor={(m) => m.mekanik}
                swapKey={`service-mechanic-${period.mode}-${period.dateStr}`}
                emptyMessage="Tidak ada data mekanik pada periode ini."
              />
            </DataCard>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DataCard title="Rincian Jasa Servis">
              <DataTable
                columns={jasaColumns}
                data={serviceData.tables.jasaDetails}
                keyExtractor={(_, i) => String(i)}
                swapKey={`service-jasa-${period.mode}-${period.dateStr}`}
                emptyMessage="Tidak ada rincian jasa pada periode ini."
              />
            </DataCard>

            <DataCard title="Rincian Part Work Order">
              <DataTable
                columns={partWoColumns}
                data={serviceData.tables.partDetails}
                keyExtractor={(_, i) => String(i)}
                swapKey={`service-part-${period.mode}-${period.dateStr}`}
                emptyMessage="Tidak ada pemakaian part pada periode ini."
              />
            </DataCard>
          </div>
        </section>
      )}

      {/* ============================================================= */}
      {/* 2. SECTION: LAPORAN PENJUALAN                                 */}
      {/* ============================================================= */}
      {showPenjualan && (
        <section className="space-y-6 pt-6 border-t border-[#EEF0F4]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D] bg-[#DEF7EC] px-2.5 py-0.5 rounded-full">
                Bagian 2
              </span>
              <h2 className="text-[18px] font-bold text-[#1E2230] mt-1">Laporan Penjualan Sparepart</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => handleDownloadCsv('sales')}
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'sales-csv' ? 'Memproses...' : 'Download CSV'}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('penjualan-excel', () =>
                    exportExcelSalesReport(salesData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'penjualan-excel' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export Excel'
                )}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('penjualan-pdf', () =>
                    exportPdfSalesReport(salesData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'penjualan-pdf' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export PDF'
                )}
              </ActionButton>
            </div>
          </div>

          {/* Sales KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Omzet Part Kasir POS</div>
              <div className="text-[20px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={salesData.kpis.totalOmzetPos} format={formatRupiah} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                {salesData.kpis.totalTransaksiPosDibayar} transaksi lunas
              </div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Nilai Part WO Selesai</div>
              <div className="text-[20px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={salesData.kpis.totalNilaiPartWoSelesai} format={formatRupiah} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">
                {salesData.kpis.totalWoSelesaiGunakanPart} WO pengerjaan
              </div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#86EFAC] bg-gradient-to-br from-white to-[#F0FDF4] shadow-sm">
              <div className="text-[12px] font-semibold text-[#15803D]">Total Penjualan Gabungan</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={salesData.kpis.totalPenjualanPartGabungan} format={formatRupiah} />
              </div>
              <div className="text-[11px] text-[#15803D] mt-0.5">POS + Work Order Selesai</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Total Part Terjual</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={salesData.kpis.totalJumlahPartTerjual} /> <span className="text-[14px] font-medium text-[#646B7C]">pcs</span>
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5 truncate">
                Terlaris: {salesData.kpis.partTerlarisNama}
              </div>
            </div>
          </div>

          {/* Sales Charts: Exactly 2 Doughnuts & 1 Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Doughnut 1: Sumber Penjualan Part (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Sumber Penjualan Part"
                centerLabel="Total Nilai"
                centerValue={formatRupiah(salesData.charts.sumberPenjualanDoughnut.totalValue)}
                segments={[
                  {
                    label: 'Kasir POS',
                    value: salesData.charts.sumberPenjualanDoughnut.posValue,
                    formattedValue: formatRupiah(salesData.charts.sumberPenjualanDoughnut.posValue),
                    color: '#3B82F6',
                  },
                  {
                    label: 'Work Order',
                    value: salesData.charts.sumberPenjualanDoughnut.woValue,
                    formattedValue: formatRupiah(salesData.charts.sumberPenjualanDoughnut.woValue),
                    color: '#10B981',
                  },
                ]}
              />
            </div>

            {/* Doughnut 2: Metode Pembayaran POS (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Metode Pembayaran POS"
                centerLabel="Transaksi"
                centerValue={salesData.charts.metodePembayaranDoughnut.total}
                segments={[
                  { label: 'Tunai', value: salesData.charts.metodePembayaranDoughnut.cash, color: '#10B981' },
                  { label: 'Transfer', value: salesData.charts.metodePembayaranDoughnut.transfer, color: '#3B82F6' },
                  { label: 'QRIS / QR', value: salesData.charts.metodePembayaranDoughnut.qr, color: '#8B5CF6' },
                ]}
              />
            </div>

            {/* Bar Chart: Tren Penjualan Part (6 cols) */}
            <div className="lg:col-span-6">
              <ReportBarChart
                title="Tren Penjualan Part (IDR)"
                isCurrency={true}
                labels={salesData.charts.trenPenjualanBarChart.labels}
                series={[
                  { name: 'Kasir POS', data: salesData.charts.trenPenjualanBarChart.posSeries, color: '#3B82F6' },
                  { name: 'Part WO Selesai', data: salesData.charts.trenPenjualanBarChart.woSeries, color: '#10B981' },
                ]}
              />
            </div>
          </div>

          {/* Sales Tables */}
          <DataCard title="Penjualan Part Konsumen (Kasir POS)">
            <DataTable
              columns={posLineColumns}
              data={salesData.tables.posLines}
              keyExtractor={(r, i) => `${r.kodeTransaksi}-${i}`}
              swapKey={`sales-pos-${period.mode}-${period.dateStr}`}
              emptyMessage="Tidak ada penjualan POS pada periode ini."
            />
          </DataCard>

          <DataCard title="Penjualan Part dari Work Order Selesai">
            <DataTable
              columns={woPartSaleColumns}
              data={salesData.tables.woPartLines}
              keyExtractor={(r, i) => `${r.nomorWo}-${i}`}
              swapKey={`sales-wo-parts-${period.mode}-${period.dateStr}`}
              emptyMessage="Tidak ada pemakaian part pada Work Order selesai periode ini."
            />
          </DataCard>

          <DataCard
            title="Performa Penjualan Part"
            actions={
              <input
                type="text"
                value={salesPartSearch}
                onChange={(e) => setSalesPartSearch(e.target.value)}
                placeholder="Cari part..."
                className="admin-input !h-8 text-[12px] w-full sm:w-56"
              />
            }
          >
            <DataTable
              columns={partPerfColumns}
              data={filteredSalesParts}
              keyExtractor={(r) => r.kodePart}
              swapKey={`sales-perf-${period.mode}-${period.dateStr}-${salesPartSearch}`}
              emptyMessage="Tidak ada data performa part pada periode ini."
            />
          </DataCard>
        </section>
      )}

      {/* ============================================================= */}
      {/* 3. SECTION: LAPORAN GUDANG                                    */}
      {/* ============================================================= */}
      {showGudang && (
        <section className="space-y-6 pt-6 border-t border-[#EEF0F4]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#D97706] bg-[#FEF3C7] px-2.5 py-0.5 rounded-full">
                Bagian 3
              </span>
              <h2 className="text-[18px] font-bold text-[#1E2230] mt-1">Laporan Pengelolaan Gudang</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() => handleDownloadCsv('warehouse')}
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'warehouse-csv' ? 'Memproses...' : 'Download CSV'}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('gudang-excel', () =>
                    exportExcelWarehouseReport(warehouseData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'gudang-excel' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export Excel'
                )}
              </ActionButton>
              <ActionButton
                intent="neutral"
                disabled={Boolean(exportingKey)}
                onClick={() =>
                  handleExport('gudang-pdf', () =>
                    exportPdfWarehouseReport(warehouseData)
                  )
                }
                className="!h-8 !text-[12px] disabled:opacity-50"
              >
                {exportingKey === 'gudang-pdf' ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Memproses...
                  </span>
                ) : (
                  'Export PDF'
                )}
              </ActionButton>
            </div>
          </div>

          {/* Warehouse KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Total Item Part</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={warehouseData.kpis.totalItemPart} />
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Katalog terdaftar</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Stok Aman / Kritis</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <span className="text-[#15803D]">{warehouseData.kpis.partAmanCount}</span> /{' '}
                <span className="text-[#B4234A]">{warehouseData.kpis.partKritisCount}</span>
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Kondisi minimum</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Total Stok Fisik</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <RollingNumber value={warehouseData.kpis.totalStokTersedia} /> <span className="text-[14px] font-medium text-[#646B7C]">pcs</span>
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Dari mutasi buku stok</div>
            </div>

            <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
              <div className="text-[12px] text-[#646B7C]">Barang Masuk / Keluar</div>
              <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                <span className="text-[#15803D]">+{warehouseData.kpis.totalBarangMasuk}</span> /{' '}
                <span className="text-[#B4234A]">-{warehouseData.kpis.totalBarangKeluar}</span>
              </div>
              <div className="text-[11px] text-[#9CA3AF] mt-0.5">Mutasi pada periode</div>
            </div>
          </div>

          {/* Warehouse Charts: Exactly 2 Doughnuts & 1 Bar Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Doughnut 1: Kondisi Stok Gudang (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Kondisi Stok Gudang"
                centerLabel="Total Part"
                centerValue={warehouseData.charts.kondisiStokDoughnut.total}
                segments={[
                  { label: 'Aman', value: warehouseData.charts.kondisiStokDoughnut.aman, color: '#10B981' },
                  { label: 'Kritis', value: warehouseData.charts.kondisiStokDoughnut.kritis, color: '#EF4444' },
                ]}
              />
            </div>

            {/* Doughnut 2: Komposisi Pergerakan Stok (3 cols) */}
            <div className="lg:col-span-3">
              <ReportDoughnutChart
                title="Komposisi Pergerakan Stok"
                centerLabel="Unit Qty"
                centerValue={warehouseData.charts.komposisiMutasiDoughnut.total}
                segments={[
                  { label: 'Masuk', value: warehouseData.charts.komposisiMutasiDoughnut.masuk, color: '#10B981' },
                  { label: 'Keluar WO', value: warehouseData.charts.komposisiMutasiDoughnut.keluarWo, color: '#F59E0B' },
                  { label: 'Keluar Kasir', value: warehouseData.charts.komposisiMutasiDoughnut.keluarPenjualan, color: '#3B82F6' },
                  { label: 'Keluar HO', value: warehouseData.charts.komposisiMutasiDoughnut.keluarHo, color: '#8B5CF6' },
                  { label: 'Koreksi', value: warehouseData.charts.komposisiMutasiDoughnut.koreksi, color: '#6B7280' },
                ]}
              />
            </div>

            {/* Bar Chart: Pergerakan Stok (6 cols) */}
            <div className="lg:col-span-6">
              <ReportBarChart
                title="Pergerakan Stok (Pcs)"
                labels={warehouseData.charts.pergerakanStokBarChart.labels}
                series={[
                  { name: 'Stok Masuk', data: warehouseData.charts.pergerakanStokBarChart.masukSeries, color: '#10B981' },
                  { name: 'Stok Keluar', data: warehouseData.charts.pergerakanStokBarChart.keluarSeries, color: '#EF4444' },
                ]}
              />
            </div>
          </div>

          {/* Warehouse Tables */}
          <DataCard
            title="Seluruh Data Part Gudang"
            actions={
              <input
                type="text"
                value={warehousePartSearch}
                onChange={(e) => setWarehousePartSearch(e.target.value)}
                placeholder="Cari kode atau nama part..."
                className="admin-input !h-8 text-[12px] w-full sm:w-56"
              />
            }
          >
            <DataTable
              columns={masterPartColumns}
              data={filteredWarehouseParts}
              keyExtractor={(r) => r.kodePart}
              swapKey={`wh-parts-${period.mode}-${period.dateStr}-${warehousePartSearch}`}
              emptyMessage="Tidak ada data part pada periode ini."
            />
          </DataCard>

          <DataCard title="Riwayat Pergerakan Stok">
            <DataTable
              columns={movementColumns}
              data={warehouseData.tables.movements}
              keyExtractor={(_, i) => String(i)}
              swapKey={`wh-movements-${period.mode}-${period.dateStr}`}
              emptyMessage="Tidak ada pergerakan stok pada periode ini."
            />
          </DataCard>

        </section>
      )}

      {/* ============================================================= */}
      {/* 4. SECTION: RIWAYAT AKTIVITAS ADMIN (MASTER ADMIN)            */}
      {/* ============================================================= */}
      {mode === 'semua' && (
        <section className="space-y-6 pt-4 border-t border-[#EEF0F4]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F172A] bg-[#E2E8F0] px-2.5 py-0.5 rounded-full">
                  Bagian 4
                </span>
                <span className="text-[11px] font-semibold text-[#64748B] bg-slate-100 px-2 py-0.5 rounded">
                  Khusus Master Admin
                </span>
              </div>
              <h2 className="text-[18px] font-bold text-[#1E2230] mt-1">
                Riwayat Aktivitas Admin & Jejak Audit
              </h2>
              <p className="text-[12px] text-[#646B7C]">
                Pencatatan menyeluruh audit transaksi, mutasi data, dan otorisasi operasional seluruh modul sistem
              </p>
            </div>

            {isMasterUnlocked && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[8px] bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-[12px] font-semibold">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]"></span>
                  Terverifikasi: Master Admin ({DUMMY_MASTER.id})
                </span>
                <ActionButton
                  type="button"
                  intent="cancel"
                  onClick={() => {
                    setIsMasterUnlocked(false);
                    notify('Sesi Master Admin ditutup.');
                  }}
                  className="!h-8 !text-[12px]"
                >
                  Kunci Kembali
                </ActionButton>
              </div>
            )}
          </div>

          {!isMasterUnlocked ? (
            <DataCard title="Akses Dibatasi Otorisasi Master Admin">
              <div className="py-10 text-center flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#F1F5F9] border border-[#CBD5E1] flex items-center justify-center text-[#475569]">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#1E2230]">Verifikasi Master Admin Diperlukan</h3>
                  <p className="text-[12px] text-[#646B7C] mt-1 leading-relaxed">
                    Audit trail memuat catatan penting mengenai seluruh aktivitas operasional. Masukkan PIN Master Admin untuk melihat data di layar.
                  </p>
                </div>
                <ActionButton
                  type="button"
                  intent="start"
                  onClick={() => {
                    setPendingExportKind(null);
                    setPinModalOpen(true);
                  }}
                  className="!h-9 !text-[13px] !mt-3"
                >
                  Buka Riwayat Master Admin
                </ActionButton>
              </div>
            </DataCard>
          ) : (
            <div className="space-y-4">
              {/* Filter Controls: Period Toggle, Module Tabs, and Search Input */}
              <div className="p-4 rounded-[16px] bg-white border border-[#E2E8F0] shadow-sm space-y-3">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  {/* Period Toggle */}
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F1F5F9] rounded-[10px]">
                    <button
                      type="button"
                      onClick={() => setAuditPeriodFilter('semua')}
                      className={`px-3 py-2 md:py-1 min-h-[44px] md:min-h-0 text-[12px] font-semibold rounded-[8px] transition-all ${
                        auditPeriodFilter === 'semua'
                          ? 'bg-white text-[#1E2230] shadow-xs'
                          : 'text-[#646B7C] hover:text-[#1E2230]'
                      }`}
                    >
                      Semua Riwayat
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuditPeriodFilter('periode')}
                      className={`px-3 py-2 md:py-1 min-h-[44px] md:min-h-0 text-[12px] font-semibold rounded-[8px] transition-all ${
                        auditPeriodFilter === 'periode'
                          ? 'bg-white text-[#1E2230] shadow-xs'
                          : 'text-[#646B7C] hover:text-[#1E2230]'
                      }`}
                    >
                      Periode Laporan ({serviceData.periodLabel})
                    </button>
                  </div>

                  {/* Search Input */}
                  <div className="relative w-full md:w-72">
                    <input
                      type="text"
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      placeholder="Cari ID log, pelaku, aksi, referensi..."
                      className="admin-input !h-9 text-[12px] w-full pl-8"
                    />
                    <svg
                      className="w-4 h-4 absolute left-2.5 top-2.5 text-[#94A3B8]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  </div>
                </div>

                {/* Module Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 border-t border-[#F1F5F9] text-[12px]">
                  {[
                    { id: 'semua', label: 'Semua Modul' },
                    { id: 'auth', label: 'Otentikasi' },
                    { id: 'servis', label: 'Servis & WO' },
                    { id: 'penjualan', label: 'Penjualan' },
                    { id: 'gudang', label: 'Gudang & Mutasi' },
                    { id: 'persetujuan', label: 'Persetujuan' },
                    { id: 'laporan', label: 'Ekspor Laporan' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setAuditModuleFilter(tab.id)}
                      className={`px-3 py-1 rounded-[8px] font-medium whitespace-nowrap transition-colors ${
                        auditModuleFilter === tab.id
                          ? 'bg-[#1E293B] text-white shadow-xs'
                          : 'bg-[#F8FAFC] text-[#475569] hover:bg-[#EEF2F6]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audit Summary KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
                  <div className="text-[11px] text-[#646B7C]">Total Catatan</div>
                  <div className="text-[20px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
                    <RollingNumber value={filteredAuditLogs.length} />
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5">Entri tersaring</div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
                  <div className="text-[11px] text-[#646B7C]">Transaksi Bisnis</div>
                  <div className="text-[20px] font-extrabold text-[#1D6FC4] mt-1 tabular-nums">
                    <RollingNumber
                      value={filteredAuditLogs.filter((l) => l.category === 'bisnis').length}
                    />
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5">Operasional & kasir</div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
                  <div className="text-[11px] text-[#646B7C]">Akses & Sistem</div>
                  <div className="text-[20px] font-extrabold text-[#475569] mt-1 tabular-nums">
                    <RollingNumber
                      value={filteredAuditLogs.filter((l) => l.category === 'akses').length}
                    />
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5">Login, logout & ekspor</div>
                </div>

                <div className="p-3.5 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
                  <div className="text-[11px] text-[#646B7C]">Operasi Sukses</div>
                  <div className="text-[20px] font-extrabold text-[#15803D] mt-1 tabular-nums">
                    <RollingNumber
                      value={filteredAuditLogs.filter((l) => l.outcome === 'berhasil').length}
                    />
                  </div>
                  <div className="text-[10px] text-[#9CA3AF] mt-0.5">Operasi terverifikasi</div>
                </div>
              </div>

              {/* Audit Table */}
              <DataCard
                title="Daftar Rekam Aktivitas & Jejak Perubahan"
                actions={
                  <div className="text-[12px] text-[#646B7C]">
                    Menampilkan <strong className="text-[#1E2230]">{filteredAuditLogs.length}</strong> entri
                  </div>
                }
              >
                <DataTable
                  columns={auditColumns}
                  data={filteredAuditLogs}
                  keyExtractor={(l) => l.id}
                  swapKey={`audit-table-${auditPeriodFilter}-${auditModuleFilter}-${auditSearch}`}
                  emptyMessage="Tidak ada catatan audit yang cocok dengan filter."
                />
              </DataCard>
            </div>
          )}
        </section>
      )}

      {/* Export PIN Verification Modal */}
      <ExportPinModal
        isOpen={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingExportKind(null);
        }}
        exportType={pendingExportKind === 'pdf' ? 'PDF' : 'Excel'}
        periodLabel={serviceData.periodLabel}
        onVerified={handlePinVerified}
      />

      {/* Master Admin Audit Detail Dialog */}
      <CenterDialog
        isOpen={Boolean(selectedAuditLog)}
        onClose={() => setSelectedAuditLog(null)}
        title={selectedAuditLog ? `Detail Audit: ${selectedAuditLog.id}` : 'Detail Audit'}
        subtitle="Snapshot data lengkap jejak audit sistem MyBengkel"
        maxWidthClass="max-w-[620px]"
        footer={
          <ActionButton type="button" intent="cancel" onClick={() => setSelectedAuditLog(null)}>
            Tutup
          </ActionButton>
        }
      >
        {selectedAuditLog && (
          <div className="space-y-4 text-[13px]">
            {/* Overview Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[12px]">
              <div>
                <span className="text-[11px] text-[#646B7C] block">Waktu Kejadian</span>
                <span className="font-mono font-semibold text-[#1E2230]">
                  {selectedAuditLog.occurredAt}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Kategori Log</span>
                <span className="font-medium text-[#1E2230] capitalize">
                  {selectedAuditLog.category === 'bisnis' ? 'Transaksi Bisnis' : 'Akses & Otentikasi'}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Pelaku</span>
                <span className="font-medium text-[#1E2230]">
                  {selectedAuditLog.actorName}{' '}
                  <samp className="font-mono text-[11px] text-[#475569] bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1]">
                    {selectedAuditLog.actorId}
                  </samp>
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Role Pelaku</span>
                <span className="font-mono text-[11px] font-semibold text-[#334155] capitalize">
                  {selectedAuditLog.actorRole.replace('_', ' ')}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Modul & Event</span>
                <span className="font-mono text-[11px] text-[#1E2230]">
                  {selectedAuditLog.module} / {selectedAuditLog.event}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Status Hasil</span>
                <StatusChip
                  status={selectedAuditLog.outcome === 'berhasil' ? 'Selesai' : 'Ditolak'}
                />
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Entitas Terkait</span>
                <span className="font-mono text-[12px] text-[#1E2230]">
                  {selectedAuditLog.entityType}: {selectedAuditLog.entityId}
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[#646B7C] block">Nomor Referensi</span>
                <span className="font-mono text-[12px] font-semibold text-[#1A64B0]">
                  {selectedAuditLog.reference || '-'}
                </span>
              </div>
            </div>

            {/* Action & Reason */}
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                Deskripsi Aktivitas
              </span>
              <p className="p-3 bg-white border border-[#E2E8F0] rounded-[10px] text-[#1E2230] leading-relaxed">
                {selectedAuditLog.action}
              </p>
            </div>

            {selectedAuditLog.reason && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                  Alasan / Catatan
                </span>
                <p className="p-3 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] text-[#92400E]">
                  {selectedAuditLog.reason}
                </p>
              </div>
            )}

            {/* Before / After Data Snapshots */}
            {selectedAuditLog.beforeData && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                  Snapshot Data Sebelum
                </span>
                <pre className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] font-mono text-[11px] text-[#334155] overflow-x-auto max-h-36">
                  {typeof selectedAuditLog.beforeData === 'string'
                    ? selectedAuditLog.beforeData
                    : JSON.stringify(maskSensitiveData(selectedAuditLog.beforeData), null, 2)}
                </pre>
              </div>
            )}

            {selectedAuditLog.afterData && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                  Snapshot Data Sesudah
                </span>
                <pre className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] font-mono text-[11px] text-[#334155] overflow-x-auto max-h-36">
                  {typeof selectedAuditLog.afterData === 'string'
                    ? selectedAuditLog.afterData
                    : JSON.stringify(maskSensitiveData(selectedAuditLog.afterData), null, 2)}
                </pre>
              </div>
            )}

            {selectedAuditLog.metadata && Object.keys(selectedAuditLog.metadata).length > 0 && (
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-[#475569] uppercase tracking-wider">
                  Metadata Tambahan
                </span>
                <pre className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-[10px] font-mono text-[11px] text-[#334155] overflow-x-auto max-h-28">
                  {JSON.stringify(maskSensitiveData(selectedAuditLog.metadata), null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </CenterDialog>
    </div>
  );
};

// Dedicated views for individual report routes
export const LaporanSemua: React.FC = () => <AdminReports mode="semua" />;
export const LaporanServis: React.FC = () => <AdminReports mode="servis" />;
export const LaporanPenjualan: React.FC = () => <AdminReports mode="penjualan" />;
export const LaporanGudang: React.FC = () => <AdminReports mode="gudang" />;

export default AdminReports;
