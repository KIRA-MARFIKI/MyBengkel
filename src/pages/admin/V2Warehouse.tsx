import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  cancelRegulerLine,
  receiveHoOrder,
  receiveLine,
  undoReceive,
  useAdmin,
} from '../../context/AdminContext';
import {
  Part,
  PurchaseRequest,
  PurchaseRequestLine,
  computeRequestFulfilledQty,
  computeStock,
  getLineStatusLabel,
  getRequestStatusLabel,
} from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { DataTable, Column } from '../../components/admin/DataTable';
import { FilterTabs } from '../../components/admin/FilterTabs';
import { FilterMenu } from '../../components/admin/FilterMenu';
import { StatusChip } from '../../components/admin/StatusChip';
import {
  ActionButton,
  CheckIconButton,
  EyeIconButton,
  PrinterIconButton,
  SearchIconButton,
  XIconButton,
} from '../../components/admin/ActionButton';
import { SidePanel } from '../../components/admin/SidePanel';
import { ExpandableSearch } from '../../components/admin/ExpandableSearch';
import { CancelReasonPanel } from '../../components/admin/CancelReasonPanel';
import {
  CancelHoDialog,
  RequestEyeDialog,
  printHoDocument,
} from '../../components/admin/GudangModals';
import {
  setLastTriggerElement,
  useActionIsland,
} from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';

type WarehouseTab = 'Semua' | 'Akan Datang' | 'Disetujui' | 'Ditolak';
type SemuaSubToggle = 'pemesanan' | 'part';
type AkanDatangSubToggle = 'reguler' | 'ho';
type PartFilterKey = 'all' | 'low' | 'ho_fulfilled';

interface RegulerOrderLineRow {
  rowKey: string;
  request: PurchaseRequest;
  line: PurchaseRequestLine;
  part: Part | undefined;
}

const PART_FILTER_OPTIONS = [
  { value: 'all', label: 'Semua' },
  { value: 'low', label: 'Di bawah minimum' },
  { value: 'ho_fulfilled', label: 'Jenis HO terpenuhi' },
];

export function computePartRequestDates(
  part: Part,
  purchaseRequests: PurchaseRequest[]
): { latestRequestDate: string; latestReceivedDate: string } {
  let latestReq = '';
  let latestRec = '';

  for (const req of purchaseRequests) {
    const matchingLines = req.lines.filter(
      (l) => l.partId === part.id || l.partId === part.kode
    );
    if (matchingLines.length > 0) {
      if (!latestReq || req.createdAt > latestReq) {
        latestReq = req.createdAt;
      }
      for (const l of matchingLines) {
        const recAt =
          l.receivedAt || (l.lineState === 'terima' ? req.arrivedAt || '' : '');
        if (recAt && (!latestRec || recAt > latestRec)) {
          latestRec = recAt;
        }
      }
    }
  }

  return {
    latestRequestDate: latestReq || 'Belum ada',
    latestReceivedDate: latestRec || 'Belum ada',
  };
}

export function hasReceivedLineForPart(
  part: Part,
  purchaseRequests: PurchaseRequest[]
): boolean {
  for (const req of purchaseRequests) {
    for (const l of req.lines) {
      if (
        (l.partId === part.id || l.partId === part.kode) &&
        l.lineState === 'terima'
      ) {
        return true;
      }
    }
  }
  return false;
}

