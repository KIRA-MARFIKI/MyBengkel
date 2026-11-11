import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { gsap, Flip } from '../../lib/gsap';
import { ActionButton, IconActionButton, XIconButton } from './ActionButton';
import {
  getLastTriggerElement,
  lockBodyScroll,
  probe,
  unlockBodyScroll,
} from './island/IslandSystem';

export interface CenterDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  closeStyle?: 'icon' | 'text';
  hideHeaderClose?: boolean;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export const CenterDialog: React.FC<CenterDialogProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  closeStyle = 'icon',
  hideHeaderClose = false,
  maxWidthClass = 'max-w-[680px]',
  children,
  footer,
}) => {
  const titleId = useId();
  const modalLockIdRef = useRef<symbol>(Symbol('CenterDialog'));
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current =
        getLastTriggerElement() || (document.activeElement as HTMLElement);
      setMounted(true);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const bd = backdropRef.current;
    const dlg = dialogRef.current;
    const ghost = ghostRef.current;
    if (!bd || !dlg || !ghost) return;

    const restoreTriggerFocus = () => {
      const trig = triggerRef.current;
      if (trig && document.body.contains(trig)) {
        trig.focus();
      }
    };

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.killTweensOf([bd, dlg, ghost]);

    if (prefersReduced) {
      if (isOpen) {
        gsap.set(bd, { opacity: 1 });
        gsap.set(ghost, { opacity: 0 });
        gsap.set(dlg, { opacity: 1, y: 0, clearProps: 'willChange,transform' });
      } else {
        setMounted(false);
        restoreTriggerFocus();
      }
      return;
    }

    const trig = triggerRef.current;
    const hasTrig = Boolean(trig && document.body.contains(trig));

    if (isOpen) {
      const dRect = dlg.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && dRect.width > 0 && dRect.height > 0
      );

      gsap.set(bd, { opacity: 0, willChange: 'opacity' });
      gsap.set(dlg, { opacity: 0, y: 12, willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });

      if (validTrig && trig) {
        Flip.fit(ghost, trig, { scale: true });
      } else {
        gsap.set(ghost, { scaleX: 0.92, scaleY: 0.92, y: 16 });
      }

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set(bd, { clearProps: 'willChange' });
          gsap.set(ghost, { opacity: 0, clearProps: 'willChange,transform' });
          gsap.set(dlg, { clearProps: 'willChange,transform,opacity' });
        },
      });

      tl.to(bd, { opacity: 1, duration: 0.22, ease: 'power2.out' }, 0)
        .to(
          ghost,
          {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            duration: 0.42,
            ease: 'power3.out',
          },
          0
        )
        .to(
          dlg,
          {
            opacity: 1,
            y: 0,
            duration: 0.25,
            ease: 'power3.out',
          },
          0.231
        )
        .to(
          ghost,
          {
            opacity: 0,
            duration: 0.15,
            ease: 'power2.out',
          },
          0.231
        );

      probe('CenterDialogOpen', tl);
    } else {
      const dRect = dlg.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && dRect.width > 0 && dRect.height > 0
      );

      gsap.set(bd, { willChange: 'opacity' });
      gsap.set(dlg, { willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set([bd, dlg, ghost], { clearProps: 'willChange,transform,opacity' });
          setMounted(false);
          restoreTriggerFocus();
        },
      });

      tl.to(bd, { opacity: 0, duration: 0.22, ease: 'power2.in' }, 0).to(
        dlg,
        {
          opacity: 0,
          y: 12,
          duration: 0.18,
          ease: 'power3.in',
        },
        0
      );

      if (validTrig && trig) {
        const fitVars = Flip.fit(ghost, trig, {
          scale: true,
          getVars: true,
          duration: 0.3,
          ease: 'power3.in',
        }) as gsap.TweenVars;
        tl.to(ghost, { ...fitVars, opacity: 0 }, 0);
      } else {
        tl.to(
          ghost,
          {
            opacity: 0,
            scaleX: 0.92,
            scaleY: 0.92,
            y: 16,
            duration: 0.3,
            ease: 'power3.in',
          },
          0
        );
      }

      probe('CenterDialogClose', tl);
    }
  }, [isOpen, mounted]);

  useEffect(() => {
    const lockId = modalLockIdRef.current;
    if (!isOpen || !mounted) {
      unlockBodyScroll(lockId);
      return;
    }

    lockBodyScroll(lockId);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const t = window.setTimeout(() => {
      const dlg = dialogRef.current;
      if (!dlg) return;
      // Do not steal focus if user is already focused inside the dialog
      if (document.activeElement && dlg.contains(document.activeElement) && document.activeElement !== dlg) {
        return;
      }
      // Prefer focusing the first form field inside the dialog body, never the header close button first
      const firstInput = bodyRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
      );
      const firstBodyFocusable = bodyRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (firstInput || firstBodyFocusable || dlg).focus();
    }, 50);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener('keydown', handleKeyDown);
      unlockBodyScroll(lockId);
    };
  }, [isOpen, mounted]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-center-dialog="true"
      data-modal-open={isOpen ? 'true' : 'false'}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="fixed inset-0 bg-[#1E2230]/35"
        style={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className={`relative w-full ${maxWidthClass} max-h-[90vh] flex flex-col my-auto`}>
        <div
          ref={ghostRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white rounded-[20px] z-10"
          style={{ opacity: 0, transformOrigin: 'top left' }}
        />
        <div
          ref={dialogRef}
          tabIndex={-1}
          style={{
            opacity: 0,
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.14)',
          }}
          className="relative w-full max-h-[90vh] bg-white rounded-[20px] flex flex-col overflow-hidden"
        >
          <div className="p-5 border-b border-[#EEF0F4] flex items-start justify-between gap-4 shrink-0">
            <div>
              <h2 id={titleId} className="admin-macro-section text-[#1E2230]">
                {title}
              </h2>
              {subtitle && (
                <p className="font-mono text-[13px] text-[#646B7C] mt-0.5">{subtitle}</p>
              )}
            </div>
            {!hideHeaderClose &&
              (closeStyle === 'icon' ? (
                <XIconButton ariaLabel="Tutup" title="Tutup" onClick={onClose} />
              ) : (
                <ActionButton type="button" intent="cancel" onClick={onClose}>
                  Tutup
                </ActionButton>
              ))}
          </div>

          <div ref={bodyRef} className="p-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
            {children}
          </div>

          {footer && (
            <div className="p-4 border-t border-[#EEF0F4] flex items-center justify-end gap-3 shrink-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CenterDialog;

