import React, { useEffect, useState } from 'react';
import { SidePanel } from './SidePanel';
import { ActionButton } from './ActionButton';
import { FormField } from './FormField';

export interface CancelReasonPanelProps {
  isOpen: boolean;
  title?: string;
  plate?: string;
  onClose: () => void;
  onConfirm: (reason: string) => { ok: boolean; error?: string } | void;
}

export const CancelReasonPanel: React.FC<CancelReasonPanelProps> = ({
  isOpen,
  title = 'Batal pemeriksaan',
  plate,
  onClose,
  onConfirm,
}) => {
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setError('');
    }
  }, [isOpen]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Alasan pembatalan wajib diisi.');
      return;
    }
    const res = onConfirm(trimmed);
    if (res && !res.ok && res.error) {
      setError(res.error);
      return;
    }
    onClose();
  };

  return (
    <SidePanel
      isOpen={isOpen}
      onClose={onClose}
      title={plate ? `${title} ${plate}` : title}
      footer={
        <ActionButton type="button" intent="cancel" onClick={() => handleSubmit()}>
          Simpan pembatalan
        </ActionButton>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          id="cancel-reason-textarea"
          label="Alasan pembatalan"
          error={error || undefined}
        >
          <textarea
            id="cancel-reason-textarea"
            rows={4}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (error) setError('');
            }}
            placeholder="Tulis alasan pembatalan pemeriksaan"
            className="admin-input"
            aria-invalid={Boolean(error)}
          />
        </FormField>
      </form>
    </SidePanel>
  );
};

export default CancelReasonPanel;

