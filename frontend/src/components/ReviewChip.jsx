import { CheckCircle2, PencilLine, XCircle } from 'lucide-react';

const META = {
  CONFIRM: { label: 'Confirmed', icon: CheckCircle2, cls: 'text-emerald-700' },
  EDIT: { label: 'Corrected', icon: PencilLine, cls: 'text-sky-700' },
  MARK_INCORRECT: { label: 'Marked incorrect', icon: XCircle, cls: 'text-red-700' },
};

export const reviewLabel = (review) => (review ? META[review.action]?.label ?? 'Reviewed' : 'Pending');

export default function ReviewChip({ review }) {
  const meta = META[review?.action];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${meta.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {meta.label}
    </span>
  );
}
