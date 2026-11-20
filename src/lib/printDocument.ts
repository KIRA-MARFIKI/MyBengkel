import { formatRupiah, todayISO, nowTime } from './format';
import type { ServiceFormLine } from '../data/adminDummy';

export type PrintBatalSource = 'Booking' | 'Service Form' | 'Work Order';

export interface PrintBatalData {
  id: string;
  source: PrintBatalSource;
  customerName: string;
  plate: string;
  reason?: string;
  cancelledAt?: string;
  printDate?: string;
}

export interface PrintNotaData {
  woId: string;
  customerName: string;
  plate: string;
  date: string;
  jasaLines: ServiceFormLine[];
  partLines: ServiceFormLine[];
  jasaSubtotal?: number;
  partSubtotal?: number;
  total?: number;
}

export interface PrintHoPartRow {
  kode?: string;
  nama: string;
  qty: number;
  hargaSatuan: number;
  subtotal?: number;
}

export interface PrintNotaDpData {
  orderCode: string;
  customerName: string;
  phone: string;
  engineNo: string;
  frameNo: string;
  parts: PrintHoPartRow[];
  totalHarga: number;
  dp: number;
  sisaBayar: number;
  date: string;
}

export interface PrintNotaHoData extends PrintNotaDpData {
  arrivedAt: string;
  processedAt: string;
}

export interface PrintBatalHoData {
  orderCode: string;
  customerName: string;
  phone: string;
  parts: PrintHoPartRow[];
  dp: number;
  reason: string;
  cancelledAt: string;
}

export interface PrintNotaPenjualanLine {
  partCode: string;
  name: string;
  qty: number;
  price: number;
  subtotal: number;
}

export interface PrintNotaPenjualanData {
  transactionCode: string;
  customerName: string;
  date: string;
  cashierName?: string;
  lines: PrintNotaPenjualanLine[];
  subtotal?: number;
  total: number;
  method: 'Tunai' | 'Transfer' | 'QR';
  paymentReference?: string;
  cashReceived?: number;
  change?: number;
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getOrCreatePrintRoot(): HTMLElement {
  let root = document.getElementById('admin-print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'admin-print-root';
    root.setAttribute('aria-hidden', 'true');
    document.body.appendChild(root);
  }
  return root;
}

function renderHoPartsTable(parts: PrintHoPartRow[]): string {
  if (parts.length === 0) {
    return `<tr><td colspan="4" style="padding: 6px 4px; text-align: center;">Tidak ada item part</td></tr>`;
  }
  return parts
    .map((p) => {
      const sub = p.subtotal !== undefined ? p.subtotal : p.qty * p.hargaSatuan;
      return `
        <tr>
          <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB;">${
            p.kode
              ? `<span style="font-family: 'IBM Plex Mono', monospace;">${escapeHtml(p.kode)}</span> `
              : ''
          }${escapeHtml(p.nama)}</td>
          <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${p.qty}</td>
          <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(
            formatRupiah(p.hargaSatuan)
          )}</td>
          <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(
            formatRupiah(sub)
          )}</td>
        </tr>`;
    })
    .join('');
}

export function printDocument(kind: 'batal', data: PrintBatalData): void;
export function printDocument(kind: 'nota', data: PrintNotaData): void;
export function printDocument(kind: 'nota_dp', data: PrintNotaDpData): void;
export function printDocument(kind: 'nota_ho', data: PrintNotaHoData): void;
export function printDocument(kind: 'batal_ho', data: PrintBatalHoData): void;
export function printDocument(kind: 'nota_penjualan', data: PrintNotaPenjualanData): void;
export function printDocument(
  kind: 'batal' | 'nota' | 'nota_dp' | 'nota_ho' | 'batal_ho' | 'nota_penjualan',
  data:
    | PrintBatalData
    | PrintNotaData
    | PrintNotaDpData
    | PrintNotaHoData
    | PrintBatalHoData
    | PrintNotaPenjualanData
): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const root = getOrCreatePrintRoot();
  const stamp = `${todayISO()} ${nowTime()}`;

