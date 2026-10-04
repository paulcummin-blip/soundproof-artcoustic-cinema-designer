/**
 * The first-page project metadata line for the Visual Report:
 *
 *   Marquee Home · Ref: 6ABBCA66 · 29 September 2026
 *
 * Composed once, so the on-screen masthead and the exported PDF first page
 * state the identical line. Only the dealer-assigned project reference is a
 * report reference — the client name is never used as one, and vice versa.
 */

export function clientReportHeaderMeta(projectDetails) {
  const projectName = projectDetails?.name || 'Untitled';
  const clientName = projectDetails?.client_name || '';
  const projectRef = projectDetails?.project_reference?.trim() || '';

  let createdDateStr = '';
  const createdDate = projectDetails?.created_date;
  if (createdDate) {
    const d = new Date(createdDate);
    if (!isNaN(d.getTime())) {
      createdDateStr = d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
    }
  }

  return [
    projectName,
    clientName || null,
    projectRef ? `Ref: ${projectRef}` : null,
    createdDateStr || null,
  ].filter(Boolean).join(' · ');
}