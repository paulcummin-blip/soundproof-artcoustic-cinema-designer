/**
 * Project age utilities — uses created_date as the sole age authority.
 * Editing a project does NOT reset its age (updated_date is never used).
 */

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Whole calendar days since the project's created_date.
 * Returns null if createdDate is missing or invalid.
 */
export function getAgeDays(createdDate) {
  if (!createdDate) return null;
  const created = new Date(createdDate);
  if (!Number.isFinite(created.getTime())) return null;
  const diffMs = Date.now() - created.getTime();
  return Math.floor(diffMs / MS_PER_DAY);
}

/**
 * Formats age as: "Age: 23 days" or "Age: 1 day" (singular).
 */
export function formatAge(ageDays) {
  if (ageDays == null) return null;
  return `Age: ${ageDays} ${ageDays === 1 ? 'day' : 'days'}`;
}

/**
 * Whether a 200-day age review dialog is due.
 *
 * Rules:
 *   - age < 200 → never due
 *   - age >= 200, no prior review → due
 *   - age >= 200, prior review exists → due only if 100+ days since that review
 *
 * This produces the cadence: 200 → review, 300 → review, 400 → review, etc.
 */
export function isAgeReviewDue(ageDays, lastAgeReviewedAt) {
  if (ageDays == null || ageDays < 200) return false;
  if (!lastAgeReviewedAt) return true;
  const lastReview = new Date(lastAgeReviewedAt);
  if (!Number.isFinite(lastReview.getTime())) return true;
  const daysSinceReview = Math.floor((Date.now() - lastReview.getTime()) / MS_PER_DAY);
  return daysSinceReview >= 100;
}