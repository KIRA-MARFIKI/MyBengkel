import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { gsap, Flip } from '../../lib/gsap';
import { ActionButton, XIconButton } from './ActionButton';
import {
  getLastTriggerElement,
  lockBodyScroll,
  probe,
  unlockBodyScroll,
} from './island/IslandSystem';

interface SidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

// Side panel: white, radius 24 on the left corners, shadow 0 24px 48px rgba(0,0,0,0.12), 440px wide (full width on mobile).
// PanelMorph (Fix 3): Plain rounded rectangle ghost animated from trigger rect to panel rect with Flip.fit (0.42s, power3.out).
// At 55% (0.231s), panel fades in (opacity 0 -> 1, x: 16 -> 0 over 0.25s) while ghost fades out (0.15s).
// Closing reverses in 0.3s with power3.in.
export const SidePanel: React.FC<SidePanelProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  widthClass = 'max-w-[440px]',
}) => {
  const modalLockIdRef = useRef<symbol>(Symbol('SidePanel'));
  const panelRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(isOpen);

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = getLastTriggerElement() || (document.activeElement as HTMLElement);
      setMounted(true);
    }
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!mounted) return;
    const bd = backdropRef.current;
    const p = panelRef.current;
    const ghost = ghostRef.current;
    if (!bd || !p || !ghost) return;

    const restoreTriggerFocus = () => {
      const trig = triggerRef.current;
      if (trig && document.body.contains(trig)) {
        trig.focus();
      }
    };

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.killTweensOf([bd, p, ghost]);

    if (prefersReduced) {
      if (isOpen) {
        gsap.set(bd, { opacity: 1 });
        gsap.set(ghost, { opacity: 0 });
        gsap.set(p, { opacity: 1, x: 0, clearProps: 'willChange,transform' });
      } else {
        setMounted(false);
        restoreTriggerFocus();
      }
      return;
    }

    const trig = triggerRef.current;
    const hasTrig = Boolean(trig && document.body.contains(trig));

    if (isOpen) {
      // Read first
      const pRect = p.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && pRect.width > 0 && pRect.height > 0
      );
      const rawItems = Array.from(
        p.querySelectorAll<HTMLElement>('.panel-body > * > *, .panel-body > *')
      );
      const staggered = rawItems.slice(0, 8);
      const rest = rawItems.slice(8);

      // Write next
      gsap.set(bd, { opacity: 0, willChange: 'opacity' });
      gsap.set(p, { opacity: 0, x: 16, willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });
      if (rest.length > 0) {
        gsap.set(rest, { opacity: 1, y: 0, clearProps: 'willChange' });
      }
      if (staggered.length > 0) {
        gsap.set(staggered, { opacity: 0, y: 8, willChange: 'transform, opacity' });
      }

      if (validTrig && trig) {
        Flip.fit(ghost, trig, { scale: true });
      } else {
        gsap.set(ghost, { scaleX: 0.9, scaleY: 0.9, x: 24 });
      }

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set(bd, { clearProps: 'willChange' });
          gsap.set(ghost, { opacity: 0, clearProps: 'willChange,transform' });
          gsap.set(p, { clearProps: 'willChange,transform,opacity' });
          if (staggered.length > 0) {
            gsap.set(staggered, { clearProps: 'willChange,transform,opacity' });
          }
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
          p,
          {
            opacity: 1,
            x: 0,
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

      if (staggered.length > 0) {
        tl.to(
          staggered,
          {
            opacity: 1,
            y: 0,
            duration: 0.25,
            stagger: 0.03,
            ease: 'power3.out',
          },
          0.25
        );
      }

      probe('SidePanelOpen', tl);
    } else {
      const pRect = p.getBoundingClientRect();
      const tRect = hasTrig && trig ? trig.getBoundingClientRect() : null;
      const validTrig = Boolean(
        tRect && tRect.width > 0 && tRect.height > 0 && pRect.width > 0 && pRect.height > 0
      );

      gsap.set(bd, { willChange: 'opacity' });
      gsap.set(p, { willChange: 'transform, opacity' });
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
          gsap.set([bd, p, ghost], { clearProps: 'willChange,transform,opacity' });
          setMounted(false);
          restoreTriggerFocus();
        },
      });

      tl.to(bd, { opacity: 0, duration: 0.22, ease: 'power2.in' }, 0).to(
        p,
        {
          opacity: 0,
          x: 16,
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
            scaleX: 0.9,
            scaleY: 0.9,
            x: 24,
            duration: 0.3,
            ease: 'power3.in',
          },
          0
        );
      }

      probe('SidePanelClose', tl);
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
        // If a CenterDialog is open on top of this SidePanel, let CenterDialog handle Escape first
        if (document.querySelector('[data-center-dialog="true"][data-modal-open="true"]')) return;
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', handleKeyDown);

    const t = window.setTimeout(() => {
      const p = panelRef.current;
      if (!p) return;
      if (document.activeElement && p.contains(document.activeElement) && document.activeElement !== p) {
        return;
      }
      // Prefer focusing the first form field inside .panel-body, never the header Tutup button first
      const firstInput = bodyRef.current?.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])'
      );
      const firstBodyFocusable = bodyRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
      (firstInput || firstBodyFocusable || p).focus();
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
      aria-labelledby="sidepanel-title"
      data-modal-open={isOpen ? 'true' : 'false'}
      className="admin-sidepanel fixed inset-0 z-50 flex justify-end"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-0 bg-[#1E2230]/30"
        style={{ opacity: 0 }}
        onClick={onClose}
      />
      <div className={`relative w-full ${widthClass} h-full max-h-screen flex flex-col`}>
        <div
          ref={ghostRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white rounded-[20px] sm:rounded-l-[24px] z-10"
          style={{ opacity: 0, transformOrigin: 'top left' }}
        />
        <div
          ref={panelRef}
          tabIndex={-1}
          style={{
            opacity: 0,
            boxShadow: '0 24px 48px rgba(0, 0, 0, 0.12)',
          }}
          className="relative w-full h-full max-h-screen bg-white sm:rounded-l-[24px] flex flex-col overflow-hidden"
        >
          <div className="p-5 border-b border-[#EEF0F4] flex items-start justify-between gap-4 shrink-0">
            <div>
              <h2 id="sidepanel-title" className="admin-macro-section">
                {title}
              </h2>
              {description && (
                <p className="font-sans font-normal text-[14px] text-[#646B7C] mt-1">
                  {description}
                </p>
              )}
            </div>
            <XIconButton ariaLabel="Tutup" title="Tutup" onClick={onClose} />
          </div>

          <div ref={bodyRef} className="panel-body p-5 flex-1 min-h-0 overflow-y-auto overscroll-contain">
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

export default SidePanel;
