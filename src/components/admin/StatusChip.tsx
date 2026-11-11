import React, { useLayoutEffect, useRef } from 'react';
import { gsap } from '../../lib/gsap';

interface StatusChipProps {
  status: string;
  needsAction?: boolean;
  className?: string;
}

const CORAL_STATUSES = new Set([
  'Kritis',
  'Batal',
  'batal',
  'Ditolak',
  'ditolak',
  'Dibatalkan',
  'dibatalkan',
  'Kedaluwarsa',
  'kedaluwarsa',
  'Prioritas Tinggi',
  'Belum pulang',
  'Perlu tindakan',
]);

const GREEN_STATUSES = new Set([
  'Aman',
  'Datang',
  'datang',
  'Disetujui',
  'disetujui',
  'Diterima',
  'Terima',
  'terima',
  'Sampai',
  'sampai',
  'Selesai',
  'selesai',
  'Dibayar',
  'dibayar',
]);

const BLUE_STATUSES = new Set([
  'Reguler',
  'reguler',
  'Dipesan',
  'Diproses',
  'Berjalan',
  'berjalan',
  'Pemasukan lain',
]);

const AMBER_STATUSES = new Set([
  'Menunggu',
  'menunggu',
  'Menunggu persetujuan',
  'menunggu_persetujuan',
  'Diajukan',
  'diajukan',
  'Belum sampai',
  'belum_sampai',
  'Belum diterima',
  'belum',
  'Terbuka',
  'Prioritas Sedang',
  'Pengeluaran operasional',
  'Menunggu pembayaran',
  'menunggu_pembayaran',
]);

const DISPLAY_LABEL_MAP: Record<string, string> = {
  menunggu: 'Menunggu',
  datang: 'Datang',
  batal: 'Batal',
  ditolak: 'Ditolak',
  menunggu_persetujuan: 'Menunggu persetujuan',
  disetujui: 'Disetujui',
  selesai: 'Selesai',
  berjalan: 'Berjalan',
  reguler: 'Reguler',
  ho: 'HO',
  diajukan: 'Belum sampai',
  belum_sampai: 'Belum sampai',
  sampai: 'Sampai',
  terima: 'Terima',
  belum: 'Belum diterima',
  dibayar: 'Dibayar',
  menunggu_pembayaran: 'Menunggu pembayaran',
  dibatalkan: 'Dibatalkan',
  kedaluwarsa: 'Kedaluwarsa',
};

function resolveChipStyle(status: string, needsAction?: boolean): { bg: string; color: string } {
  if (needsAction || CORAL_STATUSES.has(status)) {
    return { bg: 'rgba(242, 70, 111, 0.14)', color: '#D62E5A' };
  }
  if (GREEN_STATUSES.has(status)) {
    return { bg: 'rgba(92, 196, 106, 0.14)', color: '#1F9D3A' };
  }
  if (BLUE_STATUSES.has(status)) {
    return { bg: 'rgba(61, 165, 245, 0.14)', color: '#1D6FC4' };
  }
  if (AMBER_STATUSES.has(status)) {
    return { bg: 'rgba(255, 189, 89, 0.18)', color: '#B77700' };
  }
  // HO, Draft, Prioritas Rendah, and others: ink at 8% tint, ink text
  return { bg: 'rgba(30, 34, 48, 0.08)', color: '#1E2230' };
}

// Chips: radius 8, tinted background with a colored text variant (4.5:1 on white).
export const StatusChip: React.FC<StatusChipProps> = ({ status, needsAction, className = '' }) => {
  const chipRef = useRef<HTMLSpanElement>(null);
  const prevStatusRef = useRef<string>(status);
  const { bg, color } = resolveChipStyle(status, needsAction);

  useLayoutEffect(() => {
    if (prevStatusRef.current === status) return;
    prevStatusRef.current = status;
    const el = chipRef.current;
    if (!el) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.killTweensOf(el);
      gsap.fromTo(
        el,
        { opacity: 0.25, willChange: 'opacity' },
        {
          opacity: 1,
          duration: 0.2,
          ease: 'power2.out',
          onComplete: () => {
            gsap.set(el, { clearProps: 'willChange' });
          },
        }
      );
    });
    return () => mm.revert();
  }, [status]);

  return (
    <span
      ref={chipRef}
      style={{ backgroundColor: bg, color }}
      className={`inline-flex items-center h-6 px-2.5 rounded-[8px] font-sans font-medium text-[12px] leading-none select-none whitespace-nowrap ${className}`}
    >
      {DISPLAY_LABEL_MAP[status] || status}
    </span>
  );
};

export default StatusChip;
