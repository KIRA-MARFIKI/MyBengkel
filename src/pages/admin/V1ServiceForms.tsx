import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  useAdmin,
  createServiceFromDraft,
  approveToWorkOrder,
  cancelServiceForm,
} from '../../context/AdminContext';
import type { ServiceForm, ServiceFormLine, ServiceFormStatus } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { SearchField } from '../../components/admin/SearchField';
import { ActionButton, PrintIconButton, XIconButton } from '../../components/admin/ActionButton';
import { FormField } from '../../components/admin/FormField';
import { EmptyState } from '../../components/admin/EmptyState';
import { CancelReasonPanel } from '../../components/admin/CancelReasonPanel';
import {
  ListSwap,
  PanelMorph,
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';
import { printDocument } from '../../lib/printDocument';

type ActiveTab = 'draft' | ServiceFormStatus;

const TABS: { value: ActiveTab; label: string }[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'menunggu_persetujuan', label: 'Menunggu persetujuan' },
  { value: 'disetujui', label: 'Disetujui' },
  { value: 'batal', label: 'Batal' },
];

type DraftFieldKey =
  | 'customerName'
  | 'customerType'
  | 'customerPhone'
  | 'customerKtp'
  | 'customerAddress'
  | 'frameNumber'
  | 'engineNumber'
  | 'plate'
  | 'motorType'
  | 'customMotorType'
  | 'motorColor';

const FIELD_IDS: Record<DraftFieldKey, string> = {
  customerName: 'sf-customer-name',
  customerType: 'sf-customer-type',
  customerPhone: 'sf-customer-phone',
  customerKtp: 'sf-customer-ktp',
  customerAddress: 'sf-customer-address',
  frameNumber: 'sf-frame-number',
  engineNumber: 'sf-engine-number',
  plate: 'sf-plate',
  motorType: 'sf-motor-type',
  customMotorType: 'sf-custom-motor-type',
  motorColor: 'sf-motor-color',
};

const PLATE_REGEX = /^[A-Z]{1,2}\s?[0-9]{1,4}\s?[A-Z]{1,3}$/i;

const normalizeTabParam = (raw: string | null): ActiveTab | null => {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === 'draft') return 'draft';
  if (lower === 'menunggu_persetujuan' || lower === 'menunggu persetujuan') {
    return 'menunggu_persetujuan';
  }
  if (lower === 'disetujui') return 'disetujui';
  if (lower === 'batal' || lower === 'dibatalkan') return 'batal';
  return null;
};

