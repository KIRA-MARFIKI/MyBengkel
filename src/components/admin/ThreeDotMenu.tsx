import React, { useEffect, useRef, useState } from 'react';
import { DownloadIcon, IconActionButton, PlusIcon, PrinterIcon, XIcon } from './ActionButton';

export interface MenuAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

interface ThreeDotMenuProps {
  actions: MenuAction[];
  ariaLabel?: string;
}

function getActionIcon(label: string): React.ReactNode | null {
  const l = label.toLowerCase();
  if (l.includes('unduh') || l.includes('csv') || l.includes('export')) return <DownloadIcon size={14} />;
  if (l.includes('cetak') || l.includes('print')) return <PrinterIcon size={14} />;
  if (l.includes('hapus') || l.includes('batal')) return <XIcon size={14} />;
  if (l.includes('tambah')) return <PlusIcon size={14} />;
  return null;
}

// Icon button: 36px square, radius 10, aria-label and title.
export const ThreeDotMenu: React.FC<ThreeDotMenuProps> = ({
  actions,
  ariaLabel = 'Opsi bagian',
}) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <IconActionButton
        intent="neutral"
        ariaLabel={ariaLabel}
        title={ariaLabel}
        ariaHaspopup="menu"
        ariaExpanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="9" cy="4" r="1.4" fill="currentColor" />
          <circle cx="9" cy="9" r="1.4" fill="currentColor" />
          <circle cx="9" cy="14" r="1.4" fill="currentColor" />
        </svg>
      </IconActionButton>

      {open && (
        <div
          role="menu"
          style={{ boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08)' }}
          className="absolute right-0 top-full mt-1.5 z-30 min-w-[170px] bg-white rounded-[12px] border border-[#EEF0F4] p-1.5"
        >
          {actions.slice(0, 5).map((act) => {
            const icon = act.icon || getActionIcon(act.label);
            return (
              <button
                key={act.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  act.onClick();
                }}
                className="w-full text-left px-3 min-h-[38px] rounded-[8px] font-sans font-medium text-[13px] text-[#1E2230] hover:bg-[#F6F7FA] flex items-center gap-2.5 transition-colors cursor-pointer"
              >
                {icon && <span className="text-[#646B7C] shrink-0" aria-hidden="true">{icon}</span>}
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ThreeDotMenu;
