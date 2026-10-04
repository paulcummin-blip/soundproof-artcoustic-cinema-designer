/**
 * The identity context an exported report filename is built from.
 *
 * Export identity is not cover branding: internal accounts are valid filenames.
 * The project name, client name and reference are read ONLY from the project
 * record (with the owning account supplying the dealer name when the project
 * carries no stamped dealer of its own), so a filename can never pick up an
 * unrelated account, a version name, or a display fallback.
 */
export function resolveReportFilenameDetails(project, account = null) {
  const owningAccount = account?.id && account.id === project?.account_id ? account : null;
  const accountName = owningAccount?.name?.trim();
  // Sound Proof's internal account label is not its client-facing company name.
  const filenameAccountName = accountName === 'Sound Proof Admin Account' ? 'Sound Proof' : accountName;
  return {
    dealerName: project?.dealer_name?.trim() || filenameAccountName || null,
    projectName: project?.name?.trim() || null,
    clientName: project?.client_name?.trim() || null,
    projectReference: project?.project_reference?.trim() || null,
  };
}

/**
 * Debug aid for export acceptance: state the identity context a filename is
 * built from — dealer/account, project name, client name, project reference and
 * the report type — before the filename itself is built.
 *
 * @param {{ dealerName?: string, projectName?: string, clientName?: string, projectReference?: string }} details
 * @param {string} [reportType] - the report-type token the filename will carry
 */
export function logReportExportIdentity(details, reportType = null) {
  console.debug('[report-filename] export identity', {
    report_type: reportType || null,
    dealer: details?.dealerName || null,
    project_name: details?.projectName || null,
    client_name: details?.clientName || null,
    project_reference: details?.projectReference || null,
  });
}