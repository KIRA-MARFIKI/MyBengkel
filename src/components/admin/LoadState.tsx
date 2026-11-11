import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';

export const LoadingState: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div role="status" aria-label="Memuat data" className="space-y-3 py-2">
    <div className="admin-skeleton h-9 w-full" />
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="flex items-center gap-3 h-14 px-2">
        <div className="admin-skeleton h-9 w-9 shrink-0" />
        <div className="admin-skeleton h-4 flex-1" />
        <div className="admin-skeleton h-4 w-20" />
      </div>
    ))}
  </div>
);

export const LoadingLine: React.FC<{ text?: string }> = () => <LoadingState rows={3} />;

export const ErrorState: React.FC<{ message?: string; onRetry?: () => void }> = ({
  message = 'Data belum bisa dimuat.',
  onRetry,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 8, willChange: 'transform, opacity' },
          {
            opacity: 1,
            y: 0,
            duration: 0.25,
            ease: 'power3.out',
            onComplete: () => {
              gsap.set(el, { clearProps: 'willChange,transform,opacity' });
            },
          }
        );
      });
    },
    { dependencies: [message], scope: ref }
  );

  return (
    <div
      ref={ref}
      role="alert"
      className="py-8 px-4 text-center rounded-[12px] bg-[rgba(242,70,111,0.08)]"
    >
      <span className="font-sans font-medium text-[14px] text-[#D62E5A]">{message}</span>
      <button
        type="button"
        onClick={onRetry || (() => window.location.reload())}
        className="ml-3 admin-btn-text"
      >
        Muat ulang
      </button>
    </div>
  );
};
