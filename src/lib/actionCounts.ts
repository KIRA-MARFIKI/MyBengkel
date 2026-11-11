import { useAdmin } from '../context/AdminContext';
import { computeStock } from '../data/adminDummy';

// Real counts for "Perlu ditangani":
// 1. Booking belum dikonfirmasi (status menunggu)
// 2. Service Form menunggu persetujuan
// 3. Part di bawah stok minimum
// 4. Tiket Help Desk terbuka
export function useActionCounts() {
  const { bookings, serviceForms, parts, stockMovements, tickets } = useAdmin();
  const booking = bookings.filter((b) => b.status === 'menunggu').length;
  const serviceForm = serviceForms.filter((sf) => sf.status === 'menunggu_persetujuan').length;
  const lowStock = parts.filter(
    (p) =>
      p.jenis === 'reguler' &&
      p.stokMin !== null &&
      computeStock(p, stockMovements) < p.stokMin
  ).length;
  const ticket = tickets.filter((t) => t.status === 'Terbuka').length;
  return {
    booking,
    serviceForm,
    lowStock,
    ticket,
    total: booking + serviceForm + lowStock + ticket,
  };
}
