// p14TargetCache.js — Persistent P14 background target cache.
//
// Stores compact authoritative bass contracts for precomputed P14 target
// combinations, keyed by baseDesignFingerprint -> targetKey.
//
// In-memory cache is the primary read path; DB sync is fire-and-forget.
// On project reopen, hydrateTargetCache loads the persisted cache.
//
// This module does NOT touch the live bass authority (completedBassResultStore).
// Background results are cache-only until a target switch hydrates them.

import { useEffect, useSyncExternalStore } from "react";
import { base44 } from "@/api/base44Client";
import { COMPLETED_BASS_CACHE_VERSION, INSTANCE_AUTHORITY_VERSION, RP22_BASS_METRIC_SCHEMA_VERSION } from "@/lib/bassAuthorityVersion";
import { isAuthoritativeBassContract, isStructurallyCompleteBassContract, hasCanonicalSeatMetricAuthority, validateAssessmentEnvelopeAuthority } from "./completedBassResultPersistence";
import { validateCanonicalBassResult } from "./canonicalBassResult";
import { hasP18SelectedTargetSchema } from "./p18SelectedTargetExplanation";
import { hasGraphPayload } from "./finishedGraphAdapter";
import { hasReadyCanonicalP19Contract } from "./p19Readiness";
import { isValidLimitedP14Contract } from "./p14LimitedTargetAuthority";
import { safeConsole } from "@/components/utils/safeConsole";
import { bassCacheKey, bassDbFilter } from "./bassCacheKey";

const cacheByProject = new Map();
const listeners = new Set();
const writeQueues = new Map();
const persistedSignatures = new Map();
const persistenceTimers = new Map();
const dirtyProjects = new Set();
// Tracks the last persistence failure per project so callers/diagnostics can
// detect that a completed target is NOT durably saved. Cleared on successful write.
const persistenceFailures = new Map();
// FIX 2 — Restore target bank lock. When Restore Previous Design restores the
// 8/8 target bank, a restore lock protects the bank from being wiped by
// transient baseDesignFingerprint transitions (legacy subwoofers sync) or
// stale background workers from the moved design. The lock is released by
// BassBackgroundAnalysisOwner when coherence is observed.
const restoreLocks = new Map(); // key -> { baseDesignFingerprint, targetCount, bassFingerprint }
let restoreLockRevision = 0;
const TARGET_CACHE_WRITE_DEBOUNCE_MS = 2000;
let cacheRevision = 0;

function notify() {
  cacheRevision += 1;
  listeners.forEach((l) => l());
}

function notifyRestoreLock() {
  restoreLockRevision += 1;
  listeners.forEach((l) => l());
}

function projectKey(projectId, versionId) { return bassCacheKey(projectId, versionId); }

function ensureCache(projectId, versionId) {
  const key = projectKey(projectId, versionId);
  if (!cacheByProject.has(key)) {
    cacheByProject.set(key, { metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, baseDesignFingerprint: null, targets: {} });
  }
  return cacheByProject.get(key);
}

// ── FIX 2: Restore target bank lock ──────────────────────────────────────
// Set a restore lock that protects the restored target bank from being wiped
// by transient baseDesignFingerprint transitions or stale background workers.
// The lock is released by BassBackgroundAnalysisOwner when coherence is
// observed (baseDesign matches, completed authority matches, effectiveContract
// matches, target bank count matches).
export function setRestoreLock(projectId, versionId, { baseDesignFingerprint, targetCount, bassFingerprint }) {
  if (!projectId || !versionId || !baseDesignFingerprint) return;
  const key = projectKey(projectId, versionId);
  restoreLocks.set(key, { baseDesignFingerprint, targetCount, bassFingerprint });
  notifyRestoreLock();
}

export function clearRestoreLock(projectId, versionId) {
  if (!projectId || !versionId) return;
  const key = projectKey(projectId, versionId);
  if (restoreLocks.has(key)) {
    restoreLocks.delete(key);
    notifyRestoreLock();
  }
}

export function getRestoreLock(projectId, versionId) {
  if (!projectId || !versionId) return null;
  return restoreLocks.get(projectKey(projectId, versionId)) || null;
}

