import './App.css'

// src/App.jsx
import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/Layout/DashboardLayout';
import { Loading } from './components/ui';

import Login from './pages/Login';
const TenantsDashboard = lazy(() => import('./pages/SuperAdmin/TenantsDashboard'));
const AdminDashboard = lazy(() => import('./pages/Admin/AdminDashboard'));
const BranchManagement = lazy(() => import('./pages/Admin/BranchManagement'));
const Reports = lazy(() => import('./pages/Admin/Reports'));

const Locations = lazy(() => import('./pages/inventory/Location'));
const DesignMaster = lazy(() => import('./pages/inventory/DesignMaster'));
const GoldRate = lazy(() => import('./pages/inventory/GoldRate'));
const Pricing = lazy(() => import('./pages/inventory/Pricing'));
const ItemList = lazy(() => import('./pages/inventory/ItemList'));
const ItemForm = lazy(() => import('./pages/inventory/ItemForm'));
const ItemDetail = lazy(() => import('./pages/inventory/ItemDetail'));
const StockTransfer = lazy(() => import('./pages/inventory/StockTransfer'));
const StockOps = lazy(() => import('./pages/inventory/StockOps'));
const DisplayTrays = lazy(() => import('./pages/inventory/DisplayTrays'));
const DailyStockReport = lazy(() => import('./pages/inventory/DailyStockReport'));
const StorageMap = lazy(() => import('./pages/inventory/StorageMap'));
const FindStock = lazy(() => import('./pages/inventory/FindStock'));
const DesignDetails = lazy(() => import('./pages/inventory/DesignDetails'));

const Supplier = lazy(() => import('./pages/purchasing/Supplier'));

const Billing = lazy(() => import('./pages/pos/Billing'));
const Customers = lazy(() => import('./pages/pos/Customers'));
const Invoices = lazy(() => import('./pages/pos/Invoices'));

const Manufacturing = lazy(() => import('./pages/karigar/Manufacturing'));

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  const map = {
    SUPER_ADMIN: '/super-admin/tenants',
    ADMIN: '/admin',
    MANAGER: '/inventory/items',
    SALESMAN: '/pos/billing',
    KARIGAR_INCHARGE: '/karigar',
  };
  return <Navigate to={map[user.role] || '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
     <ToastContainer position="top-right" autoClose={3000} />
      <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          {/* Super Admin */}
          <Route path="/super-admin/tenants" element={
            <ProtectedRoute allowedRoles={['SUPER_ADMIN']}><TenantsDashboard /></ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={
            <ProtectedRoute allowedRoles={['ADMIN']}><AdminDashboard /></ProtectedRoute>
          } />
          <Route path="/admin/branches" element={
            <ProtectedRoute allowedRoles={['ADMIN']}><BranchManagement /></ProtectedRoute>
          } />
          <Route path="/admin/reports" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Reports /></ProtectedRoute>
          } />

          {/* Inventory */}
          <Route path="/inventory/locations" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Locations /></ProtectedRoute>
          } />
          <Route path="/inventory/designs" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><DesignMaster /></ProtectedRoute>
          } />
          <Route path="/inventory/items" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN', 'KARIGAR_INCHARGE']}><ItemList /></ProtectedRoute>
          } />
          <Route path="/inventory/items/new" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><ItemForm /></ProtectedRoute>
          } />
          <Route path="/inventory/items/:id" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN', 'KARIGAR_INCHARGE']}><ItemDetail /></ProtectedRoute>
          } />

          {/* Rates & pricing */}
          <Route path="/inventory/gold-rates" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><GoldRate /></ProtectedRoute>
          } />
          <Route path="/inventory/pricing" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Pricing /></ProtectedRoute>
          } />

          <Route path="/inventory/designs/:id" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><DesignDetails /></ProtectedRoute>
          } />

          {/* Storage hierarchy and counter-wise search */}
          <Route path="/inventory/storage-map" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><StorageMap /></ProtectedRoute>
          } />
          <Route path="/inventory/find" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN']}><FindStock /></ProtectedRoute>
          } />

          {/* Display trays and the daily wholesale stock report */}
          <Route path="/inventory/display-trays" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><DisplayTrays /></ProtectedRoute>
          } />
          <Route path="/inventory/daily-stock-report" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><DailyStockReport /></ProtectedRoute>
          } />

          {/* Stock operations */}
          <Route path="/inventory/transfers" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><StockTransfer /></ProtectedRoute>} />
          <Route path="/inventory/stock-ops" element={<ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><StockOps /></ProtectedRoute>} />

          {/* Purchasing */}
          <Route path="/purchasing/suppliers" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER']}><Supplier /></ProtectedRoute>
          } />

          {/* Sales / POS */}
          <Route path="/pos/billing" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN']}><Billing /></ProtectedRoute>
          } />
          <Route path="/pos/customers" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN']}><Customers /></ProtectedRoute>
          } />
          <Route path="/pos/invoices" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'SALESMAN']}><Invoices /></ProtectedRoute>
          } />

          {/* Manufacturing */}
          <Route path="/karigar" element={
            <ProtectedRoute allowedRoles={['ADMIN', 'MANAGER', 'KARIGAR_INCHARGE']}><Manufacturing /></ProtectedRoute>
          } />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
