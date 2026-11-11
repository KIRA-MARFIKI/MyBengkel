// DUMMY DATA. Prototype only. Replace every value marked (dummy) later.

export const site = {
  brand: "MyBengkel",
  heroTitle: "Selamat datang di MyBengkel",
  heroSubtitle: "Servis terjadwal. Pengerjaan tercatat. Biaya jelas.",
  aboutText:
    "MyBengkel adalah bengkel contoh untuk prototype ini. Melayani servis motor dan mobil dengan alur kerja yang jelas, dari booking sampai kendaraan diambil (dummy).",
  aboutFacts: [
    "Berdiri sejak 2000 (dummy)",
    "Kapasitas 10 kendaraan per hari (dummy)",
    "Sertifikasi: dummy",
  ],
  bookingServices: [
    "Servis berkala",
    "Ganti oli dan filter",
    "Pengecekan rem",
    "Tune up",
    "Kelistrikan",
    "Perbaikan mesin",
    "Lainnya",
  ],
  bookingHours: ["08.00", "09.00", "10.00", "11.00", "13.00", "14.00", "15.00", "16.00"],
  address: "Jl. Dummy No. 1, Kota Contoh (dummy)",
  hours: "Senin sampai Sabtu, 08.00 sampai 17.00 (dummy)",
  whatsappNumber: "6200000000000", // dummy, tidak aktif
} as const;

export const siteContent = site;
export type SiteContent = typeof site;
