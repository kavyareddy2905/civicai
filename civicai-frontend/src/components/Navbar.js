import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Map, LayoutDashboard, Upload, Wrench, LogOut, Menu, X, Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const linkClass = ({ isActive }) =>
  `inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive
      ? 'bg-navy-800 text-white'
      : 'text-slate-300 hover:bg-navy-800/60 hover:text-white'
  }`;

export default function Navbar() {
  const { user, logout, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) return null;

  const role = user?.role;
  const links = [];

  if (role === 'Inspector' || role === 'Officer') {
    links.push({ to: '/upload', label: 'Upload', icon: Upload });
  }
  links.push({ to: '/map', label: 'GIS Map', icon: Map });
  if (role === 'Officer' || role === 'Maintenance') {
    links.push({ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard });
    links.push({ to: '/maintenance', label: 'Maintenance', icon: Wrench });
  }

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-950 text-white shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <Link to={role === 'Inspector' ? '/upload' : '/dashboard'} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-700">
            <Shield className="h-5 w-5 text-sky-300" />
          </span>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold tracking-tight">CivicAI</div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Infrastructure Inspection
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={linkClass}>
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          <div className="text-right">
            <div className="text-sm font-semibold">{user?.name}</div>
            <div className="text-xs text-slate-400">
              {role === 'Officer' ? 'Municipal Officer' : role}
              {user?.department ? ` · ${user.department}` : ''}
            </div>
          </div>
          <button type="button" onClick={handleLogout} className="btn-secondary !border-navy-600 !bg-navy-800 !py-2 !text-slate-100 hover:!bg-navy-700">
            <LogOut className="h-4 w-4" />
            Logout
          </button>
        </div>

        <button
          type="button"
          className="rounded-lg p-2 text-slate-200 hover:bg-navy-800 md:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-navy-800 px-4 py-3 md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={linkClass}
                onClick={() => setOpen(false)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 flex items-center justify-between border-t border-navy-800 pt-3">
            <div>
              <div className="text-sm font-semibold">{user?.name}</div>
              <div className="text-xs text-slate-400">
                {role === 'Officer' ? 'Municipal Officer' : role}
              </div>
            </div>
            <button type="button" onClick={handleLogout} className="btn-secondary !border-navy-600 !bg-navy-800 !py-2 !text-slate-100">
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
