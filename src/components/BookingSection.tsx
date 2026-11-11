import React from 'react';
import { BookingForm } from './admin/BookingForm';

export const BookingSection: React.FC = () => {
  return (
    <section
      id="booking"
      aria-label="Pemesanan Servis"
      className="relative w-full min-h-[100vh] bg-carbon text-paper flex flex-col justify-center py-28 z-10"
    >
      <div className="w-full max-w-[1200px] mx-auto px-6">
        <div className="w-full max-w-[640px] text-left">
          <h2
            data-aos="fade-up"
            className="font-condensed font-semibold text-[48px] text-paper tracking-tight leading-tight mb-3"
          >
            Booking servis
          </h2>

          <p
            data-aos="fade-up"
            data-aos-delay="60"
            className="font-sans font-normal text-[16px] text-paper/70 leading-normal mb-10"
          >
            Pilih layanan, tanggal, dan jam. Kamu perlu masuk atau daftar sebelum mengirim booking.
          </p>

          <div data-aos="fade-up" data-aos-delay="120">
            <BookingForm mode="public" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default BookingSection;
