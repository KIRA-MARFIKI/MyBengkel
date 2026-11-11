import React from 'react';

interface OccupancyStripProps {
  hours: readonly string[];
  counts: Record<string, number>; // active bookings per hour
  capacity: number;
  title?: string;
}

// Answers one question. Eight columns, two stacked cells per column (capacity 2).
// Filled cell: black. Empty cell: black at 14%. Text value under each column, no tooltips.
export const OccupancyStrip: React.FC<OccupancyStripProps> = ({
  hours,
  counts,
  capacity,
  title = 'Jam mana yang penuh hari ini?',
}) => (
  <figure>
    <figcaption className="font-sans font-semibold text-[16px] mb-4 text-[#1E2230]">{title}</figcaption>
    <div className="overflow-x-auto">
      <ol className="flex gap-2 min-w-[480px]">
        {hours.map((h) => {
          const n = Math.min(counts[h] || 0, capacity);
          return (
            <li key={h} className="flex-1 min-w-[48px]">
              <div className="flex flex-col-reverse gap-1" aria-hidden="true">
                {Array.from({ length: capacity }, (_, i) => (
                  <div
                    key={i}
                    className="occ-cell h-10 rounded-[8px]"
                    style={{ background: i < n ? '#1E2230' : '#EEF0F4' }}
                  />
                ))}
              </div>
              <p className="mt-2 font-medium text-[#1E2230]">{h}</p>
              <p className="text-[12px] text-[#646B7C] tabular-nums">
                {n} dari {capacity}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  </figure>
);

export default OccupancyStrip;

