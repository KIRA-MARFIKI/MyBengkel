import React, { useEffect, useMemo, useState } from 'react';
import { CenterDialog } from './CenterDialog';
import { ActionButton } from './ActionButton';
import { FilterTabs } from './FilterTabs';
import { StatusChip } from './StatusChip';
import { FormField } from './FormField';
import {
  Part,
  PurchaseRequest,
  PurchaseRequestLine,
  computeRequestSisaBayar,
  computeRequestTotalHarga,
  getLineStatusLabel,
  getRequestStatusLabel,
} from '../../data/adminDummy';
import {
  cancelHo,
  processHo,
  setLineFulfil,
} from '../../context/AdminContext';
import {
  CODE_RESEND_WAIT_MS,
  DUMMY_ADMIN_PIN,
  generateCode,
  isGeneratedCodeValid,
  maskEmail,
  maskPhone,
} from '../../lib/mockCredentials';
import { printDocument } from '../../lib/printDocument';
import { formatRupiah } from '../../lib/format';

export function printHoDocument(
  req: PurchaseRequest,
  parts: Part[],
  kind: 'nota_dp' | 'nota_ho' | 'batal_ho'
): void {
  const partMap = new Map(parts.map((p) => [p.id, p]));
  for (const p of parts) {
    partMap.set(p.kode, p);
  }

  const printParts = req.lines
    .filter((l) => l.fulfil === 'dipenuhi')
    .map((l) => {
      const part = partMap.get(l.partId);
      const kode = part?.kode || l.partId;
      const nama = part?.nama || l.partId;
      const hargaSatuan = l.hargaPerkiraan || 0;
      return {
        kode,
        nama,
        qty: l.qty,
        hargaSatuan,
        subtotal: l.qty * hargaSatuan,
      };
    });

  const totalHarga = computeRequestTotalHarga(req);
  const dp = req.dp || 0;
  const sisaBayar = computeRequestSisaBayar(req);
  const orderCode = req.orderCode || req.id;
  const customerName =
    req.requesterKind === 'pelanggan'
      ? req.customer?.nama || req.requesterName
      : 'Bengkel (Admin Gudang)';
  const phone = req.customer?.hp || 'Tidak berlaku';
  const engineNo = req.customer?.noMesin || 'Tidak berlaku';
  const frameNo = req.customer?.noRangka || 'Tidak berlaku';

  if (kind === 'nota_dp') {
    printDocument('nota_dp', {
      orderCode,
      customerName,
      phone,
      engineNo,
      frameNo,
      parts: printParts,
      totalHarga,
      dp,
      sisaBayar,
      date: req.orderedAt || req.createdAt,
    });
    return;
  }

  if (kind === 'nota_ho') {
    printDocument('nota_ho', {
      orderCode,
      customerName,
      phone,
      engineNo,
      frameNo,
      parts: printParts,
      totalHarga,
      dp,
      sisaBayar,
      date: req.orderedAt || req.createdAt,
      arrivedAt: req.arrivedAt || 'Belum dicatat',
      processedAt: req.processedAt || req.createdAt,
    });
    return;
  }

  printDocument('batal_ho', {
    orderCode,
    customerName,
    phone,
    parts: printParts,
    dp,
    reason: req.closeReason || 'Tidak dicatat',
    cancelledAt: req.closedAt || req.createdAt,
  });
}

export interface RequestEyeDialogProps {
  isOpen: boolean;
  request: PurchaseRequest | null;
  parts: Part[];
  readOnly?: boolean;
  onClose: () => void;
}

