import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import CashierLayout from './components/layout/CashierLayout';
import AdminLayout from './components/layout/AdminLayout';

import Login from './pages/Login';

import Pos from './pages/cashier/Pos';
import InventoryViewer from './pages/cashier/InventoryViewer';
import InventoryCheck from './pages/cashier/InventoryCheck';
import TodaySales from './pages/cashier/TodaySales';

import Overview from './pages/admin/Overview';
import Comparison from './pages/admin/Comparison';
import ProductManager from './pages/admin/ProductManager';
import RecipeManager from './pages/admin/RecipeManager';
import UserManager from './pages/admin/UserManager';
import InventoryManager from './pages/admin/InventoryManager';
import Reports from './pages/admin/Reports';

/** Sends "/" to the correct home page for whoever is signed in. */
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === 'admin' ? '/admin' : '/pos'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          {/* Cashier section */}
          <Route
            path="/pos"
            element={
              <ProtectedRoute role="cashier">
                <CashierLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Pos />} />
            <Route path="inventory" element={<InventoryViewer />} />
            <Route path="inventory-check" element={<InventoryCheck />} />
            <Route path="sales" element={<TodaySales />} />
          </Route>

          {/* Admin section */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Overview />} />
            <Route path="comparison" element={<Comparison />} />
            <Route path="products" element={<ProductManager />} />
            <Route path="recipes" element={<RecipeManager />} />
            <Route path="users" element={<UserManager />} />
            <Route path="inventory" element={<InventoryManager />} />
            <Route path="reports" element={<Reports />} />
          </Route>

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
