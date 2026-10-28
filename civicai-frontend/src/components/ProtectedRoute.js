import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { canAccessRoute } from '../utils/constants';

export default function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !roles.includes(user?.role)) {
    const fallback = user?.role === 'Inspector' ? '/upload' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  if (!canAccessRoute(user?.role, location.pathname)) {
    const fallback = user?.role === 'Inspector' ? '/upload' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return children;
}
