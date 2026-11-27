/**
 * accountUserDisplayRefresh.js (shared)
 * -------------------------------------
 * Builds the HTTP response after a confirmed account-user mutation. The
 * protected membership/user/audit writes have already succeeded
 * (lockResult.displayStatus); this only decides how to report that outcome
 * when the subsequent display refresh is attempted.
 *
 * A refresh failure is NEVER reported as a mutation failure: the dealer keeps
 * the existing rows and is offered a Refresh action that only re-reads the
 * user list (no repeated mutation, no duplicate audit). Genuine mutation
 * failures and uncertain write outcomes never reach this helper — they throw
 * and are reported by the handler's outer catch.
 */
export function buildMutationDisplayResponse({ displayStatus, account, refreshResult, refreshError }) {
  const status = displayStatus || 200;
  if (refreshError) {
    return Response.json({
      account: account
        ? { id: account.id, name: account.name, account_type: account.account_type, status: account.status }
        : null,
      mutation_saved: true,
      refresh_warning: 'Change saved. Refresh the user list.',
    }, { status });
  }
  return Response.json(refreshResult, { status });
}