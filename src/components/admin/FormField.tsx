import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  helperText?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  helperText,
  error,
  optional = false,
  children,
  className = '',
}) => (
  <div className={`flex flex-col ${className}`}>
    <label htmlFor={id} className="font-sans font-medium text-[13px] text-[#1E2230] mb-1.5">
      {label}
      {optional && <span className="font-normal text-[#646B7C]">{' (opsional)'}</span>}
    </label>

    {children}

    {helperText && !error && (
      <span id={`${id}-help`} className="font-sans font-normal text-[13px] text-[#646B7C] mt-1">
        {helperText}
      </span>
    )}

    {error && (
      <div
        id={`${id}-error`}
        role="alert"
        className="font-sans font-medium text-[13px] text-[#D62E5A] mt-1.5"
      >
        {error}
      </div>
    )}
  </div>
);

export default FormField;
