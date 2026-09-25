import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Info, Search, X } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import StatCard from '../components/StatCard';
import RuleResultTable from '../components/RuleResultTable';
import EvidenceViewer from '../components/EvidenceViewer';
import ReviewPanel from '../components/ReviewPanel';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getInspection, getResults, saveReview } from '../services/inspectionApi';
import { isMockMode, resolveAssetUrl } from '../services/settings';
import { categoryLabel, contextLabel, needsReview, originLabel, RESULT_STATUS } from '../utils/statusUtils';
import { errorMessage, formatDate } from '../utils/format';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'review', label: 'Needs review' },
  { key: 'pass', label: 'Pass' },
];

export default function InspectionResults() {
  const { id } = useParams();
  const toast = useToast();
  const [ins, setIns] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [openRuleId, setOpenRuleId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([getInspection(id), getResults(id)])
      .then(([i, r]) => {
        setIns(i);
        setData(r);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);
  useEffect(load, [load]);

  const visible = useMemo(() => {
    if (!data) return [];
    if (filter === 'review') return data.results.filter(needsReview);
    if (filter === 'pass') return data.results.filter((r) => r.status === 'PASS');
    return data.results;
  }, [data, filter]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Loading screening results…" />;

  const { summary } = data;
  const flagged = data.results.filter(needsReview);
  const reviewed = flagged.filter((r) => r.review).length;
  const openIndex = visible.findIndex((r) => r.ruleId === openRuleId);
  const open = openIndex >= 0 ? visible[openIndex] : null;

  const imageFor = (r) => {
    const url = r.imageUrl ?? ins.images.find((img) => img.id === r.imageId)?.imageUrl ?? (r.bbox ? ins.images[0]?.imageUrl : null);
    return resolveAssetUrl(url);
  };

  const handleSave = async (review) => {
    setSaving(true);
    try {
      const res = await saveReview(id, open.ruleId, review);
      const saved = res?.review ?? { ...review, reviewedAt: new Date().toISOString() };
      setData((d) => ({ ...d, results: d.results.map((r) => (r.ruleId === open.ruleId ? { ...r, review: saved } : r)) }));
      toast(`Review saved for ${open.fieldName}`);
      // Move to the next finding that still needs attention.
      const next = visible.slice(openIndex + 1).find((r) => needsReview(r) && !r.review);
      setOpenRuleId(next?.ruleId ?? null);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-sm font-medium text-slate-500">Inspection: {data.inspectionCode ?? ins.inspectionCode}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{data.productName ?? ins.productName}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
              <span>Category: {categoryLabel(data.category ?? ins.category)}</span>
              {ins.contextType && <span>Context: {contextLabel(ins.contextType)}</span>}
              {ins.originType && <span>Origin: {originLabel(ins.originType)}</span>}
              <span>Date: {formatDate(ins.createdAt)}</span>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Overall Status</span>
              <StatusBadge status={data.overallStatus} size="lg" />
            </div>
            <Link to={`/inspections/${id}/report`} className="btn-primary">
              <FileText className="h-4 w-4" /> Open Report
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          <strong className="font-semibold">AI Screening Result.</strong> Each row is an evidence-based finding for inspector review, not a legal determination.
          {isMockMode() && ' Demo mode: results are sample data and do not reflect uploaded images.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pass" value={summary.pass} icon={CheckCircle2} tone="emerald" accent={RESULT_STATUS.PASS.box} />
        <StatCard label="Potential Shortfall" value={summary.potentialShortfall} icon={AlertTriangle} tone="orange" accent={RESULT_STATUS.POTENTIAL_SHORTFALL.box} />
        <StatCard
          label="Review Required"
          value={summary.reviewRequired + (summary.lowConfidence ?? 0)}
          icon={Search}
          tone="yellow"
          accent={RESULT_STATUS.REVIEW_REQUIRED.box}
          hint={summary.lowConfidence ? `incl. ${summary.lowConfidence} low confidence` : undefined}
        />
        <StatCard
          label="Inspector Reviewed"
          value={`${reviewed}/${flagged.length}`}
          icon={ClipboardCheck}
          tone="teal"
          hint={flagged.length === 0 ? 'Nothing flagged' : reviewed === flagged.length ? 'All flagged findings reviewed' : `${flagged.length - reviewed} remaining`}
        />
      </div>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-900">Rule-wise findings</h2>
          <div className="flex rounded-lg bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${filter === f.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                {f.label}
                {f.key === 'review' && flagged.length > 0 && <span className="ml-1.5 text-xs text-slate-500">{flagged.length}</span>}
              </button>
            ))}
          </div>
        </div>
        {visible.length ? (
          <RuleResultTable results={visible} onOpen={(r) => setOpenRuleId(r.ruleId)} />
        ) : (
          <p className="px-5 py-10 text-center text-sm text-slate-500">No findings in this view.</p>
        )}
      </section>

      {open && (
        <EvidenceModal
          result={open}
          imageUrl={imageFor(open)}
          position={`${openIndex + 1} of ${visible.length}`}
          onPrev={openIndex > 0 ? () => setOpenRuleId(visible[openIndex - 1].ruleId) : null}
          onNext={openIndex < visible.length - 1 ? () => setOpenRuleId(visible[openIndex + 1].ruleId) : null}
          onClose={() => setOpenRuleId(null)}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </div>
  );
}

function EvidenceModal({ result, imageUrl, position, onPrev, onNext, onClose, onSave, saving }) {
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose, onPrev, onNext]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Evidence for ${result.fieldName}`} className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <p className="text-sm font-semibold text-slate-900">Evidence Review</p>
          <div className="flex items-center gap-1">
            <span className="mr-2 text-xs text-slate-500">{position}</span>
            <button className="btn-ghost p-1.5" onClick={onPrev} disabled={!onPrev} aria-label="Previous finding">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button className="btn-ghost p-1.5" onClick={onNext} disabled={!onNext} aria-label="Next finding">
              <ChevronRight className="h-5 w-5" />
            </button>
            <button className="btn-ghost ml-1 p-1.5" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1.1fr_1fr]">
          <div className="border-b border-slate-200 bg-slate-50 p-5 md:border-r md:border-b-0">
            <EvidenceViewer imageUrl={imageUrl} bbox={result.bbox} status={result.status} fieldName={result.fieldName} />
          </div>
          <div className="p-5">
            <ReviewPanel result={result} onSave={onSave} saving={saving} />
          </div>
        </div>
      </div>
    </div>
  );
}
