import React from 'react';
import { Link } from 'react-router-dom';
import { ActionButton, ActionIntent, IconActionButton } from './ActionButton';

export { ActionButton, IconActionButton };
export type { ActionIntent };

type Variant = 'primary' | 'secondary' | 'text';

interface ButtonProps {
  variant?: Variant;
  intent?: ActionIntent;
  to?: string;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  className?: string;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  intent,
  to,
  onClick,
  type = 'button',
  disabled,
  title,
  ariaLabel,
  className = '',
  children,
}) => {
  if (variant === 'text' && !intent) {
    const cls = `admin-btn-text ${className}`.trim();
    return to ? (
      <Link to={to} onClick={onClick} title={title} aria-label={ariaLabel} className={cls}>
        {children}
      </Link>
    ) : (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={ariaLabel}
        className={cls}
      >
        {children}
      </button>
    );
  }

  const resolvedIntent: ActionIntent = intent ?? (variant === 'primary' ? 'start' : 'neutral');

  return (
    <ActionButton
      intent={resolvedIntent}
      to={to}
      onClick={onClick}
      type={type}
      disabled={disabled}
      title={title}
      ariaLabel={ariaLabel}
      className={className}
    >
      {children}
    </ActionButton>
  );
};

export default Button;
