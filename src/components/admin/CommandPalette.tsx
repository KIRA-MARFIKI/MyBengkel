import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from '../../lib/gsap';
import { useAdmin } from '../../context/AdminContext';
import { useAuth } from '../../lib/mockAuth';
import {
  EyeIcon,
  LogOutIcon,
  PlusIcon,
  SearchIcon,
  XIconButton,
} from './ActionButton';

interface Item {
  id: string;
  group: 'Halaman' | 'Aksi' | 'Cari';
  label: string;
  hint?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const PAGES: { label: string; to: string }[] = [
  { label: 'Perlu ditangani', to: '/admin' },
  { label: 'Booking', to: '/admin/v1/booking' },
  { label: 'Service Form', to: '/admin/v1/service-forms' },
  { label: 'Work Order', to: '/admin/v1/work-orders' },
  { label: 'Absen Mekanik', to: '/admin/v1/attendance' },
  { label: 'Laporan Servis', to: '/admin/laporan/servis' },
  { label: 'Permintaan Penyediaan', to: '/admin/v2/purchase-requests' },
  { label: 'Pengelolaan Gudang', to: '/admin/v2/warehouse' },
  { label: 'Input Manual', to: '/admin/v2/manual-entries' },
  { label: 'Master Gudang', to: '/admin/v2/master-gudang' },
  { label: 'Penjualan', to: '/admin/penjualan' },
  { label: 'Laporan Gudang', to: '/admin/laporan/gudang' },
  { label: 'Laporan Penjualan', to: '/admin/laporan/penjualan' },
  { label: 'Help Desk', to: '/admin/helpdesk' },
];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose }) => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { vehicles, customers } = useAdmin();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  const q = query.trim().toLowerCase();

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => navigate(to);
    const pages: Item[] = PAGES.filter((p) => !q || p.label.toLowerCase().includes(q)).map((p) => ({
      id: `page-${p.to}`,
      group: 'Halaman',
      label: p.label,
      run: go(p.to),
    }));

    const actions: Item[] = (
      [
        { label: 'Booking baru', run: go('/admin/v1/booking?new=1') },
        { label: 'Lihat booking menunggu', run: go('/admin/v1/booking?status=menunggu') },
        { label: 'Lihat part stok kritis', run: go('/admin/v2/warehouse?view=part&filter=low') },
        {
          label: 'Keluar',
          run: () => {
            logout();
            navigate('/login');
          },
        },
      ] as { label: string; run: () => void }[]
    )
      .filter((a) => !q || a.label.toLowerCase().includes(q))
      .map((a) => ({ id: `act-${a.label}`, group: 'Aksi', label: a.label, run: a.run }));

    let found: Item[] = [];
    if (q) {
      const byPlate = vehicles
        .filter((v) => v.plate.toLowerCase().includes(q))
        .map((v) => {
          const c = customers.find((x) => x.id === v.customerId);
          return {
            id: `veh-${v.plate}`,
            group: 'Cari' as const,
            label: v.plate,
            hint: `${v.brand} ${v.model}${c ? `, ${c.name}` : ''}`,
            run: go(`/admin/v1/booking?q=${encodeURIComponent(v.plate)}`),
          };
        });
      const byName = customers
        .filter((c) => c.name.toLowerCase().includes(q))
        .map((c) => ({
          id: `cus-${c.id}`,
          group: 'Cari' as const,
          label: c.name,
          hint: c.phone,
          run: go(`/admin/v1/booking?q=${encodeURIComponent(c.name)}`),
        }));
      found = [...byPlate, ...byName].slice(0, 6);
    }
    return [...pages, ...actions, ...found];
  }, [q, vehicles, customers, navigate, logout]);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement;
    setQuery('');
    setActive(0);
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(t);
      openerRef.current?.focus();
    };
  }, [open]);

  useEffect(() => setActive(0), [q]);

  useLayoutEffect(() => {
    if (!open) return;
    const box = boxRef.current;
    const bd = backdropRef.current;
    if (!box || !bd) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gsap.fromTo(bd, { opacity: 0 }, { opacity: 1, duration: 0.2, ease: 'power2.out' });
    gsap.fromTo(
      box,
      { scale: 0.98, opacity: 0, transformOrigin: 'top center' },
      { scale: 1, opacity: 1, duration: 0.2, ease: 'power3.out' }
    );
  }, [open]);

  useEffect(() => {
    document.getElementById(`cmd-opt-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const run = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const listLength = items?.length ?? 0;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (listLength > 0 ? (a + 1) % listLength : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (listLength > 0 ? (a - 1 + listLength) % listLength : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (items && listLength > 0 && items[active]) {
        run(items[active]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const groups: Item['group'][] = ['Halaman', 'Aksi', 'Cari'];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[15vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Perintah cepat"
      onKeyDown={onKeyDown}
    >
      <div
        ref={backdropRef}
        aria-hidden="true"
        className="absolute inset-0 bg-[#1E2230]/30"
        onClick={onClose}
      />
      <div
        ref={boxRef}
        className="relative w-full max-w-[560px] bg-white rounded-[20px] shadow-[0_24px_48px_rgba(0,0,0,0.12)] overflow-hidden"
      >
        <div className="relative flex items-center border-b border-[#EEF0F4] px-4">
          <span className="text-[#646B7C] mr-3 shrink-0" aria-hidden="true">
            <SearchIcon size={18} />
          </span>
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={items?.length ? `cmd-opt-${active}` : undefined}
            aria-label="Cari halaman, aksi, plat, atau nama"
            placeholder="Cari halaman, aksi, plat, atau nama..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full min-h-[52px] border-0 bg-transparent text-[#1E2230] text-[16px] md:text-[14px] focus:outline-none"
          />
          <XIconButton
            ariaLabel="Tutup (Esc)"
            title="Tutup (Esc)"
            onClick={onClose}
            className="!w-7 !h-7 !min-w-[28px] !min-h-[28px] !rounded-[8px] ml-2 shrink-0"
          />
        </div>

        <div id="cmd-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && (
            <p className="p-4 text-[#646B7C]">Tidak ada hasil untuk "{query.trim()}". Coba plat atau nama lain.</p>
          )}
          {groups.map((g) => {
            const list = items.filter((i) => i.group === g);
            if (list.length === 0) return null;
            return (
              <div key={g} role="group" aria-label={g}>
                <p className="px-3 pt-3 pb-1 admin-micro text-[#646B7C]">{g}</p>
                {list.map((item) => {
                  const idx = items.indexOf(item);
                  const isActive = idx === active;
                  return (
                    <div
                      key={item.id}
                      id={`cmd-opt-${idx}`}
                      role="option"
                      aria-selected={isActive}
                      onMouseMove={() => setActive(idx)}
                      onClick={() => run(item)}
                      className={`flex items-center justify-between gap-4 px-3 min-h-[44px] rounded-[12px] cursor-pointer transition-colors ${
                        isActive ? 'bg-[#1E2230] text-white' : 'text-[#1E2230] hover:bg-[#F6F7FA]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 ${isActive ? 'text-white/80' : 'text-[#646B7C]'}`} aria-hidden="true">
                          {item.id.includes('act-Keluar') ? (
                            <LogOutIcon size={16} />
                          ) : item.id.includes('act-Booking baru') ? (
                            <PlusIcon size={16} />
                          ) : item.id.includes('act-') ? (
                            <EyeIcon size={16} />
                          ) : item.group === 'Cari' ? (
                            <SearchIcon size={16} />
                          ) : (
                            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="2.5" width="12" height="13" rx="2" />
                              <path d="M6 6H12M6 9H12M6 12H9" />
                            </svg>
                          )}
                        </span>
                        <span className={`truncate ${item.group === 'Cari' && item.hint ? 'font-mono font-medium' : ''}`}>{item.label}</span>
                      </div>
                      {item.hint && (
                        <span className={`text-[12px] shrink-0 ${isActive ? 'text-white/80' : 'text-[#646B7C]'}`}>
                          {item.hint}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="flex gap-4 px-4 py-3 border-t border-[#EEF0F4] text-[12px] text-[#646B7C]">
          <span>
            <kbd className="admin-keycap">Panah</kbd> pilih
          </span>
          <span>
            <kbd className="admin-keycap">Enter</kbd> jalankan
          </span>
          <span>
            <kbd className="admin-keycap">Esc</kbd> tutup
          </span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
