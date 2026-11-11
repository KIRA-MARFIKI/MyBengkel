import React from 'react';
import { DataCard } from '../../components/admin/DataCard';

const Placeholder: React.FC<{ title: string }> = ({ title }) => (
  <DataCard title={title}>
    <p className="py-6 text-[14px] text-[#646B7C]">Belum tersedia.</p>
  </DataCard>
);

export const V1ServiceForms: React.FC = () => <Placeholder title="Service Form" />;
export const V1WorkOrders: React.FC = () => <Placeholder title="Work Order" />;
export const V1Attendance: React.FC = () => <Placeholder title="Absen Mekanik" />;
export const V1Reports: React.FC = () => <Placeholder title="Laporan Operasional" />;

export const V2PurchaseRequests: React.FC = () => <Placeholder title="Permintaan Penyediaan" />;
export const V2Warehouse: React.FC = () => <Placeholder title="Pengelolaan Gudang" />;
export const V2Sales: React.FC = () => <Placeholder title="Penjualan" />;
export const V2ManualEntries: React.FC = () => <Placeholder title="Input Manual" />;
export const V2Reports: React.FC = () => <Placeholder title="Laporan Gudang dan Penjualan" />;

export const HelpDeskPage: React.FC = () => <Placeholder title="Help Desk" />;
