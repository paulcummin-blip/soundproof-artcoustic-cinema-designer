/**
 * engineeringPublishTrigger.js
 * ---------------------------
 * One registration seam for the EXISTING engineering publish action.
 *
 * The publish action belongs to the publication effect that already owns it
 * (useEngineeringPublicationEffect). A surface that must be able to ASK for a
 * publish — the bass result band's automatic save — reads that same callback
 * here instead of creating a second publication path or a second fingerprint
 * computation.
 *
 * Registration is per project + version and is removed on unmount, so a surface
 * can never publish for a project it is not showing.
 *
 * Subscribers are told when a registration for their project + version appears
 * or disappears, so a surface never has to poll or guess whether the publisher
 * is mounted yet.
 */

const triggers = new Map();
const subscribers = new Map();

const keyOf = (projectId, versionId) => (
  projectId && versionId ? `${projectId}::${versionId}` : null
);

function notifySubscribers(key) {
  const set = subscribers.get(key);
  if (set) set.forEach((listener) => listener());
}

/** Register the publish callback for one project + version. Returns an unregister fn. */
export function registerEngineeringPublishTrigger(projectId, versionId, publish) {
  const key = keyOf(projectId, versionId);
  if (!key || typeof publish !== "function") return () => {};
  triggers.set(key, publish);
  notifySubscribers(key);
  return () => {
    if (triggers.get(key) === publish) {
      triggers.delete(key);
      notifySubscribers(key);
    }
  };
}

/** The publish callback for this project + version, or null when none is mounted. */
export function readEngineeringPublishTrigger(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return key ? (triggers.get(key) || null) : null;
}

/**
 * Be told when this project + version's publisher appears or disappears. The
 * listener is called once immediately, so a surface that subscribes after the
 * publisher mounted is not left waiting for an event that already happened.
 */
export function subscribeEngineeringPublishTrigger(projectId, versionId, listener) {
  const key = keyOf(projectId, versionId);
  if (!key || typeof listener !== "function") return () => {};
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(listener);
  listener();
  return () => {
    const set = subscribers.get(key);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) subscribers.delete(key);
  };
}

export default readEngineeringPublishTrigger;