const V1ServiceForms: React.FC = () => {
  const navigate = useNavigate();
  const [params, setSearchParams] = useSearchParams();
  const { serviceForms, workOrders, parts, getPartStock, updateServiceForm } = useAdmin();
  const { notifyAction } = useActionIsland();
  const containerRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef<boolean>(false);
  const approvingRef = useRef<boolean>(false);
  const [query, setQuery] = useState<string>(params.get('q') || '');

  const [draftSubmissionId, setDraftSubmissionId] = useState<string>(
    () => `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  );

  const initialTab = normalizeTabParam(params.get('tab'));
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (initialTab) return initialTab;
    const saved = normalizeTabParam(window.sessionStorage.getItem('mybengkel_sf_tab'));
    return saved || 'draft';
  });

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    return params.get('id') || window.sessionStorage.getItem('mybengkel_sf_selected') || null;
  });
  const [flashId, setFlashId] = useState<string | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    window.sessionStorage.setItem('mybengkel_sf_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (selectedId) {
      window.sessionStorage.setItem('mybengkel_sf_selected', selectedId);
    } else {
      window.sessionStorage.removeItem('mybengkel_sf_selected');
    }
  }, [selectedId]);

  // Draft form state (Jenis konsumen starts unselected '')
  const [customerName, setCustomerName] = useState<string>(params.get('name') || '');
  const [customerType, setCustomerType] = useState<'Pemilik' | 'Pemakai' | ''>('');
  const [customerPhone, setCustomerPhone] = useState<string>(
    (params.get('phone') || '').replace(/\D/g, '')
  );
  const [customerKtp, setCustomerKtp] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');

  const [frameNumber, setFrameNumber] = useState<string>('');
  const [engineNumber, setEngineNumber] = useState<string>('');
  const [plate, setPlate] = useState<string>((params.get('plate') || '').toUpperCase());
  const [motorSelect, setMotorSelect] = useState<string>('');
  const [motorUnavailable, setMotorUnavailable] = useState<boolean>(false);
  const [customMotorType, setCustomMotorType] = useState<string>('');
  const [motorColor, setMotorColor] = useState<string>('');
  const [draftTemuan, setDraftTemuan] = useState<string>('');

  const [errors, setErrors] = useState<Partial<Record<DraftFieldKey, string>>>({});
  const [showErrorSummary, setShowErrorSummary] = useState<boolean>(false);

  // Detail estimation state
  const [showAddJasa, setShowAddJasa] = useState<boolean>(false);
  const [jasaName, setJasaName] = useState<string>('');
  const [jasaQty, setJasaQty] = useState<number>(1);
  const [jasaPrice, setJasaPrice] = useState<number>(50000);

  const [showAddPart, setShowAddPart] = useState<boolean>(false);
  const [partCode, setPartCode] = useState<string>('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partError, setPartError] = useState<string>('');
  const [woError, setWoError] = useState<string>('');

  // Cancel SidePanel state
  const [cancelTarget, setCancelTarget] = useState<ServiceForm | null>(null);

  useEffect(() => {
    const qTab = normalizeTabParam(params.get('tab'));
    if (qTab) setActiveTab(qTab);
    const qId = params.get('id');
    if (qId) setSelectedId(qId);
  }, [params]);

  useEffect(() => {
    return () => window.clearTimeout(flashTimer.current);
  }, []);

  const flash = (id: string) => {
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 900);
  };

  const counts = useMemo(() => {
    return {
      menunggu_persetujuan: serviceForms.filter((sf) => sf.status === 'menunggu_persetujuan')
        .length,
      disetujui: serviceForms.filter((sf) => sf.status === 'disetujui').length,
      batal: serviceForms.filter((sf) => sf.status === 'batal').length,
    } as Record<ServiceFormStatus, number>;
  }, [serviceForms]);

  const tabRecords = useMemo(() => {
    if (activeTab === 'draft') return [];
    const q = query.trim().toLowerCase();
    return serviceForms.filter((sf) => {
      if (sf.status !== activeTab) return false;
      if (!q) return true;
      return (
        sf.vehicle.plat.toLowerCase().includes(q) ||
        sf.customer.nama.toLowerCase().includes(q) ||
        sf.id.toLowerCase().includes(q)
      );
    });
  }, [serviceForms, activeTab, query]);

  const selected = useMemo(
    () =>
      selectedId && activeTab !== 'draft'
        ? serviceForms.find((sf) => sf.id === selectedId && sf.status === activeTab) || null
        : null,
    [serviceForms, selectedId, activeTab]
  );

  const validateField = (key: DraftFieldKey): string => {
    switch (key) {
      case 'customerName':
        return customerName.trim() ? '' : 'Nama konsumen wajib diisi.';
      case 'customerType':
        return customerType === 'Pemilik' || customerType === 'Pemakai'
          ? ''
          : 'Pilih jenis konsumen (Pemilik atau Pemakai).';
      case 'customerPhone':
        if (!customerPhone.trim()) return 'Nomor HP wajib diisi.';
        if (!/^\d{9,13}$/.test(customerPhone.trim())) {
          return 'Nomor HP harus berupa 9 sampai 13 angka.';
        }
        return '';
      case 'customerKtp':
        if (!customerKtp.trim()) return 'Nomor KTP wajib diisi.';
        if (!/^\d{16}$/.test(customerKtp.trim())) {
          return 'Nomor KTP harus tepat 16 angka.';
        }
        return '';
      case 'customerAddress':
        return customerAddress.trim() ? '' : 'Alamat konsumen wajib diisi.';
      case 'frameNumber':
        if (!frameNumber.trim()) return 'Nomor rangka wajib diisi.';
        if (!/^[A-Za-z0-9-]+$/.test(frameNumber.trim())) {
          return 'Nomor rangka hanya boleh berisi huruf, angka, dan tanda hubung (-).';
        }
        return '';
      case 'engineNumber':
        if (!engineNumber.trim()) return 'Nomor mesin wajib diisi.';
        if (!/^[A-Za-z0-9-]+$/.test(engineNumber.trim())) {
          return 'Nomor mesin hanya boleh berisi huruf, angka, dan tanda hubung (-).';
        }
        return '';
      case 'plate': {
        const trimmed = plate.trim().toUpperCase();
        if (!trimmed || !PLATE_REGEX.test(trimmed)) {
          return 'Nomor plat belum sesuai format. Cek di STNK (contoh: XX 0001 XX).';
        }
        return '';
      }
      case 'motorType':
        if (motorUnavailable) return '';
        return motorSelect ? '' : 'Pilih tipe motor dulu.';
      case 'customMotorType':
        if (!motorUnavailable) return '';
        return customMotorType.trim() ? '' : 'Tulis tipe motor wajib diisi.';
      case 'motorColor':
        return motorColor.trim() ? '' : 'Warna motor wajib diisi.';
    }
  };

  const handleBlur = (key: DraftFieldKey) => {
    const msg = validateField(key);
    setErrors((prev) => ({ ...prev, [key]: msg || undefined }));
  };

  const clearForm = () => {
    setCustomerName('');
    setCustomerType('');
    setCustomerPhone('');
    setCustomerKtp('');
    setCustomerAddress('');
    setFrameNumber('');
    setEngineNumber('');
    setPlate('');
    setMotorSelect('');
    setMotorUnavailable(false);
    setCustomMotorType('');
    setMotorColor('');
    setDraftTemuan('');
    setErrors({});
    setShowErrorSummary(false);
    setDraftSubmissionId(`draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;

    const keys: DraftFieldKey[] = [
      'customerName',
      'customerType',
      'customerPhone',
      'customerKtp',
      'customerAddress',
      'frameNumber',
      'engineNumber',
      'plate',
      'motorType',
      'customMotorType',
      'motorColor',
    ];
    const nextErrors: Partial<Record<DraftFieldKey, string>> = {};
    keys.forEach((k) => {
      const err = validateField(k);
      if (err) nextErrors[k] = err;
    });

    setErrors(nextErrors);
    const failedKeys = keys.filter((k) => Boolean(nextErrors[k]));
    if (failedKeys.length > 0) {
      setShowErrorSummary(true);
      const firstId = FIELD_IDS[failedKeys[0]];
      document.getElementById(firstId)?.focus();
      return;
    }

    submittingRef.current = true;
    try {
      const created = createServiceFromDraft({
        submissionId: draftSubmissionId,
        customer: {
          nama: customerName.trim(),
          jenisKonsumen: customerType,
          hp: customerPhone.trim(),
          ktp: customerKtp.trim(),
          alamat: customerAddress.trim(),
        },
        vehicle: {
          rangka: frameNumber.trim().toUpperCase(),
          mesin: engineNumber.trim().toUpperCase(),
          plat: plate.trim().toUpperCase().replace(/\s+/g, ' '),
          tipeMotor: motorUnavailable ? 'Lainnya' : motorSelect,
          tipeManual: motorUnavailable ? customMotorType.trim() : '',
          warna: motorColor.trim(),
        },
        temuan: draftTemuan.trim(),
        jasaLines: [],
        partLines: [],
      });

      clearForm();
      setSelectedId(null);
      setActiveTab('menunggu_persetujuan');
      flash(created.id);
      notifyAction({
        message: `${created.vehicle.plat} masuk ke Menunggu persetujuan.`,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  const focusField = (key: DraftFieldKey) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(FIELD_IDS[key])?.focus();
  };

  const handleAddJasa = (e: React.FormEvent, record: ServiceForm) => {
    e.preventDefault();
    if (!jasaName.trim() || jasaQty <= 0 || jasaPrice < 0) return;
    const newLine: ServiceFormLine = {
      id: `sfl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: 'Jasa',
      name: jasaName.trim(),
      qty: jasaQty,
      unitPrice: jasaPrice,
      subtotal: jasaQty * jasaPrice,
    };
    updateServiceForm(record.id, { jasaLines: [...record.jasaLines, newLine] });
    setJasaName('');
    setJasaQty(1);
    setShowAddJasa(false);
  };

  const handleUpdateJasaQty = (record: ServiceForm, lineId: string, nextQty: number) => {
    const validQty = Math.max(1, Math.floor(nextQty || 1));
    const nextJasaLines = record.jasaLines.map((l) =>
      l.id === lineId
        ? {
            ...l,
            qty: validQty,
            subtotal: validQty * l.unitPrice,
          }
        : l
    );
    updateServiceForm(record.id, { jasaLines: nextJasaLines });
  };

  const handleRemoveJasaLine = (record: ServiceForm, lineId: string) => {
    updateServiceForm(record.id, {
      jasaLines: record.jasaLines.filter((l) => l.id !== lineId),
    });
  };

  const handleAddPart = (e: React.FormEvent, record: ServiceForm) => {
    e.preventDefault();
    setPartError('');
    setWoError('');
    const chosen = parts.find((p) => p.code === partCode);
    if (!chosen) {
      setPartError('Pilih part dulu.');
      return;
    }
    if (partQty <= 0) {
      setPartError('Jumlah part minimal 1.');
      return;
    }
    const available = getPartStock(chosen.code);
    const existingInEstimate = record.partLines
      .filter((pl) => pl.partCode === chosen.code)
      .reduce((acc, pl) => acc + pl.qty, 0);
    const totalRequested = existingInEstimate + partQty;

    if (totalRequested > available) {
      setPartError(
        `Stok ${chosen.name} tersisa ${available}, tidak cukup untuk ${totalRequested}.`
      );
      return;
    }
    const existingIdx = record.partLines.findIndex((pl) => pl.partCode === chosen.code);
    if (existingIdx >= 0) {
      const nextPartLines = record.partLines.map((pl, idx) =>
        idx === existingIdx
          ? {
              ...pl,
              qty: pl.qty + partQty,
              subtotal: (pl.qty + partQty) * pl.unitPrice,
            }
          : pl
      );
      updateServiceForm(record.id, { partLines: nextPartLines });
    } else {
      const newLine: ServiceFormLine = {
        id: `sfl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        type: 'Part',
        partCode: chosen.code,
        name: chosen.name,
        qty: partQty,
        unitPrice: chosen.sellPrice,
        subtotal: partQty * chosen.sellPrice,
      };
      updateServiceForm(record.id, { partLines: [...record.partLines, newLine] });
    }
    setPartCode('');
    setPartQty(1);
    setShowAddPart(false);
  };

  const handleUpdatePartQty = (record: ServiceForm, lineId: string, nextQty: number) => {
    setPartError('');
    setWoError('');
    const validQty = Math.max(1, Math.floor(nextQty || 1));
    const targetLine = record.partLines.find((l) => l.id === lineId);
    if (!targetLine) return;

    if (targetLine.partCode) {
      const available = getPartStock(targetLine.partCode);
      const otherLinesQty = record.partLines
        .filter((pl) => pl.id !== lineId && pl.partCode === targetLine.partCode)
        .reduce((acc, pl) => acc + pl.qty, 0);
      if (otherLinesQty + validQty > available) {
        setPartError(
          `Stok ${targetLine.name} tersisa ${available}, tidak cukup untuk ${otherLinesQty + validQty}.`
        );
        return;
      }
    }

    const nextPartLines = record.partLines.map((l) =>
      l.id === lineId
        ? {
            ...l,
            qty: validQty,
            subtotal: validQty * l.unitPrice,
          }
        : l
    );
    updateServiceForm(record.id, { partLines: nextPartLines });
  };

  const handleRemovePartLine = (record: ServiceForm, lineId: string) => {
    setPartError('');
    setWoError('');
    updateServiceForm(record.id, {
      partLines: record.partLines.filter((l) => l.id !== lineId),
    });
  };

  const handleCreateWO = (record: ServiceForm) => {
    if (approvingRef.current) return;
    setWoError('');
    approvingRef.current = true;
    try {
      const result = approveToWorkOrder(record.id);
      if (!result.ok) {
        setWoError(result.error || 'Stok tidak mencukupi untuk membuat Work Order.');
        return;
      }

      // Keep detail open and move tab island to Disetujui
      setActiveTab('disetujui');
      setSelectedId(record.id);
      flash(record.id);
      notifyAction({
        message: `${record.vehicle.plat} pindah ke Disetujui.`,
        actionLabel: 'Buka Work Order',
        onAction: () => {
          if (result.workOrder) {
            navigate(`/admin/v1/work-orders/${result.workOrder.id}`);
          } else {
            navigate('/admin/v1/work-orders');
          }
        },
      });
    } finally {
      approvingRef.current = false;
    }
  };

  const openCancelPanel = (record: ServiceForm, e?: React.MouseEvent<HTMLElement>) => {
    if (e?.currentTarget) setLastTriggerElement(e.currentTarget);
    setCancelTarget(record);
  };

  const handlePrintCancelledSF = (sf: ServiceForm) => {
    printDocument('batal', {
      id: sf.id,
      source: 'Service Form',
      customerName: sf.customer.nama,
      plate: sf.vehicle.plat,
      reason: sf.cancelReason || 'Tidak dicatat',
      cancelledAt: sf.cancelledAt || sf.createdAt,
    });
  };

  const handleConfirmCancelSF = (reason: string) => {
    if (!cancelTarget) return { ok: false, error: 'Record tidak ditemukan.' };
    const target = cancelTarget;
    const res = cancelServiceForm(target.id, reason);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    setCancelTarget(null);
    setActiveTab('batal');
    setSelectedId(null);
    flash(target.id);

    notifyAction({
      message: `${target.vehicle.plat} dibatalkan.`,
      actionLabel: 'Cetak',
      onAction: () => {
        if (res.serviceForm) {
          handlePrintCancelledSF(res.serviceForm);
        }
      },
    });

    return { ok: true };
  };

  const getLinkedWorkOrder = (sf: ServiceForm) => {
    if (sf.workOrderId) {
      return workOrders.find((wo) => wo.id === sf.workOrderId);
    }
    return workOrders.find((wo) => wo.serviceFormId === sf.id);
  };

  const listColumns: Column<ServiceForm>[] =
    activeTab === 'batal'
      ? [
          {
            key: 'id',
            header: 'Kode',
            render: (sf) => (
              <data value={sf.id} className="font-mono font-medium">
                {sf.id}
              </data>
            ),
          },
          {
            key: 'customerName',
            header: 'Nama konsumen',
            render: (sf) => sf.customer.nama,
          },
          {
            key: 'plate',
            header: 'Plat nomor',
            render: (sf) => (
              <data value={sf.vehicle.plat} className="font-mono font-medium">
                {sf.vehicle.plat}
              </data>
            ),
          },
          {
            key: 'cancelReason',
            header: 'Alasan batal',
            render: (sf) => sf.cancelReason || 'Tidak dicatat',
          },
          {
            key: 'cancelledAt',
            header: 'Tanggal batal',
            align: 'right',
            render: (sf) => sf.cancelledAt || sf.createdAt,
          },
          {
            key: 'actions',
            header: 'Aksi',
            align: 'right',
            render: (sf) => (
              <div
                className="inline-flex justify-end"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <PrintIconButton
                  ariaLabel={`Cetak bukti pembatalan ${sf.vehicle.plat}`}
                  title={`Cetak bukti pembatalan ${sf.vehicle.plat}`}
                  onClick={() => handlePrintCancelledSF(sf)}
                />
              </div>
            ),
          },
        ]
      : [
          {
            key: 'customerName',
            header: 'Nama konsumen',
            render: (sf) => sf.customer.nama,
          },
          {
            key: 'plate',
            header: 'Plat nomor',
            render: (sf) => (
              <data value={sf.vehicle.plat} className="font-mono font-medium">
                {sf.vehicle.plat}
              </data>
            ),
          },
          {
            key: 'createdAt',
            header: 'Tanggal masuk',
            align: 'right',
            render: (sf) => sf.createdAt,
          },
          ...(activeTab === 'disetujui'
            ? ([
                {
                  key: 'actions',
                  header: 'Aksi',
                  align: 'right' as const,
                  render: (sf: ServiceForm) => {
                    const linkedWO = getLinkedWorkOrder(sf);
                    const isWoFinished = linkedWO?.endState === 'selesai';
                    return (
                      <div
                        className="inline-flex flex-col items-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <ActionButton
                          intent="cancel"
                          disabled={isWoFinished}
                          onClick={(e) => openCancelPanel(sf, e)}
                        >
                          Batal pemeriksaan
                        </ActionButton>
                        {isWoFinished && (
                          <span className="text-[12px] text-[#646B7C]">
                            Work order sudah selesai.
                          </span>
                        )}
                      </div>
                    );
                  },
                },
              ] as Column<ServiceForm>[])
            : []),
        ];

  const errorKeys = (Object.keys(errors) as DraftFieldKey[]).filter((k) => Boolean(errors[k]));

  const emptyMessageForTab = (tab: ActiveTab): string => {
    if (tab === 'draft') return 'Belum ada draf. Isi form di atas untuk membuat service form baru.';
    if (tab === 'menunggu_persetujuan') {
      return 'Belum ada konsumen yang menunggu persetujuan. Simpan draf untuk memulai.';
    }
    if (tab === 'disetujui') return 'Belum ada pemeriksaan yang disetujui.';
    return 'Belum ada pemeriksaan yang dibatalkan.';
  };

  const renderFieldOrBelumDiisi = (val: string | undefined) => {
    if (val && val.trim()) return val;
    return <span className="text-[#646B7C]">Belum diisi</span>;
  };

  const renderDetailCard = (record: ServiceForm) => {
    const isMenunggu = record.status === 'menunggu_persetujuan';
    const isDisetujui = record.status === 'disetujui';
    const isBatal = record.status === 'batal';
    const isBookingOrigin = record.origin === 'booking';

    const linkedWO = getLinkedWorkOrder(record);
    const isWoFinished = linkedWO?.endState === 'selesai';

    const jasaLines = record.jasaLines;
    const partLines = record.partLines;
    const jasaSubtotal = jasaLines.reduce((sum, l) => sum + l.subtotal, 0);
    const partSubtotal = partLines.reduce((sum, l) => sum + l.subtotal, 0);
    const grandTotal = jasaSubtotal + partSubtotal;

    const motorDisplay = record.vehicle.tipeManual
      ? record.vehicle.tipeManual
      : record.vehicle.tipeMotor;

    const targetWoUrl = record.workOrderId
      ? `/admin/v1/work-orders/${record.workOrderId}`
      : linkedWO
      ? `/admin/v1/work-orders/${linkedWO.id}`
      : '/admin/v1/work-orders';

    return (
      <DataCard
        title="Detail Service Form"
        actions={
          <div className="flex items-center gap-2">
            {isBatal && (
              <PrintIconButton
                ariaLabel={`Cetak bukti pembatalan ${record.vehicle.plat}`}
                title={`Cetak bukti pembatalan ${record.vehicle.plat}`}
                onClick={() => handlePrintCancelledSF(record)}
              />
            )}
            <ActionButton
              intent="cancel"
              onClick={() => {
                setSelectedId(null);
                setWoError('');
                setPartError('');
                if (params.get('id') || params.get('tab')) {
                  setSearchParams({}, { replace: true });
                }
              }}
            >
              Kembali ke daftar
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-6">
          <div className="pb-4 border-b border-[#EEF0F4] flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <data
                value={record.vehicle.plat}
                className="block font-mono font-medium text-[28px] leading-none text-[#1E2230] tabular-nums"
              >
                {record.vehicle.plat}
              </data>
              <div className="text-[14px] text-[#646B7C] mt-1.5">
                {record.customer.nama} · <span className="font-mono">{record.id}</span>
              </div>
            </div>
            {record.workOrderId && (
              <div className="text-[13px] text-[#646B7C]">
                Work Order:{' '}
                <button
                  type="button"
                  onClick={() => navigate(targetWoUrl)}
                  className="font-mono font-semibold text-[#1A64B0] underline underline-offset-4"
                >
                  {record.workOrderId}
                </button>
              </div>
            )}
          </div>

          {isBatal && (
            <div className="p-4 rounded-[16px] border border-[rgba(242,70,111,0.28)] bg-[#FDE3E9]/50">
              <div className="admin-micro text-[#B4234A]">Alasan pembatalan</div>
              <p className="mt-1 text-[14px] text-[#1E2230] font-medium">
                {record.cancelReason || 'Tidak dicatat'}
              </p>
              {record.cancelledAt && (
                <p className="mt-1 text-[12px] text-[#646B7C] font-mono">
                  Waktu batal: {record.cancelledAt}
                </p>
              )}
            </div>
          )}

          {/* Customer & Vehicle Data */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-[16px] border border-[#EEF0F4] bg-[#F6F7FA]/60">
            <div>
              <h3 className="admin-micro text-[#646B7C] mb-2">Data konsumen</h3>
              <dl className="space-y-1.5 text-[14px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nama konsumen</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.customer.nama)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Jenis konsumen</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.customer.jenisKonsumen)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor HP</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.customer.hp)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor KTP</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.customer.ktp)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Alamat konsumen</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.customer.alamat)}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="admin-micro text-[#646B7C] mb-2">Data kendaraan</h3>
              <dl className="space-y-1.5 text-[14px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor rangka</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.vehicle.rangka)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor mesin</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.vehicle.mesin)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Plat nomor</dt>
                  <dd className="text-right font-mono font-medium text-[#1E2230]">
                    <data value={record.vehicle.plat}>{record.vehicle.plat}</data>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Tipe motor</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(motorDisplay)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Warna motor</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {renderFieldOrBelumDiisi(record.vehicle.warna)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="space-y-5 border-t border-[#EEF0F4] pt-4">
            <h3 className="admin-macro-section">Estimasi</h3>

            {/* JASA TABLE */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="admin-micro text-[#646B7C]">Jasa</span>
                {isMenunggu && (
                  <ActionButton
                    type="button"
                    intent="add"
                    onClick={() => setShowAddJasa((prev) => !prev)}
                  >
                    Jasa+
                  </ActionButton>
                )}
              </div>

              {isMenunggu && showAddJasa && (
                <form
                  onSubmit={(e) => handleAddJasa(e, record)}
                  className="flex flex-wrap items-center gap-2 p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]"
                >
                  <input
                    type="text"
                    aria-label="Nama jasa"
                    placeholder="Nama jasa (contoh: Servis berkala)"
                    value={jasaName}
                    onChange={(e) => setJasaName(e.target.value)}
                    className="admin-input flex-1 min-w-[180px]"
                  />
                  <input
                    type="number"
                    min={1}
                    aria-label="Qty jasa"
                    value={jasaQty}
                    onChange={(e) => setJasaQty(Number(e.target.value) || 1)}
                    className="admin-input w-20"
                  />
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    aria-label="Harga jasa"
                    value={jasaPrice}
                    onChange={(e) => setJasaPrice(Number(e.target.value) || 0)}
                    className="admin-input w-32"
                  />
                  <ActionButton type="submit" intent="add">
                    Tambah jasa
                  </ActionButton>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[14px] bg-white">
                  <thead>
                    <tr className="bg-[#F6F7FA] text-[#646B7C]">
                      <th className="py-2.5 px-3.5 admin-micro rounded-l-[12px]">Nama jasa</th>
                      <th className="py-2.5 px-3.5 admin-micro text-right">Qty</th>
                      <th className="py-2.5 px-3.5 admin-micro text-right">Harga</th>
                      <th
                        className={`py-2.5 px-3.5 admin-micro text-right ${
                          !isMenunggu ? 'rounded-r-[12px]' : ''
                        }`}
                      >
                        Subtotal
                      </th>
                      {isMenunggu && (
                        <th className="py-2.5 px-3.5 admin-micro text-right rounded-r-[12px]">
                          Aksi
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {jasaLines.length === 0 ? (
                      <tr className="border-b border-[#EEF0F4]">
                        <td
                          colSpan={isMenunggu ? 5 : 4}
                          className="py-3 text-center text-[#646B7C]"
                        >
                          {isDisetujui && isBookingOrigin ? (
                            <>
                              Belum ada jasa. Tambahkan di{' '}
                              <button
                                type="button"
                                onClick={() => navigate(targetWoUrl)}
                                className="font-semibold text-[#1A64B0] underline underline-offset-4"
                              >
                                Work Order
                              </button>
                              .
                            </>
                          ) : (
                            'Belum ada item jasa.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      jasaLines.map((l) => (
                        <tr key={l.id} className="h-[52px] border-b border-[#EEF0F4]">
                          <td className="px-3.5 font-medium text-[#1E2230]">{l.name}</td>
                          <td className="px-3.5 text-right tabular-nums">
                            {isMenunggu ? (
                              <input
                                type="number"
                                min={1}
                                aria-label={`Qty ${l.name}`}
                                value={l.qty}
                                onChange={(e) =>
                                  handleUpdateJasaQty(
                                    record,
                                    l.id,
                                    Number(e.target.value) || 1
                                  )
                                }
                                className="admin-input w-20 text-right font-mono inline-block py-1 px-2 h-9"
                              />
                            ) : (
                              <data value={l.qty} className="font-mono">
                                {l.qty}
                              </data>
                            )}
                          </td>
                          <td className="px-3.5 text-right tabular-nums font-mono">
                            <data value={l.unitPrice}>{formatRupiah(l.unitPrice)}</data>
                          </td>
                          <td className="px-3.5 text-right tabular-nums font-mono">
                            <data value={l.subtotal}>{formatRupiah(l.subtotal)}</data>
                          </td>
                          {isMenunggu && (
                            <td className="px-3.5 text-right">
                              <XIconButton
                                ariaLabel="Hapus baris jasa"
                                title="Hapus baris jasa"
                                onClick={() => handleRemoveJasaLine(record, l.id)}
                              />
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#EEF0F4]">
                      <td colSpan={3} className="py-2.5 px-3.5 admin-micro text-[#646B7C]">
                        Subtotal Jasa
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-[#1E2230] tabular-nums font-mono">
                        <output>{formatRupiah(jasaSubtotal)}</output>
                      </td>
                      {isMenunggu && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* PART TABLE */}
            <div className="space-y-2.5 pt-3 border-t border-[#EEF0F4]">
              <div className="flex items-center justify-between gap-2">
                <span className="admin-micro text-[#646B7C]">Part</span>
                {isMenunggu && (
                  <ActionButton
                    type="button"
                    intent="add"
                    onClick={() => setShowAddPart((prev) => !prev)}
                  >
                    Part+
                  </ActionButton>
                )}
              </div>

              {isMenunggu && showAddPart && (
                <form
                  onSubmit={(e) => handleAddPart(e, record)}
                  className="space-y-2 p-3 rounded-[12px] bg-[#F6F7FA] border border-[#EEF0F4]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Pilih part"
                      value={partCode}
                      onChange={(e) => {
                        setPartCode(e.target.value);
                        setPartError('');
                      }}
                      className="admin-input flex-1 min-w-[200px]"
                    >
                      <option value="">Pilih part dari gudang</option>
                      {parts.map((p) => {
                        const stk = getPartStock(p.code);
                        return (
                          <option key={p.code} value={p.code}>
                            {p.name}: Stok {stk} ({formatRupiah(p.sellPrice)})
                          </option>
                        );
                      })}
                    </select>
                    <input
                      type="number"
                      min={1}
                      aria-label="Qty part"
                      value={partQty}
                      onChange={(e) => {
                        setPartQty(Number(e.target.value) || 1);
                        setPartError('');
                      }}
                      className="admin-input w-20"
                    />
                    <ActionButton type="submit" intent="add">
                      Tambah part
                    </ActionButton>
                  </div>
                  {partError && (
                    <p role="alert" className="admin-micro text-[#D62E5A]">
                      {partError}
                    </p>
                  )}
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[14px] bg-white">
                  <thead>
                    <tr className="bg-[#F6F7FA] text-[#646B7C]">
                      <th className="py-2.5 px-3.5 admin-micro rounded-l-[12px]">Nama part</th>
                      <th className="py-2.5 px-3.5 admin-micro text-right">Qty</th>
                      <th className="py-2.5 px-3.5 admin-micro text-right">Harga</th>
                      <th
                        className={`py-2.5 px-3.5 admin-micro text-right ${
                          !isMenunggu ? 'rounded-r-[12px]' : ''
                        }`}
                      >
                        Subtotal
                      </th>
                      {isMenunggu && (
                        <th className="py-2.5 px-3.5 admin-micro text-right rounded-r-[12px]">
                          Aksi
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {partLines.length === 0 ? (
                      <tr className="border-b border-[#EEF0F4]">
                        <td
                          colSpan={isMenunggu ? 5 : 4}
                          className="py-3 text-center text-[#646B7C]"
                        >
                          {isDisetujui && isBookingOrigin ? (
                            <>
                              Belum ada part. Tambahkan di{' '}
                              <button
                                type="button"
                                onClick={() => navigate(targetWoUrl)}
                                className="font-semibold text-[#1A64B0] underline underline-offset-4"
                              >
                                Work Order
                              </button>
                              .
                            </>
                          ) : (
                            'Belum ada item part.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      partLines.map((l) => (
                        <tr key={l.id} className="h-[52px] border-b border-[#EEF0F4]">
                          <td className="px-3.5 font-medium text-[#1E2230]">
                            {l.partCode && <samp className="mr-2 font-mono">{l.partCode}</samp>}
                            {l.name}
                          </td>
                          <td className="px-3.5 text-right tabular-nums font-mono">
                            {isMenunggu ? (
                              <input
                                type="number"
                                min={1}
                                aria-label={`Qty ${l.name}`}
                                value={l.qty}
                                onChange={(e) =>
                                  handleUpdatePartQty(
                                    record,
                                    l.id,
                                    Number(e.target.value) || 1
                                  )
                                }
                                className="admin-input w-20 text-right font-mono inline-block py-1 px-2 h-9"
                              />
                            ) : (
                              <data value={l.qty}>{l.qty}</data>
                            )}
                          </td>
                          <td className="px-3.5 text-right tabular-nums font-mono">
                            <data value={l.unitPrice}>{formatRupiah(l.unitPrice)}</data>
                          </td>
                          <td className="px-3.5 text-right tabular-nums font-mono">
                            <data value={l.subtotal}>{formatRupiah(l.subtotal)}</data>
                          </td>
                          {isMenunggu && (
                            <td className="px-3.5 text-right">
                              <XIconButton
                                ariaLabel="Hapus baris part"
                                title="Hapus baris part"
                                onClick={() => handleRemovePartLine(record, l.id)}
                              />
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#EEF0F4]">
                      <td colSpan={3} className="py-2.5 px-3.5 admin-micro text-[#646B7C]">
                        Subtotal Part
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-semibold text-[#1E2230] tabular-nums font-mono">
                        <output>{formatRupiah(partSubtotal)}</output>
                      </td>
                      {isMenunggu && <td />}
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!showAddPart && partError && (
                <p role="alert" className="admin-micro text-[#D62E5A] mt-1">
                  {partError}
                </p>
              )}
            </div>

            {/* TEMUAN BELOW PART TABLE */}
            <div className="pt-3 border-t border-[#EEF0F4]">
              {isMenunggu ? (
                <FormField id="sf-detail-temuan" label="Temuan">
                  <textarea
                    id="sf-detail-temuan"
                    rows={2}
                    value={record.temuan}
                    placeholder="Catat hasil pemeriksaan mekanik"
                    onChange={(e) => updateServiceForm(record.id, { temuan: e.target.value })}
                    className="admin-input"
                  />
                </FormField>
              ) : (
                <div>
                  <div className="admin-micro text-[#646B7C] mb-1">Temuan</div>
                  <p className="text-[14px] text-[#1E2230]">
                    {record.temuan || 'Tidak ada catatan temuan.'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-baseline justify-between pt-3 border-t border-[#EEF0F4]">
              <span className="admin-micro text-[#646B7C]">Total Estimasi (Jasa + Part)</span>
              <output className="font-mono font-bold text-[24px] text-[#1E2230] tabular-nums">
                {formatRupiah(grandTotal)}
              </output>
            </div>
          </div>

          {woError && (
            <div
              role="alert"
              className="p-3.5 rounded-[12px] bg-[rgba(242,70,111,0.08)] border border-[rgba(242,70,111,0.3)] text-[14px] text-[#D62E5A]"
            >
              {woError}
            </div>
          )}

          {/* Action Buttons */}
          {isMenunggu && (
            <div className="pt-4 border-t border-[#EEF0F4] flex flex-wrap items-center justify-between gap-4">
              <ActionButton intent="cancel" onClick={(e) => openCancelPanel(record, e)}>
                Batal pemeriksaan
              </ActionButton>

              {!record.workOrderId && (
                <ActionButton intent="start" onClick={() => handleCreateWO(record)}>
                  Buat Work Order
                </ActionButton>
              )}
            </div>
          )}

          {isDisetujui && (
            <div className="pt-4 border-t border-[#EEF0F4] flex flex-col items-start gap-1.5">
              <ActionButton
                intent="cancel"
                disabled={isWoFinished}
                onClick={(e) => openCancelPanel(record, e)}
              >
                Batal pemeriksaan
              </ActionButton>
              {isWoFinished && (
                <p className="text-[13px] text-[#646B7C]">Work order sudah selesai.</p>
              )}
            </div>
          )}

          <div className="text-[13px] text-[#646B7C]">Tanggal masuk: {record.createdAt}</div>
        </div>
      </DataCard>
    );
  };

  return (
    <div ref={containerRef} className="flex flex-col gap-5">
      <DataCard
        title="Service Form"
        actions={
          <>
            <FilterTabs
              ariaLabel="Status Service Form"
              value={activeTab}
              onChange={(t) => {
                setActiveTab(t as ActiveTab);
                setSelectedId(null);
                setWoError('');
                setPartError('');
                if (params.get('tab') || params.get('id')) {
                  setSearchParams({}, { replace: true });
                }
              }}
              tabs={TABS.map((t) => ({
                value: t.value,
                label: t.label,
                ...(t.value !== 'draft'
                  ? { count: counts[t.value as ServiceFormStatus] }
                  : {}),
              }))}
            />
            {activeTab !== 'draft' && !selected && (
              <SearchField
                value={query}
                onChange={setQuery}
                placeholder="Cari plat atau nama"
              />
            )}
          </>
        }
      >
        {activeTab === 'draft' ? (
          <ListSwap swapKey="draft-form">
            <div className="space-y-6">
              <form
                noValidate
                onSubmit={handleSubmitForm}
                className="p-5 rounded-[16px] border border-[#EEF0F4] bg-white space-y-5"
              >
                {showErrorSummary && errorKeys.length > 0 && (
                  <div
                    role="alert"
                    className="p-3.5 rounded-[12px] bg-[rgba(242,70,111,0.08)] border border-[rgba(242,70,111,0.3)] text-[14px] text-[#D62E5A]"
                  >
                    <p className="admin-micro text-[#D62E5A] mb-1.5">
                      Periksa kembali isian berikut:
                    </p>
                    <ul className="list-disc list-inside space-y-1">
                      {errorKeys.map((k) => (
                        <li key={k}>
                          <a
                            href={`#${FIELD_IDS[k]}`}
                            onClick={focusField(k)}
                            className="underline decoration-2 underline-offset-4 font-medium"
                          >
                            {errors[k]}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-3.5">
                    <h3 className="admin-micro text-[#646B7C]">Data konsumen</h3>

                    <FormField
                      id={FIELD_IDS.customerName}
                      label="Nama konsumen"
                      error={errors.customerName}
                    >
                      <input
                        id={FIELD_IDS.customerName}
                        type="text"
                        value={customerName}
                        placeholder="Contoh: Pelanggan Dummy 01"
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (errors.customerName) {
                            setErrors((p) => ({ ...p, customerName: undefined }));
                          }
                        }}
                        onBlur={() => handleBlur('customerName')}
                        className="admin-input"
                      />
                    </FormField>

                    <FormField
                      id={FIELD_IDS.customerType}
                      label="Jenis konsumen"
                      error={errors.customerType}
                    >
                      <div
                        id={FIELD_IDS.customerType}
                        role="radiogroup"
                        aria-label="Jenis konsumen"
                        tabIndex={-1}
                        className="inline-flex gap-2 w-full sm:w-auto"
                      >
                        {(['Pemilik', 'Pemakai'] as const).map((opt) => {
                          const active = customerType === opt;
                          return (
                            <button
                              key={opt}
                              type="button"
                              role="radio"
                              aria-checked={active}
                              onClick={() => {
                                setCustomerType(opt);
                                setErrors((p) => ({ ...p, customerType: undefined }));
                              }}
                              className={`admin-tab-btn flex-1 sm:flex-initial ${
                                active ? 'bg-[#1E2230] text-white' : 'admin-tab-inactive'
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </FormField>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        id={FIELD_IDS.customerPhone}
                        label="Nomor HP"
                        error={errors.customerPhone}
                      >
                        <input
                          id={FIELD_IDS.customerPhone}
                          type="text"
                          inputMode="numeric"
                          value={customerPhone}
                          placeholder="9 sampai 13 angka"
                          onChange={(e) => {
                            setCustomerPhone(e.target.value.replace(/\D/g, ''));
                            if (errors.customerPhone) {
                              setErrors((p) => ({ ...p, customerPhone: undefined }));
                            }
                          }}
                          onBlur={() => handleBlur('customerPhone')}
                          className="admin-input font-mono"
                        />
                      </FormField>

                      <FormField
                        id={FIELD_IDS.customerKtp}
                        label="Nomor KTP"
                        error={errors.customerKtp}
                      >
                        <input
                          id={FIELD_IDS.customerKtp}
                          type="text"
                          inputMode="numeric"
                          value={customerKtp}
                          placeholder="16 angka sesuai KTP"
                          onChange={(e) => {
                            setCustomerKtp(e.target.value.replace(/\D/g, ''));
                            if (errors.customerKtp) {
                              setErrors((p) => ({ ...p, customerKtp: undefined }));
                            }
                          }}
                          onBlur={() => handleBlur('customerKtp')}
                          className="admin-input font-mono"
                        />
                      </FormField>
                    </div>

                    <FormField
                      id={FIELD_IDS.customerAddress}
                      label="Alamat konsumen"
                      error={errors.customerAddress}
                    >
                      <textarea
                        id={FIELD_IDS.customerAddress}
                        rows={3}
                        value={customerAddress}
                        placeholder="Alamat lengkap konsumen"
                        onChange={(e) => {
                          setCustomerAddress(e.target.value);
                          if (errors.customerAddress) {
                            setErrors((p) => ({ ...p, customerAddress: undefined }));
                          }
                        }}
                        onBlur={() => handleBlur('customerAddress')}
                        className="admin-input"
                      />
                    </FormField>
                  </div>

                  <div className="space-y-3.5">
                    <h3 className="admin-micro text-[#646B7C]">Data kendaraan</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField
                        id={FIELD_IDS.frameNumber}
                        label="Nomor rangka"
                        error={errors.frameNumber}
                      >
                        <input
                          id={FIELD_IDS.frameNumber}
                          type="text"
                          value={frameNumber}
                          placeholder="Contoh: MH1JM5110PK-0001"
                          onChange={(e) => {
                            setFrameNumber(e.target.value.toUpperCase());
                            if (errors.frameNumber) {
                              setErrors((p) => ({ ...p, frameNumber: undefined }));
                            }
                          }}
                          onBlur={() => handleBlur('frameNumber')}
                          className="admin-input font-mono"
                        />
                      </FormField>

                      <FormField
                        id={FIELD_IDS.engineNumber}
                        label="Nomor mesin"
                        error={errors.engineNumber}
                      >
                        <input
                          id={FIELD_IDS.engineNumber}
                          type="text"
                          value={engineNumber}
                          placeholder="Contoh: JM51E-0001"
                          onChange={(e) => {
                            setEngineNumber(e.target.value.toUpperCase());
                            if (errors.engineNumber) {
                              setErrors((p) => ({ ...p, engineNumber: undefined }));
                            }
                          }}
                          onBlur={() => handleBlur('engineNumber')}
                          className="admin-input font-mono"
                        />
                      </FormField>
                    </div>

                    <FormField id={FIELD_IDS.plate} label="Plat nomor" error={errors.plate}>
                      <input
                        id={FIELD_IDS.plate}
                        type="text"
                        value={plate}
                        placeholder="Contoh: XX 0001 XX"
                        onChange={(e) => {
                          setPlate(e.target.value.toUpperCase());
                          if (errors.plate) {
                            setErrors((p) => ({ ...p, plate: undefined }));
                          }
                        }}
                        onBlur={() => handleBlur('plate')}
                        className="admin-input font-mono"
                      />
                    </FormField>

                    <div className="space-y-2.5">
                      <FormField
                        id={FIELD_IDS.motorType}
                        label="Tipe motor"
                        error={errors.motorType}
                      >
                        <select
                          id={FIELD_IDS.motorType}
                          disabled={motorUnavailable}
                          value={motorSelect}
                          onChange={(e) => {
                            setMotorSelect(e.target.value);
                            setErrors((p) => ({ ...p, motorType: undefined }));
                          }}
                          onBlur={() => handleBlur('motorType')}
                          className="admin-input disabled:opacity-55 disabled:cursor-not-allowed"
                        >
                          <option value="">Pilih tipe motor</option>
                          <option value="Honda">Honda</option>
                          <option value="Yamaha">Yamaha</option>
                          <option value="Suzuki">Suzuki</option>
                        </select>
                      </FormField>

                      <label className="inline-flex items-center gap-2 text-[14px] text-[#1E2230] select-none">
                        <input
                          type="checkbox"
                          checked={motorUnavailable}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setMotorUnavailable(checked);
                            if (!checked) {
                              setCustomMotorType('');
                            }
                            setErrors((p) => ({
                              ...p,
                              motorType: undefined,
                              customMotorType: undefined,
                            }));
                          }}
                          className="w-4 h-4 accent-[#1E2230]"
                        />
                        <span>Tipe motor tidak tersedia</span>
                      </label>

                      {motorUnavailable && (
                        <FormField
                          id={FIELD_IDS.customMotorType}
                          label="Tulis tipe motor"
                          error={errors.customMotorType}
                        >
                          <input
                            id={FIELD_IDS.customMotorType}
                            type="text"
                            value={customMotorType}
                            placeholder="Contoh: Vespa Sprint 150"
                            onChange={(e) => {
                              setCustomMotorType(e.target.value);
                              if (errors.customMotorType) {
                                setErrors((p) => ({ ...p, customMotorType: undefined }));
                              }
                            }}
                            onBlur={() => handleBlur('customMotorType')}
                            className="admin-input"
                          />
                        </FormField>
                      )}
                    </div>

                    <FormField
                      id={FIELD_IDS.motorColor}
                      label="Warna motor"
                      error={errors.motorColor}
                    >
                      <input
                        id={FIELD_IDS.motorColor}
                        type="text"
                        value={motorColor}
                        placeholder="Contoh: Hitam"
                        onChange={(e) => {
                          setMotorColor(e.target.value);
                          if (errors.motorColor) {
                            setErrors((p) => ({ ...p, motorColor: undefined }));
                          }
                        }}
                        onBlur={() => handleBlur('motorColor')}
                        className="admin-input"
                      />
                    </FormField>

                    <FormField id="sf-draft-temuan" label="Temuan awal" optional>
                      <input
                        id="sf-draft-temuan"
                        type="text"
                        value={draftTemuan}
                        placeholder="Keluhan atau temuan awal (opsional)"
                        onChange={(e) => setDraftTemuan(e.target.value)}
                        className="admin-input"
                      />
                    </FormField>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#EEF0F4]">
                  <ActionButton type="button" intent="neutral" onClick={clearForm}>
                    Reset
                  </ActionButton>
                  <ActionButton type="submit" intent="start">
                    Simpan
                  </ActionButton>
                </div>
              </form>
            </div>
          </ListSwap>
        ) : (
          <div>
            {selected ? (
              <PanelMorph isOpen={Boolean(selected)}>{renderDetailCard(selected)}</PanelMorph>
            ) : tabRecords.length === 0 ? (
              <EmptyState message={emptyMessageForTab(activeTab)} />
            ) : (
              <DataTable
                columns={listColumns}
                data={tabRecords}
                keyExtractor={(sf) => sf.id}
                flashKey={flashId}
                swapKey={activeTab}
                onRowClick={(sf) => {
                  setSelectedId(sf.id);
                  setWoError('');
                  setPartError('');
                }}
              />
            )}
          </div>
        )}
      </DataCard>

      <CancelReasonPanel
        isOpen={cancelTarget !== null}
        plate={cancelTarget?.vehicle.plat}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleConfirmCancelSF}
      />
    </div>
  );
};

export default V1ServiceForms;