export const RequestEyeDialog: React.FC<RequestEyeDialogProps> = ({
  isOpen,
  request,
  parts,
  readOnly = false,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'dipenuhi' | 'tidak'>('dipenuhi');
  const [checkedLineIds, setCheckedLineIds] = useState<string[]>([]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab('dipenuhi');
      setCheckedLineIds([]);
    }
  }, [isOpen, request?.id]);

  const partMap = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of parts) {
      m.set(p.id, p);
      m.set(p.kode, p);
    }
    return m;
  }, [parts]);

  if (!request) {
    return (
      <CenterDialog isOpen={isOpen} onClose={onClose} title="Detail Permintaan" hideHeaderClose>
        <div />
      </CenterDialog>
    );
  }

  const resolvePartInfo = (line: PurchaseRequestLine) => {
    const p = partMap.get(line.partId);
    return {
      kode: p?.kode || line.partId,
      nama: p?.nama || line.partId,
    };
  };

  if (request.type === 'reguler') {
    const canEditFulfil = request.state === 'diajukan' && !readOnly;
    const dipenuhiLines = request.lines.filter((l) => l.fulfil === 'dipenuhi');
    const tidakLines = request.lines.filter((l) => l.fulfil === 'tidak');
    const currentLines = activeTab === 'dipenuhi' ? dipenuhiLines : tidakLines;

    const validChecked = checkedLineIds.filter((id) =>
      currentLines.some((l) => l.id === id)
    );
    const allChecked =
      currentLines.length > 0 && validChecked.length === currentLines.length;

    const toggleAll = () => {
      if (allChecked) {
        setCheckedLineIds([]);
      } else {
        setCheckedLineIds(currentLines.map((l) => l.id));
      }
    };

    const toggleOne = (lineId: string) => {
      setCheckedLineIds((prev) =>
        prev.includes(lineId) ? prev.filter((id) => id !== lineId) : [...prev, lineId]
      );
    };

    const handleMoveLines = (targetFulfil: 'dipenuhi' | 'tidak') => {
      if (validChecked.length === 0) return;
      setLineFulfil(request.id, validChecked, targetFulfil);
      setCheckedLineIds([]);
    };

    const statusLabel = getRequestStatusLabel(request);

    return (
      <CenterDialog
        isOpen={isOpen}
        onClose={onClose}
        title={`Detail Permintaan ${request.id}`}
        subtitle={request.orderCode ? `Kode Pemenuhan: ${request.orderCode}` : undefined}
        hideHeaderClose
        maxWidthClass="max-w-[720px]"
        footer={
          <ActionButton type="button" intent="cancel" onClick={onClose}>
            Tutup
          </ActionButton>
        }
      >
        <div className="space-y-5">
          {/* Header metadata */}
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-[12px] bg-[#F6F7FA] text-[13px]">
            <div>
              <dt className="text-[#646B7C]">Kode permintaan</dt>
              <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">{request.id}</dd>
            </div>
            <div>
              <dt className="text-[#646B7C]">Pemohon</dt>
              <dd className="font-medium text-[#1E2230] mt-0.5">{request.requesterName}</dd>
            </div>
            <div>
              <dt className="text-[#646B7C]">Diajukan</dt>
              <dd className="font-mono text-[#1E2230] mt-0.5">{request.createdAt}</dd>
            </div>
            <div>
              <dt className="text-[#646B7C]">Status</dt>
              <dd className="mt-1">
                <StatusChip status={statusLabel} />
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#646B7C]">Kode Pemenuhan</dt>
              <dd className="font-mono font-medium text-[#1E2230] mt-0.5">
                {request.orderCode || 'Belum ada'}
              </dd>
            </div>
            {(request.state === 'ditolak' || request.state === 'batal') && request.closeReason && (
              <div className="col-span-2 sm:col-span-3 pt-2 border-t border-[#EEF0F4]">
                <dt className="text-[#646B7C]">Alasan</dt>
                <dd className="text-[#1E2230] mt-0.5">{request.closeReason}</dd>
              </div>
            )}
          </dl>

          {/* Tabs and action button */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterTabs
              ariaLabel="Tab pemenuhan part"
              value={activeTab}
              onChange={(v) => {
                setActiveTab(v as 'dipenuhi' | 'tidak');
                setCheckedLineIds([]);
              }}
              tabs={[
                { value: 'dipenuhi', label: `Part dipenuhi (${dipenuhiLines.length})` },
                { value: 'tidak', label: `Part tidak terpenuhi (${tidakLines.length})` },
              ]}
            />

            {canEditFulfil && (
              <div>
                {activeTab === 'dipenuhi' ? (
                  <ActionButton
                    type="button"
                    intent="cancel"
                    disabled={validChecked.length === 0}
                    onClick={() => handleMoveLines('tidak')}
                  >
                    Batal penuhi
                  </ActionButton>
                ) : (
                  <ActionButton
                    type="button"
                    intent="start"
                    disabled={validChecked.length === 0}
                    onClick={() => handleMoveLines('dipenuhi')}
                  >
                    Penuhi lagi
                  </ActionButton>
                )}
              </div>
            )}
          </div>

          {/* Lines table */}
          {currentLines.length === 0 ? (
            <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA] text-[14px] text-[#646B7C]">
              {activeTab === 'dipenuhi'
                ? 'Tidak ada part pada daftar dipenuhi.'
                : 'Tidak ada part pada daftar tidak terpenuhi.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[14px] text-[#1E2230]">
                <thead>
                  <tr className="bg-[#F6F7FA]">
                    {canEditFulfil && (
                      <th scope="col" className="h-10 px-3.5 w-10 rounded-l-[12px]">
                        <input
                          type="checkbox"
                          aria-label="Pilih semua part"
                          checked={allChecked}
                          onChange={toggleAll}
                          className="w-4 h-4 accent-[#1D6FC4]"
                        />
                      </th>
                    )}
                    <th
                      scope="col"
                      className={`h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] ${
                        !canEditFulfil ? 'rounded-l-[12px]' : ''
                      }`}
                    >
                      Kode Part
                    </th>
                    <th
                      scope="col"
                      className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C]"
                    >
                      Nama Part
                    </th>
                    <th
                      scope="col"
                      className={`h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right ${
                        canEditFulfil ? 'rounded-r-[12px]' : ''
                      }`}
                    >
                      Jumlah
                    </th>
                    {!canEditFulfil && (
                      <th
                        scope="col"
                        className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right rounded-r-[12px]"
                      >
                        Status part
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {currentLines.map((line) => {
                    const info = resolvePartInfo(line);
                    const checked = validChecked.includes(line.id);
                    const lineStatus = getLineStatusLabel(line);
                    return (
                      <tr
                        key={line.id}
                        className="h-12 border-b border-[#EEF0F4] last:border-b-0"
                      >
                        {canEditFulfil && (
                          <td className="px-3.5 py-2">
                            <input
                              type="checkbox"
                              aria-label={`Pilih ${info.nama}`}
                              checked={checked}
                              onChange={() => toggleOne(line.id)}
                              className="w-4 h-4 accent-[#1D6FC4]"
                            />
                          </td>
                        )}
                        <td className="px-3.5 py-2 font-mono font-medium">{info.kode}</td>
                        <td className="px-3.5 py-2">{info.nama}</td>
                        <td className="px-3.5 py-2 text-right tabular-nums font-medium">
                          <data value={line.qty}>{line.qty}</data>
                        </td>
                        {!canEditFulfil && (
                          <td className="px-3.5 py-2 text-right">
                            <StatusChip status={lineStatus} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CenterDialog>
    );
  }

  // HO EYE POPUP (read-only)
  const statusLabel = getRequestStatusLabel(request);
  const totalHarga = computeRequestTotalHarga(request);
  const dp = request.dp || 0;
  const sisaBayar = computeRequestSisaBayar(request);
  const pemohonDisplay =
    request.requesterKind === 'pelanggan'
      ? `Pelanggan: ${request.customer?.nama || request.requesterName}`
      : 'Admin Gudang';

  return (
    <CenterDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Detail Permintaan HO ${request.id}`}
      subtitle={request.orderCode ? `Kode Pemenuhan: ${request.orderCode}` : undefined}
      hideHeaderClose
      maxWidthClass="max-w-[740px]"
      footer={
        <ActionButton type="button" intent="cancel" onClick={onClose}>
          Tutup
        </ActionButton>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-[12px] bg-[#F6F7FA] text-[13px]">
          <div>
            <dt className="text-[#646B7C]">Kode permintaan</dt>
            <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">{request.id}</dd>
          </div>
          <div>
            <dt className="text-[#646B7C]">Kode Pemenuhan</dt>
            <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">
              {request.orderCode || 'Belum ada'}
            </dd>
          </div>
          <div>
            <dt className="text-[#646B7C]">Pemohon</dt>
            <dd className="font-medium text-[#1E2230] mt-0.5">{pemohonDisplay}</dd>
          </div>
          <div>
            <dt className="text-[#646B7C]">Status</dt>
            <dd className="mt-1">
              <StatusChip status={statusLabel} />
            </dd>
          </div>
          <div>
            <dt className="text-[#646B7C]">Tanggal diajukan</dt>
            <dd className="font-mono text-[#1E2230] mt-0.5">{request.createdAt}</dd>
          </div>
          <div>
            <dt className="text-[#646B7C]">Tanggal sampai</dt>
            <dd className="font-mono text-[#1E2230] mt-0.5">
              {request.arrivedAt || 'Belum sampai'}
            </dd>
          </div>
          {request.processedAt && (
            <div>
              <dt className="text-[#646B7C]">Tanggal proses</dt>
              <dd className="font-mono text-[#1E2230] mt-0.5">{request.processedAt}</dd>
            </div>
          )}
        </dl>

        {request.requesterKind === 'pelanggan' && request.customer && (
          <div className="p-4 rounded-[12px] border border-[#EEF0F4] space-y-2">
            <h3 className="text-[13px] font-semibold text-[#1E2230]">Data pelanggan</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[#646B7C]">Nama</dt>
                <dd className="font-medium text-[#1E2230]">{request.customer.nama}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor HP</dt>
                <dd className="font-mono text-[#1E2230]">{request.customer.hp}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Email</dt>
                <dd className="text-[#1E2230]">{request.customer.email}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Alamat</dt>
                <dd className="text-[#1E2230]">{request.customer.alamat}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor mesin</dt>
                <dd className="font-mono font-medium text-[#1E2230]">
                  {request.customer.noMesin}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor rangka</dt>
                <dd className="font-mono font-medium text-[#1E2230]">
                  {request.customer.noRangka}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[14px] text-[#1E2230]">
            <thead>
              <tr className="bg-[#F6F7FA]">
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] rounded-l-[12px]"
                >
                  Kode Part
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C]"
                >
                  Nama Part
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right"
                >
                  Jumlah
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right"
                >
                  Harga satuan
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right rounded-r-[12px]"
                >
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {request.lines.map((line) => {
                const info = resolvePartInfo(line);
                const harga = line.hargaPerkiraan || 0;
                const sub = line.qty * harga;
                return (
                  <tr key={line.id} className="h-12 border-b border-[#EEF0F4] last:border-b-0">
                    <td className="px-3.5 py-2 font-mono font-medium">{info.kode}</td>
                    <td className="px-3.5 py-2">{info.nama}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{line.qty}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">
                      {formatRupiah(harga)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-medium">
                      {formatRupiah(sub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-[12px] bg-[#F6F7FA] space-y-2 text-[14px]">
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">Total harga</span>
            <output className="font-mono font-semibold tabular-nums text-[#1E2230]">
              {formatRupiah(totalHarga)}
            </output>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">DP</span>
            <output className="font-mono font-medium tabular-nums text-[#1E2230]">
              {formatRupiah(dp)}
            </output>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-[#EEF0F4]">
            <span className="font-semibold text-[#1E2230]">Sisa bayar</span>
            <output className="font-mono font-bold tabular-nums text-[#1E2230]">
              {formatRupiah(sisaBayar)}
            </output>
          </div>
        </div>

        {request.state === 'batal' && (
          <div className="p-4 rounded-[12px] bg-[#FDE3E9]/50 border border-[#FDE3E9] space-y-1 text-[13px]">
            <div>
              <span className="text-[#646B7C]">Alasan pembatalan: </span>
              <span className="font-medium text-[#1E2230]">
                {request.closeReason || 'Tidak dicatat'}
              </span>
            </div>
            <div>
              <span className="text-[#646B7C]">Tanggal pembatalan: </span>
              <span className="font-mono text-[#1E2230]">
                {request.closedAt || 'Tidak dicatat'}
              </span>
            </div>
          </div>
        )}
      </div>
    </CenterDialog>
  );
};

export interface ProcessHoDialogProps {
  isOpen: boolean;
  request: PurchaseRequest | null;
  parts: Part[];
  onClose: () => void;
  onProcessed?: (updated: PurchaseRequest) => void;
}

export const ProcessHoDialog: React.FC<ProcessHoDialogProps> = ({
  isOpen,
  request,
  parts,
  onClose,
  onProcessed,
}) => {
  const partMap = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of parts) {
      m.set(p.id, p);
      m.set(p.kode, p);
    }
    return m;
  }, [parts]);

  if (!request) {
    return (
      <CenterDialog isOpen={isOpen} onClose={onClose} title="Proses HO" hideHeaderClose>
        <div />
      </CenterDialog>
    );
  }

  const isCustomerHo = request.requesterKind === 'pelanggan';
  const totalHarga = computeRequestTotalHarga(request);
  const dp = request.dp || 0;
  const sisaBayar = computeRequestSisaBayar(request);

  const handleConfirmProcess = () => {
    const res = processHo(request.id);
    if (!res.ok || !res.request) return;
    const updated = res.request;
    onProcessed?.(updated);
    onClose();
    if (isCustomerHo) {
      printHoDocument(updated, parts, 'nota_ho');
    }
  };

  return (
    <CenterDialog
      isOpen={isOpen}
      onClose={onClose}
      title={`Proses HO ${request.orderCode || request.id}`}
      subtitle={`Kode permintaan: ${request.id}`}
      hideHeaderClose
      maxWidthClass="max-w-[720px]"
      footer={
        <>
          <ActionButton type="button" intent="cancel" onClick={onClose}>
            Tutup
          </ActionButton>
          <ActionButton type="button" intent="start" onClick={handleConfirmProcess}>
            {isCustomerHo ? 'Cetak nota' : 'Selesaikan proses'}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-5">
        {isCustomerHo && request.customer ? (
          <div className="p-4 rounded-[12px] bg-[#F6F7FA] space-y-2">
            <h3 className="text-[13px] font-semibold text-[#1E2230]">Data pelanggan</h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-[#646B7C]">Nama</dt>
                <dd className="font-medium text-[#1E2230]">{request.customer.nama}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor HP</dt>
                <dd className="font-mono text-[#1E2230]">{request.customer.hp}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Email</dt>
                <dd className="text-[#1E2230]">{request.customer.email}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Alamat</dt>
                <dd className="text-[#1E2230]">{request.customer.alamat}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor mesin</dt>
                <dd className="font-mono font-medium text-[#1E2230]">
                  {request.customer.noMesin}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Nomor rangka</dt>
                <dd className="font-mono font-medium text-[#1E2230]">
                  {request.customer.noRangka}
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <div className="p-4 rounded-[12px] bg-[#F6F7FA] text-[13px] text-[#1E2230]">
            <span className="text-[#646B7C]">Pemohon: </span>
            <span className="font-semibold">Bengkel (Admin Gudang)</span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-[14px] text-[#1E2230]">
            <thead>
              <tr className="bg-[#F6F7FA]">
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] rounded-l-[12px]"
                >
                  Kode Part
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C]"
                >
                  Nama Part
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right"
                >
                  Jumlah
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right"
                >
                  Harga satuan
                </th>
                <th
                  scope="col"
                  className="h-10 px-3.5 font-sans font-medium text-[12px] text-[#646B7C] text-right rounded-r-[12px]"
                >
                  Subtotal
                </th>
              </tr>
            </thead>
            <tbody>
              {request.lines.map((line) => {
                const p = partMap.get(line.partId);
                const kode = p?.kode || line.partId;
                const nama = p?.nama || line.partId;
                const harga = line.hargaPerkiraan || 0;
                const sub = line.qty * harga;
                return (
                  <tr key={line.id} className="h-12 border-b border-[#EEF0F4] last:border-b-0">
                    <td className="px-3.5 py-2 font-mono font-medium">{kode}</td>
                    <td className="px-3.5 py-2">{nama}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">{line.qty}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums">
                      {formatRupiah(harga)}
                    </td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-medium">
                      {formatRupiah(sub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="p-4 rounded-[12px] bg-[#F6F7FA] space-y-2 text-[14px]">
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">Total harga</span>
            <output className="font-mono font-semibold tabular-nums text-[#1E2230]">
              {formatRupiah(totalHarga)}
            </output>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[#646B7C]">DP</span>
            <output className="font-mono font-medium tabular-nums text-[#1E2230]">
              {formatRupiah(dp)}
            </output>
          </div>
          <div className="flex items-baseline justify-between pt-3 border-t border-[#EEF0F4]">
            <span className="font-semibold text-[#1E2230]">Sisa bayar</span>
            <output className="font-mono text-[28px] font-bold leading-tight tabular-nums text-[#1E2230]">
              {formatRupiah(sisaBayar)}
            </output>
          </div>
        </div>
      </div>
    </CenterDialog>
  );
};

export interface CancelHoDialogProps {
  isOpen: boolean;
  request: PurchaseRequest | null;
  onClose: () => void;
  onCancelled: (cancelledRequest: PurchaseRequest) => void;
}

export const CancelHoDialog: React.FC<CancelHoDialogProps> = ({
  isOpen,
  request,
  onClose,
  onCancelled,
}) => {
  const [reason, setReason] = useState<string>('');
  const [phoneCode, setPhoneCode] = useState<string>('');
  const [emailCode, setEmailCode] = useState<string>('');
  const [pin, setPin] = useState<string>('');

  const [phoneGenerated, setPhoneGenerated] = useState<string>('');
  const [emailGenerated, setEmailGenerated] = useState<string>('');
  const [phoneResendUntil, setPhoneResendUntil] = useState<number>(0);
  const [emailResendUntil, setEmailResendUntil] = useState<number>(0);

  const [error, setError] = useState<string>('');
  const [failCount, setFailCount] = useState<number>(0);
  const [lockedUntil, setLockedUntil] = useState<number>(0);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const isCustomerHo = request?.requesterKind === 'pelanggan';

  useEffect(() => {
    if (isOpen && request) {
      setReason('');
      setPhoneCode('');
      setEmailCode('');
      setPin('');
      setError('');
      setFailCount(0);
      setLockedUntil(0);
      setPhoneResendUntil(0);
      setEmailResendUntil(0);
      if (request.requesterKind === 'pelanggan') {
        setPhoneGenerated(generateCode());
        setEmailGenerated(generateCode());
      } else {
        setPhoneGenerated('');
        setEmailGenerated('');
      }
    }
  }, [isOpen, request]);

  useEffect(() => {
    if (!isOpen) return;
    if (lockedUntil <= Date.now() && phoneResendUntil <= Date.now() && emailResendUntil <= Date.now()) {
      return;
    }
    const id = window.setInterval(() => {
      const cur = Date.now();
      setNowMs(cur);
      if (lockedUntil > 0 && cur >= lockedUntil) {
        setLockedUntil(0);
        setFailCount(0);
        setError('');
      }
    }, 500);
    return () => window.clearInterval(id);
  }, [isOpen, lockedUntil, phoneResendUntil, emailResendUntil]);

  if (!request) {
    return (
      <CenterDialog isOpen={isOpen} onClose={onClose} title="Verifikasi pembatalan" hideHeaderClose>
        <div />
      </CenterDialog>
    );
  }

  const isLocked = lockedUntil > nowMs;
  const lockSec = isLocked ? Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;
  const phoneWaitSec =
    phoneResendUntil > nowMs ? Math.max(1, Math.ceil((phoneResendUntil - nowMs) / 1000)) : 0;
  const emailWaitSec =
    emailResendUntil > nowMs ? Math.max(1, Math.ceil((emailResendUntil - nowMs) / 1000)) : 0;

  const maskedHp = maskPhone(request.customer?.hp || '');
  const maskedMail = maskEmail(request.customer?.email || '');

  const handleSendPhoneCode = () => {
    if (phoneWaitSec > 0 || isLocked) return;
    const generated = generateCode();
    setPhoneGenerated(generated);
    setPhoneResendUntil(Date.now() + CODE_RESEND_WAIT_MS);
    setNowMs(Date.now());
  };

  const handleSendEmailCode = () => {
    if (emailWaitSec > 0 || isLocked) return;
    const generated = generateCode();
    setEmailGenerated(generated);
    setEmailResendUntil(Date.now() + CODE_RESEND_WAIT_MS);
    setNowMs(Date.now());
  };

  const isAllFilled = isCustomerHo
    ? reason.trim().length >= 5 &&
      phoneCode.trim().length > 0 &&
      emailCode.trim().length > 0 &&
      pin.trim().length > 0
    : reason.trim().length >= 5 && pin.trim().length > 0;

  const recordFailure = (msg: string) => {
    const next = failCount + 1;
    setFailCount(next);
    if (next >= 3) {
      const until = Date.now() + 30_000;
      setLockedUntil(until);
      setNowMs(Date.now());
      setError(`${msg} Dialog dikunci selama 30 detik.`);
    } else {
      setError(msg);
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (isLocked || !isAllFilled) return;

    if (isCustomerHo) {
      if (!isGeneratedCodeValid(phoneGenerated, phoneCode)) {
        recordFailure('Kode HP salah.');
        return;
      }
      if (!isGeneratedCodeValid(emailGenerated, emailCode)) {
        recordFailure('Kode email salah.');
        return;
      }
    }

    if (pin.trim() !== DUMMY_ADMIN_PIN) {
      recordFailure('PIN salah.');
      return;
    }

    const res = cancelHo({
      requestId: request.id,
      reason: reason.trim(),
      phoneCode: phoneCode.trim(),
      emailCode: emailCode.trim(),
      pin: pin.trim(),
      expectedPhoneCode: phoneGenerated || undefined,
      expectedEmailCode: emailGenerated || undefined,
    });

    if (!res.ok || !res.request) {
      setError(res.error || 'Pembatalan tidak dapat diproses.');
      return;
    }

    onCancelled(res.request);
    onClose();
  };

  return (
    <CenterDialog
      isOpen={isOpen}
      onClose={onClose}
      title="Verifikasi pembatalan"
      subtitle={request.orderCode || request.id}
      hideHeaderClose
      maxWidthClass="max-w-[520px]"
      footer={
        <>
          <ActionButton type="button" intent="cancel" onClick={onClose}>
            Tutup
          </ActionButton>
          <ActionButton
            type="button"
            intent="cancel"
            disabled={isLocked || !isAllFilled}
            onClick={() => handleSubmit()}
          >
            Batalkan permintaan
          </ActionButton>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormField
          id="cancel-ho-reason"
          label="Alasan (minimal 5 karakter)"
          error={
            reason.length > 0 && reason.trim().length < 5
              ? 'Alasan harus minimal 5 karakter.'
              : undefined
          }
        >
          <textarea
            id="cancel-ho-reason"
            rows={3}
            disabled={isLocked}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (!isLocked && error) setError('');
            }}
            placeholder="Tulis alasan pembatalan pesanan HO"
            className="admin-input"
          />
        </FormField>

        {isCustomerHo && (
          <>
            <div className="p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4] space-y-1.5 text-[12px]">
              <p className="font-semibold text-[#1E2230]">
                Prototype: kode ini seharusnya dikirim ke HP dan email.
              </p>
              <div className="flex flex-wrap gap-4 text-[#646B7C]">
                <span>
                  Kode HP ({maskedHp}):{' '}
                  <samp className="font-mono font-bold text-[#1E2230]">
                    {phoneGenerated || '------'}
                  </samp>
                </span>
                <span>
                  Kode email ({maskedMail}):{' '}
                  <samp className="font-mono font-bold text-[#1E2230]">
                    {emailGenerated || '------'}
                  </samp>
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="cancel-ho-phone-code"
                  className="font-sans font-medium text-[13px] text-[#1E2230]"
                >
                  Kode verifikasi HP <span className="text-[#646B7C]">({maskedHp})</span>
                </label>
                <ActionButton
                  type="button"
                  intent="neutral"
                  disabled={isLocked || phoneWaitSec > 0}
                  onClick={handleSendPhoneCode}
                  className="min-h-[32px] px-3 py-1 text-[12px]"
                >
                  {phoneWaitSec > 0
                    ? `Kirim kode ke HP (${phoneWaitSec}d)`
                    : `Kirim kode ke HP (${maskedHp})`}
                </ActionButton>
              </div>
              <input
                id="cancel-ho-phone-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                disabled={isLocked}
                value={phoneCode}
                onChange={(e) => {
                  setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (!isLocked && error) setError('');
                }}
                placeholder="6 digit kode HP"
                className="admin-input font-mono"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="cancel-ho-email-code"
                  className="font-sans font-medium text-[13px] text-[#1E2230]"
                >
                  Kode verifikasi email <span className="text-[#646B7C]">({maskedMail})</span>
                </label>
                <ActionButton
                  type="button"
                  intent="neutral"
                  disabled={isLocked || emailWaitSec > 0}
                  onClick={handleSendEmailCode}
                  className="min-h-[32px] px-3 py-1 text-[12px]"
                >
                  {emailWaitSec > 0
                    ? `Kirim kode ke email (${emailWaitSec}d)`
                    : `Kirim kode ke email (${maskedMail})`}
                </ActionButton>
              </div>
              <input
                id="cancel-ho-email-code"
                type="text"
                inputMode="numeric"
                maxLength={6}
                disabled={isLocked}
                value={emailCode}
                onChange={(e) => {
                  setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  if (!isLocked && error) setError('');
                }}
                placeholder="6 digit kode email"
                className="admin-input font-mono"
              />
            </div>
          </>
        )}

        <FormField id="cancel-ho-pin" label="PIN admin">
          <input
            id="cancel-ho-pin"
            type="password"
            inputMode="numeric"
            disabled={isLocked}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, ''));
              if (!isLocked && error) setError('');
            }}
            placeholder="Masukkan PIN admin"
            className="admin-input font-mono tracking-widest"
          />
        </FormField>

        {(error || isLocked) && (
          <p role="alert" className="text-[13px] font-medium text-[#D62E5A]">
            {isLocked
              ? `${error || 'Terlalu banyak percobaan salah.'} (${lockSec} detik tersisa)`
              : error}
          </p>
        )}
      </form>
    </CenterDialog>
  );
};
