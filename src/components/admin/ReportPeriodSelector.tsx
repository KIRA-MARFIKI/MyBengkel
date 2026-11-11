import React from 'react';
import {
  type ReportPeriod,
  type ReportPeriodMode,
  getPeriodDisplayLabel,
} from '../../lib/reportCalculations';

interface ReportPeriodSelectorProps {
  period: ReportPeriod;
  onChange: (next: ReportPeriod) => void;
  className?: string;
}

export const ReportPeriodSelector: React.FC<ReportPeriodSelectorProps> = ({
  period,
  onChange,
  className = '',
}) => {
  const handleModeChange = (mode: ReportPeriodMode) => {
    onChange({
      mode,
      dateStr: period.dateStr,
    });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    onChange({
      mode: period.mode,
      dateStr: val,
    });
  };

  const displayLabel = getPeriodDisplayLabel(period);

  return (
    <div
      className={`flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-[16px] bg-white border border-[#EEF0F4] shadow-sm ${className}`}
    >
      {/* Mode Switcher with animated sliding indicator */}
      <div className="relative flex items-center p-1 bg-[#F3F4F6] rounded-[10px] w-fit select-none">
        <div
          className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[8px] bg-white shadow-sm transition-transform duration-200 ease-out pointer-events-none"
          style={{
            transform: period.mode === 'Harian' ? 'translateX(0)' : 'translateX(100%)',
            left: 4,
          }}
          aria-hidden="true"
        />
        <button
          type="button"
          onClick={() => handleModeChange('Harian')}
          className={`relative z-10 px-3.5 py-1.5 text-[13px] font-semibold rounded-[8px] transition-colors duration-150 ${
            period.mode === 'Harian'
              ? 'text-[#1E2230]'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Harian
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('Bulanan')}
          className={`relative z-10 px-3.5 py-1.5 text-[13px] font-semibold rounded-[8px] transition-colors duration-150 ${
            period.mode === 'Bulanan'
              ? 'text-[#1E2230]'
              : 'text-[#646B7C] hover:text-[#1E2230]'
          }`}
        >
          Bulanan
        </button>
      </div>

      {/* Date Input & Formatted Period Display */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <label htmlFor="report-date-picker" className="sr-only">
            Pilih tanggal laporan
          </label>
          <input
            id="report-date-picker"
            type={period.mode === 'Bulanan' ? 'month' : 'date'}
            value={period.mode === 'Bulanan' ? period.dateStr.slice(0, 7) : period.dateStr.slice(0, 10)}
            onChange={handleDateChange}
            className="admin-input !h-9 text-[13px] font-mono tabular-nums px-3 py-1 cursor-pointer transition-shadow hover:border-[#1A64B0]/40 focus:border-[#1A64B0]"
          />
        </div>

        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-[#E4F2FE] border border-[#BFDBFE] text-[#1A64B0] text-[13px] font-medium transition-colors">
          <span className="text-[11px] uppercase tracking-wider text-[#1A64B0]/70 font-semibold">
            Periode:
          </span>
          <strong className="font-semibold text-[#1E2230] transition-opacity duration-200">
            {displayLabel}
          </strong>
        </div>
      </div>
    </div>
  );
};

