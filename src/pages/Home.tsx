import React, { useEffect } from 'react';
import HeroSection from '../components/HeroSection';
import AboutSection from '../components/AboutSection';
import BookingSection from '../components/BookingSection';
import Footer from '../components/Footer';
import DynamicIsland from '../components/DynamicIsland';
import { resetBodyScrollIfIdle } from '../components/admin/island/IslandSystem';

export const Home: React.FC = () => {
  useEffect(() => {
    resetBodyScrollIfIdle();
  }, []);

  return (
    <div className="relative min-h-screen bg-carbon text-paper overflow-x-clip">
      {/* Main page content with 120px bottom padding so island never covers content */}
      <main className="relative z-10 pb-[120px]">
        <HeroSection />
        <AboutSection />
        <BookingSection />
        <Footer />
      </main>

      {/* Dynamic Navigation Island (only on Home page) */}
      <DynamicIsland />
    </div>
  );
};

export default Home;

