import React, { useRef } from 'react';
import { TabIsland } from './island/IslandSystem';

export interface FilterTab {
  value: string;
  label: string;
  count?: number;
}

interface FilterTabsProps {
  tabs: FilterTab[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

// Tab buttons: rectangular buttons, radius 12, 40 high, 8px gap.
// Active: ink fill (#1E2230 via TabIsland), white text.
// Inactive: white fill, 1px #D9DDE6 border, ink text.
export const FilterTabs: React.FC<FilterTabsProps> = ({ tabs, value, onChange, ariaLabel }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      const nextIdx = (idx + dir + tabs.length) % tabs.length;
      const nextTab = tabs[nextIdx];
      onChange(nextTab.value);
      btnRefs.current[nextTab.value]?.focus();
    }
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className="admin-tab-group relative inline-flex items-center gap-2 overflow-x-auto max-w-full p-0.5"
    >
      <TabIsland containerRef={containerRef} activeKey={value} />
      {tabs.map((t, idx) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              btnRefs.current[t.value] = el;
            }}
            data-island-key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKeyDown(e, idx)}
            className={`admin-tab-btn relative z-10 ${
              active
                ? 'text-white bg-transparent border border-transparent'
                : 'bg-white text-[#1E2230] border border-[#D9DDE6] hover:bg-[#F6F7FA]'
            }`}
          >
            <span>{t.label}</span>
            {t.count !== undefined && (
              <data value={t.count} className="ml-1.5 tabular-nums opacity-85">
                ({t.count})
              </data>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default FilterTabs;
