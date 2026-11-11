import React from 'react';

interface PlateHeadingProps {
  plate: string;
  brand?: string;
  model?: string;
}

export const PlateHeading: React.FC<PlateHeadingProps> = ({ plate, brand, model }) => (
  <div>
    <h1 className="font-mono font-medium text-[28px] leading-none text-[#1E2230] tabular-nums">
      <data value={plate}>{plate}</data>
    </h1>
    {(brand || model) && (
      <p className="mt-1.5 font-sans text-[14px] text-[#646B7C]">{[brand, model].filter(Boolean).join(' ')}</p>
    )}
  </div>
);

export default PlateHeading;
