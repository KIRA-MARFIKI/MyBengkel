import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { siteContent } from '../content/site';
import { gsap } from '../lib/gsap';
import { ArrowRightIcon } from './admin/ActionButton';
import { useAuth } from '../lib/mockAuth';

function getInitials(name?: string, email?: string): string {
  const source = (name && name.trim()) || (email && email.trim()) || '?';
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export const HeroSection: React.FC = () => {
  const heroRef = useRef<HTMLDivElement>(null);
  const { isLoggedIn, role, user, logout } = useAuth();
  const isCustomer = isLoggedIn && role === 'customer' && Boolean(user);

  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ delay: 0.2 });
      tl.fromTo(
        '.hero-line',
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: 'power2.out' }
      )
        .fromTo(
          '#hero-subtitle',
          { y: 20, opacity: 0 },
          { y: 0, opacity: 0.8, duration: 0.5, ease: 'power2.out' },
          '-=0.3'
        )
        .fromTo(
          '#hero-button',
          { y: 16, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
          '-=0.2'
        );
    }, heroRef);

    return () => ctx.revert();
  }, []);

  const scrollToBooking = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const el = document.getElementById('booking');
    if (!el) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({
      top: el.offsetTop,
      behavior: prefersReduced ? 'auto' : 'smooth',
    });
  };

  return (
    <section
      ref={heroRef}
      id="top"
      aria-label="Bagian pembuka"
      className="relative w-full h-[100svh] min-h-[100svh] bg-carbon overflow-hidden flex flex-col justify-between"
    >
      {/* Background with dark vignette at bottom and sides */}
      <div className="absolute inset-0 z-0 pointer-events-none select-none">
        <img
          src="/assets/hero-bg.webp"
          alt="Suasana bengkel MyBengkel"
          width={1920}
          height={1080}
          fetchPriority="high"
          className="w-full h-full object-cover"
        />
        {/* Dark vignette bottom and sides */}
        <div className="absolute inset-0 bg-gradient-to-t from-carbon via-carbon/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-carbon/70 via-transparent to-carbon/70" />
      </div>

      {/* Top Header: Brand on left, Auth controls on right */}
      <header className="relative z-10 w-full px-6 pt-6 md:px-12 md:pt-8 flex items-center justify-between">
        <span className="font-condensed font-bold text-[20px] tracking-normal text-paper select-none">
          {siteContent.brand}
        </span>

        {isCustomer ? (
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-paper/[0.08] border border-steel/60 text-paper">
              <div
                aria-hidden="true"
                className="w-7 h-7 rounded-full bg-signal text-carbon font-condensed font-bold text-xs flex items-center justify-center select-none"
              >
                {getInitials(user?.name, user?.email)}
              </div>
              <span className="font-sans text-sm font-medium text-paper max-w-[120px] sm:max-w-[200px] truncate">
                {user?.name || user?.email}
              </span>
            </div>
            <button
              type="button"
              onClick={logout}
              className="font-sans text-xs font-medium text-paper/80 hover:text-paper px-3 py-1.5 rounded-[4px] border border-steel/50 hover:border-steel bg-transparent hover:bg-paper/[0.06] transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Keluar
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              to="/login"
              className="font-sans text-sm font-medium text-paper/90 hover:text-paper px-3 py-1.5 rounded-[4px] border border-steel/60 hover:border-steel bg-paper/[0.04] hover:bg-paper/[0.08] transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Masuk
            </Link>
            <Link
              to="/register"
              className="font-sans text-sm font-medium text-carbon bg-paper hover:bg-paper/90 px-3.5 py-1.5 rounded-[4px] transition-colors focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
            >
              Daftar
            </Link>
          </div>
        )}
      </header>

      {/* Headline & Subtitle centered */}
      <div className="relative z-10 w-full max-w-[1200px] mx-auto px-4 text-center my-auto flex flex-col items-center">
        <h1
          id="hero-headline"
          className="font-condensed font-bold text-paper tracking-tight max-w-[18ch]"
          style={{
            fontSize: 'clamp(2.75rem, 6vw, 5.5rem)',
            lineHeight: 1.02,
          }}
        >
          <span className="hero-line block">Selamat datang</span>
          <span className="hero-line block">di {siteContent.brand}</span>
        </h1>

        <p
          id="hero-subtitle"
          className="font-sans font-normal text-[20px] text-paper/80 max-w-[36ch] mx-auto mt-4 text-center"
        >
          {siteContent.heroSubtitle}
        </p>

        <div id="hero-button" className="mt-8">
          <a
            href="#booking"
            onClick={scrollToBooking}
            className="inline-flex items-center justify-center gap-2 bg-signal text-carbon font-sans font-medium text-[16px] px-7 py-3 rounded-[4px] min-h-[44px] transition-transform active:scale-[0.98] hover:bg-signal/90 focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
          >
            <span>Booking servis</span>
            <ArrowRightIcon size={16} />
          </a>
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="relative z-10 pb-8" />
    </section>
  );
};

export default HeroSection;
