import React, { useState, useMemo } from 'react';
import { useAdmin } from '../../context/AdminContext';
import { useAuth } from '../../lib/mockAuth';
import type {
  HelpDeskTicket,
  TicketPriority,
  TicketStatus,
  TicketCategory,
  CorrectionRequest,
  CorrectionRiskLevel,
  KnowledgeBaseArticle,
} from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { StatusChip } from '../../components/admin/StatusChip';
import { ActionButton } from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { CenterDialog } from '../../components/admin/CenterDialog';
import { FormField } from '../../components/admin/FormField';
import { setLastTriggerElement } from '../../components/admin/island/IslandSystem';

type HelpdeskTab = 'overview' | 'tickets' | 'diagnostics' | 'corrections' | 'knowledge' | 'audit';

const CATEGORIES: TicketCategory[] = [
  'Bug / Kendala Aplikasi',
  'Data Tidak Muncul',
  'Data Tidak Sesuai / Inkonsisten',
  'Akses & Login',
  'Booking Servis',
  'Servis & SPK',
  'Gudang & Stok',
  'Penjualan & Pembayaran',
  'Laporan & Ekspor',
  'Sinkronisasi & Koneksi',
  'Panduan Penggunaan',
  'Lainnya',
];

export const HelpDeskCenter: React.FC = () => {
  const {
    tickets,
    correctionRequests,
    knowledgeBase,
    bookings,
    serviceForms,
    workOrders,
    sales,
    parts,
    customers,
    vehicles,
    stockMovements,
    auditLogs,
    addTicket,
    replyTicket,
    updateTicket,
    assignTicket,
    resolveTicket,
    reopenTicket,
    createCorrectionRequest,
    reviewCorrectionRequest,
    addKnowledgeBaseArticle,
    refreshDataStore,
  } = useAdmin();

  const { role, user } = useAuth();
  const isMasterAdmin = role === 'admin';

  // Active sub-tab in Helpdesk Center
  const [activeTab, setActiveTab] = useState<HelpdeskTab>('overview');

  // -------------------------------------------------------------
  // TICKET MANAGEMENT STATE
  // -------------------------------------------------------------
  const [statusFilter, setStatusFilter] = useState<string>('Semua');
  const [priorityFilter, setPriorityFilter] = useState<string>('Semua');
  const [categoryFilter, setCategoryFilter] = useState<string>('Semua');
  const [ticketSearch, setTicketSearch] = useState<string>('');
  const [selectedTicketId, setSelectedTicketId] = useState<string>('');
  const [replyText, setReplyText] = useState<string>('');

  // Create Ticket Modal / SidePanel
  const [createTicketOpen, setCreateTicketOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState<TicketCategory>('Bug / Kendala Aplikasi');
  const [newPriority, setNewPriority] = useState<TicketPriority>('normal');
  const [newReporter, setNewReporter] = useState(user?.name || 'Master Helpdesk');
  const [newReporterRole, setNewReporterRole] = useState('Helpdesk Staff');
  const [newModule, setNewModule] = useState('Umum');
  const [newRelatedId, setNewRelatedId] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newSteps, setNewSteps] = useState('');
  const [newExpected, setNewExpected] = useState('');
  const [newActual, setNewActual] = useState('');

  // -------------------------------------------------------------
  // DIAGNOSTIC WORKSPACE STATE
  // -------------------------------------------------------------
  const [diagnosticQuery, setDiagnosticQuery] = useState<string>('');
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);
  const [diagnosticAuditEvents, setDiagnosticAuditEvents] = useState<any[]>([]);
  const [diagnosticFindings, setDiagnosticFindings] = useState<string[]>([]);
  const [diagnosticEntityType, setDiagnosticEntityType] = useState<string>('');

  // -------------------------------------------------------------
  // DATA CORRECTION STATE
  // -------------------------------------------------------------
  const [recoveryNotice, setRecoveryNotice] = useState<string | null>(null);
  const [corEntityType, setCorEntityType] = useState<CorrectionRequest['entityType']>('Sale');
  const [corEntityId, setCorEntityId] = useState('');
  const [corFieldName, setCorFieldName] = useState('paymentStatus');
  const [corCurrentValue, setCorCurrentValue] = useState('');
  const [corProposedValue, setCorProposedValue] = useState('');
  const [corReason, setCorReason] = useState('');
  const [corEvidence, setCorEvidence] = useState('');
  const [corTicketId, setCorTicketId] = useState('');
  const [corSubmitNotice, setCorSubmitNotice] = useState<string | null>(null);

  // Review Dialog for Master Admin
  const [reviewDialogItem, setReviewDialogItem] = useState<CorrectionRequest | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'disetujui' | 'ditolak'>('disetujui');
  const [reviewNotes, setReviewNotes] = useState('');

  // -------------------------------------------------------------
  // KNOWLEDGE BASE STATE
  // -------------------------------------------------------------
  const [kbSearch, setKbSearch] = useState('');
  const [kbCategory, setKbCategory] = useState('Semua');
  const [kbModalOpen, setKbModalOpen] = useState(false);
  const [newKbTitle, setNewKbTitle] = useState('');
  const [newKbCat, setNewKbCat] = useState<TicketCategory>('Booking Servis');
  const [newKbModule, setNewKbModule] = useState('booking');
  const [newKbSymptoms, setNewKbSymptoms] = useState('');
  const [newKbCauses, setNewKbCauses] = useState('');
  const [newKbDiagSteps, setNewKbDiagSteps] = useState('');
  const [newKbResSteps, setNewKbResSteps] = useState('');

  // -------------------------------------------------------------
  // METRICS COMPUTATION (FOR OVERVIEW CARDS)
  // -------------------------------------------------------------
  const metrics = useMemo(() => {
    const total = tickets.length;
    const baru = tickets.filter((t) => t.status === 'baru' || t.status === 'Terbuka').length;
    const dalamPenanganan = tickets.filter(
      (t) => t.status === 'dalam_penanganan' || t.status === 'ditinjau' || t.status === 'Diproses'
    ).length;
    const menungguPelapor = tickets.filter((t) => t.status === 'menunggu_pelapor').length;
    const menungguPersetujuan = tickets.filter((t) => t.status === 'menunggu_persetujuan').length;
    const dieskalasi = tickets.filter((t) => t.status === 'dieskalasi').length;
    const selesai = tickets.filter(
      (t) => t.status === 'selesai' || t.status === 'ditutup' || t.status === 'Selesai'
    ).length;
    const kritisOverdue = tickets.filter(
      (t) =>
        t.status !== 'selesai' &&
        t.status !== 'ditutup' &&
        t.status !== 'Selesai' &&
        (t.priority === 'kritis' || t.priority === 'tinggi' || t.priority === 'Tinggi')
    ).length;

    return {
      total,
      baru,
      dalamPenanganan,
      menungguPelapor,
      menungguPersetujuan,
      dieskalasi,
      selesai,
      kritisOverdue,
    };
  }, [tickets]);

  // -------------------------------------------------------------
  // FILTERED TICKETS
  // -------------------------------------------------------------
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter !== 'Semua') {
        if (statusFilter === 'Baru' && t.status !== 'baru' && t.status !== 'Terbuka') return false;
        if (
          statusFilter === 'Dalam Penanganan' &&
          t.status !== 'dalam_penanganan' &&
          t.status !== 'ditinjau' &&
          t.status !== 'Diproses'
        )
          return false;
        if (statusFilter === 'Menunggu Pelapor' && t.status !== 'menunggu_pelapor') return false;
        if (statusFilter === 'Menunggu Persetujuan' && t.status !== 'menunggu_persetujuan')
          return false;
        if (statusFilter === 'Dieskalasi' && t.status !== 'dieskalasi') return false;
        if (
          statusFilter === 'Selesai' &&
          t.status !== 'selesai' &&
          t.status !== 'ditutup' &&
          t.status !== 'Selesai'
        )
          return false;
      }

      // Priority filter
      if (priorityFilter !== 'Semua') {
        const p = t.priority.toLowerCase();
        if (priorityFilter.toLowerCase() === 'kritis' && p !== 'kritis') return false;
        if (priorityFilter.toLowerCase() === 'tinggi' && p !== 'tinggi') return false;
        if (priorityFilter.toLowerCase() === 'normal' && p !== 'normal' && p !== 'sedang')
          return false;
        if (priorityFilter.toLowerCase() === 'rendah' && p !== 'rendah') return false;
      }

      // Category filter
      if (categoryFilter !== 'Semua' && t.category !== categoryFilter) {
        return false;
      }

      // Search query
      if (ticketSearch.trim()) {
        const q = ticketSearch.toLowerCase().trim();
        const matchTitle = t.title.toLowerCase().includes(q);
        const matchId = t.id.toLowerCase().includes(q);
        const matchRep = t.reportedBy.toLowerCase().includes(q);
        const matchRel = (t.relatedRecordId || '').toLowerCase().includes(q);
        const matchMod = (t.affectedModule || '').toLowerCase().includes(q);
        if (!matchTitle && !matchId && !matchRep && !matchRel && !matchMod) return false;
      }

      return true;
    });
  }, [tickets, statusFilter, priorityFilter, categoryFilter, ticketSearch]);

  const selectedTicket = useMemo(() => {
    return tickets.find((t) => t.id === selectedTicketId) || filteredTickets[0] || tickets[0];
  }, [tickets, selectedTicketId, filteredTickets]);

  // Handle overview card click to drill down into tickets
  const handleOverviewCardClick = (targetStatus: string) => {
    setStatusFilter(targetStatus);
    setActiveTab('tickets');
  };

  // Reply to ticket
  const handleReplyTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTicket || !replyText.trim()) return;
    const senderName = user?.name || (role === 'master_helpdesk' ? 'Master Helpdesk' : 'Admin');
    replyTicket(selectedTicket.id, replyText.trim(), senderName);
    setReplyText('');
  };

  // Create new ticket
  const handleCreateTicketSubmit = () => {
    if (!newTitle.trim()) return;
    const created = addTicket(
      {
        title: newTitle.trim(),
        category: newCategory,
        priority: newPriority,
        status: 'baru',
        reportedBy: newReporter.trim(),
        reporterRole: newReporterRole.trim(),
        affectedModule: newModule.trim(),
        relatedRecordId: newRelatedId.trim() || undefined,
        description: newDesc.trim() || undefined,
        stepsToReproduce: newSteps.trim() || undefined,
        expectedResult: newExpected.trim() || undefined,
        actualResult: newActual.trim() || undefined,
      },
      newDesc.trim() || 'Tiket kendala baru dibuat.'
    );

    setSelectedTicketId(created.id);
    setNewTitle('');
    setNewDesc('');
    setNewSteps('');
    setNewExpected('');
    setNewActual('');
    setNewRelatedId('');
    setCreateTicketOpen(false);
    setActiveTab('tickets');
  };

  // -------------------------------------------------------------
  // RUN DIAGNOSTICS FOR A RECORD
  // -------------------------------------------------------------
  const executeDiagnostics = (queryInput?: string) => {
    const q = (queryInput || diagnosticQuery).trim().toUpperCase();
    if (!q) return;

    let found: any = null;
    let type = '';
    const findings: string[] = [];

    // Search Bookings
    const b = bookings.find((item) => item.id.toUpperCase() === q || item.plate.replace(/\s+/g, '') === q.replace(/\s+/g, ''));
    if (b) {
      found = b;
      type = 'Booking Servis';
      if (b.status === 'batal') {
        findings.push(`Booking berstatus BATAL pada ${b.cancelledAt || '-'}. Alasan: ${b.cancelReason || '-'}`);
      }
      if (b.serviceFormId) {
        findings.push(`Booking telah terhubung dengan estimasi Service Form ID: ${b.serviceFormId}`);
      } else {
        findings.push('Booking belum diproses ke Service Form.');
      }
      // Check date
      const today = new Date().toISOString().slice(0, 10);
      if (b.date !== today) {
        findings.push(`Tanggal booking (${b.date}) berbeda dengan tanggal hari ini (${today}). Pastikan filter antrean counter mencakup tanggal terkait.`);
      }
    }

    // Search Service Forms
    if (!found) {
      const sf = serviceForms.find((item) => item.id.toUpperCase() === q);
      if (sf) {
        found = sf;
        type = 'Service Form (Estimasi)';
        if (sf.status === 'batal') {
          findings.push(`Service Form berstatus BATAL. Alasan: ${sf.cancelReason || '-'}`);
        }
        if (sf.workOrderId) {
          findings.push(`Telah diterbitkan Work Order SPK dengan ID: ${sf.workOrderId}`);
        } else {
          findings.push('Belum disetujui konsumen menjadi SPK (Work Order).');
        }
      }
    }

    // Search Work Orders
    if (!found) {
      const wo = workOrders.find((item) => item.id.toUpperCase() === q);
      if (wo) {
        found = wo;
        type = 'Work Order (SPK Servis)';
        if (!wo.mechanicId) {
          findings.push('Peringatan: Belum ada mekanik yang ditugaskan pada SPK ini.');
        }
        if (wo.endState === 'selesai') {
          findings.push(`SPK telah selesai dikerjakan pada ${wo.endedAt || '-'}.`);
        } else {
          findings.push('Pekerjaan servis masih berjalan di bengkel.');
        }
        if (wo.saleId) {
          findings.push(`Terhubung dengan tagihan kasir Penjualan ID: ${wo.saleId}`);
        } else {
          findings.push('Belum dibuatkan transaksi tagihan kasir.');
        }
      }
    }

    // Search Sales
    if (!found) {
      const s = sales.find((item) => item.id.toUpperCase() === q || item.number.toUpperCase() === q);
      if (s) {
        found = s;
        type = 'Penjualan Kasir (POS)';
        findings.push(`Status pembayaran: ${s.paymentStatus.toUpperCase()} melalui metode ${s.method}.`);
        if (s.paymentStatus === 'menunggu_pembayaran') {
          findings.push('Transaksi masih menunggu bukti transfer atau konfirmasi QRIS.');
        }
        if (s.paymentStatus === 'dibatalkan') {
          findings.push(`Transaksi dibatalkan pada ${s.cancelledAt || '-'}.`);
        }
      }
    }

    // Search Parts
    if (!found) {
      const p = parts.find((item) => item.kode.toUpperCase() === q || item.id.toUpperCase() === q);
      if (p) {
        found = p;
        type = 'Katalog Part Gudang';
        const movements = stockMovements.filter((m) => m.partId === p.id || m.partCode === p.kode);
        const totalIn = movements.filter((m) => m.quantity > 0).reduce((acc, m) => acc + m.quantity, 0);
        const totalOut = movements.filter((m) => m.quantity < 0).reduce((acc, m) => acc + Math.abs(m.quantity), 0);
        findings.push(`Part ${p.nama} (${p.kode}) memiliki ${movements.length} baris riwayat mutasi stok.`);
        findings.push(`Akumulasi mutasi masuk: +${totalIn} unit, akumulasi mutasi keluar: -${totalOut} unit.`);
        if (p.stokMin && totalIn - totalOut <= p.stokMin) {
          findings.push(`Peringatan: Stok berada di batas minimum (${p.stokMin} ${p.satuan}).`);
        }
      }
    }

    // Search Customer
    if (!found) {
      const c = customers.find((item) => item.name.toUpperCase().includes(q) || (item.plate && item.plate.replace(/\s+/g, '') === q.replace(/\s+/g, '')));
      if (c) {
        found = c;
        type = 'Data Pelanggan';
        findings.push(`Pelanggan terdaftar: ${c.name}, Nomor HP: ${c.phone || '-'}`);
        if (c.plate) findings.push(`Kendaraan terhubung: ${c.plate}`);
      }
    }

    // Audit logs for entity
    const evts = auditLogs.filter((a) => (a.entityId && a.entityId.toUpperCase() === q) || a.action.toUpperCase().includes(q));

    setDiagnosticResult(found);
    setDiagnosticEntityType(type);
    setDiagnosticFindings(findings);
    setDiagnosticAuditEvents(evts);
  };

  // Safe recovery execution
  const executeSafeRecovery = (actionType: string) => {
    if (actionType === 'refresh_store') {
      refreshDataStore();
      setRecoveryNotice('Cache memori frontend telah dimuat ulang secara aman dari authoritative store.');
    } else if (actionType === 'recalculate_stock') {
      refreshDataStore();
      setRecoveryNotice('Kalkulasi mutasi kartu stok telah divalidasi terhadap katalog part gudang.');
    } else if (actionType === 'sync_queue') {
      refreshDataStore();
      setRecoveryNotice('Sinkronisasi status antrean booking dan estimasi selesai tanpa perubahan data sumber.');
    }
    setTimeout(() => setRecoveryNotice(null), 6000);
  };

  // Submit correction request
  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!corEntityId.trim() || !corReason.trim() || !corProposedValue.trim()) {
      alert('Harap lengkapi ID Entitas, Nilai Usulan, dan Alasan Koreksi.');
      return;
    }

    // Auto calculate risk level
    const isHighRisk =
      corEntityType === 'Sale' ||
      corFieldName.toLowerCase().includes('payment') ||
      corFieldName.toLowerCase().includes('price') ||
      corFieldName.toLowerCase().includes('total') ||
      corEntityType === 'WorkOrder';

    const risk: CorrectionRiskLevel = isHighRisk ? 'tinggi' : 'rendah';

    createCorrectionRequest({
      ticketId: corTicketId.trim() || undefined,
      entityType: corEntityType,
      entityId: corEntityId.trim(),
      fieldName: corFieldName,
      currentValue: corCurrentValue.trim() || '(Tidak diketahui)',
      proposedValue: corProposedValue.trim(),
      reason: corReason.trim(),
      evidenceReference: corEvidence.trim() || undefined,
      riskLevel: risk,
      requestedBy: user?.name || 'Master Helpdesk',
    });

    setCorSubmitNotice(
      isHighRisk
        ? 'Pengajuan koreksi tingkat TINGGI telah dicatat dan masuk antrean persetujuan Master Admin. Sesuai prinsip least-privilege, Helpdesk tidak dapat menyetujui koreksi ini secara mandiri.'
        : 'Pengajuan koreksi data tercatat dan masuk antrean audit.'
    );

    setCorEntityId('');
    setCorProposedValue('');
    setCorReason('');
    setCorEvidence('');
    setCorTicketId('');
    setTimeout(() => setCorSubmitNotice(null), 8000);
  };

  // Approve / Reject review dialog submission
  const handleReviewSubmit = () => {
    if (!reviewDialogItem) return;
    reviewCorrectionRequest(
      reviewDialogItem.id,
      reviewDecision,
      user?.name || 'Master Admin',
      reviewNotes.trim() || undefined
    );
    setReviewDialogItem(null);
    setReviewNotes('');
  };

  // Add KB Article
  const handleCreateKbArticle = () => {
    if (!newKbTitle.trim() || !newKbSymptoms.trim()) return;
    addKnowledgeBaseArticle({
      title: newKbTitle.trim(),
      category: newKbCat,
      relatedModule: newKbModule.trim(),
      symptoms: newKbSymptoms.trim(),
      possibleCauses: newKbCauses.split('\n').filter(Boolean),
      diagnosticSteps: newKbDiagSteps.split('\n').filter(Boolean),
      resolutionSteps: newKbResSteps.split('\n').filter(Boolean),
      author: user?.name || 'Master Helpdesk',
    });
    setNewKbTitle('');
    setNewKbSymptoms('');
    setNewKbCauses('');
    setNewKbDiagSteps('');
    setNewKbResSteps('');
    setKbModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-[20px] bg-white border border-[#EEF0F4] p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="font-mono text-xs uppercase tracking-widest px-2.5 py-0.5 rounded-[6px] bg-[#3DA5F5]/10 text-[#1D6FC4] font-semibold">
              Support Center
            </span>
            <span className="text-xs text-[#646B7C]">
              Peran Aktif: <strong className="text-[#1E2230]">{role === 'master_helpdesk' ? 'Master Helpdesk' : 'Master Admin'}</strong>
            </span>
          </div>
          <h1 className="text-[28px] font-condensed font-bold text-[#1E2230] leading-tight">
            Helpdesk Center
          </h1>
          <p className="text-sm text-[#646B7C] mt-1">
            Pusat diagnosis, bantuan teknis, dan verifikasi perbaikan data terpadu MyBengkel.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ActionButton
            intent="start"
            onClick={(e) => {
              setLastTriggerElement(e.currentTarget);
              setCreateTicketOpen(true);
            }}
          >
            Buat Tiket Bantuan
          </ActionButton>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-[#D9DDE6] pb-1 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'overview'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Ringkasan
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'tickets'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Manajemen Tiket ({tickets.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diagnostics')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'diagnostics'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Ruang Diagnostik
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('corrections')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'corrections'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Pemulihan & Koreksi ({correctionRequests.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('knowledge')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'knowledge'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Basis Pengetahuan ({knowledgeBase.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('audit')}
          className={`px-4 py-2 text-sm font-medium rounded-t-[10px] transition-colors ${
            activeTab === 'audit'
              ? 'bg-white text-[#1E2230] border-t-2 border-[#1E2230] font-semibold shadow-sm'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Log Audit Helpdesk
        </button>
      </div>

      {/* ========================================================= */}
      {/* 1. OVERVIEW TAB */}
      {/* ========================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Semua')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#1E2230] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#646B7C] block font-medium mb-1">Total Tiket</span>
              <span className="text-[32px] font-condensed font-bold text-[#1E2230]">
                {metrics.total}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Seluruh antrean terdaftar</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Baru')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#F59E0B] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#D97706] block font-semibold mb-1">Tiket Baru</span>
              <span className="text-[32px] font-condensed font-bold text-[#D97706]">
                {metrics.baru}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Perlu ditinjau pertama kali</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Dalam Penanganan')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#3DA5F5] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#1D6FC4] block font-semibold mb-1">Dalam Penanganan</span>
              <span className="text-[32px] font-condensed font-bold text-[#1D6FC4]">
                {metrics.dalamPenanganan}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Sedang ditindaklanjuti</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Menunggu Pelapor')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#646B7C] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#646B7C] block font-semibold mb-1">Menunggu Pelapor</span>
              <span className="text-[32px] font-condensed font-bold text-[#1E2230]">
                {metrics.menungguPelapor}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Menunggu informasi balik</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Menunggu Persetujuan')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#F59E0B] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#D97706] block font-semibold mb-1">Menunggu Persetujuan</span>
              <span className="text-[32px] font-condensed font-bold text-[#D97706]">
                {metrics.menungguPersetujuan}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Menanti otorisasi Master Admin</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Dieskalasi')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#D62E5A] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#D62E5A] block font-semibold mb-1">Dieskalasi</span>
              <span className="text-[32px] font-condensed font-bold text-[#D62E5A]">
                {metrics.dieskalasi}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Dialihkan ke tim teknis</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleOverviewCardClick('Selesai')}
              className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm hover:border-[#1F9D3A] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#1F9D3A] block font-semibold mb-1">Selesai & Ditutup</span>
              <span className="text-[32px] font-condensed font-bold text-[#1F9D3A]">
                {metrics.selesai}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Solusi telah diverifikasi</span>
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setPriorityFilter('Kritis');
                setActiveTab('tickets');
              }}
              className="p-5 rounded-[16px] bg-[rgba(242,70,111,0.04)] border border-[rgba(242,70,111,0.3)] shadow-sm hover:border-[#D62E5A] transition-all cursor-pointer text-left"
            >
              <span className="text-xs text-[#D62E5A] block font-semibold mb-1">Prioritas Kritis / Tinggi</span>
              <span className="text-[32px] font-condensed font-bold text-[#D62E5A]">
                {metrics.kritisOverdue}
              </span>
              <span className="text-xs text-[#646B7C] block mt-1">Butuh perhatian segera</span>
            </div>
          </div>

          {/* Quick Problem-Solving Sequence Card */}
          <DataCard title="Alur Kerja Operasional Helpdesk MyBengkel">
            <div className="py-2">
              <div className="grid grid-cols-2 md:grid-cols-7 gap-3 text-center">
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">1. TERIMA</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Catat tiket lengkap</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">2. DIAGNOSIS</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Cek entitas & audit</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">3. VERIFIKASI</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Bandingkan bukti sah</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">4. SOLUSI</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Koreksi berizin / aman</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">5. VALIDASI</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Uji hasil bersama user</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">6. DOKUMEN</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Catat ke basis ilmu</span>
                </div>
                <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]">
                  <span className="font-mono text-xs font-bold text-[#646B7C] block">7. TUTUP</span>
                  <span className="text-xs text-[#1E2230] mt-1 block">Konfirmasi selesai</span>
                </div>
              </div>
              <p className="text-xs text-[#646B7C] mt-4">
                Prinsip perlindungan data bisnis: Master Helpdesk dilarang memanipulasi angka stok secara sepihak, memalsukan status pembayaran, atau menghapus riwayat transaksi.
              </p>
            </div>
          </DataCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. TICKET MANAGEMENT TAB */}
      {/* ========================================================= */}
      {activeTab === 'tickets' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Tickets Queue */}
          <div className="lg:col-span-5 space-y-4">
            <DataCard
              title="Antrean Tiket Kendala"
              actions={
                <ActionButton
                  intent="start"
                  onClick={(e) => {
                    setLastTriggerElement(e.currentTarget);
                    setCreateTicketOpen(true);
                  }}
                >
                  Tiket baru
                </ActionButton>
              }
            >
              <div className="space-y-3 mb-4">
                {/* Search Bar */}
                <input
                  type="text"
                  placeholder="Cari ID, judul, pelapor, atau record ID..."
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  className="admin-input text-xs"
                />

                {/* Status Tabs */}
                <FilterTabs
                  ariaLabel="Filter status tiket"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  tabs={[
                    { value: 'Semua', label: 'Semua', count: tickets.length },
                    { value: 'Baru', label: 'Baru', count: metrics.baru },
                    { value: 'Dalam Penanganan', label: 'Proses', count: metrics.dalamPenanganan },
                    { value: 'Menunggu Persetujuan', label: 'Izin', count: metrics.menungguPersetujuan },
                    { value: 'Selesai', label: 'Selesai', count: metrics.selesai },
                  ]}
                />

                {/* Priority & Category Dropdowns */}
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={priorityFilter}
                    onChange={(e) => setPriorityFilter(e.target.value)}
                    className="admin-input text-xs py-1.5"
                  >
                    <option value="Semua">Semua Prioritas</option>
                    <option value="Kritis">Kritis</option>
                    <option value="Tinggi">Tinggi</option>
                    <option value="Normal">Normal</option>
                    <option value="Rendah">Rendah</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="admin-input text-xs py-1.5"
                  >
                    <option value="Semua">Semua Kategori</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {filteredTickets.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA]">
                  <p className="text-sm text-[#646B7C]">Tidak ada tiket yang sesuai kriteria filter.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[560px] overflow-y-auto pr-1">
                  {filteredTickets.map((t) => {
                    const active = selectedTicket?.id === t.id;
                    return (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedTicketId(t.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedTicketId(t.id);
                          }
                        }}
                        className={`w-full text-left p-3.5 rounded-[12px] border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#1E2230] text-white border-[#1E2230]'
                            : 'bg-white text-[#1E2230] border-[#EEF0F4] hover:bg-[#F6F7FA]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span
                            className={`font-mono text-xs font-semibold ${
                              active ? 'text-white/70' : 'text-[#646B7C]'
                            }`}
                          >
                            {t.id}
                          </span>
                          <StatusChip status={t.status} />
                        </div>
                        <h4 className="text-sm font-semibold truncate leading-snug">{t.title}</h4>
                        <div
                          className={`flex items-center justify-between text-xs mt-2 ${
                            active ? 'text-white/80' : 'text-[#646B7C]'
                          }`}
                        >
                          <span className="truncate">{t.reportedBy}</span>
                          <span className="font-mono">{t.createdAt.slice(5)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </DataCard>
          </div>

          {/* Right Column: Ticket Detail & Conversation */}
          <div className="lg:col-span-7">
            {selectedTicket ? (
              <DataCard
                title={`${selectedTicket.id}: ${selectedTicket.title}`}
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={selectedTicket.status} />
                    <StatusChip status={`Prioritas ${selectedTicket.priority}`} />
                  </div>
                }
              >
                <div className="space-y-5">
                  {/* Meta Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4] text-xs">
                    <div>
                      <span className="text-[#646B7C] block">Pelapor</span>
                      <strong className="text-[#1E2230]">{selectedTicket.reportedBy}</strong>
                      {selectedTicket.reporterRole && (
                        <span className="text-[11px] text-[#646B7C] block">({selectedTicket.reporterRole})</span>
                      )}
                    </div>
                    <div>
                      <span className="text-[#646B7C] block">Modul Terkait</span>
                      <strong className="text-[#1E2230]">{selectedTicket.affectedModule || selectedTicket.category}</strong>
                    </div>
                    <div>
                      <span className="text-[#646B7C] block">Penanggung Jawab</span>
                      <strong className="text-[#1E2230]">{selectedTicket.assignedStaff || 'Belum ditugaskan'}</strong>
                    </div>
                    <div>
                      <span className="text-[#646B7C] block">Waktu Lapor</span>
                      <strong className="text-[#1E2230]">{selectedTicket.createdAt}</strong>
                    </div>
                  </div>

                  {/* Related Record Badge */}
                  {selectedTicket.relatedRecordId && (
                    <div className="flex items-center justify-between p-3 rounded-[10px] bg-[#3DA5F5]/10 border border-[#3DA5F5]/20 text-xs">
                      <div>
                        <span className="text-[#1D6FC4] font-medium">Record Terkait: </span>
                        <strong className="font-mono text-[#1E2230]">{selectedTicket.relatedRecordId}</strong>
                      </div>
                      <ActionButton
                        intent="wait"
                        onClick={() => {
                          setDiagnosticQuery(selectedTicket.relatedRecordId!);
                          executeDiagnostics(selectedTicket.relatedRecordId!);
                          setActiveTab('diagnostics');
                        }}
                      >
                        Buka di Ruang Diagnostik &rarr;
                      </ActionButton>
                    </div>
                  )}

                  {/* Description & Reproduction Steps */}
                  <div className="space-y-3 text-xs bg-white p-4 rounded-[12px] border border-[#EEF0F4]">
                    <div>
                      <span className="text-[#646B7C] font-semibold block mb-1">Deskripsi Masalah</span>
                      <p className="text-[#1E2230] whitespace-pre-line leading-relaxed">
                        {selectedTicket.description || 'Tidak ada uraian deskripsi tambahan.'}
                      </p>
                    </div>

                    {selectedTicket.stepsToReproduce && (
                      <div>
                        <span className="text-[#646B7C] font-semibold block mb-1">Langkah Reproduksi</span>
                        <p className="text-[#1E2230] whitespace-pre-line leading-relaxed">
                          {selectedTicket.stepsToReproduce}
                        </p>
                      </div>
                    )}

                    {(selectedTicket.expectedResult || selectedTicket.actualResult) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#EEF0F4]">
                        <div>
                          <span className="text-[#646B7C] font-semibold block mb-0.5">Hasil yang Diharapkan</span>
                          <p className="text-[#1E2230]">{selectedTicket.expectedResult || '-'}</p>
                        </div>
                        <div>
                          <span className="text-[#646B7C] font-semibold block mb-0.5">Hasil Aktual</span>
                          <p className="text-[#1E2230]">{selectedTicket.actualResult || '-'}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions Row */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#EEF0F4]">
                    <span className="text-xs text-[#646B7C] mr-2">Tindakan Cepat:</span>

                    {selectedTicket.status !== 'dalam_penanganan' && selectedTicket.status !== 'selesai' && (
                      <ActionButton
                        intent="wait"
                        onClick={() => {
                          updateTicket(selectedTicket.id, {
                            status: 'dalam_penanganan',
                            assignedStaff: user?.name || 'Master Helpdesk',
                          });
                        }}
                      >
                        Ambil Penanganan
                      </ActionButton>
                    )}

                    {selectedTicket.status !== 'menunggu_persetujuan' && selectedTicket.status !== 'selesai' && (
                      <ActionButton
                        intent="wait"
                        onClick={() => {
                          updateTicket(selectedTicket.id, { status: 'menunggu_persetujuan' });
                        }}
                      >
                        Minta Otorisasi Admin
                      </ActionButton>
                    )}

                    {selectedTicket.status !== 'dieskalasi' && selectedTicket.status !== 'selesai' && (
                      <ActionButton
                        intent="cancel"
                        onClick={() => {
                          updateTicket(selectedTicket.id, { status: 'dieskalasi' });
                        }}
                      >
                        Eskalasi Masalah
                      </ActionButton>
                    )}

                    {selectedTicket.status !== 'selesai' && selectedTicket.status !== 'ditutup' ? (
                      <ActionButton
                        intent="start"
                        onClick={() => {
                          const note = prompt('Catatan penyelesaian masalah:');
                          if (note) {
                            resolveTicket(selectedTicket.id, note);
                          }
                        }}
                      >
                        Tandai Selesai
                      </ActionButton>
                    ) : (
                      <ActionButton
                        intent="start"
                        onClick={() => {
                          const reason = prompt('Alasan membuka kembali tiket:');
                          if (reason) {
                            reopenTicket(selectedTicket.id, reason);
                          }
                        }}
                      >
                        Buka Kembali Tiket
                      </ActionButton>
                    )}
                  </div>

                  {/* Thread & Reply */}
                  <div className="pt-3 border-t border-[#EEF0F4]">
                    <h4 className="text-xs font-semibold text-[#646B7C] uppercase tracking-wider mb-3">
                      Riwayat Diskusi & Penanganan
                    </h4>
                    <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1 mb-4">
                      {selectedTicket.thread.map((msg) => (
                        <div key={msg.id} className="p-3.5 rounded-[12px] border border-[#EEF0F4] bg-[#F6F7FA]/70">
                          <div className="flex items-center justify-between text-xs text-[#646B7C] mb-1">
                            <strong className="text-[#1E2230]">{msg.sender}</strong>
                            <span className="font-mono">{msg.time}</span>
                          </div>
                          <p className="text-xs text-[#1E2230] whitespace-pre-line leading-relaxed">{msg.text}</p>
                        </div>
                      ))}
                    </div>

                    <form onSubmit={handleReplyTicket} className="space-y-3">
                      <FormField id="reply-box" label="Kirim Balasan / Catatan Penanganan">
                        <textarea
                          id="reply-box"
                          rows={3}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Tuliskan respon teknis atau langkah panduan..."
                          className="admin-input text-xs"
                        />
                      </FormField>
                      <div className="flex justify-end">
                        <ActionButton type="submit" intent="start">
                          Kirim Balasan
                        </ActionButton>
                      </div>
                    </form>
                  </div>
                </div>
              </DataCard>
            ) : (
              <DataCard title="Detail Tiket">
                <p className="text-sm text-[#646B7C]">Silakan pilih tiket di kolom antrean sebelah kiri.</p>
              </DataCard>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. DIAGNOSTIC WORKSPACE TAB */}
      {/* ========================================================= */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <DataCard title="Investigasi & Diagnosis Rekaman Data">
            <div className="space-y-4">
              <p className="text-xs text-[#646B7C]">
                Telusuri integritas status dan jejak audit entitas tanpa melakukan perubahan langsung pada data bisnis.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="text"
                  placeholder="Masukkan ID Booking (BK-), Estimasi (SF-), SPK (WO-), Penjualan (PJ-), Part (PRT-), atau Plat Kendaraan..."
                  value={diagnosticQuery}
                  onChange={(e) => setDiagnosticQuery(e.target.value)}
                  className="admin-input flex-1 text-sm font-mono uppercase"
                />
                <ActionButton intent="start" onClick={() => executeDiagnostics()}>
                  Jalankan Diagnosis
                </ActionButton>
              </div>

              {/* Sample Shortcuts */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#646B7C]">
                <span>Contoh Pintasan:</span>
                <button
                  type="button"
                  onClick={() => {
                    setDiagnosticQuery('WO-0002');
                    executeDiagnostics('WO-0002');
                  }}
                  className="px-2 py-1 rounded bg-[#EEF0F4] hover:bg-[#D9DDE6] text-[#1E2230] font-mono"
                >
                  WO-0002
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiagnosticQuery('PRT-001');
                    executeDiagnostics('PRT-001');
                  }}
                  className="px-2 py-1 rounded bg-[#EEF0F4] hover:bg-[#D9DDE6] text-[#1E2230] font-mono"
                >
                  PRT-001
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDiagnosticQuery('PJ-0001');
                    executeDiagnostics('PJ-0001');
                  }}
                  className="px-2 py-1 rounded bg-[#EEF0F4] hover:bg-[#D9DDE6] text-[#1E2230] font-mono"
                >
                  PJ-0001
                </button>
              </div>
            </div>
          </DataCard>

          {/* Diagnostic Result Section */}
          {diagnosticResult ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Entity Overview */}
              <div className="lg:col-span-6 space-y-4">
                <DataCard title={`Data Entitas: ${diagnosticEntityType}`}>
                  <div className="space-y-3 text-xs">
                    <pre className="p-4 rounded-[12px] bg-[#1E2230] text-[#EEF0F4] font-mono text-[11px] overflow-x-auto max-h-[400px]">
                      {JSON.stringify(diagnosticResult, null, 2)}
                    </pre>
                  </div>
                </DataCard>
              </div>

              {/* Automated Findings & Health Checks */}
              <div className="lg:col-span-6 space-y-4">
                <DataCard title="Hasil Pemeriksaan Diagnostik Otomatis">
                  <div className="space-y-3">
                    {diagnosticFindings.length === 0 ? (
                      <p className="text-xs text-[#646B7C]">Pemeriksaan tidak menemukan kejanggalan pada entitas ini.</p>
                    ) : (
                      <ul className="space-y-2">
                        {diagnosticFindings.map((finding, idx) => (
                          <li
                            key={idx}
                            className="p-3 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] text-xs text-[#1E2230] flex items-start gap-2.5"
                          >
                            <span className="text-[#3DA5F5] font-bold">&bull;</span>
                            <span className="leading-relaxed">{finding}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Quick Link to Correction Request */}
                    <div className="pt-4 border-t border-[#EEF0F4]">
                      <ActionButton
                        intent="wait"
                        onClick={() => {
                          setCorEntityId(diagnosticResult.id || diagnosticResult.number || diagnosticResult.kode || '');
                          setActiveTab('corrections');
                        }}
                      >
                        Ajukan Koreksi Terverifikasi untuk Entitas Ini &rarr;
                      </ActionButton>
                    </div>
                  </div>
                </DataCard>

                {/* Audit Trail for this Entity */}
                <DataCard title="Catatan Audit Terkait Rekaman Ini">
                  {diagnosticAuditEvents.length === 0 ? (
                    <p className="text-xs text-[#646B7C]">Belum ada aktivitas audit yang terekam pada entitas ini.</p>
                  ) : (
                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {diagnosticAuditEvents.map((evt) => (
                        <div key={evt.id} className="p-3 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] text-xs">
                          <div className="flex items-center justify-between font-mono text-[11px] text-[#646B7C] mb-1">
                            <span>{evt.occurredAt}</span>
                            <span className="uppercase text-[#1E2230] font-semibold">{evt.actorRole}</span>
                          </div>
                          <p className="text-[#1E2230]">{evt.action}</p>
                          {evt.reason && <p className="text-[11px] text-[#646B7C] mt-1">Alasan: {evt.reason}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </DataCard>
              </div>
            </div>
          ) : (
            diagnosticQuery && (
              <div className="p-8 text-center rounded-[16px] bg-white border border-[#EEF0F4]">
                <p className="text-sm text-[#646B7C]">
                  Tidak ditemukan rekaman dengan kriteria pencarian &ldquo;{diagnosticQuery}&rdquo;.
                </p>
                <p className="text-xs text-[#646B7C] mt-1">
                  Pastikan format ID sesuai (contoh: BK-0001, SF-0001, WO-0001, PJ-0001, PRT-001).
                </p>
              </div>
            )
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. DATA RECOVERY AND CORRECTION TAB */}
      {/* ========================================================= */}
      {activeTab === 'corrections' && (
        <div className="space-y-6">
          {/* Recovery Notice */}
          {recoveryNotice && (
            <div className="p-4 rounded-[12px] bg-[rgba(92,196,106,0.14)] border border-[rgba(92,196,106,0.3)] text-[#1F9D3A] text-xs font-medium">
              {recoveryNotice}
            </div>
          )}

          {/* Safe Recovery Actions Group */}
          <DataCard title="1. Pemulihan Aman (Safe Recovery)">
            <div className="space-y-3">
              <p className="text-xs text-[#646B7C]">
                Operasi berikut aman untuk dijalankan ulang karena tidak mengubah data transaksional asli, melainkan menyegarkan memori tampilan dan cache agregat.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ActionButton intent="wait" onClick={() => executeSafeRecovery('refresh_store')}>
                  Segarkan Cache & Muat Ulang Penyimpanan
                </ActionButton>
                <ActionButton intent="wait" onClick={() => executeSafeRecovery('recalculate_stock')}>
                  Validasi Akumulasi Kartu Stok Part
                </ActionButton>
                <ActionButton intent="wait" onClick={() => executeSafeRecovery('sync_queue')}>
                  Sinkronkan Integritas Antrean Servis
                </ActionButton>
              </div>
            </div>
          </DataCard>

          {/* Data Correction Submission Form */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5">
              <DataCard title="2. Formulir Pengajuan Koreksi Data">
                {corSubmitNotice && (
                  <div className="mb-4 p-3 rounded-[10px] bg-[#3DA5F5]/10 border border-[#3DA5F5]/30 text-[#1D6FC4] text-xs">
                    {corSubmitNotice}
                  </div>
                )}
                <form onSubmit={handleCorrectionSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <FormField id="cor-entity" label="Jenis Entitas">
                      <select
                        id="cor-entity"
                        value={corEntityType}
                        onChange={(e) => setCorEntityType(e.target.value as any)}
                        className="admin-input text-xs"
                      >
                        <option value="Sale">Penjualan Kasir (Sale)</option>
                        <option value="WorkOrder">Work Order (SPK)</option>
                        <option value="Booking">Booking Servis</option>
                        <option value="Part">Katalog Part Gudang</option>
                        <option value="StockMovement">Mutasi Stok</option>
                        <option value="Customer">Data Pelanggan</option>
                      </select>
                    </FormField>

                    <FormField id="cor-id" label="ID Rekaman (Entity ID)">
                      <input
                        id="cor-id"
                        placeholder="Contoh: PJ-0001, WO-0002"
                        value={corEntityId}
                        onChange={(e) => setCorEntityId(e.target.value)}
                        className="admin-input text-xs font-mono uppercase"
                        required
                      />
                    </FormField>
                  </div>

                  <FormField id="cor-field" label="Nama Field yang Dikoreksi">
                    <input
                      id="cor-field"
                      placeholder="Contoh: paymentStatus, total, stokMin, complaint"
                      value={corFieldName}
                      onChange={(e) => setCorFieldName(e.target.value)}
                      className="admin-input text-xs font-mono"
                      required
                    />
                  </FormField>

                  <div className="grid grid-cols-2 gap-3">
                    <FormField id="cor-current" label="Nilai Saat Ini (Current)">
                      <input
                        id="cor-current"
                        placeholder="Nilai yang keliru"
                        value={corCurrentValue}
                        onChange={(e) => setCorCurrentValue(e.target.value)}
                        className="admin-input text-xs"
                      />
                    </FormField>

                    <FormField id="cor-prop" label="Nilai Usulan (Proposed)">
                      <input
                        id="cor-prop"
                        placeholder="Nilai yang benar"
                        value={corProposedValue}
                        onChange={(e) => setCorProposedValue(e.target.value)}
                        className="admin-input text-xs"
                        required
                      />
                    </FormField>
                  </div>

                  <FormField id="cor-reason" label="Alasan Koreksi (Wajib)">
                    <textarea
                      id="cor-reason"
                      rows={2}
                      placeholder="Jelaskan dasar pembuktian koreksi..."
                      value={corReason}
                      onChange={(e) => setCorReason(e.target.value)}
                      className="admin-input text-xs"
                      required
                    />
                  </FormField>

                  <FormField id="cor-evid" label="Bukti Pendukung / Referensi">
                    <input
                      id="cor-evid"
                      placeholder="Contoh: Mutasi Bank BCA Ref #9901, Surat Memo #04"
                      value={corEvidence}
                      onChange={(e) => setCorEvidence(e.target.value)}
                      className="admin-input text-xs"
                    />
                  </FormField>

                  <FormField id="cor-tkt" label="ID Tiket Kendala Terkait (Opsional)">
                    <input
                      id="cor-tkt"
                      placeholder="Contoh: TKT-001"
                      value={corTicketId}
                      onChange={(e) => setCorTicketId(e.target.value)}
                      className="admin-input text-xs font-mono"
                    />
                  </FormField>

                  <div className="pt-2">
                    <ActionButton type="submit" intent="start" className="w-full justify-center">
                      Kirim Pengajuan Koreksi
                    </ActionButton>
                  </div>
                </form>
              </DataCard>
            </div>

            {/* Correction Requests List & Approval Queue */}
            <div className="lg:col-span-7">
              <DataCard title="3. Antrean Otorisasi Koreksi Data">
                {correctionRequests.length === 0 ? (
                  <p className="text-xs text-[#646B7C]">Belum ada permohonan koreksi data yang diajukan.</p>
                ) : (
                  <div className="space-y-3">
                    {correctionRequests.map((cor) => {
                      const isHigh = cor.riskLevel === 'tinggi';
                      const isPending = cor.status === 'menunggu_persetujuan';

                      return (
                        <div
                          key={cor.id}
                          className="p-4 rounded-[14px] bg-white border border-[#EEF0F4] shadow-sm space-y-3 text-xs"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-[#1E2230]">{cor.id}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    isHigh
                                      ? 'bg-[rgba(242,70,111,0.14)] text-[#D62E5A]'
                                      : 'bg-[rgba(92,196,106,0.14)] text-[#1F9D3A]'
                                  }`}
                                >
                                  Risiko {cor.riskLevel.toUpperCase()}
                                </span>
                              </div>
                              <span className="text-[#646B7C] block mt-0.5">
                                {cor.entityType} ID: <strong className="text-[#1E2230]">{cor.entityId}</strong> &bull; Field: <strong className="font-mono">{cor.fieldName}</strong>
                              </span>
                            </div>
                            <StatusChip status={cor.status} />
                          </div>

                          {/* Before vs After comparison */}
                          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] font-mono text-[11px]">
                            <div>
                              <span className="text-[#646B7C] text-[10px] block">Sebelum:</span>
                              <span className="text-[#D62E5A] line-through">{cor.currentValue}</span>
                            </div>
                            <div>
                              <span className="text-[#646B7C] text-[10px] block">Usulan:</span>
                              <span className="text-[#1F9D3A] font-semibold">{cor.proposedValue}</span>
                            </div>
                          </div>

                          <p className="text-[#1E2230]">
                            <strong>Alasan:</strong> {cor.reason}
                          </p>

                          {cor.evidenceReference && (
                            <p className="text-[#646B7C]">
                              <strong>Referensi:</strong> {cor.evidenceReference}
                            </p>
                          )}

                          <div className="flex items-center justify-between text-[11px] text-[#646B7C] pt-2 border-t border-[#EEF0F4]">
                            <span>Diajukan oleh {cor.requestedBy} pada {cor.requestedAt}</span>
                            {isPending && (
                              <div>
                                {isMasterAdmin ? (
                                  <ActionButton
                                    intent="wait"
                                    onClick={() => {
                                      setReviewDialogItem(cor);
                                      setReviewDecision('disetujui');
                                    }}
                                  >
                                    Tinjau Otorisasi
                                  </ActionButton>
                                ) : (
                                  <span className="italic text-[#D97706]">
                                    Menunggu Otorisasi Master Admin
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </DataCard>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. KNOWLEDGE BASE TAB */}
      {/* ========================================================= */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          <DataCard
            title="Basis Pengetahuan & Solusi Standar (Knowledge Base)"
            actions={
              <ActionButton
                intent="start"
                onClick={(e) => {
                  setLastTriggerElement(e.currentTarget);
                  setKbModalOpen(true);
                }}
              >
                Tambah Dokumen Solusi
              </ActionButton>
            }
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Cari kendala, kata kunci gejala, atau modul..."
                  value={kbSearch}
                  onChange={(e) => setKbSearch(e.target.value)}
                  className="admin-input text-xs"
                />
                <select
                  value={kbCategory}
                  onChange={(e) => setKbCategory(e.target.value)}
                  className="admin-input text-xs"
                >
                  <option value="Semua">Semua Kategori</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Articles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {knowledgeBase
                  .filter((kb) => {
                    if (kbCategory !== 'Semua' && kb.category !== kbCategory) return false;
                    if (kbSearch.trim()) {
                      const q = kbSearch.toLowerCase();
                      return (
                        kb.title.toLowerCase().includes(q) ||
                        kb.symptoms.toLowerCase().includes(q) ||
                        kb.relatedModule.toLowerCase().includes(q)
                      );
                    }
                    return true;
                  })
                  .map((article) => (
                    <div
                      key={article.id}
                      className="p-5 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm space-y-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-mono text-[11px] text-[#3DA5F5] font-semibold block">
                            {article.id} &bull; {article.category}
                          </span>
                          <h3 className="text-sm font-semibold text-[#1E2230] mt-0.5">{article.title}</h3>
                        </div>
                      </div>

                      <div className="p-3 rounded-[10px] bg-[#F6F7FA] text-[#1E2230] leading-relaxed">
                        <strong className="text-[#646B7C] block mb-1">Gejala Terdeteksi:</strong>
                        {article.symptoms}
                      </div>

                      <div>
                        <strong className="text-[#646B7C] block mb-1">Kemungkinan Penyebab:</strong>
                        <ul className="list-disc list-inside space-y-1 text-[#1E2230]">
                          {article.possibleCauses.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>

                      <div>
                        <strong className="text-[#646B7C] block mb-1">Prosedur Penanganan Disetujui:</strong>
                        <ol className="list-decimal list-inside space-y-1 text-[#1E2230]">
                          {article.resolutionSteps.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ol>
                      </div>

                      <div className="pt-3 border-t border-[#EEF0F4] flex items-center justify-between text-[11px] text-[#646B7C]">
                        <span>Penulis: {article.author}</span>
                        <ActionButton
                          intent="wait"
                          onClick={() => {
                            const stepsText = article.resolutionSteps.map((s, idx) => `${idx + 1}. ${s}`).join('\n');
                            navigator.clipboard.writeText(`Rekomendasi Penanganan (${article.title}):\n${stepsText}`);
                            alert('Langkah solusi telah disalin ke clipboard.');
                          }}
                        >
                          Salin Langkah Solusi
                        </ActionButton>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </DataCard>
        </div>
      )}

      {/* ========================================================= */}
      {/* 6. AUDIT LOG TAB */}
      {/* ========================================================= */}
      {activeTab === 'audit' && (
        <DataCard title="Catatan Audit Aktivitas Master Helpdesk">
          <div className="space-y-4">
            <p className="text-xs text-[#646B7C]">
              Setiap penanganan tiket, diagnosis entitas, pengajuan koreksi, dan intervensi tercatat secara permanen dan tidak dapat diubah oleh peran Helpdesk.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#EEF0F4] text-[#646B7C]">
                    <th className="py-2.5 px-3">Waktu</th>
                    <th className="py-2.5 px-3">Aktor</th>
                    <th className="py-2.5 px-3">Peran</th>
                    <th className="py-2.5 px-3">Tindakan</th>
                    <th className="py-2.5 px-3">Entitas</th>
                    <th className="py-2.5 px-3">Alasan / Catatan</th>
                    <th className="py-2.5 px-3">Hasil</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF0F4]">
                  {auditLogs
                    .filter((a) => a.module === 'helpdesk' || a.actorRole === 'master_helpdesk')
                    .map((log) => (
                      <tr key={log.id} className="hover:bg-[#F6F7FA]">
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#646B7C] whitespace-nowrap">
                          {log.occurredAt}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-[#1E2230]">{log.actorName}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-[#646B7C] uppercase">{log.actorRole}</td>
                        <td className="py-2.5 px-3 text-[#1E2230]">{log.action}</td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {log.entityType} ({log.entityId})
                        </td>
                        <td className="py-2.5 px-3 text-[#646B7C] max-w-[200px] truncate">{log.reason || '-'}</td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              log.outcome === 'berhasil'
                                ? 'bg-[rgba(92,196,106,0.14)] text-[#1F9D3A]'
                                : 'bg-[rgba(242,70,111,0.14)] text-[#D62E5A]'
                            }`}
                          >
                            {log.outcome === 'berhasil' ? 'Tercatat' : 'Gagal'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </DataCard>
      )}

      {/* ========================================================= */}
      {/* SIDE PANEL: CREATE TICKET */}
      {/* ========================================================= */}
      <SidePanel
        isOpen={createTicketOpen}
        onClose={() => setCreateTicketOpen(false)}
        title="Buat Tiket Bantuan Baru"
        footer={
          <>
            <ActionButton intent="cancel" onClick={() => setCreateTicketOpen(false)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" onClick={handleCreateTicketSubmit}>
              Simpan Tiket
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <FormField id="new-tkt-title" label="Judul Kendala (Wajib)">
            <input
              id="new-tkt-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Contoh: Pembayaran transfer penjualan belum tercatat"
              className="admin-input text-xs"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-tkt-cat" label="Kategori Masalah">
              <select
                id="new-tkt-cat"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TicketCategory)}
                className="admin-input text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="new-tkt-prio" label="Prioritas">
              <select
                id="new-tkt-prio"
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                className="admin-input text-xs"
              >
                <option value="kritis">Kritis</option>
                <option value="tinggi">Tinggi</option>
                <option value="normal">Normal</option>
                <option value="rendah">Rendah</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-tkt-rep" label="Nama Pelapor">
              <input
                id="new-tkt-rep"
                value={newReporter}
                onChange={(e) => setNewReporter(e.target.value)}
                placeholder="Nama staf atau pelanggan"
                className="admin-input text-xs"
              />
            </FormField>

            <FormField id="new-tkt-role" label="Peran Pelapor">
              <input
                id="new-tkt-role"
                value={newReporterRole}
                onChange={(e) => setNewReporterRole(e.target.value)}
                placeholder="Contoh: Kasir, Counter, Pelanggan"
                className="admin-input text-xs"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-tkt-mod" label="Modul Terdampak">
              <input
                id="new-tkt-mod"
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                placeholder="Contoh: Penjualan Kasir, Booking"
                className="admin-input text-xs"
              />
            </FormField>

            <FormField id="new-tkt-rel" label="ID Rekaman Terkait (Opsional)">
              <input
                id="new-tkt-rel"
                value={newRelatedId}
                onChange={(e) => setNewRelatedId(e.target.value)}
                placeholder="Contoh: PJ-0001, WO-0002"
                className="admin-input text-xs font-mono uppercase"
              />
            </FormField>
          </div>

          <FormField id="new-tkt-desc" label="Deskripsi Detail">
            <textarea
              id="new-tkt-desc"
              rows={3}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Uraikan keluhan secara jelas..."
              className="admin-input text-xs"
            />
          </FormField>

          <FormField id="new-tkt-steps" label="Langkah Reproduksi Masalah">
            <textarea
              id="new-tkt-steps"
              rows={2}
              value={newSteps}
              onChange={(e) => setNewSteps(e.target.value)}
              placeholder="Contoh: 1. Buka menu Servis, 2. Klik tombol..."
              className="admin-input text-xs"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="new-tkt-exp" label="Hasil yang Diharapkan">
              <input
                id="new-tkt-exp"
                value={newExpected}
                onChange={(e) => setNewExpected(e.target.value)}
                placeholder="Contoh: Status lunas"
                className="admin-input text-xs"
              />
            </FormField>

            <FormField id="new-tkt-act" label="Hasil Aktual">
              <input
                id="new-tkt-act"
                value={newActual}
                onChange={(e) => setNewActual(e.target.value)}
                placeholder="Contoh: Status tetap tertahan"
                className="admin-input text-xs"
              />
            </FormField>
          </div>
        </div>
      </SidePanel>

      {/* ========================================================= */}
      {/* MODAL: ADD KNOWLEDGE BASE ARTICLE */}
      {/* ========================================================= */}
      <CenterDialog
        isOpen={kbModalOpen}
        onClose={() => setKbModalOpen(false)}
        title="Tambah Dokumen Solusi Baru"
        subtitle="Dokumentasikan prosedur standar untuk masalah umum"
        maxWidthClass="max-w-[580px]"
        footer={
          <>
            <ActionButton intent="cancel" onClick={() => setKbModalOpen(false)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" onClick={handleCreateKbArticle}>
              Simpan Dokumen
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4 text-xs">
          <FormField id="kb-t" label="Judul Masalah">
            <input
              id="kb-t"
              value={newKbTitle}
              onChange={(e) => setNewKbTitle(e.target.value)}
              placeholder="Contoh: Status pembayaran tidak terupdate otomatis"
              className="admin-input text-xs"
              required
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField id="kb-c" label="Kategori">
              <select
                id="kb-c"
                value={newKbCat}
                onChange={(e) => setNewKbCat(e.target.value as TicketCategory)}
                className="admin-input text-xs"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField id="kb-m" label="Modul">
              <input
                id="kb-m"
                value={newKbModule}
                onChange={(e) => setNewKbModule(e.target.value)}
                placeholder="Contoh: pos, booking, gudang"
                className="admin-input text-xs"
              />
            </FormField>
          </div>

          <FormField id="kb-sym" label="Gejala Terdeteksi">
            <textarea
              id="kb-sym"
              rows={2}
              value={newKbSymptoms}
              onChange={(e) => setNewKbSymptoms(e.target.value)}
              placeholder="Deskripsi gejala saat error terjadi..."
              className="admin-input text-xs"
              required
            />
          </FormField>

          <FormField id="kb-cau" label="Kemungkinan Penyebab (1 baris per poin)">
            <textarea
              id="kb-cau"
              rows={2}
              value={newKbCauses}
              onChange={(e) => setNewKbCauses(e.target.value)}
              placeholder="Penyebab 1&#10;Penyebab 2"
              className="admin-input text-xs"
            />
          </FormField>

          <FormField id="kb-res" label="Langkah Solusi Disetujui (1 baris per poin)">
            <textarea
              id="kb-res"
              rows={3}
              value={newKbResSteps}
              onChange={(e) => setNewKbResSteps(e.target.value)}
              placeholder="Langkah 1&#10;Langkah 2"
              className="admin-input text-xs"
              required
            />
          </FormField>
        </div>
      </CenterDialog>

      {/* ========================================================= */}
      {/* MODAL: MASTER ADMIN REVIEW CORRECTION */}
      {/* ========================================================= */}
      <CenterDialog
        isOpen={Boolean(reviewDialogItem)}
        onClose={() => setReviewDialogItem(null)}
        title="Tinjau Otorisasi Koreksi Data"
        subtitle={`Keputusan Otorisasi untuk Permohonan ${reviewDialogItem?.id || ''}`}
        maxWidthClass="max-w-[500px]"
        footer={
          <>
            <ActionButton intent="cancel" onClick={() => setReviewDialogItem(null)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" onClick={handleReviewSubmit}>
              Simpan Keputusan
            </ActionButton>
          </>
        }
      >
        {reviewDialogItem && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] space-y-2">
              <div>
                <span className="text-[#646B7C] block text-[11px]">Entitas & Field:</span>
                <strong className="text-[#1E2230]">{reviewDialogItem.entityType} ({reviewDialogItem.entityId}) - {reviewDialogItem.fieldName}</strong>
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-[11px] pt-1 border-t border-[#EEF0F4]">
                <div>
                  <span className="text-[#646B7C] text-[10px] block">Semula:</span>
                  <span className="text-[#D62E5A]">{reviewDialogItem.currentValue}</span>
                </div>
                <div>
                  <span className="text-[#646B7C] text-[10px] block">Diubah Ke:</span>
                  <span className="text-[#1F9D3A] font-semibold">{reviewDialogItem.proposedValue}</span>
                </div>
              </div>
              <p className="text-[#1E2230]">
                <strong>Alasan Pengajuan:</strong> {reviewDialogItem.reason}
              </p>
            </div>

            <FormField id="rev-decision" label="Keputusan Otorisasi">
              <select
                id="rev-decision"
                value={reviewDecision}
                onChange={(e) => setReviewDecision(e.target.value as any)}
                className="admin-input text-xs"
              >
                <option value="disetujui">Setujui dan Terapkan Koreksi</option>
                <option value="ditolak">Tolak Pengajuan Koreksi</option>
              </select>
            </FormField>

            <FormField id="rev-notes" label="Catatan Tinjauan (Opsional)">
              <textarea
                id="rev-notes"
                rows={2}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Berikan alasan persetujuan atau penolakan..."
                className="admin-input text-xs"
              />
            </FormField>
          </div>
        )}
      </CenterDialog>
    </div>
  );
};

export default HelpDeskCenter;
