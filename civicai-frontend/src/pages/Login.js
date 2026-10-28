import React, { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ClipboardCheck, Building2, Shield, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ROLES = [
  {
    id: 'Inspector',
    title: 'Inspector',
    description: 'Field capture, geolocation & AI inspection upload',
    icon: ClipboardCheck,
  },
  {
    id: 'Officer',
    title: 'Municipal Officer',
    description: 'Dashboard analytics, GIS oversight & task assignment',
    icon: Building2,
  },
];

export default function Login() {
  const { login, isAuthenticated, user, loading } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('Inspector');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (isAuthenticated && user) {
    return (
      <Navigate
        to={user.role === 'Inspector' ? '/upload' : '/dashboard'}
        replace
      />
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Enter email and password');
      return;
    }
    try {
      const result = await login(email.trim(), password, role);
      toast.success(`Welcome, ${result.user.name}`);
      navigate(result.redirectTo);
    } catch (err) {
      const msg =
        err.response?.data?.message || err.message || 'Login failed';
      toast.error(msg);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy-950">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 50% at 20% 10%, rgba(56,189,248,0.25), transparent),' +
            'radial-gradient(ellipse 60% 40% at 80% 80%, rgba(14,165,233,0.12), transparent),' +
            'linear-gradient(180deg, #0a1929 0%, #102a43 55%, #0f172a 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'1\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-4 py-12 sm:px-6">
        <div className="mb-10 text-center text-white">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/20 ring-1 ring-sky-400/30">
            <Shield className="h-7 w-7 text-sky-300" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            CivicAI
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-slate-300 sm:text-base">
            AI-based civic infrastructure inspection for municipal teams —
            detect, map, prioritize, and resolve.
          </p>
        </div>

        <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl backdrop-blur sm:p-8">
          <h2 className="font-display text-lg font-semibold text-navy-900">
            Sign in to continue
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Select your role, then authenticate with your municipal credentials.
          </p>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLES.map((r) => {
              const Icon = r.icon;
              const active = role === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRole(r.id)}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? 'border-navy-700 bg-navy-50 ring-2 ring-navy-600/30'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <Icon
                    className={`mb-2 h-5 w-5 ${active ? 'text-navy-800' : 'text-slate-400'}`}
                  />
                  <div className="text-sm font-semibold text-navy-900">{r.title}</div>
                  <div className="mt-1 text-xs leading-snug text-slate-500">{r.description}</div>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="label-field">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="input-field"
                placeholder="you@municipality.gov"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="label-field">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in with JWT'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
