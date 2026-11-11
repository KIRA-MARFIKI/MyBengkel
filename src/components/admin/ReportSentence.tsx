import React from 'react';

interface ReportSentenceProps {
  children: React.ReactNode;
  className?: string;
}

// The page's one sentence in Condensed 32 to 40px. Wrap numbers in <Num> to emphasize them.
export const ReportSentence: React.FC<ReportSentenceProps> = ({ children, className = '' }) => (
  <p className={`font-sans font-semibold text-[20px] leading-[1.3] text-[#1E2230] ${className}`}>{children}</p>
);

export const Num: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <strong className="font-semibold">{children}</strong>
);

export default ReportSentence;

