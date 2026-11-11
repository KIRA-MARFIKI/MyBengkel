import React, { useEffect, useRef, useState } from 'react';
import { formatRupiah } from '../../lib/format';
import { gsap } from '../../lib/gsap';

// ============================================================================
// DOUGHNUT CHART COMPONENT
// ============================================================================

export interface DoughnutSegment {
  label: string;
  value: number;
  formattedValue?: string;
  color: string;
}

interface ReportDoughnutChartProps {
  title: string;
  segments: DoughnutSegment[];
  centerValue?: string | number;
  centerLabel?: string;
  emptyMessage?: string;
  className?: string;
}

export const ReportDoughnutChart: React.FC<ReportDoughnutChartProps> = ({
  title,
  segments,
  centerValue,
  centerLabel = 'Total',
  emptyMessage = 'Tidak ada data pada periode ini.',
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    gsap.fromTo(
      el,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' }
    );
  }, []);

  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  const cx = 95;
  const cy = 95;
  const r = 62;
  const circumference = 2 * Math.PI * r;

  let accumulated = 0;
  const nonZero = segments.filter((s) => s.value > 0);

  const arcs = nonZero.map((seg, idx) => {
    const share = total > 0 ? seg.value / total : 0;
    const len = share * circumference;
    const offset = accumulated;
    accumulated += len;

    return {
      ...seg,
      originalIndex: segments.findIndex((s) => s.label === seg.label),
      share,
      pct: Math.round(share * 100),
      len,
      offset,
      isHovered: hoveredIdx === idx,
    };
  });

  return (
    <div
      ref={cardRef}
      className={`p-4 rounded-[16px] bg-white border border-[#EEF0F4] flex flex-col justify-between ${className}`}
    >
      <div className="font-semibold text-[#1E2230] text-[14px] mb-3">{title}</div>

      {total <= 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
          <div className="w-16 h-16 rounded-full border-4 border-dashed border-[#E5E7EB] flex items-center justify-center mb-3">
            <span className="text-[18px] text-[#9CA3AF] font-bold">0</span>
          </div>
          <span className="text-[12px] text-[#646B7C] italic">{emptyMessage}</span>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative w-[180px] h-[180px] flex items-center justify-center">
            <svg viewBox="0 0 190 190" className="w-full h-full select-none" aria-hidden="true">
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={18} />

              {arcs.map((arc, idx) => (
                <circle
                  key={arc.label}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={arc.color}
                  strokeWidth={arc.isHovered ? 22 : 18}
                  strokeDasharray={`${Math.max(0.1, arc.len)} ${circumference}`}
                  strokeDashoffset={-arc.offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  style={{
                    transition:
                      'stroke-dasharray 0.35s ease-out, stroke-dashoffset 0.35s ease-out, stroke-width 0.2s ease',
                  }}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))}
            </svg>

            {/* Center Label & Total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center px-2 select-none">
              <span className="font-sans font-bold text-[20px] leading-tight text-[#1E2230] tabular-nums">
                {centerValue !== undefined ? centerValue : total.toLocaleString('id-ID')}
              </span>
              <span className="font-sans text-[11px] text-[#646B7C] uppercase tracking-wider mt-0.5">
                {centerLabel}
              </span>
            </div>
          </div>

          {/* Legend Table */}
          <div className="w-full mt-4 space-y-1.5 pt-3 border-t border-[#F3F4F6]">
            {segments.map((seg, idx) => {
              const share = total > 0 ? (seg.value / total) * 100 : 0;
              const isHovered = hoveredIdx === idx;

              return (
                <div
                  key={seg.label}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-center justify-between p-1 rounded-[6px] transition-colors text-[12px] cursor-pointer ${
                    isHovered ? 'bg-[#F8F9FA]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <span
                      style={{ backgroundColor: seg.color }}
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                    />
                    <span className="text-[#4B5563] truncate">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="font-semibold text-[#1E2230]">
                      {seg.formattedValue || seg.value.toLocaleString('id-ID')}
                    </span>
                    <span className="text-[#9CA3AF] text-[11px] w-9 text-right font-mono">
                      {Math.round(share)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// BAR CHART COMPONENT (GROUPED BARS)
// ============================================================================

export interface BarChartSeries {
  name: string;
  data: number[];
  color: string;
}

interface ReportBarChartProps {
  title: string;
  labels: string[];
  series: [BarChartSeries, BarChartSeries]; // Exactly two series
  isCurrency?: boolean;
  emptyMessage?: string;
  className?: string;
}

export const ReportBarChart: React.FC<ReportBarChartProps> = ({
  title,
  labels,
  series,
  isCurrency = false,
  emptyMessage = 'Tidak ada aktivitas pada periode ini.',
  className = '',
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [activeBar, setActiveBar] = useState<{
    label: string;
    seriesName: string;
    value: number;
  } | null>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    gsap.fromTo(
      el,
      { opacity: 0, y: 10 },
      { opacity: 1, y: 0, duration: 0.32, ease: 'power3.out' }
    );
  }, []);

  const series1 = series[0];
  const series2 = series[1];

  const maxVal = Math.max(
    1,
    ...series1.data.map((v) => Math.max(0, v)),
    ...series2.data.map((v) => Math.max(0, v))
  );

  const hasData = series1.data.some((v) => v > 0) || series2.data.some((v) => v > 0);

  // Y-Axis Ticks (4 steps: 0, 1/3, 2/3, max)
  const yTicks = [
    maxVal,
    Math.round(maxVal * 0.66),
    Math.round(maxVal * 0.33),
    0,
  ];

  return (
    <div
      ref={cardRef}
      className={`p-5 rounded-[16px] bg-white border border-[#EEF0F4] space-y-4 ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="font-semibold text-[#1E2230] text-[14px]">{title}</div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[12px]">
          <div className="flex items-center gap-1.5">
            <span style={{ backgroundColor: series1.color }} className="w-3 h-3 rounded-[3px]" />
            <span className="text-[#4B5563]">{series1.name}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span style={{ backgroundColor: series2.color }} className="w-3 h-3 rounded-[3px]" />
            <span className="text-[#4B5563]">{series2.name}</span>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-[#E5E7EB] rounded-[12px] bg-[#FAFBFD]">
          <span className="text-[13px] text-[#646B7C] italic">{emptyMessage}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Active tooltip banner */}
          <div className="h-6 flex items-center justify-end">
            {activeBar ? (
              <div className="text-[12px] text-[#1E2230] bg-[#F3F4F6] px-2.5 py-0.5 rounded-[6px] border border-[#E5E7EB] font-medium transition-all">
                <span className="text-[#646B7C] mr-1">{activeBar.label} &bull;</span>
                <span>{activeBar.seriesName}:</span>{' '}
                <strong className="font-bold tabular-nums">
                  {isCurrency ? formatRupiah(activeBar.value) : activeBar.value.toLocaleString('id-ID')}
                </strong>
              </div>
            ) : (
              <span className="text-[11px] text-[#9CA3AF]">Arahkan kursor ke batang untuk rincian</span>
            )}
          </div>

          {/* Chart Grid */}
          <div className="relative h-[220px] flex items-end pt-4 pb-6 pl-14 pr-2">
            {/* Horizontal Grid Lines & Y-Labels */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6 pl-1 pr-2">
              {yTicks.map((tick, i) => (
                <div key={i} className="flex items-center w-full">
                  <span className="w-12 text-right pr-2 text-[10px] text-[#9CA3AF] tabular-nums font-mono">
                    {isCurrency
                      ? tick >= 1_000_000
                        ? `${(tick / 1_000_000).toFixed(1)}jt`
                        : tick >= 1_000
                        ? `${Math.round(tick / 1_000)}k`
                        : tick
                      : tick.toLocaleString('id-ID')}
                  </span>
                  <div className="flex-1 border-b border-[#F3F4F6]" />
                </div>
              ))}
            </div>

            {/* Bars Container */}
            <div className="w-full h-full flex items-end justify-between gap-1 z-10">
              {labels.map((lbl, idx) => {
                const val1 = series1.data[idx] || 0;
                const val2 = series2.data[idx] || 0;
                const hPct1 = Math.max(0, Math.min(100, (val1 / maxVal) * 100));
                const hPct2 = Math.max(0, Math.min(100, (val2 / maxVal) * 100));

                return (
                  <div
                    key={idx}
                    className="flex-1 flex flex-col items-center justify-end h-full group"
                  >
                    <div className="w-full flex items-end justify-center gap-0.5 h-full">
                      {/* Bar 1 */}
                      <div
                        style={{
                          height: `${hPct1}%`,
                          backgroundColor: series1.color,
                          transition:
                            'height 0.35s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
                        }}
                        onMouseEnter={() =>
                          setActiveBar({
                            label: lbl,
                            seriesName: series1.name,
                            value: val1,
                          })
                        }
                        onMouseLeave={() => setActiveBar(null)}
                        className="w-full max-w-[14px] rounded-t-[3px] hover:brightness-110 cursor-pointer min-h-[2px]"
                      />
                      {/* Bar 2 */}
                      <div
                        style={{
                          height: `${hPct2}%`,
                          backgroundColor: series2.color,
                          transition:
                            'height 0.35s cubic-bezier(0.16, 1, 0.3, 1), background-color 0.2s ease',
                        }}
                        onMouseEnter={() =>
                          setActiveBar({
                            label: lbl,
                            seriesName: series2.name,
                            value: val2,
                          })
                        }
                        onMouseLeave={() => setActiveBar(null)}
                        className="w-full max-w-[14px] rounded-t-[3px] hover:brightness-110 cursor-pointer min-h-[2px]"
                      />
                    </div>

                    {/* X-Label */}
                    <div className="absolute -bottom-5 text-[10px] text-[#9CA3AF] tabular-nums font-mono truncate max-w-[28px] text-center select-none">
                      {labels.length > 20 && idx % 2 !== 0 ? '' : labels.length > 12 && idx % 2 !== 0 ? '' : lbl}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

