import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ResetPassword from './pages/auth/ResetPassword';
import ResetPin from './pages/auth/ResetPin';
import VerifyEmail from './pages/auth/VerifyEmail';
import { RequireAdmin, RequireHelpdeskOrAdmin, useAuth } from './lib/mockAuth';
import { AdminProvider } from './context/AdminContext';
import AdminLayout from './layouts/AdminLayout';
import AdminIndex from './pages/admin/AdminIndex';
import V1Booking from './pages/admin/V1Booking';
import V1ServiceForms from './pages/admin/V1ServiceForms';
import V1WorkOrders from './pages/admin/V1WorkOrders';
import V1Attendance from './pages/admin/V1Attendance';
import { LaporanSemua, LaporanServis, LaporanGudang, LaporanPenjualan } from './pages/admin/AdminReports';
import V2Warehouse from './pages/admin/V2Warehouse';
import V2Sales from './pages/admin/V2Sales';
import V2MasterWarehouse from './pages/admin/V2MasterWarehouse';
import HelpDeskCenter from './pages/admin/HelpDeskCenter';

const RequireRoleRoute: React.FC<{
  allowedRoles: Array<'admin' | 'master_admin' | 'master_helpdesk'>;
  fallbackTo: string;
  children: React.ReactNode;
}> = ({ allowedRoles, fallbackTo, children }) => {
  const { role } = useAuth();
  if (!role || !allowedRoles.includes(role as any)) {
    return <Navigate to={fallbackTo} replace />;
  }
  return <>{children}</>;
};

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

        {/* Admin Shell (Protected for Admin, Master Admin/Gudang & Master Helpdesk) */}
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

          {/* V1: Operasional servis (Service Form khusus Admin reguler; role lain monitoring) */}
          <Route path="v1/booking" element={<RequireAdmin><V1Booking /></RequireAdmin>} />
          <Route
            path="v1/service-forms"
            element={
              <RequireAdmin>
                <RequireRoleRoute allowedRoles={['admin']} fallbackTo="/admin/v1/booking">
                  <V1ServiceForms />
                </RequireRoleRoute>
              </RequireAdmin>
            }
          />
          <Route path="v1/work-orders" element={<RequireAdmin><V1WorkOrders /></RequireAdmin>} />
          <Route path="v1/work-orders/:id" element={<RequireAdmin><V1WorkOrders /></RequireAdmin>} />
          <Route path="v1/attendance" element={<RequireAdmin><V1Attendance /></RequireAdmin>} />

          {/* V2: Gudang (Admin view-only Stok Part; Master Admin & Helpdesk akses Stok Part + Input Part) */}
          <Route path="v2" element={<RequireAdmin><Navigate to="/admin/v2/warehouse" replace /></RequireAdmin>} />
          <Route path="v2/purchase-requests" element={<RequireAdmin><Navigate to="/admin/v2/warehouse" replace /></RequireAdmin>} />
          <Route path="v2/warehouse" element={<RequireAdmin><V2Warehouse /></RequireAdmin>} />
          <Route
            path="v2/input-part"
            element={
              <RequireAdmin>
                <RequireRoleRoute allowedRoles={['master_admin', 'master_helpdesk']} fallbackTo="/admin/v2/warehouse">
                  <V2MasterWarehouse />
                </RequireRoleRoute>
              </RequireAdmin>
            }
          />
          <Route
            path="v2/master-gudang"
            element={
              <RequireAdmin>
                <RequireRoleRoute allowedRoles={['master_admin', 'master_helpdesk']} fallbackTo="/admin/v2/warehouse">
                  <V2MasterWarehouse />
                </RequireRoleRoute>
              </RequireAdmin>
            }
          />
          <Route
            path="v2/manual-entries"
            element={
              <RequireAdmin>
                <RequireRoleRoute allowedRoles={['master_admin', 'master_helpdesk']} fallbackTo="/admin/v2/warehouse">
                  <V2MasterWarehouse />
                </RequireRoleRoute>
              </RequireAdmin>
            }
          />

          {/* Penjualan (POS) */}
          <Route path="penjualan" element={<RequireAdmin><V2Sales /></RequireAdmin>} />
          <Route path="v2/sales" element={<RequireAdmin><V2Sales /></RequireAdmin>} />

          {/* Laporan */}
          <Route path="laporan" element={<RequireAdmin><LaporanSemua /></RequireAdmin>} />
          <Route path="laporan/servis" element={<RequireAdmin><LaporanServis /></RequireAdmin>} />
          <Route path="laporan/penjualan" element={<RequireAdmin><LaporanPenjualan /></RequireAdmin>} />
          <Route
            path="laporan/gudang"
            element={
              <RequireAdmin>
                <RequireRoleRoute allowedRoles={['master_admin', 'master_helpdesk']} fallbackTo="/admin/laporan/servis">
                  <LaporanGudang />
                </RequireRoleRoute>
              </RequireAdmin>
            }
          />

          {/* Helpdesk Center (Master Helpdesk only) */}
          <Route
            path="helpdesk"
            element={
              <RequireRoleRoute allowedRoles={['master_helpdesk']} fallbackTo="/admin">
                <HelpDeskCenter />
              </RequireRoleRoute>
            }
          />
        </Route>
      </Routes>
    </AdminProvider>
  );
};

export default App;
