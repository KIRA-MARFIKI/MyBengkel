import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/mockAuth';
import { useAdmin } from '../context/AdminContext';
import type { Booking } from '../data/adminDummy';
import { BookingForm } from './admin/BookingForm';
import { StatusChip } from './admin/StatusChip';
import { CenterDialog } from './admin/CenterDialog';
import { ActionButton } from './admin/ActionButton';
import {
  formatBookingCreatedDateTime,
  formatScheduledServiceDateTime,
} from '../lib/format';

export const BookingSection: React.FC = () => {
  const { isLoggedIn, role, user, logout, updateUserProfile } = useAuth();
  const { bookings, customers, vehicles, cancelBooking } = useAdmin();
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [bookingToCancel, setBookingToCancel] = useState<Booking | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');

  // Customer Profile Edit Modal State
  const [isEditProfileOpen, setIsEditProfileOpen] = useState<boolean>(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    phone: '',
    plate: '',
    motorType: '',
    engineNo: '',
    frameNo: '',
    address: '',
  });
  const [profileNotice, setProfileNotice] = useState<string>('');
  const [profileError, setProfileError] = useState<string>('');

  const handleOpenEditProfile = () => {
    if (!user) return;
    setProfileForm({
      name: user.name || '',
      phone: user.phone || '',
      plate: user.plate || '',
      motorType: user.motorType || user.vehicleModel || '',
      engineNo: user.engineNo || '',
      frameNo: user.frameNo || '',
      address: user.address || '',
    });
    setProfileNotice('');
    setProfileError('');
    setIsEditProfileOpen(true);
  };

  const handleSaveProfile = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setProfileError('');
    setProfileNotice('');

    const cleanName = profileForm.name.trim();
    if (!cleanName) {
      setProfileError('Nama lengkap wajib diisi.');
      return;
    }

    const cleanPlate = profileForm.plate.trim().toUpperCase();
    const cleanPhone = profileForm.phone.trim();
    const cleanMotorType = profileForm.motorType.trim();
    const cleanEngineNo = profileForm.engineNo.trim().toUpperCase();
    const cleanFrameNo = profileForm.frameNo.trim().toUpperCase();
    const cleanAddress = profileForm.address.trim();

    updateUserProfile({
      name: cleanName,
      plate: cleanPlate,
      phone: cleanPhone,
      motorType: cleanMotorType,
      vehicleModel: cleanMotorType,
      engineNo: cleanEngineNo,
      frameNo: cleanFrameNo,
      address: cleanAddress,
    });

    setProfileNotice('Data identitas konsumen telah diperbarui.');
    setTimeout(() => {
      setIsEditProfileOpen(false);
      setProfileNotice('');
    }, 900);
  };

  const handleConfirmCancel = () => {
    if (!bookingToCancel) return;
    const reason = cancelReasonInput.trim() || 'Dibatalkan oleh pelanggan';
    cancelBooking(bookingToCancel.id, reason);
    setBookingToCancel(null);
    setCancelReasonInput('');
    if (selectedBooking && selectedBooking.id === bookingToCancel.id) {
      setSelectedBooking((prev) =>
        prev
          ? {
              ...prev,
              status: 'batal',
              cancelReason: reason,
              cancelledAt: new Date().toISOString(),
            }
          : null
      );
    }
  };

  const isCustomer = isLoggedIn && role === 'customer' && Boolean(user);

  // Filter bookings belonging strictly to the currently authenticated customer
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

  // Detail customer / vehicle lookup for modal popup
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
      id="booking"
      aria-label="Pemesanan Servis"
      className="relative w-full min-h-screen bg-carbon text-paper py-20 md:py-28 z-10 border-t border-steel/20"
    >
      <div className="w-full max-w-[1240px] mx-auto px-4 sm:px-6">
        {/* Main Two-Column Side-by-Side Layout on Desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* ========================================================================= */}
          {/* LEFT COLUMN: Booking Service Form */}
          {/* ========================================================================= */}
          <div className="w-full lg:col-span-7 text-left">
            <div className="mb-6">
              <span className="font-condensed font-bold text-xs uppercase tracking-widest text-signal block mb-2">
                Layanan Bengkel
              </span>
              <h2
                data-aos="fade-up"
                className="font-condensed font-semibold text-[38px] md:text-[46px] text-paper tracking-tight leading-tight mb-3"
              >
                Booking servis
              </h2>
              <p
                data-aos="fade-up"
                data-aos-delay="60"
                className="font-sans font-normal text-[15px] md:text-[16px] text-paper/70 leading-normal max-w-[55ch]"
              >
                Pilih layanan, tanggal, dan jam kedatangan. Masuk atau daftar akun untuk
                memantau antrean dan riwayat pengerjaan kendaraan Anda.
              </p>
            </div>

            <div
              data-aos="fade-up"
              data-aos-delay="120"
              className="bg-paper/[0.02] border border-steel/40 rounded-[12px] p-6 md:p-8"
            >
              <BookingForm mode="public" />
            </div>
          </div>

          {/* ========================================================================= */}
          {/* RIGHT COLUMN: Customer Account Panel & Customer Booking Cards */}
          {/* ========================================================================= */}
          <div className="w-full lg:col-span-5 text-left space-y-6">
            {/* 1. CUSTOMER ACCOUNT PANEL */}
            <div
              data-aos="fade-up"
              data-aos-delay="100"
              onClick={isCustomer ? handleOpenEditProfile : undefined}
              role={isCustomer ? 'button' : undefined}
              tabIndex={isCustomer ? 0 : undefined}
              onKeyDown={
                isCustomer
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenEditProfile();
                      }
                    }
                  : undefined
              }
              title={isCustomer ? 'Klik untuk melihat atau mengubah identitas konsumen' : undefined}
              className={`rounded-[12px] bg-paper/[0.04] border border-steel/50 p-6 text-paper ${
                isCustomer
                  ? 'hover:border-signal/70 hover:bg-paper/[0.07] cursor-pointer transition-all duration-200 group relative'
                  : ''
              }`}
            >
              {isCustomer ? (
                <div>
                  <div className="flex items-center justify-between gap-3 mb-4 pb-4 border-b border-paper/10">
                    <div className="flex items-center gap-3">
                      {/* Avatar Icon */}
                      <div className="w-11 h-11 rounded-full bg-signal text-carbon font-bold flex items-center justify-center text-lg uppercase select-none shadow-sm group-hover:scale-105 transition-transform">
                        {user?.name ? user.name.charAt(0) : 'P'}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-paper truncate group-hover:text-signal transition-colors">
                          {user?.name || 'Pelanggan Terdaftar'}
                        </div>
                        <div className="text-xs text-paper/60 truncate font-mono flex items-center gap-2">
                          <span>{user?.email}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              logout();
                            }}
                            title="Keluar dari akun pelanggan"
                            className="text-[11px] text-paper/50 hover:text-paper underline cursor-pointer"
                          >
                            Keluar
                          </button>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenEditProfile();
                      }}
                      title="Ubah identitas konsumen"
                      aria-label="Ubah identitas konsumen"
                      className="w-8 h-8 rounded-full border border-[#3DA5F5]/40 bg-[#3DA5F5]/10 hover:bg-[#3DA5F5]/25 hover:border-[#3DA5F5] text-[#3DA5F5] flex items-center justify-center transition-colors cursor-pointer shrink-0 shadow-sm"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  </div>

                  {/* Profile Quick Details */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-paper/50 block mb-0.5">Nomor Polisi:</span>
                      <span className="font-mono font-medium text-paper bg-paper/[0.06] px-2 py-0.5 rounded inline-block">
                        {user?.plate || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-paper/50 block mb-0.5">Model Kendaraan:</span>
                      <span className="font-medium text-paper truncate block">
                        {user?.motorType || user?.vehicleModel || '-'}
                      </span>
                    </div>
                    <div>
                      <span className="text-paper/50 block mb-0.5">Nomor Telepon:</span>
                      <span className="font-mono text-paper">{user?.phone || '-'}</span>
                    </div>
                    <div>
                      <span className="text-paper/50 block mb-0.5">Status Akun:</span>
                      <span className="text-signal font-semibold">Aktif</span>
                    </div>
                  </div>

                  {/* Footer hint */}
                  <div className="mt-4 pt-3 border-t border-paper/10 flex items-center justify-between text-[11px] text-paper/50 group-hover:text-paper/80 transition-colors">
                    <span>Klik kartu untuk mengubah identitas</span>
                    <span className="text-signal group-hover:translate-x-0.5 transition-transform">&rarr;</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-condensed font-bold text-xs uppercase tracking-widest text-signal">
                      Akun Pelanggan
                    </span>
                  </div>
                  <h3 className="font-condensed font-semibold text-[20px] text-paper">
                    Masuk untuk Memantau Servis
                  </h3>
                  <p className="text-xs text-paper/70 leading-relaxed">
                    Masuk ke akun Anda untuk melihat jadwal kedatangan, riwayat pengerjaan, dan status
                    servis secara real-time.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <Link
                      to="/login?next=/#booking"
                      className="flex-1 py-2.5 px-4 text-center rounded-[4px] bg-signal text-carbon font-medium text-xs hover:bg-signal/90 transition-colors"
                    >
                      Masuk Akun
                    </Link>
                    <Link
                      to="/register"
                      className="flex-1 py-2.5 px-4 text-center rounded-[4px] border border-steel/80 text-paper font-medium text-xs hover:border-paper transition-colors"
                    >
                      Daftar Akun Baru
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* 2. ALL CUSTOMER BOOKING CARDS */}
            <div data-aos="fade-up" data-aos-delay="160" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-condensed font-semibold text-[20px] text-paper tracking-tight">
                  Daftar Booking Kendaraan
                </h3>
                {isCustomer && (
                  <span className="text-xs font-mono text-paper/60 tabular-nums">
                    Total: {customerBookings.length}
                  </span>
                )}
              </div>

              {!isCustomer ? (
                /* Logged out preview card */
                <div className="p-6 rounded-[10px] bg-paper/[0.02] border border-steel/40 text-left space-y-3">
                  <div className="w-9 h-9 rounded-full bg-paper/[0.05] border border-steel/50 flex items-center justify-center text-paper/60">
                    <svg
                      width="18"
                      height="18"
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
                  <h4 className="text-sm font-semibold text-paper">
                    Pantau Jadwal Servis Terjadwal
                  </h4>
                  <p className="text-xs text-paper/60 leading-relaxed">
                    Setelah Anda masuk, semua booking servis yang terdaftar atas email Anda akan
                    ditampilkan di panel ini lengkap dengan status dan rincian jadwal kedatangan.
                  </p>
                </div>
              ) : customerBookings.length === 0 ? (
                /* Logged in with 0 bookings */
                <div className="p-6 rounded-[10px] bg-paper/[0.02] border border-steel/40 text-left space-y-2">
                  <h4 className="text-sm font-semibold text-paper">
                    Anda belum memiliki booking aktif
                  </h4>
                  <p className="text-xs text-paper/60 leading-relaxed">
                    Silakan isi formulir pemesanan di sebelah kiri untuk menjadwalkan servis berkala
                    atau perawatan motor Anda.
                  </p>
                </div>
              ) : (
                /* Customer Booking Cards List */
                <div className="space-y-3.5 max-h-[620px] overflow-y-auto pr-1">
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
                        className="group relative p-5 rounded-[10px] bg-paper/[0.03] hover:bg-paper/[0.06] border border-steel/50 hover:border-steel transition-all duration-200 cursor-pointer flex flex-col justify-between text-left focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
                      >
                        <div>
                          {/* Top row: ID and Status */}
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <span className="font-mono text-xs font-semibold tracking-wider text-paper/60 uppercase">
                              {b.id}
                            </span>
                            <StatusChip status={b.status} />
                          </div>

                          {/* Service Title */}
                          <h4 className="font-condensed font-semibold text-[18px] text-paper mb-1 group-hover:text-signal transition-colors">
                            {b.service}
                          </h4>

                          {/* Vehicle Details */}
                          <div className="flex items-center gap-2 text-xs text-paper/80 mb-3">
                            <span className="font-mono font-medium px-2 py-0.5 rounded bg-paper/[0.08] text-paper">
                              {b.plate}
                            </span>
                            {model !== '-' && (
                              <span className="text-paper/60 truncate">{model}</span>
                            )}
                          </div>

                          {/* Times Section: Distinguish Created vs Scheduled */}
                          <div className="space-y-1.5 pt-3 border-t border-paper/10 text-xs font-sans">
                            <div>
                              <span className="text-paper/50 block">Jadwal servis:</span>
                              <span className="text-paper font-medium">{scheduledText}</span>
                            </div>
                            <div>
                              <span className="text-paper/50 block">Booking dibuat:</span>
                              <span className="text-paper/70">{createdText}</span>
                            </div>
                          </div>
                        </div>

                        {/* Bottom link indicator and Batal Servis button */}
                        <div className="mt-4 pt-2.5 border-t border-paper/10 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1 text-paper/60 group-hover:text-paper transition-colors">
                            <span>Lihat rincian</span>
                            <span
                              aria-hidden="true"
                              className="group-hover:translate-x-1 transition-transform"
                            >
                              &rarr;
                            </span>
                          </div>
                          {b.status === 'menunggu' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBookingToCancel(b);
                              }}
                              className="px-2.5 py-1 rounded-[4px] border border-[rgba(242,70,111,0.5)] bg-[rgba(242,70,111,0.08)] hover:bg-[rgba(242,70,111,0.2)] text-xs font-semibold text-[#F2466F] transition-colors"
                            >
                              Batal Servis
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Booking Detail Dialog */}
      <CenterDialog
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title={selectedBooking ? `Rincian Booking ${selectedBooking.id}` : 'Rincian Booking'}
        hideHeaderClose={true}
        maxWidthClass="max-w-[580px]"
        footer={
          <div className="flex items-center justify-between w-full">
            {selectedBooking?.status === 'menunggu' ? (
              <ActionButton
                type="button"
                intent="cancel"
                onClick={() => {
                  if (selectedBooking) {
                    setBookingToCancel(selectedBooking);
                  }
                }}
              >
                Batal Servis
              </ActionButton>
            ) : (
              <div />
            )}
            <ActionButton
              type="button"
              intent="neutral"
              onClick={() => setSelectedBooking(null)}
            >
              Tutup
            </ActionButton>
          </div>
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

            {/* Section: Detail Layanan & Jadwal */}
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

      {/* Dialog Konfirmasi Pembatalan Servis */}
      <CenterDialog
        isOpen={Boolean(bookingToCancel)}
        onClose={() => setBookingToCancel(null)}
        title="Konfirmasi Pembatalan Servis"
        subtitle={bookingToCancel ? `Batalkan booking nomor ${bookingToCancel.id}` : ''}
        maxWidthClass="max-w-[460px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="neutral"
              onClick={() => setBookingToCancel(null)}
            >
              Kembali
            </ActionButton>
            <ActionButton
              type="button"
              intent="cancel"
              onClick={handleConfirmCancel}
            >
              Ya, Batalkan Servis
            </ActionButton>
          </>
        }
      >
        <div className="space-y-4 text-sm text-[#1E2230]">
          <p className="leading-relaxed">
            Apakah Anda yakin ingin membatalkan jadwal servis untuk kendaraan{' '}
            <strong className="font-mono">{bookingToCancel?.plate}</strong> (
            {bookingToCancel?.service})?
          </p>
          <div>
            <label
              htmlFor="cancel-service-reason-input"
              className="block text-xs font-semibold text-[#1E2230] mb-1"
            >
              Alasan Pembatalan (Opsional)
            </label>
            <input
              id="cancel-service-reason-input"
              type="text"
              value={cancelReasonInput}
              onChange={(e) => setCancelReasonInput(e.target.value)}
              placeholder="Contoh: Ada keperluan mendadak / ganti tanggal"
              className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
              autoFocus
            />
          </div>
        </div>
      </CenterDialog>

      {/* Dialog Identitas Konsumen (Ubah & Simpan Data) */}
      <CenterDialog
        isOpen={isEditProfileOpen}
        onClose={() => setIsEditProfileOpen(false)}
        title="Perbarui Data Konsumen"
        hideHeaderClose={true}
        maxWidthClass="max-w-[620px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="neutral"
              onClick={() => setIsEditProfileOpen(false)}
            >
              Batal
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              onClick={() => handleSaveProfile()}
            >
              Simpan Data
            </ActionButton>
          </>
        }
      >
        <div className="space-y-5 text-left">
          {/* Card Data Lama Konsumen */}
          <div className="p-4 rounded-[10px] bg-[#F7F8FA] border border-[#D9DDE6] text-xs">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#EEF0F4]">
              <span className="font-semibold text-[#1E2230] uppercase tracking-wider text-[11px]">
                Data Lama Konsumen (Terdaftar)
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#3DA5F5]/10 text-[#1D6FC4]">
                Data Tersimpan
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Nama Lengkap:</span>
                <span className="font-semibold text-[#1E2230] block">
                  {user?.name || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Email Terdaftar:</span>
                <span className="font-mono text-[#1E2230] block truncate">
                  {user?.email || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Nomor Polisi (Plat):</span>
                <span className="font-mono font-medium text-[#1E2230] bg-white px-2 py-0.5 rounded border border-[#E2E6EE] inline-block">
                  {user?.plate || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Model Kendaraan:</span>
                <span className="font-medium text-[#1E2230] block">
                  {user?.motorType || user?.vehicleModel || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Nomor Telepon:</span>
                <span className="font-mono text-[#1E2230] block">
                  {user?.phone || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Nomor Mesin:</span>
                <span className="font-mono text-[#1E2230] block">
                  {user?.engineNo || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Nomor Rangka:</span>
                <span className="font-mono text-[#1E2230] block">
                  {user?.frameNo || '-'}
                </span>
              </div>
              <div>
                <span className="text-[#646B7C] block text-[11px] mb-0.5">Alamat:</span>
                <span className="text-[#1E2230] block">
                  {user?.address || '-'}
                </span>
              </div>
            </div>
          </div>

          {/* Form Perbarui Data Baru */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="pb-1 border-b border-[#EEF0F4]">
              <span className="font-semibold text-[#1E2230] uppercase tracking-wider text-[11px]">
                Formulir Perbarui Data Baru
              </span>
            </div>

            {/* Email Akun (Read-only) */}
            <div>
              <label className="block text-xs font-semibold text-[#646B7C] mb-1">
                Email Akun (Terdaftar)
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={user?.email || ''}
                className="w-full px-3 py-2 text-sm bg-[#F6F7FA] border border-[#D9DDE6] rounded-[6px] text-[#646B7C] cursor-not-allowed font-mono"
              />
              <span className="block text-[11px] text-[#9DA4B4] mt-1">
                Email berfungsi sebagai identitas akun dan tidak dapat diubah di formulir ini.
              </span>
            </div>

          {/* Nama Lengkap & Nomor Telepon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-name-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Nama Lengkap <span className="text-[#D62E5A]">*</span>
              </label>
              <input
                id="profile-name-input"
                type="text"
                value={profileForm.name}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Nama lengkap sesuai KTP"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
                required
              />
            </div>
            <div>
              <label
                htmlFor="profile-phone-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Nomor Telepon
              </label>
              <input
                id="profile-phone-input"
                type="tel"
                value={profileForm.phone}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="08xxxxxxxxxx"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230] font-mono"
              />
            </div>
          </div>

          {/* Nomor Polisi & Model Kendaraan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-plate-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Nomor Polisi (Plat)
              </label>
              <input
                id="profile-plate-input"
                type="text"
                value={profileForm.plate}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, plate: e.target.value.toUpperCase() }))
                }
                placeholder="Contoh: BA 1234 YZ"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230] font-mono uppercase"
              />
            </div>
            <div>
              <label
                htmlFor="profile-motor-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Model Kendaraan
              </label>
              <input
                id="profile-motor-input"
                type="text"
                value={profileForm.motorType}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, motorType: e.target.value }))
                }
                placeholder="Contoh: Honda Vario 160"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230]"
              />
            </div>
          </div>

          {/* Nomor Mesin & Nomor Rangka */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-engine-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Nomor Mesin
              </label>
              <input
                id="profile-engine-input"
                type="text"
                value={profileForm.engineNo}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, engineNo: e.target.value.toUpperCase() }))
                }
                placeholder="Sesuai STNK"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230] font-mono uppercase"
              />
            </div>
            <div>
              <label
                htmlFor="profile-frame-input"
                className="block text-xs font-semibold text-[#1E2230] mb-1"
              >
                Nomor Rangka
              </label>
              <input
                id="profile-frame-input"
                type="text"
                value={profileForm.frameNo}
                onChange={(e) =>
                  setProfileForm((prev) => ({ ...prev, frameNo: e.target.value.toUpperCase() }))
                }
                placeholder="Sesuai STNK"
                className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230] font-mono uppercase"
              />
            </div>
          </div>

          {/* Alamat Lengkap */}
          <div>
            <label
              htmlFor="profile-address-input"
              className="block text-xs font-semibold text-[#1E2230] mb-1"
            >
              Alamat Lengkap
            </label>
            <textarea
              id="profile-address-input"
              rows={2}
              value={profileForm.address}
              onChange={(e) => setProfileForm((prev) => ({ ...prev, address: e.target.value }))}
              placeholder="Alamat domisili atau tempat tinggal"
              className="w-full px-3 py-2 text-sm border border-[#D9DDE6] rounded-[6px] focus:outline-none focus:border-[#1E2230] resize-y"
            />
          </div>

          {profileError && (
            <div className="p-3 rounded-[6px] bg-[#FFF2F5] border border-[#FAD2DC] text-xs text-[#D62E5A]">
              {profileError}
            </div>
          )}

          {profileNotice && (
            <div className="p-3 rounded-[6px] bg-[#F0FDF4] border border-[#BBF7D0] text-xs text-[#16A34A] leading-relaxed">
              {profileNotice}
            </div>
          )}
        </form>
      </div>
    </CenterDialog>
    </section>
  );
};

export default BookingSection;
