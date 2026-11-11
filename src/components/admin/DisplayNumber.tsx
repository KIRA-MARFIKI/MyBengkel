import React from 'react';

interface DisplayNumberProps {
  value: number;
  className?: string;
}

// Odometer: each digit sits in its own overflow-hidden column holding 0 to 9 stacked.
// The index timeline rolls each .odo-col to -digit * 10 percent. Without the timeline
// (reduced motion) the final value is set by the same hook.
export const DisplayNumber: React.FC<DisplayNumberProps> = ({ value, className = '' }) => {
  const digits = String(Math.max(0, Math.round(value))).split('');
  return (
    <span
      role="text"
      aria-label={String(value)}
      className={`inline-flex font-sans font-bold leading-none tabular-nums ${className}`}
      style={{ lineHeight: 1 }}
    >
      {digits.map((d, i) => (
        <span key={i} aria-hidden="true" className="block overflow-hidden" style={{ height: '1em' }}>
          <span
            className="odo-col block"
            data-digit={d}
            data-order={digits.length - 1 - i}
            style={{ willChange: 'transform' }}
          >
            {Array.from({ length: 10 }, (_, n) => (
              <span key={n} className="block" style={{ height: '1em', lineHeight: 1 }}>
                {n}
              </span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
};

export default DisplayNumber;

