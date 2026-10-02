// ProjectOpeningResolver.jsx
// --------------------------
// Headless resolver mounted by ProjectGate while the project opening panel is
// on screen. It answers the "is this saved stage restored?" questions by
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
// Every stage resolves to a definite OUTCOME, never to a bare "unavailable":
//
//   ready           restored and usable
//   not-generated   nothing is saved for this stage yet — a valid end state
//   not-applicable  the stage does not exist for this version
//   stale           something is saved but no longer matches the design
//   failed          the stage could not be confirmed — warned, never silent
//
// Two rules are enforced here rather than left to the consumers:
//
//   1. A partial live handoff never counts as restored. A browser-session result
//      only answers for RP22/bass when it actually states the bass authority;
//      otherwise the stage is reported as out of date, so a report can never
//      read a half-settled live state as the saved authority.
//   2. Bass is never released while it is still calculating: while a bass
//      analysis is genuinely running for this project the stage is held as
//      restoring, so the panel cannot close underneath it.
//
// Every check is bounded: a failed read resolves that stage with a reason.

import { useEffect, useRef } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { useProjectHydration } from "@/components/state/projectHydrationStore";
import {
  beginProjectOpening,
  getProjectOpening,
  isProjectOpeningSatisfied,
  markProjectOpeningSatisfied,
  OPENING_CHECKPOINT_OUTCOME as OUTCOME,
  OPENING_CHECKPOINT_STATE as CHECKPOINT,
  resolveProjectOpeningCheckpoint,
  resolveProjectOpeningCheckpoints,
  useProjectOpening,
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
  statesBassAuthority,
} from "@/components/engineering/versionedEngineeringAuthority";
import {
  resolveProposalSource,
  verifySourceIdentity,
} from "@/components/proposal/sourceAuthority/proposalSourceAuthority";

const P14_TARGET_BANK_SIZE = 8;

/** How often the live bass state is re-read while the panel is open. */
const BASS_WATCH_INTERVAL_MS = 500;

// ── Stage resolutions ─────────────────────────────────────────────────────
const ready = (detail) => ({ state: CHECKPOINT.READY, outcome: OUTCOME.READY, detail });
const notGenerated = (detail) => ({ state: CHECKPOINT.UNAVAILABLE, outcome: OUTCOME.NOT_GENERATED, detail });
const notApplicable = (detail) => ({ state: CHECKPOINT.UNAVAILABLE, outcome: OUTCOME.NOT_APPLICABLE, detail });
const stale = (detail) => ({ state: CHECKPOINT.UNAVAILABLE, outcome: OUTCOME.STALE, detail });
const failed = (detail) => ({ state: CHECKPOINT.UNAVAILABLE, outcome: OUTCOME.FAILED, detail });
const restoring = (detail) => ({ state: CHECKPOINT.PENDING, outcome: null, detail });

/**
 * One report's source state, in the opening vocabulary. The states come from the
 * canonical proposal source resolver — this only names them.
 */
function reportStageStatus(report, fallbackDetail) {
  switch (report?.state) {
    case "current":
      return ready(report.reason || "Source is current for this version.");
    case "stale":
      return stale(report.reason || "This source no longer matches the design.");
    case "failed":
      return failed(report.reason || "This source is unavailable.");
    default:
      return notGenerated(report?.reason || fallbackDetail);
  }
}

const PARTIAL_LIVE_DETAIL =
  "Only a partial result is available in this browser session — the saved RP22 and bass authority is not restored. Recalculate to publish it.";

