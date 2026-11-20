import React, { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, formatRoleBadgeLabel } from '../lib/mockAuth';
import { deriveFiveDigitPin } from '../lib/mockCredentials';
import { useActionCounts } from '../lib/actionCounts';
import { ActionButton, EyeIcon, EyeOffIcon } from '../components/admin/ActionButton';
import { CommandPalette } from '../components/admin/CommandPalette';
import SecuritySetupModal from '../components/admin/SecuritySetupModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import {
  ActionIslandProvider,
  NavIsland,
  resetBodyScrollIfIdle,
  RollingNumber,
  RouteTransition,
  TabIsland,
} from '../components/admin/island/IslandSystem';

type TopNavId = 'dashboard' | 'servis' | 'gudang' | 'penjualan' | 'laporan' | 'helpdesk';

interface TabDef {
  label: string;
  path: string;
}

const V1_TABS: TabDef[] = [
  { label: 'Booking', path: '/admin/v1/booking' },
  { label: 'Service Form', path: '/admin/v1/service-forms' },
  { label: 'Work Order', path: '/admin/v1/work-orders' },
  { label: 'Absen Mekanik', path: '/admin/v1/attendance' },
  { label: 'Laporan', path: '/admin/laporan/servis' },
];

const V2_TABS: TabDef[] = [
  { label: 'Permintaan Penyediaan', path: '/admin/v2/purchase-requests' },
  { label: 'Pengelolaan Gudang', path: '/admin/v2/warehouse' },
  { label: 'Input Manual', path: '/admin/v2/manual-entries' },
  { label: 'Master Gudang', path: '/admin/v2/master-gudang' },
  { label: 'Laporan', path: '/admin/laporan/gudang' },
];

const LAPORAN_TABS: TabDef[] = [
  { label: 'Semua Laporan', path: '/admin/laporan' },
  { label: 'Laporan Servis', path: '/admin/laporan/servis' },
  { label: 'Laporan Penjualan', path: '/admin/laporan/penjualan' },
  { label: 'Laporan Gudang', path: '/admin/laporan/gudang' },
];

function resolveTopNav(pathname: string): TopNavId {
  if (pathname.startsWith('/admin/laporan')) return 'laporan';
  if (pathname.startsWith('/admin/penjualan') || pathname.startsWith('/admin/v2/sales')) return 'penjualan';
  if (pathname.startsWith('/admin/v1')) return 'servis';
  if (pathname.startsWith('/admin/v2')) return 'gudang';
  if (pathname.startsWith('/admin/helpdesk')) return 'helpdesk';
  return 'dashboard';
}

