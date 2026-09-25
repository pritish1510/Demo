// In-browser stand-in for the backend. Behaves like the contract: create → upload →
// scan (PROCESSING for a few seconds) → COMPLETED / REVIEW_REQUIRED → results.
import { sampleBiscuitResults, seedInspections } from './mockData';
import { computeSummary } from '../utils/statusUtils';

const KEY = 'verimetrix.mock.v1';
const SCAN_MS = 6500;

let db = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // fall through to seed data
  }
  return { nextId: 1100, nextImageId: 500, inspections: seedInspections() };
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch {
    // storage full or blocked — demo keeps working in memory
  }
}

const delay = (ms = 250 + Math.random() * 250) => new Promise((res) => setTimeout(res, ms));
const clone = (o) => JSON.parse(JSON.stringify(o));

function httpError(status, message) {
  const err = new Error(message);
  err.response = { status, data: { message } };
  return err;
}

function find(id) {
  const ins = db.inspections.find((x) => String(x.id) === String(id));
  if (!ins) throw httpError(404, `Inspection ${id} not found`);
  return ins;
}

/** Advance a PROCESSING scan once enough time has passed. */
function advance(ins) {
  if (ins.status !== 'PROCESSING' || Date.now() - ins.scanStartedAt < SCAN_MS) return;
  ins.results = sampleBiscuitResults();
  const s = computeSummary(ins.results);
  ins.status = s.potentialShortfall + s.reviewRequired + s.lowConfidence > 0 ? 'REVIEW_REQUIRED' : 'COMPLETED';
  persist();
}

function publicShape(ins) {
  const { results, reviews, scanStartedAt, ...rest } = ins;
  return { ...clone(rest), summary: results ? computeSummary(results) : null };
}

function makeCode() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `INS-${hex.toUpperCase()}`;
}

export async function listInspections() {
  await delay();
  db.inspections.forEach(advance);
  return [...db.inspections]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicShape);
}

export async function createInspection({ productName, category, contextType, originType }) {
  await delay();
  if (!productName?.trim() || !category) throw httpError(400, 'productName and category are required');
  const ins = {
    id: db.nextId++,
    inspectionCode: makeCode(),
    productName: productName.trim(),
    category,
    contextType: contextType || null,
    originType: originType || null,
    status: 'CREATED',
    createdAt: new Date().toISOString(),
    images: [],
    results: null,
    reviews: {},
  };
  db.inspections.push(ins);
  persist();
  return publicShape(ins);
}

export async function uploadImages(id, files) {
  await delay(600);
  const ins = find(id);
  // Object URLs live for this browser session only — fine for a demo.
  const uploadedImages = files.map((f) => ({
    id: db.nextImageId++,
    fileName: f.name,
    imageUrl: URL.createObjectURL(f),
  }));
  ins.images.push(...uploadedImages);
  ins.status = 'UPLOADED';
  persist();
  return { inspectionId: ins.id, uploadedImages, status: ins.status };
}

export async function startScan(id) {
  await delay();
  const ins = find(id);
  if (!ins.images.length) throw httpError(400, 'Upload at least one image before scanning');
  ins.status = 'PROCESSING';
  ins.scanStartedAt = Date.now();
  ins.results = null;
  ins.reviews = {};
  persist();
  return { inspectionId: ins.id, status: ins.status };
}

export async function getInspection(id) {
  await delay(150);
  const ins = find(id);
  advance(ins);
  return publicShape(ins);
}

export async function getResults(id) {
  await delay();
  const ins = find(id);
  advance(ins);
  if (!ins.results) throw httpError(409, 'Results are not ready yet');
  const results = ins.results.map((res) => ({ ...res, review: ins.reviews?.[res.ruleId] ?? null }));
  return {
    inspectionId: ins.inspectionCode,
    productName: ins.productName,
    category: ins.category,
    overallStatus: ins.status,
    summary: computeSummary(results),
    results: clone(results),
  };
}

export async function saveReview(id, ruleId, review) {
  await delay();
  const ins = find(id);
  if (!ins.results?.some((res) => res.ruleId === ruleId)) throw httpError(404, `Rule ${ruleId} not found`);
  const saved = { ...review, reviewedBy: 'Inspector', reviewedAt: new Date().toISOString() };
  ins.reviews = { ...ins.reviews, [ruleId]: saved };
  persist();
  return { ruleId, review: saved };
}

export function resetDemoData() {
  db = { nextId: 1100, nextImageId: 500, inspections: seedInspections() };
  persist();
}
