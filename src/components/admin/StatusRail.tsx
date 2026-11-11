import React from 'react';

interface StatusRailProps {
  steps: string[]; // three nodes: Draft, Menunggu persetujuan, Disetujui or Ditolak
  current: number; // index of the current node
}

// The line between nodes fills up to the current node. The current node is the focal marker
// (amber) and always carries its text.
export const StatusRail: React.FC<StatusRailProps> = ({ steps, current }) => (
  <ol className="flex items-start" aria-label="Tahap service form">
    {steps.map((s, i) => {
      const done = i < current;
      const isCurrent = i === current;
      return (
        <li
          key={s}
          aria-current={isCurrent ? 'step' : undefined}
          className={`relative flex-1 ${i === steps.length - 1 ? 'flex-none' : ''}`}
        >
          <div className="flex items-center">
            <span
              className={`block h-4 w-4 rounded-full border-2 border-[#1E2230] ${
                isCurrent ? 'admin-focal' : done ? 'bg-[#1E2230]' : 'bg-white'
              }`}
            />
            {i < steps.length - 1 && (
              <span
                className="block h-[2px] flex-1"
                style={{ background: done ? '#1E2230' : '#EEF0F4' }}
              />
            )}
          </div>
          <p className={`mt-2 pr-2 ${isCurrent ? 'font-semibold text-[#1E2230]' : 'text-[#646B7C]'}`}>{s}</p>
        </li>
      );
    })}
  </ol>
);

export default StatusRail;