  if (kind === 'batal') {
    const d = data as PrintBatalData;
    const reasonText = d.reason && d.reason.trim() ? d.reason.trim() : 'Tidak dicatat';
    const cancelledDate = d.cancelledAt && d.cancelledAt.trim() ? d.cancelledAt.trim() : todayISO();
    const printDate = d.printDate && d.printDate.trim() ? d.printDate.trim() : stamp;

    root.setAttribute('data-print-kind', 'batal');
    root.innerHTML = `
      <div style="font-family: 'IBM Plex Sans', sans-serif; color: #000000; background: #FFFFFF; padding: 8px 0;">
        <div style="border-bottom: 1px solid #000000; padding-bottom: 10px; margin-bottom: 14px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Bukti pembatalan</h1>
          <div style="font-size: 12px;">MyBengkel</div>
        </div>

        <dl style="margin: 0 0 18px 0; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">ID dokumen</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.id)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Sumber</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.source)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Nama konsumen</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.customerName)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Plat nomor</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.plate)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Alasan</dt>
            <dd style="margin: 0; font-weight: 600; text-align: right; max-width: 65%;">${escapeHtml(reasonText)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Tanggal batal</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(cancelledDate)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #E5E7EB;">
            <dt style="font-weight: 500;">Tanggal cetak</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(printDate)}</dd>
          </div>
        </dl>

        <footer style="border-top: 1px solid #000000; padding-top: 10px; font-size: 11px;">
          Data contoh, bukan dokumen resmi.
        </footer>
      </div>
    `;
  } else if (kind === 'nota') {
    const d = data as PrintNotaData;
    const jasaSub = d.jasaLines.reduce((sum, l) => sum + l.subtotal, 0);
    const partSub = d.partLines.reduce((sum, l) => sum + l.subtotal, 0);
    const grandTotal = jasaSub + partSub;

    const jasaRowsHtml =
      d.jasaLines.length === 0
        ? `<tr><td colspan="4" style="padding: 6px 4px; text-align: center;">Tidak ada item jasa</td></tr>`
        : d.jasaLines
            .map(
              (l) => `
              <tr>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB;">${escapeHtml(l.name)}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${l.qty}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.unitPrice))}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.subtotal))}</td>
              </tr>`
            )
            .join('');

    const partRowsHtml =
      d.partLines.length === 0
        ? `<tr><td colspan="4" style="padding: 6px 4px; text-align: center;">Tidak ada item part</td></tr>`
        : d.partLines
            .map(
              (l) => `
              <tr>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB;">${l.partCode ? `<span style="font-family: 'IBM Plex Mono', monospace;">${escapeHtml(l.partCode)}</span> ` : ''}${escapeHtml(l.name)}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${l.qty}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.unitPrice))}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.subtotal))}</td>
              </tr>`
            )
            .join('');

    root.setAttribute('data-print-kind', 'nota');
    root.innerHTML = `
      <div style="font-family: 'IBM Plex Sans', sans-serif; color: #000000; background: #FFFFFF; padding: 8px 0;">
        <div style="border-bottom: 1px solid #000000; padding-bottom: 10px; margin-bottom: 12px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Nota servis</h1>
          <div style="font-size: 12px;">MyBengkel</div>
        </div>

        <dl style="margin: 0 0 14px 0; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">ID Work Order</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.woId)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nama konsumen</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.customerName)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Plat nomor</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.plate)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Tanggal</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.date)}</dd>
          </div>
        </dl>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">Jasa</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #000000; text-align: left;">
                <th style="padding: 4px;">Nama jasa</th>
                <th style="padding: 4px; text-align: right;">Qty</th>
                <th style="padding: 4px; text-align: right;">Harga</th>
                <th style="padding: 4px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${jasaRowsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 6px 4px; font-weight: 600;">Subtotal Jasa</td>
                <td style="padding: 6px 4px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(jasaSub))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">Part</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #000000; text-align: left;">
                <th style="padding: 4px;">Nama part</th>
                <th style="padding: 4px; text-align: right;">Qty</th>
                <th style="padding: 4px; text-align: right;">Harga</th>
                <th style="padding: 4px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${partRowsHtml}</tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding: 6px 4px; font-weight: 600;">Subtotal Part</td>
                <td style="padding: 6px 4px; text-align: right; font-weight: 700; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(partSub))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid #000000; padding: 8px 0 12px 0; font-size: 14px; font-weight: 700;">
          <span>Total</span>
          <span style="font-size: 16px; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(grandTotal))}</span>
        </div>

        <footer style="border-top: 1px solid #000000; padding-top: 8px; font-size: 11px;">
          Data contoh, bukan dokumen resmi.
        </footer>
      </div>
    `;
  } else if (kind === 'nota_dp' || kind === 'nota_ho') {
    const isHoFinal = kind === 'nota_ho';
    const d = data as PrintNotaDpData & Partial<PrintNotaHoData>;
    const titleText = isHoFinal ? 'Nota HO' : 'Nota DP';
    const partRowsHtml = renderHoPartsTable(d.parts);

    const extraDatesHtml = isHoFinal
      ? `
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Tanggal sampai</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.arrivedAt || '-')}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Tanggal proses</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.processedAt || '-')}</dd>
          </div>
        `
      : '';

    root.setAttribute('data-print-kind', kind);
    root.innerHTML = `
      <div style="font-family: 'IBM Plex Sans', sans-serif; color: #000000; background: #FFFFFF; padding: 8px 0;">
        <div style="border-bottom: 1px solid #000000; padding-bottom: 10px; margin-bottom: 12px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">${escapeHtml(titleText)}</h1>
          <div style="font-size: 12px;">MyBengkel</div>
        </div>

        <dl style="margin: 0 0 14px 0; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Kode pemesanan</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.orderCode)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nama pelanggan</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.customerName)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nomor HP</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums;">${escapeHtml(d.phone)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nomor mesin</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace;">${escapeHtml(d.engineNo)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nomor rangka</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace;">${escapeHtml(d.frameNo)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Tanggal</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.date)}</dd>
          </div>
          ${extraDatesHtml}
        </dl>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">Daftar part</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #000000; text-align: left;">
                <th style="padding: 4px;">Nama part</th>
                <th style="padding: 4px; text-align: right;">Qty</th>
                <th style="padding: 4px; text-align: right;">Harga satuan</th>
                <th style="padding: 4px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${partRowsHtml}</tbody>
          </table>
        </div>

        <dl style="margin: 0 0 12px 0; border-top: 1px solid #000000; padding-top: 8px; font-size: 13px;">
          <div style="display: flex; justify-content: space-between; padding: 3px 0;">
            <dt style="font-weight: 500;">Total harga</dt>
            <dd style="margin: 0; font-weight: 600; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.totalHarga))}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 3px 0;">
            <dt style="font-weight: 500;">DP</dt>
            <dd style="margin: 0; font-weight: 600; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.dp))}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 15px; font-weight: 700;">
            <dt>Sisa bayar</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.sisaBayar))}</dd>
          </div>
        </dl>

        <footer style="border-top: 1px solid #000000; padding-top: 8px; font-size: 11px;">
          Data contoh, bukan dokumen resmi.
        </footer>
      </div>
    `;
  } else if (kind === 'batal_ho') {
    const d = data as PrintBatalHoData;
    const partRowsHtml = renderHoPartsTable(d.parts);

    root.setAttribute('data-print-kind', 'batal_ho');
    root.innerHTML = `
      <div style="font-family: 'IBM Plex Sans', sans-serif; color: #000000; background: #FFFFFF; padding: 8px 0;">
        <div style="border-bottom: 1px solid #000000; padding-bottom: 10px; margin-bottom: 12px;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Bukti pembatalan HO</h1>
          <div style="font-size: 12px;">MyBengkel</div>
        </div>

        <dl style="margin: 0 0 14px 0; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Kode pemesanan</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.orderCode)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nama pelanggan</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.customerName)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Nomor HP</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums;">${escapeHtml(d.phone)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">DP</dt>
            <dd style="margin: 0; font-weight: 600; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.dp))}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Alasan</dt>
            <dd style="margin: 0; font-weight: 600; text-align: right; max-width: 65%;">${escapeHtml(d.reason)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0;">
            <dt style="font-weight: 500;">Tanggal batal</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.cancelledAt)}</dd>
          </div>
        </dl>

        <div style="margin-bottom: 12px;">
          <div style="font-size: 12px; font-weight: 700; margin-bottom: 4px;">Daftar part</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #000000; text-align: left;">
                <th style="padding: 4px;">Nama part</th>
                <th style="padding: 4px; text-align: right;">Qty</th>
                <th style="padding: 4px; text-align: right;">Harga satuan</th>
                <th style="padding: 4px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${partRowsHtml}</tbody>
          </table>
        </div>

        <footer style="border-top: 1px solid #000000; padding-top: 8px; font-size: 11px;">
          Data contoh, bukan dokumen resmi.
        </footer>
      </div>
    `;
  } else if (kind === 'nota_penjualan') {
    const d = data as PrintNotaPenjualanData;
    const itemsHtml = d.lines.length === 0
      ? `<tr><td colspan="4" style="padding: 6px 4px; text-align: center;">Tidak ada item part</td></tr>`
      : d.lines
          .map(
            (l) => `
              <tr>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB;">
                  <span style="font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #4B5563;">${escapeHtml(l.partCode)}</span><br />
                  <span>${escapeHtml(l.name)}</span>
                </td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${l.qty}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.price))}</td>
                <td style="padding: 5px 4px; border-bottom: 1px solid #E5E7EB; text-align: right; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(l.subtotal))}</td>
              </tr>
            `
          )
          .join('');

    root.setAttribute('data-print-kind', 'nota_penjualan');
    root.innerHTML = `
      <div style="font-family: 'IBM Plex Sans', sans-serif; color: #000000; background: #FFFFFF; padding: 8px 0; max-width: 480px; margin: 0 auto;">
        <div style="border-bottom: 1px dashed #000000; padding-bottom: 10px; margin-bottom: 12px; text-align: center;">
          <h1 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">MyBengkel</h1>
          <div style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">Struk Penjualan Sparepart</div>
        </div>

        <dl style="margin: 0 0 12px 0; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <dt style="font-weight: 500;">No. Transaksi</dt>
            <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace; font-weight: 600;">${escapeHtml(d.transactionCode)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <dt style="font-weight: 500;">Tanggal &amp; Waktu</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(d.date)}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <dt style="font-weight: 500;">Kasir</dt>
            <dd style="margin: 0;">${escapeHtml(d.cashierName || 'Kasir Utama')}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <dt style="font-weight: 500;">Konsumen</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.customerName)}</dd>
          </div>
        </dl>

        <div style="margin-bottom: 12px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="border-top: 1px dashed #000000; border-bottom: 1px dashed #000000; text-align: left;">
                <th style="padding: 6px 4px;">Item</th>
                <th style="padding: 6px 4px; text-align: right;">Qty</th>
                <th style="padding: 6px 4px; text-align: right;">Harga</th>
                <th style="padding: 6px 4px; text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>

        <dl style="margin: 0 0 12px 0; border-top: 1px dashed #000000; padding-top: 8px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-size: 14px; font-weight: 700;">
            <dt>Grand Total</dt>
            <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.total))}</dd>
          </div>
          <div style="display: flex; justify-content: space-between; padding: 2px 0;">
            <dt style="font-weight: 500;">Metode Pembayaran</dt>
            <dd style="margin: 0; font-weight: 600;">${escapeHtml(d.method)}</dd>
          </div>
          ${
            d.paymentReference
              ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <dt style="font-weight: 500;">Referensi</dt>
              <dd style="margin: 0; font-family: 'IBM Plex Mono', monospace;">${escapeHtml(d.paymentReference)}</dd>
            </div>
          `
              : ''
          }
          ${
            d.method === 'Tunai'
              ? `
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <dt style="font-weight: 500;">Uang Diterima</dt>
              <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.cashReceived ?? d.total))}</dd>
            </div>
            <div style="display: flex; justify-content: space-between; padding: 2px 0;">
              <dt style="font-weight: 500;">Kembalian</dt>
              <dd style="margin: 0; font-variant-numeric: tabular-nums;">${escapeHtml(formatRupiah(d.change ?? 0))}</dd>
            </div>
          `
              : ''
          }
          <div style="display: flex; justify-content: space-between; padding: 3px 0; font-weight: 600;">
            <dt>Status</dt>
            <dd style="margin: 0; color: #166534;">LUNAS (DIBAYAR)</dd>
          </div>
        </dl>

        <footer style="border-top: 1px dashed #000000; padding-top: 10px; font-size: 11px; text-align: center; color: #4B5563;">
          <div>Terima kasih atas kunjungan Anda</div>
          <div style="margin-top: 2px;">Barang yang sudah dibeli tidak dapat ditukar atau dikembalikan.</div>
          <div style="margin-top: 6px; font-size: 10px; color: #9CA3AF;">Data contoh, bukan dokumen resmi.</div>
        </footer>
      </div>
    `;
  }

  window.print();
}
