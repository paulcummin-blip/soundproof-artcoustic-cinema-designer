/**
 * libraryFormat.js
 * ----------------
 * One date format for every Project Library row, so a generated date and an
 * export date read the same way everywhere on the page.
 */

/** "04 Oct 2026", or null when there is no readable date. */
export function formatLibraryDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}