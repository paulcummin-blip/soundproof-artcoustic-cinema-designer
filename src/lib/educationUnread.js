/**
 * Education Library per-user visit tracking.
 *
 * Marks the current authenticated user's Education page as visited by
 * stamping education_last_visited_at on their own User record via
 * base44.auth.updateMe. This is per-user and persists server-side, so it
 * survives logout, reload and device switches. It never touches Education
 * documents or any other user's record.
 *
 * After stamping, the in-memory visit epoch is bumped so the sidebar
 * notification hook re-evaluates and clears the 'New' badge immediately.
 */
import { base44 } from '@/api/base44Client';
import { bumpEducationVisitEpoch } from '@/components/education/educationNewContentStore';

export async function markEducationVisited() {
  const now = new Date().toISOString();
  try {
    await base44.auth.updateMe({ education_last_visited_at: now });
  } catch (e) {
    // Best-effort: if the stamp fails, the notification may persist until the
    // next reload. Never throw — the Education page must still open.
  }
  bumpEducationVisitEpoch();
  return now;
}