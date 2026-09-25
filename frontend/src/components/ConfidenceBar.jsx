import { formatPct, toFraction } from '../utils/format';

export default function ConfidenceBar({ value }) {
  const f = toFraction(value);
  if (f == null) return <span className="text-sm text-slate-400">—</span>;
  const color = f >= 0.85 ? 'bg-emerald-500' : f >= 0.65 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.round(f * 100)}%` }} />
      </div>
      <span className="w-9 text-sm font-medium text-slate-700 tabular-nums">{formatPct(f)}</span>
    </div>
  );
}
