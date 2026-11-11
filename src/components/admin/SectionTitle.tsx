import React from 'react';

interface SectionTitleProps {
  children: React.ReactNode;
  bracket?: boolean;
  action?: React.ReactNode;
  className?: string;
}

export const SectionTitle: React.FC<SectionTitleProps> = ({
  children,
  action,
  className = '',
}) => (
  <div className={`py-2 mb-3 flex items-baseline justify-between gap-4 ${className}`}>
    <h2 className="admin-macro-section">
      {children}
    </h2>
    {action}
  </div>
);

export default SectionTitle;
