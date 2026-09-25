import { inspectionStatusMeta, resultStatusMeta } from '../utils/statusUtils';

/** kind="result" for rule findings, kind="inspection" for inspection lifecycle. */
export default function StatusBadge({ status, kind = 'result', size = 'sm' }) {
  const meta = kind === 'inspection' ? inspectionStatusMeta(status) : resultStatusMeta(status);
  const sizing = size === 'lg' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs';
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ring-1 ring-inset ${meta.badge} ${sizing}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot} ${status === 'PROCESSING' ? 'animate-pulse' : ''}`} />
      {meta.label}
    </span>
  );
}
