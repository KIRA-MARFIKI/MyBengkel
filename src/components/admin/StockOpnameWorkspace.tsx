import React, { useMemo, useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { DataCard } from './DataCard';
import { DataTable, Column } from './DataTable';
import {
  ActionButton,
  PlusIconButton,
  PrinterIcon,
} from './ActionButton';
import { StatusChip } from './StatusChip';
import { CenterDialog } from './CenterDialog';
import { FormField } from './FormField';
import { useActionIsland } from './island/IslandSystem';
import { formatRupiah, todayISO } from '../../lib/format';
import { printDocument } from '../../lib/printDocument';
import {
  StockOpnameSession,
  StockOpnameLine,
  StockOpnameScope,
  StockOpnameStatus,
  STOCK_OPNAME_STATUS_LABELS,
  buildPrintStokOpnameData,
} from '../../lib/stockOpname';
import { VerifiedWarehouseUser } from '../../lib/mockCredentials';

interface StockOpnameWorkspaceProps {
  verifiedUser: VerifiedWarehouseUser;
}

export const StockOpnameWorkspace: React.FC<StockOpnameWorkspaceProps> = ({
  verifiedUser,
}) => {
  const {
    parts,
    stockMovements,
    stockOpnames,
    createStockOpnameRecord,
    saveStockOpnameLineCount,
    submitStockOpnameRecord,
    requestStockOpnameRecountRecord,
    approveStockOpnameRecord,
    rejectStockOpnameRecord,
    cancelStockOpnameRecord,
  } = useAdmin();
  const { notify } = useActionIsland();

  const isMasterGudang = verifiedUser.role === 'master_gudang';

  // Active view: session list or specific session detail/counting
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Filters for session list
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [listSearch, setListSearch] = useState<string>('');

  // Counting workspace search and filter
  const [countSearch, setCountSearch] = useState<string>('');
  const [countFilter, setCountFilter] = useState<'all' | 'sesuai' | 'selisih' | 'belum'>('all');

  // Modals
  const [newModalOpen, setNewModalOpen] = useState<boolean>(false);
  const [newScope, setNewScope] = useState<StockOpnameScope>('semua');
  const [newNotes, setNewNotes] = useState<string>('');

  const [recountModalOpen, setRecountModalOpen] = useState<boolean>(false);
  const [recountReason, setRecountReason] = useState<string>('');
  const [recountError, setRecountError] = useState<string>('');

  const [rejectModalOpen, setRejectModalOpen] = useState<boolean>(false);
  const [rejectReason, setRejectReason] = useState<string>('');
  const [rejectError, setRejectError] = useState<string>('');

  // Resolve current active session
  const currentSession = useMemo(
    () => stockOpnames.find((s) => s.id === activeSessionId || s.code === activeSessionId) ?? null,
    [stockOpnames, activeSessionId]
  );

  // Filtered session list
  const filteredSessions = useMemo(() => {
    let list = stockOpnames;
    if (statusFilter !== 'all') {
      list = list.filter((s) => s.status === statusFilter);
    }
    const q = listSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.createdByName.toLowerCase().includes(q) ||
        (s.notes && s.notes.toLowerCase().includes(q))
    );
  }, [stockOpnames, statusFilter, listSearch]);

  // Counting workspace filtered lines
  const filteredLines = useMemo(() => {
    if (!currentSession) return [];
    let lines = currentSession.lines;

    if (countFilter === 'sesuai') {
      lines = lines.filter((l) => l.physicalQty !== null && (l.varianceQty ?? 0) === 0);
    } else if (countFilter === 'selisih') {
      lines = lines.filter((l) => l.physicalQty !== null && (l.varianceQty ?? 0) !== 0);
    } else if (countFilter === 'belum') {
      lines = lines.filter((l) => l.physicalQty === null);
    }

    const q = countSearch.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter(
      (l) =>
        l.partCodeSnapshot.toLowerCase().includes(q) ||
        l.partNameSnapshot.toLowerCase().includes(q)
    );
  }, [currentSession, countFilter, countSearch]);

  // Statistics for current session
  const sessionStats = useMemo(() => {
    if (!currentSession) {
      return {
        total: 0,
        counted: 0,
        uncounted: 0,
        match: 0,
        surplus: 0,
        deficit: 0,
        missingReason: 0,
      };
    }
    const total = currentSession.lines.length;
    let counted = 0;
    let match = 0;
    let surplus = 0;
    let deficit = 0;
    let missingReason = 0;

    for (const l of currentSession.lines) {
      if (l.physicalQty !== null) {
        counted++;
        const v = l.varianceQty ?? 0;
        if (v === 0) {
          match++;
        } else if (v > 0) {
          surplus++;
          if (!l.varianceReason || l.varianceReason.trim().length < 5) missingReason++;
        } else {
          deficit++;
          if (!l.varianceReason || l.varianceReason.trim().length < 5) missingReason++;
        }
      }
    }

    return {
      total,
      counted,
      uncounted: total - counted,
      match,
      surplus,
      deficit,
      missingReason,
    };
  }, [currentSession]);

  // -------------------------------------------------------------
  // HANDLERS: CREATION, COUNT, SUBMISSION, APPROVAL
  // -------------------------------------------------------------

  const handleCreateSession = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const res = createStockOpnameRecord({
      scope: newScope,
      notes: newNotes,
      user: verifiedUser,
    });
    if (!res.ok || !res.session) {
      notify(res.error || 'Gagal membuat sesi stok opname.');
      return;
    }
    setNewModalOpen(false);
    setNewNotes('');
    setActiveSessionId(res.session.id);
    notify(`Sesi ${res.session.code} dibuat. Silakan masukkan hasil hitung fisik.`);
  };

  const handleUpdateLineQty = (lineId: string, valStr: string) => {
    if (!currentSession) return;
    if (valStr.trim() === '') {
      // Clear line count
      saveStockOpnameLineCount({
        sessionId: currentSession.id,
        lineId,
        physicalQty: 0,
        varianceReason: '',
        user: verifiedUser,
      });
      return;
    }
    const parsed = Number(valStr);
    if (Number.isNaN(parsed) || parsed < 0) return;
    const currentLine = currentSession.lines.find((l) => l.id === lineId);
    saveStockOpnameLineCount({
      sessionId: currentSession.id,
      lineId,
      physicalQty: parsed,
      varianceReason: currentLine?.varianceReason,
      user: verifiedUser,
    });
  };

  const handleUpdateLineReason = (lineId: string, reason: string) => {
    if (!currentSession) return;
    const currentLine = currentSession.lines.find((l) => l.id === lineId);
    if (!currentLine || currentLine.physicalQty === null) return;
    saveStockOpnameLineCount({
      sessionId: currentSession.id,
      lineId,
      physicalQty: currentLine.physicalQty,
      varianceReason: reason,
      user: verifiedUser,
    });
  };

  const handleSubmitSession = () => {
    if (!currentSession) return;
    if (sessionStats.uncounted > 0) {
      notify(`Masih ada ${sessionStats.uncounted} part yang belum dihitung fisiknya.`);
      return;
    }
    if (sessionStats.missingReason > 0) {
      notify(`Ada ${sessionStats.missingReason} part berselisih yang belum diisi alasan (min 5 karakter).`);
      return;
    }

    const res = submitStockOpnameRecord({
      sessionId: currentSession.id,
      user: verifiedUser,
    });
    if (!res.ok) {
      notify(res.error || 'Gagal mengajukan sesi stok opname.');
      return;
    }
    notify(`Stok Opname ${currentSession.code} menunggu persetujuan.`);
  };

  const handleApproveSession = () => {
    if (!currentSession || !isMasterGudang) return;
    const res = approveStockOpnameRecord({
      sessionId: currentSession.id,
      user: verifiedUser,
    });
    if (!res.ok) {
      notify(res.error || 'Gagal menyetujui sesi stok opname.');
      return;
    }
    notify(`Stok Opname ${currentSession.code} disetujui. Buku stok telah diperbarui.`);
  };

  const handleConfirmRecount = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentSession || !isMasterGudang) return;
    if (recountReason.trim().length < 5) {
      setRecountError('Alasan permintaan hitung ulang minimal 5 karakter.');
      return;
    }
    const res = requestStockOpnameRecountRecord({
      sessionId: currentSession.id,
      user: verifiedUser,
      reason: recountReason,
    });
    if (!res.ok) {
      setRecountError(res.error || 'Gagal meminta hitung ulang.');
      return;
    }
    setRecountModalOpen(false);
    setRecountReason('');
    notify(`Permintaan hitung ulang ${currentSession.code} dikirim ke Admin Gudang.`);
  };

  const handleConfirmReject = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentSession || !isMasterGudang) return;
    if (rejectReason.trim().length < 5) {
      setRejectError('Alasan penolakan minimal 5 karakter.');
      return;
    }
    const res = rejectStockOpnameRecord({
      sessionId: currentSession.id,
      user: verifiedUser,
      reason: rejectReason,
    });
    if (!res.ok) {
      setRejectError(res.error || 'Gagal menolak sesi.');
      return;
    }
    setRejectModalOpen(false);
    setRejectReason('');
    notify(`Stok Opname ${currentSession.code} ditolak.`);
  };

  const handlePrintApprovedSession = (session: StockOpnameSession) => {
    if (!isMasterGudang) {
      notify('Hanya Master Gudang yang memiliki wewenang mencetak dokumen resmi.');
      return;
    }
    if (session.status !== 'disetujui') {
      notify('Hanya sesi yang sudah disetujui yang dapat dicetak sebagai laporan resmi.');
      return;
    }
    const printData = buildPrintStokOpnameData(session);
    printDocument('stok_opname', printData);
  };

  // -------------------------------------------------------------
  // COLUMNS: HISTORY TABLE
  // -------------------------------------------------------------
  const historyColumns: Column<StockOpnameSession>[] = [
    {
      key: 'code',
      header: 'Kode Opname',
      render: (s) => (
        <samp className="font-mono font-semibold text-[#1A64B0] text-[13px]">{s.code}</samp>
      ),
    },
    {
      key: 'startedAt',
      header: 'Tanggal',
      render: (s) => <span className="tabular-nums text-[13px] text-[#646B7C]">{s.startedAt}</span>,
    },
    {
      key: 'createdByName',
      header: 'Petugas',
      render: (s) => <span className="font-medium text-[#1E2230]">{s.createdByName}</span>,
    },
    {
      key: 'scope',
      header: 'Cakupan',
      align: 'center',
      render: (s) => (
        <span className="uppercase text-[11px] font-mono px-2 py-0.5 rounded bg-[#EEF0F4] font-semibold">
          {s.scope}
        </span>
      ),
    },
    {
      key: 'totalPart',
      header: 'Jumlah Part',
      align: 'center',
      render: (s) => <span className="tabular-nums font-semibold">{s.lines.length}</span>,
    },
    {
      key: 'countedPart',
      header: 'Dihitung',
      align: 'center',
      render: (s) => {
        const c = s.lines.filter((l) => l.physicalQty !== null).length;
        return <span className="tabular-nums">{c}</span>;
      },
    },
    {
      key: 'variancePart',
      header: 'Part Selisih',
      align: 'center',
      render: (s) => {
        const sel = s.lines.filter((l) => l.physicalQty !== null && (l.varianceQty ?? 0) !== 0).length;
        return (
          <span className={`tabular-nums font-bold ${sel > 0 ? 'text-[#DC2626]' : 'text-[#166534]'}`}>
            {sel}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      render: (s) => <StatusChip status={s.status} />,
    },
    {
      key: 'approvedByName',
      header: 'Disetujui Oleh',
      render: (s) => <span className="text-[12px] text-[#646B7C]">{s.approvedByName || '-'}</span>,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'center',
      render: (s) => (
        <div className="flex items-center justify-center gap-1.5">
          {s.status === 'berjalan' || s.status === 'perlu_hitung_ulang' ? (
            <ActionButton
              intent="start"
              onClick={() => setActiveSessionId(s.id)}
              className="!h-7 !text-[11px] !px-2.5"
            >
              Hitung Fisik
            </ActionButton>
          ) : s.status === 'menunggu_persetujuan' && isMasterGudang ? (
            <ActionButton
              intent="start"
              onClick={() => setActiveSessionId(s.id)}
              className="!h-7 !text-[11px] !px-2.5"
            >
              Tinjau & Setujui
            </ActionButton>
          ) : (
            <ActionButton
              intent="neutral"
              onClick={() => setActiveSessionId(s.id)}
              className="!h-7 !text-[11px] !px-2.5"
            >
              Rincian
            </ActionButton>
          )}

          {s.status === 'disetujui' && isMasterGudang && (
            <button
              type="button"
              title="Cetak Dokumen Resmi"
              onClick={(e) => {
                e.stopPropagation();
                handlePrintApprovedSession(s);
              }}
              className="w-7 h-7 rounded-[8px] border border-[#EEF0F4] hover:bg-[#F3F4F6] text-[#1E2230] flex items-center justify-center transition-colors"
            >
              <PrinterIcon />
            </button>
          )}
        </div>
      ),
    },
  ];

  // -------------------------------------------------------------
  // RENDER: COUNTING WORKSPACE
  // -------------------------------------------------------------
  if (currentSession) {
    const isSessionEditable =
      (currentSession.status === 'berjalan' || currentSession.status === 'perlu_hitung_ulang');
    const isAwaitingMasterApproval =
      currentSession.status === 'menunggu_persetujuan' && isMasterGudang;

    return (
      <div className="space-y-6">
        {/* Top Header Workspace */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <button
                type="button"
                onClick={() => setActiveSessionId(null)}
                className="text-[12px] font-semibold text-[#1A64B0] hover:underline flex items-center gap-1"
              >
                &larr; Riwayat Sesi
              </button>
              <span className="text-[#9CA3AF]">&bull;</span>
              <samp className="font-mono font-bold text-[16px] text-[#1E2230]">
                {currentSession.code}
              </samp>
              <StatusChip status={currentSession.status} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[12px] text-[#646B7C]">
              <span>
                Cakupan: <strong className="text-[#1E2230] uppercase">{currentSession.scope}</strong>
              </span>
              <span>&bull;</span>
              <span>
                Petugas: <strong className="text-[#1E2230]">{currentSession.createdByName}</strong>
              </span>
              <span>&bull;</span>
              <span>
                Mulai: <strong className="text-[#1E2230]">{currentSession.createdAt}</strong>
              </span>
              {currentSession.approvedByName && (
                <>
                  <span>&bull;</span>
                  <span>
                    Disetujui: <strong className="text-[#15803D]">{currentSession.approvedByName} ({currentSession.approvedAt})</strong>
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex items-center gap-2">
            {currentSession.status === 'disetujui' && isMasterGudang && (
              <ActionButton
                intent="neutral"
                onClick={() => handlePrintApprovedSession(currentSession)}
                className="!h-8 !text-[12px]"
              >
                <PrinterIcon /> Cetak Laporan Resmi
              </ActionButton>
            )}
            <ActionButton
              intent="cancel"
              onClick={() => setActiveSessionId(null)}
              className="!h-8 !text-[12px]"
            >
              Tutup
            </ActionButton>
          </div>
        </div>

        {/* Status Alerts */}
        {currentSession.status === 'perlu_hitung_ulang' && (
          <div className="p-3.5 rounded-[12px] bg-[#FEF3C7] border border-[#FDE68A] text-[#B45309] text-[13px] flex items-start gap-2.5">
            <span className="font-bold text-[14px]">&#9888;</span>
            <div>
              <strong className="font-bold">Permintaan Hitung Ulang:</strong>
              <p className="mt-0.5">{currentSession.recountReason}</p>
            </div>
          </div>
        )}

        {currentSession.status === 'ditolak' && (
          <div className="p-3.5 rounded-[12px] bg-[#FEE2E2] border border-[#FCA5A5] text-[#991B1B] text-[13px] flex items-start gap-2.5">
            <span className="font-bold text-[14px]">&times;</span>
            <div>
              <strong className="font-bold">Sesi Ditolak:</strong>
              <p className="mt-0.5">{currentSession.rejectionReason}</p>
            </div>
          </div>
        )}

        {currentSession.status === 'menunggu_persetujuan' && !isMasterGudang && (
          <div className="p-3.5 rounded-[12px] bg-[#E4F2FE] border border-[#BFDBFE] text-[#1A64B0] text-[13px]">
            Sesi ini telah diajukan ke Master Gudang. Data terkunci dari pengeditan sampai keputusan persetujuan diberikan.
          </div>
        )}

        {/* Summary Count Statistics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Total Part</div>
            <div className="text-[18px] font-extrabold text-[#1E2230] mt-0.5 tabular-nums">
              {sessionStats.total}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Sudah Dihitung</div>
            <div className="text-[18px] font-extrabold text-[#15803D] mt-0.5 tabular-nums">
              {sessionStats.counted}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Belum Dihitung</div>
            <div className={`text-[18px] font-extrabold mt-0.5 tabular-nums ${sessionStats.uncounted > 0 ? 'text-[#B45309]' : 'text-[#646B7C]'}`}>
              {sessionStats.uncounted}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Sesuai</div>
            <div className="text-[18px] font-extrabold text-[#166534] mt-0.5 tabular-nums">
              {sessionStats.match}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Lebih (Surplus)</div>
            <div className="text-[18px] font-extrabold text-[#1D6FC4] mt-0.5 tabular-nums">
              +{sessionStats.surplus}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Kurang (Defisit)</div>
            <div className="text-[18px] font-extrabold text-[#DC2626] mt-0.5 tabular-nums">
              -{sessionStats.deficit}
            </div>
          </div>
          <div className="p-3 rounded-[12px] bg-white border border-[#EEF0F4] shadow-sm">
            <div className="text-[11px] text-[#646B7C]">Alasan Kurang Lengkap</div>
            <div className={`text-[18px] font-extrabold mt-0.5 tabular-nums ${sessionStats.missingReason > 0 ? 'text-[#DC2626]' : 'text-[#166534]'}`}>
              {sessionStats.missingReason}
            </div>
          </div>
        </div>

        {/* Counting Table Card */}
        <DataCard
          title="Penghitungan Stok Fisik"
          actions={
            <div className="flex flex-wrap items-center gap-2.5">
              <input
                type="text"
                value={countSearch}
                onChange={(e) => setCountSearch(e.target.value)}
                placeholder="Cari kode atau nama part..."
                className="admin-input !h-8 text-[12px] w-48 sm:w-56"
              />
              <div className="flex items-center gap-1 p-0.5 bg-[#F3F4F6] rounded-[8px] text-[12px]">
                <button
                  type="button"
                  onClick={() => setCountFilter('all')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-all ${
                    countFilter === 'all' ? 'bg-white shadow-sm text-[#1E2230]' : 'text-[#646B7C]'
                  }`}
                >
                  Semua
                </button>
                <button
                  type="button"
                  onClick={() => setCountFilter('sesuai')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-all ${
                    countFilter === 'sesuai' ? 'bg-white shadow-sm text-[#1E2230]' : 'text-[#646B7C]'
                  }`}
                >
                  Sesuai
                </button>
                <button
                  type="button"
                  onClick={() => setCountFilter('selisih')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-all ${
                    countFilter === 'selisih' ? 'bg-white shadow-sm text-[#1E2230]' : 'text-[#646B7C]'
                  }`}
                >
                  Selisih
                </button>
                <button
                  type="button"
                  onClick={() => setCountFilter('belum')}
                  className={`px-2.5 py-1 rounded-[6px] font-medium transition-all ${
                    countFilter === 'belum' ? 'bg-white shadow-sm text-[#1E2230]' : 'text-[#646B7C]'
                  }`}
                >
                  Belum Dihitung
                </button>
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-[#EEF0F4] bg-[#F9FAFB] text-[#646B7C] font-semibold text-[12px]">
                  <th className="py-2.5 px-3">Kode Part</th>
                  <th className="py-2.5 px-3">Nama Part</th>
                  <th className="py-2.5 px-3 text-center">Satuan</th>
                  <th className="py-2.5 px-3 text-center">Jenis</th>
                  <th className="py-2.5 px-3 text-right">Stok Sistem Saat Hitung</th>
                  <th className="py-2.5 px-3 text-center">Stok Fisik</th>
                  <th className="py-2.5 px-3 text-center">Selisih</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Alasan Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF0F4]">
                {filteredLines.map((line) => {
                  const hasCount = line.physicalQty !== null;
                  const variance = line.varianceQty ?? 0;
                  const isMatch = hasCount && variance === 0;
                  const isSurplus = hasCount && variance > 0;
                  const isDeficit = hasCount && variance < 0;

                  return (
                    <tr
                      key={line.id}
                      className={`hover:bg-[#FAFBFD] transition-colors ${
                        !hasCount ? 'bg-[#FFFBEB]/30' : ''
                      }`}
                    >
                      <td className="py-3 px-3 font-mono font-semibold text-[#1A64B0]">
                        {line.partCodeSnapshot}
                      </td>
                      <td className="py-3 px-3 font-medium text-[#1E2230]">
                        {line.partNameSnapshot}
                      </td>
                      <td className="py-3 px-3 text-center text-[#646B7C]">
                        {line.unitSnapshot}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="uppercase text-[11px] font-mono px-2 py-0.5 rounded bg-[#EEF0F4]">
                          {line.partTypeSnapshot}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums font-semibold text-[#1E2230]">
                        {line.systemQtyAtCount}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isSessionEditable ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={line.physicalQty ?? ''}
                            onChange={(e) => handleUpdateLineQty(line.id, e.target.value)}
                            placeholder="0"
                            className="admin-input !h-8 w-20 text-center font-bold tabular-nums"
                          />
                        ) : (
                          <strong className="tabular-nums font-bold text-[14px]">
                            {line.physicalQty ?? '-'}
                          </strong>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center tabular-nums">
                        {!hasCount ? (
                          <span className="text-[#9CA3AF]">-</span>
                        ) : isSurplus ? (
                          <span className="px-2 py-0.5 rounded font-bold text-[#1D6FC4] bg-[#E4F2FE]">
                            +{variance}
                          </span>
                        ) : isDeficit ? (
                          <span className="px-2 py-0.5 rounded font-bold text-[#DC2626] bg-[#FEE2E2]">
                            {variance}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded font-semibold text-[#166534] bg-[#DCFCE7]">
                            0 (Sesuai)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {!hasCount ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F4F6] text-[#646B7C]">
                            Belum Dihitung
                          </span>
                        ) : isMatch ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#DEF7EC] text-[#03543F]">
                            Sesuai
                          </span>
                        ) : isSurplus ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#E4F2FE] text-[#1A64B0]">
                            Lebih
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#FDE3E9] text-[#B4234A]">
                            Kurang
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        {!hasCount || isMatch ? (
                          <span className="text-[#9CA3AF] text-[12px]">-</span>
                        ) : isSessionEditable ? (
                          <input
                            type="text"
                            value={line.varianceReason || ''}
                            onChange={(e) => handleUpdateLineReason(line.id, e.target.value)}
                            placeholder="Alasan selisih (wajib min 5 karakter)..."
                            className={`admin-input !h-8 text-[12px] w-full ${
                              !line.varianceReason || line.varianceReason.trim().length < 5
                                ? 'border-[#EF4444] bg-[#FEF2F2]/40'
                                : ''
                            }`}
                          />
                        ) : (
                          <span className="text-[12px] text-[#374151]">
                            {line.varianceReason || '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </DataCard>

        {/* Bottom Operational Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm">
          <div className="text-[12px] text-[#646B7C]">
            {isSessionEditable ? (
              <span>
                Simpan draft setiap saat. Pengajuan persetujuan mengunci formulir untuk ditinjau oleh Master Gudang.
              </span>
            ) : isAwaitingMasterApproval ? (
              <span className="font-semibold text-[#B45309]">
                Persetujuan akan memutasi buku stok gudang secara otomatis dengan tipe &quot;koreksi&quot;.
              </span>
            ) : (
              <span>Sesi ini berstatus <strong>{STOCK_OPNAME_STATUS_LABELS[currentSession.status]}</strong>.</span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {isSessionEditable && (
              <>
                <ActionButton
                  intent="neutral"
                  onClick={() => notify(`Draft ${currentSession.code} disimpan.`)}
                  className="!h-9 !text-[13px]"
                >
                  Simpan Draft
                </ActionButton>
                <ActionButton
                  intent="start"
                  onClick={handleSubmitSession}
                  className="!h-9 !text-[13px]"
                >
                  Ajukan Persetujuan
                </ActionButton>
              </>
            )}

            {isAwaitingMasterApproval && (
              <>
                <ActionButton
                  intent="start"
                  onClick={handleApproveSession}
                  className="!h-9 !text-[13px]"
                >
                  Setujui Stok Opname
                </ActionButton>
                <ActionButton
                  intent="wait"
                  onClick={() => {
                    setRecountReason('');
                    setRecountError('');
                    setRecountModalOpen(true);
                  }}
                  className="!h-9 !text-[13px]"
                >
                  Minta Hitung Ulang
                </ActionButton>
                <ActionButton
                  intent="cancel"
                  onClick={() => {
                    setRejectReason('');
                    setRejectError('');
                    setRejectModalOpen(true);
                  }}
                  className="!h-9 !text-[13px]"
                >
                  Tolak Opname
                </ActionButton>
              </>
            )}

            <ActionButton
              intent="cancel"
              onClick={() => setActiveSessionId(null)}
              className="!h-9 !text-[13px]"
            >
              Kembali ke Daftar
            </ActionButton>
          </div>
        </div>

        {/* Modal: Minta Hitung Ulang */}
        <CenterDialog
          isOpen={recountModalOpen}
          onClose={() => setRecountModalOpen(false)}
          title="Minta Hitung Ulang Stok Opname"
          subtitle={`Sesi ${currentSession.code}`}
          maxWidthClass="max-w-[440px]"
          footer={
            <>
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => setRecountModalOpen(false)}
              >
                Batal
              </ActionButton>
              <ActionButton
                type="button"
                intent="wait"
                onClick={() => handleConfirmRecount()}
              >
                Kirim Permintaan
              </ActionButton>
            </>
          }
        >
          <form onSubmit={handleConfirmRecount} className="space-y-4">
            <FormField
              id="recount-reason"
              label="Alasan Permintaan Hitung Ulang"
              error={recountError}
            >
              <textarea
                id="recount-reason"
                rows={3}
                value={recountReason}
                onChange={(e) => {
                  setRecountReason(e.target.value);
                  if (recountError) setRecountError('');
                }}
                placeholder="Tuliskan part atau instruksi yang harus dihitung ulang..."
                className="admin-input"
              />
            </FormField>
          </form>
        </CenterDialog>

        {/* Modal: Tolak Opname */}
        <CenterDialog
          isOpen={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          title="Tolak Sesi Stok Opname"
          subtitle={`Sesi ${currentSession.code}`}
          maxWidthClass="max-w-[440px]"
          footer={
            <>
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => setRejectModalOpen(false)}
              >
                Batal
              </ActionButton>
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => handleConfirmReject()}
              >
                Tolak Opname
              </ActionButton>
            </>
          }
        >
          <form onSubmit={handleConfirmReject} className="space-y-4">
            <FormField
              id="reject-reason"
              label="Alasan Penolakan"
              error={rejectError}
            >
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => {
                  setRejectReason(e.target.value);
                  if (rejectError) setRejectError('');
                }}
                placeholder="Tuliskan alasan penolakan sesi stok opname..."
                className="admin-input"
              />
            </FormField>
          </form>
        </CenterDialog>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: SESSION LIST & HISTORY VIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm">
        <div>
          <h2 className="text-[18px] font-bold text-[#1E2230]">
            Audit Persediaan &amp; Stok Opname
          </h2>
          <p className="text-[13px] text-[#646B7C] mt-0.5">
            Pemeriksaan fisik barang, rekonsiliasi selisih, dan koreksi mutasi buku stok
          </p>
        </div>

        <ActionButton
          intent="start"
          onClick={() => {
            setNewScope('semua');
            setNewNotes('');
            setNewModalOpen(true);
          }}
          className="!h-9 !text-[13px]"
        >
          <PlusIconButton title="" ariaLabel="" className="!w-4 !h-4" /> Stok Opname Baru
        </ActionButton>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
          <div className="text-[12px] text-[#646B7C]">Total Sesi</div>
          <div className="text-[22px] font-extrabold text-[#1E2230] mt-1 tabular-nums">
            {stockOpnames.length}
          </div>
          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Sesi terdaftar</div>
        </div>

        <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
          <div className="text-[12px] text-[#646B7C]">Berjalan</div>
          <div className="text-[22px] font-extrabold text-[#1A64B0] mt-1 tabular-nums">
            {stockOpnames.filter((s) => s.status === 'berjalan').length}
          </div>
          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Proses hitung</div>
        </div>

        <div className="p-4 rounded-[14px] bg-white border border-[#FEF3C7] shadow-sm">
          <div className="text-[12px] font-semibold text-[#B45309]">Menunggu Persetujuan</div>
          <div className="text-[22px] font-extrabold text-[#B45309] mt-1 tabular-nums">
            {stockOpnames.filter((s) => s.status === 'menunggu_persetujuan').length}
          </div>
          <div className="text-[11px] text-[#B45309] mt-0.5">Perlu tinjauan Master</div>
        </div>

        <div className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm">
          <div className="text-[12px] text-[#646B7C]">Perlu Hitung Ulang</div>
          <div className="text-[22px] font-extrabold text-[#D97706] mt-1 tabular-nums">
            {stockOpnames.filter((s) => s.status === 'perlu_hitung_ulang').length}
          </div>
          <div className="text-[11px] text-[#9CA3AF] mt-0.5">Revisi penghitungan</div>
        </div>

        <div className="p-4 rounded-[14px] bg-white border border-[#DEF7EC] shadow-sm">
          <div className="text-[12px] font-semibold text-[#03543F]">Disetujui Resmi</div>
          <div className="text-[22px] font-extrabold text-[#15803D] mt-1 tabular-nums">
            {stockOpnames.filter((s) => s.status === 'disetujui').length}
          </div>
          <div className="text-[11px] text-[#03543F] mt-0.5">Buku stok termutasi</div>
        </div>
      </div>

      {/* History Table Card */}
      <DataCard
        title="Riwayat Sesi Stok Opname"
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Cari kode opname, petugas..."
              className="admin-input !h-8 text-[12px] w-48 sm:w-56"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="admin-input !h-8 text-[12px]"
            >
              <option value="all">Semua Status</option>
              <option value="berjalan">Berjalan</option>
              <option value="menunggu_persetujuan">Menunggu Persetujuan</option>
              <option value="perlu_hitung_ulang">Perlu Hitung Ulang</option>
              <option value="disetujui">Disetujui</option>
              <option value="ditolak">Ditolak</option>
              <option value="dibatalkan">Dibatalkan</option>
            </select>
          </div>
        }
      >
        <DataTable
          columns={historyColumns}
          data={filteredSessions}
          keyExtractor={(s) => s.id}
          swapKey={`so-history-${statusFilter}-${listSearch}`}
          emptyMessage="Belum ada riwayat sesi stok opname untuk filter ini."
        />
      </DataCard>

      {/* Modal: Buat Stok Opname Baru */}
      <CenterDialog
        isOpen={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        title="Buat Stok Opname Baru"
        subtitle="Inisialisasi sesi penghitungan fisik persediaan gudang"
        maxWidthClass="max-w-[480px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="cancel"
              onClick={() => setNewModalOpen(false)}
            >
              Batal
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              onClick={() => handleCreateSession()}
            >
              Mulai Penghitungan
            </ActionButton>
          </>
        }
      >
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div className="p-3 rounded-[10px] bg-[#F9FAFB] border border-[#EEF0F4] text-[12px] space-y-1">
            <div className="flex justify-between">
              <span className="text-[#646B7C]">Petugas:</span>
              <strong className="text-[#1E2230]">{verifiedUser.nama} ({verifiedUser.id})</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-[#646B7C]">Tanggal Mulai:</span>
              <span className="font-mono text-[#1E2230]">{todayISO()}</span>
            </div>
          </div>

          <div>
            <label className="block font-sans font-medium text-[13px] text-[#1E2230] mb-1.5">
              Cakupan Opname
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setNewScope('semua')}
                className={`py-2 px-3 rounded-[8px] text-[12px] font-semibold border transition-all ${
                  newScope === 'semua'
                    ? 'border-[#1A64B0] bg-[#E4F2FE] text-[#1A64B0]'
                    : 'border-[#EEF0F4] text-[#4B5563] hover:bg-[#F9FAFB]'
                }`}
              >
                Semua Part
              </button>
              <button
                type="button"
                onClick={() => setNewScope('reguler')}
                className={`py-2 px-3 rounded-[8px] text-[12px] font-semibold border transition-all ${
                  newScope === 'reguler'
                    ? 'border-[#1A64B0] bg-[#E4F2FE] text-[#1A64B0]'
                    : 'border-[#EEF0F4] text-[#4B5563] hover:bg-[#F9FAFB]'
                }`}
              >
                Reguler Saja
              </button>
              <button
                type="button"
                onClick={() => setNewScope('ho')}
                className={`py-2 px-3 rounded-[8px] text-[12px] font-semibold border transition-all ${
                  newScope === 'ho'
                    ? 'border-[#1A64B0] bg-[#E4F2FE] text-[#1A64B0]'
                    : 'border-[#EEF0F4] text-[#4B5563] hover:bg-[#F9FAFB]'
                }`}
              >
                HO Saja
              </button>
            </div>
          </div>

          <FormField id="so-notes" label="Catatan Opname (Opsional)">
            <textarea
              id="so-notes"
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Contoh: Audit fisik stok akhir bulan gudang..."
              className="admin-input text-[13px]"
            />
          </FormField>
        </form>
      </CenterDialog>
    </div>
  );
};

