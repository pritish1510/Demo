// All backend calls go through here. Pages never touch axios or the mock directly,
// so switching Demo ⇄ Live API (Settings page) needs no component changes.
import axios from 'axios';
import * as mock from './mockBackend';
import { getSettings, isMockMode } from './settings';
import { computeSummary, TERMINAL_STATUSES } from '../utils/statusUtils';
import { parseBoundingBox, toFraction } from '../utils/format';

function http() {
  return axios.create({ baseURL: getSettings().apiBaseUrl || '', timeout: 30000 });
}

// ---- Normalizers: keep the contract's field names, tolerate small backend variations ----

export function normalizeInspection(raw = {}) {
  return {
    ...raw,
    id: raw.id,
    inspectionCode: raw.inspectionCode ?? raw.code ?? `INS-${raw.id}`,
    productName: raw.productName ?? '',
    category: raw.category,
    contextType: raw.contextType,
    originType: raw.originType,
    status: raw.status ?? 'CREATED',
    createdAt: raw.createdAt ?? raw.inspectionDate ?? raw.updatedAt ?? null,
    images: raw.images ?? raw.uploadedImages ?? [],
    summary: raw.summary ?? null,
  };
}

function normalizeResult(r = {}) {
  return {
    ...r,
    ruleId: r.ruleId,
    fieldName: r.fieldName ?? r.ruleId,
    status: r.status,
    extractedValue: r.extractedValue ?? null,
    confidence: toFraction(r.confidence),
    evidenceText: r.evidenceText ?? null,
    bbox: parseBoundingBox(r.evidenceBoundingBox),
    needsInspectorReview: Boolean(r.needsInspectorReview),
    review: r.review ?? null,
  };
}

export function normalizeResults(raw = {}) {
  const results = (raw.results ?? []).map(normalizeResult);
  return {
    ...raw,
    inspectionCode: raw.inspectionCode ?? raw.inspectionId,
    overallStatus: raw.overallStatus,
    summary: computeSummary(results, raw.summary),
    results,
  };
}

const unwrapList = (data) => (Array.isArray(data) ? data : data?.content ?? data?.items ?? data?.data ?? []);

// ---- Contract endpoints ----

/** GET /api/inspections — not in the original contract; needed for Dashboard & History. */
export async function listInspections() {
  const data = isMockMode() ? await mock.listInspections() : (await http().get('/api/inspections')).data;
  return unwrapList(data).map(normalizeInspection);
}

/** POST /api/inspections */
export async function createInspection(payload) {
  const data = isMockMode() ? await mock.createInspection(payload) : (await http().post('/api/inspections', payload)).data;
  return normalizeInspection(data);
}

/** POST /api/inspections/{id}/images (multipart, field "files") */
export async function uploadImages(id, files, onProgress) {
  if (isMockMode()) return mock.uploadImages(id, files);
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  const { data } = await http().post(`/api/inspections/${id}/images`, form, {
    onUploadProgress: (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
  });
  return data;
}

/** POST /api/inspections/{id}/scan */
export async function startScan(id) {
  return isMockMode() ? mock.startScan(id) : (await http().post(`/api/inspections/${id}/scan`)).data;
}

/** GET /api/inspections/{id} — polled while PROCESSING */
export async function getInspection(id) {
  const data = isMockMode() ? await mock.getInspection(id) : (await http().get(`/api/inspections/${id}`)).data;
  return normalizeInspection(data);
}

/** GET /api/inspections/{id}/results */
export async function getResults(id) {
  const data = isMockMode() ? await mock.getResults(id) : (await http().get(`/api/inspections/${id}/results`)).data;
  return normalizeResults(data);
}

/**
 * PATCH /api/inspections/{id}/results/{ruleId}/review — proposed addition.
 * body: { action: "CONFIRM" | "MARK_INCORRECT" | "EDIT", correctedValue?, note? }
 */
export async function saveReview(id, ruleId, review) {
  if (isMockMode()) return mock.saveReview(id, ruleId, review);
  const { data } = await http().patch(`/api/inspections/${id}/results/${encodeURIComponent(ruleId)}/review`, review);
  return data;
}

/** GET /api/inspections/{id}/report/pdf — proposed; frontend falls back to Print → Save as PDF. */
export async function downloadReportPdf(id) {
  if (isMockMode()) {
    const err = new Error('PDF generation is not available in demo mode');
    err.code = 'PDF_UNAVAILABLE';
    throw err;
  }
  const { data } = await http().get(`/api/inspections/${id}/report/pdf`, { responseType: 'blob' });
  return data;
}

/** Poll until the scan reaches a terminal status. Returns a cancel function. */
export function pollInspection(id, { onUpdate, onDone, onError, intervalMs = 1500, timeoutMs = 180000 }) {
  let stopped = false;
  let timer;
  const started = Date.now();

  const tick = async () => {
    if (stopped) return;
    try {
      const ins = await getInspection(id);
      if (stopped) return;
      onUpdate?.(ins);
      if (TERMINAL_STATUSES.includes(ins.status)) return onDone?.(ins);
      if (ins.status === 'FAILED') return onError?.(new Error('The scan failed on the server. Try scanning again.'));
      if (Date.now() - started > timeoutMs) return onError?.(new Error('Scan is taking longer than expected.'));
    } catch (err) {
      if (stopped) return;
      return onError?.(err);
    }
    timer = setTimeout(tick, intervalMs);
  };

  tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
