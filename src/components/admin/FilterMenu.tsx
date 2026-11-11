import React, { useEffect, useRef, useState } from 'react';
import { FilterIconButton } from './ActionButton';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterMenuProps {
  value: string;
  defaultValue?: string;
  options: FilterOption[];
  onChange: (nextValue: string) => void;
  ariaLabel?: string;
}

export const FilterMenu: React.FC<FilterMenuProps> = ({
  value,
  defaultValue = 'Semua',
  options,
  onChange,
  ariaLabel = 'Filter part',
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOption = options.find((o) => o.value === value);
  const isFiltered = value !== defaultValue;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex items-center gap-2">
      {isFiltered && activeOption && (
        <div className="inline-flex items-center gap-2">
          <span className="inline-flex items-center h-7 px-2.5 rounded-[8px] bg-[#1E2230]/[0.08] text-[#1E2230] font-sans font-medium text-[12px] whitespace-nowrap">
            Filter: {activeOption.label}
          </span>
          <button
            type="button"
            onClick={() => onChange(defaultValue)}
            className="admin-btn-text text-[13px]"
          >
            Hapus filter
          </button>
        </div>
      )}

      <FilterIconButton
        ariaLabel={ariaLabel}
        title={ariaLabel}
        ariaHaspopup="menu"
        ariaExpanded={open}
        onClick={() => setOpen((prev) => !prev)}
      />

      {open && (
        <div
          role="menu"
          aria-label={ariaLabel}
          className="absolute right-0 top-full mt-2 z-40 min-w-[210px] rounded-[14px] bg-white p-2 shadow-[0_12px_32px_rgba(0,0,0,0.12)] border border-[#EEF0F4]"
        >
          {options.map((opt) => {
            const checked = opt.value === value;
            return (
              <label
                key={opt.value}
                role="menuitemradio"
                aria-checked={checked}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-[14px] cursor-pointer transition-colors ${
                  checked
                    ? 'bg-[#F6F7FA] font-semibold text-[#1E2230]'
                    : 'text-[#1E2230] hover:bg-[#F6F7FA]'
                }`}
              >
                <input
                  type="radio"
                  name="gudang-filter-menu"
                  checked={checked}
                  onChange={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className="w-4 h-4 accent-[#1E2230]"
                />
                <span>{opt.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FilterMenu;

