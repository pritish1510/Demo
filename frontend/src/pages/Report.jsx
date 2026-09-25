import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileSpreadsheet, Loader2, Printer, ShieldCheck } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { reviewLabel } from '../components/ReviewChip';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { downloadReportPdf, getInspection, getResults } from '../services/inspectionApi';
import { categoryLabel, contextLabel, originLabel } from '../utils/statusUtils';
import { errorMessage, formatDate, formatDateTime, formatPct } from '../utils/format';
import { downloadResultsCsv } from '../utils/csv';

export default function Report() {
  const { id } = useParams();
  const toast = useToast();
  const [ins, setIns] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

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

  const pdf = async () => {
    setPdfBusy(true);
    try {
      const blob = await downloadReportPdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ins.inspectionCode}-screening-report.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      // Backend PDF not available yet — the browser's print dialog can save as PDF.
      toast(e.code === 'PDF_UNAVAILABLE' || e.response?.status === 404 ? 'Server PDF not available yet — choose "Save as PDF" in the print dialog.' : errorMessage(e), 'info');
      setTimeout(() => window.print(), 400);
    } finally {
      setPdfBusy(false);
    }
  };

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <Loading label="Preparing report…" />;

  const { summary } = data;
  const meta = [
    ['Inspection ID', data.inspectionCode ?? ins.inspectionCode],
    ['Product Name', data.productName ?? ins.productName],
    ['Category', categoryLabel(data.category ?? ins.category)],
    ['Inspection Date', formatDate(ins.createdAt)],
    ['Context', contextLabel(ins.contextType)],
    ['Origin', originLabel(ins.originType)],
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/inspections/${id}/results`} className="btn-ghost px-2">
          <ArrowLeft className="h-4 w-4" /> Back to results
        </Link>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={pdf} disabled={pdfBusy}>
            {pdfBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Download PDF
          </button>
          <button className="btn-secondary" onClick={() => downloadResultsCsv(ins, data)}>
            <FileSpreadsheet className="h-4 w-4" /> Download CSV/Excel
          </button>
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print Report
          </button>
        </div>
      </div>

      <article className="card p-6 sm:p-10 print:border-0 print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-900 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-teal-700" />
              <span className="text-lg font-bold tracking-[0.2em] text-slate-900">VERIMETRIX</span>
            </div>
            <h1 className="mt-2 text-xl font-semibold text-slate-800">Packaging Compliance Screening Report</h1>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>Generated</p>
            <p className="font-medium text-slate-700">{formatDateTime(new Date())}</p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-3">
          {meta.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium tracking-wide text-slate-500 uppercase">{k}</dt>
              <dd className={`mt-0.5 text-sm text-slate-900 ${k === 'Inspection ID' ? 'font-mono' : ''}`}>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 grid grid-cols-1 gap-4 rounded-lg bg-slate-50 p-4 sm:grid-cols-[auto_1fr] sm:items-center print:border print:border-slate-300 print:bg-white">
          <div>
            <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">Overall Result</p>
            <div className="mt-1">
              <StatusBadge status={data.overallStatus} size="lg" />
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm sm:justify-end">
            <span>
              Pass: <strong>{summary.pass}</strong>
            </span>
            <span>
              Potential Shortfall: <strong>{summary.potentialShortfall}</strong>
            </span>
            <span>
              Review Required: <strong>{summary.reviewRequired}</strong>
            </span>
            {summary.lowConfidence > 0 && (
              <span>
                Low Confidence: <strong>{summary.lowConfidence}</strong>
              </span>
            )}
          </div>
        </div>

        <h2 className="mt-8 mb-3 text-sm font-semibold tracking-wide text-slate-900 uppercase">Rule-wise Findings</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-y border-slate-300 bg-slate-50 print:bg-white">
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Declaration</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Extracted Value</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">AI Screening Result</th>
                <th className="px-3 py-2 text-right font-semibold text-slate-700">Conf.</th>
                <th className="px-3 py-2 text-left font-semibold text-slate-700">Inspector Review</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((r) => (
                <tr key={r.ruleId} className="border-b border-slate-200 align-top break-inside-avoid">
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-slate-900">{r.fieldName}</p>
                    <p className="font-mono text-[10.5px] text-slate-500">{r.ruleId}</p>
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {r.review?.action === 'EDIT' ? (
                      <>
                        <span className="text-slate-400 line-through">{r.extractedValue}</span>
                        <br />
                        {r.review.correctedValue}
                      </>
                    ) : (
                      r.extractedValue ?? '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatPct(r.confidence)}</td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {reviewLabel(r.review)}
                    {r.review?.note && <p className="text-xs text-slate-500">{r.review.note}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-12 grid grid-cols-2 gap-10 break-inside-avoid">
          {['Inspector Name & Signature', 'Date'].map((l) => (
            <div key={l}>
              <div className="h-10 border-b border-slate-400" />
              <p className="mt-1 text-xs text-slate-500">{l}</p>
            </div>
          ))}
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-4 text-[11px] leading-relaxed text-slate-500">
          This report contains AI screening results generated from package images. Findings marked Potential Shortfall or Review Required are
          evidence-based flags requiring inspector review; they are not a legal determination of non-compliance.
        </footer>
      </article>
    </div>
  );
}