/**
 * Get a cached compact contract for a specific target.
 * Returns null if the cache doesn't match the current base design or the
 * target hasn't been cached yet.
 */
/**
 * AUTHORITATIVE target readiness: structurally complete + graph payload + P19
 * ready + the current P18 selected-target presentation schema.
 *
 * The P18 presentation schema is part of the result schema: a contract stored
 * before the selected-target explanation existed cannot state which LFE output
 * target the extension was measured at, which branch limited it, or whether it
 * is floor-bounded. Treating it as not-ready refreshes exactly that target
 * through the existing engine. Physics, grading and published values are
 * untouched — only the P18 presentation/result schema is invalidated.
 */
function isReadyTargetEntry(entry) {
  return isAuthoritativeBassContract(entry)
    && hasGraphPayload(entry)
    && hasReadyCanonicalP19Contract(entry)
    && hasP18SelectedTargetSchema(entry);
}

export function getTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey) {
  if (!baseDesignFingerprint || !targetKey) return null;
  const cache = ensureCache(projectId, versionId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) return null;
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return null;
  const entry = cache.targets[targetKey];
  if (!entry) return null;
  // AUTHORITATIVE: structurally complete + graph payload + P19 ready + P18 explanation schema
  if (isReadyTargetEntry(entry)) {
    return entry;
  }
  // LIMITED: a valid capability-limited P14 contract (terminal, no P19)
  if (isValidLimitedP14Contract(entry)) {
    return entry;
  }
  return null;
}

/**
 * Store a LIMITED P14 contract for a target. A LIMITED contract represents a
 * successful terminal engineering result: the requested P14 dBC cannot be
 * achieved. It is stored separately from authoritative contracts and does
 * NOT pass the authoritative cache gate.
 */
export function setLimitedTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey, limitedContract, { deferPersistence = false, immediate = false } = {}) {
  if (!baseDesignFingerprint || !targetKey || !limitedContract) return false;
  if (!isValidLimitedP14Contract(limitedContract)) return false;
  const cache = ensureCache(projectId, versionId);
  // FIX 2: Restore lock — if a restore lock is active and the incoming
  // baseDesignFingerprint doesn't match the locked baseDesign, this is a stale
  // worker from the moved design. Discard it so it cannot overwrite the
  // restored bank.
  const lock = getRestoreLock(projectId, versionId);
  if (lock && lock.baseDesignFingerprint !== baseDesignFingerprint) return false;
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION
    || cache.baseDesignFingerprint !== baseDesignFingerprint) {
    cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
    cache.baseDesignFingerprint = baseDesignFingerprint;
    cache.targets = {};
  }
  // Mark the entry so isLimitedP14Entry can identify it without re-validating
  cache.targets[targetKey] = { ...limitedContract, __p14Limited: true };
  notify();
  scheduleSync(projectId, versionId, { deferPersistence, immediate });
  return true;
}

/**
 * Get cache progress: how many of the 8 targets are ready.
 */
export function getTargetCacheProgress(projectId, versionId, baseDesignFingerprint, allTargetKeys) {
  const keys = Array.isArray(allTargetKeys) ? allTargetKeys : [];
  const empty = { ready: 0, resolved: 0, total: keys.length, completedDurationsMs: [], readyTargetKeys: [], limitedTargetKeys: [], resolvedTargetKeys: [] };
  if (!baseDesignFingerprint) return empty;
  const cache = ensureCache(projectId, versionId);
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION) return empty;
  if (cache.baseDesignFingerprint !== baseDesignFingerprint) return empty;
  const readyTargetKeys = [];
  const limitedTargetKeys = [];
  const resolvedTargetKeys = [];
  const completedDurationsMs = [];
  keys.forEach((key) => {
    const entry = cache.targets[key];
    if (!entry) return;
    const isAuthoritative = isReadyTargetEntry(entry);
    const isLimited = isValidLimitedP14Contract(entry);
    if (isAuthoritative) {
      readyTargetKeys.push(key);
      resolvedTargetKeys.push(key);
      const elapsedMs = Number(entry?.job?.elapsedMs);
      if (Number.isFinite(elapsedMs) && elapsedMs > 0) completedDurationsMs.push(elapsedMs);
    } else if (isLimited) {
      limitedTargetKeys.push(key);
      resolvedTargetKeys.push(key);
    }
  });
  return {
    ready: readyTargetKeys.length,
    resolved: resolvedTargetKeys.length,
    total: keys.length,
    completedDurationsMs,
    readyTargetKeys,
    limitedTargetKeys,
    resolvedTargetKeys,
  };
}

