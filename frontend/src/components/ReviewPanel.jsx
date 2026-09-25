import { useEffect, useState } from 'react';
import { Check, Loader2, PencilLine, X } from 'lucide-react';
import StatusBadge from './StatusBadge';
import ConfidenceBar from './ConfidenceBar';
import ReviewChip from './ReviewChip';
import { formatDateTime } from '../utils/format';

/** Right-hand side of the evidence modal: finding details + inspector correction. */
export default function ReviewPanel({ result, onSave, saving }) {
  const [action, setAction] = useState(null);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    setAction(result.review?.action ?? null);
    setValue(result.review?.correctedValue ?? result.extractedValue ?? '');
    setNote(result.review?.note ?? '');
  }, [result]);

  const editing = action === 'EDIT';
  const canSave = action && (!editing || value.trim()) && !saving;

  const submit = () => {
    if (!canSave) return;
    onSave({
      action,
      correctedValue: editing ? value.trim() : null,
      note: note.trim() || null,
    });
  };

  const choice = (key, label, Icon, active) => (
    <button
      type="button"
      onClick={() => setAction(key)}
      className={`btn flex-1 border px-3 ${active ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">AI Screening Result</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-slate-900">{result.fieldName}</h3>
            <StatusBadge status={result.status} />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-4 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-slate-500">Extracted text</dt>
            <dd className="mt-0.5 font-mono text-[13px] break-words text-slate-900">{result.evidenceText ?? result.extractedValue ?? 'Not detected'}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Confidence</dt>
            <dd className="mt-1">
              <ConfidenceBar value={result.confidence} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rule</dt>
            <dd className="mt-0.5 font-mono text-[12px] break-all text-slate-700">{result.ruleId}</dd>
          </div>
        </dl>

        {result.review && (
          <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-500">
            <ReviewChip review={result.review} />
            <span>
              {result.review.reviewedBy ?? 'Inspector'} · {formatDateTime(result.review.reviewedAt)}
            </span>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <p className="mb-2 text-sm font-medium text-slate-800">Inspector review</p>
        <div className="flex flex-wrap gap-2">
          {choice('CONFIRM', 'Confirm', Check, action === 'CONFIRM')}
          {choice('EDIT', 'Edit value', PencilLine, editing)}
          {choice('MARK_INCORRECT', 'Mark incorrect', X, action === 'MARK_INCORRECT')}
        </div>

        {editing && (
          <div className="mt-3">
            <label className="label" htmlFor="corrected">
              Corrected value
            </label>
            <input id="corrected" className="input font-mono" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            <p className="mt-1 text-xs text-slate-500">AI extracted: {result.extractedValue ?? '—'}</p>
          </div>
        )}

        <label className="label mt-3" htmlFor="note">
          Note <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="note"
          rows={2}
          className="input resize-none"
          placeholder="e.g. Month verified from batch printing on side panel"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />

        <button className="btn-primary mt-3 w-full" onClick={submit} disabled={!canSave}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save review
        </button>
      </div>
    </div>
  );
}
