import React, { useEffect, useRef } from 'react';
import { SearchIcon, XIconButton } from './ActionButton';

interface SearchFieldProps {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
}

export const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChange,
  placeholder,
  autoFocus = false,
  className = '',
}) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <div className={`relative flex items-center ${className}`.trim()}>
      <div className="pointer-events-none absolute left-3 flex items-center text-[#646B7C]">
        <SearchIcon size={16} />
      </div>
      <input
        ref={ref}
        type="search"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="admin-input h-10 pl-9 pr-8 md:w-[240px] text-[13px]"
      />
      {value && (
        <div className="absolute right-1">
          <XIconButton
            ariaLabel="Hapus pencarian"
            title="Hapus pencarian"
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
            className="!w-6 !h-6 !min-w-[24px] !min-h-[24px] !rounded-[6px]"
          />
        </div>
      )}
    </div>
  );
};

export default SearchField;
