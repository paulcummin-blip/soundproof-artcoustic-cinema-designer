/**
 * engineeringPublishTrigger.js
 * ---------------------------
 * One registration seam for the EXISTING engineering publish action.
 *
 * The publish action belongs to the publication effect that already owns it
 * (useEngineeringPublicationEffect). Surfaces that must be able to ASK for a
 * publish — the bass result band's "Publish Current Assessment" — read that
 * same callback here instead of creating a second publication path or a second
 * fingerprint computation.
 *
 * Registration is per project + version and is removed on unmount, so a surface
 * can never publish for a project it is not showing.
 */

const triggers = new Map();

const keyOf = (projectId, versionId) => (
  projectId && versionId ? `${projectId}::${versionId}` : null
);

/** Register the publish callback for one project + version. Returns an unregister fn. */
export function registerEngineeringPublishTrigger(projectId, versionId, publish) {
  const key = keyOf(projectId, versionId);
  if (!key || typeof publish !== "function") return () => {};
  triggers.set(key, publish);
  return () => {
    if (triggers.get(key) === publish) triggers.delete(key);
  };
}

/** The publish callback for this project + version, or null when none is mounted. */
export function readEngineeringPublishTrigger(projectId, versionId) {
  const key = keyOf(projectId, versionId);
  return key ? (triggers.get(key) || null) : null;
}

export default readEngineeringPublishTrigger;