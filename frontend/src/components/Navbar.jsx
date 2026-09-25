import { Link, useLocation } from 'react-router-dom';
import { Database, Menu, Plus, Server } from 'lucide-react';
import { isMockMode } from '../services/settings';

function titleFor(path) {
  if (path === '/') return 'Dashboard';
  if (path === '/inspections/new') return 'New Inspection';
  if (/\/scan$/.test(path)) return 'Scan Processing';
  if (/\/results$/.test(path)) return 'Compliance Results';
  if (/\/report$/.test(path)) return 'Screening Report';
  if (path.startsWith('/history')) return 'Inspection History';
  if (path.startsWith('/reports')) return 'Reports';
  if (path.startsWith('/settings')) return 'Settings';
  return 'VeriMetrix';
}

export default function Navbar({ onMenu }) {
  const { pathname } = useLocation();
  const mock = isMockMode();

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6 print:hidden">
      <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <h1 className="truncate text-lg font-semibold text-slate-900">{titleFor(pathname)}</h1>

      <div className="ml-auto flex items-center gap-3">
        <Link
          to="/settings"
          title={mock ? 'Using built-in demo data' : 'Connected to backend API'}
          className={`hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset sm:inline-flex ${
            mock ? 'bg-amber-50 text-amber-800 ring-amber-600/25' : 'bg-teal-50 text-teal-800 ring-teal-600/25'
          }`}
        >
          {mock ? <Database className="h-3.5 w-3.5" /> : <Server className="h-3.5 w-3.5" />}
          {mock ? 'Demo data' : 'Live API'}
        </Link>
        {pathname !== '/inspections/new' && (
          <Link to="/inspections/new" className="btn-primary px-3 py-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Inspection</span>
          </Link>
        )}
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600" title="Inspector">
          IN
        </span>
      </div>
    </header>
  );
}
