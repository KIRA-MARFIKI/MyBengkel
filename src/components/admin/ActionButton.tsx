import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export type ActionIntent = 'start' | 'wait' | 'cancel' | 'cream' | 'add' | 'neutral' | 'addline';
export type IconActionIntent = 'start' | 'wait' | 'cancel' | 'cream' | 'add' | 'neutral';

export interface ActionButtonProps {
  intent?: ActionIntent;
  to?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaDisabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  icon?: React.ReactNode | null | false;
  iconPosition?: 'left' | 'right';
  children: React.ReactNode;
}

const INTENT_CLASS_MAP: Record<ActionIntent, string> = {
  start: 'admin-intent-start',
  wait: 'admin-intent-wait',
  cancel: 'admin-intent-cancel',
  cream: 'admin-intent-cream',
  add: 'admin-intent-add',
  neutral: 'admin-intent-neutral',
  addline: 'admin-intent-addline',
};

// ---------------------------------------------------------
// Standard 18x18 SVG Icons (GD-0 & UI Refinement System)
// ---------------------------------------------------------

export const XIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const CheckIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M3.75 9.5L7.25 13L14.25 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const EyeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M1.75 9C3.2 5.6 5.9 3.75 9 3.75C12.1 3.75 14.8 5.6 16.25 9C14.8 12.4 12.1 14.25 9 14.25C5.9 14.25 3.2 12.4 1.75 9Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <circle cx="9" cy="9" r="2.25" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

export const EyeOffIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M7.6 3.8C8.06 3.75 8.52 3.75 9 3.75C12.1 3.75 14.8 5.6 16.25 9C15.42 10.94 13.97 12.39 12.18 13.18M4.73 4.73C3.27 5.75 2.2 7.23 1.75 9C3.2 12.4 5.9 14.25 9 14.25C10.57 14.25 12 13.78 13.27 12.98M2.25 2.25L15.75 15.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PencilIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M12.75 2.25L15.75 5.25L5.25 15.75H2.25V12.75L12.75 2.25Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const TrashIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M3 4.5H15M6.75 4.5V3C6.75 2.58579 7.08579 2.25 7.5 2.25H10.5C10.9142 2.25 11.25 2.58579 11.25 3V4.5M13.5 4.5V14.25C13.5 14.6642 13.1642 15 12.75 15H5.25C4.83579 15 4.5 14.6642 4.5 14.25V4.5H13.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7.5 8V12M10.5 8V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const PlusIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M9 3.75V14.25M3.75 9H14.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PrinterIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M5.25 6V2.75H12.75V6M5.25 12.75H3.75C2.92157 12.75 2.25 12.0784 2.25 11.25V7.5C2.25 6.67157 2.92157 6 3.75 6H14.25C15.0784 6 15.75 6.67157 15.75 7.5V11.25C15.75 12.0784 15.0784 12.75 14.25 12.75H12.75M5.25 10.5H12.75V15.25H5.25V10.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FilterIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M2.5 4.25H15.5M5 9H13M7.5 13.75H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const SearchIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="2" />
    <path d="M12.2 12.2L16 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const ProcessIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M4.25 2.75H13.75V15.25L11.75 13.75L9.9 15.25L8.1 13.75L6.25 15.25L4.25 13.75V2.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6.75 6.5H11.25M6.75 9.25H11.25M6.75 11.75H9.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const SaveIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M14.25 15.75H3.75C3.19772 15.75 2.75 15.3023 2.75 14.75V3.25C2.75 2.69772 3.19772 2.25 3.75 2.25H11.75L15.25 5.75V14.75C15.25 15.3023 14.8023 15.75 14.25 15.75Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M5.75 2.25V6.25H11.25V2.25M5.75 15.75V10.25H12.25V15.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DownloadIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M9 2.25V11.25M9 11.25L5.625 7.875M9 11.25L12.375 7.875M2.625 14.25H15.375" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const RefreshIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M15 3V6.75H11.25M3 15V11.25H6.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M14.07 9C13.68 12.18 10.98 14.62 7.67 14.62C4.54 14.62 1.93 12.44 1.35 9.48M3.93 9C4.32 5.82 7.02 3.38 10.33 3.38C13.46 3.38 16.07 5.56 16.65 8.52" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowLeftIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M14.25 9H3.75M3.75 9L8.25 4.5M3.75 9L8.25 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ArrowRightIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M3.75 9H14.25M14.25 9L9.75 4.5M14.25 9L9.75 13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ClockIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <circle cx="9" cy="9" r="6.75" stroke="currentColor" strokeWidth="1.8" />
    <path d="M9 5.25V9L11.625 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

