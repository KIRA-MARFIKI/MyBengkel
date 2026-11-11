import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { gsap, Flip } from '../../lib/gsap';
import {
  useAdmin,
  addLineToWorkOrder,
  removeLineFromWorkOrder,
  assignMechanicToWorkOrder,
  cancelServiceForm,
  finishWorkOrder,
} from '../../context/AdminContext';
import type { ServiceForm, ServiceFormLine, WorkOrder } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { SearchField } from '../../components/admin/SearchField';
import { ActionButton, PrintIconButton, XIconButton } from '../../components/admin/ActionButton';
import { FormField } from '../../components/admin/FormField';
import { EmptyState } from '../../components/admin/EmptyState';
import { HistoryRow } from '../../components/admin/HistoryRow';
import { CancelReasonPanel } from '../../components/admin/CancelReasonPanel';
import { CenterDialog } from '../../components/admin/CenterDialog';
import {
  PanelMorph,
  probe,
  RollingNumber,
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';
import { printDocument } from '../../lib/printDocument';

type IslandFormType = 'jasa' | 'part';
type WoTab = 'berjalan' | 'selesai' | 'batal';

const WO_TABS: { value: WoTab; label: string }[] = [
  { value: 'berjalan', label: 'Berjalan' },
  { value: 'selesai', label: 'Selesai' },
  { value: 'batal', label: 'Batal' },
];

const V1WorkOrders: React.FC = () => {
  const navigate = useNavigate();
  const routeParams = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { workOrders, serviceForms, mechanics, parts, getPartStock } = useAdmin();
  const { notifyAction } = useActionIsland();

  const [activeTab, setActiveTab] = useState<WoTab>('berjalan');
  const [query, setQuery] = useState<string>('');
  const [selectedId, setSelectedId] = useState<string | null>(
    routeParams.id || searchParams.get('id') || null
  );

  // Error shown under "Selesai dilaksanakan" when WO has no lines
  const [finishErrorWoId, setFinishErrorWoId] = useState<string | null>(null);
  const [finishErrorMsg, setFinishErrorMsg] = useState<string>('');

  // Cancel SidePanel state
  const [cancelTargetWo, setCancelTargetWo] = useState<WorkOrder | null>(null);

  // Ringkasan servis centered dialog state
  const [summaryWoId, setSummaryWoId] = useState<string | null>(null);

  const [flashLineId, setFlashLineId] = useState<string | null>(null);
  const flashTimerRef = useRef<number | undefined>(undefined);

  const [activeForm, setActiveForm] = useState<IslandFormType | null>(null);
  const [hiddenBtn, setHiddenBtn] = useState<IslandFormType | null>(null);
  const isAnimatingRef = useRef<boolean>(false);

  const islandAreaRef = useRef<HTMLDivElement>(null);
  const jasaBtnRef = useRef<HTMLButtonElement>(null);
  const partBtnRef = useRef<HTMLButtonElement>(null);
  const jasaLabelRef = useRef<HTMLSpanElement>(null);
  const partLabelRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const jasaFirstInputRef = useRef<HTMLInputElement>(null);
  const partFirstSelectRef = useRef<HTMLSelectElement>(null);

  const [jasaName, setJasaName] = useState<string>('');
  const [jasaQty, setJasaQty] = useState<number>(1);
  const [jasaPrice, setJasaPrice] = useState<number>(50000);
  const [jasaError, setJasaError] = useState<string>('');

  const [partCode, setPartCode] = useState<string>('');
  const [partQty, setPartQty] = useState<number>(1);
  const [partError, setPartError] = useState<string>('');

  const getLinkedSF = useCallback(
    (wo: WorkOrder): ServiceForm | undefined =>
      serviceForms.find((sf) => sf.id === wo.serviceFormId || sf.workOrderId === wo.id),
    [serviceForms]
  );

  const getWoPlate = useCallback(
    (wo: WorkOrder): string => getLinkedSF(wo)?.vehicle.plat || 'XX 0000 XX',
    [getLinkedSF]
  );

  const getWoCustomerName = useCallback(
    (wo: WorkOrder): string => getLinkedSF(wo)?.customer.nama || '-',
    [getLinkedSF]
  );

  const urlTargetId = routeParams.id || searchParams.get('id') || '';

  useEffect(() => {
    if (!urlTargetId) return;
    const found = workOrders.find((w) => w.id === urlTargetId);
    if (found) {
      if (found.endState === 'selesai') {
        setActiveTab('selesai');
        setSummaryWoId(found.id);
        setSelectedId(null);
      } else if (found.endState === 'batal') {
        setActiveTab('batal');
        setSelectedId(found.id);
      } else {
        setActiveTab('berjalan');
        setSelectedId(found.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlTargetId]);

  useEffect(() => {
    return () => window.clearTimeout(flashTimerRef.current);
  }, []);

  useEffect(() => {
    setActiveForm(null);
    setHiddenBtn(null);
    isAnimatingRef.current = false;
    setJasaError('');
    setPartError('');
  }, [selectedId]);

  useLayoutEffect(() => {
    if (!flashLineId) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rowEl = document.querySelector<HTMLElement>(`tr[data-wo-line="${flashLineId}"]`);
    if (rowEl) {
      gsap.fromTo(
        rowEl,
        { opacity: 0, y: 8 },
        { opacity: 1, y: 0, duration: 0.25, ease: 'power3.out', clearProps: 'transform,opacity' }
      );
    }
  }, [flashLineId]);

  const triggerLineFlash = (lineId: string) => {
    setFlashLineId(lineId);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => setFlashLineId(null), 750);
  };

  const computeTotal = (wo: WorkOrder) => wo.lines.reduce((sum, l) => sum + l.subtotal, 0);

  const getMechanicName = (mecId?: string) =>
    mechanics.find((m) => m.id === mecId)?.nama || 'Belum ditugaskan';

  const activeMechanics = useMemo(
    () => mechanics.filter((m) => m.active),
    [mechanics]
  );

  const counts = useMemo(
    () => ({
      berjalan: workOrders.filter((w) => w.endState === null).length,
      selesai: workOrders.filter((w) => w.endState === 'selesai').length,
      batal: workOrders.filter((w) => w.endState === 'batal').length,
    }),
    [workOrders]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...workOrders]
      .filter((w) => {
        const matchesTab =
          activeTab === 'berjalan'
            ? w.endState === null
            : activeTab === 'selesai'
            ? w.endState === 'selesai'
            : w.endState === 'batal';
        if (!matchesTab) return false;
        if (!q) return true;
        const plate = getWoPlate(w).toLowerCase();
        const cname = getWoCustomerName(w).toLowerCase();
        return (
          plate.includes(q) ||
          cname.includes(q) ||
          w.id.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [workOrders, activeTab, query, getWoPlate, getWoCustomerName]);

  const selected = useMemo(
    () => (selectedId ? workOrders.find((w) => w.id === selectedId) || null : null),
    [workOrders, selectedId]
  );

  const summaryWo = useMemo(
    () => (summaryWoId ? workOrders.find((w) => w.id === summaryWoId) || null : null),
    [workOrders, summaryWoId]
  );

  const focusFirstField = useCallback((type: IslandFormType) => {
    if (type === 'jasa') {
      jasaFirstInputRef.current?.focus();
    } else {
      partFirstSelectRef.current?.focus();
    }
  }, []);

  const closeIsland = useCallback(
    (onClosed?: () => void, restoreFocus = true) => {
      if (!activeForm || isAnimatingRef.current) return;
      const closingType = activeForm;
      const btn = closingType === 'jasa' ? jasaBtnRef.current : partBtnRef.current;
      const labelEl = closingType === 'jasa' ? jasaLabelRef.current : partLabelRef.current;
      const panel = panelRef.current;
      const ghost = ghostRef.current;

      const finishClose = () => {
        setActiveForm(null);
        setHiddenBtn(null);
        if (labelEl) gsap.set(labelEl, { opacity: 1 });
        isAnimatingRef.current = false;
        if (restoreFocus) {
          window.setTimeout(() => btn?.focus(), 0);
        }
        onClosed?.();
      };

      if (!panel || !ghost) {
        finishClose();
        return;
      }

      const prefersReduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (prefersReduced) {
        finishClose();
        return;
      }

      isAnimatingRef.current = true;
      gsap.killTweensOf([panel, ghost]);
      gsap.set(panel, { willChange: 'transform, opacity' });
      gsap.set(ghost, {
        opacity: 1,
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        willChange: 'transform, opacity',
      });

      const tl = gsap.timeline({
        onComplete: () => {
          gsap.set([panel, ghost], { clearProps: 'willChange,transform,opacity' });
          finishClose();
        },
      });

      tl.to(
        panel,
        {
          opacity: 0,
          x: 16,
          duration: 0.18,
          ease: 'power3.in',
        },
        0
      );

      if (btn && document.body.contains(btn)) {
        const fitVars = Flip.fit(ghost, btn, {
          scale: true,
          getVars: true,
          duration: 0.3,
          ease: 'power3.in',
        }) as gsap.TweenVars;
        tl.to(ghost, { ...fitVars, opacity: 0 }, 0);
      } else {
        tl.to(
          ghost,
          {
            opacity: 0,
            scaleX: 0.9,
            scaleY: 0.9,
            duration: 0.3,
            ease: 'power3.in',
          },
          0
        );
      }

      probe('WOAddLineClose', tl);
    },
    [activeForm]
  );

  const handleTriggerButton = (type: IslandFormType) => {
    if (isAnimatingRef.current) return;

    if (activeForm === type) {
      closeIsland(undefined, true);
      return;
    }

    if (activeForm && activeForm !== type) {
      closeIsland(() => {
        startOpenSequence(type);
      }, false);
      return;
    }

    startOpenSequence(type);
  };

  const startOpenSequence = (type: IslandFormType) => {
    setJasaError('');
    setPartError('');
    setHiddenBtn(type);
    setActiveForm(type);
  };

  useLayoutEffect(() => {
    if (!activeForm) return;
    const panel = panelRef.current;
    const ghost = ghostRef.current;
    if (!panel || !ghost) return;

    const currentType = activeForm;
    const btn = currentType === 'jasa' ? jasaBtnRef.current : partBtnRef.current;
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    gsap.killTweensOf([panel, ghost]);

    if (prefersReduced) {
      gsap.set(ghost, { opacity: 0 });
      gsap.set(panel, { opacity: 1, x: 0, clearProps: 'willChange,transform' });
      isAnimatingRef.current = false;
      focusFirstField(currentType);
      return;
    }

    isAnimatingRef.current = true;
    const rawFields = Array.from(panel.querySelectorAll<HTMLElement>('.island-field'));
    const staggered = rawFields.slice(0, 8);
    const rest = rawFields.slice(8);

    gsap.set(panel, { opacity: 0, x: 16, willChange: 'transform, opacity' });
    gsap.set(ghost, {
      opacity: 1,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      willChange: 'transform, opacity',
    });
    if (rest.length > 0) {
      gsap.set(rest, { opacity: 1, y: 0 });
    }
    if (staggered.length > 0) {
      gsap.set(staggered, { opacity: 0, y: 8, willChange: 'transform, opacity' });
    }

    if (btn && document.body.contains(btn)) {
      Flip.fit(ghost, btn, { scale: true });
    } else {
      gsap.set(ghost, { scaleX: 0.9, scaleY: 0.9 });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set(ghost, { opacity: 0, clearProps: 'willChange,transform' });
        gsap.set(panel, { clearProps: 'willChange,transform,opacity' });
        if (staggered.length > 0) {
          gsap.set(staggered, { clearProps: 'willChange,transform,opacity' });
        }
        isAnimatingRef.current = false;
        focusFirstField(currentType);
      },
    });

    tl.to(
      ghost,
      {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        duration: 0.42,
        ease: 'power3.out',
      },
      0
    )
      .to(
        panel,
        {
          opacity: 1,
          x: 0,
          duration: 0.25,
          ease: 'power3.out',
        },
        0.231
      )
      .to(
        ghost,
        {
          opacity: 0,
          duration: 0.15,
          ease: 'power2.out',
        },
        0.231
      );

    if (staggered.length > 0) {
      tl.to(
        staggered,
        {
          opacity: 1,
          y: 0,
          duration: 0.25,
          stagger: 0.03,
          ease: 'power3.out',
        },
        0.24
      );
    }

    probe('WOAddLineOpen', tl);
  }, [activeForm, focusFirstField]);

  useEffect(() => {
    if (!activeForm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeIsland(undefined, true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeForm, closeIsland]);

  const handleAssignMechanic = (wo: WorkOrder, mechanicId: string) => {
    assignMechanicToWorkOrder(wo.id, mechanicId || undefined);
  };

  const handleSaveJasa = (e: React.FormEvent, wo: WorkOrder) => {
    e.preventDefault();
    setJasaError('');
    if (!jasaName.trim()) {
      setJasaError('Nama jasa wajib diisi.');
      return;
    }
    if (jasaQty <= 0) {
      setJasaError('Qty minimal 1.');
      return;
    }
    if (jasaPrice < 0) {
      setJasaError('Harga tidak valid.');
      return;
    }

    const res = addLineToWorkOrder(wo.id, {
      type: 'Jasa',
      name: jasaName.trim(),
      qty: jasaQty,
      unitPrice: jasaPrice,
      subtotal: jasaQty * jasaPrice,
    });
    if (!res.ok) {
      setJasaError(res.error || 'Gagal menambahkan jasa.');
      return;
    }

    const added = res.workOrder?.lines[res.workOrder.lines.length - 1];
    if (finishErrorWoId === wo.id) {
      setFinishErrorWoId(null);
      setFinishErrorMsg('');
    }
    setJasaName('');
    setJasaQty(1);
    setJasaPrice(50000);

    closeIsland(() => {
      if (added) triggerLineFlash(added.id);
    }, true);
  };

  const handleSavePart = (e: React.FormEvent, wo: WorkOrder) => {
    e.preventDefault();
    setPartError('');
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
    if (partQty > available) {
      setPartError(`Stok ${chosen.name} tersisa ${available}, tidak cukup untuk ${partQty}.`);
      return;
    }

    const res = addLineToWorkOrder(wo.id, {
      type: 'Part',
      partCode: chosen.code,
      name: chosen.name,
      qty: partQty,
      unitPrice: chosen.sellPrice,
      subtotal: partQty * chosen.sellPrice,
    });
    if (!res.ok) {
      setPartError(res.error || 'Gagal menambahkan part.');
      return;
    }

    const added = res.workOrder?.lines[res.workOrder.lines.length - 1];
    if (finishErrorWoId === wo.id) {
      setFinishErrorWoId(null);
      setFinishErrorMsg('');
    }
    setPartCode('');
    setPartQty(1);

    closeIsland(() => {
      if (added) triggerLineFlash(added.id);
    }, true);
  };

  const handleRemoveLine = (wo: WorkOrder, line: ServiceFormLine) => {
    removeLineFromWorkOrder(wo.id, line.id);
  };

  const handleOpenCancel = (wo: WorkOrder, e?: React.MouseEvent<HTMLElement>) => {
    if (e?.currentTarget) setLastTriggerElement(e.currentTarget);
    setCancelTargetWo(wo);
  };

  const handlePrintCancelledWo = (wo: WorkOrder) => {
    const sf = getLinkedSF(wo);
    printDocument('batal', {
      id: wo.id,
      source: 'Work Order',
      customerName: sf?.customer.nama || getWoCustomerName(wo),
      plate: sf?.vehicle.plat || getWoPlate(wo),
      reason: sf?.cancelReason || 'Tidak dicatat',
      cancelledAt: wo.endedAt || sf?.cancelledAt || wo.updatedAt,
    });
  };

  const handlePrintNotaWo = (wo: WorkOrder) => {
    const sf = getLinkedSF(wo);
    const jasaLines = wo.lines.filter((l) => l.type === 'Jasa');
    const partLines = wo.lines.filter((l) => l.type === 'Part');
    const jasaSubtotal = jasaLines.reduce((s, l) => s + l.subtotal, 0);
    const partSubtotal = partLines.reduce((s, l) => s + l.subtotal, 0);
    const total = jasaSubtotal + partSubtotal;

    printDocument('nota', {
      woId: wo.id,
      customerName: sf?.customer.nama || getWoCustomerName(wo),
      plate: sf?.vehicle.plat || getWoPlate(wo),
      jasaLines,
      partLines,
      jasaSubtotal,
      partSubtotal,
      total,
      date: wo.endedAt || wo.updatedAt,
    });
  };

  const handleConfirmCancelWo = (reason: string) => {
    if (!cancelTargetWo) return { ok: false, error: 'Work order tidak ditemukan.' };
    const target = cancelTargetWo;
    const plate = getWoPlate(target);
    const res = cancelServiceForm(target.serviceFormId || target.id, reason);
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    setCancelTargetWo(null);
    setSelectedId(null);
    setActiveTab('batal');
    if (routeParams.id || searchParams.get('id')) {
      navigate('/admin/v1/work-orders', { replace: true });
    }

    notifyAction({
      message: `${plate} dibatalkan.`,
      actionLabel: 'Cetak',
      onAction: () => {
        if (res.workOrder) {
          handlePrintCancelledWo(res.workOrder);
        }
      },
    });

    return { ok: true };
  };

  const handleFinishWo = (wo: WorkOrder, e?: React.MouseEvent<HTMLElement>) => {
    if (e?.currentTarget) setLastTriggerElement(e.currentTarget);
    if (wo.lines.length === 0) {
      setFinishErrorWoId(wo.id);
      setFinishErrorMsg('Tambahkan jasa atau part sebelum menandai selesai.');
      return;
    }

    const res = finishWorkOrder(wo.id);
    if (!res.ok) {
      setFinishErrorWoId(wo.id);
      setFinishErrorMsg(res.error || 'Tambahkan jasa atau part sebelum menandai selesai.');
      return;
    }

    setFinishErrorWoId(null);
    setFinishErrorMsg('');
    setSelectedId(null);
    setActiveTab('selesai');
    setSummaryWoId(wo.id);
    if (routeParams.id || searchParams.get('id')) {
      navigate('/admin/v1/work-orders', { replace: true });
    }
  };

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const columns: Column<WorkOrder>[] = useMemo(() => {
    if (activeTab === 'batal') {
      return [
        {
          key: 'plate',
          header: 'Plat nomor',
          render: (w) => {
            const p = getWoPlate(w);
            return (
              <data value={p} className="font-mono font-medium">
                {p}
              </data>
            );
          },
        },
        {
          key: 'customerName',
          header: 'Nama konsumen',
          render: (w) => getWoCustomerName(w),
        },
        {
          key: 'endedAt',
          header: 'Tanggal batal',
          align: 'right',
          render: (w) => w.endedAt || w.updatedAt,
        },
        {
          key: 'actions',
          header: 'Aksi',
          align: 'right',
          render: (w) => {
            const p = getWoPlate(w);
            return (
              <div className="inline-flex justify-end" onClick={stop} onKeyDown={stop}>
                <PrintIconButton
                  ariaLabel={`Cetak bukti pembatalan ${p}`}
                  title={`Cetak bukti pembatalan ${p}`}
                  onClick={() => handlePrintCancelledWo(w)}
                />
              </div>
            );
          },
        },
      ];
    }

    return [
      {
        key: 'plate',
        header: 'Plat nomor',
        render: (w) => {
          const p = getWoPlate(w);
          return (
            <data value={p} className="font-mono font-medium">
              {p}
            </data>
          );
        },
      },
      {
        key: 'customerName',
        header: 'Nama konsumen',
        render: (w) => getWoCustomerName(w),
      },
      {
        key: 'mechanicId',
        header: 'Mekanik',
        render: (w) => getMechanicName(w.mechanicId),
      },
      {
        key: 'total',
        header: 'Total',
        align: 'right',
        render: (w) => {
          const tot = computeTotal(w);
          return (
            <data value={tot} className="tabular-nums font-medium font-mono">
              <RollingNumber value={tot} format={formatRupiah} />
            </data>
          );
        },
      },
      {
        key: 'updatedAt',
        header: 'Diperbarui',
        align: 'right',
      },
      {
        key: 'actions',
        header: 'Aksi',
        align: 'right',
        render: (w) => {
          if (w.endState === 'selesai') {
            const p = getWoPlate(w);
            return (
              <div className="inline-flex justify-end" onClick={stop} onKeyDown={stop}>
                <PrintIconButton
                  ariaLabel={`Cetak nota servis ${p}`}
                  title={`Cetak nota servis ${p}`}
                  onClick={() => handlePrintNotaWo(w)}
                />
              </div>
            );
          }

          return (
            <div
              className="inline-flex flex-col items-end gap-1.5"
              onClick={stop}
              onKeyDown={stop}
            >
              <div className="inline-flex flex-wrap items-center justify-end gap-2">
                <ActionButton
                  intent="cancel"
                  onClick={(e) => handleOpenCancel(w, e)}
                >
                  Batal pemeriksaan
                </ActionButton>
                <ActionButton
                  intent="start"
                  onClick={(e) => handleFinishWo(w, e)}
                >
                  Selesai dilaksanakan
                </ActionButton>
              </div>
              {finishErrorWoId === w.id && finishErrorMsg && (
                <span role="alert" className="text-[12px] text-[#D62E5A]">
                  {finishErrorMsg}
                </span>
              )}
            </div>
          );
        },
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, finishErrorWoId, finishErrorMsg, mechanics, serviceForms]);

  const closeDetailView = () => {
    setSelectedId(null);
    setFinishErrorWoId(null);
    setFinishErrorMsg('');
    if (routeParams.id || searchParams.get('id')) {
      navigate('/admin/v1/work-orders', { replace: true });
    }
  };

  const closeSummaryDialog = useCallback(() => {
    setSummaryWoId(null);
    if (routeParams.id || searchParams.get('id')) {
      navigate('/admin/v1/work-orders', { replace: true });
    }
  }, [navigate, routeParams.id, searchParams]);

  const closeCancelWoPanel = useCallback(() => {
    setCancelTargetWo(null);
  }, []);

  const renderSummaryDialog = () => {
    if (!summaryWo) return null;
    const sf = getLinkedSF(summaryWo);
    const jasaLines = summaryWo.lines.filter((l) => l.type === 'Jasa');
    const partLines = summaryWo.lines.filter((l) => l.type === 'Part');
    const jasaSub = jasaLines.reduce((s, l) => s + l.subtotal, 0);
    const partSub = partLines.reduce((s, l) => s + l.subtotal, 0);
    const total = jasaSub + partSub;

    const motorDisplay = sf?.vehicle.tipeManual
      ? sf.vehicle.tipeManual
      : sf?.vehicle.tipeMotor || 'Belum diisi';

    return (
      <CenterDialog
        isOpen={Boolean(summaryWo)}
        onClose={closeSummaryDialog}
        title="Ringkasan servis"
        subtitle={summaryWo.id}
        closeStyle="icon"
        maxWidthClass="max-w-[720px]"
        footer={
          <ActionButton
            intent="start"
            onClick={() => handlePrintNotaWo(summaryWo)}
          >
            Print Nota
          </ActionButton>
        }
      >
        <div className="space-y-5">
          {/* Data konsumen & Kendaraan definition list (No KTP) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-[16px] border border-[#EEF0F4] bg-[#F6F7FA]/60">
            <div>
              <h3 className="admin-micro text-[#646B7C] mb-2">Data konsumen</h3>
              <dl className="space-y-1.5 text-[14px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nama</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {sf?.customer.nama || 'Belum diisi'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Jenis konsumen</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {sf?.customer.jenisKonsumen || 'Belum diisi'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">HP</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {sf?.customer.hp || 'Belum diisi'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Alamat</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {sf?.customer.alamat || 'Belum diisi'}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="admin-micro text-[#646B7C] mb-2">Kendaraan</h3>
              <dl className="space-y-1.5 text-[14px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Plat</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    <data value={sf?.vehicle.plat || ''}>{sf?.vehicle.plat || 'Belum diisi'}</data>
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Tipe motor</dt>
                  <dd className="font-medium text-right text-[#1E2230]">{motorDisplay}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Warna</dt>
                  <dd className="font-medium text-right text-[#1E2230]">
                    {sf?.vehicle.warna || 'Belum diisi'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor rangka</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {sf?.vehicle.rangka || 'Belum diisi'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[#646B7C]">Nomor mesin</dt>
                  <dd className="font-mono font-medium text-right text-[#1E2230]">
                    {sf?.vehicle.mesin || 'Belum diisi'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Jasa Table */}
          <div className="space-y-2">
            <div className="admin-micro text-[#646B7C]">Jasa</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[14px] bg-white">
                <thead>
                  <tr className="bg-[#F6F7FA] text-[#646B7C]">
                    <th className="py-2 px-3 admin-micro rounded-l-[12px]">Nama jasa</th>
                    <th className="py-2 px-3 admin-micro text-right">Qty</th>
                    <th className="py-2 px-3 admin-micro text-right">Harga</th>
                    <th className="py-2 px-3 admin-micro text-right rounded-r-[12px]">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {jasaLines.length === 0 ? (
                    <tr className="border-b border-[#EEF0F4]">
                      <td colSpan={4} className="py-3 text-center text-[#646B7C]">
                        Tidak ada jasa.
                      </td>
                    </tr>
                  ) : (
                    jasaLines.map((l) => (
                      <tr key={l.id} className="h-[46px] border-b border-[#EEF0F4]">
                        <td className="px-3 font-medium text-[#1E2230]">{l.name}</td>
                        <td className="px-3 text-right font-mono tabular-nums">{l.qty}</td>
                        <td className="px-3 text-right font-mono tabular-nums">
                          {formatRupiah(l.unitPrice)}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums">
                          {formatRupiah(l.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#EEF0F4]">
                    <td colSpan={3} className="py-2 px-3 admin-micro text-[#646B7C]">
                      Subtotal Jasa
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#1E2230] tabular-nums">
                      {formatRupiah(jasaSub)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Part Table */}
          <div className="space-y-2">
            <div className="admin-micro text-[#646B7C]">Part</div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[14px] bg-white">
                <thead>
                  <tr className="bg-[#F6F7FA] text-[#646B7C]">
                    <th className="py-2 px-3 admin-micro rounded-l-[12px]">Nama part</th>
                    <th className="py-2 px-3 admin-micro text-right">Qty</th>
                    <th className="py-2 px-3 admin-micro text-right">Harga</th>
                    <th className="py-2 px-3 admin-micro text-right rounded-r-[12px]">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {partLines.length === 0 ? (
                    <tr className="border-b border-[#EEF0F4]">
                      <td colSpan={4} className="py-3 text-center text-[#646B7C]">
                        Tidak ada part.
                      </td>
                    </tr>
                  ) : (
                    partLines.map((l) => (
                      <tr key={l.id} className="h-[46px] border-b border-[#EEF0F4]">
                        <td className="px-3 font-medium text-[#1E2230]">
                          {l.partCode && <samp className="mr-2 font-mono">{l.partCode}</samp>}
                          {l.name}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums">{l.qty}</td>
                        <td className="px-3 text-right font-mono tabular-nums">
                          {formatRupiah(l.unitPrice)}
                        </td>
                        <td className="px-3 text-right font-mono tabular-nums">
                          {formatRupiah(l.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#EEF0F4]">
                    <td colSpan={3} className="py-2 px-3 admin-micro text-[#646B7C]">
                      Subtotal Part
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-semibold text-[#1E2230] tabular-nums">
                      {formatRupiah(partSub)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Total at 28px weight 700 */}
          <div className="flex items-baseline justify-between pt-3 border-t border-[#EEF0F4]">
            <span className="admin-micro text-[#646B7C]">Total Servis</span>
            <output className="font-mono font-bold text-[28px] text-[#1E2230] tabular-nums">
              {formatRupiah(total)}
            </output>
          </div>

          {/* Tanggal masuk & Tanggal selesai */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-[#EEF0F4] text-[13px] text-[#646B7C]">
            <span>Tanggal masuk: {sf?.createdAt || '-'}</span>
            <span>Tanggal selesai: {summaryWo.endedAt || summaryWo.updatedAt}</span>
          </div>
        </div>
      </CenterDialog>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <PanelMorph isOpen={Boolean(selected)}>
        {selected && (() => {
          const sf = getLinkedSF(selected);
          const plate = getWoPlate(selected);
          const cname = getWoCustomerName(selected);
          const isBerjalan = selected.endState === null;
          const isBatal = selected.endState === 'batal';

          return (
            <DataCard
              title={`Detail Work Order (${selected.id})`}
              actions={
                <div className="flex items-center gap-2">
                  {isBatal && (
                    <PrintIconButton
                      ariaLabel={`Cetak bukti pembatalan ${plate}`}
                      title={`Cetak bukti pembatalan ${plate}`}
                      onClick={() => handlePrintCancelledWo(selected)}
                    />
                  )}
                  <ActionButton intent="cancel" onClick={closeDetailView}>
                    Tutup detail
                  </ActionButton>
                </div>
              }
            >
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-[#EEF0F4]">
                  <div>
                    <data
                      value={plate}
                      className="block font-mono font-medium text-[28px] text-[#1E2230] leading-none tabular-nums"
                    >
                      {plate}
                    </data>
                    <div className="text-[14px] text-[#646B7C] mt-1.5">{cname}</div>
                  </div>
                  <div className="text-right">
                    <div className="admin-micro text-[#646B7C]">Total Work Order</div>
                    <output className="block font-mono font-bold text-[26px] text-[#1E2230] leading-tight tabular-nums">
                      <RollingNumber value={computeTotal(selected)} format={formatRupiah} />
                    </output>
                  </div>
                </div>

                {isBatal && (
                  <div className="p-4 rounded-[16px] border border-[rgba(242,70,111,0.28)] bg-[#FDE3E9]/50">
                    <div className="admin-micro text-[#B4234A]">Alasan pembatalan</div>
                    <p className="mt-1 text-[14px] text-[#1E2230] font-medium">
                      {sf?.cancelReason || 'Tidak dicatat'}
                    </p>
                    {selected.endedAt && (
                      <p className="mt-1 text-[12px] text-[#646B7C] font-mono">
                        Tanggal batal: {selected.endedAt}
                      </p>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label htmlFor="wo-mechanic" className="admin-micro text-[#646B7C]">
                    Mekanik (Opsional)
                  </label>
                  {isBerjalan ? (
                    <select
                      id="wo-mechanic"
                      value={selected.mechanicId || ''}
                      onChange={(e) => handleAssignMechanic(selected, e.target.value)}
                      className="admin-input w-auto min-w-[220px]"
                    >
                      <option value="">Belum ditugaskan</option>
                      {activeMechanics.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nama}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-medium text-[14px] text-[#1E2230]">
                      {getMechanicName(selected.mechanicId)}
                    </span>
                  )}
                </div>

                {(() => {
                  const jasaLines = selected.lines.filter((l) => l.type === 'Jasa');
                  const partLines = selected.lines.filter((l) => l.type === 'Part');
                  const jasaSub = jasaLines.reduce((s, l) => s + l.subtotal, 0);
                  const partSub = partLines.reduce((s, l) => s + l.subtotal, 0);

                  return (
                    <div className="space-y-5 border-t border-[#EEF0F4] pt-4">
                      {isBerjalan && (
                        <div ref={islandAreaRef} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button
                              ref={jasaBtnRef}
                              type="button"
                              onClick={() => handleTriggerButton('jasa')}
                              aria-expanded={activeForm === 'jasa'}
                              style={{
                                visibility: hiddenBtn === 'jasa' ? 'hidden' : 'visible',
                              }}
                              className="admin-action-btn admin-intent-addline"
                            >
                              <span ref={jasaLabelRef} className="inline-block">
                                Jasa+
                              </span>
                            </button>

                            <button
                              ref={partBtnRef}
                              type="button"
                              onClick={() => handleTriggerButton('part')}
                              aria-expanded={activeForm === 'part'}
                              style={{
                                visibility: hiddenBtn === 'part' ? 'hidden' : 'visible',
                              }}
                              className="admin-action-btn admin-intent-addline"
                            >
                              <span ref={partLabelRef} className="inline-block">
                                Part+
                              </span>
                            </button>
                          </div>

                          {activeForm && (
                            <div className="relative">
                              <div
                                ref={ghostRef}
                                aria-hidden="true"
                                className="pointer-events-none absolute inset-0 rounded-[16px] bg-[#F6F7FA] border border-[#D9DDE6] z-10"
                                style={{ opacity: 0, transformOrigin: 'top left' }}
                              />
                              <div
                                ref={panelRef}
                                role="region"
                                aria-label={
                                  activeForm === 'jasa' ? 'Form tambah jasa' : 'Form tambah part'
                                }
                                className="w-full rounded-[16px] bg-[#F6F7FA] border border-[#D9DDE6] p-5"
                              >
                                <div className="island-field flex items-center justify-between gap-4 mb-4 pb-2 border-b border-[#EEF0F4]">
                                  <h4 className="admin-micro text-[#1E2230]">
                                    {activeForm === 'jasa' ? 'Tambah Jasa' : 'Tambah Part'}
                                  </h4>
                                  <XIconButton
                                    ariaLabel="Tutup formulir"
                                    title="Tutup formulir"
                                    onClick={() => closeIsland(undefined, true)}
                                  />
                                </div>

                                {activeForm === 'jasa' ? (
                                  <form
                                    onSubmit={(e) => handleSaveJasa(e, selected)}
                                    className="space-y-4"
                                  >
                                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                      <div className="island-field sm:col-span-2">
                                        <FormField
                                          id="wo-jasa-name"
                                          label="Nama jasa"
                                          error={jasaError || undefined}
                                        >
                                          <input
                                            ref={jasaFirstInputRef}
                                            id="wo-jasa-name"
                                            type="text"
                                            value={jasaName}
                                            placeholder="Contoh: Tune up"
                                            onChange={(e) => {
                                              setJasaName(e.target.value);
                                              setJasaError('');
                                            }}
                                            className="admin-input bg-white"
                                          />
                                        </FormField>
                                      </div>

                                      <div className="island-field">
                                        <FormField id="wo-jasa-qty" label="Qty">
                                          <input
                                            id="wo-jasa-qty"
                                            type="number"
                                            min={1}
                                            value={jasaQty}
                                            onChange={(e) =>
                                              setJasaQty(Number(e.target.value) || 1)
                                            }
                                            className="admin-input bg-white"
                                          />
                                        </FormField>
                                      </div>

                                      <div className="island-field">
                                        <FormField id="wo-jasa-price" label="Harga">
                                          <input
                                            id="wo-jasa-price"
                                            type="number"
                                            min={0}
                                            step={5000}
                                            value={jasaPrice}
                                            onChange={(e) =>
                                              setJasaPrice(Number(e.target.value) || 0)
                                            }
                                            className="admin-input bg-white"
                                          />
                                        </FormField>
                                      </div>
                                    </div>

                                    <div className="island-field flex justify-end">
                                      <ActionButton type="submit" intent="start">
                                        Simpan jasa
                                      </ActionButton>
                                    </div>
                                  </form>
                                ) : (
                                  <form
                                    onSubmit={(e) => handleSavePart(e, selected)}
                                    className="space-y-4"
                                  >
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                      <div className="island-field sm:col-span-2">
                                        <FormField
                                          id="wo-part-code"
                                          label="Part gudang"
                                          error={partError || undefined}
                                        >
                                          <select
                                            ref={partFirstSelectRef}
                                            id="wo-part-code"
                                            value={partCode}
                                            onChange={(e) => {
                                              setPartCode(e.target.value);
                                              setPartError('');
                                            }}
                                            className="admin-input bg-white"
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
                                        </FormField>
                                      </div>

                                      <div className="island-field">
                                        <FormField id="wo-part-qty" label="Qty">
                                          <input
                                            id="wo-part-qty"
                                            type="number"
                                            min={1}
                                            value={partQty}
                                            onChange={(e) => {
                                              setPartQty(Number(e.target.value) || 1);
                                              setPartError('');
                                            }}
                                            className="admin-input bg-white"
                                          />
                                        </FormField>
                                      </div>
                                    </div>

                                    <div className="island-field flex justify-end">
                                      <ActionButton type="submit" intent="start">
                                        Simpan part
                                      </ActionButton>
                                    </div>
                                  </form>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="space-y-2.5">
                        <div className="admin-micro text-[#646B7C]">Jasa</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[14px] bg-white">
                            <thead>
                              <tr className="bg-[#F6F7FA] text-[#646B7C]">
                                <th className="py-2.5 px-3.5 admin-micro rounded-l-[12px]">
                                  Nama jasa
                                </th>
                                <th className="py-2.5 px-3.5 admin-micro text-right">Qty</th>
                                <th className="py-2.5 px-3.5 admin-micro text-right">Harga</th>
                                <th
                                  className={`py-2.5 px-3.5 admin-micro text-right ${
                                    !isBerjalan ? 'rounded-r-[12px]' : ''
                                  }`}
                                >
                                  Subtotal
                                </th>
                                {isBerjalan && (
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
                                    colSpan={isBerjalan ? 5 : 4}
                                    className="py-3 text-center text-[#646B7C]"
                                  >
                                    Belum ada item jasa.
                                  </td>
                                </tr>
                              ) : (
                                jasaLines.map((l) => (
                                  <tr
                                    key={l.id}
                                    data-wo-line={l.id}
                                    className={`h-[52px] border-b border-[#EEF0F4] transition-colors ${
                                      flashLineId === l.id ? 'row-flash' : ''
                                    }`}
                                  >
                                    <td className="px-3.5 font-medium text-[#1E2230]">{l.name}</td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.qty}>{l.qty}</data>
                                    </td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.unitPrice}>{formatRupiah(l.unitPrice)}</data>
                                    </td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.subtotal}>{formatRupiah(l.subtotal)}</data>
                                    </td>
                                    {isBerjalan && (
                                      <td className="px-3.5 text-right">
                                        <XIconButton
                                          ariaLabel="Hapus baris jasa"
                                          title="Hapus baris jasa"
                                          onClick={() => handleRemoveLine(selected, l)}
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
                                  <output>
                                    <RollingNumber value={jasaSub} format={formatRupiah} />
                                  </output>
                                </td>
                                {isBerjalan && <td />}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      <div className="space-y-2.5 pt-3 border-t border-[#EEF0F4]">
                        <div className="admin-micro text-[#646B7C]">Part</div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-[14px] bg-white">
                            <thead>
                              <tr className="bg-[#F6F7FA] text-[#646B7C]">
                                <th className="py-2.5 px-3.5 admin-micro rounded-l-[12px]">
                                  Nama part
                                </th>
                                <th className="py-2.5 px-3.5 admin-micro text-right">Qty</th>
                                <th className="py-2.5 px-3.5 admin-micro text-right">Harga</th>
                                <th
                                  className={`py-2.5 px-3.5 admin-micro text-right ${
                                    !isBerjalan ? 'rounded-r-[12px]' : ''
                                  }`}
                                >
                                  Subtotal
                                </th>
                                {isBerjalan && (
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
                                    colSpan={isBerjalan ? 5 : 4}
                                    className="py-3 text-center text-[#646B7C]"
                                  >
                                    Belum ada item part.
                                  </td>
                                </tr>
                              ) : (
                                partLines.map((l) => (
                                  <tr
                                    key={l.id}
                                    data-wo-line={l.id}
                                    className={`h-[52px] border-b border-[#EEF0F4] transition-colors ${
                                      flashLineId === l.id ? 'row-flash' : ''
                                    }`}
                                  >
                                    <td className="px-3.5 font-medium text-[#1E2230]">
                                      {l.partCode && (
                                        <samp className="mr-2 font-mono">{l.partCode}</samp>
                                      )}
                                      {l.name}
                                    </td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.qty}>{l.qty}</data>
                                    </td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.unitPrice}>{formatRupiah(l.unitPrice)}</data>
                                    </td>
                                    <td className="px-3.5 text-right tabular-nums font-mono">
                                      <data value={l.subtotal}>{formatRupiah(l.subtotal)}</data>
                                    </td>
                                    {isBerjalan && (
                                      <td className="px-3.5 text-right">
                                        <XIconButton
                                          ariaLabel="Hapus baris jasa"
                                          title="Hapus baris jasa"
                                          onClick={() => handleRemoveLine(selected, l)}
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
                                  <output>
                                    <RollingNumber value={partSub} format={formatRupiah} />
                                  </output>
                                </td>
                                {isBerjalan && <td />}
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {isBerjalan && (
                  <div className="pt-4 border-t border-[#EEF0F4] flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <ActionButton
                        intent="cancel"
                        onClick={(e) => handleOpenCancel(selected, e)}
                      >
                        Batal pemeriksaan
                      </ActionButton>

                      <ActionButton
                        intent="start"
                        onClick={(e) => handleFinishWo(selected, e)}
                      >
                        Selesai dilaksanakan
                      </ActionButton>
                    </div>
                    {finishErrorWoId === selected.id && finishErrorMsg && (
                      <p role="alert" className="text-[13px] text-[#D62E5A] text-right">
                        {finishErrorMsg}
                      </p>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-[#EEF0F4] flex items-center justify-between gap-4">
                  <span className="text-[13px] text-[#646B7C]">
                    Diperbarui: {selected.updatedAt}
                  </span>
                </div>

                <div className="border-t border-[#EEF0F4] pt-4">
                  <h3 className="admin-micro text-[#646B7C] mb-2">
                    Riwayat pergerakan stok dan mekanik
                  </h3>
                  {selected.history.length === 0 ? (
                    <p className="text-[14px] text-[#646B7C]">
                      Belum ada riwayat perubahan mekanik atau pergerakan stok.
                    </p>
                  ) : (
                    <ul className="text-[14px]">
                      {selected.history.map((h, i) => (
                        <HistoryRow
                          key={i}
                          time={h.time}
                          who={h.performedBy}
                          what={h.action}
                          reason={h.reason}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </DataCard>
          );
        })()}
      </PanelMorph>

      <DataCard
        title="Work Order"
        actions={
          <>
            <FilterTabs
              ariaLabel="Filter status Work Order"
              value={activeTab}
              onChange={(t) => {
                setActiveTab(t as WoTab);
                setSelectedId(null);
                setFinishErrorWoId(null);
                setFinishErrorMsg('');
                if (routeParams.id || searchParams.get('id')) {
                  navigate('/admin/v1/work-orders', { replace: true });
                }
              }}
              tabs={WO_TABS.map((t) => ({
                value: t.value,
                label: t.label,
                count: counts[t.value],
              }))}
            />
            <SearchField value={query} onChange={setQuery} placeholder="Cari plat atau nama" />
          </>
        }
      >
        {filtered.length === 0 ? (
          <EmptyState
            message={
              activeTab === 'berjalan'
                ? 'Belum ada work order berjalan. Buat dari Service Form yang sudah disetujui.'
                : activeTab === 'selesai'
                ? 'Belum ada work order yang selesai.'
                : 'Belum ada work order yang dibatalkan.'
            }
          />
        ) : (
          <DataTable
            columns={columns}
            data={filtered}
            keyExtractor={(w) => w.id}
            swapKey={`${activeTab}-${query.trim().toLowerCase()}`}
            onRowClick={(w) => {
              if (w.endState === 'selesai') {
                setSummaryWoId(w.id);
                return;
              }
              setSelectedId(w.id);
              navigate(`/admin/v1/work-orders/${w.id}`);
            }}
          />
        )}
      </DataCard>

      <CancelReasonPanel
        isOpen={cancelTargetWo !== null}
        plate={cancelTargetWo ? getWoPlate(cancelTargetWo) : undefined}
        onClose={closeCancelWoPanel}
        onConfirm={handleConfirmCancelWo}
      />

      {renderSummaryDialog()}
    </div>
  );
};

export default V1WorkOrders;
