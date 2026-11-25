// projectEditSync.js
// --------------------------------
// Safe project edit helpers shared by both project edit handlers (the canonical
// NewProjectDialog edit mode and the legacy inline Projects dialog).
//
// Re-exports buildProjectEditPayload (pure, from projectEditDiff) and provides
// refreshProjectIdentityAfterEdit: after a confirmed successful Project update,
// invalidate the shared read cache and update the canonical hydration store so
// the Projects card, Active Project sidebar, System Designer header and every
// other identity surface agree immediately — without requiring the user to
// close and reopen the project.

import { buildProjectEditPayload } from "@/components/projects/projectEditDiff";
import { invalidateProjectRead } from "@/components/state/projectReadCache";
import { setProjectIdentity, getProjectHydration } from "@/components/state/projectHydrationStore";

export { buildProjectEditPayload };

/**
 * Refresh every cached/project-identity surface after a confirmed successful
 * Project update, so the Projects card, Active Project sidebar and System
 * Designer header all reflect the new values immediately.
 *
 * - Invalidates the shared project-read cache so the next open re-fetches.
 * - Updates the canonical hydration store identity (only when this project is
 *   the active project — setProjectIdentity is a no-op otherwise).
 *
 * Returns the identity fields that were applied, for the caller to merge into
 * its local project-card state if it wants to.
 */
export function refreshProjectIdentityAfterEdit(projectId, updatedRecord) {
  if (!projectId) return null;
  invalidateProjectRead(projectId);

  const identity = {
    name: updatedRecord?.name || null,
    clientName: updatedRecord?.client_name || null,
    projectReference: updatedRecord?.project_reference || null,
    dealerName: updatedRecord?.dealer_name ?? undefined,
  };
  // setProjectIdentity ignores writes for a project that is not the active one,
  // and merges with the existing identity object, so partial updates are safe.
  const current = getProjectHydration();
  if (current.projectId === projectId) {
    const partial = {
      name: identity.name,
      clientName: identity.clientName,
      projectReference: identity.projectReference,
    };
    if (identity.dealerName !== undefined) partial.dealerName = identity.dealerName;
    setProjectIdentity(projectId, partial);
  }
  return identity;
}