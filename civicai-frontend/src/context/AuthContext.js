import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { login as loginApi } from '../services/api';
import { roleHomePath } from '../utils/constants';

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    const raw = localStorage.getItem('civicai_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('civicai_token'));
  const [user, setUser] = useState(readStoredUser);
  const [loading, setLoading] = useState(false);

  const persistSession = useCallback((nextToken, nextUser) => {
    localStorage.setItem('civicai_token', nextToken);
    localStorage.setItem('civicai_user', JSON.stringify(nextUser));
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const login = useCallback(async (email, password, expectedRole) => {
    setLoading(true);
    try {
      const { data } = await loginApi(email, password);
      if (!data.success || !data.token) {
        throw new Error(data.message || 'Login failed');
      }

      const nextUser = data.user;
      if (expectedRole && nextUser.role !== expectedRole) {
        // Map UI label "Municipal Officer" → Officer
        const map = { 'Municipal Officer': 'Officer', Inspector: 'Inspector' };
        const wanted = map[expectedRole] || expectedRole;
        if (nextUser.role !== wanted) {
          const err = new Error(
            `This account is registered as ${nextUser.role}. Select the matching role to continue.`
          );
          err.code = 'ROLE_MISMATCH';
          throw err;
        }
      }

      persistSession(data.token, nextUser);
      return { user: nextUser, redirectTo: roleHomePath(nextUser.role) };
    } finally {
      setLoading(false);
    }
  }, [persistSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('civicai_token');
    localStorage.removeItem('civicai_user');
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [token, user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
