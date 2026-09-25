import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { InspectionRows } from './Dashboard';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { listInspections } from '../services/inspectionApi';
import { CATEGORIES, INSPECTION_STATUS, inspectionLink, TERMINAL_STATUSES } from '../utils/statusUtils';
import { errorMessage } from '../utils/format';

/** mode="reports" lists only screened inspections and links straight to their report. */
export default function InspectionHistory({ mode = 'history' }) {
  const reports = mode === 'reports';
  const [inspections, setInspections] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');

  const load = useCallback(() => {
    setError(null);
    listInspections()
      .then(setInspections)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    if (!inspections) return [];
    const q = query.trim().toLowerCase();
    return inspections.filter(
      (i) =>
        (!reports || TERMINAL_STATUSES.includes(i.status)) &&
        (!status || i.status === status) &&
        (!category || i.category === category) &&
        (!q || i.productName.toLowerCase().includes(q) || i.inspectionCode.toLowerCase().includes(q)),
    );
  }, [inspections, query, status, category, reports]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!inspections) return <Loading />;

  const statuses = reports ? TERMINAL_STATUSES : Object.keys(INSPECTION_STATUS);

  return (
    <section className="card">
      <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search by product or inspection ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {INSPECTION_STATUS[s].label}
            </option>
          ))}
        </select>
        <select className="input sm:w-52" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {rows.length ? (
        <>
          <InspectionRows inspections={rows} actionFor={reports ? (i) => ({ to: `/inspections/${i.id}/report`, label: 'Open report' }) : inspectionLink} />
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Showing {rows.length} of {reports ? inspections.filter((i) => TERMINAL_STATUSES.includes(i.status)).length : inspections.length}
          </p>
        </>
      ) : (
        <EmptyState
          title={inspections.length ? 'No inspections match these filters' : reports ? 'No reports yet' : 'No inspections yet'}
          message={reports && !inspections.length ? 'Reports appear once a scan completes.' : undefined}
          action={
            !inspections.length && (
              <Link to="/inspections/new" className="btn-primary">
                New Inspection
              </Link>
            )
          }
        />
      )}
    </section>
  );
}
