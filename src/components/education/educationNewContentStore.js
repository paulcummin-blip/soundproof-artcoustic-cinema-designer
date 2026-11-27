// Lightweight in-memory epoch that bumps when any user marks the Education
// page as visited. The sidebar notification hook subscribes to it so the
// 'New' badge clears immediately after a successful Education visit, without
// waiting for a full auth refresh.
let epoch = 0;
const listeners = new Set();

export function getEducationVisitEpoch() {
  return epoch;
}

export function bumpEducationVisitEpoch() {
  epoch += 1;
  listeners.forEach((fn) => {
    try {
      fn(epoch);
    } catch {
      // listener errors never block the bump
    }
  });
}

export function subscribeEducationVisitEpoch(fn) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}