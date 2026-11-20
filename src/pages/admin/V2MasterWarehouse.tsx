import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { computeStock, Part, PartJenis } from '../../data/adminDummy';
import { useAuth } from '../../lib/mockAuth';
import { formatRupiah } from '../../lib/format';
import { type VerifiedWarehouseUser } from '../../lib/mockCredentials';
import { PageHeader } from '../../components/admin/PageHeader';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { SearchField } from '../../components/admin/SearchField';
import { StatusChip } from '../../components/admin/StatusChip';
import { SidePanel } from '../../components/admin/SidePanel';
import { CenterDialog } from '../../components/admin/CenterDialog';
import { FormField } from '../../components/admin/FormField';
import { ActionButton, PencilIcon, PlusIcon, TrashIcon } from '../../components/admin/ActionButton';
import { StockOpnameWorkspace } from '../../components/admin/StockOpnameWorkspace';
import { useActionIsland } from '../../components/admin/island/IslandSystem';

type WorkspaceTab = 'input' | 'opname';
type PartListFilter = 'all' | 'low';

const SATUAN_OPTIONS = ['pcs', 'botol', 'set', 'liter', 'buah', 'meter'];

const V2MasterWarehouse: React.FC = () => {
  const { role, user } = useAuth();
  const {
    parts,
    stockMovements,
    partHistory,
    getNextPartCode,
    createMasterPart,
    editMasterPart,
    deleteMasterPart,
    recordAuditEvent,
  } = useAdmin();
  const { notify } = useActionIsland();

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('input');
  const [listFilter, setListFilter] = useState<PartListFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [nama, setNama] = useState('');
  const [jenis, setJenis] = useState<PartJenis>('reguler');
  const [satuan, setSatuan] = useState('pcs');
  const [stokAwal, setStokAwal] = useState('0');
  const [stokMin, setStokMin] = useState('5');
  const [hargaBeli, setHargaBeli] = useState('0');
  const [hargaJual, setHargaJual] = useState('0');
  const [catatan, setCatatan] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [editPartTarget, setEditPartTarget] = useState<Part | null>(null);
  const [editNama, setEditNama] = useState('');
  const [editSatuan, setEditSatuan] = useState('pcs');
  const [editStok, setEditStok] = useState('0');
  const [editStokMin, setEditStokMin] = useState('1');
  const [editHargaBeli, setEditHargaBeli] = useState('0');
  const [editHargaJual, setEditHargaJual] = useState('0');
  const [editNote, setEditNote] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Part | null>(null);
  const [historyPartTarget, setHistoryPartTarget] = useState<Part | null>(null);

  if (role === 'admin') {
    return <Navigate to="/admin/v2/warehouse" replace />;
  }

  const actorName =
    user?.name ||
    user?.email ||
    (role === 'master_helpdesk' ? 'Master Helpdesk' : 'Master Admin');
  const actorId = user?.roleCode || (role === 'master_helpdesk' ? 'HD-001' : 'MG-001');
  const auditRole = role === 'master_helpdesk' ? 'master_helpdesk' : 'master_admin';

  const stockOpnameActor: VerifiedWarehouseUser = {
    id: actorId,
    nama: actorName,
    email: user?.email || (role === 'master_helpdesk' ? 'helpdesk@mybengkel.com' : 'masteradmin@mybengkel.com'),
    role: 'master_gudang',
  };

  const nextKodePreview = getNextPartCode();

  const partRows = useMemo(() => {
    return parts.map((p) => {
      const stok = computeStock(p, stockMovements);
      const critical = p.jenis === 'reguler' && stok <= (p.stokMin ?? 0);
      return { part: p, stok, critical };
    });
  }, [parts, stockMovements]);

  const totalCount = partRows.length;
  const lowCount = useMemo(() => partRows.filter((r) => r.critical).length, [partRows]);

  const filteredParts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return partRows
      .filter((r) => {
        if (listFilter === 'low' && !r.critical) return false;
        if (!q) return true;
        return (
          r.part.kode.toLowerCase().includes(q) ||
          r.part.nama.toLowerCase().includes(q) ||
          r.part.satuan.toLowerCase().includes(q)
        );
      })
      .map((r) => r.part);
  }, [partRows, listFilter, searchQuery]);

  const selectedHistoryRows = useMemo(() => {
    if (!historyPartTarget) return [];
    return partHistory.filter((h) => h.partId === historyPartTarget.kode);
  }, [historyPartTarget, partHistory]);

  const handleCreatePart = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedStokAwal = Number(stokAwal);
    const parsedHargaBeli = Number(hargaBeli);
    const parsedHargaJual = Number(hargaJual);
    const parsedStokMin = jenis === 'ho' ? null : Number(stokMin);

    if (Number.isNaN(parsedStokAwal) || parsedStokAwal < 0) {
      setFormError('Stok awal harus bernilai 0 atau lebih.');
      return;
    }
    if (
      Number.isNaN(parsedHargaBeli) ||
      parsedHargaBeli < 0 ||
      Number.isNaN(parsedHargaJual) ||
      parsedHargaJual < 0
    ) {
      setFormError('Harga beli dan harga jual harus bernilai 0 atau lebih.');
      return;
    }
    if (jenis === 'reguler' && (parsedStokMin === null || Number.isNaN(parsedStokMin) || parsedStokMin < 0)) {
      setFormError('Stok minimum untuk part reguler minimal 0.');
      return;
    }

    const res = createMasterPart({
      nama,
      jenis,
      satuan,
      stokAwal: parsedStokAwal,
      stokMin: parsedStokMin,
      hargaBeli: parsedHargaBeli,
      hargaJual: parsedHargaJual,
      catatan,
      byNama: actorName,
      byId: actorId,
      actorRole: role || undefined,
    });

    if (!res.ok || !res.part) {
      setFormError(res.error || 'Gagal menyimpan data part baru.');
      return;
    }

    recordAuditEvent({
      actorId,
      actorName,
      actorRole: auditRole,
      event: 'part_created',
      category: 'bisnis',
      module: 'gudang',
      action: `Menambahkan part baru ${res.part.kode} (${res.part.nama})`,
      entityType: 'Part',
      entityId: res.part.kode,
      outcome: 'berhasil',
    });

    notify(`Part ${res.part.kode} (${res.part.nama}) berhasil ditambahkan.`);
    setNama('');
    setStokAwal('0');
    setStokMin('5');
    setHargaBeli('0');
    setHargaJual('0');
    setCatatan('');
  };

  const openEditPanel = (part: Part) => {
    const currentStok = computeStock(part, stockMovements);
    setEditPartTarget(part);
    setEditNama(part.nama);
    setEditSatuan(part.satuan || 'pcs');
    setEditStok(String(currentStok));
    setEditStokMin(String(part.stokMin ?? 1));
    setEditHargaBeli(String(part.hargaBeli ?? 0));
    setEditHargaJual(String(part.hargaJual ?? 0));
    setEditNote('');
    setEditError(null);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPartTarget) return;
    setEditError(null);

    const parsedStok = Number(editStok);
    const parsedBeli = Number(editHargaBeli);
    const parsedJual = Number(editHargaJual);
    const parsedMin = editPartTarget.jenis === 'ho' ? null : Number(editStokMin);

    if (Number.isNaN(parsedStok) || parsedStok < 0) {
      setEditError('Stok tidak boleh kurang dari 0.');
      return;
    }
    if (Number.isNaN(parsedBeli) || parsedBeli < 0 || Number.isNaN(parsedJual) || parsedJual < 0) {
      setEditError('Harga beli dan harga jual harus bernilai 0 atau lebih.');
      return;
    }
    if (editPartTarget.jenis === 'reguler' && (parsedMin === null || Number.isNaN(parsedMin) || parsedMin < 0)) {
      setEditError('Stok minimum wajib diisi (minimal 0).');
      return;
    }

    const res = editMasterPart({
      partId: editPartTarget.kode,
      nama: editNama,
      satuan: editSatuan,
      stokBaru: parsedStok,
      hargaBeli: parsedBeli,
      hargaJual: parsedJual,
      stokMin: parsedMin,
      note: editNote,
      byNama: actorName,
      byId: actorId,
      actorRole: role || undefined,
    });

    if (!res.ok) {
      setEditError(res.error || 'Gagal memperbarui data part.');
      return;
    }

    recordAuditEvent({
      actorId,
      actorName,
      actorRole: auditRole,
      event: 'part_updated',
      category: 'bisnis',
      module: 'gudang',
      action: `Mengubah data part ${editPartTarget.kode} (${editNama.trim()})`,
      entityType: 'Part',
      entityId: editPartTarget.kode,
      reason: editNote.trim(),
      outcome: 'berhasil',
    });

    notify(`Part ${editPartTarget.kode} berhasil diperbarui.`);
    setEditPartTarget(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    const res = deleteMasterPart({
      partId: deleteTarget.kode,
      byNama: actorName,
      byId: actorId,
      actorRole: role || undefined,
    });

    if (!res.ok) {
      notify(res.error || 'Gagal menghapus part.');
      setDeleteTarget(null);
      return;
    }

    recordAuditEvent({
      actorId,
      actorName,
      actorRole: auditRole,
      event: 'part_deleted',
      category: 'bisnis',
      module: 'gudang',
      action: `Menghapus part ${deleteTarget.kode} (${deleteTarget.nama})`,
      entityType: 'Part',
      entityId: deleteTarget.kode,
      outcome: 'berhasil',
    });

    notify(`Part ${deleteTarget.kode} berhasil dihapus.`);
    setDeleteTarget(null);
  };

  const columns: Column<Part>[] = [
    {
      key: 'kode',
      header: 'Kode Part',
      identity: true,
      render: (p) => <span className="font-mono text-[13px] font-semibold text-[#1E2230]">{p.kode}</span>,
    },
    {
      key: 'nama',
      header: 'Nama Part',
      render: (p) => (
        <div>
          <div className="font-medium text-[#1E2230]">{p.nama}</div>
          <div className="text-[12px] text-[#646B7C]">Dibuat: {p.createdAt || '-'}</div>
        </div>
      ),
    },
    {
      key: 'jenis',
      header: 'Jenis',
      isStatus: true,
      render: (p) => <StatusChip status={p.jenis} />,
    },
    {
      key: 'stok',
      header: 'Stok',
      align: 'right',
      render: (p) => {
        const stok = computeStock(p, stockMovements);
        return (
          <span className="font-semibold tabular-nums text-[#1E2230]">
            {stok} {p.satuan}
          </span>
        );
      },
    },
    {
      key: 'stokMin',
      header: 'Min. Stok',
      align: 'right',
      mobileHidden: true,
      render: (p) => (
        <span className="tabular-nums text-[#646B7C]">
          {p.jenis === 'ho' ? 'HO' : `${p.stokMin ?? 0} ${p.satuan}`}
        </span>
      ),
    },
    {
      key: 'hargaJual',
      header: 'Harga Beli / Jual',
      align: 'right',
      mobileHidden: true,
      render: (p) => (
        <div className="text-right tabular-nums">
          <div className="text-[12px] text-[#646B7C]">Beli: {formatRupiah(p.hargaBeli)}</div>
          <div className="font-medium text-[#1E2230]">Jual: {formatRupiah(p.hargaJual)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      isStatus: true,
      render: (p) => {
        const stok = computeStock(p, stockMovements);
        const critical = p.jenis === 'reguler' && stok <= (p.stokMin ?? 0);
        return <StatusChip status={critical ? 'Kritis' : 'Aman'} needsAction={critical} />;
      },
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (p) => (
        <div
          className="inline-flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <ActionButton
            intent="neutral"
            onClick={() => setHistoryPartTarget(p)}
          >
            Riwayat
          </ActionButton>
          <ActionButton
            intent="wait"
            icon={<PencilIcon size={15} />}
            onClick={() => openEditPanel(p)}
          >
            Edit Part
          </ActionButton>
          <ActionButton
            intent="cancel"
            icon={<TrashIcon size={15} />}
            onClick={() => setDeleteTarget(p)}
          >
            Hapus Part
          </ActionButton>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Input Part"
        decision="Tambahkan sparepart baru, perbarui harga dan stok gudang, atau jalankan sesi stok opname secara langsung."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterTabs
          ariaLabel="Mode pengelolaan Input Part"
          value={workspaceTab}
          onChange={(v) => setWorkspaceTab((v === 'opname' ? 'opname' : 'input') as WorkspaceTab)}
          tabs={[
            { value: 'input', label: 'Input & Kelola Part', count: totalCount },
            { value: 'opname', label: 'Stok Opname' },
          ]}
        />
        <span className="inline-flex items-center px-3 py-1.5 rounded-[10px] bg-[#F6F7FA] border border-[#E6E9F0] text-[12px] text-[#454D5F]">
          Operator aktif: <strong className="ml-1 text-[#1E2230]">{actorName}</strong>
        </span>
      </div>

      {workspaceTab === 'opname' ? (
        <StockOpnameWorkspace verifiedUser={stockOpnameActor} />
      ) : (
        <>
          <DataCard title="Input Part Baru">
            <form onSubmit={handleCreatePart} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField id="new-kode" label="Kode Part (Otomatis)">
                  <input
                    id="new-kode"
                    type="text"
                    readOnly
                    value={nextKodePreview}
                    className="admin-input h-10 bg-[#F6F7FA] font-mono text-[#646B7C]"
                  />
                </FormField>

                <FormField id="new-nama" label="Nama Part">
                  <input
                    id="new-nama"
                    type="text"
                    value={nama}
                    onChange={(e) => setNama(e.target.value)}
                    placeholder="Contoh: Kampas Rem Depan Beat"
                    className="admin-input h-10"
                    required
                  />
                </FormField>

                <FormField id="new-jenis" label="Jenis Part">
                  <select
                    id="new-jenis"
                    value={jenis}
                    onChange={(e) => setJenis(e.target.value === 'ho' ? 'ho' : 'reguler')}
                    className="admin-input h-10"
                  >
                    <option value="reguler">Reguler</option>
                    <option value="ho">HO (Heavy / Khusus)</option>
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <FormField id="new-satuan" label="Satuan">
                  <select
                    id="new-satuan"
                    value={satuan}
                    onChange={(e) => setSatuan(e.target.value)}
                    className="admin-input h-10"
                  >
                    {SATUAN_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField id="new-stok-awal" label="Stok Awal">
                  <input
                    id="new-stok-awal"
                    type="number"
                    min={0}
                    value={stokAwal}
                    onChange={(e) => setStokAwal(e.target.value)}
                    className="admin-input h-10"
                    required
                  />
                </FormField>

                <FormField
                  id="new-stok-min"
                  label="Stok Minimum"
                  helperText={jenis === 'ho' ? 'Tidak digunakan untuk HO' : undefined}
                >
                  <input
                    id="new-stok-min"
                    type="number"
                    min={0}
                    disabled={jenis === 'ho'}
                    value={jenis === 'ho' ? '' : stokMin}
                    onChange={(e) => setStokMin(e.target.value)}
                    placeholder={jenis === 'ho' ? 'Otomatis' : '5'}
                    className="admin-input h-10 disabled:bg-[#F6F7FA]"
                    required={jenis === 'reguler'}
                  />
                </FormField>

                <FormField id="new-harga-beli" label="Harga Beli (Rp)">
                  <input
                    id="new-harga-beli"
                    type="number"
                    min={0}
                    value={hargaBeli}
                    onChange={(e) => setHargaBeli(e.target.value)}
                    className="admin-input h-10"
                    required
                  />
                </FormField>

                <FormField id="new-harga-jual" label="Harga Jual (Rp)">
                  <input
                    id="new-harga-jual"
                    type="number"
                    min={0}
                    value={hargaJual}
                    onChange={(e) => setHargaJual(e.target.value)}
                    className="admin-input h-10"
                    required
                  />
                </FormField>
              </div>

              <FormField id="new-catatan" label="Catatan Part" optional>
                <input
                  id="new-catatan"
                  type="text"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  placeholder="Contoh: Stok awal rak A2"
                  className="admin-input h-10"
                />
              </FormField>

              {formError && (
                <div
                  role="alert"
                  className="rounded-[12px] bg-[rgba(242,70,111,0.12)] border border-[rgba(242,70,111,0.28)] px-3.5 py-2.5 text-[13px] font-medium text-[#D62E5A]"
                >
                  {formError}
                </div>
              )}

              <div className="flex justify-end">
                <ActionButton intent="add" type="submit" icon={<PlusIcon size={16} />}>
                  Simpan Part Baru
                </ActionButton>
              </div>
            </form>
          </DataCard>

          <DataCard
            title="Katalog Part Gudang"
            actions={
              <SearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Cari kode atau nama part..."
              />
            }
          >
            <div className="mb-4">
              <FilterTabs
                ariaLabel="Filter daftar katalog part"
                value={listFilter}
                onChange={(v) => setListFilter((v === 'low' ? 'low' : 'all') as PartListFilter)}
                tabs={[
                  { value: 'all', label: 'Semua Part', count: totalCount },
                  { value: 'low', label: 'Stok Menipis', count: lowCount },
                ]}
              />
            </div>

            <DataTable
              columns={columns}
              data={filteredParts}
              keyExtractor={(p) => p.kode}
              swapKey={`input-part-table-${listFilter}-${searchQuery}-${filteredParts.length}`}
              emptyMessage={
                parts.length === 0
                  ? 'Belum ada part di database. Gunakan form di atas untuk menambahkan part baru.'
                  : 'Tidak ada part yang cocok dengan filter atau pencarian.'
              }
            />
          </DataCard>
        </>
      )}

      <SidePanel
        isOpen={Boolean(editPartTarget)}
        onClose={() => setEditPartTarget(null)}
        title={editPartTarget ? `Edit Part ${editPartTarget.kode}` : 'Edit Part'}
        description="Perbarui nama, satuan, stok, atau harga part. Perubahan dicatat ke database."
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <ActionButton intent="neutral" onClick={() => setEditPartTarget(null)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" type="submit" onClick={handleSaveEdit as any}>
              Simpan Perubahan
            </ActionButton>
          </div>
        }
      >
        {editPartTarget && (
          <form onSubmit={handleSaveEdit} className="space-y-4">
            <FormField id="master-edit-nama" label="Nama Part">
              <input
                id="master-edit-nama"
                type="text"
                value={editNama}
                onChange={(e) => setEditNama(e.target.value)}
                className="admin-input h-10"
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="master-edit-satuan" label="Satuan">
                <select
                  id="master-edit-satuan"
                  value={editSatuan}
                  onChange={(e) => setEditSatuan(e.target.value)}
                  className="admin-input h-10"
                >
                  {SATUAN_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FormField>

              <FormField id="master-edit-stok" label="Stok Saat Ini">
                <input
                  id="master-edit-stok"
                  type="number"
                  min={0}
                  value={editStok}
                  onChange={(e) => setEditStok(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>
            </div>

            {editPartTarget.jenis === 'reguler' && (
              <FormField id="master-edit-min" label="Stok Minimum">
                <input
                  id="master-edit-min"
                  type="number"
                  min={0}
                  value={editStokMin}
                  onChange={(e) => setEditStokMin(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>
            )}

            <div className="grid grid-cols-2 gap-3">
              <FormField id="master-edit-beli" label="Harga Beli (Rp)">
                <input
                  id="master-edit-beli"
                  type="number"
                  min={0}
                  value={editHargaBeli}
                  onChange={(e) => setEditHargaBeli(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>

              <FormField id="master-edit-jual" label="Harga Jual (Rp)">
                <input
                  id="master-edit-jual"
                  type="number"
                  min={0}
                  value={editHargaJual}
                  onChange={(e) => setEditHargaJual(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>
            </div>

            <FormField
              id="master-edit-note"
              label="Catatan Penyesuaian"
              helperText="Minimal 5 karakter untuk pencatatan riwayat perubahan."
            >
              <textarea
                id="master-edit-note"
                rows={3}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Contoh: Penyesuaian harga supplier bulan ini"
                className="admin-input py-2.5 min-h-[84px]"
                required
              />
            </FormField>

            {editError && (
              <div
                role="alert"
                className="rounded-[12px] bg-[rgba(242,70,111,0.12)] border border-[rgba(242,70,111,0.28)] px-3.5 py-2.5 text-[13px] font-medium text-[#D62E5A]"
              >
                {editError}
              </div>
            )}
          </form>
        )}
      </SidePanel>

      <SidePanel
        isOpen={Boolean(historyPartTarget)}
        onClose={() => setHistoryPartTarget(null)}
        title={historyPartTarget ? `Riwayat Part ${historyPartTarget.kode}` : 'Riwayat Part'}
        description={historyPartTarget ? historyPartTarget.nama : undefined}
      >
        {selectedHistoryRows.length === 0 ? (
          <p className="text-[13px] text-[#646B7C] bg-[#F6F7FA] rounded-[12px] p-4">
            Belum ada riwayat perubahan tercatat untuk part ini.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {selectedHistoryRows.map((h) => (
              <li key={h.id} className="p-3.5 rounded-[12px] border border-[#EEF0F4] bg-white text-[13px]">
                <div className="flex items-center justify-between gap-2 text-[12px] text-[#646B7C]">
                  <span>{h.at}</span>
                  <span>
                    {h.byNama} ({h.byId})
                  </span>
                </div>
                <div className="font-semibold text-[#1E2230] mt-1">
                  {h.field}: {h.oldValue} {'->'} {h.newValue}
                </div>
                {h.note && <div className="text-[12px] text-[#646B7C] mt-0.5">{h.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </SidePanel>

      <CenterDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Data Part"
        subtitle={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus part ${deleteTarget.kode} (${deleteTarget.nama})?`
            : undefined
        }
        maxWidthClass="max-w-[460px]"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <ActionButton intent="neutral" onClick={() => setDeleteTarget(null)}>
              Batal
            </ActionButton>
            <ActionButton intent="cancel" onClick={handleConfirmDelete}>
              Ya, Hapus Part
            </ActionButton>
          </div>
        }
      >
        {deleteTarget && (
          <div className="rounded-[12px] bg-[#F6F7FA] border border-[#E6E9F0] p-3.5 text-[13px] text-[#454D5F]">
            Part <strong>{deleteTarget.kode}</strong> ({deleteTarget.nama}) akan dihapus dari katalog gudang.
          </div>
        )}
      </CenterDialog>
    </div>
  );
};

export default V2MasterWarehouse;
