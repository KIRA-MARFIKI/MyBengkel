import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CenterDialog } from './CenterDialog';
import { ActionButton } from './ActionButton';
import { FormField } from './FormField';
import { verifyExportPin, ExportAuthResult } from '../../lib/auditTrail';

interface ExportPinModalProps {
  isOpen: boolean;
  exportType: 'Excel' | 'PDF';
  periodLabel: string;
  onClose: () => void;
  onVerified: (result: ExportAuthResult) => void;
  onFailedAttempt?: () => void;
}

export const ExportPinModal: React.FC<ExportPinModalProps> = ({
  isOpen,
  exportType,
  periodLabel,
  onClose,
  onVerified,
  onFailedAttempt,
}) => {
  const [pin, setPin] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [failCount, setFailCount] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (lockedUntil <= Date.now()) return;
    const interval = window.setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (cur >= lockedUntil) {
        setLockedUntil(0);
        setFailCount(0);
        setError('');
      }
    }, 500);
    return () => window.clearInterval(interval);
  }, [lockedUntil]);

  const isLocked = lockedUntil > nowMs;
  const remainingSec = isLocked ? Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked) return;

    const res = verifyExportPin(pin);

    if (!res.ok) {
      const nextFails = failCount + 1;
      setFailCount(nextFails);
      if (onFailedAttempt) onFailedAttempt();

      if (nextFails >= 3) {
        const until = Date.now() + 30_000;
        setLockedUntil(until);
        setNowMs(Date.now());
        setError('PIN tidak sesuai atau akses tidak diizinkan. Dialog dikunci selama 30 detik.');
      } else {
        setError(res.error || 'PIN tidak sesuai atau akses tidak diizinkan.');
      }
      return;
    }

    setFailCount(0);
    setError('');
    onVerified(res);
  };

  return (
    <CenterDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Verifikasi PIN"
      subtitle="Masukkan PIN untuk mengesahkan dan melanjutkan pengunduhan laporan"
      maxWidthClass="max-w-[440px]"
      footer={
        <>
          <ActionButton type="button" intent="cancel" onClick={onClose}>
            Tutup
          </ActionButton>
          <ActionButton
            type="button"
            intent="start"
            disabled={isLocked || pin.trim().length === 0}
            onClick={() => handleSubmit()}
          >
            Lanjutkan
          </ActionButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Context metadata summary */}
        <div className="p-3.5 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4] space-y-1.5 text-[13px]">
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">Jenis Ekspor:</span>
            <span className="font-semibold text-[#1E2230]">Export Semua {exportType}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">Periode Laporan:</span>
            <span className="font-medium text-[#1E2230]">{periodLabel}</span>
          </div>
        </div>

        {/* Masked PIN input */}
        <FormField
          id="export-pin-input"
          label="PIN Pengesahan"
          error={error}
        >
          <input
            id="export-pin-input"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              if (error) setError('');
            }}
            placeholder="Masukkan PIN"
            disabled={isLocked}
            autoFocus
            className="admin-input font-mono tracking-widest text-[16px] text-center"
          />
        </FormField>

        <div className="text-right">
          <Link
            to="/auth/reset-pin"
            className="text-xs text-[#646B7C] hover:text-[#1E2230] underline"
          >
            Lupa PIN?
          </Link>
        </div>

        {isLocked && (
          <div className="p-3 rounded-[10px] bg-[#FFF2F5] border border-[#FAD2DC] text-[12px] text-[#D62E5A] text-center font-medium">
            Terlalu banyak percobaan salah. Silakan tunggu{' '}
            <span className="font-bold tabular-nums">{remainingSec}</span> detik lagi.
          </div>
        )}
      </form>
    </CenterDialog>
  );
};
