// ============================================================
// App.tsx — Router + Guard'lar
// ============================================================
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';

// Auth
import DashboardPage from './pages/DashboardPage';
import Login from './pages/Login';

// Herkes (checker hariç)
import CardsPage from './pages/CardsPage';
import CheckPage from './pages/CheckPage';
import FavoritesPage from './pages/FavoritesPage';
import ImportPage from './pages/ImportPage';
import ProcessorDumpImportPage from './pages/ProcessorDumpImportPage';

// Bin
import BinHistoryPage from './pages/BinHistoryPage';
import BinPage from './pages/BinPage';
import SubscriptionChecksPage from './pages/SubscriptionChecksPage';

// Admin
import AdminPage from './pages/AdminPage';
import BankAccountsPage from './pages/BankAccountsPage';
import ProcessorsPage from './pages/ProcessorsPage';
import ChargePage from './pages/ChargePage';
import CollectionsPage from './pages/CollectionsPage';
import LoadCardsPage from './pages/LoadCardsPage';
import LoadsPage from './pages/LoadsPage';
import ProcessorRoutingPage from './pages/ProcessorRoutingPage';
import RoutingAnalyticsPage from './pages/RoutingAnalyticsPage';
import TransactionsPage from './pages/TransactionsPage';
import ProviderDashboard from './pages/ProviderDashboard';
import ProviderTransactionsPage from './pages/ProviderTransactionsPage';
import ProviderSelectionPage from './pages/ProviderSelectionPage';
import PosPage from './pages/PosPage';
import EnrollmentsPage from './pages/EnrollmentsPage';
import RolesPage from './pages/RolesPage';

import { useAuthStore } from './stores/authStore';

// ============================================================
// GUARD'LAR
// ============================================================
function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const isAdmin = useAuthStore((s) => s.isAdmin);
  return isAdmin() ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const hasPermission = useAuthStore((s) => s.hasPermission);
  return hasPermission(permission) ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/**
 * Checker rolündeki kullanıcıların erişemeyeceği sayfalar için.
 * Diğer tüm roller (admin, user) geçebilir.
 */
function NonCheckerRoute({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'checker' ? <Navigate to="/bin" replace /> : <>{children}</>;
}

/**
 * Checker ve admin erişebilir (subscription precheck sayfası).
 */
function CheckerOrAdminRoute({ children }: { children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'checker' || role === 'admin' ? (
    <>{children}</>
  ) : (
    <Navigate to="/dashboard" replace />
  );
}

function DashboardRoute() {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'checker' ? <Navigate to="/bin" replace /> : <DashboardPage />;
}

// ============================================================
// APP
// ============================================================
export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Private (Layout içinde) */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            {/* Root yönlendirmesi */}
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardRoute />} />
            <Route path="processors" element={<NonCheckerRoute><ProcessorsPage /></NonCheckerRoute>} />

            {/* ------- Herkes (checker hariç) ------- */}
            <Route
              path="cards"
              element={
                <NonCheckerRoute>
                  <CardsPage />
                </NonCheckerRoute>
              }
            />
            <Route
              path="check"
              element={
                <NonCheckerRoute>
                  <CheckPage />
                </NonCheckerRoute>
              }
            />
            <Route
              path="import"
              element={
                <NonCheckerRoute>
                  <ImportPage />
                </NonCheckerRoute>
              }
            />
            <Route
              path="processor-dumps"
              element={<NonCheckerRoute><ProcessorDumpImportPage /></NonCheckerRoute>}
            />
            <Route
              path="favs"
              element={
                <NonCheckerRoute>
                  <FavoritesPage />
                </NonCheckerRoute>
              }
            />

            {/* ------- Bin (herkes) ------- */}
            <Route path="bin" element={<BinPage />} />
            <Route path="bin-history" element={<BinHistoryPage />} />

            {/* ------- Subscription (checker + admin) ------- */}
            <Route
              path="subscriptions"
              element={
                <CheckerOrAdminRoute>
                  <SubscriptionChecksPage />
                </CheckerOrAdminRoute>
              }
            />

            {/* ------- Admin ------- */}
            <Route
              path="admin"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <AdminRoute>
                  <AdminPage />
                </AdminRoute>
              }
            />
            <Route
              path="bank-accounts"
              element={
                <AdminRoute>
                  <BankAccountsPage />
                </AdminRoute>
              }
            />
            <Route
              path="load-cards"
              element={
                <AdminRoute>
                  <LoadCardsPage />
                </AdminRoute>
              }
            />
            <Route
              path="loads"
              element={
                <AdminRoute>
                  <LoadsPage />
                </AdminRoute>
              }
            />
            <Route
              path="collections"
              element={
                <AdminRoute>
                  <CollectionsPage />
                </AdminRoute>
              }
            />
            <Route
              path="pos"
              element={
                <PermissionRoute permission="payments.sale">
                  <PosPage />
                </PermissionRoute>
              }
            />
            <Route
              path="provider-selection"
              element={
                <PermissionRoute permission="providers.view">
                  <ProviderSelectionPage />
                </PermissionRoute>
              }
            />
            <Route
              path="roles"
              element={<AdminRoute><RolesPage /></AdminRoute>}
            />
            <Route
              path="enrollments"
              element={
                <PermissionRoute permission="enrollments.view">
                  <EnrollmentsPage />
                </PermissionRoute>
              }
            />
            <Route
              path="charge" 
              element={
                <AdminRoute>
                  <ChargePage />
                </AdminRoute>
              }
            />
            <Route
              path="transactions"
              element={
                <AdminRoute>
                  <TransactionsPage />
                </AdminRoute>
              }
            />
            <Route
              path="providers/summary"
              element={
                <AdminRoute>
                  <ProviderDashboard />
                </AdminRoute>
              }
            />
            <Route
              path="providers/transactions"
              element={
                <AdminRoute>
                  <ProviderTransactionsPage />
                </AdminRoute>
              }
            />
            <Route
              path="processor-routing"
              element={
                <AdminRoute>
                  <ProcessorRoutingPage />
                </AdminRoute>
              }
            />
            <Route
              path="analytics/routing"
              element={
                <AdminRoute>
                  <RoutingAnalyticsPage />
                </AdminRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
