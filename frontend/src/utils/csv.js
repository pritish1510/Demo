import { categoryLabel, resultStatusMeta } from './statusUtils';
import { formatDate, formatPct } from './format';
import { reviewLabel } from '../components/ReviewChip';

const cell = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Rule-wise findings as CSV (opens in Excel). Generated client-side — no backend needed. */
export function downloadResultsCsv(inspection, report) {
  const header = [
    ['Inspection ID', report.inspectionCode ?? inspection.inspectionCode],
    ['Product Name', report.productName ?? inspection.productName],
    ['Category', categoryLabel(report.category ?? inspection.category)],
    ['Inspection Date', formatDate(inspection.createdAt)],
    ['Overall Result', resultStatusMeta(report.overallStatus).label],
    [],
  ];
  const columns = ['Declaration', 'Rule ID', 'Extracted Value', 'AI Screening Result', 'Confidence', 'Evidence Text', 'Inspector Review', 'Corrected Value', 'Inspector Note'];
  const rows = report.results.map((r) => [
    r.fieldName,
    r.ruleId,
    r.extractedValue,
    resultStatusMeta(r.status).label,
    formatPct(r.confidence),
    r.evidenceText,
    reviewLabel(r.review),
    r.review?.correctedValue,
    r.review?.note,
  ]);

  const csv = [...header, columns, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.inspectionCode ?? inspection.inspectionCode}-screening-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
