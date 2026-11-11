import React from 'react';

export interface PipelineStage {
  label: string;
  count: number;
  focal?: boolean;
}

interface PipelineBarProps {
  stages: PipelineStage[];
  title?: string;
}

const TINTS = ['rgba(30,34,48,0.12)', 'rgba(30,34,48,0.28)', 'rgba(30,34,48,0.48)', 'rgba(30,34,48,0.72)', '#1E2230'];

export const PipelineBar: React.FC<PipelineBarProps> = ({
  stages,
  title = 'Pekerjaan menumpuk di tahap mana?',
}) => {
  const total = stages.reduce((s, x) => s + x.count, 0);
  const raw = stages.map((s) => (total === 0 ? 100 / stages.length : Math.max((s.count / total) * 100, 4)));
  const sum = raw.reduce((a, b) => a + b, 0);
  const widths = raw.map((w) => (w / sum) * 100);

  return (
    <figure>
      <figcaption className="font-sans font-semibold text-[16px] mb-4 text-[#1E2230]">{title}</figcaption>
      <div className="overflow-x-auto">
        <div className="min-w-[480px]">
          <div className="flex h-10 rounded-[12px] overflow-hidden" aria-hidden="true">
            {stages.map((s, i) => (
              <div
                key={s.label}
                className="pipe-seg h-full"
                style={{
                  width: `${widths[i]}%`,
                  background: s.focal ? '#FFBD59' : TINTS[i],
                  borderRight: i < stages.length - 1 ? '2px solid #ffffff' : undefined,
                }}
              />
            ))}
          </div>
          <ul className="flex mt-2">
            {stages.map((s, i) => (
              <li key={s.label} style={{ width: `${widths[i]}%` }} className="pr-2">
                <span className="block font-medium text-[#1E2230] truncate">{s.label}</span>
                <span className="block text-[12px] text-[#646B7C] tabular-nums">
                  {s.count}
                  {s.focal ? ', perlu tindakan' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
};

export default PipelineBar;
