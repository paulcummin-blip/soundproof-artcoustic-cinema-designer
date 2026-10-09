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

export default function useSharedBassAuthorityState() {
  const shared = useSharedBassResults();
  const publicationAttempt = usePublicationAttempt(
    shared?.scopeId || null,
    shared?.versionId || null,
  );

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
      lifecycleState: effectiveLifecycle,
      calculationInProgress: shared?.calculationInProgress,
      placementPreviewActive: shared?.placementPreviewActive,
    }),
  };
}