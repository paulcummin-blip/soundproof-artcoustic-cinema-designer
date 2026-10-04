import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCanonicalProject } from '@/components/state/projectHydrationStore';
import { resolveReportFilenameDetails } from '@/components/report/reportFilenameIdentity';

// Wait for the owning account when the project has no stamped dealer name.
// Account query is shared/cached; never use the current user's unrelated account.
export default function useReportFilenameIdentity(project) {
  const canonical = useCanonicalProject();
  const identity = canonical.projectId === project?.id ? canonical.identity : null;
  const canonicalAccount = identity?.accountId === project?.account_id && identity?.accountName
    ? { id: project.account_id, name: identity.accountName } : null;
  const needsAccount = !!project?.account_id && !project?.dealer_name?.trim() && !canonicalAccount;
  const account = useQuery({
    queryKey: ['report-filename-account', project?.account_id],
    enabled: needsAccount,
    queryFn: async () => {
      const page = await base44.entities.Account.filter({ id: project.account_id }, { limit: 1, fields: ['name'] });
      return page.items[0] || null;
    },
    staleTime: 60000,
  });
  return {
    ...resolveReportFilenameDetails(project, canonicalAccount || account.data),
    ready: !!project && (!needsAccount || account.isSuccess),
  };
}