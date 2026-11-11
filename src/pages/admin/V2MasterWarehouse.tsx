import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createMasterPart,
  editMasterPart,
  getNextPartCode,
  useAdmin,
} from '../../context/AdminContext';
import {
  Part,
  computeStock,
} from '../../data/adminDummy';

type PartSatuan = 'pcs' | 'set' | 'liter' | 'botol' | 'pasang' | 'meter' | string;
import {
  computePartRequestDates,
  hasReceivedLineForPart,
} from './V2Warehouse';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { FilterMenu } from '../../components/admin/FilterMenu';
import { StatusChip } from '../../components/admin/StatusChip';
import {
  ActionButton,
  PlusIconButton,
  SearchIconButton,
  XIconButton,
} from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { ExpandableSearch } from '../../components/admin/ExpandableSearch';
import { FormField } from '../../components/admin/FormField';
import { CredentialGate, CredentialGateField } from '../../components/admin/CredentialGate';
import {
  DUMMY_ADMIN,
  DUMMY_ADMIN_GUDANG,
  DUMMY_MASTER,
  verifyWarehouseCredential,
  type VerifiedWarehouseUser,
} from '../../lib/mockCredentials';
import { StockOpnameWorkspace } from '../../components/admin/StockOpnameWorkspace';
import {
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';

type MasterFilterKey = 'all' | 'low' | 'ho_fulfilled';

const MASTER_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'low', label: 'Di bawah minimum' },
  { value: 'ho_fulfilled', label: 'Jenis HO terpenuhi' },
];

const WAREHOUSE_TABS = [
  { value: 'katalog', label: 'Katalog Part' },
  { value: 'opname', label: 'Stok Opname' },
];

const SATUAN_OPTIONS: PartSatuan[] = ['pcs', 'set', 'liter', 'botol', 'pasang', 'meter'];

const ENTRY_GATE_FIELDS: CredentialGateField[] = [
  {
    name: 'idGudang',
    label: 'ID Gudang',
    type: 'text',
    placeholder: 'ADMG-001 / MG-001',
    mono: true,
  },
  {
    name: 'nama',
    label: 'Nama',
    type: 'text',
    placeholder: 'Admin Gudang / Master Gudang Dummy',
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Masukkan password',
  },
  {
    name: 'pin',
    label: 'PIN (5 digit)',
    type: 'password',
    inputMode: 'numeric',
    maxLength: 5,
    digitsOnly: true,
    mono: true,
    placeholder: '5 digit angka',
  },
];

const EDIT_GATE_FIELDS: CredentialGateField[] = [
  {
    name: 'nama',
    label: 'Nama',
    type: 'text',
    placeholder: 'Admin Dummy',
  },
  {
    name: 'idAdmin',
    label: 'ID Admin',
    type: 'text',
    placeholder: 'ADM-001',
    mono: true,
  },
  {
    name: 'password',
    label: 'Password',
    type: 'password',
    placeholder: 'Masukkan password admin',
  },
];

