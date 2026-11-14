import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CenterDialog } from './CenterDialog';
import { ActionButton } from './ActionButton';
import { FormField } from './FormField';

export interface CredentialGateField {
  name: string;
  label: string;
  type?: 'text' | 'password';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  placeholder?: string;
  digitsOnly?: boolean;
  mono?: boolean;
}

export interface CredentialGateProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  description?: string;
  prototypeNote?: string;
  fields: CredentialGateField[];
  submitLabel?: string;
  errorMessage?: string;
  onClose: () => void;
  onVerify: (values: Record<string, string>) => boolean;
  onPass: (values: Record<string, string>) => void;
}

export const CredentialGate: React.FC<CredentialGateProps> = ({
  isOpen,
  title,
  subtitle,
  description,
  prototypeNote,
  fields,
  submitLabel = 'Masuk',
  errorMessage = 'Data verifikasi tidak cocok.',
  onClose,
  onVerify,
  onPass,
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');
  const [failCount, setFailCount] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (isOpen) {
      const initial: Record<string, string> = {};
      for (const f of fields) {
        initial[f.name] = '';
      }
      setValues(initial);
      setError('');
    }
  }, [isOpen, fields]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const id = window.setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (cur >= lockedUntil) {
        setLockedUntil(0);
        setFailCount(0);
        setError('');
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [lockedUntil]);

  const isLocked = lockedUntil > nowMs;
  const remainingSec = isLocked ? Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked) return;

    const passed = onVerify(values);
    if (!passed) {
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      if (nextFails >= 3) {
        const until = Date.now() + 30_000;
        setLockedUntil(until);
        setNowMs(Date.now());
        setError(`${errorMessage} Dialog dikunci selama 30 detik.`);
      } else {
        setError(errorMessage);
      }
      return;
    }

    setFailCount(0);
    setError('');
    onPass(values);
  };

  return (
    <CenterDialog
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      hideHeaderClose
      maxWidthClass="max-w-[440px]"
      footer={
        <>
          <ActionButton type="button" intent="cancel" onClick={onClose}>
            Tutup
          </ActionButton>
          <ActionButton
            type="button"
            intent="start"
            disabled={isLocked}
            onClick={() => handleSubmit()}
          >
            {submitLabel}
          </ActionButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {description && <p className="text-[14px] text-[#646B7C]">{description}</p>}

        {prototypeNote && (
          <div className="p-3 rounded-[10px] bg-[#F6F7FA] border border-[#EEF0F4] text-[12px] text-[#646B7C]">
            {prototypeNote}
          </div>
        )}

        {fields.map((field) => {
          const val = values[field.name] ?? '';
          const fieldId = `cred-gate-${field.name}`;
          return (
            <FormField key={field.name} id={fieldId} label={field.label}>
              <input
                id={fieldId}
                type={field.type || 'text'}
                inputMode={field.inputMode}
                maxLength={field.maxLength}
                disabled={isLocked}
                placeholder={field.placeholder}
                value={val}
                onChange={(e) => {
                  let raw = e.target.value;
                  if (field.digitsOnly) {
                    raw = raw.replace(/\D/g, '');
                  }
                  if (field.maxLength) {
                    raw = raw.slice(0, field.maxLength);
                  }
                  setValues((prev) => ({ ...prev, [field.name]: raw }));
                  if (!isLocked && error) setError('');
                }}
                className={`admin-input ${field.mono ? 'font-mono' : ''} ${
                  field.type === 'password' && field.digitsOnly ? 'tracking-widest' : ''
                }`}
              />
            </FormField>
          );
        })}

        {fields.some(
          (f) =>
            f.name.toLowerCase().includes('pin') || f.label.toLowerCase().includes('pin')
        ) && (
          <div className="text-right pt-0.5">
            <Link
              to="/auth/reset-pin"
              className="text-xs text-[#646B7C] hover:text-[#1E2230] underline"
            >
              Lupa PIN?
            </Link>
          </div>
        )}

        {(error || isLocked) && (
          <p role="alert" className="text-[13px] font-medium text-[#D62E5A]">
            {isLocked
              ? `${errorMessage} Dialog dikunci selama 30 detik (${remainingSec} detik tersisa).`
              : error}
          </p>
        )}
      </form>
    </CenterDialog>
  );
};

export default CredentialGate;
