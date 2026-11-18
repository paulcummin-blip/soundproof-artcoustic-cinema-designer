// Controllable mock for @/components/state/projectReadCache.
// The test holds the deferred promises and resolves them on demand to
// simulate exact network timing (load START before edit, COMPLETE after).

// Per-call pending resolvers so the test can resolve a specific pending read.
const pendingProjectReads = []; // [{ projectId, resolve }]
const pendingVersionReads = []; // [{ versionId, resolve }]

// Staged values resolve immediately if no pending resolver exists.
let stagedProject = null;
let stagedVersion = null;

export function readProjectRecord(projectId) {
  return new Promise((resolve) => {
    if (pendingProjectReads.length) {
      // Already a read in flight for this project — queue this one.
      pendingProjectReads.push({ projectId, resolve });
    } else {
      pendingProjectReads.push({ projectId, resolve });
    }
  });
}

export function readProjectVersionRecord(versionId) {
  return new Promise((resolve) => {
    pendingVersionReads.push({ versionId, resolve });
  });
}

export function invalidateProjectRead() {
  /* no-op for test */
}

export function resetSharedProjectReadsForTest() {
  pendingProjectReads.length = 0;
  pendingVersionReads.length = 0;
  stagedProject = null;
  stagedVersion = null;
}

// ---- Test control API ----
export function resolveFirstPendingProjectRecord(value) {
  const pending = pendingProjectReads.shift();
  if (pending) pending.resolve(value);
  else stagedProject = value;
}

export function resolveFirstPendingVersionRecord(value) {
  const pending = pendingVersionReads.shift();
  if (pending) pending.resolve(value);
  else stagedVersion = value;
}

export function countPendingProjectReads() {
  return pendingProjectReads.length;
}

export function countPendingVersionReads() {
  return pendingVersionReads.length;
}