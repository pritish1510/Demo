const pad = (n) => String(n).padStart(2, '0');

/** DD/MM/YYYY, as used on the screening report. */
export function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Confidence arrives as 0–1 (0.96); tolerate 0–100 too. */
export function toFraction(confidence) {
  if (confidence == null || confidence === '') return null; // Number(null) would be 0 → "0%"
  const n = Number(confidence);
  if (!Number.isFinite(n)) return null;
  return n > 1 ? n / 100 : n;
}

export function formatPct(confidence) {
  const f = toFraction(confidence);
  return f == null ? '—' : `${Math.round(f * 100)}%`;
}

/** "[120,450,340,490]" or [120,450,340,490] → {x1,y1,x2,y2}; null when absent or malformed. */
export function parseBoundingBox(value) {
  if (!value) return null;
  let arr = value;
  if (typeof value === 'string') {
    try {
      arr = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr) || arr.length !== 4 || arr.some((n) => !Number.isFinite(Number(n)))) return null;
  const [x1, y1, x2, y2] = arr.map(Number);
  return { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) };
}

export function errorMessage(err) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    (err?.code === 'ERR_NETWORK' ? 'Cannot reach the backend. Check the API URL in Settings.' : null) ||
    err?.message ||
    'Something went wrong'
  );
}