export const LogOutIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden="true" className={className}>
    <path d="M6.75 15.75H3.75C3.19772 15.75 2.75 15.3023 2.75 14.75V3.25C2.75 2.69772 3.19772 2.25 3.75 2.25H6.75M12 12.75L15.75 9M15.75 9L12 5.25M15.75 9H6.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MinusIcon: React.FC<{ size?: number; className?: string }> = ({ size = 18, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d="M3.75 9h10.5" />
  </svg>
);

export const BanknoteIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="3" />
    <path d="M6 12h.01M18 12h.01" />
  </svg>
);

export const LandmarkIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z" />
  </svg>
);

export const QrCodeIcon: React.FC<{ size?: number; className?: string }> = ({ size = 20, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M7 7h.01M17 7h.01M7 17h.01M17 17h.01M14 10h3M10 14v3" />
  </svg>
);

// ---------------------------------------------------------
// Smart Icon Resolver for ActionButton
// ---------------------------------------------------------

function resolveDefaultIcon(intent: ActionIntent, children: React.ReactNode): React.ReactNode | null {
  const text = typeof children === 'string' ? children.trim().toLowerCase() : '';

  // All Cancel, Close, Dismiss, and destructive actions MUST use red X icon
  if (intent === 'cancel') {
    return <XIcon size={16} />;
  }
  if (
    text.includes('batal') ||
    text.includes('tutup') ||
    text.includes('tolak') ||
    text.includes('hapus') ||
    text.includes('reset')
  ) {
    return <XIcon size={16} />;
  }

  if (text.includes('simpan')) {
    return <SaveIcon size={16} />;
  }
  if (
    intent === 'add' ||
    intent === 'addline' ||
    text.includes('tambah') ||
    text.includes('baru') ||
    text.endsWith('+')
  ) {
    return <PlusIcon size={16} />;
  }
  if (
    text.includes('setujui') ||
    text.includes('terima') ||
    text.includes('selesai') ||
    text.includes('datang') ||
    text.includes('approve')
  ) {
    return <CheckIcon size={16} />;
  }
  if (text.includes('kembali')) {
    return <ArrowLeftIcon size={16} />;
  }
  if (text.includes('cetak')) {
    return <PrinterIcon size={16} />;
  }
  if (text.includes('keluar')) {
    return <LogOutIcon size={16} />;
  }
  if (intent === 'wait' || text.includes('tunggu')) {
    return <ClockIcon size={16} />;
  }
  if (text.includes('proses')) {
    return <ProcessIcon size={16} />;
  }
  if (text.includes('lanjut')) {
    return <ArrowRightIcon size={16} />;
  }
  if (text.includes('edit')) {
    return <PencilIcon size={16} />;
  }
  if (text.includes('cari')) {
    return <SearchIcon size={16} />;
  }
  if (text.includes('jual') || text.includes('bayar')) {
    return <BanknoteIcon size={16} />;
  }
  if (text.includes('unduh') || text.includes('export')) {
    return <DownloadIcon size={16} />;
  }

  return null;
}

// ---------------------------------------------------------
// ActionButton: Primary interactive button component
// ---------------------------------------------------------

export const ActionButton: React.FC<ActionButtonProps> = ({
  intent = 'neutral',
  to,
  onClick,
  type = 'button',
  disabled,
  ariaDisabled,
  title,
  ariaLabel,
  className = '',
  icon,
  iconPosition = 'left',
  children,
}) => {
  const cls = `admin-action-btn ${INTENT_CLASS_MAP[intent]} ${className}`.trim();
  const resolvedIcon = icon === null || icon === false ? null : (icon ?? resolveDefaultIcon(intent, children));

  const content = (
    <span className="inline-flex items-center justify-center gap-2">
      {iconPosition === 'left' && resolvedIcon && (
        <span className="shrink-0 flex items-center justify-center" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
      <span>{children}</span>
      {iconPosition === 'right' && resolvedIcon && (
        <span className="shrink-0 flex items-center justify-center" aria-hidden="true">
          {resolvedIcon}
        </span>
      )}
    </span>
  );

  if (to) {
    return (
      <Link to={to} onClick={onClick} title={title} aria-label={ariaLabel} className={cls}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={(e) => {
        if (disabled || ariaDisabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      disabled={disabled}
      aria-disabled={ariaDisabled ? 'true' : undefined}
      title={title}
      aria-label={ariaLabel}
      className={cls}
    >
      {content}
    </button>
  );
};

// ---------------------------------------------------------
// IconActionButton: 36px square icon button with tooltip
// ---------------------------------------------------------

export interface IconActionButtonProps {
  intent?: IconActionIntent;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  ariaDisabled?: boolean;
  title?: string;
  ariaLabel?: string;
  ariaHaspopup?: React.AriaAttributes['aria-haspopup'];
  ariaExpanded?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const IconActionButton: React.FC<IconActionButtonProps> = ({
  intent = 'neutral',
  onClick,
  type = 'button',
  disabled,
  ariaDisabled,
  title,
  ariaLabel,
  ariaHaspopup,
  ariaExpanded,
  className = '',
  children,
}) => {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const cls = `admin-icon-action-btn ${INTENT_CLASS_MAP[intent]} ${className}`.trim();
  const tooltipText = title || ariaLabel;

  return (
    <span className="relative inline-flex items-center justify-center">
      <button
        type={type}
        onClick={(e) => {
          if (disabled || ariaDisabled) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          onClick?.(e);
        }}
        disabled={disabled}
        aria-disabled={ariaDisabled ? 'true' : undefined}
        title={tooltipText}
        aria-label={ariaLabel || title}
        aria-haspopup={ariaHaspopup}
        aria-expanded={ariaExpanded}
        onFocus={() => {
          if (tooltipText) setTooltipVisible(true);
        }}
        onBlur={() => setTooltipVisible(false)}
        onMouseEnter={() => {
          if (tooltipText) setTooltipVisible(true);
        }}
        onMouseLeave={() => setTooltipVisible(false)}
        className={cls}
      >
        {children}
      </button>
      {tooltipVisible && tooltipText && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 w-max max-w-[260px] px-2.5 py-1 rounded-[8px] bg-[#1E2230] text-white font-sans text-[12px] leading-snug shadow-lg whitespace-nowrap text-center transition-opacity"
        >
          {tooltipText}
        </span>
      )}
    </span>
  );
};

// ---------------------------------------------------------
// Shared 36px Icon Buttons (GD-0 & UI Refinement System):
// Intents: eye, printer, filter, search, download -> neutral; check, process, plus -> start; X, trash -> cancel.
// ---------------------------------------------------------

export interface SharedIconButtonProps {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  ariaDisabled?: boolean;
  ariaHaspopup?: React.AriaAttributes['aria-haspopup'];
  ariaExpanded?: boolean;
  className?: string;
}

export const EyeIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Lihat detail',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <EyeIcon />
  </IconActionButton>
);

export const CheckIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Setujui',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="start"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <CheckIcon />
  </IconActionButton>
);

export const XIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Batal',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="cancel"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <XIcon />
  </IconActionButton>
);

export const TrashIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Hapus',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="cancel"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <TrashIcon />
  </IconActionButton>
);

export const DeleteIconButton = TrashIconButton;

export const EditIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Edit',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <PencilIcon />
  </IconActionButton>
);

export const PencilIconButton = EditIconButton;

export const ProcessIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Proses',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="start"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <ProcessIcon />
  </IconActionButton>
);

export interface PrintIconButtonProps {
  documentName?: string;
  plate?: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

export const PrintIconButton: React.FC<PrintIconButtonProps> = ({
  documentName = 'dokumen',
  plate = '',
  onClick,
  ariaLabel,
  title,
  className = '',
}) => {
  const label = ariaLabel || title || `Cetak ${documentName} ${plate}`.trim();
  return (
    <IconActionButton
      intent="neutral"
      ariaLabel={label}
      title={title || label}
      onClick={onClick}
      className={className}
    >
      <PrinterIcon />
    </IconActionButton>
  );
};

export const PrinterIconButton = PrintIconButton;

export const FilterIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Filter',
  title,
  disabled,
  ariaDisabled,
  ariaHaspopup,
  ariaExpanded,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    ariaHaspopup={ariaHaspopup}
    ariaExpanded={ariaExpanded}
    className={className}
  >
    <FilterIcon />
  </IconActionButton>
);

export const PlusIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Tambah',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="start"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <PlusIcon />
  </IconActionButton>
);

export const MinusIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Kurangi',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <MinusIcon />
  </IconActionButton>
);

export const SearchIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Cari',
  title,
  disabled,
  ariaDisabled,
  ariaExpanded,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    ariaExpanded={ariaExpanded}
    className={className}
  >
    <SearchIcon />
  </IconActionButton>
);

export const DownloadIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Unduh',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <DownloadIcon />
  </IconActionButton>
);

export const RefreshIconButton: React.FC<SharedIconButtonProps> = ({
  onClick,
  ariaLabel = 'Muat ulang',
  title,
  disabled,
  ariaDisabled,
  className,
}) => (
  <IconActionButton
    intent="neutral"
    ariaLabel={ariaLabel}
    title={title || ariaLabel}
    onClick={onClick}
    disabled={disabled}
    ariaDisabled={ariaDisabled}
    className={className}
  >
    <RefreshIcon />
  </IconActionButton>
);

export default ActionButton;
