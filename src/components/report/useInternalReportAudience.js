// useInternalReportAudience.js
// ----------------------------
// WHO MAY SEE REPORT DIAGNOSTICS.
//
// This is the same internal-audience rule the Room Designer's engineering status
// row already applies, kept in one place so every report surface answers it
// identically:
//   · an explicit Engineering Mode / developer session, or
//   · a true internal master admin, which is never account scoped — a dealer's
//     own account administrator is account scoped, so it does not qualify.
//
// A dealer, a dealer's account administrator and a client all resolve to false,
// which is what removes every diagnostics affordance from the standard report
// experience.
//
// Presentation only: this decides whether a diagnostics disclosure may exist. It
// never changes report authority, staleness detection, fingerprint logic,
// regeneration or saved-report behaviour.

import { useAuth } from '@/lib/AuthContext';
import { useEngineeringMode } from '@/components/state/useEngineeringMode';

export function resolveInternalReportAudience(user, engineeringMode) {
  if (engineeringMode === true) return true;
  const accountScoped = Boolean(
    user?.access_context?.account?.id || user?.access_context?.user?.account_id,
  );
  return user?.access_context?.capabilities?.masterAdmin === true && !accountScoped;
}

export default function useInternalReportAudience() {
  const { user } = useAuth();
  const { engineeringMode } = useEngineeringMode();
  return resolveInternalReportAudience(user, engineeringMode);
}