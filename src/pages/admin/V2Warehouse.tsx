import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { computeStock, Part } from '../../data/adminDummy';
import { useAuth } from '../../lib/mockAuth';
import { formatRupiah } from '../../lib/format';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { SearchField } from '../../components/admin/SearchField';
import { StatusChip } from '../../components/admin/StatusChip';
import { SidePanel } from '../../components/admin/SidePanel';
import { CenterDialog } from '../../components/admin/CenterDialog';
import { FormField } from '../../components/admin/FormField';
import { ActionButton, PencilIcon, PlusIcon, TrashIcon } from '../../components/admin/ActionButton';
import { useActionIsland } from '../../components/admin/island/IslandSystem';

type StockFilterKey = 'all' | 'low';

const SATUAN_OPTIONS = ['pcs', 'botol', 'set', 'liter', 'buah', 'meter'];

const isCriticalStock = (part: Part, stok: number): boolean =>
  stok <= (part.stokMin ?? 0);

const V2Warehouse: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilter = (searchParams.get('filter') === 'low' ? 'low' : 'all') as StockFilterKey;

  const { parts, stockMovements, partHistory, editMasterPart, deleteMasterPart, recordAuditEvent } =
    useAdmin();
  const { role, user } = useAuth();
  const { notify } = useActionIsland();

  const canManageWarehouse = role === 'master_admin' || role === 'master_helpdesk';
  const actorName =
    user?.name ||
    user?.email ||
    (role === 'master_helpdesk'
      ? 'Master Helpdesk'
      : role === 'master_admin'
        ? 'Master Admin'
        : 'Admin Bengkel');
  const actorId =
    user?.roleCode ||
    (role === 'master_helpdesk' ? 'HD-001' : role === 'master_admin' ? 'MG-001' : 'AD-001');
  const auditRole = role === 'master_helpdesk' ? 'master_helpdesk' : role === 'master_admin' ? 'master_admin' : 'admin';

  const [filterTab, setFilterTab] = useState<StockFilterKey>(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailPartKode, setDetailPartKode] = useState<string | null>(null);

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

  useEffect(() => {
    const paramFilter = searchParams.get('filter');
    if (paramFilter === 'low') {
      setFilterTab('low');
    }
  }, [searchParams]);

  const handleFilterChange = (val: string) => {
    const next = (val === 'low' ? 'low' : 'all') as StockFilterKey;
    setFilterTab(next);
    if (next === 'low') {
      setSearchParams({ filter: 'low' }, { replace: true });
    } else if (searchParams.has('filter')) {
      setSearchParams({}, { replace: true });
    }
  };

  const stockRows = useMemo(() => {
    return parts.map((p) => {
      const stok = computeStock(p, stockMovements);
      return {
        part: p,
        stok,
        critical: isCriticalStock(p, stok),
      };
    });
  }, [parts, stockMovements]);

  const totalCount = stockRows.length;
  const lowCount = useMemo(() => stockRows.filter((r) => r.critical).length, [stockRows]);

  const filteredParts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return stockRows
      .filter((row) => {
        if (filterTab === 'low' && !row.critical) return false;
        if (!q) return true;
        return (
          row.part.kode.toLowerCase().includes(q) ||
          row.part.nama.toLowerCase().includes(q) ||
          row.part.satuan.toLowerCase().includes(q)
        );
      })
      .map((row) => row.part);
  }, [stockRows, filterTab, searchQuery]);

  const detailPart = useMemo(
    () => (detailPartKode ? parts.find((p) => p.kode === detailPartKode) ?? null : null),
    [parts, detailPartKode]
  );

  const detailHistory = useMemo(
    () => (detailPart ? partHistory.filter((h) => h.partId === detailPart.kode).slice(0, 8) : []),
    [detailPart, partHistory]
  );

  const openEditPanel = (part: Part) => {
    if (!canManageWarehouse) return;
    const currentStok = computeStock(part, stockMovements);
    setDetailPartKode(null);
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
    if (!editPartTarget || !canManageWarehouse) return;
    setEditError(null);

    const parsedStok = Number(editStok);
    const parsedBeli = Number(editHargaBeli);
    const parsedJual = Number(editHargaJual);
    const parsedMin = Number(editStokMin);

    if (Number.isNaN(parsedStok) || parsedStok < 0) {
      setEditError('Stok tidak boleh kurang dari 0.');
      return;
    }
    if (Number.isNaN(parsedBeli) || parsedBeli < 0 || Number.isNaN(parsedJual) || parsedJual < 0) {
      setEditError('Harga beli dan harga jual harus bernilai 0 atau lebih.');
      return;
    }
    if (Number.isNaN(parsedMin) || parsedMin < 0) {
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
      setEditError(res.error || 'Gagal menyimpan perubahan part.');
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

    notify(`Data part ${editPartTarget.kode} berhasil diperbarui.`);
    setEditPartTarget(null);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget || !canManageWarehouse) return;
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

    notify(`Part ${deleteTarget.kode} berhasil dihapus dari database.`);
    if (detailPartKode === deleteTarget.kode) {
      setDetailPartKode(null);
    }
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
        <div className="min-w-[160px]">
          <div className="font-medium text-[#1E2230]">{p.nama}</div>
          <div className="text-[12px] text-[#646B7C]">{p.satuan}</div>
        </div>
      ),
    },
    {
      key: 'stok',
      header: 'Stok Saat Ini',
      align: 'right',
      render: (p) => {
        const stok = computeStock(p, stockMovements);
        return (
          <span className="font-semibold tabular-nums text-[#1E2230]">
            {stok} <span className="font-normal text-[#646B7C] text-[12px]">{p.satuan}</span>
          </span>
        );
      },
    },
    {
      key: 'stokMin',
      header: 'Stok Minimum',
      align: 'right',
      mobileHidden: true,
      render: (p) => (
        <span className="tabular-nums text-[#646B7C]">
          {`${p.stokMin ?? 0} ${p.satuan}`}
        </span>
      ),
    },
    {
      key: 'hargaBeli',
      header: 'Harga Beli',
      align: 'right',
      mobileHidden: true,
      render: (p) => <span className="tabular-nums text-[#646B7C]">{formatRupiah(p.hargaBeli)}</span>,
    },
    {
      key: 'hargaJual',
      header: 'Harga Jual',
      align: 'right',
      render: (p) => <span className="font-medium tabular-nums text-[#1E2230]">{formatRupiah(p.hargaJual)}</span>,
    },
    {
      key: 'status',
      header: 'Status Stok',
      isStatus: true,
      render: (p) => {
        const stok = computeStock(p, stockMovements);
        const critical = isCriticalStock(p, stok);
        return <StatusChip status={critical ? 'Kritis' : 'Aman'} needsAction={critical} />;
      },
    },
    ...(canManageWarehouse
      ? [
          {
            key: 'aksi',
            header: 'Aksi',
            align: 'right' as const,
            render: (p: Part) => (
              <div
                className="inline-flex items-center justify-end gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <ActionButton
                  intent="wait"
                  icon={<PencilIcon size={15} />}
                  onClick={() => openEditPanel(p)}
                  ariaLabel={`Edit part ${p.kode}`}
                >
                  Edit Part
                </ActionButton>
                <ActionButton
                  intent="cancel"
                  icon={<TrashIcon size={15} />}
                  onClick={() => setDeleteTarget(p)}
                  ariaLabel={`Hapus part ${p.kode}`}
                >
                  Hapus Part
                </ActionButton>
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <DataCard
        title="Daftar Stok Part Gudang"
        actions={
          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
            <SearchField
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Cari kode atau nama part..."
            />
            {canManageWarehouse && (
              <ActionButton
                intent="add"
                to="/admin/v2/input-part"
                icon={<PlusIcon size={16} />}
              >
                Input Part Baru
              </ActionButton>
            )}
          </div>
        }
      >
        <div className="mb-4">
          <FilterTabs
            ariaLabel="Filter status stok part"
            value={filterTab}
            onChange={handleFilterChange}
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
          onRowClick={(p) => setDetailPartKode(p.kode)}
          swapKey={`stok-part-${filterTab}-${searchQuery}-${filteredParts.length}`}
          emptyMessage={
            parts.length === 0
              ? 'Belum ada data part tersimpan di database gudang.'
              : 'Tidak ada part yang cocok dengan filter atau pencarian.'
          }
        />
      </DataCard>

      <SidePanel
        isOpen={Boolean(detailPart)}
        onClose={() => setDetailPartKode(null)}
        title={detailPart ? `${detailPart.kode} : ${detailPart.nama}` : 'Detail Part'}
        description="Informasi lengkap spesifikasi, stok, dan riwayat penyesuaian part."
        footer={
          detailPart && canManageWarehouse ? (
            <div className="flex items-center justify-between gap-2 w-full">
              <ActionButton intent="cancel" onClick={() => setDeleteTarget(detailPart)}>
                Hapus Part
              </ActionButton>
              <ActionButton intent="start" onClick={() => openEditPanel(detailPart)}>
                Edit Part
              </ActionButton>
            </div>
          ) : undefined
        }
      >
        {detailPart && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 p-4 rounded-[14px] bg-[#F6F7FA] border border-[#EEF0F4]">
              <div>
                <div className="text-[12px] text-[#646B7C]">Kode Part</div>
                <div className="font-mono font-semibold text-[14px] text-[#1E2230] mt-0.5">{detailPart.kode}</div>
              </div>
              <div>
                <div className="text-[12px] text-[#646B7C]">Satuan</div>
                <div className="font-medium text-[14px] text-[#1E2230] mt-0.5">{detailPart.satuan}</div>
              </div>
              <div>
                <div className="text-[12px] text-[#646B7C]">Stok Saat Ini</div>
                <div className="font-bold text-[16px] text-[#1E2230] mt-0.5">
                  {computeStock(detailPart, stockMovements)} {detailPart.satuan}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#646B7C]">Stok Minimum</div>
                <div className="font-medium text-[14px] text-[#1E2230] mt-0.5">
                  {`${detailPart.stokMin ?? 0} ${detailPart.satuan}`}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#646B7C]">Harga Beli</div>
                <div className="font-medium text-[14px] text-[#1E2230] mt-0.5">
                  {formatRupiah(detailPart.hargaBeli)}
                </div>
              </div>
              <div>
                <div className="text-[12px] text-[#646B7C]">Harga Jual</div>
                <div className="font-semibold text-[14px] text-[#1E2230] mt-0.5">
                  {formatRupiah(detailPart.hargaJual)}
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-[13px] font-semibold text-[#1E2230] mb-2">Riwayat Perubahan Terbaru</h3>
              {detailHistory.length === 0 ? (
                <p className="text-[13px] text-[#646B7C] bg-[#F6F7FA] rounded-[12px] p-3">
                  Belum ada catatan perubahan untuk part ini.
                </p>
              ) : (
                <ul className="space-y-2">
                  {detailHistory.map((h) => (
                    <li
                      key={h.id}
                      className="p-3 rounded-[12px] border border-[#EEF0F4] bg-white text-[13px]"
                    >
                      <div className="flex items-center justify-between gap-2 text-[12px] text-[#646B7C]">
                        <span>{h.at}</span>
                        <span>{h.byNama}</span>
                      </div>
                      <div className="font-medium text-[#1E2230] mt-1">
                        {h.field}: {h.oldValue} {'->'} {h.newValue}
                      </div>
                      {h.note && <div className="text-[12px] text-[#646B7C] mt-0.5">{h.note}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SidePanel>

      <SidePanel
        isOpen={Boolean(editPartTarget) && canManageWarehouse}
        onClose={() => setEditPartTarget(null)}
        title={editPartTarget ? `Edit Part ${editPartTarget.kode}` : 'Edit Part'}
        description="Perubahan disimpan langsung ke database gudang beserta jejak audit."
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
            <FormField id="edit-nama" label="Nama Part">
              <input
                id="edit-nama"
                type="text"
                value={editNama}
                onChange={(e) => setEditNama(e.target.value)}
                className="admin-input h-10"
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="edit-satuan" label="Satuan">
                <select
                  id="edit-satuan"
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

              <FormField id="edit-stok" label="Stok Saat Ini">
                <input
                  id="edit-stok"
                  type="number"
                  min={0}
                  value={editStok}
                  onChange={(e) => setEditStok(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>
            </div>

            <FormField id="edit-stok-min" label="Stok Minimum">
              <input
                id="edit-stok-min"
                type="number"
                min={0}
                value={editStokMin}
                onChange={(e) => setEditStokMin(e.target.value)}
                className="admin-input h-10"
                required
              />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField id="edit-beli" label="Harga Beli (Rp)">
                <input
                  id="edit-beli"
                  type="number"
                  min={0}
                  value={editHargaBeli}
                  onChange={(e) => setEditHargaBeli(e.target.value)}
                  className="admin-input h-10"
                  required
                />
              </FormField>

              <FormField id="edit-jual" label="Harga Jual (Rp)">
                <input
                  id="edit-jual"
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
              id="edit-note"
              label="Catatan Penyesuaian"
              helperText="Minimal 5 karakter untuk pencatatan riwayat audit."
            >
              <textarea
                id="edit-note"
                rows={3}
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Contoh: Koreksi stok fisik dan pembaruan harga"
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

      <CenterDialog
        isOpen={Boolean(deleteTarget) && canManageWarehouse}
        onClose={() => setDeleteTarget(null)}
        title="Hapus Data Part"
        subtitle={
          deleteTarget
            ? `Apakah Anda yakin ingin menghapus part ${deleteTarget.kode} (${deleteTarget.nama}) dari database?`
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

export default V2Warehouse;
