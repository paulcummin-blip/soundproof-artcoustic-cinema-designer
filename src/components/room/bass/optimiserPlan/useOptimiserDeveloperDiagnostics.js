// useOptimiserDeveloperDiagnostics.js
// ---------------------------------------------------------------------------
// THE ONE GATE FOR THE OPTIMISER'S DEVELOPER DIAGNOSTICS.
//
// The Bass Optimisation panel states a decision to a dealer who may be sitting
// with their client. Internal diagnostics — fingerprints, candidate ids, schema
// and protocol identifiers, cache and job internals, raw search-space totals,
// persistence diagnostics, per-candidate logs — are engineering material, not
// product. They are therefore rendered only when a Sound Proof admin has the
// internal debug mode switched on.
//
// Both must hold:
//   • Engineering Mode is enabled (the session-scoped internal developer switch,
//     Options panel)
//   • the signed-in user is a Sound Proof master admin
//
// A normal dealer/user therefore never sees them, whatever the app is doing.
// Nothing is deleted: the evidence is still saved, still readable under the
// debug gate, and every report keeps consuming it.
// ---------------------------------------------------------------------------

import { useEngineeringMode } from "@/components/state/useEngineeringMode";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin } from "@/lib/accountAccess";

/** True only for a Sound Proof admin with the internal debug mode enabled. */
export function useOptimiserDeveloperDiagnostics() {
  const { engineeringMode } = useEngineeringMode();
  const { user } = useAuth();
  return engineeringMode === true && isMasterAdmin(user) === true;
}