const V2Warehouse: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { parts, stockMovements, purchaseRequests } = useAdmin();
  const { notify } = useActionIsland();

  const initialTabParam = params.get('tab');
  const initialTab: WarehouseTab =
    initialTabParam === 'Akan Datang' ||
    initialTabParam === 'Disetujui' ||
    initialTabParam === 'Ditolak'
      ? initialTabParam
      : 'Semua';

  const [tab, setTab] = useState<WarehouseTab>(initialTab);
  const [semuaSub, setSemuaSub] = useState<SemuaSubToggle>(
    params.get('view') === 'part' ? 'part' : 'pemesanan'
  );
  const [akanDatangSub, setAkanDatangSub] = useState<AkanDatangSubToggle>('reguler');

  const [partFilter, setPartFilter] = useState<PartFilterKey>(
    params.get('filter') === 'low' ? 'low' : 'all'
  );
  const [searchOpen, setSearchOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [selectedPartCode, setSelectedPartCode] = useState<string | null>(null);
  const [eyeRequestId, setEyeRequestId] = useState<string | null>(null);
  const [cancelLineTarget, setCancelLineTarget] = useState<RegulerOrderLineRow | null>(
    null
  );
  const [cancelHoTargetId, setCancelHoTargetId] = useState<string | null>(null);
  const [flashRowId, setFlashRowId] = useState<string | null>(null);

  useEffect(() => {
    const t = params.get('tab');
    if (t === 'Akan Datang' || t === 'Disetujui' || t === 'Ditolak' || t === 'Semua') {
      setTab(t);
    }
    if (params.get('view') === 'part') {
      setTab('Semua');
      setSemuaSub('part');
    }
    if (params.get('filter') === 'low') {
      setPartFilter('low');
    }
  }, [params]);

  useEffect(() => {
    if (searchOpen) {
      const id = window.setTimeout(() => searchInputRef.current?.focus(), 20);
      return () => window.clearTimeout(id);
    }
  }, [searchOpen]);

  const triggerFlash = (id: string) => {
    setFlashRowId(id);
    window.setTimeout(() => {
      setFlashRowId((cur) => (cur === id ? null : cur));
    }, 800);
  };

  const partMap = useMemo(() => {
    const m = new Map<string, Part>();
    for (const p of parts) {
      m.set(p.id, p);
      m.set(p.kode, p);
    }
    return m;
  }, [parts]);

  const selectedPart = useMemo(
    () => parts.find((p) => p.kode === selectedPartCode || p.id === selectedPartCode) ?? null,
    [parts, selectedPartCode]
  );

  const eyeRequest = useMemo(
    () => purchaseRequests.find((r) => r.id === eyeRequestId) ?? null,
    [purchaseRequests, eyeRequestId]
  );

  const cancelHoTarget = useMemo(
    () => purchaseRequests.find((r) => r.id === cancelHoTargetId) ?? null,
    [purchaseRequests, cancelHoTargetId]
  );

  // 1. Semua -> Semua pemesanan (requests that have an orderCode)
  const semuaPemesananRows = useMemo(
    () => purchaseRequests.filter((r) => Boolean(r.orderCode)),
    [purchaseRequests]
  );

  // 2. Semua -> Semua part (with search & filter)
  const filteredParts = useMemo(() => {
    let base = parts;
    if (partFilter === 'low') {
      base = base.filter(
        (p) =>
          p.jenis === 'reguler' &&
          p.stokMin !== null &&
          computeStock(p, stockMovements) < p.stokMin
      );
    } else if (partFilter === 'ho_fulfilled') {
      base = base.filter(
        (p) => p.jenis === 'ho' && hasReceivedLineForPart(p, purchaseRequests)
      );
    }

    const q = searchQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter(
      (p) =>
        p.kode.toLowerCase().includes(q) || p.nama.toLowerCase().includes(q)
    );
  }, [parts, partFilter, searchQuery, stockMovements, purchaseRequests]);

  // 3. Akan Datang -> Reguler (lines of Reguler orders that are not finished: state === 'belum_sampai')
  const akanDatangRegulerRows = useMemo<RegulerOrderLineRow[]>(() => {
    const rows: RegulerOrderLineRow[] = [];
    for (const req of purchaseRequests) {
      if (req.type !== 'reguler' || req.state !== 'belum_sampai') continue;
      for (const line of req.lines) {
        if (line.fulfil !== 'dipenuhi') continue;
        rows.push({
          rowKey: `${req.id}::${line.id}`,
          request: req,
          line,
          part: partMap.get(line.partId),
        });
      }
    }
    return rows;
  }, [purchaseRequests, partMap]);

  // 4. Akan Datang -> HO (HO orders in belum_sampai)
  const akanDatangHoRows = useMemo(
    () => purchaseRequests.filter((r) => r.type === 'ho' && r.state === 'belum_sampai'),
    [purchaseRequests]
  );

  // 5. Disetujui (Orders that have arrived: state === 'sampai' || state === 'selesai')
  const disetujuiRows = useMemo(
    () =>
      purchaseRequests.filter(
        (r) => Boolean(r.orderCode) && (r.state === 'sampai' || r.state === 'selesai')
      ),
    [purchaseRequests]
  );

  // 6. Ditolak (Rejected requests and cancelled orders: state === 'ditolak' || state === 'batal')
  const ditolakRows = useMemo(
    () => purchaseRequests.filter((r) => r.state === 'ditolak' || r.state === 'batal'),
    [purchaseRequests]
  );

  const akanDatangTotalCount = akanDatangRegulerRows.length + akanDatangHoRows.length;

  const getPartStatusLabel = (p: Part): 'Kritis' | 'Aman' | 'HO' => {
    if (p.jenis === 'ho') return 'HO';
    const stk = computeStock(p, stockMovements);
    return p.stokMin !== null && stk < p.stokMin ? 'Kritis' : 'Aman';
  };

  const getOrderLatestReceiptDate = (r: PurchaseRequest): string => {
    if (r.arrivedAt) return r.arrivedAt;
    let latest = '';
    for (const l of r.lines) {
      if (l.receivedAt && (!latest || l.receivedAt > latest)) {
        latest = l.receivedAt;
      }
    }
    return latest || 'Belum ada';
  };

  // Columns: Semua pemesanan
  // Kode pemesanan, Jenis (Reguler or HO), Nama (HO customer name; "Tidak berlaku" otherwise), Status (Belum sampai, Sampai, Selesai, Batal), Tanggal pesan, Tanggal terima, Aksi
  const semuaPemesananCols: Column<PurchaseRequest>[] = [
    {
      key: 'orderCode',
      header: 'Kode pemesanan',
      render: (r) => (
        <samp className="font-mono font-semibold text-[#1E2230]">
          {r.orderCode || r.id}
        </samp>
      ),
    },
    {
      key: 'jenis',
      header: 'Jenis',
      render: (r) => <StatusChip status={r.type === 'ho' ? 'HO' : 'Reguler'} />,
    },
    {
      key: 'nama',
      header: 'Nama',
      render: (r) => (
        <span className="text-[#1E2230]">
          {r.type === 'ho' && r.requesterKind === 'pelanggan'
            ? r.customer?.nama || r.requesterName
            : 'Tidak berlaku'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={getRequestStatusLabel(r)} />,
    },
    {
      key: 'orderedAt',
      header: 'Tanggal pesan',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {r.orderedAt || r.createdAt}
        </span>
      ),
    },
    {
      key: 'receivedAt',
      header: 'Tanggal terima',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {getOrderLatestReceiptDate(r)}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <EyeIconButton
            ariaLabel={`Lihat pemesanan ${r.orderCode || r.id}`}
            title="Lihat detail"
            onClick={(e) => {
              e.stopPropagation();
              setLastTriggerElement(e.currentTarget);
              setEyeRequestId(r.id);
            }}
          />
        </div>
      ),
    },
  ];

  // Columns: Semua part
  // Kode part, Nama part, Satuan, Stok, Harga beli, Harga jual, Status, Tanggal permintaan, Tanggal terima
  const semuaPartCols: Column<Part>[] = [
    {
      key: 'kode',
      header: 'Kode part',
      render: (p) => <samp className="font-mono font-semibold text-[#1E2230]">{p.kode}</samp>,
    },
    {
      key: 'nama',
      header: 'Nama part',
      render: (p) => <span className="font-medium text-[#1E2230]">{p.nama}</span>,
    },
    { key: 'satuan', header: 'Satuan' },
    {
      key: 'stok',
      header: 'Stok',
      align: 'right',
      render: (p) => {
        const stk = computeStock(p, stockMovements);
        return (
          <data value={stk} className="tabular-nums font-semibold">
            {stk}
          </data>
        );
      },
    },
    {
      key: 'hargaBeli',
      header: 'Harga beli',
      align: 'right',
      render: (p) => (
        <data value={p.hargaBeli} className="tabular-nums font-medium">
          {formatRupiah(p.hargaBeli)}
        </data>
      ),
    },
    {
      key: 'hargaJual',
      header: 'Harga jual',
      align: 'right',
      render: (p) => (
        <data value={p.hargaJual} className="tabular-nums font-medium">
          {formatRupiah(p.hargaJual)}
        </data>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (p) => <StatusChip status={getPartStatusLabel(p)} />,
    },
    {
      key: 'tanggalPermintaan',
      header: 'Tanggal permintaan',
      render: (p) => {
        const dates = computePartRequestDates(p, purchaseRequests);
        return (
          <span className="font-mono text-[13px] text-[#646B7C]">
            {dates.latestRequestDate}
          </span>
        );
      },
    },
    {
      key: 'tanggalTerima',
      header: 'Tanggal terima',
      render: (p) => {
        const dates = computePartRequestDates(p, purchaseRequests);
        return (
          <span className="font-mono text-[13px] text-[#646B7C]">
            {dates.latestReceivedDate}
          </span>
        );
      },
    },
  ];

  // Columns: Akan Datang -> Reguler
  // Kode pemesanan, Kode part, Nama part, Satuan, Stok, Jenis (the part's jenis), Status, Tanggal pemesanan, Tanggal diterima, Aksi
  const akanDatangRegulerCols: Column<RegulerOrderLineRow>[] = [
    {
      key: 'orderCode',
      header: 'Kode pemesanan',
      render: (row) => (
        <samp className="font-mono font-semibold text-[#1E2230]">
          {row.request.orderCode || row.request.id}
        </samp>
      ),
    },
    {
      key: 'kodePart',
      header: 'Kode part',
      render: (row) => (
        <samp className="font-mono font-medium text-[#1E2230]">
          {row.part?.kode || row.line.partId}
        </samp>
      ),
    },
    {
      key: 'namaPart',
      header: 'Nama part',
      render: (row) => (
        <span className="font-medium text-[#1E2230]">
          {row.part?.nama || row.line.partId}
        </span>
      ),
    },
    {
      key: 'satuan',
      header: 'Satuan',
      render: (row) => <span>{row.part?.satuan || 'pcs'}</span>,
    },
    {
      key: 'stok',
      header: 'Stok',
      align: 'right',
      render: (row) => {
        const stk = row.part ? computeStock(row.part, stockMovements) : 0;
        return (
          <data value={stk} className="tabular-nums font-semibold">
            {stk}
          </data>
        );
      },
    },
    {
      key: 'jenis',
      header: 'Jenis',
      render: (row) => (
        <StatusChip status={row.part?.jenis === 'ho' ? 'HO' : 'Reguler'} />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusChip status={getLineStatusLabel(row.line)} />,
    },
    {
      key: 'orderedAt',
      header: 'Tanggal pemesanan',
      render: (row) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {row.request.orderedAt || row.request.createdAt}
        </span>
      ),
    },
    {
      key: 'receivedAt',
      header: 'Tanggal diterima',
      render: (row) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {row.line.receivedAt || 'Belum ada'}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (row) => {
        if (row.line.lineState !== 'belum') {
          return null;
        }
        const partName = row.part?.nama || row.line.partId;
        return (
          <div
            className="flex items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckIconButton
              ariaLabel={`Terima ${partName}`}
              title="Terima"
              onClick={(e) => {
                e.stopPropagation();
                const res = receiveLine(row.request.id, row.line.id);
                if (!res.ok) return;
                triggerFlash(row.rowKey);
                notify(`${partName} diterima.`, {
                  actionLabel: 'Batalkan',
                  onAction: () => {
                    undoReceive(row.request.id, row.line.id);
                  },
                  durationMs: 4000,
                });
              }}
            />
            <XIconButton
              ariaLabel={`Batalkan pesanan ${partName}`}
              title="Batalkan pesanan"
              onClick={(e) => {
                e.stopPropagation();
                setLastTriggerElement(e.currentTarget);
                setCancelLineTarget(row);
              }}
            />
          </div>
        );
      },
    },
  ];

  // Columns: Akan Datang -> HO
  // Kode pemesanan, Nama, Nomor HP, Alamat, Tanggal pesan, Tanggal sampai, Aksi
  const akanDatangHoCols: Column<PurchaseRequest>[] = [
    {
      key: 'orderCode',
      header: 'Kode pemesanan',
      render: (r) => (
        <samp className="font-mono font-semibold text-[#1E2230]">
          {r.orderCode || r.id}
        </samp>
      ),
    },
    {
      key: 'nama',
      header: 'Nama',
      render: (r) => (
        <span className="font-medium text-[#1E2230]">
          {r.requesterKind === 'bengkel'
            ? 'Bengkel'
            : r.customer?.nama || r.requesterName}
        </span>
      ),
    },
    {
      key: 'hp',
      header: 'Nomor HP',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#1E2230]">
          {r.requesterKind === 'bengkel'
            ? 'Tidak berlaku'
            : r.customer?.hp || 'Tidak berlaku'}
        </span>
      ),
    },
    {
      key: 'alamat',
      header: 'Alamat',
      render: (r) => (
        <span className="text-[13px] text-[#1E2230]">
          {r.requesterKind === 'bengkel'
            ? 'Tidak berlaku'
            : r.customer?.alamat || 'Tidak berlaku'}
        </span>
      ),
    },
    {
      key: 'orderedAt',
      header: 'Tanggal pesan',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {r.orderedAt || r.createdAt}
        </span>
      ),
    },
    {
      key: 'arrivedAt',
      header: 'Tanggal sampai',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {r.arrivedAt || 'Belum sampai'}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => {
        const orderCode = r.orderCode || r.id;
        return (
          <div
            className="flex items-center justify-end gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <CheckIconButton
              ariaLabel={`Approve ${orderCode}`}
              title="Approve"
              onClick={(e) => {
                e.stopPropagation();
                const res = receiveHoOrder(r.id);
                if (!res.ok) return;
                triggerFlash(r.id);
                notify(`${orderCode} sampai. Proses di Permintaan HO.`, {
                  actionLabel: 'Batalkan',
                  onAction: () => {
                    undoReceive(r.id);
                  },
                  durationMs: 4000,
                });
              }}
            />
            <XIconButton
              ariaLabel={`Batal ${orderCode}`}
              title="Batal"
              onClick={(e) => {
                e.stopPropagation();
                setLastTriggerElement(e.currentTarget);
                setCancelHoTargetId(r.id);
              }}
            />
          </div>
        );
      },
    },
  ];

  // Columns: Disetujui
  // Kode pemesanan, Jenis, Nama, Jumlah, Status (Sampai or Selesai), Tanggal pesan, Tanggal sampai, Aksi (eye)
  const disetujuiCols: Column<PurchaseRequest>[] = [
    {
      key: 'orderCode',
      header: 'Kode pemesanan',
      render: (r) => (
        <samp className="font-mono font-semibold text-[#1E2230]">
          {r.orderCode || r.id}
        </samp>
      ),
    },
    {
      key: 'jenis',
      header: 'Jenis',
      render: (r) => <StatusChip status={r.type === 'ho' ? 'HO' : 'Reguler'} />,
    },
    {
      key: 'nama',
      header: 'Nama',
      render: (r) => (
        <span className="text-[#1E2230]">
          {r.type === 'ho'
            ? r.requesterKind === 'pelanggan'
              ? r.customer?.nama || r.requesterName
              : 'Bengkel'
            : 'Tidak berlaku'}
        </span>
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
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={getRequestStatusLabel(r)} />,
    },
    {
      key: 'orderedAt',
      header: 'Tanggal pesan',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {r.orderedAt || r.createdAt}
        </span>
      ),
    },
    {
      key: 'arrivedAt',
      header: 'Tanggal sampai',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {getOrderLatestReceiptDate(r)}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <EyeIconButton
            ariaLabel={`Lihat ${r.orderCode || r.id}`}
            title="Lihat detail"
            onClick={(e) => {
              e.stopPropagation();
              setLastTriggerElement(e.currentTarget);
              setEyeRequestId(r.id);
            }}
          />
        </div>
      ),
    },
  ];

  // Columns: Ditolak
  // Kode permintaan, Kode pemesanan ("Belum ada" when it was rejected before an order), Jenis, Nama, Jumlah, Status (Ditolak or Batal), Alasan (one line, truncated), Tanggal ditolak, Aksi
  const ditolakCols: Column<PurchaseRequest>[] = [
    {
      key: 'id',
      header: 'Kode permintaan',
      render: (r) => <samp className="font-mono font-semibold text-[#1E2230]">{r.id}</samp>,
    },
    {
      key: 'orderCode',
      header: 'Kode pemesanan',
      render: (r) => (
        <samp className="font-mono text-[13px] text-[#1E2230]">
          {r.orderCode || 'Belum ada'}
        </samp>
      ),
    },
    {
      key: 'jenis',
      header: 'Jenis',
      render: (r) => <StatusChip status={r.type === 'ho' ? 'HO' : 'Reguler'} />,
    },
    {
      key: 'nama',
      header: 'Nama',
      render: (r) => (
        <span className="text-[#1E2230]">
          {r.type === 'ho'
            ? r.requesterKind === 'pelanggan'
              ? r.customer?.nama || r.requesterName
              : 'Bengkel'
            : 'Tidak berlaku'}
        </span>
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
      key: 'status',
      header: 'Status',
      render: (r) => <StatusChip status={getRequestStatusLabel(r)} />,
    },
    {
      key: 'alasan',
      header: 'Alasan',
      render: (r) => (
        <span
          title={r.closeReason || 'Tidak dicatat'}
          className="block max-w-[200px] truncate text-[13px] text-[#646B7C]"
        >
          {r.closeReason || 'Tidak dicatat'}
        </span>
      ),
    },
    {
      key: 'closedAt',
      header: 'Tanggal ditolak',
      render: (r) => (
        <span className="font-mono text-[13px] text-[#646B7C]">
          {r.closedAt || r.createdAt}
        </span>
      ),
    },
    {
      key: 'aksi',
      header: 'Aksi',
      align: 'right',
      render: (r) => (
        <div
          className="flex items-center justify-end gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <EyeIconButton
            ariaLabel={`Lihat ${r.id}`}
            title="Lihat detail"
            onClick={(e) => {
              e.stopPropagation();
              setLastTriggerElement(e.currentTarget);
              setEyeRequestId(r.id);
            }}
          />
          {r.type === 'ho' && r.state === 'batal' && (
            <PrinterIconButton
              ariaLabel="Cetak bukti pembatalan HO"
              title="Cetak bukti pembatalan HO"
              onClick={(e) => {
                e.stopPropagation();
                printHoDocument(r, parts, 'batal_ho');
              }}
            />
          )}
        </div>
      ),
    },
  ];

  const selectedMovements = useMemo(() => {
    if (!selectedPart) return [];
    return stockMovements.filter(
      (m) => m.partCode === selectedPart.kode || m.partCode === selectedPart.id
    );
  }, [selectedPart, stockMovements]);

  return (
    <>
      <DataCard
        title="Pengelolaan Gudang"
        actions={
          <FilterTabs
            ariaLabel="Filter tab pengelolaan gudang"
            value={tab}
            onChange={(next) => {
              const nextTab = next as WarehouseTab;
              setTab(nextTab);
              setParams(nextTab === 'Semua' ? {} : { tab: nextTab });
            }}
            tabs={[
              {
                value: 'Semua',
                label: 'Semua',
                count:
                  semuaSub === 'pemesanan' ? semuaPemesananRows.length : parts.length,
              },
              {
                value: 'Akan Datang',
                label: 'Akan Datang',
                count: akanDatangTotalCount,
              },
              {
                value: 'Disetujui',
                label: 'Disetujui',
                count: disetujuiRows.length,
              },
              {
                value: 'Ditolak',
                label: 'Ditolak',
                count: ditolakRows.length,
              },
            ]}
          />
        }
      >
        <div className="space-y-4">
          {/* Sub-toggles for Semua */}
          {tab === 'Semua' && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <FilterTabs
                ariaLabel="Tampilan tab Semua"
                value={semuaSub}
                onChange={(v) => setSemuaSub(v as SemuaSubToggle)}
                tabs={[
                  {
                    value: 'pemesanan',
                    label: 'Semua pemesanan',
                    count: semuaPemesananRows.length,
                  },
                  { value: 'part', label: 'Semua part', count: parts.length },
                ]}
              />

              {semuaSub === 'part' && (
                <div className="flex flex-wrap items-center gap-2">
                  <ExpandableSearch
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Kode atau nama part..."
                    ariaLabel="Cari part"
                  />

                  <FilterMenu
                    value={partFilter}
                    defaultValue="all"
                    options={PART_FILTER_OPTIONS}
                    onChange={(v) => setPartFilter(v as PartFilterKey)}
                    ariaLabel="Filter part"
                  />
                </div>
              )}
            </div>
          )}

          {/* Sub-toggles for Akan Datang */}
          {tab === 'Akan Datang' && (
            <div className="flex items-center justify-between gap-3">
              <FilterTabs
                ariaLabel="Jenis pesanan akan datang"
                value={akanDatangSub}
                onChange={(v) => setAkanDatangSub(v as AkanDatangSubToggle)}
                tabs={[
                  {
                    value: 'reguler',
                    label: 'Reguler',
                    count: akanDatangRegulerRows.length,
                  },
                  { value: 'ho', label: 'HO', count: akanDatangHoRows.length },
                ]}
              />
            </div>
          )}

          {/* Table Content by Tab */}
          {tab === 'Semua' && semuaSub === 'pemesanan' && (
            <DataTable
              columns={semuaPemesananCols}
              data={semuaPemesananRows}
              keyExtractor={(r) => r.id}
              flashKey={flashRowId}
              emptyMessage="Belum ada pemesanan. Setujui permintaan di Permintaan Penyediaan."
              swapKey="semua-pemesanan"
            />
          )}

          {tab === 'Semua' && semuaSub === 'part' && (
            <>
              {parts.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA]">
                  <p className="text-[14px] text-[#646B7C]">
                    Belum ada part. Tambahkan lewat Master Gudang.
                  </p>
                </div>
              ) : filteredParts.length === 0 ? (
                <div className="py-8 px-4 text-center rounded-[12px] bg-[#F6F7FA] space-y-2">
                  <p className="text-[14px] text-[#646B7C]">
                    Tidak ada part untuk filter ini.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPartFilter('all');
                      setSearchQuery('');
                    }}
                    className="font-sans text-[13px] font-semibold text-[#1D6FC4] underline underline-offset-2"
                  >
                    Hapus filter
                  </button>
                </div>
              ) : (
                <DataTable
                  columns={semuaPartCols}
                  data={filteredParts}
                  keyExtractor={(p) => p.kode}
                  onRowClick={(p) => setSelectedPartCode(p.kode)}
                  flashKey={flashRowId}
                  swapKey={`semua-part-${partFilter}-${searchQuery}`}
                />
              )}
            </>
          )}

          {tab === 'Akan Datang' && akanDatangSub === 'reguler' && (
            <DataTable
              columns={akanDatangRegulerCols}
              data={akanDatangRegulerRows}
              keyExtractor={(row) => row.rowKey}
              flashKey={flashRowId}
              emptyMessage="Tidak ada barang yang sedang dipesan."
              swapKey="akan-datang-reguler"
            />
          )}

          {tab === 'Akan Datang' && akanDatangSub === 'ho' && (
            <DataTable
              columns={akanDatangHoCols}
              data={akanDatangHoRows}
              keyExtractor={(r) => r.id}
              flashKey={flashRowId}
              emptyMessage="Tidak ada barang yang sedang dipesan."
              swapKey="akan-datang-ho"
            />
          )}

          {tab === 'Disetujui' && (
            <DataTable
              columns={disetujuiCols}
              data={disetujuiRows}
              keyExtractor={(r) => r.id}
              flashKey={flashRowId}
              emptyMessage="Belum ada barang yang sampai."
              swapKey="disetujui"
            />
          )}

          {tab === 'Ditolak' && (
            <DataTable
              columns={ditolakCols}
              data={ditolakRows}
              keyExtractor={(r) => r.id}
              flashKey={flashRowId}
              emptyMessage="Tidak ada permintaan yang ditolak."
              swapKey="ditolak"
            />
          )}
        </div>
      </DataCard>

      {/* Read-only Eye Popup for orders */}
      <RequestEyeDialog
        isOpen={Boolean(eyeRequestId)}
        request={eyeRequest}
        parts={parts}
        readOnly
        onClose={() => setEyeRequestId(null)}
      />

      {/* Cancel Reguler Line Reason Panel */}
      <CancelReasonPanel
        isOpen={Boolean(cancelLineTarget)}
        title={
          cancelLineTarget
            ? `Batalkan pesanan ${
                cancelLineTarget.part?.nama || cancelLineTarget.line.partId || ''
              }`
            : 'Batalkan pesanan'
        }
        onClose={() => setCancelLineTarget(null)}
        onConfirm={(reason) => {
          if (!cancelLineTarget) return;
          const res = cancelRegulerLine(
            cancelLineTarget.request.id,
            cancelLineTarget.line.id,
            reason
          );
          if (!res.ok) return res;
          notify('Pesanan part dibatalkan.');
          return { ok: true };
        }}
      />

      {/* Cancel HO Verification Dialog */}
      <CancelHoDialog
        isOpen={Boolean(cancelHoTargetId)}
        request={cancelHoTarget}
        onClose={() => setCancelHoTargetId(null)}
        onCancelled={(cancelled) => {
          const codeLabel = cancelled.orderCode || cancelled.id;
          notify(`${codeLabel} dibatalkan.`, {
            actionLabel: 'Cetak',
            onAction: () => printHoDocument(cancelled, parts, 'batal_ho'),
            durationMs: 5000,
          });
        }}
      />

      {/* Read-only Part Panel with Stock Movement History */}
      <SidePanel
        isOpen={Boolean(selectedPart)}
        onClose={() => setSelectedPartCode(null)}
        title={selectedPart ? `${selectedPart.kode} - ${selectedPart.nama}` : 'Detail Part'}
        footer={
          <ActionButton
            type="button"
            intent="cancel"
            onClick={() => setSelectedPartCode(null)}
          >
            Tutup
          </ActionButton>
        }
      >
        {selectedPart && (
          <div className="space-y-6">
            <dl className="grid grid-cols-2 gap-3 p-4 rounded-[12px] bg-[#F6F7FA] text-[13px]">
              <div>
                <dt className="text-[#646B7C]">Kode part</dt>
                <dd className="font-mono font-semibold text-[#1E2230] mt-0.5">
                  {selectedPart.kode}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Satuan</dt>
                <dd className="font-medium text-[#1E2230] mt-0.5">{selectedPart.satuan}</dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Stok saat ini</dt>
                <dd className="font-mono font-bold text-[18px] text-[#1E2230] mt-0.5 tabular-nums">
                  {computeStock(selectedPart, stockMovements)}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Status</dt>
                <dd className="mt-1">
                  <StatusChip status={getPartStatusLabel(selectedPart)} />
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Harga beli</dt>
                <dd className="font-mono font-medium text-[#1E2230] mt-0.5 tabular-nums">
                  {formatRupiah(selectedPart.hargaBeli)}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Harga jual</dt>
                <dd className="font-mono font-medium text-[#1E2230] mt-0.5 tabular-nums">
                  {formatRupiah(selectedPart.hargaJual)}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Stok minimum</dt>
                <dd className="font-mono text-[#1E2230] mt-0.5 tabular-nums">
                  {selectedPart.jenis === 'ho'
                    ? 'Tidak berlaku'
                    : selectedPart.stokMin ?? 1}
                </dd>
              </div>
              <div>
                <dt className="text-[#646B7C]">Jenis</dt>
                <dd className="mt-1">
                  <StatusChip status={selectedPart.jenis === 'ho' ? 'HO' : 'Reguler'} />
                </dd>
              </div>
            </dl>

            <div>
              <h3 className="text-[14px] font-semibold text-[#1E2230] mb-2">
                Riwayat pergerakan stok
              </h3>
              {selectedMovements.length === 0 ? (
                <p className="text-[13px] text-[#646B7C]">Belum ada pergerakan stok.</p>
              ) : (
                <ul className="divide-y divide-[#EEF0F4] text-[13px]">
                  {selectedMovements.map((m) => (
                    <li key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-medium text-[#1E2230]">{m.reason}</span>
                        <span className="text-[12px] text-[#646B7C] ml-2">
                          ({m.reference} · {m.date})
                        </span>
                      </div>
                      <data
                        value={m.quantity}
                        className={`font-mono font-semibold tabular-nums ${
                          m.quantity >= 0 ? 'text-[#1F9D3A]' : 'text-[#D62E5A]'
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </data>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </SidePanel>
    </>
  );
};

export default V2Warehouse;
