// Single source of truth for status labels and colours.
// Wording rule: these are AI screening flags for an inspector, never legal determinations.

export const RESULT_STATUS = {
  PASS: {
    label: 'Pass',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    dot: 'bg-emerald-500',
    box: '#10b981',
    chart: '#10b981',
  },
  POTENTIAL_SHORTFALL: {
    label: 'Potential Shortfall',
    badge: 'bg-orange-50 text-orange-700 ring-orange-600/25',
    dot: 'bg-orange-500',
    box: '#f97316',
    chart: '#f97316',
  },
  REVIEW_REQUIRED: {
    label: 'Review Required',
    badge: 'bg-yellow-50 text-yellow-800 ring-yellow-600/30',
    dot: 'bg-yellow-500',
    box: '#eab308',
    chart: '#eab308',
  },
  LOW_CONFIDENCE: {
    label: 'Low Confidence',
    badge: 'bg-red-50 text-red-700 ring-red-600/20',
    dot: 'bg-red-500',
    box: '#ef4444',
    chart: '#ef4444',
  },
  NOT_APPLICABLE: {
    label: 'Not Applicable',
    badge: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    dot: 'bg-slate-400',
    box: '#94a3b8',
    chart: '#94a3b8',
  },
};

export const INSPECTION_STATUS = {
  CREATED: { label: 'Draft', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400' },
  UPLOADED: { label: 'Uploaded', badge: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500' },
  PROCESSING: { label: 'Processing', badge: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20', dot: 'bg-indigo-500' },
  COMPLETED: { label: 'Completed', badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500' },
  REVIEW_REQUIRED: { label: 'Review Required', badge: 'bg-yellow-50 text-yellow-800 ring-yellow-600/30', dot: 'bg-yellow-500' },
  FAILED: { label: 'Failed', badge: 'bg-red-50 text-red-700 ring-red-600/20', dot: 'bg-red-500' },
};

const FALLBACK = { label: 'Unknown', badge: 'bg-slate-100 text-slate-600 ring-slate-500/20', dot: 'bg-slate-400', box: '#94a3b8', chart: '#94a3b8' };

export const resultStatusMeta = (s) => RESULT_STATUS[s] ?? { ...FALLBACK, label: humanize(s) };
export const inspectionStatusMeta = (s) => INSPECTION_STATUS[s] ?? { ...FALLBACK, label: humanize(s) };

export const TERMINAL_STATUSES = ['COMPLETED', 'REVIEW_REQUIRED'];

/** Findings the inspector should look at before signing off. */
export const needsReview = (r) =>
  r.needsInspectorReview || ['POTENTIAL_SHORTFALL', 'REVIEW_REQUIRED', 'LOW_CONFIDENCE'].includes(r.status);

export const CATEGORIES = [
  { value: 'FOOD', label: 'Food' },
  { value: 'COSMETICS', label: 'Cosmetics' },
  { value: 'BEVERAGES', label: 'Beverages' },
  { value: 'APPAREL', label: 'Apparel' },
  { value: 'IMPORTED_GOODS', label: 'Imported Goods' },
  { value: 'GENERAL_PACKAGED_GOODS', label: 'General Packaged Goods' },
  { value: 'ECOMMERCE_LISTING', label: 'E-commerce Listing' },
];

export const CONTEXT_TYPES = [
  { value: 'RETAIL_PACKAGE', label: 'Retail Package' },
  { value: 'BULK_INSTITUTIONAL', label: 'Bulk / Institutional' },
  { value: 'ECOMMERCE_LISTING', label: 'E-commerce Listing' },
];

export const ORIGIN_TYPES = [
  { value: 'INDIAN', label: 'Indian Product' },
  { value: 'IMPORTED', label: 'Imported Product' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

const lookup = (list, v) => list.find((o) => o.value === v)?.label ?? humanize(v);
export const categoryLabel = (v) => lookup(CATEGORIES, v);
export const contextLabel = (v) => lookup(CONTEXT_TYPES, v);
export const originLabel = (v) => lookup(ORIGIN_TYPES, v);

export function humanize(v) {
  if (!v) return '—';
  return String(v)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Where an inspection row should take the inspector next. */
export function inspectionLink(ins) {
  if (TERMINAL_STATUSES.includes(ins.status)) return { to: `/inspections/${ins.id}/results`, label: 'View results' };
  if (ins.status === 'PROCESSING') return { to: `/inspections/${ins.id}/scan`, label: 'View progress' };
  return { to: `/inspections/${ins.id}/scan`, label: 'Resume' };
}

/** Summary from the API when present, otherwise counted from results. */
export function computeSummary(results = [], apiSummary) {
  const counted = { pass: 0, potentialShortfall: 0, reviewRequired: 0, lowConfidence: 0, notApplicable: 0 };
  for (const r of results) {
    if (r.status === 'PASS') counted.pass++;
    else if (r.status === 'POTENTIAL_SHORTFALL') counted.potentialShortfall++;
    else if (r.status === 'REVIEW_REQUIRED') counted.reviewRequired++;
    else if (r.status === 'LOW_CONFIDENCE') counted.lowConfidence++;
    else if (r.status === 'NOT_APPLICABLE') counted.notApplicable++;
  }
  return results.length ? counted : { ...counted, ...apiSummary };
}
