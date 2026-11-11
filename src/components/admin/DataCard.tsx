import React from 'react';

interface DataCardProps {
  title?: React.ReactNode;
  bracket?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

// Cards: radius 20, padding 20, no border, shadow 0 10px 30px rgba(0,0,0,0.04).
// Card title: 16px weight 600, sentence case.
export const DataCard: React.FC<DataCardProps> = ({
  title,
  actions,
  children,
  className = '',
}) => (
  <section className={`data-card admin-card flex flex-col ${className}`}>
    {(title || actions) && (
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        {title && <h2 className="admin-macro-section">{title}</h2>}
        {actions && <div className="flex flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
    )}
    <div className="flex-1">{children}</div>
  </section>
);

export default DataCard;
