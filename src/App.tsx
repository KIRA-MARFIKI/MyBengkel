import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import { RequireAdmin } from './lib/mockAuth';
import { AdminProvider } from './context/AdminContext';
import AdminLayout from './layouts/AdminLayout';
import AdminIndex from './pages/admin/AdminIndex';
import V1Booking from './pages/admin/V1Booking';
import V1ServiceForms from './pages/admin/V1ServiceForms';
import V1WorkOrders from './pages/admin/V1WorkOrders';
import V1Attendance from './pages/admin/V1Attendance';
import { LaporanSemua, LaporanServis, LaporanGudang, LaporanPenjualan } from './pages/admin/AdminReports';
import V2PurchaseRequests from './pages/admin/V2PurchaseRequests';
import V2Warehouse from './pages/admin/V2Warehouse';
import V2Sales from './pages/admin/V2Sales';
import V2ManualEntries from './pages/admin/V2ManualEntries';
import V2MasterWarehouse from './pages/admin/V2MasterWarehouse';
import HelpDeskPage from './pages/admin/HelpDeskPage';

export const App: React.FC = () => {
  return (
    <AdminProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Admin (protected) */}
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminLayout />
            </RequireAdmin>
          }
        >
          <Route index element={<AdminIndex />} />

          {/* V1: Operasional servis */}
          <Route path="v1/booking" element={<V1Booking />} />
          <Route path="v1/service-forms" element={<V1ServiceForms />} />
          <Route path="v1/work-orders" element={<V1WorkOrders />} />
          <Route path="v1/work-orders/:id" element={<V1WorkOrders />} />
          <Route path="v1/attendance" element={<V1Attendance />} />

          {/* V2: Gudang (Permintaan Penyediaan, Pengelolaan Gudang, Input Manual, Master Gudang) */}
          <Route path="v2/purchase-requests" element={<V2PurchaseRequests />} />
          <Route path="v2/warehouse" element={<V2Warehouse />} />
          <Route path="v2/manual-entries" element={<V2ManualEntries />} />
          <Route path="v2/master-gudang" element={<V2MasterWarehouse />} />

          {/* Penjualan (POS) */}
          <Route path="penjualan" element={<V2Sales />} />
          <Route path="v2/sales" element={<V2Sales />} />

          {/* Laporan: /admin/laporan (Semua), /admin/laporan/servis, /admin/laporan/penjualan, /admin/laporan/gudang */}
          <Route path="laporan" element={<LaporanSemua />} />
          <Route path="laporan/servis" element={<LaporanServis />} />
          <Route path="laporan/penjualan" element={<LaporanPenjualan />} />
          <Route path="laporan/gudang" element={<LaporanGudang />} />

          {/* Help Desk */}
          <Route path="helpdesk" element={<HelpDeskPage />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
};

export default App;
