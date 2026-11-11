import React, { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';
import { useAdmin } from '../../context/AdminContext';
import { useActionCounts } from '../../lib/actionCounts';
import type { Booking } from '../../data/adminDummy';
import { KpiCard } from '../../components/admin/KpiCard';
import { DataCard } from '../../components/admin/DataCard';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { DataTable, Column } from '../../components/admin/DataTable';
import { StatusChip } from '../../components/admin/StatusChip';
import { EmptyState } from '../../components/admin/EmptyState';
import { ThreeDotMenu } from '../../components/admin/ThreeDotMenu';
import { DonutChart } from '../../components/admin/DonutChart';
import { RollingNumber } from '../../components/admin/island/IslandSystem';
import { todayISO } from '../../lib/format';

let hasPlayedAdminIndexEntrance = false;

const AdminIndex: React.FC = () => {
  const navigate = useNavigate();
  const { bookings, serviceForms } = useAdmin();
  const counts = useActionCounts();
  const containerRef = useRef<HTMLDivElement>(null);

  const [bookingFilter, setBookingFilter] = useState<string>('Semua');

  const today = todayISO();
  const todayBookings = useMemo(
    () => bookings.filter((b) => b.date === today).sort((a, b) => a.hour.localeCompare(b.hour)),
    [bookings, today]
  );

  const filteredToday = useMemo(() => {
    const list =
      bookingFilter === 'Semua'
        ? todayBookings
        : todayBookings.filter((b) => b.status === bookingFilter);
    return list.slice(0, 4);
  }, [todayBookings, bookingFilter]);

  const sfMenunggu = serviceForms.filter((sf) => sf.status === 'menunggu_persetujuan').length;
  const sfDisetujui = serviceForms.filter((sf) => sf.status === 'disetujui').length;
  const sfBatal = serviceForms.filter((sf) => sf.status === 'batal').length;
  const sfTotal = sfMenunggu + sfDisetujui + sfBatal;
  const disetujuiPct = sfTotal > 0 ? Math.round((sfDisetujui / sfTotal) * 100) : 0;

  const perluDitanganiRows = [
    {
      label: 'Booking belum dikonfirmasi',
      count: counts.booking,
      to: '/admin/v1/booking?status=menunggu',
    },
    {
      label: 'Service Form menunggu persetujuan',
      count: counts.serviceForm,
      to: '/admin/v1/service-forms?tab=menunggu_persetujuan',
    },
    {
      label: 'Part di bawah stok minimum',
      count: counts.lowStock,
      to: '/admin/v2/warehouse?view=part&filter=low',
    },
    { label: 'Tiket Help Desk terbuka', count: counts.ticket, to: '/admin/helpdesk' },
  ];

  useGSAP(
    () => {
      if (hasPlayedAdminIndexEntrance) return;
      hasPlayedAdminIndexEntrance = true;

      const root = containerRef.current;
      if (!root) return;
      const mm = gsap.matchMedia(root);
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const topbar = document.querySelector<HTMLElement>('[data-admin-topbar]');
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

        if (topbar) {
          tl.fromTo(
            topbar,
            { y: -12, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.3, clearProps: 'transform,opacity' },
            0
          );
        }

        tl.from(
          '.kpi-card',
          { y: 12, opacity: 0, duration: 0.35, stagger: 0.08, clearProps: 'transform,opacity' },
          0.08
        ).from(
          '.data-card',
          { y: 14, opacity: 0, duration: 0.4, stagger: 0.08, clearProps: 'transform,opacity' },
          0.16
        );
      });

      return () => mm.revert();
    },
    { scope: containerRef }
  );

  const columns: Column<Booking>[] = [
    {
      key: 'plate',
      header: 'Plat',
      render: (b) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] font-sans font-semibold text-[13px] shrink-0"
            style={{ backgroundColor: 'rgba(255, 189, 89, 0.18)', color: '#B77700' }}
          >
            {b.customerName.charAt(0)}
          </span>
          <div>
            <data value={b.plate} className="font-mono font-medium text-[#1E2230] tabular-nums">
              {b.plate}
            </data>
            <span className="text-[12px] text-[#646B7C] ml-2">{b.customerName}</span>
          </div>
        </div>
      ),
    },
    { key: 'hour', header: 'Jam', align: 'center' },
    { key: 'service', header: 'Layanan', align: 'center' },
    {
      key: 'status',
      header: 'Status',
      align: 'right',
      render: (b) => <StatusChip status={b.status} />,
    },
  ];

  return (
    <div ref={containerRef} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-3 grid grid-cols-2 lg:flex lg:flex-col gap-4">
          <KpiCard
            to="/admin/v1/booking?status=menunggu"
            value={counts.booking}
            label="Booking menunggu"
            color="#5CC46A"
            bgTint="rgba(92, 196, 106, 0.14)"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2.8" y="4" width="14.4" height="13" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M2.8 8H17.2M6.5 2.3V5.2M13.5 2.3V5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            }
          />

          <KpiCard
            to="/admin/v1/service-forms?tab=menunggu_persetujuan"
            value={counts.serviceForm}
            label="Service Form menunggu"
            color="#F2466F"
            bgTint="rgba(242, 70, 111, 0.14)"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="3.5" y="2.8" width="13" height="14.4" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
                <path d="M6.5 7.2H13.5M6.5 10.2H13.5M6.5 13.2H10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            }
          />

          <KpiCard
            to="/admin/v2/warehouse?view=part&filter=low"
            value={counts.lowStock}
            label="Part di bawah minimum"
            color="#3DA5F5"
            bgTint="rgba(61, 165, 245, 0.14)"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 2.4L3 5.9V14.1L10 17.6L17 14.1V5.9L10 2.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M3 5.9L10 9.4L17 5.9M10 9.4V17.6" stroke="currentColor" strokeWidth="1.6" />
              </svg>
            }
          />

          <KpiCard
            to="/admin/helpdesk"
            value={counts.ticket}
            label="Tiket terbuka"
            color="#FFBD59"
            bgTint="rgba(255, 189, 89, 0.14)"
            icon={
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M3 5L10 10.5L17 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>

        <div className="lg:col-span-9 flex flex-col gap-6">
          <DataCard
            title="Booking hari ini"
            actions={
              <FilterTabs
                ariaLabel="Filter booking hari ini"
                value={bookingFilter}
                onChange={setBookingFilter}
                tabs={[
                  { value: 'Semua', label: 'Semua' },
                  { value: 'menunggu', label: 'Menunggu' },
                  { value: 'datang', label: 'Datang' },
                ]}
              />
            }
          >
            {filteredToday.length === 0 ? (
              <EmptyState
                message={
                  bookingFilter === 'Semua'
                    ? 'Belum ada booking hari ini.'
                    : `Tidak ada booking pada tab ini hari ini.`
                }
                actionText="Tambah booking"
                onAction={() => navigate('/admin/v1/booking?new=1')}
              />
            ) : (
              <DataTable
                columns={columns}
                data={filteredToday}
                keyExtractor={(b) => b.id}
                onRowClick={() => navigate('/admin/v1/booking')}
                swapKey={bookingFilter}
              />
            )}
          </DataCard>

          <DataCard
            title="Estimasi disetujui minggu ini"
            actions={
              <ThreeDotMenu
                ariaLabel="Opsi Service Form"
                actions={[
                  { label: 'Buka Service Form', onClick: () => navigate('/admin/v1/service-forms') },
                  { label: 'Lihat laporan', onClick: () => navigate('/admin/laporan/servis') },
                ]}
              />
            }
          >
            <DonutChart
              centerPercent={disetujuiPct}
              centerLabel="Disetujui"
              segments={[
                { label: 'Disetujui', count: sfDisetujui, color: '#5CC46A' },
                { label: 'Menunggu persetujuan', count: sfMenunggu, color: '#FFBD59' },
                { label: 'Batal', count: sfBatal, color: '#F2466F' },
              ]}
            />
          </DataCard>
        </div>
      </div>

      <DataCard title="Perlu ditangani">
        <ul className="divide-y divide-[#EEF0F4]">
          {perluDitanganiRows.map((item) => (
            <li key={item.label}>
              <Link
                to={item.to}
                className="flex items-center justify-between gap-4 min-h-[52px] px-3 rounded-[12px] text-[14px] text-[#1E2230] no-underline hover:bg-[#F6F7FA] transition-colors"
              >
                <span className="font-medium">{item.label}</span>
                <data
                  value={item.count}
                  className={`inline-flex items-center justify-center min-w-[28px] h-7 px-2.5 rounded-[8px] font-sans text-[12px] font-semibold tabular-nums ${
                    item.count > 0
                      ? 'bg-[rgba(242,70,111,0.14)] text-[#D62E5A]'
                      : 'bg-[#F6F7FA] text-[#646B7C]'
                  }`}
                >
                  <RollingNumber value={item.count} />
                </data>
              </Link>
            </li>
          ))}
        </ul>
      </DataCard>
    </div>
  );
};

export default AdminIndex;
