import React from 'react';

export interface DonutSegment {
  label: string;
  count: number;
  color?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  centerPercent: number;
  centerLabel?: string;
}

const SEGMENT_COLORS = ['#5CC46A', '#FFBD59', '#3DA5F5', '#F2466F'];

export const DonutChart: React.FC<DonutChartProps> = ({
  segments,
  centerPercent,
  centerLabel = 'Selesai',
}) => {
  const cx = 95;
  const cy = 95;
  const r = 64;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((sum, s) => sum + s.count, 0);
  const nonZero = segments.filter((s) => s.count > 0);

  let currentAngle = -90;
  const arcs = nonZero.map((seg, idx) => {
    const share = total > 0 ? seg.count / total : 0;
    const sweepDeg = Math.max(18, share * 340);
    const len = (sweepDeg / 360) * circumference;
    const startAngle = currentAngle;
    currentAngle += sweepDeg + 2;
    return {
      ...seg,
      share,
      len,
      startAngle,
      stroke: seg.color || SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
      strokeWidth: idx === 0 ? 20 : 16,
    };
  });

  return (
    <div className="flex flex-col items-center justify-between py-2">
      <p className="sr-only">
        {segments.map((s) => `${s.label}: ${s.count}`).join(', ')}. {centerLabel}: {centerPercent}%.
      </p>

      <div className="relative w-[176px] h-[176px] flex items-center justify-center">
        <svg viewBox="0 0 190 190" className="w-full h-full" aria-hidden="true">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EEF0F4" strokeWidth={20} />

          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={arc.stroke}
              strokeWidth={arc.strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${arc.len} ${circumference}`}
              strokeDashoffset={0}
              transform={`rotate(${arc.startAngle} ${cx} ${cy})`}
              className="donut-progress"
              data-share={arc.len / circumference}
              data-len={arc.len}
              data-circ={circumference}
            />
          ))}
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <data
            value={centerPercent}
            className="font-sans font-bold text-[24px] leading-none text-[#1E2230] tabular-nums"
          >
            {centerPercent}%
          </data>
          <span className="font-sans text-[12px] text-[#646B7C] mt-1">{centerLabel}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 mt-3">
        {segments.map((s, idx) => (
          <div key={s.label} className="flex items-center gap-2 text-[13px] text-[#1E2230]">
            <span
              aria-hidden="true"
              style={{ borderColor: s.color || SEGMENT_COLORS[idx % SEGMENT_COLORS.length] }}
              className="w-3 h-3 rounded-full border-[3px] inline-block"
            />
            <span className="text-[#646B7C]">{s.label}:</span>
            <data value={s.count} className="font-medium tabular-nums">
              {s.count}
            </data>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DonutChart;
