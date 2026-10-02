// ProjectOpeningResolver.jsx
// --------------------------
// Headless resolver mounted by ProjectGate while the project opening panel is
// on screen. It answers the fifteen "is the saved design restored?" questions by
// READING the authorities the app already has — it calculates nothing,
// recalculates nothing, generates no report, starts no worker and writes
// nothing.
//
//   · project metadata / active version / seat priorities → the canonical
//     hydration store (the same state every page reads)
//   · room, seating and speaker layout → the hydrated design state
//   · pricing / commercial selections → the commercial hydration authority
//   · RP22 / RP23 results and bass performance → the durable Published
//     Engineering Authority for the active version (plus the same-window
//     handoff), exactly as the reports and the sidebar read it
//   · bass target bank → the persisted P14 target cache, restored from the
//     database (the restore the Room Designer performs on load, done earlier so
//     the panel can report it)
//   · Visual Report / Technical Report / Proposal source data → the canonical
//     proposal source resolver over the same publication
//
// Every check is bounded: a failed read resolves that checkpoint as unavailable
// with a reason instead of leaving it pending.

import { useEffect, useRef } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useProjectHydration } from "@/components/state/projectHydrationStore";
import {
  beginProjectOpening,
  isProjectOpeningSatisfied,
  markProjectOpeningSatisfied,
  OPENING_CHECKPOINT_STATE as CHECKPOINT,
  resolveProjectOpeningCheckpoints,
} from "@/components/state/projectOpeningAuthority";
import {
  getActiveCommercialAuthority,
  isCommercialHydrationComplete,
} from "@/components/state/commercialHydrationAuthority";
import {
  readAsdrUnavailableIndicator,
  readBassPendingIndicator,
  readDesignReviewHandoff,
  readSeatPriorityFingerprint,
} from "@/components/state/designReviewHandoff";
import {
  ENGINEERING_AUTHORITY_STATE,
  classifyAuthorityState,
  fetchDurablePublication,
  isAuthorityAvailable,
} from "@/components/engineering/versionedEngineeringAuthority";
import {
  resolveProposalSource,
  verifySourceIdentity,
} from "@/components/proposal/sourceAuthority/proposalSourceAuthority";

const P14_TARGET_BANK_SIZE = 8;

const ready = (detail) => ({ state: CHECKPOINT.READY, detail });
const unavailable = (detail) => ({ state: CHECKPOINT.UNAVAILABLE, detail });

