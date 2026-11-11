import React from 'react';
import { Link } from 'react-router-dom';
import { siteContent } from '../content/site';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id="footer"
      aria-label="Informasi kontak dan footer"
      className="relative w-full bg-paper text-carbon border-t border-steel pt-16 pb-[140px] z-10"
    >
      <div className="w-full max-w-[1200px] mx-auto px-6">
        {/* Three columns on desktop, one column on mobile in the same order */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
          {/* Left Column: Brand & Address */}
          <div>
            <span className="font-condensed font-semibold text-[28px] text-carbon block leading-tight">
              {siteContent.brand}
            </span>
            <p className="font-sans text-sm text-muted mt-3 leading-relaxed">
              {siteContent.address}
            </p>
          </div>

          {/* Middle Column: Hours & WhatsApp */}
          <div>
            <div className="mb-4">
              <span className="font-sans font-semibold text-xs text-muted block mb-1">
                Jam operasional
              </span>
              <p className="font-sans text-sm text-carbon">{siteContent.hours}</p>
            </div>
            <div>
              <span className="font-sans font-semibold text-xs text-muted block mb-1">
                WhatsApp
              </span>
              <p className="font-sans text-sm text-carbon">{siteContent.whatsappNumber}</p>
            </div>
          </div>

          {/* Right Column: Links Masuk and Daftar */}
          <div>
            <span className="font-sans font-semibold text-xs text-muted block mb-3">
              Akun pelanggan
            </span>
            <div className="flex flex-col gap-2">
              <Link
                to="/login"
                className="font-sans text-sm text-carbon hover:text-carbon underline underline-offset-4 w-fit focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              >
                Masuk
              </Link>
              <Link
                to="/register"
                className="font-sans text-sm text-carbon hover:text-carbon underline underline-offset-4 w-fit focus-visible:outline-2 focus-visible:outline-signal focus-visible:outline-offset-2"
              >
                Daftar
              </Link>
            </div>
          </div>
        </div>

        {/* Below columns: Syarat dan ketentuan & Kebijakan privasi */}
        <div className="mt-12 pt-6 border-t border-steel/30 flex flex-wrap gap-6 text-sm text-muted">
          <span className="cursor-not-allowed select-none">
            Syarat dan ketentuan (Segera hadir)
          </span>
          <span className="cursor-not-allowed select-none">
            Kebijakan privasi (Segera hadir)
          </span>
        </div>

        {/* Above copyright: one line with heroSubtitle */}
        <div className="mt-6 text-sm text-muted font-sans">
          <p>{siteContent.heroSubtitle}</p>
        </div>

        {/* Copyright */}
        <div className="mt-3 text-xs text-muted font-sans">
          <p>© {currentYear} {siteContent.brand}</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
