import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAdmin,
  markBookingArrived,
  cancelBooking,
  restoreBooking,
} from '../../context/AdminContext';
import { ARRIVAL_TARGET, type Booking, type BookingStatus } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { StatusChip } from '../../components/admin/StatusChip';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { SearchField } from '../../components/admin/SearchField';
import {
  ActionButton,
  IconActionButton,
  PrintIconButton,
} from '../../components/admin/ActionButton';
import { EmptyState } from '../../components/admin/EmptyState';
import { SidePanel } from '../../components/admin/SidePanel';
import { HistoryRow } from '../../components/admin/HistoryRow';
import { BookingForm } from '../../components/admin/BookingForm';
import {
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatShortDate, todayISO } from '../../lib/format';
import { printDocument } from '../../lib/printDocument';

const STATUS_TABS: { value: 'Semua' | BookingStatus; label: string }[] = [
  { value: 'Semua', label: 'Semua' },
  { value: 'menunggu', label: 'Menunggu' },
  { value: 'datang', label: 'Datang' },
  { value: 'batal', label: 'Batal' },
];

type Panel = { mode: 'new' } | { mode: 'detail'; id: string } | null;

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const V1Booking: React.FC = () => {
  const navigate = useNavigate();
  const { bookings } = useAdmin();
  const { notifyAction } = useActionIsland();
  const [params] = useSearchParams();
  const today = todayISO();
  const tomorrow = addDays(today, 1);

  const initialParam = (params.get('status') || '').toLowerCase();
  const [statusTab, setStatusTab] = useState<string>(
    initialParam === 'menunggu' || initialParam === 'datang' || initialParam === 'batal'
      ? initialParam
      : 'Semua'
  );
  const [query, setQuery] = useState(params.get('q') || '');
  const [panel, setPanel] = useState<Panel>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  const closePanel = useCallback(() => setPanel(null), []);

  useEffect(() => {
    return () => {
      window.clearTimeout(flashTimer.current);
    };
  }, []);

  const flash = (id: string) => {
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 700);
  };

  const dayLabel = (iso: string) =>
    iso === today ? 'Hari ini' : iso === tomorrow ? 'Besok' : formatShortDate(iso).slice(0, 5);

  const sorted = useMemo(
    () => [...bookings].sort((a, b) => (a.date + a.hour).localeCompare(b.date + b.hour)),
    [bookings]
  );

  const counts = useMemo(() => {
    return {
      Semua: bookings.length,
      menunggu: bookings.filter((b) => b.status === 'menunggu').length,
      datang: bookings.filter((b) => b.status === 'datang').length,
      batal: bookings.filter((b) => b.status === 'batal').length,
    } as Record<string, number>;
  }, [bookings]);

  const q = query.trim().toLowerCase();
  const rows = sorted.filter(
    (b) =>
      (statusTab === 'Semua' || b.status === statusTab) &&
      (!q ||
        b.plate.toLowerCase().includes(q) ||
        b.customerName.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q))
  );

  const openNew = (e?: React.MouseEvent<HTMLElement>) => {
    if (e?.currentTarget) setLastTriggerElement(e.currentTarget);
    setPanel({ mode: 'new' });
  };

  useEffect(() => {
    if (params.get('new') === '1') openNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const targetTabLabel =
    (ARRIVAL_TARGET as string) === 'disetujui' ? 'Disetujui' : 'Menunggu persetujuan';

  const handleCheckArrived = (b: Booking) => {
    const result = markBookingArrived(b.id);
    closePanel();
    if (!result) return;
    flash(b.id);

    const targetUrl = `/admin/v1/service-forms?tab=${encodeURIComponent(
      result.serviceForm.status
    )}&id=${encodeURIComponent(result.serviceForm.id)}`;

    notifyAction({
      message: `${b.plate} masuk ke ${targetTabLabel}.`,
      actionLabel: 'Buka',
      onAction: () => navigate(targetUrl),
    });
  };

  const handleCancelRow = (b: Booking) => {
    cancelBooking(b.id, 'Dibatalkan oleh admin');
    closePanel();
    notifyAction({
      message: `Booking ${b.plate} dibatalkan.`,
      actionLabel: 'Batalkan',
      durationMs: 4000,
      onAction: () => {
        restoreBooking(b.id);
        flash(b.id);
      },
    });
  };

  const handlePrintCancelledBooking = (b: Booking) => {
    printDocument('batal', {
      id: b.id,
      source: 'Booking',
      customerName: b.customerName,
      plate: b.plate,
      reason: b.cancelReason || 'Tidak dicatat',
      cancelledAt: b.cancelledAt || `${b.date} ${b.hour}`,
    });
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const columns: Column<Booking>[] = [
    {
      key: 'hour',
      header: 'Jam',
      className: 'whitespace-nowrap',
      render: (b) => `${dayLabel(b.date)} ${b.hour}`,
    },
    {
      key: 'plate',
      header: 'Plat nomor',
      render: (b) => (
        <data value={b.plate} className="font-mono font-medium whitespace-nowrap tabular-nums">
          {b.plate}
        </data>
      ),
    },
    { key: 'customerName', header: 'Nama konsumen' },
    { key: 'service', header: 'Layanan' },
    {
      key: 'status',
      header: 'Status',
      render: (b) => <StatusChip status={b.status} />,
    },
    {
      key: 'actions',
      header: 'Aksi',
      render: (b) => {
        if (b.status === 'menunggu') {
          const checkLabel = `Tandai datang`;
          const cancelLabel = `Batal`;
          return (
            <div className="inline-flex items-center gap-2" onClick={stop} onKeyDown={stop}>
              <div className="relative group inline-flex">
                <IconActionButton
                  intent="start"
                  ariaLabel={`${checkLabel} ${b.plate}`}
                  title={checkLabel}
                  onClick={() => handleCheckArrived(b)}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path
                      d="M3.75 9.5L7.25 13L14.25 5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </IconActionButton>
                <span
                  role="tooltip"
                  className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded-[8px] bg-[#1E2230] text-white admin-micro whitespace-nowrap z-30"
                >
                  {checkLabel}
                </span>
              </div>

              <div className="relative group inline-flex">
                <IconActionButton
                  intent="cancel"
                  ariaLabel={`${cancelLabel} ${b.plate}`}
                  title={cancelLabel}
                  onClick={() => handleCancelRow(b)}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                    <path
                      d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </IconActionButton>
                <span
                  role="tooltip"
                  className="pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity absolute bottom-full right-0 mb-1.5 px-2.5 py-1 rounded-[8px] bg-[#1E2230] text-white admin-micro whitespace-nowrap z-30"
                >
                  {cancelLabel}
                </span>
              </div>
            </div>
          );
        }

        if (b.status === 'batal') {
          return (
            <div className="inline-flex items-center" onClick={stop} onKeyDown={stop}>
              <PrintIconButton
                ariaLabel={`Cetak bukti pembatalan ${b.plate}`}
                title={`Cetak bukti pembatalan ${b.plate}`}
                onClick={() => handlePrintCancelledBooking(b)}
              />
            </div>
          );
        }

        // Datang rows: status chip only
        return null;
      },
    },
  ];

  const selected =
    panel && panel.mode === 'detail' ? bookings.find((b) => b.id === panel.id) || null : null;

  let panelTitle = 'Booking baru';
  let panelBody: React.ReactNode = null;
  let panelFooter: React.ReactNode = null;

  if (panel?.mode === 'new') {
    panelBody = (
      <BookingForm
        mode="admin"
        onCancel={closePanel}
        onCreated={(created) => {
          setStatusTab('Semua');
          setQuery('');
          closePanel();
          flash(created.id);
        }}
      />
    );
  } else if (panel?.mode === 'detail' && selected) {
    panelTitle = `Booking ${selected.plate}`;
    panelBody = (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-4 pb-3 border-b border-[#EEF0F4]">
          <StatusChip status={selected.status} />
          <span className="font-mono text-[#646B7C]">
            {dayLabel(selected.date)} {selected.hour}
          </span>
        </div>
        <dl className="space-y-3">
          {[
            ['ID Booking', <data key="id" value={selected.id} className="font-mono font-medium">{selected.id}</data>],
            ['Nama konsumen', selected.customerName],
            ['Plat nomor', <data key="p" value={selected.plate} className="font-mono font-medium">{selected.plate}</data>],
            ['Nomor mesin', <data key="e" value={selected.engineNo} className="font-mono">{selected.engineNo}</data>],
            ['Nomor rangka', <data key="f" value={selected.frameNo} className="font-mono">{selected.frameNo}</data>],
            ['Layanan', selected.service],
            ['Sumber', selected.source === 'online' ? 'Online' : 'Langsung'],
            ['Keluhan', selected.complaint || 'Tidak ada catatan'],
            ...(selected.status === 'batal'
              ? [['Alasan pembatalan', selected.cancelReason || 'Tidak dicatat']]
              : []),
          ].map(([k, v]) => (
            <div key={k as string} className="border-b border-[#EEF0F4] pb-2">
              <dt className="admin-micro text-[#646B7C]">{k}</dt>
              <dd className="mt-1 text-[#1E2230]">{v}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="admin-micro text-[#646B7C] mb-2">Riwayat</h3>
          {selected.history && selected.history.length > 0 ? (
            <ul>
              {selected.history.map((h, i) => (
                <HistoryRow key={i} time={h.time} who={h.who} what={h.what} reason={h.reason} />
              ))}
            </ul>
          ) : (
            <p className="text-[#646B7C]">Belum ada perubahan status.</p>
          )}
        </div>
      </div>
    );
    panelFooter =
      selected.status === 'menunggu' ? (
        <div className="flex flex-wrap items-center justify-end gap-3 w-full">
          <ActionButton intent="cancel" onClick={() => handleCancelRow(selected)}>
            Batal
          </ActionButton>
          <ActionButton intent="start" onClick={() => handleCheckArrived(selected)}>
            Tandai datang
          </ActionButton>
        </div>
      ) : selected.status === 'batal' ? (
        <div className="flex flex-wrap items-center justify-end gap-3 w-full">
          <PrintIconButton
            ariaLabel={`Cetak bukti pembatalan ${selected.plate}`}
            title={`Cetak bukti pembatalan ${selected.plate}`}
            onClick={() => handlePrintCancelledBooking(selected)}
          />
        </div>
      ) : undefined;
  }

  return (
    <div className="flex flex-col gap-5">
      <DataCard
        title="Booking"
        actions={
          <>
            <FilterTabs
              ariaLabel="Filter status booking"
              value={statusTab}
              onChange={setStatusTab}
              tabs={STATUS_TABS.map((t) => ({
                value: t.value,
                label: t.label,
                count: counts[t.value],
              }))}
            />
            <SearchField value={query} onChange={setQuery} placeholder="Cari plat atau nama" />
            <ActionButton intent="start" onClick={(e) => openNew(e)}>
              Booking baru
            </ActionButton>
          </>
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            message={
              statusTab !== 'Semua'
                ? `Tidak ada booking pada tab ini.`
                : 'Belum ada booking.'
            }
            actionText="Booking baru"
            onAction={() => openNew()}
          />
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            keyExtractor={(b) => b.id}
            flashKey={flashId}
            onRowClick={(b) => setPanel({ mode: 'detail', id: b.id })}
            swapKey={`${statusTab}-${q}`}
          />
        )}
      </DataCard>

      <SidePanel
        isOpen={panel !== null}
        onClose={closePanel}
        title={panelTitle}
        footer={panelFooter}
      >
        {panelBody}
      </SidePanel>
    </div>
  );
};

export default V1Booking;