const NavIcon: React.FC<{ id: TopNavId }> = ({ id }) => {
  switch (id) {
    case 'dashboard':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2.5L2.5 9H4.8V17H8.5V12.2H11.5V17H15.2V9H17.5L10 2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'servis':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="2.8" y="4" width="14.4" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M2.8 8H17.2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'gudang':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M10 2.4L3 5.9V14.1L10 17.6L17 14.1V5.9L10 2.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M3 5.9L10 9.4L17 5.9M10 9.4V17.6" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'penjualan':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3.8" y="6.5" width="12.4" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7.2 6.5V5C7.2 3.5 8.4 2.3 10 2.3C11.6 2.3 12.8 3.5 12.8 5V6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'laporan':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="4" y="2.8" width="12" height="14.4" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M7 7.2H13M7 10.2H13M7 13.2H10.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'helpdesk':
      return (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M4 11V9.2C4 5.9 6.7 3.2 10 3.2C13.3 3.2 16 5.9 16 9.2V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="2.4" y="10.5" width="3.2" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
          <rect x="14.4" y="10.5" width="3.2" height="5" rx="1.2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
};

const TOP_ITEMS: { id: TopNavId; label: string; to: string }[] = [
  { id: 'dashboard', label: 'Dashboard', to: '/admin' },
  { id: 'servis', label: 'Servis', to: '/admin/v1/booking' },
  { id: 'gudang', label: 'Gudang', to: '/admin/v2/purchase-requests' },
  { id: 'penjualan', label: 'Penjualan', to: '/admin/penjualan' },
  { id: 'laporan', label: 'Laporan', to: '/admin/laporan' },
  { id: 'helpdesk', label: 'Helpdesk Center', to: '/admin/helpdesk' },
];

const AdminShell: React.FC = () => {
  const { role, user, logout, securitySetup, refreshSecurityStatus } = useAuth();
  const isHelpdeskOnly = role === 'master_helpdesk';
  const isPrivileged = role === 'admin' || role === 'master_admin' || role === 'master_helpdesk';
  const showSecurityModal = isPrivileged && securitySetup.mustCompleteSetup;

  useEffect(() => {
    if (!isPrivileged) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('step') === 'pin') return;
    void refreshSecurityStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPrivileged, user?.email]);
  const visibleTopItems = isHelpdeskOnly
    ? TOP_ITEMS
    : TOP_ITEMS.filter((item) => item.id !== 'helpdesk');
  const resolvedRoleCode =
    user?.roleCode ||
    (role === 'master_helpdesk' ? 'HD-001' : role === 'master_admin' ? 'MG-001' : 'AD-001');
  const resolvedPin5 =
    user?.pin5 || (user?.pin && user.pin !== '123456789012' ? deriveFiveDigitPin(user.pin) : '');
  const roleBadgeLabel = formatRoleBadgeLabel(role, resolvedRoleCode);
  const navigate = useNavigate();
  const location = useLocation();
  const counts = useActionCounts();

  const [avatarOpen, setAvatarOpen] = useState(false);
  const [showProfilePin5, setShowProfilePin5] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const avatarWrapRef = useRef<HTMLDivElement>(null);
  const topNavContainerRef = useRef<HTMLDivElement>(null);
  const mobileNavRef = useRef<HTMLElement>(null);

  const activeTop = resolveTopNav(location.pathname);
  const activeTopItem = visibleTopItems.find((item) => item.id === activeTop) || visibleTopItems[0];
  const isV1 = location.pathname.startsWith('/admin/v1');
  const isV2 = activeTop === 'gudang';
  const isLaporan = location.pathname.startsWith('/admin/laporan');
  const rawSubTabs = isV1 ? V1_TABS : isV2 ? V2_TABS : isLaporan ? LAPORAN_TABS : [];
  const subTabs = rawSubTabs.filter((t) => {
    // Master Admin / Master Gudang and Master Helpdesk must NOT see Service Form
    if (isV1 && role !== 'admin' && t.path === '/admin/v1/service-forms') {
      return false;
    }
    // Admin only has view + request access in Gudang (no Input Manual write adjustment tab)
    if (isV2 && role === 'admin' && t.path === '/admin/v2/manual-entries') {
      return false;
    }
    return true;
  });

  useEffect(() => {
    resetBodyScrollIfIdle();
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMobileNavOpen(false);
      }
    };
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (mobileNavRef.current && !mobileNavRef.current.contains(e.target as Node)) {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  useEffect(() => {
    if (!avatarOpen) {
      setShowProfilePin5(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setAvatarOpen(false);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (avatarWrapRef.current && !avatarWrapRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [avatarOpen]);

  const handleLogout = () => {
    setAvatarOpen(false);
    logout();
    navigate('/login');
  };

  const bellLabel = `Perlu ditangani: ${counts.total} item`;
  const ticketLabel = `Tiket Help Desk terbuka: ${counts.ticket}`;
  const accountLabel = 'Menu akun admin';

  return (
    <div className="admin-theme min-h-screen font-sans bg-[#EEF0F4] text-[#1E2230]">
      <div className="max-w-[1360px] mx-auto px-3 pb-24 md:pb-8 pt-3 sm:px-4 sm:pt-4 md:px-6">
        <header
          data-admin-topbar
          className="topbar relative rounded-[20px] md:rounded-[24px] min-h-[64px] md:min-h-[72px] bg-white shadow-[0_10px_30px_rgba(0,0,0,0.04)] flex flex-nowrap md:flex-wrap items-center justify-between gap-2 sm:gap-3 px-3 sm:px-4 py-2"
        >
          {/* Mobile (< 768px): Compact left brand & active section title */}
          <div className="flex items-center gap-2.5 min-w-0 flex-1 md:hidden">
            <span className="w-9 h-9 rounded-[10px] bg-[#1E2230] text-[#FFBD59] font-condensed font-bold text-sm flex items-center justify-center shrink-0">
              MB
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-medium text-[#646B7C] leading-none truncate">
                {roleBadgeLabel}
              </div>
              <div className="text-[15px] font-semibold text-[#1E2230] leading-tight truncate mt-0.5">
                {activeTopItem?.label || 'Dashboard'}
              </div>
            </div>
          </div>

          <nav aria-label="Navigasi utama" className="hidden md:block flex-1 min-w-0 overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <div ref={topNavContainerRef} className="relative inline-flex items-stretch min-h-[56px]">
              <NavIsland containerRef={topNavContainerRef} activeKey={activeTop} />
              {visibleTopItems.map((item, idx) => {
                const active = activeTop === item.id;
                return (
                  <React.Fragment key={item.id}>
                    {idx > 0 && (
                      <span aria-hidden="true" className="self-center h-8 w-px bg-[#EEF0F4]" />
                    )}
                    <Link
                      to={item.to}
                      data-island-key={item.id}
                      aria-current={active ? 'page' : undefined}
                      className={`relative z-10 flex flex-col items-center justify-center gap-1 px-3.5 sm:px-5 py-1.5 rounded-[12px] no-underline transition-colors duration-200 ${
                        active ? 'text-[#1E2230] font-semibold' : 'text-[#646B7C] font-medium hover:text-[#1E2230]'
                      }`}
                    >
                      <NavIcon id={item.id} />
                      <span data-island-label className="text-[12px] sm:text-[13px] leading-tight whitespace-nowrap">
                        {item.label}
                      </span>
                    </Link>
                  </React.Fragment>
                );
              })}
            </div>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 ml-auto bg-white rounded-full px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.08)] border border-[#EEF0F4]">
            <span className="hidden lg:inline-flex items-center px-2.5 py-1 rounded-full bg-[#F6F7FA] border border-[#EEF0F4] text-[11px] font-semibold text-[#1E2230] whitespace-nowrap">
              {roleBadgeLabel}
            </span>

            <Link
              to="/admin"
              aria-label={bellLabel}
              title={bellLabel}
              className="relative inline-flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-full text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] no-underline transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M10 2.5C7.1 2.5 4.8 4.8 4.8 7.7V11.3L3.2 13.3V14.4H16.8V13.3L15.2 11.3V7.7C15.2 4.8 12.9 2.5 10 2.5Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <path d="M8.2 15C8.5 16 9.2 16.6 10 16.6C10.8 16.6 11.5 16 11.8 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <data
                value={counts.total}
                aria-hidden="true"
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F2466F] text-white font-sans text-[11px] font-semibold flex items-center justify-center leading-none tabular-nums"
              >
                <RollingNumber value={counts.total} />
              </data>
            </Link>

            {isHelpdeskOnly && (
              <Link
                to="/admin/helpdesk"
                aria-label={ticketLabel}
                title={ticketLabel}
                className="relative inline-flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-full text-[#646B7C] hover:text-[#1E2230] hover:bg-[#F6F7FA] no-underline transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <rect x="2.5" y="4.5" width="15" height="11" rx="2" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M3 5L10 10.5L17 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <data
                  value={counts.ticket}
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#F2466F] text-white font-sans text-[11px] font-semibold flex items-center justify-center leading-none tabular-nums"
                >
                  <RollingNumber value={counts.ticket} />
                </data>
              </Link>
            )}

            <div ref={avatarWrapRef} className="relative">
              <button
                type="button"
                aria-label={accountLabel}
                title={accountLabel}
                aria-haspopup="menu"
                aria-expanded={avatarOpen}
                onClick={() => setAvatarOpen((o) => !o)}
                className="inline-flex items-center justify-center w-11 h-11 md:w-9 md:h-9 rounded-[12px] bg-[#FFBD59] text-[#1E2230] cursor-pointer transition-transform active:scale-95"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <circle cx="10" cy="6.8" r="3" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M4 16.5C4 13.5 6.6 11.8 10 11.8C13.4 11.8 16 13.5 16 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </button>

              {avatarOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 z-50 min-w-[205px] bg-white rounded-[14px] border border-[#EEF0F4] shadow-[0_10px_30px_rgba(0,0,0,0.08)] p-2 space-y-2"
                >
                  <div className="px-2 py-1 border-b border-[#EEF0F4]">
                    <div className="text-xs font-semibold text-[#1E2230]">
                      {user?.name || (isHelpdeskOnly ? 'Master Helpdesk' : 'Admin Bengkel')}
                    </div>
                    <div className="text-[11px] text-[#646B7C] truncate">{user?.email}</div>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          isHelpdeskOnly
                            ? 'bg-[#3DA5F5]/10 text-[#1D6FC4]'
                            : role === 'master_admin'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-[#FFBD59]/20 text-[#B45309]'
                        }`}
                      >
                        {roleBadgeLabel}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded bg-[#F6F7FA] border border-[#EEF0F4] text-[10px] font-mono font-semibold text-[#1E2230]">
                        ID Akun: {resolvedRoleCode}
                      </span>
                    </div>
                    {isPrivileged && !showSecurityModal && resolvedPin5 && (
                      <div className="mt-1.5 flex items-center justify-between gap-2 px-1.5 py-1 rounded bg-[#F6F7FA] border border-[#EEF0F4] text-[10px] text-[#646B7C]">
                        <span>
                          PIN 5 Angka:{' '}
                          <strong className="font-mono text-[#1E2230] tracking-wider">
                            {showProfilePin5 ? resolvedPin5 : '•••••'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowProfilePin5((v) => !v);
                          }}
                          aria-label={showProfilePin5 ? 'Sembunyikan PIN 5 angka' : 'Tampilkan PIN 5 angka'}
                          className="p-0.5 text-[#646B7C] hover:text-[#1E2230] cursor-pointer"
                        >
                          {showProfilePin5 ? <EyeOffIcon size={12} /> : <EyeIcon size={12} />}
                        </button>
                      </div>
                    )}
                  </div>

                  <ActionButton
                    intent="cancel"
                    onClick={handleLogout}
                    className="w-full justify-start text-xs"
                  >
                    Keluar
                  </ActionButton>
                </div>
              )}
            </div>
          </div>
        </header>

        {subTabs.length > 0 && (
          <SubModuleBar
            key={isV1 ? 'v1' : isV2 ? 'v2' : 'laporan'}
            tabs={subTabs}
            currentPath={location.pathname}
          />
        )}

        <main className="mt-5">
          {showSecurityModal ? (
            <div
              aria-hidden="true"
              className="min-h-[60vh] rounded-[16px] border border-[#D9DDE6] bg-white/70 p-8 text-center flex flex-col items-center justify-center gap-2 pointer-events-none select-none"
            >
              <div className="text-sm font-semibold text-[#1E2230]">
                Akses Dashboard Terkunci
              </div>
              <div className="text-xs text-[#646B7C]">
                Selesaikan seluruh 3 langkah keamanan akun wajib pada jendela verifikasi untuk membuka modul operasional.
              </div>
            </div>
          ) : (
            <RouteTransition routeKey={location.pathname}>
              <ErrorBoundary fallbackTitle="Modul Mengalami Kendala">
                <Outlet />
              </ErrorBoundary>
            </RouteTransition>
          )}
        </main>
      </div>

      {/* Mobile (< 768px): Interactive Dynamic Island Navigation */}
      {mobileNavOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40 md:hidden"
        />
      )}

      <nav
        ref={mobileNavRef}
        aria-label="Navigasi mobile Dynamic Island"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 md:hidden flex flex-col items-center pointer-events-auto"
      >
        {mobileNavOpen && (
          <div className="w-[92vw] max-w-[360px] mb-2.5 rounded-[24px] bg-[#1E2230]/95 backdrop-blur-xl text-white p-3.5 shadow-[0_20px_50px_rgba(14,14,12,0.45)] border border-white/15">
            <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-white/10 px-1">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[#FFBD59] text-[#1E2230] font-condensed font-bold text-xs flex items-center justify-center shrink-0">
                  MB
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-white/80 truncate">
                  Menu Navigasi
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Tutup menu navigasi"
                className="w-11 h-11 rounded-full flex items-center justify-center text-white/75 hover:text-white hover:bg-white/10 active:scale-95 transition-all shrink-0 cursor-pointer"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" />
                </svg>
              </button>
            </div>

            <div className={visibleTopItems.length === 1 ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-2 gap-2'}>
              {visibleTopItems.map((item) => {
                const active = activeTop === item.id;
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    onClick={() => setMobileNavOpen(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`min-h-[48px] px-3 py-2.5 rounded-[14px] flex items-center gap-2.5 no-underline transition-all text-[13px] ${
                      active
                        ? 'bg-[#FFBD59] text-[#1E2230] font-semibold shadow-sm'
                        : 'bg-white/[0.07] text-white/85 hover:bg-white/[0.14] hover:text-white font-medium'
                    }`}
                  >
                    <span className="shrink-0">
                      <NavIcon id={item.id} />
                    </span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-expanded={mobileNavOpen}
          aria-label="Buka menu navigasi Dynamic Island"
          className="min-h-[48px] px-4 py-2 rounded-full bg-[#1E2230]/95 backdrop-blur-md text-white shadow-[0_12px_32px_rgba(30,34,48,0.32)] border border-white/15 flex items-center gap-2.5 active:scale-95 transition-all cursor-pointer"
        >
          <span className="w-7 h-7 rounded-full bg-[#FFBD59] text-[#1E2230] font-condensed font-bold text-xs flex items-center justify-center shrink-0">
            MB
          </span>
          <span aria-hidden="true" className="text-white/50 font-bold">
            &bull;
          </span>
          <span className="flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap">
            <NavIcon id={activeTop} />
            <span>{activeTopItem?.label || 'Dashboard'}</span>
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
            className={`shrink-0 text-white/75 transition-transform duration-200 ${
              mobileNavOpen ? 'rotate-180' : ''
            }`}
          >
            <path d="M4 10L8 6L12 10" />
          </svg>
        </button>
      </nav>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      {showSecurityModal && <SecuritySetupModal isOpen={true} />}
    </div>
  );
};

const SubModuleBar: React.FC<{ tabs: TabDef[]; currentPath: string }> = ({ tabs, currentPath }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Exact match first, otherwise longest matching prefix
  let activeIdx = tabs.findIndex((t) => t.path === currentPath);
  if (activeIdx < 0) {
    let maxLen = -1;
    tabs.forEach((t, i) => {
      if (currentPath.startsWith(t.path) && t.path.length > maxLen) {
        maxLen = t.path.length;
        activeIdx = i;
      }
    });
  }
  if (activeIdx < 0) activeIdx = 0;
  const activePath = tabs[activeIdx]?.path ?? tabs[0].path;

  return (
    <nav aria-label="Submenu modul" className="mt-4 md:overflow-x-auto">
      {/* Mobile (< 768px): 2-column symmetrical grid so no sub-tab clips at the edge */}
      <div className="grid grid-cols-2 gap-2 md:hidden">
        {tabs.map((t, i) => {
          const active = i === activeIdx;
          const isLastOdd = tabs.length % 2 === 1 && i === tabs.length - 1;
          return (
            <Link
              key={t.path}
              to={t.path}
              aria-current={active ? 'page' : undefined}
              className={`shrink-0 min-h-[42px] px-4 py-2 rounded-[12px] inline-flex items-center justify-center text-center font-sans text-[13px] no-underline transition-colors ${
                isLastOdd ? 'col-span-2' : ''
              } ${
                active
                  ? 'bg-[#1E2230] text-white border border-[#1E2230] font-semibold shadow-sm'
                  : 'bg-white text-[#1E2230] border border-[#D9DDE6] font-medium hover:bg-[#F6F7FA]'
              }`}
            >
              <span className="truncate">{t.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Desktop/Tablet (>= 768px): Animated TabIsland strip */}
      <div ref={containerRef} className="relative hidden md:inline-flex items-center gap-2 p-0.5">
        <TabIsland containerRef={containerRef} activeKey={activePath} />
        {tabs.map((t, i) => {
          const active = i === activeIdx;
          return (
            <Link
              key={t.path}
              to={t.path}
              data-island-key={t.path}
              aria-current={active ? 'page' : undefined}
              className={`admin-tab-btn relative z-10 ${
                active
                  ? 'bg-[#1E2230] text-white border border-[#1E2230] shadow-sm font-semibold'
                  : 'bg-white text-[#1E2230] border border-[#D9DDE6] hover:bg-[#F6F7FA] font-medium'
              }`}
            >
              <span data-island-label className="relative z-10">
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};

const AdminLayout: React.FC = () => (
  <ActionIslandProvider>
    <AdminShell />
  </ActionIslandProvider>
);

export default AdminLayout;
