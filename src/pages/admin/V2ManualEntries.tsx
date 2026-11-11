import React, { useState } from 'react';
import { useAdmin } from '../../context/AdminContext';
import type { ManualEntry } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { StatusChip } from '../../components/admin/StatusChip';
import { ActionButton } from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { FormField } from '../../components/admin/FormField';
import { setLastTriggerElement } from '../../components/admin/island/IslandSystem';
import { formatRupiah, todayISO } from '../../lib/format';

const V2ManualEntries: React.FC = () => {
  const { manualEntries, addManualEntry } = useAdmin();
  const [catFilter, setCatFilter] = useState<string>('Semua');
  const [panelOpen, setPanelOpen] = useState(false);

  const [category, setCategory] = useState<'Pengeluaran operasional' | 'Pemasukan lain'>('Pengeluaran operasional');
  const [amount, setAmount] = useState<number>(50000);
  const [notes, setNotes] = useState<string>('');

  const filtered =
    catFilter === 'Semua'
      ? manualEntries
      : manualEntries.filter((m) => m.category === catFilter);

  const handleSave = () => {
    if (!notes.trim() || amount <= 0) return;
    addManualEntry({
      date: todayISO(),
      category,
      amount,
      notes: notes.trim(),
      recordedBy: 'Admin',
    });
    setNotes('');
    setAmount(50000);
    setPanelOpen(false);
  };

  const columns: Column<ManualEntry>[] = [
    { key: 'date', header: 'Tanggal' },
    {
      key: 'category',
      header: 'Kategori',
      render: (m) => (
        <StatusChip
          status={m.category}
          needsAction={m.category === 'Pengeluaran operasional'}
        />
      ),
    },
    { key: 'notes', header: 'Catatan' },
    { key: 'recordedBy', header: 'Dicatat oleh' },
    {
      key: 'amount',
      header: 'Nominal',
      align: 'right',
      render: (m) => <data value={m.amount} className="tabular-nums font-medium">{formatRupiah(m.amount)}</data>,
    },
  ];

  return (
    <>
      <DataCard
        title="Input Manual"
        actions={
          <>
            <FilterTabs
              ariaLabel="Filter kategori input manual"
              value={catFilter}
              onChange={setCatFilter}
              tabs={[
                { value: 'Semua', label: 'Semua', count: manualEntries.length },
                {
                  value: 'Pengeluaran operasional',
                  label: 'Pengeluaran',
                  count: manualEntries.filter((m) => m.category === 'Pengeluaran operasional').length,
                },
                {
                  value: 'Pemasukan lain',
                  label: 'Pemasukan',
                  count: manualEntries.filter((m) => m.category === 'Pemasukan lain').length,
                },
              ]}
            />
            <ActionButton
              intent="cream"
              onClick={(e) => {
                setLastTriggerElement(e.currentTarget);
                setPanelOpen(true);
              }}
            >
              Catat transaksi
            </ActionButton>
          </>
        }
      >
        <DataTable
          columns={columns}
          data={filtered}
          keyExtractor={(m) => m.id}
          swapKey={catFilter}
          emptyMessage="Belum ada catatan transaksi manual."
        />
      </DataCard>

      <SidePanel
        isOpen={panelOpen}
        onClose={() => setPanelOpen(false)}
        title="Catat transaksi manual"
        footer={
          <>
            <ActionButton intent="cancel" onClick={() => setPanelOpen(false)}>
              Batal
            </ActionButton>
            <ActionButton intent="start" onClick={handleSave}>
              Simpan transaksi
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4">
          <FormField id="mn-cat" label="Kategori">
            <select
              id="mn-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as 'Pengeluaran operasional' | 'Pemasukan lain')}
              className="admin-input"
            >
              <option value="Pengeluaran operasional">Pengeluaran operasional</option>
              <option value="Pemasukan lain">Pemasukan lain</option>
            </select>
          </FormField>

          <FormField id="mn-amt" label="Nominal (Rp)">
            <input
              id="mn-amt"
              type="number"
              min={1000}
              step={5000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="admin-input tabular-nums"
            />
          </FormField>

          <FormField id="mn-notes" label="Keterangan">
            <textarea
              id="mn-notes"
              rows={3}
              placeholder="Contoh: Beli sabun cuci tangan dan lap bengkel"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="admin-input"
            />
          </FormField>
        </div>
      </SidePanel>
    </>
  );
};

export default V2ManualEntries;
