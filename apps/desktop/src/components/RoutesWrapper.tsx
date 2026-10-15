import { useLocation } from 'react-router-dom';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Layout } from '../components/layout/Layout';
import { Dashboard } from '../components/dashboard/Dashboard';
import { Domains } from '../components/domains/Domains';
import { DomainDetail } from '../components/domains/DomainDetail';
import { Chat } from '../components/chat/Chat';
import { Tasks } from '../components/tasks/Tasks';
import { Analytics } from '../components/analytics/Analytics';
import { Approvals } from '../components/approvals/Approvals';
import { Settings } from '../components/settings/Settings';
import { Login } from '../components/auth/Login';
import { Register } from '../components/auth/Register';
import { Onboarding } from '../components/auth/Onboarding';
import { ForgotPassword } from '../components/auth/ForgotPassword';
import { ResetPassword } from '../components/auth/ResetPassword';
import { ProtectedRoute, PublicRoute } from './RouteGuards';
import { ErrorBoundary } from './ErrorBoundary';
import { AuthLayout, AuthBackdrop } from './AuthLayout';

const AUTH_ROUTES = new Set([
  '/login',
  '/register',
  '/onboarding',
  '/forgot-password',
  '/reset-password',
]);

export function RoutesWrapper() {
  const location = useLocation();
  const showAuthBackdrop = AUTH_ROUTES.has(location.pathname);

  return (
    <ErrorBoundary>
      <div className="relative h-full w-full">
        {showAuthBackdrop && <AuthBackdrop />}
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            className="relative z-10 h-full"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <Routes location={location}>
              {/* Public routes with AuthLayout */}
              <Route path="/login" element={
                <PublicRoute>
                  <AuthLayout>
                    <Login />
                  </AuthLayout>
                </PublicRoute>
              } />
              <Route path="/register" element={
                <PublicRoute>
                  <AuthLayout>
                    <Register />
                  </AuthLayout>
                </PublicRoute>
              } />
              <Route path="/onboarding" element={
                <PublicRoute>
                  <AuthLayout>
                    <Onboarding />
                  </AuthLayout>
                </PublicRoute>
              } />
              <Route path="/forgot-password" element={
                <PublicRoute>
                  <AuthLayout>
                    <ForgotPassword />
                  </AuthLayout>
                </PublicRoute>
              } />
              <Route path="/reset-password" element={
                <PublicRoute>
                  <AuthLayout>
                    <ResetPassword />
                  </AuthLayout>
                </PublicRoute>
              } />

              {/* Protected routes with main Layout */}
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="domains" element={<Domains />} />
                <Route path="domains/:id" element={<DomainDetail />} />
                <Route path="chat" element={<Chat />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="analytics" element={<Analytics />} />
                <Route path="approvals" element={<Approvals />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Routes>
          </motion.div>
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}