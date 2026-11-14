import React, { useState, useMemo } from 'react';
import { useAuth } from '../lib/mockAuth';
import { useAdmin } from '../context/AdminContext';
import type { Booking } from '../data/adminDummy';
import { StatusChip } from './admin/StatusChip';
import { CenterDialog } from './admin/CenterDialog';
import { ActionButton } from './admin/ActionButton';
import {
  formatBookingCreatedDateTime,
  formatScheduledServiceDateTime,
} from '../lib/format';

export const CustomerBookingsSection: React.FC = () => {
  const { isLoggedIn, role, user } = useAuth();
  const { bookings, customers, vehicles } = useAdmin();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const isCustomer = isLoggedIn && role === 'customer' && Boolean(user);

  // Filter bookings strictly belonging to the authenticated customer
  const customerBookings = useMemo(() => {
    if (!isCustomer || !user?.email) return [];
    const userEmail = user.email.toLowerCase().trim();

    return bookings
      .filter((b) => b.customerEmail && b.customerEmail.toLowerCase().trim() === userEmail)
      .sort((a, b) => {
        // Active/pending first, cancelled last
        const isACancelled = a.status === 'batal';
        const isBCancelled = b.status === 'batal';
        if (isACancelled !== isBCancelled) {
          return isACancelled ? 1 : -1;
        }
        // Then sort by scheduled date and hour descending
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return (b.hour || '').localeCompare(a.hour || '');
      });
  }, [isCustomer, user, bookings]);

  // If customer is not authenticated, do not render the section
  if (!isCustomer) {
    return null;
  }

  const scrollToBooking = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    const el = document.getElementById('booking');
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.offsetTop,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  };

  // Find customer or vehicle details for modal popup if available
  const customerDetail = customers.find(
    (c) =>
      c.name.trim().toLowerCase() === selectedBooking?.customerName.trim().toLowerCase() ||
      (selectedBooking?.plate && c.plate === selectedBooking.plate)
  );

  const vehicleDetail = vehicles.find(
    (v) => selectedBooking?.plate && v.plate === selectedBooking.plate
  );

  return (
    <section
      id="daftar-booking"
      aria-label="Daftar Booking Kendaraan"
      className="relative w-full bg-carbon text-paper py-20 md:py-24 border-b border-steel/20 z-10"
    >
      <div className="w-full max-w-[1200px] mx-auto px-6">
        {/* Section Header */}
        <div className="mb-10 text-left">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-condensed font-bold text-xs uppercase tracking-widest text-signal">
              Akun Pelanggan
            </span>
          </div>
          <h2
            data-aos="fade-up"
            className="font-condensed font-semibold text-[36px] md:text-[48px] text-paper tracking-tight leading-tight mb-3"
          >
            Daftar Booking Kendaraan
          </h2>
          <p
            data-aos="fade-up"
            data-aos-delay="60"
            className="font-sans font-normal text-[16px] text-paper/70 leading-normal max-w-[60ch]"
          >
            Pantau jadwal servis dan riwayat booking kendaraan Anda.
          </p>
        </div>

        {/* Content: Cards Grid or Empty State */}
        {customerBookings.length === 0 ? (
          <div
            data-aos="fade-up"
            data-aos-delay="100"
            className="w-full max-w-[560px] p-8 md:p-10 rounded-[12px] bg-paper/[0.03] border border-steel/50 flex flex-col items-start"
          >
            <div className="w-10 h-10 rounded-full bg-paper/[0.06] border border-steel/60 flex items-center justify-center mb-5 text-paper/60">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <h3 className="font-condensed font-semibold text-[22px] text-paper mb-2">
              Anda belum memiliki booking.
            </h3>
            <p className="font-sans text-[15px] text-paper/70 mb-6">
              Jadwalkan servis kendaraan Anda melalui MyBengkel.
            </p>
            <a
              href="#booking"
              onClick={scrollToBooking}
              className="inline-flex items-center justify-center px-5 py-2.5 bg-signal text-carbon font-sans font-medium text-sm rounded-[4px] hover:bg-signal/90 transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Booking Servis
            </a>
          </div>
        ) : (
          <div
            data-aos="fade-up"
            data-aos-delay="100"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {customerBookings.map((b) => {
              const model =
                b.vehicleModel ||
                vehicleDetail?.model ||
                user?.motorType ||
                user?.vehicleModel ||
                '-';
              const createdText = formatBookingCreatedDateTime(b.createdAt);
              const scheduledText = formatScheduledServiceDateTime(b.date, b.hour);

              return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedBooking(b)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedBooking(b);
                    }
                  }}
                  className="group relative p-6 rounded-[10px] bg-paper/[0.04] hover:bg-paper/[0.07] border border-steel/60 hover:border-steel transition-all duration-200 cursor-pointer flex flex-col justify-between text-left focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                >
                  <div>
                    {/* Top row: ID and Status */}
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <span className="font-mono text-xs font-semibold tracking-wider text-paper/60 uppercase">
                        {b.id}
                      </span>
                      <StatusChip status={b.status} />
                    </div>

                    {/* Service title */}
                    <h3 className="font-condensed font-semibold text-[20px] text-paper mb-2 group-hover:text-signal transition-colors">
                      {b.service}
                    </h3>

                    {/* Vehicle details */}
                    <div className="flex items-center gap-2 text-sm text-paper/80 mb-5">
                      <span className="font-mono font-medium px-2 py-0.5 rounded bg-paper/[0.08] text-xs text-paper">
                        {b.plate}
                      </span>
                      {model !== '-' && (
                        <span className="text-paper/60 text-xs truncate">
                          {model}
                        </span>
                      )}
                    </div>

                    {/* Times Section */}
                    <div className="space-y-2 pt-3 border-t border-paper/10 text-xs font-sans">
                      <div>
                        <span className="text-paper/50 block">Jadwal servis:</span>
                        <span className="text-paper font-medium">{scheduledText}</span>
                      </div>
                      <div>
                        <span className="text-paper/50 block">Booking dibuat:</span>
                        <span className="text-paper/80">{createdText}</span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom link indicator */}
                  <div className="mt-5 pt-3 border-t border-paper/10 flex items-center justify-between text-xs text-paper/60 group-hover:text-paper transition-colors">
                    <span>Lihat rincian</span>
                    <span aria-hidden="true" className="group-hover:translate-x-1 transition-transform">
                      &rarr;
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Booking Detail Dialog */}
      <CenterDialog
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? `Rincian Booking ${selectedBooking.id}` : 'Rincian Booking'}
        hideHeaderClose={true}
        maxWidthClass="max-w-[580px]"
        footer={
          <ActionButton
            type="button"
            intent="cancel"
            onClick={() => setSelectedBooking(null)}
          >
            Tutup
          </ActionButton>
        }
      >
        {selectedBooking && (
          <div className="space-y-6 text-[#1E2230]">
            {/* Status & Booking ID Overview */}
            <div className="flex items-center justify-between p-4 rounded-[8px] bg-[#F7F8FA] border border-[#EEF0F4]">
              <div>
                <span className="text-xs font-medium text-[#646B7C] block uppercase tracking-wide">
                  Status Pemesanan
                </span>
                <span className="font-mono text-sm font-semibold text-[#1E2230]">
                  {selectedBooking.id}
                </span>
              </div>
              <StatusChip status={selectedBooking.status} />
            </div>

            {/* Section: Informasi Pelanggan */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#646B7C] mb-3 pb-1 border-b border-[#EEF0F4]">
                Informasi Pelanggan
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-[#646B7C] block">Nama Lengkap</span>
                  <span className="font-medium text-[#1E2230]">{selectedBooking.customerName}</span>
                </div>
                <div>
                  <span className="text-xs text-[#646B7C] block">Nomor HP / WhatsApp</span>
                  <span className="font-medium text-[#1E2230]">
                    {customerDetail?.phone || user?.phone || '-'}
                  </span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-xs text-[#646B7C] block">Alamat</span>
                  <span className="font-medium text-[#1E2230]">
                    {user?.address || '-'}
                  </span>
                </div>
              </div>
            </div>

            {/* Section: Informasi Kendaraan */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#646B7C] mb-3 pb-1 border-b border-[#EEF0F4]">
                Informasi Kendaraan
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-xs text-[#646B7C] block">Tipe / Model</span>
                  <span className="font-medium text-[#1E2230]">
                    {selectedBooking.vehicleModel ||
                      vehicleDetail?.model ||
                      user?.motorType ||
                      user?.vehicleModel ||
                      '-'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#646B7C] block">Nomor Polisi (Plat)</span>
                  <span className="font-mono font-medium text-[#1E2230]">
                    {selectedBooking.plate}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#646B7C] block">Nomor Mesin</span>
                  <span className="font-mono text-xs text-[#1E2230]">
                    {selectedBooking.engineNo}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-[#646B7C] block">Nomor Rangka</span>
                  <span className="font-mono text-xs text-[#1E2230]">
                    {selectedBooking.frameNo}
                  </span>
                </div>
              </div>
            </div>

            {/* Section: Detail Booking & Jadwal */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#646B7C] mb-3 pb-1 border-b border-[#EEF0F4]">
                Detail Layanan & Jadwal
              </h4>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-xs text-[#646B7C] block">Layanan Servis</span>
                  <span className="font-medium text-[#1E2230]">{selectedBooking.service}</span>
                </div>
                <div>
                  <span className="text-xs text-[#646B7C] block">Keluhan / Catatan</span>
                  <p className="font-normal text-[#1E2230] bg-[#F7F8FA] p-3 rounded-[6px] border border-[#EEF0F4] text-xs mt-1">
                    {selectedBooking.complaint || 'Tidak ada keluhan tertulis.'}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 rounded-[6px] bg-[#F7F8FA] border border-[#EEF0F4]">
                    <span className="text-xs text-[#646B7C] block mb-0.5">Jadwal Servis</span>
                    <span className="font-medium text-[#1E2230] text-sm">
                      {formatScheduledServiceDateTime(selectedBooking.date, selectedBooking.hour)}
                    </span>
                  </div>
                  <div className="p-3 rounded-[6px] bg-[#F7F8FA] border border-[#EEF0F4]">
                    <span className="text-xs text-[#646B7C] block mb-0.5">Booking Dibuat</span>
                    <span className="font-medium text-[#1E2230] text-sm">
                      {formatBookingCreatedDateTime(selectedBooking.createdAt)}
                    </span>
                  </div>
                </div>

                {/* Cancellation Details if Cancelled */}
                {selectedBooking.status === 'batal' && (
                  <div className="mt-3 p-3 rounded-[6px] bg-[rgba(242,70,111,0.08)] border border-[rgba(242,70,111,0.25)] text-xs">
                    <span className="font-semibold text-[#D62E5A] block mb-1">
                      Informasi Pembatalan
                    </span>
                    <p className="text-[#1E2230]">
                      Alasan: {selectedBooking.cancelReason || 'Dibatalkan oleh pelanggan atau bengkel'}
                    </p>
                    {selectedBooking.cancelledAt && (
                      <p className="text-[#646B7C] mt-1">
                        Waktu pembatalan: {formatBookingCreatedDateTime(selectedBooking.cancelledAt)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </CenterDialog>
    </section>
  );
};

export default CustomerBookingsSection;