const V2MasterWarehouse: React.FC = () => {
  const navigate = useNavigate();
  const { parts, partChanges, stockMovements, purchaseRequests } = useAdmin();
  const { notify } = useActionIsland();

  // In-memory warehouse role session (resets on unmount or reload)
  const [verifiedUser, setVerifiedUser] = useState<VerifiedWarehouseUser | null>(null);
  const [activeTab, setActiveTab] = useState<'katalog' | 'opname'>('katalog');

  const isMasterGudang = verifiedUser?.role === 'master_gudang';

  // Action bar state
  const [filterKey, setFilterKey] = useState<MasterFilterKey>('all');
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Selected part & Edit flow
  const [selectedPartCode, setSelectedPartCode] = useState<string | null>(null);
  const [editGateOpen, setEditGateOpen] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [verifiedAdmin, setVerifiedAdmin] = useState<{ nama: string; id: string } | null>(
    null
  );

  const [editNama, setEditNama] = useState<string>('');
  const [editSatuan, setEditSatuan] = useState<PartSatuan>('pcs');
  const [editHargaBeli, setEditHargaBeli] = useState<string>('0');
  const [editHargaJual, setEditHargaJual] = useState<string>('0');
  const [editStokMin, setEditStokMin] = useState<string>('1');
  const [editNote, setEditNote] = useState<string>('');
  const [editError, setEditError] = useState<string>('');
  const [highlightedHistoryIds, setHighlightedHistoryIds] = useState<Set<string>>(
    new Set()
  );
  const historySectionRef = useRef<HTMLDivElement>(null);

  // New part ("Part baru") side panel
  const [newPartOpen, setNewPartOpen] = useState<boolean>(false);
  const [newNama, setNewNama] = useState<string>('');
  const [newSatuan, setNewSatuan] = useState<PartSatuan>('pcs');
  const [newJenis, setNewJenis] = useState<'reguler' | 'ho'>('reguler');
  const [newStokAwal, setNewStokAwal] = useState<string>('0');
  const [newHargaBeli, setNewHargaBeli] = useState<string>('0');
  const [newHargaJual, setNewHargaJual] = useState<string>('0');
  const [newStokMin, setNewStokMin] = useState<string>('1');
  const [newCatatan, setNewCatatan] = useState<string>('');
  const [newErrors, setNewErrors] = useState<Record<string, string>>({});

  const [flashPartCode, setFlashPartCode] = useState<string | null>(null);

  useEffect(() => {
    if (searchOpen) {
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [searchOpen]);

  const triggerFlashRow = (code: string) => {
    setFlashPartCode(code);
    window.setTimeout(() => {
      setFlashPartCode((cur) => (cur === code ? null : cur));
    }, 800);
  };

  const selectedPart = useMemo(
    () =>
      parts.find((p) => p.kode === selectedPartCode || p.id === selectedPartCode) ?? null,
    [parts, selectedPartCode]
  );

  const selectedPartHistory = useMemo(() => {
    if (!selectedPart) return [];
    return partChanges.filter(
      (h) => h.partId === selectedPart.id || h.partId === selectedPart.kode
    );
  }, [selectedPart, partChanges]);

  const filteredParts = useMemo(() => {
    let base = parts;
    if (filterKey === 'low') {
      base = base.filter(
        (p) =>
          p.jenis === 'reguler' &&
          p.stokMin !== null &&
          computeStock(p, stockMovements) < p.stokMin
      );
    } else if (filterKey === 'ho_fulfilled') {
      base = base.filter(
        (p) => p.jenis === 'ho' && hasReceivedLineForPart(p, purchaseRequests)
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) =>
        p.kode.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q)
    );
  }, [parts, filterKey, searchQuery, stockMovements, purchaseRequests]);

  const getPartStatusLabel = (p: Part): 'Kritis' | 'Aman' | 'HO' => {
    if (p.jenis === 'ho') return 'HO';
    const stk = computeStock(p, stockMovements);
    return p.stokMin !== null && stk < p.stokMin ? 'Kritis' : 'Aman';
  };

  const handleCloseEntryGate = () => {
    if (typeof window !== 'undefined' && window.history.length > 2) {
      navigate(-1);
    } else {
      navigate('/admin');
    }
  };

  const openPartDetail = (part: Part) => {
    setSelectedPartCode(part.kode);
    setIsEditing(false);
    setVerifiedAdmin(null);
    setEditError('');
    setHighlightedHistoryIds(new Set());
  };

  const beginEditAfterGate = (adminNama: string, adminId: string) => {
    if (!selectedPart) return;
    setVerifiedAdmin({ nama: adminNama, id: adminId });
    setEditNama(selectedPart.nama);
    setEditSatuan(selectedPart.satuan);
    setEditHargaBeli(String(selectedPart.hargaBeli));
    setEditHargaJual(String(selectedPart.hargaJual));
    setEditStokMin(String(selectedPart.stokMin ?? 1));
    setEditNote('');
    setEditError('');
    setIsEditing(true);
    setEditGateOpen(false);
  };

  const handleSaveEdit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedPart || !verifiedAdmin) return;

    const trimmedNama = editNama.trim();
    if (!trimmedNama) {
      setEditError('Nama part wajib diisi.');
      return;
    }

    const clash = parts.find(
      (p) =>
        p.id !== selectedPart.id &&
        p.nama.trim().toLowerCase() === trimmedNama.toLowerCase()
    );
    if (clash) {
      setEditError(`Nama part sudah ada: ${clash.kode}.`);
      return;
    }

    const numBeli = Number(editHargaBeli);
    const numJual = Number(editHargaJual);
    if (Number.isNaN(numBeli) || numBeli < 0) {
      setEditError('Harga Beli minimal Rp 0.');
      return;
    }
    if (Number.isNaN(numJual) || numJual < 0) {
      setEditError('Harga Jual minimal Rp 0.');
      return;
    }

    const numStokMin =
      selectedPart.jenis === 'reguler'
        ? Math.max(0, Math.floor(Number(editStokMin) || 0))
        : null;

    if (editNote.trim().length < 5) {
      setEditError('Catatan penyesuaian wajib diisi minimal 5 karakter.');
      return;
    }

    const res = editMasterPart({
      partId: selectedPart.id,
      nama: trimmedNama,
      satuan: editSatuan,
      hargaBeli: numBeli,
      hargaJual: numJual,
      stokMin: numStokMin,
      note: editNote.trim(),
      byNama: verifiedAdmin.nama,
      byId: verifiedAdmin.id,
    });

    if (!res.ok) {
      setEditError(res.error || 'Tidak ada perubahan.');
      return;
    }

    // Leave edit mode (pass covers one edit only), highlight new history rows, scroll to Riwayat edit
    setIsEditing(false);
    setVerifiedAdmin(null);
    setEditError('');

    const newIds = new Set<string>(res.newHistoryIds || []);
    setHighlightedHistoryIds(newIds);
    triggerFlashRow(selectedPart.kode);

    window.setTimeout(() => {
      historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);

    window.setTimeout(() => {
      setHighlightedHistoryIds(new Set());
    }, 1500);
  };

  const openNewPartPanel = (trigger: HTMLElement) => {
    setLastTriggerElement(trigger);
    setNewNama('');
    setNewSatuan('pcs');
    setNewJenis('reguler');
    setNewStokAwal('0');
    setNewHargaBeli('0');
    setNewHargaJual('0');
    setNewStokMin('1');
    setNewCatatan('');
    setNewErrors({});
    setNewPartOpen(true);
  };

  const handleSaveNewPart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const errs: Record<string, string> = {};

    const trimmedNama = newNama.trim();
    if (!trimmedNama) {
      errs.nama = 'Nama part wajib diisi.';
    } else {
      const clash = parts.find(
        (p) => p.nama.trim().toLowerCase() === trimmedNama.toLowerCase()
      );
      if (clash) {
        errs.nama = `Nama part sudah ada: ${clash.kode}.`;
      }
    }

    const stkAwal = Number(newStokAwal);
    if (!Number.isInteger(stkAwal) || stkAwal < 0) {
      errs.stokAwal = 'Stok awal harus bilangan bulat minimal 0.';
    }

    const hBeli = Number(newHargaBeli);
    if (Number.isNaN(hBeli) || hBeli < 0) {
      errs.hargaBeli = 'Harga beli minimal Rp 0.';
    }

    const hJual = Number(newHargaJual);
    if (Number.isNaN(hJual) || hJual < 0) {
      errs.hargaJual = 'Harga jual minimal Rp 0.';
    }

    if (newJenis === 'reguler') {
      const sMin = Number(newStokMin);
      if (!Number.isInteger(sMin) || sMin < 0) {
        errs.stokMin = 'Stok minimum harus bilangan bulat minimal 0.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setNewErrors(errs);
      return;
    }

    const res = createMasterPart({
      nama: trimmedNama,
      satuan: newSatuan,
      jenis: newJenis,
      stokAwal: Math.floor(stkAwal),
      hargaBeli: hBeli,
      hargaJual: hJual,
      stokMin: newJenis === 'reguler' ? Math.floor(Number(newStokMin) || 1) : null,
      catatan: newCatatan.trim(),
    });

    if (!res.ok || !res.part) {
      setNewErrors({ nama: res.error || 'Periksa kembali data part baru.' });
      return;
    }

    setNewPartOpen(false);
    triggerFlashRow(res.part.kode);
    notify(`Part ${res.part.kode} ditambahkan.`);
  };

  // Columns in exact order:
  // Kode Part, Nama Part, Satuan, Stok, Harga Beli, Stok Minimum, Harga Jual, Jenis, Status, Tanggal Pemesanan, Tanggal Terima
  const columns: Column<Part>[] = [
    {
      key: 'kode',
      header: 'Kode Part',
      render: (p) => <samp className="font-mono font-semibold text-[#1E2230]">{p.kode}</samp>,
    },
    {
      key: 'nama',
      header: 'Nama Part',
      render: (p) => <span className="font-medium text-[#1E2230]">{p.nama}</span>,
    },
    { key: 'satuan', header: 'Satuan' },
    {
      key: 'stok',
      header: 'Stok',
      align: 'right',
      render: (p) => {
        const stk = computeStock(p, stockMovements);
        return (
          <data value={stk} className="tabular-nums font-semibold">
            {stk}
          </data>
        );
      },
    },
    {
      key: 'hargaBeli',
      header: 'Harga Beli',
      align: 'right',
      render: (p) => (
        <data value={p.hargaBeli} className="tabular-nums font-medium">
          {formatRupiah(p.hargaBeli)}
        </data>
      ),
    },
    {
      key: 'stokMin',
      header: 'Stok Minimum',
      align: 'right',
      render: (p) =>
        p.jenis === 'ho' ? (
          <span className="text-[13px] text-[#646B7C]">Tidak berlaku</span>
        ) : (
          <data value={p.stokMin ?? 1} className="tabular-nums font-medium">
            {p.stokMin ?? 1}
          </data>
        ),
    },
    {
      key: 'hargaJual',
      header: 'Harga Jual',
      align: 'right',
      render: (p) => (
        <data value={p.hargaJual} className="tabular-nums font-medium">
          {formatRupiah(p.hargaJual)}
        </data>
      ),
    },
    {
      key: 'jenis',
      header: 'Jenis',
      render: (p) => <StatusChip status={p.jenis === 'ho' ? 'HO' : 'Reguler'} />,
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusChip status={getPartStatusLabel(p)} />,
    },
    {
      key: 'tanggalPemesanan',
      header: 'Tanggal Pemesanan',
      render: (p) => {
        const dates = computePartRequestDates(p, purchaseRequests);
        return (
          <span className="font-mono text-[13px] text-[#646B7C]">
            {dates.latestRequestDate}
          </span>
        );
      },
    },
    {
      key: 'tanggalTerima',
      header: 'Tanggal Terima',
      render: (p) => {
        const dates = computePartRequestDates(p, purchaseRequests);
        return (
          <span className="font-mono text-[13px] text-[#646B7C]">
            {dates.latestReceivedDate}
          </span>
        );
      },
    },
  ];

  const isNewJualBelowBeli =
    Number(newHargaJual) >= 0 &&
    Number(newHargaBeli) > 0 &&
    Number(newHargaJual) < Number(newHargaBeli);

  const isEditJualBelowBeli =
    Number(editHargaJual) >= 0 &&
    Number(editHargaBeli) > 0 &&
    Number(editHargaJual) < Number(editHargaBeli);

  return (
    <>
      {/* Entry Gate on every visit */}
      <CredentialGate
        isOpen={!verifiedUser}
        title="Verifikasi Gudang"
        subtitle="Masukkan kredensial gudang untuk mengakses halaman ini"
        prototypeNote={`Prototype Admin Gudang: ID "${DUMMY_ADMIN_GUDANG.id}", Nama "${DUMMY_ADMIN_GUDANG.nama}", Password "${DUMMY_ADMIN_GUDANG.password}", PIN "${DUMMY_ADMIN_GUDANG.pin}".\nPrototype Master Gudang: ID "${DUMMY_MASTER.id}", Nama "${DUMMY_MASTER.nama}", Password "${DUMMY_MASTER.password}", PIN "${DUMMY_MASTER.pin}".`}
        fields={ENTRY_GATE_FIELDS}
        submitLabel="Masuk"
        errorMessage="Data verifikasi tidak cocok."
        onClose={handleCloseEntryGate}
        onVerify={(vals) => Boolean(verifyWarehouseCredential(vals))}
        onPass={(vals) => {
          const user = verifyWarehouseCredential(vals);
          if (user) {
            setVerifiedUser(user);
          }
        }}
      />

      {verifiedUser && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm">
            <FilterTabs
              tabs={WAREHOUSE_TABS}
              value={activeTab}
              onChange={(v) => setActiveTab(v as 'katalog' | 'opname')}
              ariaLabel="Navigasi Gudang"
            />

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4] text-[13px]">
                <span className="text-[#646B7C]">Peran:</span>
                <span
                  className={`px-2 py-0.5 rounded-[8px] font-semibold text-[12px] ${
                    isMasterGudang
                      ? 'bg-[#EBF5FB] text-[#1D6FC4]'
                      : 'bg-[#E8F8F0] text-[#1B8354]'
                  }`}
                >
                  {isMasterGudang ? 'Master Gudang' : 'Admin Gudang'}
                </span>
                <span className="font-medium text-[#1E2230]">{verifiedUser.nama}</span>
                <samp className="font-mono text-[12px] text-[#646B7C]">({verifiedUser.id})</samp>
              </div>

              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => {
                  setVerifiedUser(null);
                  setSelectedPartCode(null);
                  setIsEditing(false);
                }}
              >
                Kunci / Keluar
              </ActionButton>
            </div>
          </div>

          {activeTab === 'katalog' ? (
            <DataCard
              title="Master Gudang"
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <ExpandableSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Kode atau nama part..."
                    ariaLabel="Cari part"
                  />

                  <FilterMenu
                    value={filterKey}
                    defaultValue="all"
                    options={MASTER_FILTER_OPTIONS}
                    onChange={(v) => setFilterKey(v as MasterFilterKey)}
                    ariaLabel="Filter Master Gudang"
                  />

                  {isMasterGudang && (
                    <PlusIconButton
                      ariaLabel="Tambah part baru"
                      title="Tambah part baru"
                      onClick={(e) => openNewPartPanel(e.currentTarget)}
                    />
                  )}
                </div>
              }
            >
          {parts.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA]">
              <p className="text-[14px] text-[#646B7C]">
                Belum ada part. Tambahkan dengan tombol +.
              </p>
            </div>
          ) : filteredParts.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA] space-y-2">
              <p className="text-[14px] text-[#646B7C]">
                Tidak ada part untuk filter ini.
              </p>
              <button
                type="button"
                onClick={() => {
                  setFilterKey('all');
                  setSearchQuery('');
                }}
                className="font-sans text-[13px] font-semibold text-[#1D6FC4] underline underline-offset-2"
              >
                Hapus filter
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block">
                <DataTable
                  columns={columns}
                  data={filteredParts}
                  keyExtractor={(p) => p.kode}
                  onRowClick={openPartDetail}
                  flashKey={flashPartCode}
                  swapKey={`master-${filterKey}-${searchQuery}`}
                />
              </div>

              {/* Mobile Stacked Blocks (same fields in the exact same order) */}
              <div className="md:hidden space-y-3">
                {filteredParts.map((p) => {
                  const stk = computeStock(p, stockMovements);
                  const statusLabel = getPartStatusLabel(p);
                  const dates = computePartRequestDates(p, purchaseRequests);
                  return (
                    <div
                      key={p.kode}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        setLastTriggerElement(e.currentTarget);
                        openPartDetail(p);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setLastTriggerElement(e.currentTarget);
                          openPartDetail(p);
                        }
                      }}
                      className={`p-4 rounded-[16px] border border-[#EEF0F4] bg-white space-y-2 text-[13px] cursor-pointer hover:bg-[#F6F7FA] ${
                        flashPartCode === p.kode ? 'admin-row-flash' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Kode Part</span>
                        <samp className="font-mono font-semibold text-[#1E2230]">{p.kode}</samp>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Nama Part</span>
                        <span className="font-medium text-[#1E2230]">{p.nama}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Satuan</span>
                        <span>{p.satuan}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Stok</span>
                        <data value={stk} className="font-mono font-semibold tabular-nums">
                          {stk}
                        </data>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Harga Beli</span>
                        <data value={p.hargaBeli} className="font-mono tabular-nums">
                          {formatRupiah(p.hargaBeli)}
                        </data>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Stok Minimum</span>
                        <span>
                          {p.jenis === 'ho' ? 'Tidak berlaku' : p.stokMin ?? 1}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Harga Jual</span>
                        <data value={p.hargaJual} className="font-mono tabular-nums">
                          {formatRupiah(p.hargaJual)}
                        </data>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Jenis</span>
                        <StatusChip status={p.jenis === 'ho' ? 'HO' : 'Reguler'} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Status</span>
                        <StatusChip status={statusLabel} />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Tanggal Pemesanan</span>
                        <span className="font-mono text-[#646B7C]">{dates.latestRequestDate}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[#646B7C]">Tanggal Terima</span>
                        <span className="font-mono text-[#646B7C]">{dates.latestReceivedDate}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DataCard>
          ) : (
            <StockOpnameWorkspace verifiedUser={verifiedUser} />
          )}
        </div>
      )}

      {/* Part Detail & Edit SidePanel */}
      <SidePanel
        isOpen={Boolean(selectedPart)}
        onClose={() => {
          setSelectedPartCode(null);
          setIsEditing(false);
          setVerifiedAdmin(null);
        }}
        title={
          selectedPart ? `${selectedPart.kode} · ${selectedPart.nama}` : 'Detail Part'
        }
        widthClass="max-w-[600px]"
        footer={
          isEditing ? (
            <>
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => {
                  setIsEditing(false);
                  setVerifiedAdmin(null);
                  setEditError('');
                }}
              >
                Batal edit
              </ActionButton>
              <ActionButton
                type="button"
                intent="start"
                onClick={() => handleSaveEdit()}
              >
                Simpan perubahan
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => setSelectedPartCode(null)}
              >
                Tutup
              </ActionButton>
              {isMasterGudang && (
                <ActionButton
                  type="button"
                  intent="neutral"
                  onClick={(e) => {
                    setLastTriggerElement(e.currentTarget);
                    if (verifiedUser) {
                      beginEditAfterGate(verifiedUser.nama, verifiedUser.id);
                    }
                  }}
                >
                  Edit
                </ActionButton>
              )}
            </>
          )
        }
      >
        {selectedPart && (
          <div className="space-y-6">
            {/* Definition List with all 11 table fields + Dibuat pada */}
            {(() => {
              const stk = computeStock(selectedPart, stockMovements);
              const statusLabel = getPartStatusLabel(selectedPart);
              const dates = computePartRequestDates(selectedPart, purchaseRequests);
              return (
                <dl className="grid grid-cols-2 gap-3 p-4 rounded-[12px] bg-[#F6F7FA] text-[13px]">
                  <div>
                    <dt className="text-[#646B7C]">Kode Part</dt>
                    <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">
                      {selectedPart.kode}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Nama Part</dt>
                    <dd className="font-medium text-[#1E2230] mt-0.5">
                      {selectedPart.nama}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Satuan</dt>
                    <dd className="font-medium text-[#1E2230] mt-0.5">
                      {selectedPart.satuan}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Stok</dt>
                    <dd className="font-mono font-bold text-[16px] text-[#1E2230] mt-0.5 tabular-nums">
                      {stk}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Harga Beli</dt>
                    <dd className="font-mono font-medium text-[#1E2230] mt-0.5 tabular-nums">
                      {formatRupiah(selectedPart.hargaBeli)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Stok Minimum</dt>
                    <dd className="font-mono text-[#1E2230] mt-0.5 tabular-nums">
                      {selectedPart.jenis === 'ho'
                        ? 'Tidak berlaku'
                        : selectedPart.stokMin ?? 1}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Harga Jual</dt>
                    <dd className="font-mono font-medium text-[#1E2230] mt-0.5 tabular-nums">
                      {formatRupiah(selectedPart.hargaJual)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Jenis</dt>
                    <dd className="mt-1">
                      <StatusChip
                        status={selectedPart.jenis === 'ho' ? 'HO' : 'Reguler'}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Status</dt>
                    <dd className="mt-1">
                      <StatusChip status={statusLabel} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Tanggal Pemesanan</dt>
                    <dd className="font-mono text-[#1E2230] mt-0.5">
                      {dates.latestRequestDate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Tanggal Terima</dt>
                    <dd className="font-mono text-[#1E2230] mt-0.5">
                      {dates.latestReceivedDate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#646B7C]">Dibuat pada</dt>
                    <dd className="font-mono text-[#1E2230] mt-0.5">
                      {selectedPart.createdAt}
                    </dd>
                  </div>
                </dl>
              );
            })()}

            {/* Edit Form (only shown after passing Admin CredentialGate) */}
            {isEditing && (
              <form
                onSubmit={handleSaveEdit}
                noValidate
                className="p-4 rounded-[12px] border border-[#EEF0F4] space-y-4"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold text-[#1E2230]">
                    Edit data part
                  </h3>
                  <span className="text-[12px] text-[#646B7C]">
                    Kode, Stok, dan Jenis tidak dapat diubah
                  </span>
                </div>

                <FormField id="edit-part-nama" label="Nama part">
                  <input
                    id="edit-part-nama"
                    type="text"
                    value={editNama}
                    onChange={(e) => {
                      setEditNama(e.target.value);
                      if (editError) setEditError('');
                    }}
                    className="admin-input"
                  />
                </FormField>

                <FormField id="edit-part-satuan" label="Satuan">
                  <select
                    id="edit-part-satuan"
                    value={editSatuan}
                    onChange={(e) => {
                      setEditSatuan(e.target.value as PartSatuan);
                      if (editError) setEditError('');
                    }}
                    className="admin-input"
                  >
                    {SATUAN_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField id="edit-part-beli" label="Harga Beli (Rp)">
                    <input
                      id="edit-part-beli"
                      type="number"
                      min={0}
                      step={500}
                      value={editHargaBeli}
                      onChange={(e) => {
                        setEditHargaBeli(e.target.value);
                        if (editError) setEditError('');
                      }}
                      className="admin-input tabular-nums"
                    />
                  </FormField>

                  <FormField id="edit-part-jual" label="Harga Jual (Rp)">
                    <input
                      id="edit-part-jual"
                      type="number"
                      min={0}
                      step={500}
                      value={editHargaJual}
                      onChange={(e) => {
                        setEditHargaJual(e.target.value);
                        if (editError) setEditError('');
                      }}
                      className="admin-input tabular-nums"
                    />
                  </FormField>
                </div>

                {isEditJualBelowBeli && (
                  <p className="text-[12px] font-medium text-[#B77700]">
                    Harga jual lebih rendah dari harga beli.
                  </p>
                )}

                {selectedPart.jenis === 'reguler' ? (
                  <FormField id="edit-part-stokmin" label="Stok Minimum">
                    <input
                      id="edit-part-stokmin"
                      type="number"
                      min={0}
                      step={1}
                      value={editStokMin}
                      onChange={(e) => {
                        setEditStokMin(e.target.value);
                        if (editError) setEditError('');
                      }}
                      className="admin-input tabular-nums"
                    />
                  </FormField>
                ) : (
                  <div className="text-[13px] text-[#646B7C]">
                    Stok Minimum: <strong className="text-[#1E2230]">Tidak berlaku</strong>
                  </div>
                )}

                <FormField
                  id="edit-part-note"
                  label="Catatan penyesuaian (wajib, minimal 5 karakter)"
                >
                  <textarea
                    id="edit-part-note"
                    rows={2}
                    value={editNote}
                    onChange={(e) => {
                      setEditNote(e.target.value);
                      if (editError) setEditError('');
                    }}
                    placeholder="Contoh: Penyesuaian harga dari katalog pemasok terbaru"
                    className="admin-input"
                  />
                </FormField>

                {editError && (
                  <p role="alert" className="text-[13px] font-medium text-[#D62E5A]">
                    {editError}
                  </p>
                )}
              </form>
            )}

            {/* Riwayat edit section */}
            <div ref={historySectionRef} className="pt-2 border-t border-[#EEF0F4] space-y-3">
              <h3 className="text-[14px] font-semibold text-[#1E2230]">Riwayat edit</h3>
              {selectedPartHistory.length === 0 ? (
                <p className="text-[13px] text-[#646B7C] py-3">
                  Belum ada riwayat perubahan pada part ini.
                </p>
              ) : (
                <ul className="divide-y divide-[#EEF0F4] text-[13px]">
                  {selectedPartHistory.map((h) => (
                    <li
                      key={h.id}
                      className={`py-2.5 px-2 rounded-[10px] space-y-1 ${
                        highlightedHistoryIds.has(h.id) ? 'admin-row-flash' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#1E2230]">{h.field}</span>
                        <span className="font-mono text-[12px] text-[#646B7C]">{h.at}</span>
                      </div>
                      {(h.oldValue || h.newValue) && (
                        <div className="font-mono text-[13px] text-[#1E2230]">
                          <span className="text-[#646B7C] line-through mr-2">
                            {h.oldValue}
                          </span>
                          <span>→ {h.newValue}</span>
                        </div>
                      )}
                      {h.note && <p className="text-[#1E2230]">{h.note}</p>}
                      <div className="text-[12px] text-[#646B7C]">
                        Oleh: {h.byNama} (<samp className="font-mono">{h.byId}</samp>)
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      {/* Edit CredentialGate (Admin Nama, ID Admin, Password) */}
      <CredentialGate
        isOpen={editGateOpen}
        title="Verifikasi Edit Part"
        subtitle="Masukkan kredensial Admin untuk mengaktifkan mode edit"
        prototypeNote={`Prototype: Nama "${DUMMY_ADMIN.nama}", ID Admin "${DUMMY_ADMIN.id}", Password "${DUMMY_ADMIN.password}".`}
        fields={EDIT_GATE_FIELDS}
        submitLabel="Buka edit"
        errorMessage="Data verifikasi tidak cocok."
        onClose={() => setEditGateOpen(false)}
        onVerify={(vals) =>
          (vals.nama || '').trim() === DUMMY_ADMIN.nama &&
          (vals.idAdmin || '').trim() === DUMMY_ADMIN.id &&
          (vals.password || '') === DUMMY_ADMIN.password
        }
        onPass={(vals) =>
          beginEditAfterGate(
            (vals.nama || DUMMY_ADMIN.nama).trim(),
            (vals.idAdmin || DUMMY_ADMIN.id).trim()
          )
        }
      />

      {/* Part Baru SidePanel */}
      <SidePanel
        isOpen={newPartOpen}
        onClose={() => setNewPartOpen(false)}
        title="Part baru"
        widthClass="max-w-[540px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="cancel"
              onClick={() => setNewPartOpen(false)}
            >
              Tutup
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              onClick={() => handleSaveNewPart()}
            >
              Simpan part
            </ActionButton>
          </>
        }
      >
        <form onSubmit={handleSaveNewPart} noValidate className="space-y-4">
          <FormField id="new-part-kode" label="Kode Part">
            <input
              id="new-part-kode"
              type="text"
              readOnly
              value={getNextPartCode()}
              className="admin-input font-mono bg-[#F6F7FA] text-[#646B7C]"
            />
          </FormField>

          <FormField id="new-part-nama" label="Nama part" error={newErrors.nama}>
            <input
              id="new-part-nama"
              type="text"
              value={newNama}
              onChange={(e) => {
                setNewNama(e.target.value);
                if (newErrors.nama) {
                  setNewErrors((prev) => ({ ...prev, nama: '' }));
                }
              }}
              placeholder="Contoh: Filter udara matic"
              className="admin-input"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField id="new-part-satuan" label="Satuan">
              <select
                id="new-part-satuan"
                value={newSatuan}
                onChange={(e) => setNewSatuan(e.target.value as PartSatuan)}
                className="admin-input"
              >
                {SATUAN_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </FormField>

            <div>
              <span className="block font-sans font-medium text-[13px] text-[#1E2230] mb-1.5">
                Jenis
              </span>
              <FilterTabs
                ariaLabel="Jenis part baru"
                value={newJenis}
                onChange={(v) => setNewJenis(v as 'reguler' | 'ho')}
                tabs={[
                  { value: 'reguler', label: 'Reguler' },
                  { value: 'ho', label: 'HO' },
                ]}
              />
            </div>
          </div>

          <FormField id="new-part-stok-awal" label="Stok awal" error={newErrors.stokAwal}>
            <input
              id="new-part-stok-awal"
              type="number"
              min={0}
              step={1}
              value={newStokAwal}
              onChange={(e) => {
                setNewStokAwal(e.target.value);
                if (newErrors.stokAwal) {
                  setNewErrors((prev) => ({ ...prev, stokAwal: '' }));
                }
              }}
              className="admin-input tabular-nums"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField
              id="new-part-beli"
              label="Harga beli (Rp)"
              error={newErrors.hargaBeli}
            >
              <input
                id="new-part-beli"
                type="number"
                min={0}
                step={1000}
                value={newHargaBeli}
                onChange={(e) => {
                  setNewHargaBeli(e.target.value);
                  if (newErrors.hargaBeli) {
                    setNewErrors((prev) => ({ ...prev, hargaBeli: '' }));
                  }
                }}
                className="admin-input tabular-nums"
              />
            </FormField>

            <FormField
              id="new-part-jual"
              label="Harga jual (Rp)"
              error={newErrors.hargaJual}
            >
              <input
                id="new-part-jual"
                type="number"
                min={0}
                step={1000}
                value={newHargaJual}
                onChange={(e) => {
                  setNewHargaJual(e.target.value);
                  if (newErrors.hargaJual) {
                    setNewErrors((prev) => ({ ...prev, hargaJual: '' }));
                  }
                }}
                className="admin-input tabular-nums"
              />
            </FormField>
          </div>

          {isNewJualBelowBeli && (
            <p className="text-[12px] font-medium text-[#B77700]">
              Harga jual lebih rendah dari harga beli.
            </p>
          )}

          {newJenis === 'reguler' ? (
            <FormField
              id="new-part-stokmin"
              label="Stok minimum"
              error={newErrors.stokMin}
            >
              <input
                id="new-part-stokmin"
                type="number"
                min={0}
                step={1}
                value={newStokMin}
                onChange={(e) => {
                  setNewStokMin(e.target.value);
                  if (newErrors.stokMin) {
                    setNewErrors((prev) => ({ ...prev, stokMin: '' }));
                  }
                }}
                className="admin-input tabular-nums"
              />
            </FormField>
          ) : (
            <FormField id="new-part-stokmin-ho" label="Stok minimum">
              <input
                id="new-part-stokmin-ho"
                type="text"
                readOnly
                value="Tidak berlaku"
                className="admin-input bg-[#F6F7FA] text-[#646B7C]"
              />
            </FormField>
          )}

          <FormField id="new-part-catatan" label="Catatan (opsional)">
            <textarea
              id="new-part-catatan"
              rows={2}
              value={newCatatan}
              onChange={(e) => setNewCatatan(e.target.value)}
              placeholder="Catatan tambahan part baru"
              className="admin-input"
            />
          </FormField>
        </form>
      </SidePanel>
    </>
  );
};

export default V2MasterWarehouse;