export default function ProjectOpeningResolver({ projectId }) {
  const hydration = useProjectHydration();
  const app = useAppState();

  const isActiveProject = !!projectId && hydration.projectId === projectId;
  const identity = isActiveProject ? hydration.identity : null;
  const versionId = identity?.activeVersionId || null;
  const designReady = isActiveProject && hydration.design === "loaded";

  // One authority read per project + version. The panel may already have closed
  // by the time a slow read lands; the recorded state is still the real one.
  const readKeyRef = useRef(null);

  // ── 1 · Begin the opening (idempotent) ──────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    if (isProjectOpeningSatisfied(projectId)) {
      markProjectOpeningSatisfied(projectId);
      return;
    }
    beginProjectOpening(projectId, { versionId });
  }, [projectId, versionId]);

  // ── 2 · Everything the hydrated design already answers ──────────────────
  useEffect(() => {
    if (!designReady || !identity) return;

    const seats = Array.isArray(app?.seatingPositions) ? app.seatingPositions.length : 0;
    const speakers = Array.isArray(app?.speakerSystem?.placedSpeakers) ? app.speakerSystem.placedSpeakers.length : 0;
    const subs = Array.isArray(app?.subwooferInstances)
      ? app.subwooferInstances.filter((instance) => instance?.enabled !== false).length
      : 0;
    const dims = app?.roomDims || {};

    resolveProjectOpeningCheckpoints({
      metadata: ready(
        [identity.name, identity.clientName].filter(Boolean).join(" · ") || "Project record loaded.",
      ),
      activeVersion: versionId
        ? ready("Active design version resolved.")
        : unavailable("This project has no saved design version yet."),
      roomSeating: dims.widthM && dims.lengthM
        ? ready(seats > 0
          ? `Room dimensions and ${seats} seating position${seats === 1 ? "" : "s"} restored.`
          : "Room dimensions restored — no seating positions saved yet.")
        : unavailable("The saved design carries no room dimensions."),
      speakerLayout: speakers > 0
        ? ready(`${speakers} loudspeaker${speakers === 1 ? "" : "s"}${subs > 0 ? ` and ${subs} subwoofer${subs === 1 ? "" : "s"}` : ""} restored.`)
        : ready("No loudspeaker layout is saved for this project."),
      seatPriorities: ready("Seat priorities restored from the saved design."),
    });
  }, [
    designReady,
    identity,
    versionId,
    app?.seatingPositions,
    app?.speakerSystem?.placedSpeakers,
    app?.subwooferInstances,
    app?.roomDims,
  ]);

  // ── 3 · The version-scoped authority reads (read-only, once) ────────────
  useEffect(() => {
    if (!projectId || !designReady) return undefined;

    const readKey = `${projectId}::${versionId || "none"}`;
    if (readKeyRef.current === readKey) return undefined;
    readKeyRef.current = readKey;

    let cancelled = false;

    (async () => {
      const localSnapshot = versionId ? readDesignReviewHandoff(projectId, versionId) : null;

      let durable = null;
      try {
        durable = versionId ? await fetchDurablePublication(projectId, versionId) : null;
      } catch (error) {
        durable = null;
      }
      if (cancelled) return;

      const authorityState = classifyAuthorityState({ durable, localSnapshot });
      const authorityAvailable = isAuthorityAvailable(authorityState);
      const publication = durable?.publication || null;
      const stale = authorityState === ENGINEERING_AUTHORITY_STATE.PUBLISHED_STALE;

      // The P14 target bank: restore the persisted bank, then report what it
      // holds. Loaded lazily so the opening panel adds nothing to the initial
      // bundle. No recalculation is triggered by this read.
      let bank = null;
      if (versionId) {
        try {
          const cache = await import("@/components/room/bass/p14TargetCache");
          await cache.hydrateTargetCache(projectId, versionId);
          if (cancelled) return;
          bank = cache.getTargetBankIdentity(projectId, versionId);
        } catch (error) {
          bank = null;
        }
      }
      if (cancelled) return;

      const bankCount = Number.isFinite(Number(bank?.count)) ? Number(bank.count) : 0;
      const identityCheck = verifySourceIdentity({
        projectId,
        versionId,
        sourceProjectId: localSnapshot?.projectId || null,
        sourceVersionId: localSnapshot?.versionId || null,
      });
      const reports = versionId
        ? resolveProposalSource({
          projectId,
          versionId,
          hasSource: authorityAvailable,
          identityVerified: identityCheck.ok,
          identityMismatches: identityCheck.mismatches,
          designMovedOn: (() => {
            const live = readSeatPriorityFingerprint(projectId);
            const published = localSnapshot?.rating?.seatPriorityFingerprint
              || localSnapshot?.engineeringSummary?.seatPriorityFingerprint
              || null;
            return !!(live && published && live !== published);
          })(),
          recalculationPending: readBassPendingIndicator(projectId),
          unavailable: readAsdrUnavailableIndicator(projectId),
          reportGeneratedAt: publication?.published_at || localSnapshot?.publishedAt || null,
          sourceFingerprint: publication?.engineering_fingerprint || localSnapshot?.engineeringFingerprint || null,
        })
        : null;

      const commercialLoaded = isCommercialHydrationComplete(
        getActiveCommercialAuthority(),
        projectId,
        versionId,
      );

      resolveProjectOpeningCheckpoints({
        rp22: authorityAvailable
          ? ready("RP22 and RP23 results restored from the saved analysis.")
          : unavailable(stale
            ? "The saved RP22 results are out of date — recalculation required."
            : "No saved RP22 results for this version — the design opens uncalculated."),

        bass: authorityAvailable
          ? ready("Performance is current — the saved result is restored, nothing recalculates.")
          : unavailable(stale
            ? "Saved bass performance is out of date — recalculation required."
            : "No saved bass result — bass performance requires recalculation."),

        bassTargetBank: !versionId
          ? unavailable("No saved design version — there is no target bank to restore.")
          : bankCount >= P14_TARGET_BANK_SIZE
            ? ready(`All ${P14_TARGET_BANK_SIZE} saved target results restored.`)
            : bankCount > 0
              ? ready(`${bankCount} of ${P14_TARGET_BANK_SIZE} saved target results restored; the rest rebuild when bass is next calculated.`)
              : unavailable("No saved target bank for this design — targets rebuild when bass is next calculated."),

        visualReport: reports
          ? (reports.reports.visual.state === "current"
            ? ready("Visual Report source is current for this version.")
            : unavailable(reports.reports.visual.reason || "Visual Report has not been generated for this version."))
          : unavailable("No saved design version — no Visual Report source."),

        technicalReport: reports
          ? (reports.reports.technical.state === "current"
            ? ready("Technical Report source is current for this version.")
            : unavailable(reports.reports.technical.reason || "Technical Report has not been generated for this version."))
          : unavailable("No saved design version — no Technical Report source."),

        proposalSource: reports
          ? (reports.ready
            ? ready("Proposal source reports are current for this version.")
            : unavailable("Proposals need a current Visual Report and Technical Report for this version."))
          : unavailable("No saved design version — no proposal source data."),

        pricing: commercialLoaded
          ? ready("Priced selections and price basis restored.")
          : unavailable("Priced selections were not confirmed for this version."),

        autosaveBaseline: commercialLoaded
          ? ready("Editing baseline established — no default state is written during load.")
          : unavailable("Editing baseline not confirmed — saving stays paused until it is."),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId, designReady]);

  return null;
}