export default function ProjectOpeningResolver({ projectId, entrySurface = null }) {
  const hydration = useProjectHydration();
  const app = useAppState();
  const opening = useProjectOpening(projectId || null);
  const attempt = opening.attempt;

  const isActiveProject = !!projectId && hydration.projectId === projectId;
  const identity = isActiveProject ? hydration.identity : null;
  const versionId = identity?.activeVersionId || null;
  const designReady = isActiveProject && hydration.design === "loaded";

  // One authority read per project + version + attempt. The panel may already
  // have closed by the time a slow read lands; the recorded state is still the
  // real one.
  const readKeyRef = useRef(null);
  // The authority's own answer for bass, re-applied whenever a live bass
  // analysis settles. Held in a ref so the watcher below never re-reads it.
  const bassAuthorityRef = useRef(null);

  // ── 1 · Begin the opening (idempotent) ──────────────────────────────────
  useEffect(() => {
    if (!projectId) return;
    if (isProjectOpeningSatisfied(projectId)) {
      markProjectOpeningSatisfied(projectId);
      return;
    }
    beginProjectOpening(projectId, { versionId, entrySurface });
  }, [projectId, versionId, entrySurface]);

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
        : notApplicable("This project has no saved design version yet."),
      roomSeating: dims.widthM && dims.lengthM
        ? ready(seats > 0
          ? `Room dimensions and ${seats} seating position${seats === 1 ? "" : "s"} restored.`
          : "Room dimensions restored — no seating positions saved yet.")
        : failed("The saved design carries no room dimensions."),
      speakerLayout: speakers > 0
        ? ready(`${speakers} loudspeaker${speakers === 1 ? "" : "s"}${subs > 0 ? ` and ${subs} subwoofer${subs === 1 ? "" : "s"}` : ""} restored.`)
        : ready("No loudspeaker layout is saved for this project."),
      seatPriorities: ready("Seat priorities restored from the saved design."),
    });
  }, [
    designReady,
    identity,
    versionId,
    attempt,
    app?.seatingPositions,
    app?.speakerSystem?.placedSpeakers,
    app?.subwooferInstances,
    app?.roomDims,
  ]);

  // ── 3 · The version-scoped authority reads (read-only) ──────────────────
  // Re-read on Retry: the read key carries the attempt, so a retry re-asks
  // rather than re-using an answer that already failed to arrive.
  useEffect(() => {
    if (!projectId || !designReady) return undefined;

    const readKey = `${projectId}::${versionId || "none"}::${attempt}`;
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
      const publication = durable?.publication || null;
      const durableStale = authorityState === ENGINEERING_AUTHORITY_STATE.PUBLISHED_STALE;

      // A browser-session result only answers for RP22/bass when it states the
      // bass authority. A partial transient handoff (published while the bass
      // assessment was still settling) must never be reported as restored.
      const localSummary = localSnapshot?.engineeringSummary
        ?? localSnapshot?.rating?.engineeringSummary
        ?? null;
      const durableRestored = authorityState === ENGINEERING_AUTHORITY_STATE.PUBLISHED_CURRENT;
      const liveRestored = authorityState === ENGINEERING_AUTHORITY_STATE.LOCAL_ONLY
        && statesBassAuthority(localSummary);
      const restored = durableRestored || liveRestored;
      const partialLive = authorityState === ENGINEERING_AUTHORITY_STATE.LOCAL_ONLY && !liveRestored;

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
          hasSource: restored,
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

      const rp22Stage = restored
        ? ready("RP22 and RP23 results restored from the saved analysis.")
        : durableStale
          ? stale("The saved RP22 results are out of date — recalculation required.")
          : partialLive
            ? stale(PARTIAL_LIVE_DETAIL)
            : notGenerated("No saved RP22 results for this version — the design opens uncalculated.");

      const bassStage = restored
        ? ready("Performance is current — the saved result is restored, nothing recalculates.")
        : durableStale
          ? stale("Saved bass performance is out of date — recalculation required.")
          : partialLive
            ? stale(PARTIAL_LIVE_DETAIL)
            : notGenerated("No saved bass result — bass performance requires recalculation.");

      bassAuthorityRef.current = bassStage;

      resolveProjectOpeningCheckpoints({
        rp22: rp22Stage,
        bass: bassStage,

        bassTargetBank: !versionId
          ? notApplicable("No saved design version — there is no target bank to restore.")
          : bankCount >= P14_TARGET_BANK_SIZE
            ? ready(`All ${P14_TARGET_BANK_SIZE} saved target results restored.`)
            : bankCount > 0
              ? ready(`${bankCount} of ${P14_TARGET_BANK_SIZE} saved target results restored; the rest rebuild when bass is next calculated.`)
              : notGenerated("No saved target bank for this design — targets rebuild when bass is next calculated."),

        visualReport: reports
          ? reportStageStatus(reports.reports.visual, "Visual Report has not been generated for this version.")
          : notApplicable("No saved design version — no Visual Report source."),

        technicalReport: reports
          ? reportStageStatus(reports.reports.technical, "Technical Report has not been generated for this version.")
          : notApplicable("No saved design version — no Technical Report source."),

        proposalSource: reports
          ? (reports.ready
            ? ready("Proposal source reports are current for this version.")
            : reports.state === "stale"
              ? stale("Proposal source reports no longer match this version — regenerate them before proposing.")
              : reports.state === "failed"
                ? failed("Proposal source reports are unavailable for this version.")
                : notGenerated("No proposal source yet — the Visual and Technical Reports have not been generated for this version."))
          : notApplicable("No saved design version — no proposal source data."),

        pricing: commercialLoaded
          ? ready("Priced selections and price basis restored.")
          : failed("Priced selections were not confirmed for this version."),

        autosaveBaseline: commercialLoaded
          ? ready("Editing baseline established — no default state is written during load.")
          : failed("Editing baseline not confirmed — saving stays paused until it is."),
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, versionId, designReady, attempt]);

  // ── 4 · Bass is never released while it is still calculating ────────────
  // While a bass analysis is genuinely running for this project the stage is
  // held as restoring, so the panel cannot close and hand a report a
  // half-restored bass authority. When it settles, the authority's own answer is
  // re-applied — this watcher never decides a result of its own.
  useEffect(() => {
    if (!projectId) return undefined;

    let stopped = false;
    let handle = null;

    const stop = () => {
      stopped = true;
      if (handle != null) clearInterval(handle);
      handle = null;
    };

    const tick = () => {
      if (stopped) return;
      const snapshot = getProjectOpening();
      if (String(snapshot.projectId || "") !== String(projectId) || snapshot.closed) {
        stop();
        return;
      }
      if (readBassPendingIndicator(projectId)) {
        resolveProjectOpeningCheckpoint("bass", restoring(
          "Bass analysis is still running for this project — the saved result is restored when it settles.",
        ));
        return;
      }
      if (bassAuthorityRef.current) {
        resolveProjectOpeningCheckpoint("bass", bassAuthorityRef.current);
      }
    };

    handle = setInterval(tick, BASS_WATCH_INTERVAL_MS);
    tick();

    return stop;
  }, [projectId, attempt]);

  return null;
}