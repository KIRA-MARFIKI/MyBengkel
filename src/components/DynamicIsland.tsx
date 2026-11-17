import React, { useState, useEffect, useRef, useMemo } from 'react';
import { gsap } from '../lib/gsap';
import { useAuth } from '../lib/mockAuth';

interface NavItem {
  name: string;
  href: string;
  targetId: string;
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { name: 'Home', href: '#top', targetId: 'top' },
  { name: 'About me', href: '#tentang', targetId: 'tentang' },
  { name: 'Booking', href: '#booking', targetId: 'booking' },
];

export const DynamicIsland: React.FC = () => {
  const { isLoggedIn, role } = useAuth();
  const isCustomer = isLoggedIn && role === 'customer';

  const navItems = useMemo<NavItem[]>(() => {
    return DEFAULT_NAV_ITEMS;
  }, []);

  const [activeSection, setActiveSection] = useState<string>('top');
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [manuallyExpanded, setManuallyExpanded] = useState<boolean>(false);
  const [mobileExpanded, setMobileExpanded] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const mobileWrapperRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef<number>(0);

  const activeNavItem = navItems.find((item) => item.targetId === activeSection) || navItems[0];

  useEffect(() => {
    if (!mobileExpanded) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileExpanded(false);
      }
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (mobileWrapperRef.current && !mobileWrapperRef.current.contains(e.target as Node)) {
        setMobileExpanded(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [mobileExpanded]);

  // Scroll detection for compact/expanded states & active section
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const isNearTop = currentScrollY <= 40;
      const isScrollingUp = currentScrollY < lastScrollY.current;

      if (isNearTop) {
        setIsCompact(false);
        setManuallyExpanded(false);
      } else if (isScrollingUp) {
        setIsCompact(false);
      } else if (currentScrollY > 120 && !manuallyExpanded) {
        setIsCompact(true);
      }

      lastScrollY.current = currentScrollY;

      // Determine active section
      const sections = ['booking', 'tentang', 'top'];
      const scrollPosition = currentScrollY + window.innerHeight * 0.4;

      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setActiveSection(id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [manuallyExpanded]);

  // GSAP animation for morphing between expanded pill and compact circle
  useEffect(() => {
    const container = containerRef.current;
    const labels = labelsRef.current;
    const logo = logoRef.current;

    if (!container || !labels || !logo) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = prefersReduced ? 0 : 0.5;

    if (isCompact) {
      // Compact: labels fade out first, then shape shrinks to 56px circle
      if (prefersReduced) {
        gsap.set(labels, { opacity: 0, display: 'none' });
        gsap.set(logo, { opacity: 1, display: 'flex' });
        gsap.set(container, { width: 56, height: 56, padding: '0px' });
      } else {
        const tl = gsap.timeline();
        tl.to(labels, {
          opacity: 0,
          duration: 0.15,
          ease: 'power2.in',
          onComplete: () => {
            labels.style.display = 'none';
            logo.style.display = 'flex';
          },
        })
          .to(container, {
            width: 56,
            height: 56,
            padding: 0,
            duration: 0.35,
            ease: 'power3.out',
          })
          .to(
            logo,
            {
              opacity: 1,
              duration: 0.15,
              ease: 'power2.out',
            },
            '-=0.1'
          );
      }
    } else {
      // Expanded: shape grows, then labels fade in
      if (prefersReduced) {
        gsap.set(logo, { opacity: 0, display: 'none' });
        gsap.set(labels, { opacity: 1, display: 'flex' });
        gsap.set(container, { width: 'auto', height: 52, padding: '0px 24px' });
      } else {
        const tl = gsap.timeline();
        tl.to(logo, {
          opacity: 0,
          duration: 0.12,
          ease: 'power2.in',
          onComplete: () => {
            logo.style.display = 'none';
            labels.style.display = 'flex';
          },
        })
          .to(container, {
            width: 'auto',
            height: 52,
            padding: '0px 24px',
            duration: 0.35,
            ease: 'power3.out',
          })
          .to(
            labels,
            {
              opacity: 1,
              duration: 0.18,
              ease: 'power2.out',
            },
            '-=0.1'
          );
      }
    }
  }, [isCompact]);

  const scrollToSection = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const el = document.getElementById(targetId);
    if (!el) return;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetTop = el.offsetTop;

    window.scrollTo({
      top: targetTop,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });

    setActiveSection(targetId);
  };

  const handleIslandClick = () => {
    if (isCompact) {
      setManuallyExpanded(true);
      setIsCompact(false);
    }
  };

  return (
    <>
      {mobileExpanded && (
        <div
          aria-hidden="true"
          onClick={() => setMobileExpanded(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 md:hidden"
        />
      )}

      <nav
        aria-label="Navigasi utama"
        className="fixed bottom-[20px] left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
      >
        {/* Mobile view (< 768px): Interactive Expandable Dynamic Island */}
        <div ref={mobileWrapperRef} className="md:hidden flex flex-col items-center">
          {mobileExpanded && (
            <div className="w-[92vw] max-w-[360px] mb-2.5 rounded-[24px] bg-carbon/95 backdrop-blur-xl border border-paper/15 p-3.5 shadow-[0_20px_50px_rgba(14,14,12,0.5)] text-paper">
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-2 border-b border-paper/10 px-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-7 h-7 rounded-full bg-paper text-carbon font-condensed font-bold text-xs flex items-center justify-center shrink-0">
                    MB
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-paper/80 truncate">
                    Navigasi Halaman
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileExpanded(false)}
                  aria-label="Tutup navigasi"
                  className="min-w-[44px] min-h-[44px] rounded-full flex items-center justify-center text-paper/75 hover:text-paper hover:bg-paper/10 active:scale-95 transition-all shrink-0 cursor-pointer"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-1.5 mt-2">
                {navItems.map((item) => {
                  const isActive = activeSection === item.targetId;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={(e) => {
                        scrollToSection(e, item.targetId);
                        setMobileExpanded(false);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      className={`min-h-[44px] px-4 py-2.5 rounded-[14px] flex items-center justify-between font-sans text-[14px] transition-colors ${
                        isActive
                          ? 'bg-paper text-carbon font-semibold'
                          : 'bg-paper/[0.06] text-paper/85 hover:bg-paper/[0.12] hover:text-paper font-medium'
                      }`}
                    >
                      <span>{item.name}</span>
                      {isActive && (
                        <span className="w-2 h-2 rounded-full bg-carbon shrink-0" aria-hidden="true" />
                      )}
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setMobileExpanded((prev) => !prev)}
            aria-expanded={mobileExpanded}
            aria-label="Buka menu navigasi Dynamic Island"
            title="Navigasi MyBengkel"
            className="min-h-[48px] px-4 py-2 rounded-full bg-carbon/90 backdrop-blur-md border border-paper/15 shadow-[0_8px_24px_rgba(14,14,12,0.35)] flex items-center gap-2.5 text-paper font-sans active:scale-95 transition-all cursor-pointer"
          >
            <span className="w-7 h-7 rounded-full bg-paper text-carbon font-condensed font-bold text-xs flex items-center justify-center shrink-0">
              MB
            </span>
            <span aria-hidden="true" className="text-paper/50 font-bold">
              &bull;
            </span>
            <span className="text-[13px] font-medium whitespace-nowrap">
              {activeNavItem.name}
            </span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className={`shrink-0 text-paper/75 transition-transform duration-200 ${
                mobileExpanded ? 'rotate-180' : ''
              }`}
            >
              <path d="M4 10L8 6L12 10" />
            </svg>
          </button>
        </div>

        {/* Desktop/Tablet (>= 768px): Morphing Dynamic Island */}
        <div
          ref={containerRef}
          onClick={handleIslandClick}
          style={{
            boxShadow: '0 8px 24px rgba(14,14,12,0.25)',
          }}
          className={`hidden md:flex bg-carbon/80 backdrop-blur-md rounded-[999px] border border-paper/10 items-center justify-center transition-colors cursor-pointer ${
            isCompact ? 'w-[56px] h-[56px]' : 'h-[52px] px-6'
          }`}
        >
          {/* Compact logo "MB" */}
          <div
            ref={logoRef}
            style={{ display: isCompact ? 'flex' : 'none', opacity: isCompact ? 1 : 0 }}
            className="items-center justify-center w-full h-full text-paper font-sans font-medium text-[16px] select-none"
            title="Klik untuk membuka navigasi"
          >
            MB
          </div>

          {/* Expanded Navigation Links */}
          <div
            ref={labelsRef}
            style={{ display: isCompact ? 'none' : 'flex', opacity: isCompact ? 0 : 1 }}
            className="items-center gap-6"
          >
            {navItems.map((item) => {
              const isActive = activeSection === item.targetId;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={(e) => scrollToSection(e, item.targetId)}
                  className={`font-sans font-medium text-[15px] text-paper relative py-1 transition-colors hover:text-paper focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2 ${
                    isActive ? 'border-b-2 border-paper' : 'border-b-2 border-transparent'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {item.name}
                </a>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
};

export default DynamicIsland;

