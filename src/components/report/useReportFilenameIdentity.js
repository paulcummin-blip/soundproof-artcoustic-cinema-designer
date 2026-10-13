import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import {
  resolveReportFilenameDetails,
  logReportExportIdentity,
} from '@/components/report/reportFilenameIdentity';

/**
 * The identity an exported document's filename is named from, resolved at export
 * time from the records that actually own each field.
 *
 * A frozen report project (frozenPublicationProject) is the report's PRESENTATION
 * object: it carries the design the report was generated from, and it does not
 * carry the project's dealer, client name or reference. Naming a file from it
 * silently drops those segments — and engineering evidence is never rewritten to
 * fix a filename. Identity is therefore always read from the authorities:
 *
 *   project name / client name / project reference — the Project record
 *   dealer name  — the project's stamped dealer_name, otherwise the owning Account
 *   design version — supplied by the caller from the version authority
 *
 * Nothing is invented: a field the records do not hold is omitted from the
 * filename rather than guessed, and the export waits until the identity has
 * resolved. The same hook serves the report export, its Speaker Design companion
 * and the Current Speaker Design panel, so one project's documents can never be
 * named differently from each other.
 */

/** The Project fields that own export identity. */
const PROJECT_IDENTITY_FIELDS = ['name', 'client_name', 'project_reference', 'dealer_name', 'account_id'];

export default function useReportFilenameIdentity(project) {
  const canonical = useCanonicalProject();
  const projectId = project?.id || project?.project_id || null;

  // The Project record is the identity authority for this project. Reading it
  // here is what keeps a frozen report project from costing the filename its
  // dealer, client name and reference.
  const projectQuery = useQuery({
    queryKey: ['report-filename-project', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const page = await base44.entities.Project.filter({ id: projectId }, { limit: 1, fields: PROJECT_IDENTITY_FIELDS });
      return page?.items?.[0] || null;
    },
    staleTime: 60000,
  });

  // Never a half-resolved identity: until the Project record is read, only the
  // caller's own project object is available (its stamped fields, or nothing).
  const source = projectQuery.data || project || null;
  const accountId = source?.account_id || null;

  const identity = canonical.projectId === projectId ? canonical.identity : null;
  const canonicalAccount = accountId && identity?.accountId === accountId && identity?.accountName
    ? { id: accountId, name: identity.accountName }
    : null;

  // The owning Account names the dealer only while the project carries no
  // stamped dealer of its own — and never an unrelated account.
  const needsAccount = !!accountId && !source?.dealer_name?.trim() && !canonicalAccount;
  const account = useQuery({
    queryKey: ['report-filename-account', accountId],
    enabled: needsAccount,
    queryFn: async () => {
      const page = await base44.entities.Account.filter({ id: accountId }, { limit: 1, fields: ['name'] });
      return page?.items?.[0] || null;
    },
    staleTime: 60000,
  });

  const resolved = {
    ...resolveReportFilenameDetails(source, canonicalAccount || account.data),
    ready: !!projectId && !projectQuery.isLoading && (!needsAccount || !account.isLoading),
  };

  // The export identity context is stated once per change, so a filename built
  // from a half-resolved identity is visible rather than guessed at.
  const identityKey = [
    resolved.dealerName,
    resolved.projectName,
    resolved.clientName,
    resolved.projectReference,
    resolved.ready,
  ].join('|');
  useEffect(() => {
    if (resolved.ready) logReportExportIdentity(resolved);
  }, [identityKey]);

  return resolved;
}