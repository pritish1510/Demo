import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Check, Loader2, ScanLine } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import StatusBadge from '../components/StatusBadge';
import { ErrorState, Loading } from '../components/States';
import { useToast } from '../components/Toast';
import { getInspection, pollInspection, startScan, uploadImages } from '../services/inspectionApi';
import { resolveAssetUrl } from '../services/settings';
import { categoryLabel, TERMINAL_STATUSES } from '../utils/statusUtils';
import { errorMessage } from '../utils/format';

const STEPS = ['Image Quality Checked', 'Text Detection Completed', 'OCR Processing Completed', 'Legal Rule Validation'];
// The backend only reports PROCESSING, so steps advance on a time estimate and
// the last one waits for the real terminal status.
const STEP_AT_MS = [1200, 2800, 4500];

export default function ScanProgress() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [ins, setIns] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [done, setDone] = useState(false);
  const [files, setFiles] = useState([]);
  const [starting, setStarting] = useState(false);
  const startedAt = useRef(null);

  const load = useCallback(() => {
    setLoadError(null);
    getInspection(id)
      .then((data) => {
        if (TERMINAL_STATUSES.includes(data.status)) navigate(`/inspections/${id}/results`, { replace: true });
        else setIns(data);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, [id, navigate]);
  useEffect(load, [load]);

  const processing = ins?.status === 'PROCESSING';

  useEffect(() => {
    if (!processing) return;
    setScanError(null);
    startedAt.current = Date.now();
    const clock = setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    const cancel = pollInspection(id, {
      onDone: () => {
        setDone(true);
        clearInterval(clock);
        setTimeout(() => navigate(`/inspections/${id}/results`, { replace: true }), 900);
      },
      onError: (e) => {
        clearInterval(clock);
        setScanError(errorMessage(e));
      },
    });
    return () => {
      cancel();
      clearInterval(clock);
    };
  }, [processing, id, navigate]);

  const runScan = async () => {
    setStarting(true);
    try {
      if (files.length) await uploadImages(id, files);
      await startScan(id);
      setDone(false);
      setElapsed(0);
      setIns(await getInspection(id));
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setStarting(false);
    }
  };

  if (loadError) return <ErrorState message={loadError} onRetry={load} />;
  if (!ins) return <Loading />;

  const header = (
    <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-slate-500">
      <span className="font-mono font-medium text-slate-900">{ins.inspectionCode}</span>
      <span>·</span>
      <span className="font-medium text-slate-700">{ins.productName}</span>
      <span>·</span>
      <span>{categoryLabel(ins.category)}</span>
      <StatusBadge status={ins.status} kind="inspection" />
    </div>
  );

  // Draft or uploaded-but-not-scanned: let the inspector finish the job here.
  if (!processing) {
    const needsImages = !ins.images?.length;
    return (
      <div className="mx-auto max-w-2xl">
        {header}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900">{needsImages ? 'Add package images' : 'Ready to scan'}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {needsImages
              ? 'This draft has no images yet. Add them to start screening.'
              : `${ins.images.length} image(s) uploaded. You can add more before scanning.`}
          </p>
          {!needsImages && (
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {ins.images.map((img) => (
                <img key={img.id} src={resolveAssetUrl(img.imageUrl)} alt={img.fileName} className="h-28 w-21 rounded-md object-cover ring-1 ring-slate-200" />
              ))}
            </div>
          )}
          <div className="mt-5">
            <ImageUploader files={files} onChange={setFiles} disabled={starting} />
          </div>
          {ins.status === 'FAILED' && <p className="mt-4 text-sm text-red-600">The previous scan failed. Start it again.</p>}
          <div className="mt-6 flex justify-end">
            <button className="btn-primary" onClick={runScan} disabled={starting || (needsImages && !files.length)}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
              Start scan
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeStep = done ? STEPS.length : STEP_AT_MS.filter((t) => elapsed >= t).length;
  const progress = done ? 100 : Math.min(92, (elapsed / 7000) * 100);

  return (
    <div className="mx-auto max-w-2xl">
      {header}
      <div className="card overflow-hidden">
        <div className="relative flex flex-col items-center bg-slate-900 px-6 py-10 text-center">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-slate-800 ring-1 ring-slate-700">
            {done ? <Check className="h-9 w-9 text-emerald-400" /> : <ScanLine className="h-9 w-9 text-teal-400" />}
            {!done && !scanError && <span className="absolute inset-x-2 top-2 h-0.5 animate-[scan_1.6s_ease-in-out_infinite] rounded bg-teal-400 shadow-[0_0_12px_2px_rgba(45,212,191,0.6)]" />}
          </div>
          <h2 className="mt-5 text-xl font-semibold text-white">{done ? 'Screening complete' : scanError ? 'Scan interrupted' : 'Analyzing package…'}</h2>
          <p className="mt-1 text-sm text-slate-400">{done ? 'Opening results…' : 'Reading label text and checking mandatory declarations'}</p>
        </div>

        <div className="p-6">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all duration-300 ${scanError ? 'bg-red-500' : 'bg-teal-600'}`} style={{ width: `${progress}%` }} />
          </div>

          <ol className="mt-6 space-y-3">
            {STEPS.map((label, i) => {
              const state = i < activeStep ? 'done' : i === activeStep && !scanError ? 'active' : 'pending';
              return (
                <li key={label} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      state === 'done' ? 'bg-emerald-500 text-white' : state === 'active' ? 'bg-teal-50 text-teal-700 ring-1 ring-teal-600/30' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {state === 'done' ? <Check className="h-3.5 w-3.5" /> : state === 'active' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="text-xs">{i + 1}</span>}
                  </span>
                  <span className={`text-sm ${state === 'pending' ? 'text-slate-400' : 'font-medium text-slate-800'}`}>{label}</span>
                </li>
              );
            })}
          </ol>

          {scanError && (
            <div className="mt-6 flex items-start gap-3 rounded-lg bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p>{scanError}</p>
                <div className="mt-3 flex gap-2">
                  <button className="btn-secondary px-3 py-1.5" onClick={load}>
                    Check again
                  </button>
                  <Link to="/history" className="btn-ghost px-3 py-1.5">
                    Back to history
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