/**
 * Store a compact contract for a target. Resets the cache if the design changed.
 */
export function setTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey, compactContract, { deferPersistence = false, immediate = false } = {}) {
  if (!baseDesignFingerprint || !targetKey || !compactContract) return false;
  if (!isAuthoritativeBassContract(compactContract)) {
    // TEMPORARY DIAGNOSTIC — capture the exact rejection reason for failed
    // background target contracts. Diagnostic ONLY: does not bypass validation,
    // does not change the return value, does not force the contract into the
    // cache. Remove once the root cause is identified and fixed.
    try {
      const pub = compactContract?.metricPublication;
      const envelopeResult = validateAssessmentEnvelopeAuthority(compactContract);
      const canonicalResult = compactContract?.finalOptimisedBassResponse
        ? { valid: "skipped-has-finalResponse", reason: null }
        : validateCanonicalBassResult(compactContract);
      safeConsole.warn("p14-cache-reject", JSON.stringify({
        projectId,
        versionId,
        targetKey,
        baseDesignFingerprint,
        sub_1_structural: isStructurallyCompleteBassContract(compactContract),
        sub_2_seatMetric: hasCanonicalSeatMetricAuthority(compactContract),
        sub_3_envelope_valid: envelopeResult.valid,
        sub_3_envelope_reason: envelopeResult.reason || null,
        sub_4_canonical_valid: canonicalResult.valid,
        sub_4_canonical_reason: canonicalResult.reason || null,
        sub_5_metricPub_valid: !!pub?.canonicalMetricPublicationValid,
        mpValid: pub?.canonicalMetricPublicationValid ?? null,
        mpAuthorityValid: pub?.canonicalMetricAuthorityValid ?? null,
        mpGraphParityValid: pub?.graphMetricParityValid ?? null,
        mpRejectionReason: pub?.publicationRejectionReason || null,
        canonicalDiagRejectionReason: compactContract?.canonicalMetricDiagnostics?.rejectionReason || null,
      }));
    } catch { /* diagnostic must never break the rejection path */ }
    return false;
  }
  // Stage 3: reject contracts without the required finished graph payload.
  if (!hasGraphPayload(compactContract)) return false;
  // P19 readiness is part of completed-target reuse: a target without both
  // canonical curves and a finite official result remains eligible to retry.
  if (!hasReadyCanonicalP19Contract(compactContract)) return false;
  const cache = ensureCache(projectId, versionId);
  // FIX 2: Restore lock — if a restore lock is active and the incoming
  // baseDesignFingerprint doesn't match the locked baseDesign, this is a stale
  // worker from the moved design. Discard it so it cannot overwrite the
  // restored bank.
  const lock = getRestoreLock(projectId, versionId);
  if (lock && lock.baseDesignFingerprint !== baseDesignFingerprint) return false;
  if (cache.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION
    || cache.baseDesignFingerprint !== baseDesignFingerprint) {
    cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
    cache.baseDesignFingerprint = baseDesignFingerprint;
    cache.targets = {};
  }
  cache.targets[targetKey] = compactContract;
  notify();
  scheduleSync(projectId, versionId, { deferPersistence, immediate });
  return true;
}

/**
 * Reset the cache when the design changes. Old cached results for a different
 * design are no longer valid.
 */
