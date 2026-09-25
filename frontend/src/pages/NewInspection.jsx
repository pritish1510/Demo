import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Loader2, ScanLine, Sparkles } from 'lucide-react';
import ImageUploader from '../components/ImageUploader';
import { useToast } from '../components/Toast';
import { createInspection, startScan, uploadImages } from '../services/inspectionApi';
import { CATEGORIES, CONTEXT_TYPES, ORIGIN_TYPES } from '../utils/statusUtils';
import { errorMessage } from '../utils/format';
import { loadSampleFiles } from '../utils/sampleFiles';

const EMPTY = { productName: '', category: '', contextType: 'RETAIL_PACKAGE', originType: 'INDIAN' };

const SCREENED = ['Manufacturer / packer name & address', 'Common or generic name', 'Net quantity', 'MRP (incl. of all taxes)', 'Month & year of packing', 'Consumer care details', 'Country of origin (imports)'];

export default function NewInspection() {
  const navigate = useNavigate();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(null); // null | { kind, step }
  const [loadingSample, setLoadingSample] = useState(false);
  // Once created, retries reuse the same inspection instead of creating duplicates.
  const created = useRef(null);
  const uploadedFor = useRef(null);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: undefined }));
    created.current = null;
  };

  const validate = (needImages) => {
    const er = {};
    if (!form.productName.trim()) er.productName = 'Product name is required';
    if (!form.category) er.category = 'Select a category';
    if (needImages && !files.length) er.files = 'Add at least one package image to start the inspection';
    setErrors(er);
    return !Object.keys(er).length;
  };

  const ensureCreatedAndUploaded = async (kind) => {
    if (!created.current) {
      setBusy({ kind, step: 'Creating inspection…' });
      created.current = await createInspection({ ...form, productName: form.productName.trim() });
    }
    const id = created.current.id;
    if (files.length && uploadedFor.current !== files) {
      setBusy({ kind, step: `Uploading ${files.length} image${files.length > 1 ? 's' : ''}…` });
      await uploadImages(id, files);
      uploadedFor.current = files;
    }
    return created.current;
  };

  const saveDraft = async () => {
    if (!validate(false)) return;
    try {
      const ins = await ensureCreatedAndUploaded('draft');
      toast(`Draft ${ins.inspectionCode} saved`);
      navigate('/history');
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
    }
  };

  const start = async (e) => {
    e.preventDefault();
    if (!validate(true)) return;
    try {
      const ins = await ensureCreatedAndUploaded('start');
      setBusy({ kind: 'start', step: 'Starting scan…' });
      await startScan(ins.id);
      navigate(`/inspections/${ins.id}/scan`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setBusy(null);
    }
  };

  const useSample = async () => {
    setLoadingSample(true);
    try {
      setFiles(await loadSampleFiles());
      setForm({ productName: 'Sample Biscuit', category: 'FOOD', contextType: 'RETAIL_PACKAGE', originType: 'INDIAN' });
      setErrors({});
      created.current = null;
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setLoadingSample(false);
    }
  };

  const disabled = Boolean(busy);

  return (
    <form onSubmit={start} className="grid grid-cols-1 gap-6 lg:grid-cols-3" noValidate>
      <div className="space-y-6 lg:col-span-2">
        <section className="card p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">Product details</h2>
              <p className="text-sm text-slate-500">Used to select the applicable labelling rules.</p>
            </div>
            <button type="button" className="btn-ghost px-3 py-1.5 text-teal-700" onClick={useSample} disabled={disabled || loadingSample}>
              {loadingSample ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Use sample product
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="productName">
                Product Name <span className="text-red-600">*</span>
              </label>
              <input
                id="productName"
                className={`input ${errors.productName ? 'border-red-400' : ''}`}
                placeholder="e.g. Cream Biscuits 200 g"
                value={form.productName}
                onChange={set('productName')}
                disabled={disabled}
              />
              {errors.productName && <p className="mt-1 text-xs text-red-600">{errors.productName}</p>}
            </div>
            <div>
              <label className="label" htmlFor="category">
                Category <span className="text-red-600">*</span>
              </label>
              <select id="category" className={`input ${errors.category ? 'border-red-400' : ''}`} value={form.category} onChange={set('category')} disabled={disabled}>
                <option value="">Select category</option>
                {CATEGORIES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {errors.category && <p className="mt-1 text-xs text-red-600">{errors.category}</p>}
            </div>
            <div>
              <label className="label" htmlFor="contextType">
                Context Type
              </label>
              <select id="contextType" className="input" value={form.contextType} onChange={set('contextType')} disabled={disabled}>
                {CONTEXT_TYPES.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <span className="label">Origin Type</span>
              <div className="grid grid-cols-3 gap-2">
                {ORIGIN_TYPES.map((o) => (
                  <label
                    key={o.value}
                    className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      form.originType === o.value ? 'border-teal-600 bg-teal-50 text-teal-800' : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <input type="radio" name="originType" value={o.value} checked={form.originType === o.value} onChange={set('originType')} className="sr-only" disabled={disabled} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="font-semibold text-slate-900">Package images</h2>
          <p className="mb-4 text-sm text-slate-500">Upload every panel that carries a declaration — usually front and back.</p>
          <ImageUploader
            files={files}
            onChange={(f) => {
              setFiles(f);
              setErrors((er) => ({ ...er, files: undefined }));
            }}
            disabled={disabled}
          />
          {errors.files && <p className="mt-2 text-sm text-red-600">{errors.files}</p>}
        </section>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="btn-secondary" onClick={saveDraft} disabled={disabled}>
            {busy?.kind === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Draft
          </button>
          <button type="submit" className="btn-primary min-w-[180px]" disabled={disabled}>
            {busy?.kind === 'start' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {busy?.kind === 'start' ? busy.step : 'Start Inspection'}
          </button>
        </div>
      </div>

      <aside className="space-y-6">
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900">Declarations screened</h3>
          <ul className="mt-3 space-y-2">
            {SCREENED.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" /> {s}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900">For best OCR accuracy</h3>
          <ul className="mt-3 list-disc space-y-1.5 pl-4 text-sm text-slate-600">
            <li>Photograph each panel flat, filling the frame.</li>
            <li>Avoid glare on glossy or metallic packs.</li>
            <li>Keep small print (MRP, dates) in sharp focus.</li>
          </ul>
        </section>
      </aside>
    </form>
  );
}
