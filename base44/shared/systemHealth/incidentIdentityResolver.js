/**
 * incidentIdentityResolver.js (shared)
 * -------------------------------------
 * Resolves account (dealer) and project names for incident records, and
 * reads the System Health alert configuration from the SystemConfig singleton.
 *
 * Extracted from incidentRecorder.js to keep the recorder focused on the
 * recording flow.
 *
 * Backend-only: receives the service-role SDK client from the calling function.
 */

/**
 * Read the System Health alert configuration from the SystemConfig singleton.
 */
export async function readAlertConfig(serviceClient) {
  try {
    const result = await serviceClient.asServiceRole.entities.SystemConfig.filter({}, { limit: 1 });
    const record = (Array.isArray(result) ? result : result?.items || [])[0] || null;
    const config = record?.system_health || {};
    return {
      enabled: config.alerts_enabled === true,
      recipients: Array.isArray(config.alert_recipients) ? config.alert_recipients : [],
    };
  } catch {
    return { enabled: false, recipients: [] };
  }
}

/**
 * Resolve the account (dealer) and project names when the IDs are known.
 * Returns { accountName, dealerName, projectName, clientName, projectReference, versionName }
 * with null for any value that cannot be resolved. Never invents identity information.
 */
export async function resolveIncidentIdentity(serviceClient, { account_id, project_id, version_id }) {
  const identity = { accountName: null, dealerName: null, projectName: null, clientName: null, projectReference: null, versionName: null };
  const first = (r) => (Array.isArray(r) ? r : r?.items || [])[0] || null;
  let project = null;
  if (project_id) {
    try {
      project = first(await serviceClient.asServiceRole.entities.Project.filter({ id: project_id }, '-updated_date', 1));
      identity.projectName = project?.name || null;
      identity.clientName = project?.client_name || null;
      identity.projectReference = project?.project_reference || null;
      identity.dealerName = project?.dealer_name || null;
    } catch {}
  }
  const accountId = project?.account_id || account_id;
  if (accountId) {
    try {
      const account = first(await serviceClient.asServiceRole.entities.Account.filter({ id: accountId }, '-updated_date', 1));
      identity.accountName = account?.name || null;
      identity.dealerName ||= account?.name || null;
    } catch {}
  }
  if (version_id && project_id) {
    try {
      const version = first(await serviceClient.asServiceRole.entities.ProjectVersion.filter({ id: version_id, project_id }, '-updated_date', 1));
      identity.versionName = version?.name || version?.version_name || null;
    } catch {}
  }
  return identity;
}