export function clearTargetCacheForDesign(projectId, versionId, baseDesignFingerprint) {
  const cache = ensureCache(projectId, versionId);
  // FIX 2: Restore lock — do not wipe a non-empty restored bank during a
  // restore. The lock protects the 8/8 bank from transient baseDesignFingerprint
  // transitions (legacy subwoofers sync) that would otherwise wipe it to 0/8.
  const lock = getRestoreLock(projectId, versionId);
  if (lock && Object.keys(cache.targets).length > 0) return;
  if (cache.metricSchemaVersion === RP22_BASS_METRIC_SCHEMA_VERSION
    && cache.baseDesignFingerprint === baseDesignFingerprint) return;
  // FIX 1: Do not wipe a non-empty hydrated target bank during transient
  // baseDesign changes. A baseDesign mismatch alone is insufficient to
  // destroy the previous accepted design's 8/8 bank — useTargetCacheEntry
  // already returns null for a mismatched baseDesign, so the old bank is
  // never incorrectly treated as current for a moved preview design. The
  // bank is only replaced when hydrateTargetCache loads a valid DB bank,
  // setTargetCacheEntry stores a completed result for a confirmed/published
  // design, or schema/metric invalidation explicitly requires reset.
  if (Object.keys(cache.targets).length > 0) return;
  cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
  cache.baseDesignFingerprint = baseDesignFingerprint;
  cache.targets = {};
  notify();
  // Fix 3: Do NOT persist the empty bank during transient physical moves.
  // A transient preview move (e.g. dragging a sub) changes the baseDesign
  // fingerprint, which wipes the in-memory bank. Persisting that empty bank
  // destroys the durable 8/8 target bank in the database. The bank is only
  // re-persisted when a real completed result is stored via setTargetCacheEntry
  // or restored via restoreTargetBankSnapshot.
}

/**
 * Count the prepared (verified) entries in a bank's targets object.
 * AUTHORITATIVE requires structural validity + graph payload + P19 readiness;
 * LIMITED contracts are terminal results and also count as prepared.
 */
function countPreparedTargetBankEntries(targets) {
  let count = 0;
  for (const [, entry] of Object.entries(targets || {})) {
    const isAuth = isReadyTargetEntry(entry);
    const isLim = isValidLimitedP14Contract(entry);
    if (isAuth || isLim) count += 1;
  }
  return count;
}

/**
 * Capture a deep-cloned snapshot of the current target bank for a project+
 * version. Used by the Restore Previous Design checkpoint so the 8/8 target
 * bank can be restored without a full background recalculation.
 *
 * Returns { baseDesignFingerprint, targets, count } or null if the cache is
 * empty / has no baseDesignFingerprint.
 */
export function getTargetBankSnapshot(projectId, versionId) {
  const cache = ensureCache(projectId, versionId);
  if (!cache.baseDesignFingerprint) return null;
  const targets = cache.targets || {};
  return {
    baseDesignFingerprint: cache.baseDesignFingerprint,
    targets: JSON.parse(JSON.stringify(targets)),
    count: countPreparedTargetBankEntries(targets),
  };
}

/**
 * Bank identity — what the in-memory bank actually holds: its baseDesign
 * fingerprint and its prepared-entry count. NOT design-aware: it reports the
 * bank as it is, whether or not that bank belongs to the current physical
 * design. Consumers compare this against the physical design's
 * baseDesignFingerprint (see bankIdentityCoherence.js) so a bank belonging to
 * another design is never treated as prepared for this one.
 */
export function getTargetBankIdentity(projectId, versionId) {
  const cache = ensureCache(projectId, versionId);
  return {
    baseDesignFingerprint: cache.baseDesignFingerprint || null,
    count: countPreparedTargetBankEntries(cache.targets),
  };
}

/**
 * Restore a previously-captured target bank snapshot into the cache for the
 * given baseDesignFingerprint. Used by Restore Previous Design (Fix 2) so the
 * 8/8 target bank is immediately available after a restore without waiting for
 * the background scheduler to recompute all targets.
 *
 * Persists immediately so the durable bank survives a page refresh.
 */
export function restoreTargetBankSnapshot(projectId, versionId, baseDesignFingerprint, targets) {
  if (!baseDesignFingerprint || !targets || typeof targets !== "object") return false;
  const cache = ensureCache(projectId, versionId);
  cache.metricSchemaVersion = RP22_BASS_METRIC_SCHEMA_VERSION;
  cache.baseDesignFingerprint = baseDesignFingerprint;
  cache.targets = JSON.parse(JSON.stringify(targets));
  notify();
  scheduleSync(projectId, versionId, { immediate: true });
  return true;
}

/**
 * Hydrate the target cache from the database. Called on project load.
 */
