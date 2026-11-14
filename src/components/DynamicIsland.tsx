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

  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLDivElement>(null);
  const lastScrollY = useRef<number>(0);

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
    <nav
      aria-label="Navigasi utama"
      className="fixed bottom-[20px] left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
    >
      <div
        ref={containerRef}
        onClick={handleIslandClick}
        style={{
          boxShadow: '0 8px 24px rgba(14,14,12,0.25)',
        }}
        className={`bg-carbon/80 backdrop-blur-md rounded-[999px] border border-paper/10 flex items-center justify-center transition-colors cursor-pointer ${
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
  );
};

export default DynamicIsland;

