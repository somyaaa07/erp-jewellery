import './App.css'

// src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import DashboardLayout from './components/Layout/DashboardLayout';

import Login from './pages/Login';
import TenantsDashboard from './pages/SuperAdmin/TenantsDashboard';
import AdminDashboard from './pages/Admin/AdminDashboard';
import BranchManagement from './pages/Admin/BranchManagement';
import Reports from './pages/Admin/Reports';

import Locations from './pages/inventory/Location';
import DesignMaster from './pages/inventory/DesignMaster';
import GoldRate from './pages/inventory/GoldRate';
import Pricing from './pages/inventory/Pricing';
import ItemList from './pages/inventory/ItemList';
import ItemForm from './pages/inventory/ItemForm';
import ItemDetail from './pages/inventory/ItemDetail';
import StockTransfer from './pages/inventory/StockTransfer';
import StockOps from './pages/inventory/StockOps';

import Supplier from './pages/purchasing/Supplier';

import Billing from './pages/pos/Billing';
import Customers from './pages/pos/Customers';
import Invoices from './pages/pos/Invoices';

import Manufacturing from './pages/karigar/Manufacturing';

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
    </BrowserRouter>
  );
}
