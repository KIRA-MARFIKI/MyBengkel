import React from 'react';
import { Link } from 'react-router-dom';
import { RollingNumber } from './island/IslandSystem';

interface KpiCardProps {
  to: string;
  value: number;
  label: string;
  color?: string;
  bgTint?: string;
  icon: React.ReactNode;
}

// KPI card: radius 20, padding 20, soft shadow.
// Icon box: 48px square, radius 14, tinted background (icon color at 14% opacity).
export const KpiCard: React.FC<KpiCardProps> = ({
  to,
  value,
  label,
  color = '#3DA5F5',
  bgTint = 'rgba(61, 165, 245, 0.14)',
  icon,
}) => {
  return (
    <Link
      to={to}
      className="kpi-card admin-card flex items-center gap-4 no-underline text-[#1E2230] hover:bg-[#F6F7FA] transition-colors flex-1"
    >
      <span
        aria-hidden="true"
        style={{ backgroundColor: bgTint, color }}
        className="w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <RollingNumber
          value={value}
          className="block font-sans font-bold text-[26px] leading-none text-[#1E2230] tabular-nums"
        />
        <div className="font-sans text-[13px] text-[#646B7C] mt-1.5">{label}</div>
      </div>
    </Link>
  );
};

export default KpiCard;
