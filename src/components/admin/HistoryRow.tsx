import React from 'react';

interface HistoryRowProps {
  time: string;
  who?: string;
  what: string;
  reason?: string;
}

export const HistoryRow: React.FC<HistoryRowProps> = ({ time, who, what, reason }) => (
  <li className="py-2.5 border-b border-[#EEF0F4] last:border-b-0 text-[#1E2230] text-[14px]">
    <span className="font-medium text-[#646B7C] tabular-nums">{time}</span>
    {who && <span>{`, ${who}`}</span>}
    <span>{`: ${what}`}</span>
    {reason && <span>{`. Alasan: ${reason}`}</span>}
  </li>
);

export default HistoryRow;