export async function hydrateTargetCache(projectId, versionId) {
  const key = projectKey(projectId, versionId);
  if (key === "free::free") return;
  try {
    const records = await base44.entities.ProjectAnalysisCache.filter(bassDbFilter(projectId, versionId), '-updated_date', 1);
    const record = Array.isArray(records) ? records[0] : null;
    if (!record?.target_cache) return;
    const stored = typeof record.target_cache === 'string' ? JSON.parse(record.target_cache) : record.target_cache;
    if (!stored || stored.metricSchemaVersion !== RP22_BASS_METRIC_SCHEMA_VERSION || !stored.baseDesignFingerprint) {
      cacheByProject.set(key, { metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION, baseDesignFingerprint: null, targets: {} });
      notify();
      return;
    }
    // FIX 1: Restore lock — do NOT overwrite the in-memory cache if a restore
    // lock is active and the DB's baseDesignFingerprint doesn't match the
    // locked baseDesign. restoreTargetBankSnapshot just wrote the restored
    // 8/8 bank into memory; a stale DB bank (from a previous bridge-effect
    // cycle or a moved design) must not win over the just-restored checkpoint
    // bank. The restored in-memory 8/8 is the authority during the restore
    // transaction; scheduleSync from restoreTargetBankSnapshot will update
    // the DB to the restored 8/8.
    const lock = getRestoreLock(projectId, versionId);
    if (lock && lock.baseDesignFingerprint && stored.baseDesignFingerprint !== lock.baseDesignFingerprint) {
      return;
    }
    cacheByProject.set(key, {
      metricSchemaVersion: RP22_BASS_METRIC_SCHEMA_VERSION,
      baseDesignFingerprint: stored.baseDesignFingerprint,
      targets: stored.targets || {},
    });
    persistedSignatures.set(key, JSON.stringify(cacheByProject.get(key)));
    notify();
  } catch (e) {
    // Hydration failure is non-fatal — cache rebuilds from background scheduler
  }
}

/**
 * Schedule a persistence write for the target cache.
 *
 * Options:
 *   deferPersistence — mark dirty but do NOT schedule a write (non-terminal
 *     mutations; a later terminal mutation or explicit flush will persist).
 *   immediate — bypass the 2-second debounce and write NOW. Used for target
 *     completion so each verified target is durable before the user can close
 *     the page. The write is fire-and-forget (errors are logged in flush);
 *     callers that need to await may call flushTargetCachePersistence directly.
 *
 * The debounce remains for non-terminal cache mutations (e.g. design-clear)
 * where coalescing is safe and no completed target is at risk of being lost.
 */
function scheduleSync(projectId, versionId, { deferPersistence = false, immediate = false } = {}) {
  const key = projectKey(projectId, versionId);
  if (key === "free::free") return;
  dirtyProjects.add(key);
  const previousTimer = persistenceTimers.get(key);
  if (previousTimer != null) clearTimeout(previousTimer);
  persistenceTimers.delete(key);
  if (deferPersistence) return;
  if (immediate) {
    // Bypass the debounce — write immediately so the completed target is
    // durable before the user can close the page. Fire-and-forget; errors
    // are logged inside flushTargetCachePersistence.
    flushTargetCachePersistence(projectId, versionId).catch(() => { /* already logged */ });
    return;
  }
  persistenceTimers.set(key, setTimeout(() => {
    persistenceTimers.delete(key);
    flushTargetCachePersistence(projectId, versionId);
  }, TARGET_CACHE_WRITE_DEBOUNCE_MS));
}

