/**
 * assetTimestamp
 * --------------
 * Shared timestamp formatting and ordering for the Project Assets section.
 *
 * The actual stored creation timestamp (the entity built-in `created_date`) is
 * the single authority for both the hover tooltip and the within-group sort —
 * never the last-modified date, the export time or any download time.
 *
 *   formatAssetDate        → the retained short date, e.g. "26 Nov 2026"
 *   formatAssetTimestamp   → the full local-time tooltip, e.g.
 *                           "26 Nov 2026 at 15:08:24" (24-hour, user timezone)
 *   sortAssetsByCreatedDesc → combine issued PDFs and uploaded images into one
 *                           list ordered by created_date, newest first, so a
 *                           newly created document of any type appears at the
 *                           top of its group.
 */

const DATE_OPTIONS = { day: '2-digit', month: 'short', year: 'numeric' };
const TIME_OPTIONS = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };

export function formatAssetDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-GB', DATE_OPTIONS);
  } catch {
    return '';
  }
}

export function formatAssetTimestamp(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const datePart = d.toLocaleDateString('en-GB', DATE_OPTIONS);
    const timePart = d.toLocaleTimeString('en-GB', TIME_OPTIONS);
    return `${datePart} at ${timePart}`;
  } catch {
    return '';
  }
}

/**
 * Combine issued-PDF records and uploaded-image records into a single list
 * ordered by the actual stored creation timestamp, newest first. Records
 * without a file are skipped. Entries carry `{ record, kind }` where kind is
 * 'export' or 'image', so the caller renders each with the right icon/actions.
 */
export function sortAssetsByCreatedDesc(exportRecords = [], imageRecords = []) {
  const entries = [];
  for (const record of exportRecords) {
    if (record?.file_uri || record?.file_url) entries.push({ record, kind: 'export' });
  }
  for (const record of imageRecords) {
    if (record?.file_url) entries.push({ record, kind: 'image' });
  }
  return entries.sort((a, b) => {
    const ta = a.record?.created_date ? new Date(a.record.created_date).getTime() : 0;
    const tb = b.record?.created_date ? new Date(b.record.created_date).getTime() : 0;
    return tb - ta;
  });
}