import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  approveRegulerRequest,
  createHoRequest,
  createRegulerRequest,
  getNextPmtCode,
  rejectRegulerRequest,
  useAdmin,
} from '../../context/AdminContext';
import {
  Part,
  PurchaseRequest,
  computeRequestFulfilledQty,
  computeStock,
  getRequestStatusLabel,
} from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { StatusChip } from '../../components/admin/StatusChip';
import {
  ActionButton,
  CheckIconButton,
  EyeIconButton,
  PrinterIconButton,
  ProcessIconButton,
  XIconButton,
} from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { FormField } from '../../components/admin/FormField';
import { CancelReasonPanel } from '../../components/admin/CancelReasonPanel';
import {
  CancelHoDialog,
  ProcessHoDialog,
  RequestEyeDialog,
  printHoDocument,
} from '../../components/admin/GudangModals';
import {
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';

type TabKey = 'Semua' | 'Permintaan Reguler' | 'Permintaan HO';

interface DraftLineRow {
  rowId: string;
  partId: string;
  searchQuery: string;
  qty: string;
  hargaPerkiraan: string;
}

const makeEmptyLine = (): DraftLineRow => ({
  rowId: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  partId: '',
  searchQuery: '',
  qty: '1',
  hargaPerkiraan: '',
});

const V2PurchaseRequests: React.FC = () => {
  const navigate = useNavigate();
  const { purchaseRequests, parts, stockMovements } = useAdmin();
  const { notify } = useActionIsland();

  const [activeTab, setActiveTab] = useState<TabKey>('Semua');
  const [flashRowId, setFlashRowId] = useState<string | null>(null);
  const [approveErrorBanner, setApproveErrorBanner] = useState<string>('');

  // Dialogs & Panels state
  const [eyeRequestId, setEyeRequestId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PurchaseRequest | null>(null);
  const [processHoTargetId, setProcessHoTargetId] = useState<string | null>(null);
  const [cancelHoTargetId, setCancelHoTargetId] = useState<string | null>(null);

  // Ajukan Reguler SidePanel
  const [regulerPanelOpen, setRegulerPanelOpen] = useState(false);
  const [regReasonOption, setRegReasonOption] = useState<
    'Stok di bawah minimum' | 'Permintaan bengkel' | 'Lainnya'
  >('Stok di bawah minimum');
  const [regReasonCustom, setRegReasonCustom] = useState<string>('');
  const [regLines, setRegLines] = useState<DraftLineRow[]>([makeEmptyLine()]);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});

  // Ajukan HO SidePanel
  const [hoPanelOpen, setHoPanelOpen] = useState(false);
  const [hoRequesterKind, setHoRequesterKind] = useState<'bengkel' | 'pelanggan'>('pelanggan');
  const [hoLines, setHoLines] = useState<DraftLineRow[]>([makeEmptyLine()]);
  const [hoNama, setHoNama] = useState<string>('');
  const [hoAlamat, setHoAlamat] = useState<string>('');
  const [hoNoMesin, setHoNoMesin] = useState<string>('');
  const [hoNoRangka, setHoNoRangka] = useState<string>('');
  const [hoHp, setHoHp] = useState<string>('');
  const [hoEmail, setHoEmail] = useState<string>('');
  const [hoDp, setHoDp] = useState<string>('0');
  const [hoErrors, setHoErrors] = useState<Record<string, string>>({});

  const triggerFlash = (id: string) => {
    setFlashRowId(id);
    window.setTimeout(() => {
      setFlashRowId((cur) => (cur === id ? null : cur));
    }, 800);
  };

  const eyeRequest = useMemo(
    () => purchaseRequests.find((r) => r.id === eyeRequestId) ?? null,
    [purchaseRequests, eyeRequestId]
  );

  const processHoTarget = useMemo(
    () => purchaseRequests.find((r) => r.id === processHoTargetId) ?? null,
    [purchaseRequests, processHoTargetId]
  );

  const cancelHoTarget = useMemo(
    () => purchaseRequests.find((r) => r.id === cancelHoTargetId) ?? null,
    [purchaseRequests, cancelHoTargetId]
  );

  const filteredRequests = useMemo(() => {
    if (activeTab === 'Permintaan Reguler') {
      return purchaseRequests.filter((r) => r.type === 'reguler');
    }
    if (activeTab === 'Permintaan HO') {
      return purchaseRequests.filter((r) => r.type === 'ho');
    }
    return purchaseRequests;
  }, [purchaseRequests, activeTab]);

  const formatPemohon = (req: PurchaseRequest): string => {
    if (req.type === 'ho' && req.requesterKind === 'pelanggan') {
      return `Pelanggan: ${req.customer?.nama || req.requesterName}`;
    }
    return 'Admin Gudang';
  };

  const formatAjuan = (req: PurchaseRequest): string => {
    if (req.type === 'reguler') return 'Reguler';
    return req.requesterKind === 'pelanggan' ? 'HO (Pelanggan)' : 'HO (Bengkel)';
  };

  const handleSetujuiReguler = (req: PurchaseRequest) => {
    setApproveErrorBanner('');
    const res = approveRegulerRequest(req.id);
    if (!res.ok || !res.request) {
      setApproveErrorBanner(
        res.error || 'Tidak ada part yang dipenuhi. Pilih minimal satu part.'
      );
      return;
    }
    const updated = res.request;
    triggerFlash(updated.id);
    notify(`${updated.id} disetujui. Kode pesanan ${updated.orderCode}.`, {
      actionLabel: 'Buka',
      onAction: () => navigate('/admin/v2/warehouse?tab=Akan+Datang'),
      durationMs: 4500,
    });
  };

  const renderRowActions = (req: PurchaseRequest) => {
    if (req.type === 'reguler') {
      return (
        <div
          className="flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <EyeIconButton
            ariaLabel={`Lihat detail ${req.id}`}
            title="Lihat detail"
            onClick={(e) => {
              e.stopPropagation();
              setLastTriggerElement(e.currentTarget);
              setEyeRequestId(req.id);
            }}
          />
          {req.state === 'diajukan' && (
            <>
              <CheckIconButton
                ariaLabel="Setujui"
                title="Setujui"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSetujuiReguler(req);
                }}
              />
              <XIconButton
                ariaLabel="Tolak"
                title="Tolak"
                onClick={(e) => {
                  e.stopPropagation();
                  setLastTriggerElement(e.currentTarget);
                  setRejectTarget(req);
                }}
              />
            </>
          )}
        </div>
      );
    }

    // HO row actions
    const isBelumOrSampai = req.state === 'belum_sampai' || req.state === 'sampai';
    const isProsesDisabled = req.state !== 'sampai';

    return (
      <div
        className="flex items-center justify-end gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <EyeIconButton
          ariaLabel={`Lihat detail ${req.id}`}
          title="Lihat detail"
          onClick={(e) => {
            e.stopPropagation();
            setLastTriggerElement(e.currentTarget);
            setEyeRequestId(req.id);
          }}
        />
        {isBelumOrSampai && (
          <>
            <ProcessIconButton
              ariaLabel="Proses"
              title={
                isProsesDisabled
                  ? 'Barang belum sampai. Approve di Pengelolaan Gudang, tab Akan Datang.'
                  : 'Proses HO'
              }
              ariaDisabled={isProsesDisabled}
              onClick={(e) => {
                e.stopPropagation();
                if (isProsesDisabled) return;
                setLastTriggerElement(e.currentTarget);
                setProcessHoTargetId(req.id);
              }}
            />
            <XIconButton
              ariaLabel="Batal"
              title="Batal"
              onClick={(e) => {
                e.stopPropagation();
                setLastTriggerElement(e.currentTarget);
                setCancelHoTargetId(req.id);
              }}
            />
          </>
        )}
        <PrinterIconButton
          ariaLabel={
            req.state === 'batal'
              ? 'Cetak bukti pembatalan HO'
              : req.state === 'selesai'
              ? 'Cetak nota HO'
              : 'Cetak nota DP'
          }
          title={
            req.state === 'batal'
              ? 'Cetak bukti pembatalan HO'
              : req.state === 'selesai'
              ? 'Cetak nota HO'
              : 'Cetak nota DP'
          }
          onClick={(e) => {
            e.stopPropagation();
            if (req.state === 'batal') {
              printHoDocument(req, parts, 'batal_ho');
            } else if (req.state === 'selesai') {
              printHoDocument(req, parts, 'nota_ho');
            } else {
              printHoDocument(req, parts, 'nota_dp');
            }
          }}
        />
      </div>
    );
  };

  // Columns for Semua: Kode permintaan, Pemohon, Jumlah part, Status, Ajuan, Aksi, Diajukan
  const semuaColumns: Column<PurchaseRequest>[] = [
    {
      key: 'id',
      header: 'Kode permintaan',
      render: (r) => <samp className="font-mono font-semibold text-[#1E2230]">{r.id}</samp>,
    },
    {
      key: 'pemohon',
      header: 'Pemohon',
      render: (r) => <span className="font-medium text-[#1E2230]">{formatPemohon(r)}</span>,
    },
    {
      key: 'jumlahPart',
      header: 'Jumlah part',
      align: 'right',
      render: (r) => {
        const qty = computeRequestFulfilledQty(r);
        return (
          <data value={qty} className="tabular-nums font-medium">
            {qty}
          </data>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={getRequestStatusLabel(r)} />,
    },
    {
      key: 'ajuan',
      header: 'Ajuan',
      render: (r) => <span className="text-[13px] font-medium text-[#1E2230]">{formatAjuan(r)}</span>,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => renderRowActions(r),
    },
    {
      key: 'createdAt',
      header: 'Diajukan',
      render: (r) => <span className="font-mono text-[13px] text-[#646B7C]">{r.createdAt}</span>,
    },
  ];

  // Columns for Permintaan Reguler and Permintaan HO: Kode permintaan, Kode Pemenuhan, Jumlah, Pemohon, Diajukan, Aksi
  const typeTabColumns: Column<PurchaseRequest>[] = [
    {
      key: 'id',
      header: 'Kode permintaan',
      render: (r) => <samp className="font-mono font-semibold text-[#1E2230]">{r.id}</samp>,
    },
    {
      key: 'orderCode',
      header: 'Kode Pemenuhan',
      render: (r) => (
        <samp className="font-mono text-[13px] font-medium text-[#1E2230]">
          {r.orderCode || 'Belum ada'}
        </samp>
      ),
    },
    {
      key: 'jumlah',
      header: 'Jumlah',
      align: 'right',
      render: (r) => {
        const qty = computeRequestFulfilledQty(r);
        return (
          <data value={qty} className="tabular-nums font-medium">
            {qty}
          </data>
        );
      },
    },
    {
      key: 'pemohon',
      header: 'Pemohon',
      render: (r) => <span className="font-medium text-[#1E2230]">{formatPemohon(r)}</span>,
    },
    {
      key: 'createdAt',
      header: 'Diajukan',
      render: (r) => <span className="font-mono text-[13px] text-[#646B7C]">{r.createdAt}</span>,
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => renderRowActions(r),
    },
  ];

  // Open Ajukan Reguler
  const openRegulerPanel = (trigger: HTMLElement) => {
    setLastTriggerElement(trigger);
    setRegReasonOption('Stok di bawah minimum');
    setRegReasonCustom('');
    setRegLines([makeEmptyLine()]);
    setRegErrors({});
    setRegulerPanelOpen(true);
  };

  // Open Ajukan HO
  const openHoPanel = (trigger: HTMLElement) => {
    setLastTriggerElement(trigger);
    setHoRequesterKind('pelanggan');
    setHoLines([makeEmptyLine()]);
    setHoNama('');
    setHoAlamat('');
    setHoNoMesin('');
    setHoNoRangka('');
    setHoHp('');
    setHoEmail('');
    setHoDp('0');
    setHoErrors({});
    setHoPanelOpen(true);
  };

  const regTotalPerkiraan = useMemo(() => {
    return regLines.reduce((sum, l) => {
      const q = Math.max(0, Math.floor(Number(l.qty) || 0));
      const h = Math.max(0, Number(l.hargaPerkiraan) || 0);
      return sum + q * h;
    }, 0);
  }, [regLines]);

  const hoTotalHarga = useMemo(() => {
    return hoLines.reduce((sum, l) => {
      const q = Math.max(0, Math.floor(Number(l.qty) || 0));
      const h = Math.max(0, Number(l.hargaPerkiraan) || 0);
      return sum + q * h;
    }, 0);
  }, [hoLines]);

  const hoDpNumber = Math.max(0, Number(hoDp) || 0);
  const hoSisaBayar = hoTotalHarga - hoDpNumber;

  const handleSubmitReguler = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const errs: Record<string, string> = {};

    const finalReason =
      regReasonOption === 'Lainnya' ? regReasonCustom.trim() : regReasonOption;
    if (regReasonOption === 'Lainnya' && !finalReason) {
      errs.reason = 'Alasan wajib diisi. Tuliskan alasan pengajuan pada kolom ini.';
    }

    const seenParts = new Set<string>();
    regLines.forEach((line, idx) => {
      if (!line.partId) {
        errs[`line-part-${idx}`] = 'Pilih part dari daftar.';
      } else if (seenParts.has(line.partId)) {
        errs[`line-part-${idx}`] = 'Part ini sudah ada di daftar.';
      } else {
        seenParts.add(line.partId);
      }

      const q = Number(line.qty);
      if (!Number.isInteger(q) || q < 1) {
        errs[`line-qty-${idx}`] = 'Masukkan jumlah bilangan bulat minimal 1.';
      }
    });

    if (Object.keys(errs).length > 0) {
      setRegErrors(errs);
      return;
    }

    const res = createRegulerRequest({
      requestReason: finalReason,
      lines: regLines.map((l) => {
        const chosen = parts.find((p) => p.id === l.partId || p.kode === l.partId);
        const h = Number(l.hargaPerkiraan);
        return {
          partId: chosen?.id || l.partId,
          qty: Math.floor(Number(l.qty)),
          hargaPerkiraan: h > 0 ? h : chosen?.hargaBeli || 0,
        };
      }),
    });

    if (!res.ok || !res.request) {
      setRegErrors({ form: res.error || 'Periksa kembali data pengajuan.' });
      return;
    }

    setRegulerPanelOpen(false);
    triggerFlash(res.request.id);
    notify(`Permintaan Reguler ${res.request.id} diajukan.`);
  };

  const handleSubmitHo = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const errs: Record<string, string> = {};

    const seenParts = new Set<string>();
    hoLines.forEach((line, idx) => {
      if (!line.partId) {
        errs[`line-part-${idx}`] = 'Pilih part dari daftar.';
      } else if (seenParts.has(line.partId)) {
        errs[`line-part-${idx}`] = 'Part ini sudah ada di daftar.';
      } else {
        seenParts.add(line.partId);
      }

      const q = Number(line.qty);
      if (!Number.isInteger(q) || q < 1) {
        errs[`line-qty-${idx}`] = 'Masukkan jumlah bilangan bulat minimal 1.';
      }

      if (hoRequesterKind === 'pelanggan') {
        const h = Number(line.hargaPerkiraan);
        if (!line.hargaPerkiraan.trim() || Number.isNaN(h) || h <= 0) {
          errs[`line-price-${idx}`] = 'Masukkan harga per unit lebih dari 0.';
        }
      }
    });

    if (hoRequesterKind === 'pelanggan') {
      if (!hoNama.trim()) {
        errs.nama = 'Nama pelanggan wajib diisi.';
      }
      if (!hoAlamat.trim()) {
        errs.alamat = 'Alamat pelanggan wajib diisi.';
      }
      if (!hoNoMesin.trim()) {
        errs.noMesin = 'Nomor mesin wajib diisi.';
      }
      if (!hoNoRangka.trim()) {
        errs.noRangka = 'Nomor rangka wajib diisi.';
      }
      const digitsHp = hoHp.replace(/\D/g, '');
      if (digitsHp.length < 9 || digitsHp.length > 13) {
        errs.hp = 'Nomor HP harus terdiri dari 9 hingga 13 angka.';
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hoEmail.trim())) {
        errs.email = 'Masukkan alamat email dengan format yang benar.';
      }
      if (hoDpNumber < 0) {
        errs.dp = 'DP minimal Rp 0.';
      } else if (hoDpNumber > hoTotalHarga) {
        errs.dp = 'DP tidak boleh lebih besar dari total harga.';
      }
    }

    if (Object.keys(errs).length > 0) {
      setHoErrors(errs);
      return;
    }

    const res = createHoRequest({
      requesterKind: hoRequesterKind,
      lines: hoLines.map((l) => {
        const chosen = parts.find((p) => p.id === l.partId || p.kode === l.partId);
        const h = Number(l.hargaPerkiraan);
        return {
          partId: chosen?.id || l.partId,
          qty: Math.floor(Number(l.qty)),
          hargaPerkiraan: h > 0 ? h : chosen?.hargaJual || chosen?.hargaBeli || 0,
        };
      }),
      customer:
        hoRequesterKind === 'pelanggan'
          ? {
              nama: hoNama.trim(),
              alamat: hoAlamat.trim(),
              noMesin: hoNoMesin.trim(),
              noRangka: hoNoRangka.trim(),
              hp: hoHp.replace(/\D/g, ''),
              email: hoEmail.trim(),
            }
          : undefined,
      dp: hoRequesterKind === 'pelanggan' ? hoDpNumber : 0,
    });

    if (!res.ok || !res.request) {
      setHoErrors({ form: res.error || 'Periksa kembali data pengajuan HO.' });
      return;
    }

    const created = res.request;
    setHoPanelOpen(false);
    triggerFlash(created.id);

    if (created.requesterKind === 'pelanggan') {
      notify(`Permintaan HO ${created.orderCode} masuk ke Akan Datang.`, {
        actionLabel: 'Cetak nota DP',
        onAction: () => printHoDocument(created, parts, 'nota_dp'),
        durationMs: 5000,
      });
    } else {
      notify(`Permintaan HO ${created.orderCode} masuk ke Akan Datang.`);
    }
  };

  const renderLinesTableEditor = (
    lines: DraftLineRow[],
    setLines: React.Dispatch<React.SetStateAction<DraftLineRow[]>>,
    errors: Record<string, string>,
    setErrors: React.Dispatch<React.SetStateAction<Record<string, string>>>,
    requirePrice: boolean,
    prefix: string
  ) => {
    const updateRow = (idx: number, patch: Partial<DraftLineRow>) => {
      setLines((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
    };

    const removeRow = (idx: number) => {
      if (lines.length <= 1) return;
      setLines((prev) => prev.filter((_, i) => i !== idx));
    };

    const addRow = () => {
      if (lines.length >= 20) return;
      setLines((prev) => [...prev, makeEmptyLine()]);
    };

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="font-sans font-medium text-[13px] text-[#1E2230]">
            Daftar part ({lines.length}/20)
          </span>
          <ActionButton
            type="button"
            intent="neutral"
            disabled={lines.length >= 20}
            onClick={addRow}
            className="min-h-[34px] px-3 py-1 text-[13px]"
          >
            Tambah part
          </ActionButton>
        </div>

        <div className="overflow-x-auto border border-[#EEF0F4] rounded-[12px]">
          <table className="w-full text-left border-collapse text-[13px] text-[#1E2230] min-w-[480px]">
            <thead>
              <tr className="bg-[#F6F7FA]">
                <th scope="col" className="h-9 px-3 font-medium text-[12px] text-[#646B7C]">
                  Part
                </th>
                <th
                  scope="col"
                  className="h-9 px-3 font-medium text-[12px] text-[#646B7C] w-24 text-right"
                >
                  Jumlah
                </th>
                <th
                  scope="col"
                  className="h-9 px-3 font-medium text-[12px] text-[#646B7C] w-36 text-right"
                >
                  {requirePrice ? 'Harga per unit (Rp)' : 'Perkiraan harga/unit'}
                </th>
                <th scope="col" className="h-9 px-3 font-medium text-[12px] text-[#646B7C] w-20 text-right">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row, idx) => {
                const qFilter = row.searchQuery.trim().toLowerCase();
                const matchingParts = parts.filter(
                  (p) =>
                    !qFilter ||
                    p.kode.toLowerCase().includes(qFilter) ||
                    p.nama.toLowerCase().includes(qFilter) ||
                    p.id === row.partId
                );
                const partErr = errors[`line-part-${idx}`];
                const qtyErr = errors[`line-qty-${idx}`];
                const priceErr = errors[`line-price-${idx}`];

                return (
                  <tr
                    key={row.rowId}
                    className="border-b border-[#EEF0F4] last:border-b-0 align-top"
                  >
                    <td className="p-2.5 space-y-1.5">
                      <input
                        type="search"
                        aria-label={`Filter part baris ${idx + 1}`}
                        placeholder="Ketik kode atau nama part..."
                        value={row.searchQuery}
                        onChange={(e) => updateRow(idx, { searchQuery: e.target.value })}
                        className="admin-input min-h-[34px] py-1 text-[12px]"
                      />
                      <select
                        id={`${prefix}-part-${idx}`}
                        aria-label={`Pilih part baris ${idx + 1}`}
                        value={row.partId}
                        onChange={(e) => {
                          const val = e.target.value;
                          const chosen = parts.find((p) => p.id === val || p.kode === val);
                          const defaultPrice = chosen
                            ? requirePrice
                              ? String(chosen.hargaJual || chosen.hargaBeli || '')
                              : String(chosen.hargaBeli || '')
                            : row.hargaPerkiraan;

                          const duplicate = lines.some(
                            (other, oIdx) => oIdx !== idx && val && other.partId === val
                          );
                          setErrors((prev) => {
                            const next = { ...prev };
                            if (duplicate) {
                              next[`line-part-${idx}`] = 'Part ini sudah ada di daftar.';
                            } else {
                              delete next[`line-part-${idx}`];
                            }
                            return next;
                          });

                          updateRow(idx, {
                            partId: val,
                            hargaPerkiraan: row.hargaPerkiraan || defaultPrice,
                          });
                        }}
                        className="admin-input min-h-[38px] py-1.5 text-[13px]"
                      >
                        <option value="">Pilih part</option>
                        {matchingParts.map((p: Part) => {
                          const stk = computeStock(p, stockMovements);
                          return (
                            <option key={p.id} value={p.id}>
                              {p.kode} - {p.nama} ({p.satuan}, stok: {stk})
                            </option>
                          );
                        })}
                      </select>
                      {partErr && (
                        <p role="alert" className="text-[12px] text-[#D62E5A]">
                          {partErr}
                        </p>
                      )}
                    </td>

                    <td className="p-2.5">
                      <input
                        id={`${prefix}-qty-${idx}`}
                        type="number"
                        min={1}
                        step={1}
                        aria-label={`Jumlah baris ${idx + 1}`}
                        value={row.qty}
                        onChange={(e) => {
                          updateRow(idx, { qty: e.target.value });
                          if (qtyErr) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next[`line-qty-${idx}`];
                              return next;
                            });
                          }
                        }}
                        className="admin-input min-h-[38px] py-1.5 text-right tabular-nums"
                      />
                      {qtyErr && (
                        <p role="alert" className="text-[12px] text-[#D62E5A] mt-1 text-left">
                          {qtyErr}
                        </p>
                      )}
                    </td>

                    <td className="p-2.5">
                      <input
                        id={`${prefix}-price-${idx}`}
                        type="number"
                        min={0}
                        step={1000}
                        aria-label={`Harga unit baris ${idx + 1}`}
                        placeholder="0"
                        value={row.hargaPerkiraan}
                        onChange={(e) => {
                          updateRow(idx, { hargaPerkiraan: e.target.value });
                          if (priceErr) {
                            setErrors((prev) => {
                              const next = { ...prev };
                              delete next[`line-price-${idx}`];
                              return next;
                            });
                          }
                        }}
                        className="admin-input min-h-[38px] py-1.5 text-right tabular-nums"
                      />
                      {priceErr && (
                        <p role="alert" className="text-[12px] text-[#D62E5A] mt-1 text-left">
                          {priceErr}
                        </p>
                      )}
                    </td>

                    <td className="p-2.5 text-right">
                      <XIconButton
                        ariaLabel={`Hapus baris part ${idx + 1}`}
                        title={`Hapus baris part ${idx + 1}`}
                        disabled={lines.length <= 1}
                        onClick={() => removeRow(idx)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="text-[12px] text-[#646B7C]">
          Part tidak ada? Tambahkan lewat{' '}
          <Link
            to="/admin/v2/master-gudang"
            className="font-semibold text-[#1D6FC4] underline underline-offset-2"
          >
            Master Gudang
          </Link>
          .
        </p>
      </div>
    );
  };

  return (
    <>
      <DataCard
        title="Permintaan Penyediaan"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <FilterTabs
              ariaLabel="Filter tab permintaan penyediaan"
              value={activeTab}
              onChange={(val) => {
                setActiveTab(val as TabKey);
                setApproveErrorBanner('');
              }}
              tabs={[
                { value: 'Semua', label: 'Semua', count: purchaseRequests.length },
                {
                  value: 'Permintaan Reguler',
                  label: 'Permintaan Reguler',
                  count: purchaseRequests.filter((r) => r.type === 'reguler').length,
                },
                {
                  value: 'Permintaan HO',
                  label: 'Permintaan HO',
                  count: purchaseRequests.filter((r) => r.type === 'ho').length,
                },
              ]}
            />

            {activeTab === 'Permintaan Reguler' && (
              <ActionButton
                type="button"
                intent="start"
                onClick={(e) => openRegulerPanel(e.currentTarget)}
              >
                Ajukan Reguler
              </ActionButton>
            )}

            {activeTab === 'Permintaan HO' && (
              <ActionButton
                type="button"
                intent="start"
                onClick={(e) => openHoPanel(e.currentTarget)}
              >
                Ajukan HO
              </ActionButton>
            )}
          </div>
        }
      >
        {approveErrorBanner && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-[12px] bg-[#FDE3E9] text-[#B4234A] text-[13px] font-medium flex items-center justify-between gap-3"
          >
            <span>{approveErrorBanner}</span>
            <button
              type="button"
              onClick={() => setApproveErrorBanner('')}
              className="text-[12px] font-semibold underline"
            >
              Tutup
            </button>
          </div>
        )}

        <DataTable
          columns={activeTab === 'Semua' ? semuaColumns : typeTabColumns}
          data={filteredRequests}
          keyExtractor={(r) => r.id}
          flashKey={flashRowId}
          emptyMessage="Belum ada permintaan penyediaan pada tab ini."
          swapKey={activeTab}
        />
      </DataCard>

      {/* Eye Popup (Reguler & HO) */}
      <RequestEyeDialog
        isOpen={Boolean(eyeRequestId)}
        request={eyeRequest}
        parts={parts}
        onClose={() => setEyeRequestId(null)}
      />

      {/* Tolak Reguler Reason Panel */}
      <CancelReasonPanel
        isOpen={Boolean(rejectTarget)}
        title={rejectTarget ? `Tolak permintaan ${rejectTarget.id}` : 'Tolak permintaan'}
        onClose={() => setRejectTarget(null)}
        onConfirm={(reason) => {
          if (!rejectTarget) return;
          const res = rejectRegulerRequest(rejectTarget.id, reason);
          if (!res.ok) return res;
          triggerFlash(rejectTarget.id);
          notify(`${rejectTarget.id} ditolak.`);
          return { ok: true };
        }}
      />

      {/* Proses HO Dialog */}
      <ProcessHoDialog
        isOpen={Boolean(processHoTargetId)}
        request={processHoTarget}
        parts={parts}
        onClose={() => setProcessHoTargetId(null)}
        onProcessed={(updated) => {
          triggerFlash(updated.id);
          notify(`Permintaan HO ${updated.orderCode || updated.id} selesai diproses.`);
        }}
      />

      {/* Batal HO Verification Dialog */}
      <CancelHoDialog
        isOpen={Boolean(cancelHoTargetId)}
        request={cancelHoTarget}
        onClose={() => setCancelHoTargetId(null)}
        onCancelled={(cancelled) => {
          triggerFlash(cancelled.id);
          const codeLabel = cancelled.orderCode || cancelled.id;
          notify(`${codeLabel} dibatalkan.`, {
            actionLabel: 'Cetak',
            onAction: () => printHoDocument(cancelled, parts, 'batal_ho'),
            durationMs: 5000,
          });
        }}
      />

      {/* Ajukan Reguler SidePanel */}
      <SidePanel
        isOpen={regulerPanelOpen}
        onClose={() => setRegulerPanelOpen(false)}
        title="Ajukan Reguler"
        widthClass="max-w-[680px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="cancel"
              onClick={() => setRegulerPanelOpen(false)}
            >
              Tutup
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              onClick={() => handleSubmitReguler()}
            >
              Ajukan
            </ActionButton>
          </>
        }
      >
        <form onSubmit={handleSubmitReguler} noValidate className="space-y-5">
          <dl className="grid grid-cols-3 gap-3 p-3.5 rounded-[12px] bg-[#F6F7FA] text-[13px]">
            <div>
              <dt className="text-[#646B7C]">Kode permintaan</dt>
              <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">
                {getNextPmtCode()}
              </dd>
            </div>
            <div>
              <dt className="text-[#646B7C]">Pemohon</dt>
              <dd className="font-medium text-[#1E2230] mt-0.5">Admin Gudang</dd>
            </div>
            <div>
              <dt className="text-[#646B7C]">Jenis</dt>
              <dd className="font-semibold text-[#1E2230] mt-0.5">Reguler</dd>
            </div>
          </dl>

          <FormField id="reg-reason-select" label="Alasan">
            <select
              id="reg-reason-select"
              value={regReasonOption}
              onChange={(e) =>
                setRegReasonOption(
                  e.target.value as
                    | 'Stok di bawah minimum'
                    | 'Permintaan bengkel'
                    | 'Lainnya'
                )
              }
              className="admin-input"
            >
              <option value="Stok di bawah minimum">Stok di bawah minimum</option>
              <option value="Permintaan bengkel">Permintaan bengkel</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </FormField>

          {regReasonOption === 'Lainnya' && (
            <FormField
              id="reg-reason-custom"
              label="Keterangan alasan"
              error={regErrors.reason}
            >
              <textarea
                id="reg-reason-custom"
                rows={2}
                value={regReasonCustom}
                onChange={(e) => {
                  setRegReasonCustom(e.target.value);
                  if (regErrors.reason) {
                    setRegErrors((prev) => {
                      const next = { ...prev };
                      delete next.reason;
                      return next;
                    });
                  }
                }}
                placeholder="Tulis alasan pengajuan"
                className="admin-input"
              />
            </FormField>
          )}

          {renderLinesTableEditor(
            regLines,
            setRegLines,
            regErrors,
            setRegErrors,
            false,
            'reg'
          )}

          {regTotalPerkiraan > 0 && (
            <div className="p-3.5 rounded-[12px] bg-[#F6F7FA] flex items-center justify-between text-[14px]">
              <span className="text-[#646B7C]">Total perkiraan</span>
              <output className="font-mono font-semibold tabular-nums text-[#1E2230]">
                {formatRupiah(regTotalPerkiraan)}
              </output>
            </div>
          )}

          {regErrors.form && (
            <p role="alert" className="text-[13px] font-medium text-[#D62E5A]">
              {regErrors.form}
            </p>
          )}
        </form>
      </SidePanel>

      {/* Ajukan HO SidePanel */}
      <SidePanel
        isOpen={hoPanelOpen}
        onClose={() => setHoPanelOpen(false)}
        title="Ajukan HO"
        widthClass="max-w-[700px]"
        footer={
          <>
            <ActionButton
              type="button"
              intent="cancel"
              onClick={() => setHoPanelOpen(false)}
            >
              Tutup
            </ActionButton>
            <ActionButton
              type="button"
              intent="start"
              onClick={() => handleSubmitHo()}
            >
              Simpan
            </ActionButton>
          </>
        }
      >
        <form onSubmit={handleSubmitHo} noValidate className="space-y-5">
          <div>
            <span className="block font-sans font-medium text-[13px] text-[#1E2230] mb-1.5">
              Permintaan
            </span>
            <FilterTabs
              ariaLabel="Jenis pemohon HO"
              value={hoRequesterKind}
              onChange={(v) => {
                setHoRequesterKind(v as 'bengkel' | 'pelanggan');
                setHoErrors({});
              }}
              tabs={[
                { value: 'bengkel', label: 'Bengkel' },
                { value: 'pelanggan', label: 'Pelanggan' },
              ]}
            />
          </div>

          {renderLinesTableEditor(
            hoLines,
            setHoLines,
            hoErrors,
            setHoErrors,
            hoRequesterKind === 'pelanggan',
            'ho'
          )}

          {hoRequesterKind === 'pelanggan' && (
            <fieldset className="p-4 rounded-[12px] border border-[#EEF0F4] space-y-4">
              <legend className="px-1 text-[14px] font-semibold text-[#1E2230]">
                Data pelanggan
              </legend>

              <FormField id="ho-cust-nama" label="Nama" error={hoErrors.nama}>
                <input
                  id="ho-cust-nama"
                  type="text"
                  value={hoNama}
                  onChange={(e) => {
                    setHoNama(e.target.value);
                    if (hoErrors.nama) {
                      setHoErrors((prev) => ({ ...prev, nama: '' }));
                    }
                  }}
                  placeholder="Nama lengkap pelanggan"
                  className="admin-input"
                />
              </FormField>

              <FormField id="ho-cust-alamat" label="Alamat" error={hoErrors.alamat}>
                <textarea
                  id="ho-cust-alamat"
                  rows={2}
                  value={hoAlamat}
                  onChange={(e) => {
                    setHoAlamat(e.target.value);
                    if (hoErrors.alamat) {
                      setHoErrors((prev) => ({ ...prev, alamat: '' }));
                    }
                  }}
                  placeholder="Alamat lengkap pelanggan"
                  className="admin-input"
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="ho-cust-mesin" label="Nomor mesin" error={hoErrors.noMesin}>
                  <input
                    id="ho-cust-mesin"
                    type="text"
                    value={hoNoMesin}
                    onChange={(e) => {
                      setHoNoMesin(e.target.value);
                      if (hoErrors.noMesin) {
                        setHoErrors((prev) => ({ ...prev, noMesin: '' }));
                      }
                    }}
                    placeholder="Contoh: JM51E1402291"
                    className="admin-input font-mono"
                  />
                </FormField>

                <FormField id="ho-cust-rangka" label="Nomor rangka" error={hoErrors.noRangka}>
                  <input
                    id="ho-cust-rangka"
                    type="text"
                    value={hoNoRangka}
                    onChange={(e) => {
                      setHoNoRangka(e.target.value);
                      if (hoErrors.noRangka) {
                        setHoErrors((prev) => ({ ...prev, noRangka: '' }));
                      }
                    }}
                    placeholder="Contoh: MH1JM5110PK402291"
                    className="admin-input font-mono"
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField id="ho-cust-hp" label="Nomor HP" error={hoErrors.hp}>
                  <input
                    id="ho-cust-hp"
                    type="tel"
                    inputMode="numeric"
                    maxLength={13}
                    value={hoHp}
                    onChange={(e) => {
                      setHoHp(e.target.value.replace(/\D/g, '').slice(0, 13));
                      if (hoErrors.hp) {
                        setHoErrors((prev) => ({ ...prev, hp: '' }));
                      }
                    }}
                    placeholder="9 hingga 13 digit angka"
                    className="admin-input font-mono"
                  />
                </FormField>

                <FormField id="ho-cust-email" label="Email" error={hoErrors.email}>
                  <input
                    id="ho-cust-email"
                    type="email"
                    value={hoEmail}
                    onChange={(e) => {
                      setHoEmail(e.target.value);
                      if (hoErrors.email) {
                        setHoErrors((prev) => ({ ...prev, email: '' }));
                      }
                    }}
                    placeholder="nama@email.com"
                    className="admin-input"
                  />
                </FormField>
              </div>

              <FormField id="ho-cust-dp" label="DP pembayaran (Rp)" error={hoErrors.dp}>
                <input
                  id="ho-cust-dp"
                  type="number"
                  min={0}
                  step={10000}
                  value={hoDp}
                  onChange={(e) => {
                    setHoDp(e.target.value);
                    if (hoErrors.dp) {
                      setHoErrors((prev) => ({ ...prev, dp: '' }));
                    }
                  }}
                  className="admin-input tabular-nums"
                />
              </FormField>

              <div className="p-4 rounded-[12px] bg-[#F6F7FA] space-y-2 text-[14px]">
                <div className="flex items-center justify-between">
                  <span className="text-[#646B7C]">Total harga</span>
                  <output className="font-mono font-semibold tabular-nums text-[#1E2230]">
                    {formatRupiah(hoTotalHarga)}
                  </output>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#646B7C]">DP</span>
                  <output className="font-mono font-medium tabular-nums text-[#1E2230]">
                    {formatRupiah(hoDpNumber)}
                  </output>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#EEF0F4]">
                  <span className="font-semibold text-[#1E2230]">Sisa bayar</span>
                  <output className="font-mono font-bold tabular-nums text-[#1E2230]">
                    {formatRupiah(hoSisaBayar)}
                  </output>
                </div>
              </div>
            </fieldset>
          )}

          {hoErrors.form && (
            <p role="alert" className="text-[13px] font-medium text-[#D62E5A]">
              {hoErrors.form}
            </p>
          )}
        </form>
      </SidePanel>
    </>
  );
};

export default V2PurchaseRequests;