export function flushTargetCachePersistence(projectId, versionId) {
  const key = projectKey(projectId, versionId);
  if (key === "free::free") return Promise.resolve();
  const timer = persistenceTimers.get(key);
  if (timer != null) clearTimeout(timer);
  persistenceTimers.delete(key);
  if (!dirtyProjects.has(key)) return writeQueues.get(key) || Promise.resolve();

  const snapshot = JSON.parse(JSON.stringify(ensureCache(projectId, versionId)));
  const signature = JSON.stringify(snapshot);
  dirtyProjects.delete(key);
  if (persistedSignatures.get(key) === signature) {
    return writeQueues.get(key) || Promise.resolve();
  }

  const dbFilter = bassDbFilter(projectId, versionId);
  const queued = (writeQueues.get(key) || Promise.resolve()).then(async () => {
    try {
      const records = await base44.entities.ProjectAnalysisCache.filter(dbFilter, '-updated_date', 1);
      const record = Array.isArray(records) ? records[0] : null;
      const payload = {
        ...dbFilter,
        completed_cache_version: COMPLETED_BASS_CACHE_VERSION,
        instance_authority_version: INSTANCE_AUTHORITY_VERSION,
        metric_schema_version: RP22_BASS_METRIC_SCHEMA_VERSION,
        target_cache: snapshot,
      };
      if (record?.id) {
        await base44.entities.ProjectAnalysisCache.update(record.id, payload);
      } else {
        await base44.entities.ProjectAnalysisCache.create(payload);
      }
      persistedSignatures.set(key, signature);
      // Write succeeded — clear any previous failure record for this project.
      persistenceFailures.delete(key);
    } catch (e) {
      // Preserve the dirty marker so the next target, explicit sweep flush, or
      // navigation cleanup retries the latest in-memory snapshot. The completed
      // result remains in memory and available for immediate use — it is NOT
      // falsely treated as durably saved.
      dirtyProjects.add(key);
      persistenceFailures.set(key, {
        error: e?.message || String(e),
        timestamp: Date.now(),
        targetCount: Object.keys(snapshot?.targets || {}).length,
      });
      safeConsole.warn("p14-cache", `target_cache persistence FAILED for project ${key}: ${e?.message || e}. ${Object.keys(snapshot?.targets || {}).length} target(s) retained in memory; dirty marker set for retry.`);
    }
    if (JSON.stringify(ensureCache(projectId, versionId)) !== persistedSignatures.get(key)) {
      dirtyProjects.add(key);
    }
  });
  writeQueues.set(key, queued);
  return queued;
}

/**
 * Returns the last persistence failure for a project, or null if the last
 * write succeeded. Used by diagnostics to detect that completed targets are
 * NOT durably saved — do not falsely treat the cache as durable when this
 * returns non-null.
 */
export function getPersistenceFailure(projectId, versionId) {
  const key = projectKey(projectId, versionId);
  return persistenceFailures.get(key) || null;
}

/**
 * Returns true when the in-memory cache has unwritten changes (dirty). Used
 * by diagnostics and tests to verify the dirty/retry state is retained after
 * a write failure.
 */
export function isTargetCacheDirty(projectId, versionId) {
  const key = projectKey(projectId, versionId);
  return dirtyProjects.has(key);
}

/**
 * Test-only: reset all in-memory cache state. Simulates a fresh app restart
 * so durability/hydration tests can verify the DB → memory restore path
 * without lingering in-memory state from a previous test.
 */
export function _resetTargetCacheForTest() {
  cacheByProject.clear();
  persistedSignatures.clear();
  persistenceTimers.forEach((t) => clearTimeout(t));
  persistenceTimers.clear();
  dirtyProjects.clear();
  persistenceFailures.clear();
  writeQueues.clear();
  restoreLocks.clear();
  cacheRevision = 0;
  restoreLockRevision = 0;
  notify();
}

// ── FIX 2: React hook for restore lock subscription ──────────────────────
export function useRestoreLock(projectId, versionId) {
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => restoreLockRevision,
    () => restoreLockRevision,
  );
  return getRestoreLock(projectId, versionId);
}

// ── React hook for reactive cache reads ──────────────────────────────────

export function useTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey) {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => getTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey),
    () => getTargetCacheEntry(projectId, versionId, baseDesignFingerprint, targetKey),
  );
}

export function useTargetCacheProgress(projectId, versionId, baseDesignFingerprint, allTargetKeys) {
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => cacheRevision,
    () => cacheRevision,
  );
  return getTargetCacheProgress(projectId, versionId, baseDesignFingerprint, allTargetKeys);
}

// Reactive bank identity read (fingerprint + prepared count). Subscribes to the
// same cache revision as useTargetCacheProgress.
export function useTargetBankIdentity(projectId, versionId) {
  useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => cacheRevision,
    () => cacheRevision,
  );
  return getTargetBankIdentity(projectId, versionId);
}

export function useTargetCacheHydration(projectId, versionId) {
  useEffect(() => {
    hydrateTargetCache(projectId, versionId);
  }, [projectId, versionId]);
}