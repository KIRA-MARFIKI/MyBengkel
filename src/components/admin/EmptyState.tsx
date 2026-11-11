import React, { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from '../../lib/gsap';
import { ActionButton } from './ActionButton';

interface EmptyStateProps {
  message: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

// Empty states appear with the same 0.25s rise as the content they replace.
export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  actionText,
  onAction,
  className = '',
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
    <div ref={ref} role="status" className={`py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA] flex flex-col sm:flex-row items-center justify-center gap-3 ${className}`}>
      <p className="font-sans font-normal text-[14px] text-[#646B7C]">{message}</p>
      {actionText && onAction && (
        <ActionButton type="button" intent="start" onClick={onAction} className="!h-8 !px-3.5 !text-[13px]">
          {actionText}
        </ActionButton>
      )}
    </div>
  );
};

export default EmptyState;
