import React, { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  useAdmin,
  type SaleOperationResult,
} from '../../context/AdminContext';
import type { Part, Sale, SaleLine, SalePaymentMethod } from '../../data/adminDummy';
import { DataCard } from '../../components/admin/DataCard';
import { StatusChip } from '../../components/admin/StatusChip';
import { CenterDialog } from '../../components/admin/CenterDialog';
import {
  ActionButton,
  BanknoteIcon,
  CheckIcon,
  LandmarkIcon,
  MinusIconButton,
  PlusIconButton,
  QrCodeIcon,
  SearchIcon,
  TrashIconButton,
  XIcon,
  XIconButton,
} from '../../components/admin/ActionButton';
import { FormField } from '../../components/admin/FormField';
import { RollingNumber } from '../../components/admin/island/IslandSystem';
import { formatRupiah } from '../../lib/format';

export const V2Sales: React.FC = () => {
  const {
    parts,
    customers,
    getAvailableSalePartStock,
    completeCashSale,
    createSaleCheckout,
    confirmSalePayment,
    cancelPendingSale,
    printSalesReceipt,
  } = useAdmin();

  // -------------------------------------------------------------
  // POS Cashier State
  // -------------------------------------------------------------
  const [customerName, setCustomerName] = useState<string>('');
  const [customerSearch, setCustomerSearch] = useState<string>('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);

  const [selectedPartCode, setSelectedPartCode] = useState<string>('');
  const [partSearch, setPartSearch] = useState<string>('');
  const [partQty, setPartQty] = useState<number>(1);
  const [isPartDropdownOpen, setIsPartDropdownOpen] = useState<boolean>(false);
  const [stockAlert, setStockAlert] = useState<string | null>(null);

  const [cartLines, setCartLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<SalePaymentMethod>('Tunai');
  const [cashReceivedInput, setCashReceivedInput] = useState<string>('');

  // Active pending sale checkout (Transfer or QR)
  const [activeCheckoutSale, setActiveCheckoutSale] = useState<Sale | null>(null);

  // Completed sale for receipt popup
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);

  // Accessibility unique IDs
  const customerInputId = useId();
  const partInputId = useId();
  const qtyInputId = useId();
  const cashInputId = useId();

  // -------------------------------------------------------------
  // Calculations & Lookups
  // -------------------------------------------------------------

  // Cart grand total
  const cartGrandTotal = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.subtotal, 0),
    [cartLines]
  );
  const totalItemsCount = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.qty, 0),
    [cartLines]
  );

  // Selected part object
  const selectedPart = useMemo<Part | undefined>(
    () => parts.find((p) => p.kode === selectedPartCode || p.code === selectedPartCode),
    [parts, selectedPartCode]
  );

  // Real-time available sellable stock for selected part (minus items currently in cart)
  const availableStockForSelected = useMemo(() => {
    if (!selectedPartCode) return 0;
    const storeAvail = getAvailableSalePartStock(selectedPartCode);
    const inCartQty = cartLines
      .filter((l) => (l.partCode || l.partId) === selectedPartCode)
      .reduce((sum, l) => sum + l.qty, 0);
    return Math.max(0, storeAvail - inCartQty);
  }, [selectedPartCode, getAvailableSalePartStock, cartLines]);

  // Filtered customer list for quick selection
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    const q = customerSearch.toLowerCase();
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          (c.plate || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  // Filtered parts list for quick search
  const filteredParts = useMemo(() => {
    const q = partSearch.toLowerCase();
    return parts
      .filter((p) => {
        const name = (p.nama || p.name || '').toLowerCase();
        const code = (p.kode || p.code || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      })
      .slice(0, 10);
  }, [parts, partSearch]);

  // Parsed cash received
  const cashReceived = useMemo(() => {
    const val = Number(cashReceivedInput.replace(/\D/g, ''));
    return Number.isNaN(val) ? 0 : val;
  }, [cashReceivedInput]);

  // Cash change calculation
  const cashChange = useMemo(() => {
    return Math.max(0, cashReceived - cartGrandTotal);
  }, [cashReceived, cartGrandTotal]);

  const isCashSufficient = cashReceived >= cartGrandTotal && cartGrandTotal > 0;

  // Dynamic quick cash shortcut buttons
  const quickCashOptions = useMemo(() => {
    if (cartGrandTotal <= 0) return [];
    const standardOptions = [cartGrandTotal, 50000, 100000, 200000, 500000];
    const unique = Array.from(new Set(standardOptions))
      .filter((amt) => amt >= cartGrandTotal)
      .sort((a, b) => a - b);
    return unique.slice(0, 4);
  }, [cartGrandTotal]);

  // -------------------------------------------------------------
  // POS Cashier Cart Handlers
  // -------------------------------------------------------------

  const handleSelectCustomer = (name: string) => {
    setCustomerName(name);
    setCustomerSearch('');
    setIsCustomerDropdownOpen(false);
  };

  const handleSelectPart = (p: Part) => {
    const code = p.kode || p.code || '';
    setSelectedPartCode(code);
    setPartSearch(`${code} - ${p.nama || p.name}`);
    setIsPartDropdownOpen(false);
    setPartQty(1);
    setStockAlert(null);
  };

  const handleAddToCart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setStockAlert(null);

    if (!selectedPart) {
      setStockAlert('Pilih sparepart terlebih dahulu.');
      return;
    }

    if (partQty <= 0) {
      setStockAlert('Jumlah part minimal 1.');
      return;
    }

    const code = selectedPart.kode || selectedPart.code || '';
    const partName = selectedPart.nama || selectedPart.name || 'Part';
    const price = selectedPart.hargaJual ?? selectedPart.sellPrice ?? 0;

    // Check against store available stock accounting for existing items in cart
    const existingIndex = cartLines.findIndex((l) => (l.partCode || l.partId) === code);
    const existingQty = existingIndex >= 0 ? cartLines[existingIndex].qty : 0;
    const totalRequestedQty = existingQty + partQty;

    const physicalAvailable = getAvailableSalePartStock(code);

    if (totalRequestedQty > physicalAvailable) {
      setStockAlert(
        `Stok ${partName} tersisa ${physicalAvailable}. Di keranjang sudah ada ${existingQty}, tidak cukup menambah ${partQty} lagi.`
      );
      return;
    }

    if (existingIndex >= 0) {
      // Duplicate item: increment quantity
      setCartLines((prev) =>
        prev.map((l, i) =>
          i === existingIndex
            ? {
                ...l,
                qty: l.qty + partQty,
                subtotal: (l.qty + partQty) * l.price,
              }
            : l
        )
      );
    } else {
      // Add new cart line
      const newLine: SaleLine = {
        partId: code,
        partCode: code,
        name: partName,
        qty: partQty,
        price,
        subtotal: partQty * price,
      };
      setCartLines((prev) => [...prev, newLine]);
    }

    // Reset part selection inputs
    setSelectedPartCode('');
    setPartSearch('');
    setPartQty(1);
  };

  const handleUpdateLineQty = (index: number, delta: number) => {
    setStockAlert(null);
    const target = cartLines[index];
    if (!target) return;

    const nextQty = target.qty + delta;
    if (nextQty <= 0) {
      handleRemoveLine(index);
      return;
    }

    const code = target.partCode || target.partId || '';
    const physicalAvailable = getAvailableSalePartStock(code);

    if (delta > 0 && nextQty > physicalAvailable) {
      setStockAlert(`Stok ${target.name} hanya tersisa ${physicalAvailable} pcs.`);
      return;
    }

    setCartLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              qty: nextQty,
              subtotal: nextQty * l.price,
            }
          : l
      )
    );
  };

  const handleRemoveLine = (index: number) => {
    setCartLines((prev) => prev.filter((_, i) => i !== index));
    setStockAlert(null);
  };

  const handleClearCart = () => {
    setCartLines([]);
    setCashReceivedInput('');
    setStockAlert(null);
    if (activeCheckoutSale) {
      cancelPendingSale(activeCheckoutSale.id);
      setActiveCheckoutSale(null);
    }
  };

  const handleResetForNewCustomer = () => {
    setCustomerName('');
    setCustomerSearch('');
    setSelectedPartCode('');
    setPartSearch('');
    setPartQty(1);
    setCartLines([]);
    setCashReceivedInput('');
    setActiveCheckoutSale(null);
    setCompletedSale(null);
    setStockAlert(null);
  };

  // -------------------------------------------------------------
  // Payment Workflows
  // -------------------------------------------------------------

  // 1. Tunai (Cash) Sale Completion
  const handleFinalizeCashSale = () => {
    setStockAlert(null);
    if (!customerName.trim()) {
      setStockAlert('Nama konsumen wajib diisi sebelum memproses pembayaran.');
      return;
    }
    if (cartLines.length === 0) {
      setStockAlert('Daftar part masih kosong.');
      return;
    }
    if (!isCashSufficient) {
      setStockAlert(
        `Uang tunai belum mencukupi total belanja (${formatRupiah(cartGrandTotal)}).`
      );
      return;
    }

    const result = completeCashSale({
      customerName: customerName.trim(),
      lines: cartLines,
      cashReceived,
      cashierName: 'Kasir Utama',
    });

    if (result.ok && result.sale) {
      setCompletedSale(result.sale);
      setCartLines([]);
      setCustomerName('');
      setCashReceivedInput('');
      setActiveCheckoutSale(null);
    } else {
      setStockAlert(result.error || 'Terjadi kesalahan saat memproses transaksi tunai.');
    }
  };

  // 2. Transfer: Initiate Checkout
  const handleStartTransferCheckout = () => {
    setStockAlert(null);
    if (!customerName.trim()) {
      setStockAlert('Nama konsumen wajib diisi sebelum memulai pembayaran transfer.');
      return;
    }
    if (cartLines.length === 0) {
      setStockAlert('Daftar part masih kosong.');
      return;
    }

    const res = createSaleCheckout({
      customerName: customerName.trim(),
      lines: cartLines,
      method: 'Transfer',
      cashierName: 'Kasir Utama',
    });

    if (res.ok && res.sale) {
      setActiveCheckoutSale(res.sale);
    } else {
      setStockAlert(res.error || 'Gagal memulai checkout transfer.');
    }
  };

  // 3. QR: Initiate Checkout
  const handleStartQrCheckout = () => {
    setStockAlert(null);
    if (!customerName.trim()) {
      setStockAlert('Nama konsumen wajib diisi sebelum membuat kode QR.');
      return;
    }
    if (cartLines.length === 0) {
      setStockAlert('Daftar part masih kosong.');
      return;
    }

    const res = createSaleCheckout({
      customerName: customerName.trim(),
      lines: cartLines,
      method: 'QR',
      cashierName: 'Kasir Utama',
    });

    if (res.ok && res.sale) {
      setActiveCheckoutSale(res.sale);
    } else {
      setStockAlert(res.error || 'Gagal memulai checkout QR.');
    }
  };

  // Simulate payment confirmation (Prototype Testing)
  const handleSimulatePaymentReceived = () => {
    if (!activeCheckoutSale) return;
    const res: SaleOperationResult = confirmSalePayment(activeCheckoutSale.id);
    if (res.ok && res.sale) {
      setCompletedSale(res.sale);
      setActiveCheckoutSale(null);
      setCartLines([]);
      setCustomerName('');
      setCashReceivedInput('');
    } else {
      setStockAlert(res.error || 'Gagal mengonfirmasi pembayaran simulasi.');
    }
  };

  // Cancel active pending checkout
  const handleCancelActiveCheckout = () => {
    if (!activeCheckoutSale) return;
    cancelPendingSale(activeCheckoutSale.id, 'Dibatalkan oleh kasir');
    setActiveCheckoutSale(null);
  };

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------- */}
      {/* Top Prototype Information Banner & Navigation Action       */}
      {/* ----------------------------------------------------------- */}
      <div className="rounded-[16px] bg-[#E4F2FE] border border-[#BFDBFE] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1A64B0] text-white flex items-center justify-center shrink-0 mt-0.5">
            <BanknoteIcon size={18} />
          </div>
          <div className="text-[13px] text-[#1E3A8A] leading-relaxed">
            <div className="font-semibold text-[#1E2230] text-[14px] mb-0.5">
              Sistem Kasir Penjualan Sparepart (POS)
            </div>
            <div>
              Area kasir ini terhubung langsung ke Master Gudang dan mutasi stok secara real-time.
            </div>
          </div>
        </div>

        <Link
          to="/admin/laporan/penjualan"
          className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] bg-white border border-[#D9DDE6] text-[#1E2230] hover:bg-[#F3F4F6] text-[13px] font-semibold transition-colors shadow-sm"
        >
          <span>Laporan Penjualan</span>
          <span aria-hidden="true">&rarr;</span>
        </Link>
      </div>

      {/* Stock warning notification banner */}
      {stockAlert && (
        <div
          role="alert"
          className="rounded-[14px] bg-[#FDE3E9] border border-[#FCA5A5] p-3.5 flex items-center justify-between gap-3 text-[13px] text-[#B4234A]"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">Perhatian:</span>
            <span>{stockAlert}</span>
          </div>
          <XIconButton
            ariaLabel="Tutup pemberitahuan"
            title="Tutup"
            onClick={() => setStockAlert(null)}
            className="!w-6 !h-6 !min-w-[24px] !min-h-[24px] !rounded-[6px]"
          />
        </div>
      )}

      {/* ----------------------------------------------------------- */}
      {/* Main Cashier Workspace                                      */}
      {/* ----------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Customer & Part Selector (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Card 1: Data Konsumen */}
          <DataCard title="Data Konsumen" className="!p-5">
            <div className="space-y-3">
              <FormField
                id={customerInputId}
                label="Nama Konsumen"
                helperText="Pilih pelanggan terdaftar atau ketik langsung nama pembeli umum"
              >
                <div className="relative">
                  <input
                    id={customerInputId}
                    type="text"
                    value={customerName}
                    onChange={(e) => {
                      setCustomerName(e.target.value);
                      setCustomerSearch(e.target.value);
                      setIsCustomerDropdownOpen(true);
                    }}
                    onFocus={() => setIsCustomerDropdownOpen(true)}
                    placeholder="Contoh: Budi Santoso / Pelanggan Umum"
                    className="admin-input pr-10"
                    autoComplete="off"
                  />
                  {customerName && (
                    <button
                      type="button"
                      aria-label="Bersihkan nama konsumen"
                      onClick={() => {
                        setCustomerName('');
                        setCustomerSearch('');
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#646B7C] hover:text-[#1E2230] p-1"
                    >
                      <XIcon size={14} />
                    </button>
                  )}

                  {/* Customer Quick Search Dropdown */}
                  {isCustomerDropdownOpen && filteredCustomers.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white border border-[#D9DDE6] rounded-[12px] shadow-lg max-h-52 overflow-y-auto divide-y divide-[#EEF0F4]">
                      <div className="p-2 text-[11px] font-semibold text-[#646B7C] uppercase tracking-wider bg-[#F8F9FA]">
                        Pelanggan Terdaftar
                      </div>
                      {filteredCustomers.map((cust) => (
                        <button
                          key={cust.id}
                          type="button"
                          onClick={() => handleSelectCustomer(cust.name)}
                          className="w-full text-left p-2.5 hover:bg-[#F3F4F6] flex items-center justify-between transition-colors text-[13px]"
                        >
                          <div>
                            <div className="font-semibold text-[#1E2230]">{cust.name}</div>
                            <div className="text-[11px] text-[#646B7C] font-mono">
                              {cust.phone} &bull; {cust.plate}
                            </div>
                          </div>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#E4F2FE] text-[#1A64B0]">
                            Pilih
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormField>

              {customerName ? (
                <div className="flex items-center justify-between p-2.5 rounded-[10px] bg-[#F8F9FA] border border-[#EEF0F4] text-[12px]">
                  <span className="text-[#4B5563]">
                    Pembeli aktif:{' '}
                    <strong className="text-[#1E2230] font-semibold">{customerName}</strong>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#E5E7EB] text-[#374151] font-mono text-[11px]">
                    Siap transaksi
                  </span>
                </div>
              ) : (
                <div className="text-[12px] text-[#646B7C] italic">
                  * Nama konsumen wajib diisi sebelum menyimpan transaksi.
                </div>
              )}
            </div>
          </DataCard>

          {/* Card 2: Pilih Sparepart */}
          <DataCard title="Pilih Sparepart" className="!p-5">
            <form onSubmit={handleAddToCart} className="space-y-4">
              <FormField
                id={partInputId}
                label="Cari Part dari Master Gudang"
                helperText="Pilih berdasarkan kode atau nama part"
              >
                <div className="relative">
                  <div className="relative">
                    <input
                      id={partInputId}
                      type="text"
                      value={partSearch}
                      onChange={(e) => {
                        setPartSearch(e.target.value);
                        setIsPartDropdownOpen(true);
                      }}
                      onFocus={() => setIsPartDropdownOpen(true)}
                      placeholder="Ketik kode (PRT-xxx) atau nama part..."
                      className="admin-input pl-9 pr-10"
                      autoComplete="off"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#646B7C] pointer-events-none">
                      <SearchIcon size={16} />
                    </div>
                    {partSearch && (
                      <button
                        type="button"
                        aria-label="Bersihkan pilihan part"
                        onClick={() => {
                          setPartSearch('');
                          setSelectedPartCode('');
                          setStockAlert(null);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#646B7C] hover:text-[#1E2230] p-1"
                      >
                        <XIcon size={14} />
                      </button>
                    )}
                  </div>

                  {/* Parts Dropdown */}
                  {isPartDropdownOpen && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-1.5 bg-white border border-[#D9DDE6] rounded-[12px] shadow-lg max-h-56 overflow-y-auto divide-y divide-[#EEF0F4]">
                      {filteredParts.length > 0 ? (
                        filteredParts.map((p) => {
                          const code = p.kode || p.code || '';
                          const name = p.nama || p.name || 'Part';
                          const price = p.hargaJual ?? p.sellPrice ?? 0;
                          const avail = getAvailableSalePartStock(code);

                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => handleSelectPart(p)}
                              className="w-full text-left p-2.5 hover:bg-[#F3F4F6] flex items-center justify-between transition-colors text-[13px]"
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <samp className="font-mono text-[11px] font-semibold text-[#1A64B0] bg-[#E4F2FE] px-1.5 py-0.5 rounded">
                                    {code}
                                  </samp>
                                  <span className="font-medium text-[#1E2230]">{name}</span>
                                </div>
                                <div className="text-[12px] text-[#4B5563] mt-0.5 tabular-nums">
                                  {formatRupiah(price)}
                                </div>
                              </div>
                              <div className="text-right">
                                <span
                                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                    avail > 0
                                      ? 'bg-[#DEF7EC] text-[#03543F]'
                                      : 'bg-[#FDE3E9] text-[#B4234A]'
                                  }`}
                                >
                                  Stok: {avail}
                                </span>
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className="p-3.5 text-center text-[13px] text-[#646B7C]">
                          Belum ada data part.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </FormField>

              {/* Part Details & Stock Preview */}
              {selectedPart && (
                <div className="p-3.5 rounded-[12px] bg-[#F8F9FA] border border-[#EEF0F4] space-y-2 text-[13px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E2230]">
                      {selectedPart.nama || selectedPart.name}
                    </span>
                    <span className="font-mono text-[12px] text-[#1A64B0] bg-[#E4F2FE] px-2 py-0.5 rounded">
                      {selectedPart.kode || selectedPart.code}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#646B7C]">Harga satuan:</span>
                    <strong className="text-[#1E2230] font-sans tabular-nums">
                      {formatRupiah(selectedPart.hargaJual ?? selectedPart.sellPrice ?? 0)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#646B7C]">Sisa stok dapat dijual:</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        availableStockForSelected > 0 ? 'text-[#155724]' : 'text-[#B4234A]'
                      }`}
                    >
                      {availableStockForSelected} pcs
                    </span>
                  </div>
                </div>
              )}

              {/* Quantity Stepper & Add Button */}
              <div className="flex items-end gap-3 pt-1">
                <FormField id={qtyInputId} label="Jumlah" className="w-36">
                  <div className="flex items-center border border-[#D9DDE6] rounded-[10px] overflow-hidden bg-white">
                    <button
                      type="button"
                      aria-label="Kurangi jumlah part"
                      onClick={() => setPartQty((q) => Math.max(1, q - 1))}
                      disabled={partQty <= 1}
                      className="px-2.5 py-2 text-[#4B5563] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <MinusIconButton
                        ariaLabel="Kurangi"
                        className="!w-6 !h-6 !min-w-[24px] !min-h-[24px]"
                      />
                    </button>
                    <input
                      id={qtyInputId}
                      type="number"
                      min={1}
                      max={Math.max(1, availableStockForSelected)}
                      value={partQty}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 1;
                        setPartQty(Math.max(1, val));
                      }}
                      className="w-full text-center font-sans font-semibold text-[14px] text-[#1E2230] tabular-nums border-0 focus:ring-0 p-1.5"
                    />
                    <button
                      type="button"
                      aria-label="Tambah jumlah part"
                      onClick={() => setPartQty((q) => q + 1)}
                      disabled={partQty >= availableStockForSelected}
                      className="px-2.5 py-2 text-[#4B5563] hover:bg-[#F3F4F6] disabled:opacity-30 disabled:pointer-events-none"
                    >
                      <PlusIconButton
                        ariaLabel="Tambah"
                        className="!w-6 !h-6 !min-w-[24px] !min-h-[24px]"
                      />
                    </button>
                  </div>
                </FormField>

                <div className="flex-1">
                  <ActionButton
                    type="submit"
                    intent="add"
                    disabled={!selectedPart || availableStockForSelected <= 0}
                    className="w-full justify-center !h-[42px]"
                  >
                    + Tambah Part
                  </ActionButton>
                </div>
              </div>
            </form>
          </DataCard>
        </div>

        {/* Right Column: Transaction Cart & Payment (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Card 3: Daftar Part (Cart) */}
          <DataCard
            title="Daftar Part Transaksi"
            actions={
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-[#4B5563] bg-[#F3F4F6] px-2.5 py-1 rounded-full">
                  {totalItemsCount} item
                </span>
                {cartLines.length > 0 && (
                  <ActionButton
                    intent="cancel"
                    onClick={handleClearCart}
                    className="!text-[12px] !py-1 !px-2.5"
                  >
                    Kosongkan
                  </ActionButton>
                )}
              </div>
            }
            className="!p-5"
          >
            {cartLines.length === 0 ? (
              <div className="text-center py-12 px-4 border border-dashed border-[#D9DDE6] rounded-[16px] bg-[#FAFBFD]">
                <div className="w-12 h-12 rounded-full bg-[#EEF0F4] text-[#646B7C] flex items-center justify-center mx-auto mb-3">
                  <BanknoteIcon size={22} />
                </div>
                <div className="font-semibold text-[#1E2230] text-[15px]">
                  Keranjang Penjualan Masih Kosong
                </div>
                <p className="text-[13px] text-[#646B7C] mt-1 max-w-sm mx-auto">
                  Pilih sparepart dari menu di sebelah kiri dan klik tombol <strong>+ Tambah Part</strong> untuk memasukkan barang ke nota belanja.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto border border-[#EEF0F4] rounded-[12px]">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-[#F8F9FA] text-[#646B7C] font-semibold border-b border-[#EEF0F4]">
                      <tr>
                        <th className="py-2.5 px-3">Kode Part</th>
                        <th className="py-2.5 px-3">Nama Part</th>
                        <th className="py-2.5 px-3 text-right">Harga</th>
                        <th className="py-2.5 px-3 text-center">Jumlah</th>
                        <th className="py-2.5 px-3 text-right">Subtotal</th>
                        <th className="py-2.5 px-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF0F4]">
                      {cartLines.map((line, idx) => (
                        <tr key={line.partCode || idx} className="hover:bg-[#FAFBFD]">
                          <td className="py-2.5 px-3 font-mono font-medium text-[#1A64B0]">
                            {line.partCode}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-[#1E2230]">
                            {line.name}
                          </td>
                          <td className="py-2.5 px-3 text-right tabular-nums text-[#4B5563]">
                            {formatRupiah(line.price)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="inline-flex items-center border border-[#D9DDE6] rounded-[8px] bg-white">
                              <button
                                type="button"
                                aria-label={`Kurangi ${line.name}`}
                                onClick={() => handleUpdateLineQty(idx, -1)}
                                className="px-1.5 py-1 text-[#646B7C] hover:bg-[#F3F4F6]"
                              >
                                <MinusIconButton
                                  ariaLabel="Kurangi"
                                  className="!w-5 !h-5 !min-w-[20px] !min-h-[20px]"
                                />
                              </button>
                              <span className="px-2 font-semibold tabular-nums text-[13px]">
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                aria-label={`Tambah ${line.name}`}
                                onClick={() => handleUpdateLineQty(idx, 1)}
                                className="px-1.5 py-1 text-[#646B7C] hover:bg-[#F3F4F6]"
                              >
                                <PlusIconButton
                                  ariaLabel="Tambah"
                                  className="!w-5 !h-5 !min-w-[20px] !min-h-[20px]"
                                />
                              </button>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold tabular-nums text-[#1E2230]">
                            {formatRupiah(line.subtotal)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <TrashIconButton
                              ariaLabel={`Hapus item ${line.name}`}
                              title="Hapus dari daftar"
                              onClick={() => handleRemoveLine(idx)}
                              className="!w-7 !h-7 !min-w-[28px] !min-h-[28px] !rounded-[8px]"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Grand Total Indicator */}
                <div className="p-4 rounded-[14px] bg-[#F8F9FA] border border-[#EEF0F4] flex items-center justify-between">
                  <div>
                    <div className="text-[12px] font-semibold text-[#646B7C] uppercase tracking-wider">
                      Grand Total Pembayaran
                    </div>
                    <div className="text-[12px] text-[#4B5563] mt-0.5">
                      {totalItemsCount} item &bull; Konsumen: {customerName || 'Umum'}
                    </div>
                  </div>
                  <div className="text-right">
                    <output className="font-sans font-extrabold text-[28px] text-[#1E2230] tabular-nums tracking-tight block">
                      <RollingNumber value={cartGrandTotal} format={formatRupiah} />
                    </output>
                  </div>
                </div>
              </div>
            )}
          </DataCard>

          {/* Card 4: Metode Pembayaran & Checkout */}
          <DataCard title="Metode Pembayaran" className="!p-5">
            <div className="space-y-5">
              {/* Payment Method Selector Cards */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Tunai');
                    if (activeCheckoutSale) handleCancelActiveCheckout();
                  }}
                  className={`p-3.5 rounded-[14px] border text-left transition-all flex flex-col items-center justify-center gap-2 ${
                    paymentMethod === 'Tunai'
                      ? 'border-[#1D6FC4] bg-[#E4F2FE] text-[#1A64B0] shadow-sm ring-2 ring-[#1D6FC4]/20'
                      : 'border-[#D9DDE6] bg-white text-[#4B5563] hover:border-[#9CA3AF]'
                  }`}
                >
                  <BanknoteIcon size={24} />
                  <span className="font-semibold text-[13px]">Tunai (Cash)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('Transfer');
                    if (activeCheckoutSale) handleCancelActiveCheckout();
                  }}
                  className={`p-3.5 rounded-[14px] border text-left transition-all flex flex-col items-center justify-center gap-2 ${
                    paymentMethod === 'Transfer'
                      ? 'border-[#1D6FC4] bg-[#E4F2FE] text-[#1A64B0] shadow-sm ring-2 ring-[#1D6FC4]/20'
                      : 'border-[#D9DDE6] bg-white text-[#4B5563] hover:border-[#9CA3AF]'
                  }`}
                >
                  <LandmarkIcon size={24} />
                  <span className="font-semibold text-[13px]">Transfer Bank</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('QR');
                    if (activeCheckoutSale) handleCancelActiveCheckout();
                  }}
                  className={`p-3.5 rounded-[14px] border text-left transition-all flex flex-col items-center justify-center gap-2 ${
                    paymentMethod === 'QR'
                      ? 'border-[#1D6FC4] bg-[#E4F2FE] text-[#1A64B0] shadow-sm ring-2 ring-[#1D6FC4]/20'
                      : 'border-[#D9DDE6] bg-white text-[#4B5563] hover:border-[#9CA3AF]'
                  }`}
                >
                  <QrCodeIcon size={24} />
                  <span className="font-semibold text-[13px]">QRIS / QR</span>
                </button>
              </div>

              {/* --------------------------------------------------- */}
              {/* Method 1: Tunai Sub-panel                           */}
              {/* --------------------------------------------------- */}
              {paymentMethod === 'Tunai' && (
                <div className="space-y-4 p-4 rounded-[14px] bg-[#F8F9FA] border border-[#EEF0F4]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E2230] text-[14px]">
                      Pembayaran Tunai Langsung
                    </span>
                    <span className="text-[12px] text-[#646B7C]">Kasir Utama</span>
                  </div>

                  <FormField
                    id={cashInputId}
                    label="Uang Tunai Diterima"
                    helperText="Ketik nominal rupiah atau klik tombol nominal cepat di bawah"
                  >
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-semibold text-[#646B7C]">
                        Rp
                      </span>
                      <input
                        id={cashInputId}
                        type="text"
                        value={
                          cashReceivedInput
                            ? Number(cashReceivedInput.replace(/\D/g, '')).toLocaleString('id-ID')
                            : ''
                        }
                        onChange={(e) => {
                          const raw = e.target.value.replace(/\D/g, '');
                          setCashReceivedInput(raw);
                        }}
                        placeholder="0"
                        className="admin-input pl-10 font-sans font-bold text-[18px] tabular-nums"
                      />
                    </div>
                  </FormField>

                  {/* Quick Cash Buttons */}
                  {quickCashOptions.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#646B7C] uppercase mr-1">
                        Pilihan Cepat:
                      </span>
                      {quickCashOptions.map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setCashReceivedInput(String(amt))}
                          className="px-2.5 py-1 text-[12px] font-semibold rounded-[8px] bg-white border border-[#D9DDE6] text-[#1E2230] hover:bg-[#EEF0F4] transition-colors tabular-nums"
                        >
                          {amt === cartGrandTotal ? 'Uang Pas' : formatRupiah(amt)}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Kembalian / Sisa Bayar Indicator */}
                  <div className="pt-3 border-t border-[#E5E7EB] flex items-center justify-between">
                    <div>
                      <div className="text-[12px] text-[#646B7C] font-semibold">Kembalian</div>
                      <div
                        className={`font-sans font-extrabold text-[22px] tabular-nums ${
                          isCashSufficient ? 'text-[#155724]' : 'text-[#B4234A]'
                        }`}
                      >
                        {formatRupiah(cashChange)}
                      </div>
                    </div>

                    {!isCashSufficient && cartGrandTotal > 0 && (
                      <span className="text-[12px] text-[#B4234A] font-semibold bg-[#FDE3E9] px-2.5 py-1 rounded-full">
                        Kurang {formatRupiah(cartGrandTotal - cashReceived)}
                      </span>
                    )}

                    <ActionButton
                      intent="start"
                      disabled={
                        !isCashSufficient ||
                        cartLines.length === 0 ||
                        !customerName.trim()
                      }
                      onClick={handleFinalizeCashSale}
                      className="!h-[44px] !px-6"
                    >
                      Jual Part (Lunas)
                    </ActionButton>
                  </div>
                </div>
              )}

              {/* --------------------------------------------------- */}
              {/* Method 2: Transfer Sub-panel                        */}
              {/* --------------------------------------------------- */}
              {paymentMethod === 'Transfer' && (
                <div className="space-y-4 p-4 rounded-[14px] bg-[#F8F9FA] border border-[#EEF0F4]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E2230] text-[14px]">
                      Rekening Tujuan Transfer
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#E4F2FE] text-[#1A64B0] text-[11px] font-semibold">
                      Bank Central Asia (BCA)
                    </span>
                  </div>

                  <div className="p-3.5 rounded-[12px] bg-white border border-[#D9DDE6] space-y-2 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-[#646B7C]">Nama Bank:</span>
                      <strong className="text-[#1E2230]">Bank Central Asia (BCA)</strong>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#646B7C]">Nomor Rekening:</span>
                      <samp className="font-mono font-bold text-[15px] text-[#1E2230]">
                        8830-1928-441
                      </samp>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#646B7C]">Atas Nama:</span>
                      <span className="font-medium text-[#1E2230]">PT MyBengkel Nusantara</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-[#EEF0F4] pt-2">
                      <span className="text-[#646B7C]">Jumlah Transfer:</span>
                      <strong className="text-[16px] text-[#1A64B0] tabular-nums font-bold">
                        {formatRupiah(cartGrandTotal)}
                      </strong>
                    </div>
                  </div>

                  {!activeCheckoutSale ? (
                    <div className="pt-2 flex items-center justify-between">
                      <span className="text-[12px] text-[#646B7C]">
                        Klik tombol di samping untuk mencatat checkout transfer.
                      </span>
                      <ActionButton
                        intent="start"
                        disabled={cartLines.length === 0 || !customerName.trim()}
                        onClick={handleStartTransferCheckout}
                      >
                        Mulai Pembayaran Transfer
                      </ActionButton>
                    </div>
                  ) : (
                    <div className="space-y-3 pt-2">
                      <div className="p-3 rounded-[10px] bg-[#FFF1DA] border border-[#FCD34D] flex items-center justify-between text-[13px] text-[#8A5A00]">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
                          <span>
                            Menunggu transfer sebesar <strong>{formatRupiah(cartGrandTotal)}</strong> (Kode: {activeCheckoutSale.paymentReference || activeCheckoutSale.number})
                          </span>
                        </div>
                        <StatusChip status="menunggu_pembayaran" />
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <ActionButton
                          intent="cancel"
                          onClick={handleCancelActiveCheckout}
                          className="!text-[12px]"
                        >
                          Batalkan Pembayaran
                        </ActionButton>

                        <div className="flex items-center gap-2">
                          <ActionButton
                            intent="start"
                            disabled={true}
                            title="Menunggu konfirmasi pembayaran"
                          >
                            Jual Part
                          </ActionButton>

                          {/* Prototype Simulation Action */}
                          <ActionButton
                            intent="start"
                            onClick={handleSimulatePaymentReceived}
                            className="!bg-[#15803D] hover:!bg-[#166534] !text-white"
                          >
                            Simulasikan transfer diterima
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* --------------------------------------------------- */}
              {/* Method 3: QR Code Sub-panel                         */}
              {/* --------------------------------------------------- */}
              {paymentMethod === 'QR' && (
                <div className="space-y-4 p-4 rounded-[14px] bg-[#F8F9FA] border border-[#EEF0F4]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[#1E2230] text-[14px]">
                      Pembayaran QRIS / QR Code
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-[#DEF7EC] text-[#03543F] text-[11px] font-semibold">
                      QRIS Nasional
                    </span>
                  </div>

                  {!activeCheckoutSale ? (
                    <div className="text-center py-6 px-4 bg-white border border-[#D9DDE6] rounded-[12px] space-y-3">
                      <div className="w-12 h-12 rounded-full bg-[#E4F2FE] text-[#1A64B0] flex items-center justify-center mx-auto">
                        <QrCodeIcon size={24} />
                      </div>
                      <div className="font-semibold text-[#1E2230] text-[14px]">
                        Generate Kode QR Pembayaran
                      </div>
                      <p className="text-[12px] text-[#646B7C] max-w-xs mx-auto">
                        Total bayar <strong>{formatRupiah(cartGrandTotal)}</strong> untuk konsumen <strong>{customerName || 'Umum'}</strong>.
                      </p>
                      <ActionButton
                        intent="start"
                        disabled={cartLines.length === 0 || !customerName.trim()}
                        onClick={handleStartQrCheckout}
                        className="mx-auto"
                      >
                        Buat Kode QR
                      </ActionButton>
                    </div>
                  ) : (
                    <div className="p-4 bg-white border border-[#D9DDE6] rounded-[14px] space-y-4">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        {/* Demo QR Graphic */}
                        <div className="p-3 bg-white border-2 border-[#1E2230] rounded-[12px] shadow-sm">
                          <svg
                            width="140"
                            height="140"
                            viewBox="0 0 140 140"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            aria-label="QR Code Transaksi"
                          >
                            <rect width="140" height="140" fill="white" />
                            {/* Standard QR Corners */}
                            <rect x="10" y="10" width="36" height="36" rx="6" fill="#1E2230" />
                            <rect x="16" y="16" width="24" height="24" rx="4" fill="white" />
                            <rect x="22" y="22" width="12" height="12" fill="#1E2230" />

                            <rect x="94" y="10" width="36" height="36" rx="6" fill="#1E2230" />
                            <rect x="100" y="16" width="24" height="24" rx="4" fill="white" />
                            <rect x="106" y="22" width="12" height="12" fill="#1E2230" />

                            <rect x="10" y="94" width="36" height="36" rx="6" fill="#1E2230" />
                            <rect x="16" y="100" width="24" height="24" rx="4" fill="white" />
                            <rect x="22" y="106" width="12" height="12" fill="#1E2230" />

                            {/* Demo QR Data Grid Pattern */}
                            <circle cx="56" cy="28" r="4" fill="#1E2230" />
                            <circle cx="70" cy="28" r="4" fill="#1E2230" />
                            <circle cx="84" cy="28" r="4" fill="#1E2230" />
                            <circle cx="28" cy="56" r="4" fill="#1E2230" />
                            <circle cx="48" cy="56" r="5" fill="#1E2230" />
                            <circle cx="70" cy="56" r="5" fill="#1A64B0" />
                            <circle cx="92" cy="56" r="4" fill="#1E2230" />
                            <circle cx="112" cy="56" r="4" fill="#1E2230" />
                            <circle cx="28" cy="74" r="4" fill="#1E2230" />
                            <circle cx="50" cy="74" r="4" fill="#1E2230" />
                            <circle cx="70" cy="74" r="4" fill="#1E2230" />
                            <circle cx="90" cy="74" r="5" fill="#1A64B0" />
                            <circle cx="112" cy="74" r="4" fill="#1E2230" />
                            <circle cx="56" cy="94" r="4" fill="#1E2230" />
                            <circle cx="76" cy="94" r="5" fill="#1E2230" />
                            <circle cx="96" cy="94" r="4" fill="#1E2230" />
                            <circle cx="116" cy="94" r="4" fill="#1E2230" />
                            <circle cx="56" cy="114" r="4" fill="#1E2230" />
                            <circle cx="76" cy="114" r="4" fill="#1E2230" />
                            <circle cx="96" cy="114" r="4" fill="#1E2230" />
                            <circle cx="116" cy="114" r="4" fill="#1E2230" />
                          </svg>
                        </div>

                        <div className="text-center">
                          <div className="font-mono text-[13px] font-semibold text-[#1E2230]">
                            {activeCheckoutSale.paymentReference || activeCheckoutSale.number}
                          </div>
                          <div className="text-[15px] font-extrabold text-[#1A64B0] tabular-nums mt-0.5">
                            {formatRupiah(cartGrandTotal)}
                          </div>
                          <div className="text-[12px] text-[#646B7C]">
                            Arahkan kamera atau aplikasi e-wallet pelanggan ke kode QR di atas
                          </div>
                        </div>
                      </div>

                      <div className="p-3 rounded-[10px] bg-[#FFF1DA] border border-[#FCD34D] flex items-center justify-between text-[13px] text-[#8A5A00]">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] animate-pulse" />
                          <span>Menunggu konfirmasi QRIS...</span>
                        </div>
                        <StatusChip status="menunggu_pembayaran" />
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-2">
                        <ActionButton
                          intent="cancel"
                          onClick={handleCancelActiveCheckout}
                          className="!text-[12px]"
                        >
                          Batalkan QR
                        </ActionButton>

                        <div className="flex items-center gap-2">
                          <ActionButton
                            intent="start"
                            disabled={true}
                            title="Menunggu konfirmasi pembayaran"
                          >
                            Jual Part
                          </ActionButton>

                          {/* Prototype Simulation Action */}
                          <ActionButton
                            intent="start"
                            onClick={handleSimulatePaymentReceived}
                            className="!bg-[#15803D] hover:!bg-[#166534] !text-white"
                          >
                            Simulasikan konfirmasi pembayaran lunas
                          </ActionButton>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </DataCard>
        </div>
      </div>

      {/* ----------------------------------------------------------- */}
      {/* Receipt-Ready Popup / Modal ("Transaksi Selesai")            */}
      {/* ----------------------------------------------------------- */}
      <CenterDialog
        isOpen={Boolean(completedSale)}
        onClose={handleResetForNewCustomer}
        title="Transaksi Selesai"
        subtitle="Pembayaran telah terverifikasi dan stok fisik telah diperbarui"
        maxWidthClass="max-w-[540px]"
        footer={
          <div className="flex items-center justify-between w-full">
            <ActionButton intent="neutral" onClick={handleResetForNewCustomer}>
              Transaksi Baru
            </ActionButton>
            <ActionButton
              intent="start"
              onClick={() => {
                if (completedSale) printSalesReceipt(completedSale);
              }}
            >
              Cetak Nota
            </ActionButton>
          </div>
        }
      >
        {completedSale && (
          <div className="space-y-4 py-1 text-[13px]">
            {/* Success Header Status Pill */}
            <div className="p-3.5 rounded-[12px] bg-[#DEF7EC] border border-[#84E1BC] flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[#0E9F6E] text-white flex items-center justify-center shrink-0">
                <CheckIcon size={18} />
              </div>
              <div>
                <div className="font-semibold text-[#03543F] text-[14px]">
                  Pembayaran Lunas ({completedSale.method})
                </div>
                <div className="text-[12px] text-[#03543F]">
                  Stok barang telah otomatis dipotong dari Master Gudang.
                </div>
              </div>
            </div>

            {/* Receipt Summary Card */}
            <div className="p-4 rounded-[14px] bg-[#F8F9FA] border border-[#EEF0F4] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[#646B7C]">No. Transaksi</span>
                <samp className="font-mono font-bold text-[#1E2230]">
                  {completedSale.number || completedSale.id}
                </samp>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#646B7C]">Konsumen</span>
                <span className="font-semibold text-[#1E2230]">{completedSale.customerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#646B7C]">Waktu Transaksi</span>
                <span className="tabular-nums text-[#4B5563]">
                  {completedSale.paidAt || completedSale.createdAt || completedSale.date}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#646B7C]">Kasir</span>
                <span className="text-[#1E2230]">{completedSale.cashierName || 'Kasir Utama'}</span>
              </div>
              {completedSale.paymentReference && (
                <div className="flex items-center justify-between">
                  <span className="text-[#646B7C]">Nomor Referensi</span>
                  <samp className="font-mono text-[#1A64B0]">
                    {completedSale.paymentReference}
                  </samp>
                </div>
              )}
            </div>

            {/* Itemized Table */}
            <div className="border border-[#EEF0F4] rounded-[12px] overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#F8F9FA] font-semibold text-[#646B7C] border-b border-[#EEF0F4]">
                  <tr>
                    <th className="py-2 px-3">Part</th>
                    <th className="py-2 px-2 text-center">Qty</th>
                    <th className="py-2 px-3 text-right">Harga</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EEF0F4]">
                  {completedSale.lines.map((l, i) => (
                    <tr key={i}>
                      <td className="py-2 px-3">
                        <samp className="font-mono text-[11px] text-[#1A64B0]">
                          {l.partCode}
                        </samp>{' '}
                        <span className="font-medium text-[#1E2230]">{l.name}</span>
                      </td>
                      <td className="py-2 px-2 text-center tabular-nums">{l.qty}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-[#4B5563]">
                        {formatRupiah(l.price)}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold tabular-nums text-[#1E2230]">
                        {formatRupiah(l.subtotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Financial Breakdown */}
            <div className="p-3.5 rounded-[12px] bg-[#F8F9FA] border border-[#EEF0F4] space-y-1.5 text-[13px]">
              <div className="flex items-center justify-between font-bold text-[15px] text-[#1E2230]">
                <span>Grand Total</span>
                <span className="tabular-nums font-extrabold text-[#1A64B0]">
                  {formatRupiah(completedSale.total)}
                </span>
              </div>
              {completedSale.method === 'Tunai' && (
                <>
                  <div className="flex items-center justify-between text-[12px] text-[#4B5563]">
                    <span>Uang Diterima</span>
                    <span className="tabular-nums">
                      {formatRupiah(completedSale.cashReceived ?? completedSale.total)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[12px] text-[#155724] font-semibold">
                    <span>Kembalian</span>
                    <span className="tabular-nums">
                      {formatRupiah(completedSale.change ?? 0)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CenterDialog>
    </div>
  );
};

export default V2Sales;
