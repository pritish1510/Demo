import { Eye } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ConfidenceBar from './ConfidenceBar';
import ReviewChip from './ReviewChip';
import { needsReview } from '../utils/statusUtils';

export default function RuleResultTable({ results, onOpen }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px]">
        <thead className="border-b border-slate-200 bg-slate-50/80">
          <tr>
            <th className="th">Declaration</th>
            <th className="th">Extracted value</th>
            <th className="th">Status</th>
            <th className="th">Confidence</th>
            <th className="th">Evidence</th>
            <th className="th text-right">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {results.map((r) => {
            const flagged = needsReview(r);
            const corrected = r.review?.action === 'EDIT' && r.review.correctedValue;
            return (
              <tr key={r.ruleId} className={`hover:bg-slate-50/70 ${flagged && !r.review ? 'bg-amber-50/30' : ''}`}>
                <td className="td">
                  <p className="font-medium text-slate-900">{r.fieldName}</p>
                  <p className="font-mono text-[11px] text-slate-400">{r.ruleId}</p>
                </td>
                <td className="td max-w-[260px]">
                  {corrected ? (
                    <>
                      <p className="truncate text-slate-400 line-through">{r.extractedValue}</p>
                      <p className="truncate font-medium text-slate-900">{r.review.correctedValue}</p>
                    </>
                  ) : (
                    <p className="truncate" title={r.extractedValue ?? ''}>
                      {r.extractedValue ?? <span className="text-slate-400">Not detected</span>}
                    </p>
                  )}
                </td>
                <td className="td">
                  <StatusBadge status={r.status} />
                </td>
                <td className="td">
                  <ConfidenceBar value={r.confidence} />
                </td>
                <td className="td">
                  <button className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-900" onClick={() => onOpen(r)}>
                    <Eye className="h-4 w-4" /> View
                  </button>
                </td>
                <td className="td text-right">
                  {r.review ? (
                    <ReviewChip review={r.review} />
                  ) : flagged ? (
                    <button className="btn-secondary px-3 py-1 text-xs" onClick={() => onOpen(r)}>
                      Review
                    </button>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
