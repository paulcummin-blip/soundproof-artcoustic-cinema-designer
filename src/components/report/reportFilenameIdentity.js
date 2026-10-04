// Export identity is not cover branding: internal accounts are valid filenames.
// The reference is read ONLY from the parent Project, never from client/version.
export function resolveReportFilenameDetails(project, account = null) {
  const owningAccount = account?.id && account.id === project?.account_id ? account : null;
  const accountName = owningAccount?.name?.trim();
  // Sound Proof's internal account label is not its client-facing company name.
  const filenameAccountName = accountName === 'Sound Proof Admin Account' ? 'Sound Proof' : accountName;
  return {
    dealerName: project?.dealer_name?.trim() || filenameAccountName || null,
    projectReference: project?.project_reference?.trim() || null,
  };
}