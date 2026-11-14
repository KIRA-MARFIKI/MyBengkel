// Display helpers for the admin area. Dates "YYYY-MM-DD", times "08.00", rupiah "Rp 150.000".

export const formatRupiah = (n: number): string =>
  `${n < 0 ? '-' : ''}Rp ${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;

export const todayISO = (): string => {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const formatLongDate = (d: Date = new Date()): string =>
  d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const formatShortDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export const nowTime = (): string => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const formatIndonesianDate = (isoDate: string): string => {
  if (!isoDate) return '-';
  const clean = isoDate.slice(0, 10);
  const [y, m, d] = clean.split('-');
  const monthIdx = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  if (isNaN(day) || monthIdx < 0 || monthIdx > 11) return isoDate;
  return `${day} ${MONTH_NAMES_ID[monthIdx]} ${y}`;
};

export const formatBookingCreatedDateTime = (createdAt?: string): string => {
  if (!createdAt) return '-';
  if (createdAt.includes(' ')) {
    const [datePart, timePart] = createdAt.split(' ');
    const dateFormatted = formatIndonesianDate(datePart);
    const timeFormatted = timePart.replace(':', '.');
    return `${dateFormatted}, ${timeFormatted} WIB`;
  }
  if (createdAt.includes('T')) {
    const [datePart, rest] = createdAt.split('T');
    const timePart = rest.slice(0, 5).replace(':', '.');
    return `${formatIndonesianDate(datePart)}, ${timePart} WIB`;
  }
  return `${formatIndonesianDate(createdAt)} WIB`;
};

export const formatScheduledServiceDateTime = (date: string, hour: string): string => {
  const dateFormatted = formatIndonesianDate(date);
  const timeFormatted = (hour || '').replace(':', '.');
  return `${dateFormatted}, ${timeFormatted} WIB`;
};


