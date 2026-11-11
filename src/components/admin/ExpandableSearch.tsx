import React, { useEffect, useRef, useState } from 'react';
import { SearchIcon, XIconButton } from './ActionButton';

export interface ExpandableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  maxWidthClass?: string; // e.g. "w-[240px] sm:w-[280px]"
  defaultOpen?: boolean;
}

export const ExpandableSearch: React.FC<ExpandableSearchProps> = ({
  value,
  onChange,
  placeholder = 'Cari...',
  ariaLabel = 'Cari',
  className = '',
  maxWidthClass = 'w-[220px] sm:w-[280px]',
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(defaultOpen || Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (value && !isOpen) {
      setIsOpen(true);
    }
  }, [value, isOpen]);

  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
  };

  const handleClose = () => {
    onChange('');
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleClose();
    }
  };

  return (
    <div className={`relative inline-flex items-center ${className}`.trim()}>
      {isOpen ? (
        <div
          className={`relative flex items-center h-9 sm:h-10 transition-all duration-350 ease-out ${maxWidthClass}`}
          style={{
            transition: 'width 350ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 200ms ease',
          }}
        >
          <div className="pointer-events-none absolute left-3 flex items-center text-[#646B7C]">
            <SearchIcon size={16} />
          </div>
          <input
            ref={inputRef}
            type="search"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            aria-label={ariaLabel}
            className="w-full h-full pl-9 pr-9 bg-white border border-[#D9DDE6] rounded-[12px] font-sans text-[13px] text-[#1E2230] placeholder-[#646B7C] shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-[#1E2230] focus-visible:outline-offset-2"
          />
          <div className="absolute right-1 flex items-center">
            <XIconButton
              ariaLabel="Tutup pencarian"
              title="Tutup pencarian (Esc)"
              onClick={handleClose}
              className="!w-7 !h-7 !min-w-[28px] !min-h-[28px] !rounded-[8px]"
            />
          </div>
        </div>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          aria-label={ariaLabel}
          title={ariaLabel}
          className="admin-icon-action-btn admin-intent-neutral h-9 w-9 sm:h-10 sm:w-10 rounded-[12px] transition-transform active:scale-95"
        >
          <SearchIcon size={18} />
        </button>
      )}
    </div>
  );
};

export default ExpandableSearch;

