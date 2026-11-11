import React from 'react';
import { siteContent } from '../content/site';

export const AboutSection: React.FC = () => {
  return (
    <section
      id="tentang"
      aria-label="Tentang MyBengkel"
      className="relative w-full min-h-[100vh] bg-paper text-carbon flex flex-col justify-center py-28 z-10"
    >
      <div className="w-full max-w-[1200px] mx-auto px-6">
        {/* Content restricted to center 60% of viewport width (max 60ch) */}
        <div className="w-full max-w-[60ch] mx-auto text-left">
          <h2
            data-aos="fade-up"
            className="font-condensed font-semibold text-[36px] md:text-[48px] text-carbon tracking-tight leading-tight mb-6"
          >
            Tentang {siteContent.brand}
          </h2>

          <p
            data-aos="fade-up"
            data-aos-delay="80"
            className="font-sans font-normal text-[20px] text-carbon leading-[1.6] mb-12"
          >
            {siteContent.aboutText}
          </p>

          {/* Facts list with 1px steel top border, no cards, no icons */}
          <div className="w-full border-b border-steel/40">
            {siteContent.aboutFacts.map((fact, index) => (
              <div
                key={index}
                data-aos="fade-up"
                data-aos-delay={160 + index * 80}
                className="border-t border-steel py-4 flex items-center justify-between"
              >
                <span className="font-sans font-normal text-[16px] text-carbon">
                  {fact}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;

