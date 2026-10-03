import { base44 } from "@/api/base44Client";
import { invalidateProjectAnalysisCacheRead } from "@/components/state/projectReadCache";
import { publishBassReconciliationStatus } from "./bassReconciliationStatus";

/**
 * Coalesced ProjectAnalysisCache writes for the completed bass authority.
 *
 * Entity write volume is metered per app, and the background analysis publishes
 * a new current authority for every target it settles. Writing each publish to
 * ProjectAnalysisCache immediately produced a burst that trips
 * "App entity write traffic volume limit exceeded". Writes are therefore
 * coalesced here:
 *   - the in-memory authority still updates immediately (the UI is never delayed);
 *   - only the LAST state of a burst is written;
 *   - a write is skipped entirely when the row already holds that authority;
 *   - writes stay serialised per project;
 *   - a pending write is never held longer than MAX_WRITE_DELAY_MS, so a
 *     continuously running burst still persists its latest state.
 */
const WRITE_COALESCE_MS = 3000;
const MAX_WRITE_DELAY_MS = 10000;
const pendingWrites = new Map();     // key -> latest unwritten authority
const writeChains = new Map();       // key -> serialised in-flight write
const writtenSignatures = new Map(); // key -> signature written this session

/** Cheap identity of the authority a row holds — enough to skip a no-op write. */
function rowAuthoritySignature(row) {
  if (!row) return null;
  const snapshots = row.completed_by_fingerprint;
  const keys = snapshots && typeof snapshots === "object"
    ? Object.keys(snapshots).sort().join(",")
    : "";
  return `${row.current_fingerprint || ""}|${row.status || ""}|${keys}`;
}

export function queueBassAuthorityWrite(key, signature, record, payload) {
  if (!key || key === "free::free" || !payload) return Promise.resolve(null);
  // The row already holds this authority: writing it again would spend write
  // budget on nothing, and that is the common case when a burst re-publishes
  // the state that was written a moment ago.
  const rowSignature = rowAuthoritySignature(record);
  if (rowSignature && rowSignature === rowAuthoritySignature(payload)) {
    writtenSignatures.set(key, signature);
    const [projectId, versionId] = String(key).split("::");
    publishBassReconciliationStatus(projectId, versionId, { writeSucceeded: true, writeError: null, writeDisposition: "already-persisted" });
    return Promise.resolve(true);
  }
  if (writtenSignatures.get(key) === signature) {
    const [projectId, versionId] = String(key).split("::");
    publishBassReconciliationStatus(projectId, versionId, { writeSucceeded: true, writeError: null, writeDisposition: "already-persisted" });
    return Promise.resolve(true);
  }

  let pending = pendingWrites.get(key);
  if (!pending) {
    pending = { record: null, payload: null, signature: null, resolvers: [], timer: null, firstQueuedAt: 0 };
    pendingWrites.set(key, pending);
  }
  pending.record = record;
  pending.payload = payload;
  pending.signature = signature;
  const settled = new Promise((resolve) => pending.resolvers.push(resolve));
  const now = Date.now();
  if (!pending.firstQueuedAt) pending.firstQueuedAt = now;
  if (pending.timer) clearTimeout(pending.timer);
  const waited = now - pending.firstQueuedAt;
  if (waited >= MAX_WRITE_DELAY_MS) {
    flushQueuedBassAuthorityWrite(key);
  } else {
    pending.timer = setTimeout(
      () => { flushQueuedBassAuthorityWrite(key); },
      Math.min(WRITE_COALESCE_MS, MAX_WRITE_DELAY_MS - waited),
    );
  }
  return settled;
}

async function flushQueuedBassAuthorityWrite(key) {
  const pending = pendingWrites.get(key);
  if (!pending || !pending.payload) return;
  pendingWrites.delete(key);
  if (pending.timer) clearTimeout(pending.timer);
  const { record, payload, signature, resolvers } = pending;
  const chain = (writeChains.get(key) || Promise.resolve()).then(async () => {
    const [projectId, versionId] = String(key).split("::");
    try {
      if (record?.id) await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      else await base44.entities.ProjectAnalysisCache.create(payload);
      invalidateProjectAnalysisCacheRead(projectId, versionId);
      writtenSignatures.set(key, signature);
      // Runtime proof: the authority reached the database, and the shared read
      // cache was invalidated so the next report read sees it.
      publishBassReconciliationStatus(projectId, versionId, { writeSucceeded: true, writeError: null });
      return true;
    } catch (e) {
      // The promotion did not persist: the in-memory authority stays current for
      // this session, and the next open must reconcile again. Never silent.
      publishBassReconciliationStatus(projectId, versionId, {
        writeSucceeded: false,
        writeError: e?.message || String(e),
      });
      return false;
    }
  });
  writeChains.set(key, chain.catch(() => false));
  const written = await chain;
  for (const resolve of resolvers.splice(0)) resolve(written);
}

/** Write anything still queued — used on page close and on test teardown. */
export function flushQueuedBassAuthorityWrites() {
  for (const key of Array.from(pendingWrites.keys())) flushQueuedBassAuthorityWrite(key);
}

/** Test-only: forget all queue state. */
export function resetBassAuthorityWriteQueue() {
  pendingWrites.clear();
  writeChains.clear();
  writtenSignatures.clear();
}

// A pending write must not be lost when the page closes mid-burst.
if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("pagehide", () => { flushQueuedBassAuthorityWrites(); });
}