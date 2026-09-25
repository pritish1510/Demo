import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, FilePlus2, ArrowRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { EmptyState, ErrorState, Loading } from '../components/States';
import { listInspections } from '../services/inspectionApi';
import { categoryLabel, inspectionLink, RESULT_STATUS } from '../utils/statusUtils';
import { errorMessage, formatDate } from '../utils/format';

export function InspectionRows({ inspections, actionFor = inspectionLink }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr>
            <th className="th">Inspection ID</th>
            <th className="th">Product</th>
            <th className="th">Category</th>
            <th className="th">Status</th>
            <th className="th">Date</th>
            <th className="th text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {inspections.map((ins) => {
            const link = actionFor(ins);
            return (
              <tr key={ins.id} className="hover:bg-slate-50/70">
                <td className="td font-mono text-[13px] font-medium whitespace-nowrap text-slate-900">{ins.inspectionCode}</td>
                <td className="td font-medium text-slate-900">{ins.productName}</td>
                <td className="td">{categoryLabel(ins.category)}</td>
                <td className="td">
                  <StatusBadge status={ins.status} kind="inspection" />
                </td>
                <td className="td tabular-nums">{formatDate(ins.createdAt)}</td>
                <td className="td text-right">
                  <Link to={link.to} className="inline-flex items-center gap-1 text-sm font-medium whitespace-nowrap text-teal-700 hover:text-teal-900">
                    {link.label} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const CHART_KEYS = [
  ['pass', 'PASS'],
  ['potentialShortfall', 'POTENTIAL_SHORTFALL'],
  ['reviewRequired', 'REVIEW_REQUIRED'],
  ['lowConfidence', 'LOW_CONFIDENCE'],
];

export default function Dashboard() {
  const [inspections, setInspections] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    setError(null);
    listInspections()
      .then(setInspections)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(load, [load]);

  const stats = useMemo(() => {
    if (!inspections) return null;
    const withSummary = inspections.filter((i) => i.summary);
    const sum = (k) => withSummary.reduce((n, i) => n + (i.summary[k] ?? 0), 0);
    return {
      total: inspections.length,
      completed: inspections.filter((i) => i.status === 'COMPLETED').length,
      pendingReview: inspections.filter((i) => i.status === 'REVIEW_REQUIRED').length,
      inProgress: inspections.filter((i) => ['CREATED', 'UPLOADED', 'PROCESSING'].includes(i.status)).length,
      shortfalls: withSummary.length ? sum('potentialShortfall') : null,
      shortfallProducts: withSummary.filter((i) => i.summary.potentialShortfall > 0).length,
      chart: CHART_KEYS.map(([key, status]) => ({ name: RESULT_STATUS[status].label, value: sum(key), color: RESULT_STATUS[status].chart })),
      hasChart: withSummary.length > 0,
    };
  }, [inspections]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!inspections) return <Loading label="Loading dashboard…" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Inspections" value={stats.total} icon={ClipboardList} tone="teal" hint={`${stats.inProgress} draft or in progress`} />
        <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="emerald" hint="No open findings" />
        <StatCard label="Pending Review" value={stats.pendingReview} icon={Clock} tone="yellow" hint="Awaiting inspector review" />
        <StatCard
          label="Potential Shortfalls"
          value={stats.shortfalls}
          icon={AlertTriangle}
          tone="orange"
          hint={stats.shortfalls != null ? `Across ${stats.shortfallProducts} product(s)` : 'Summary not provided by API'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="card xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Recent inspections</h2>
            <Link to="/history" className="text-sm font-medium text-teal-700 hover:text-teal-900">
              View all
            </Link>
          </div>
          {inspections.length ? (
            <InspectionRows inspections={inspections.slice(0, 6)} />
          ) : (
            <EmptyState
              title="No inspections yet"
              message="Start by screening a product package."
              action={
                <Link to="/inspections/new" className="btn-primary">
                  New Inspection
                </Link>
              }
            />
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <h2 className="font-semibold text-slate-900">Findings by status</h2>
            <p className="text-xs text-slate-500">All screened declarations across inspections</p>
            {stats.hasChart ? (
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.chart} layout="vertical" margin={{ left: 0, right: 16 }}>
                    <CartesianGrid horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={118} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                    <Bar dataKey="value" name="Findings" radius={[0, 4, 4, 0]} barSize={18}>
                      {stats.chart.map((d) => (
                        <Cell key={d.name} fill={d.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-6 text-sm text-slate-500">Complete a scan to see findings here.</p>
            )}
          </section>

          <Link to="/inspections/new" className="card group flex items-center gap-4 p-5 transition-colors hover:border-teal-300">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-teal-700 text-white">
              <FilePlus2 className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="font-semibold text-slate-900">Start a new inspection</p>
              <p className="text-sm text-slate-500">Upload package photos and run AI screening</p>
            </div>
            <ArrowRight className="h-5 w-5 text-slate-400 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
