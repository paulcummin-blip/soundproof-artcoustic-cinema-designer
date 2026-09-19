/**
 * buildProjectAuthority.js
 * --------------------------------
 * Layer 1 — Project identity sub-authority.
 * Pure function. No GPT. No side effects.
 */

export function buildProjectAuthority(project, version) {
  return {
    project_name: project?.name || 'Untitled Project',
    client_name: project?.client_name || '',
    dealer_company: '', // Populated by buildDealerAuthority
    version_id: version?.id || null,
    version_name: version?.version_name || 'Current Design',
    version_number: version?.version_number || 1,
    date: new Date().toISOString().split('T')[0],
  };
}