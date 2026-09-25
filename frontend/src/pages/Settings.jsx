import { useState } from 'react';
import { CheckCircle2, Database, Loader2, RotateCcw, Server, XCircle } from 'lucide-react';
import axios from 'axios';
import { useToast } from '../components/Toast';
import { getSettings, saveSettings } from '../services/settings';
import { resetDemoData } from '../services/mockBackend';
import { errorMessage } from '../utils/format';

const ENDPOINTS = [
  ['GET', '/api/inspections', 'List (dashboard, history)'],
  ['POST', '/api/inspections', 'Create inspection'],
  ['POST', '/api/inspections/{id}/images', 'Upload images (multipart "files")'],
  ['POST', '/api/inspections/{id}/scan', 'Start scan'],
  ['GET', '/api/inspections/{id}', 'Status (polled)'],
  ['GET', '/api/inspections/{id}/results', 'Results'],
  ['PATCH', '/api/inspections/{id}/results/{ruleId}/review', 'Save inspector review'],
  ['GET', '/api/inspections/{id}/report/pdf', 'PDF report'],
  ['GET', '/api/health', 'Health + OCR engine status'],
];

export default function Settings() {
  const toast = useToast();
  const initial = getSettings();
  const [dataSource, setDataSource] = useState(initial.dataSource);
  const [apiBaseUrl, setApiBaseUrl] = useState(initial.apiBaseUrl);
  const [test, setTest] = useState(null); // null | 'busy' | {ok, message}

  const save = () => {
    saveSettings({ dataSource, apiBaseUrl: apiBaseUrl.trim() });
    // Reload so every page re-reads data from the new source.
    window.location.reload();
  };

  const testConnection = async () => {
    setTest('busy');
    try {
      const base = apiBaseUrl.trim();
      const { data } = await axios.get(`${base}/api/inspections`, { timeout: 8000 });
      const count = Array.isArray(data) ? data.length : data?.content?.length;
      const health = await axios.get(`${base}/api/health`, { timeout: 8000 }).then((r) => r.data).catch(() => null);
      const ai = !health?.aiEngine
        ? ''
        : health.aiEngine === 'down'
          ? ` · AI engine not reachable at ${health.aiEngineUrl} (scans will need manual review)`
          : health.ocr === 'unavailable'
            ? ' · AI engine running, but Tesseract is not installed (scans will need manual review)'
            : ` · AI engine: ${health.ocr}`;
      setTest({ ok: true, message: `Connected${count != null ? ` — ${count} inspection(s) returned` : ''}${ai}` });
    } catch (e) {
      setTest({ ok: false, message: errorMessage(e) });
    }
  };

  const option = (value, Icon, title, desc) => (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
        dataSource === value ? 'border-teal-600 bg-teal-50/60 ring-1 ring-teal-600' : 'border-slate-300 hover:bg-slate-50'
      }`}
    >
      <input type="radio" name="ds" className="sr-only" checked={dataSource === value} onChange={() => setDataSource(value)} />
      <Icon className="mt-0.5 h-5 w-5 text-teal-700" />
      <span>
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{desc}</span>
      </span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-6">
      <section className="card p-6">
        <h2 className="font-semibold text-slate-900">Data source</h2>
        <p className="text-sm text-slate-500">Build and demo the UI on dummy data, then switch to the backend without code changes.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {option('mock', Database, 'Demo data', 'Built-in sample inspections, stored in this browser')}
          {option('api', Server, 'Live API', 'Calls the VeriMetrix backend REST API')}
        </div>

        {dataSource === 'api' && (
          <div className="mt-5">
            <label className="label" htmlFor="api">
              API base URL
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input id="api" className="input font-mono" placeholder="(empty = same origin via dev proxy)" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
              <button className="btn-secondary shrink-0" onClick={testConnection} disabled={test === 'busy'}>
                {test === 'busy' && <Loader2 className="h-4 w-4 animate-spin" />} Test connection
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Leave empty in development — Vite proxies <code>/api</code> to <code>VITE_PROXY_TARGET</code> (default http://localhost:8080). Otherwise e.g.{' '}
              <code>http://192.168.1.20:8080</code> (backend must allow CORS).
            </p>
            {test && test !== 'busy' && (
              <p className={`mt-2 flex items-center gap-1.5 text-sm ${test.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                {test.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />} {test.message}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button className="btn-primary" onClick={save}>
            Save & reload
          </button>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold text-slate-900">API contract</h2>
        <p className="text-sm text-slate-500">Endpoints this frontend calls, all served by the VeriMetrix backend.</p>
        <ul className="mt-4 divide-y divide-slate-100 overflow-x-auto">
          {ENDPOINTS.map(([method, path, desc]) => (
            <li key={method + path} className="flex items-center gap-3 py-2.5 text-sm">
              <span className="w-14 shrink-0 font-mono text-xs font-semibold text-teal-700">{method}</span>
              <code className="font-mono text-[13px] whitespace-nowrap text-slate-800">{path}</code>
              <span className="ml-auto hidden whitespace-nowrap text-slate-500 sm:inline">{desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card flex flex-wrap items-center justify-between gap-3 p-6">
        <div>
          <h2 className="font-semibold text-slate-900">Reset demo data</h2>
          <p className="text-sm text-slate-500">Restore the sample inspections and discard demo changes.</p>
        </div>
        <button
          className="btn-secondary"
          onClick={() => {
            resetDemoData();
            toast('Demo data reset');
          }}
        >
          <RotateCcw className="h-4 w-4" /> Reset
        </button>
      </section>
    </div>
  );
}
