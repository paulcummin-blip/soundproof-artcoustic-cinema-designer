// useSharedBassAuthorityState — the ONE way any P14 / P18 / P19 / P20 surface
// reads the state of the bass result it sits beside.
//
// PRESENTATION ONLY. It assembles exactly the inputs the authority band uses
// and hands them to the single resolver, so every visible badge names the same
// state as the band: Preview only, Needs calculation, Calculated — not
// published, Current (or Calculating). It computes no engineering value and
// holds no state of its own.
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { usePublicationAttempt } from "@/components/engineering/publicationAcknowledgementStore";
import { resolveBassAuthorityState } from "@/components/room/bass/bassAuthorityState";
import { useEffectiveBassLifecycleState } from "@/components/room/bass/bda/useEffectiveBassLifecycle";
import { useBassReconciliationStatus } from "@/components/room/bass/bassReconciliationStatus";

export default function useSharedBassAuthorityState() {
  const shared = useSharedBassResults();
  const publicationAttempt = usePublicationAttempt(
    shared?.scopeId || null,
    shared?.versionId || null,
  );
  // The outcome of the durable write of this version's result. A failed write
  // must never be reported as current, so the band reads it here — it is the
  // same status the write queue publishes, not a second record of it.
  const durableWrite = useBassReconciliationStatus(shared?.scopeId, shared?.versionId);

  const effectiveLifecycle = useEffectiveBassLifecycleState(shared?.scopeId, shared?.versionId, shared?.bassLifecycleState);
  const publication = shared?.engineeringPublication;
  return {
    shared,
    publicationAttempt,
    authorityState: resolveBassAuthorityState({
      projectId: shared?.scopeId,
      versionId: shared?.versionId,
      completedBassAuthority: shared?.completedBassAuthority,
      publicationAttempt,
      engineeringFingerprint: publication?.fingerprint,
      publicationBassFingerprint: publication?.bassFingerprint,
      durable: publication?.durable,
      durableWrite,
      lifecycleState: effectiveLifecycle,
      calculationInProgress: shared?.calculationInProgress,
      placementPreviewActive: shared?.placementPreviewActive,
    }),
  };
}