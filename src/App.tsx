import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/auth/ResetPassword';
import ResetPin from './pages/auth/ResetPin';
import VerifyEmail from './pages/auth/VerifyEmail';
import { RequireAdmin, RequireHelpdeskOrAdmin } from './lib/mockAuth';
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
import HelpDeskCenter from './pages/admin/HelpDeskCenter';

export const App: React.FC = () => {
  return (
    <AdminProvider>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/auth/reset-pin" element={<ResetPin />} />
        <Route path="/auth/verify-email" element={<VerifyEmail />} />

        {/* Admin Shell (Protected for Admin & Master Helpdesk) */}
        <Route
          path="/admin"
          element={
            <RequireHelpdeskOrAdmin>
              <AdminLayout />
            </RequireHelpdeskOrAdmin>
          }
        >
          <Route
            index
            element={
              <RequireAdmin>
                <AdminIndex />
              </RequireAdmin>
            }
          />

          {/* V1: Operasional servis (Admin only) */}
          <Route path="v1/booking" element={<RequireAdmin><V1Booking /></RequireAdmin>} />
          <Route path="v1/service-forms" element={<RequireAdmin><V1ServiceForms /></RequireAdmin>} />
          <Route path="v1/work-orders" element={<RequireAdmin><V1WorkOrders /></RequireAdmin>} />
          <Route path="v1/work-orders/:id" element={<RequireAdmin><V1WorkOrders /></RequireAdmin>} />
          <Route path="v1/attendance" element={<RequireAdmin><V1Attendance /></RequireAdmin>} />

          {/* V2: Gudang (Admin only) */}
          <Route path="v2/purchase-requests" element={<RequireAdmin><V2PurchaseRequests /></RequireAdmin>} />
          <Route path="v2/warehouse" element={<RequireAdmin><V2Warehouse /></RequireAdmin>} />
          <Route path="v2/manual-entries" element={<RequireAdmin><V2ManualEntries /></RequireAdmin>} />
          <Route path="v2/master-gudang" element={<RequireAdmin><V2MasterWarehouse /></RequireAdmin>} />

          {/* Penjualan (POS) (Admin only) */}
          <Route path="penjualan" element={<RequireAdmin><V2Sales /></RequireAdmin>} />
          <Route path="v2/sales" element={<RequireAdmin><V2Sales /></RequireAdmin>} />

          {/* Laporan (Admin only) */}
          <Route path="laporan" element={<RequireAdmin><LaporanSemua /></RequireAdmin>} />
          <Route path="laporan/servis" element={<RequireAdmin><LaporanServis /></RequireAdmin>} />
          <Route path="laporan/penjualan" element={<RequireAdmin><LaporanPenjualan /></RequireAdmin>} />
          <Route path="laporan/gudang" element={<RequireAdmin><LaporanGudang /></RequireAdmin>} />

          {/* Helpdesk Center (Master Helpdesk & Admin) */}
          <Route path="helpdesk" element={<HelpDeskCenter />} />
        </Route>
      </Routes>
    </AdminProvider>
  );
};

export default App;
