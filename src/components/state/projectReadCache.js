/**
 * Shared project reads
 * --------------------
 * One session-scoped read per identity. Every caller receives the same promise,
 * value, or failure until an explicit Retry/invalidation. This prevents React
 * mounts and route transitions from multiplying entity reads.
 */
import { base44 } from "@/api/base44Client";

const projectReads = new Map();
const versionReads = new Map();
const analysisReads = new Map();

const counters = {
  Project: 0,
  ProjectVersion: 0,
  ProjectAnalysisCache: 0,
};
const readHistory = [];

const normalise = (value) => String(value || "").trim();
const pairKey = (projectId, versionId) => `${normalise(projectId)}::${normalise(versionId)}`;

function publishCounters() {
  if (typeof window !== "undefined") {
    window.__SP_SHARED_READ_DIAGNOSTICS__ = { ...counters, history: [...readHistory] };
    document.documentElement.dataset.spSharedReads = JSON.stringify({ ...counters, history: readHistory });
  }
}

function singleFlight(map, key, loader, { force = false } = {}) {
  if (!key) return Promise.resolve(null);
  if (force) map.delete(key);
  const existing = map.get(key);
  if (existing) return existing;
  const promise = Promise.resolve().then(loader);
  map.set(key, promise);
  return promise;
}

export function readProjectRecord(projectId, options) {
  const id = normalise(projectId);
  return singleFlight(projectReads, id, async () => {
    counters.Project += 1;
    readHistory.push({ entity: "Project", key: id });
    publishCounters();
    const rows = await base44.entities.Project.filter({ id }, "-updated_date", 1);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }, options);
}

export function readProjectVersionRecord(versionId, options) {
  const id = normalise(versionId);
  return singleFlight(versionReads, id, async () => {
    counters.ProjectVersion += 1;
    readHistory.push({ entity: "ProjectVersion", key: id });
    publishCounters();
    const rows = await base44.entities.ProjectVersion.filter({ id });
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }, options);
}

export function readProjectAnalysisCacheRecord(projectId, versionId, options) {
  const project = normalise(projectId);
  const version = normalise(versionId);
  const key = pairKey(project, version);
  if (!project || !version) return Promise.resolve(null);
  // A persisted project briefly renders with the unsaved `free` sentinel while
  // its active version is resolving. Reading project::free is guaranteed to be
  // superseded moments later and doubled every cold-open cache read.
  if (project !== "free" && version === "free") return Promise.resolve(null);
  return singleFlight(analysisReads, key, async () => {
    counters.ProjectAnalysisCache += 1;
    readHistory.push({ entity: "ProjectAnalysisCache", key });
    publishCounters();
    const rows = await base44.entities.ProjectAnalysisCache.filter(
      { project_id: project, version_id: version },
      "-updated_date",
      1,
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }, options);
}

export function invalidateProjectRead(projectId) {
  projectReads.delete(normalise(projectId));
}

export function invalidateProjectVersionRead(versionId) {
  versionReads.delete(normalise(versionId));
}

export function invalidateProjectAnalysisCacheRead(projectId, versionId) {
  analysisReads.delete(pairKey(projectId, versionId));
}

export function getSharedProjectReadDiagnostics() {
  return { ...counters, history: [...readHistory] };
}

export function resetSharedProjectReadsForTest() {
  projectReads.clear();
  versionReads.clear();
  analysisReads.clear();
  counters.Project = 0;
  counters.ProjectVersion = 0;
  counters.ProjectAnalysisCache = 0;
  readHistory.length = 0;
  publishCounters();
}
