import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import InspectorUpload from './pages/InspectorUpload';
import GISMapView from './pages/GISMapView';
import AdminDashboard from './pages/AdminDashboard';
import MaintenanceTracker from './pages/MaintenanceTracker';
import { roleHomePath } from './utils/constants';

function AppLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <main>{children}</main>
    </div>
  );
}

function HomeRedirect() {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={roleHomePath(user?.role)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: '#102a43',
              color: '#f8fafc',
              fontSize: '14px',
            },
            success: { iconTheme: { primary: '#38bdf8', secondary: '#102a43' } },
            error: { iconTheme: { primary: '#f87171', secondary: '#102a43' } },
          }}
        />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route
            path="/upload"
            element={
              <ProtectedRoute roles={['Inspector', 'Officer']}>
                <AppLayout>
                  <InspectorUpload />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/map"
            element={
              <ProtectedRoute>
                <AppLayout>
                  <GISMapView />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={['Officer', 'Maintenance']}>
                <AppLayout>
                  <AdminDashboard />
                </AppLayout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/maintenance"
            element={
              <ProtectedRoute roles={['Officer', 'Maintenance']}>
                <AppLayout>
                  <MaintenanceTracker />
                </AppLayout>
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
