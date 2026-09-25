import { useState } from 'react';
import { BrowserRouter, Link, Outlet, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import { ToastProvider } from './components/Toast';
import Dashboard from './pages/Dashboard';
import NewInspection from './pages/NewInspection';
import ScanProgress from './pages/ScanProgress';
import InspectionResults from './pages/InspectionResults';
import InspectionHistory from './pages/InspectionHistory';
import Report from './pages/Report';
import Settings from './pages/Settings';

function Layout() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="min-h-full">
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
      <div className="lg:pl-64 print:pl-0">
        <Navbar onMenu={() => setMenuOpen(true)} />
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 print:max-w-none print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="py-24 text-center">
      <p className="text-sm font-medium text-teal-700">404</p>
      <h2 className="mt-2 text-2xl font-semibold">Page not found</h2>
      <Link to="/" className="btn-primary mt-6">
        Back to dashboard
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="inspections/new" element={<NewInspection />} />
            <Route path="inspections/:id/scan" element={<ScanProgress />} />
            <Route path="inspections/:id/results" element={<InspectionResults />} />
            <Route path="inspections/:id/report" element={<Report />} />
            <Route path="history" element={<InspectionHistory />} />
            <Route path="reports" element={<InspectionHistory mode="reports" />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
