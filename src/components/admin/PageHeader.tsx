import React from 'react';

interface PageHeaderProps {
  title: string;
  decision?: string;
  action?: React.ReactNode;
  className?: string;
}

// Page title: IBM Plex Sans 600, 24px, sentence case
export const PageHeader: React.FC<PageHeaderProps> = ({ title, decision, action, className = '' }) => (
  <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-5 ${className}`}>
    <div>
      <h1 className="admin-macro-page">{title}</h1>
      {decision && <p className="font-sans font-normal text-[14px] text-[#646B7C] mt-1">{decision}</p>}
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
