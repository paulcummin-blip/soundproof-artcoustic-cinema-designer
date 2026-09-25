// BassDesignAssistant.jsx
//
// Bass Design Assistant — Frozen UX Workflow
//
// The workflow is:
//   1. Choose Layout
//   2. Choose Design Target
//   3. Calculate Performance
//   4. Understand Performance   (Sprint 2)
//   5. Optimise Bass             (Sprint 2)
//   6. Presentation              (Sprint 2)
//
// Sprint 1 implements stages 1–3 only.
//
// This is a PRESENTATION and INFORMATION-ARCHITECTURE change only.
// It does NOT change acoustics maths, P14/P18/P19/P20 grading, optimiser
// scoring, subwoofer prediction logic, or canonical result authority.
//
// It consumes existing shared authority only:
//   - useSharedBassResults()           → lifecycle, authority, seating
//   - OptimiseAndCalculate              → single calculation action
//   - StartingLayoutCards              → Stage 1 (Choose Layout)
//   - CurrentLayoutBanner              → compact layout summary
//   - ChooseDesignTarget               → Stage 2 (P14 + P18 design objectives)
//
// When implementation decisions conflict with the existing UI, prefer the
// frozen workflow over the existing interface. The Subwoofer Design
// Experience is now the product authority.

import React, { useState, useEffect, useMemo, useRef, Suspense } from "react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";
import OptimiseAndCalculate from "@/components/room/bass/optimiseWorkflow/OptimiseAndCalculate";
import StartingLayoutCards from "@/components/room/bass/bda/StartingLayoutCards";
import ChooseDesignTarget from "@/components/room/bass/bda/ChooseDesignTarget";
import CurrentDesignBar from "@/components/room/bass/bda/CurrentDesignBar";
import GraphHeaderPills from "@/components/room/bass/bda/GraphHeaderPills";
import PerSeatResults from "@/components/room/bass/bda/PerSeatResults";

const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse").then((m) => ({ default: m.default ?? m.BassResponse }))
);

export default function BassDesignAssistant({
  appState,
  frontSubsCfg,
  rearSubsCfg,
  disabled,
  roomDims,
  seatingPositions,
  subWarnings,
  onChangeSpeakerConfig,
}) {
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const shared = useSharedBassResults();

  const subwooferInstances = appState?.subwooferInstances || [];
  const hasSubwoofers = subwooferInstances.some((s) => s?.enabled !== false);
  const hasResults = shared?.hasCurrentResult === true;
  const isCalculating = shared?.calculationInProgress === true;
  const isPlacementPreview = shared?.placementPreviewActive === true;
  // Lifecycle state consumed from the sole authority — no independent derivation.
  const bassLifecycleState = shared?.bassLifecycleState || null;

  // Fix flash: initialize based on whether subs already exist at first render.
  // This prevents the one-frame flash of layout cards on projects that
  // already have subwoofers.
  const [showLayoutCards, setShowLayoutCards] = useState(!hasSubwoofers);
  const hadSubsRef = useRef(hasSubwoofers);

  // Collapse layout cards when subwoofers first appear (async hydration)
  useEffect(() => {
    if (hasSubwoofers && !hadSubsRef.current) {
      setShowLayoutCards(false);
    }
    hadSubsRef.current = hasSubwoofers;
  }, [hasSubwoofers]);

  // RSP position for the layout advisor
  const rspPosition = useMemo(() => {
    const appRsp = appState?.mlp;
    if (Number.isFinite(appRsp?.x) && Number.isFinite(appRsp?.y)) return appRsp;
    const widthM = Number(roomDims?.widthM ?? roomDims?.width);
    const y = Number(appState?.mlpY_m);
    return Number.isFinite(widthM) && Number.isFinite(y) ? { x: widthM / 2, y, z: 1.2 } : null;
  }, [appState?.mlp, appState?.mlpY_m, roomDims]);

  const sourceHeights = useMemo(() => ({
    front: frontSubsCfg?.bottomHeightM,
    rear: rearSubsCfg?.bottomHeightM,
  }), [frontSubsCfg?.bottomHeightM, rearSubsCfg?.bottomHeightM]);

  const handleLayoutApplied = () => {
    setShowLayoutCards(false);
  };

  // Wrap commitInstances to auto-collapse after apply
  const wrappedCommitInstances = (instances, ...rest) => {
    if (typeof compat.commitInstances === "function") {
      compat.commitInstances(instances, ...rest);
      // Applying a validated starting layout is also the recovery path for a
      // previously malformed empty-model layout restored from persistence.
      appState?.setSubwooferInstancesStatus?.(INSTANCE_STATUS.VALID);
    }
    handleLayoutApplied();
  };

  // Stages 2–3 are visible only when the layout has been chosen
  const layoutChosen = hasSubwoofers && !showLayoutCards;

  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white p-4 space-y-4" data-bda-workflow="true">
      {/* ── Header ── */}
      <div>
        <h3
          className="text-[17px] font-bold text-[#1B1A1A] tracking-tight"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Subwoofer Design
        </h3>
        <div className="text-[10px] font-medium uppercase text-[#625143]" style={{ letterSpacing: '0.08em' }}>
          Artcoustic Design Intelligence
        </div>
      </div>

      {/* ── Zone 1: Current Design ── */}
      {layoutChosen && (
        <CurrentDesignBar
          frontModel={compat.frontModelDisplay}
          frontCount={compat.frontCount}
          rearModel={compat.rearModelDisplay}
          rearCount={compat.rearCount}
          subwooferInstances={subwooferInstances}
          roomDims={roomDims}
          bassLifecycleState={bassLifecycleState}
          statusText={isPlacementPreview ? "Subwoofer positions changed. Previewing room response only." : null}
          onChangeSpeakers={onChangeSpeakerConfig}
          onChangeLayout={() => setShowLayoutCards(true)}
        />
      )}

      {/* ── Choose Layout (when no layout applied) ── */}
      {showLayoutCards && (
        <StartingLayoutCards
          roomDims={roomDims}
          seatingPositions={seatingPositions}
          rspPosition={rspPosition}
          sourceHeights={sourceHeights}
          roomElements={appState?.roomElements}
          currentSubs={subwooferInstances}
          frontSubsCfg={frontSubsCfg}
          rearSubsCfg={rearSubsCfg}
          subwooferInstances={subwooferInstances}
          commitInstances={wrappedCommitInstances}
          hasCanonicalInstances={compat.hasCanonicalInstances}
        />
      )}

      {/* ── Zone 2: Design Target ── */}
      {layoutChosen && (
        <ChooseDesignTarget disabled={disabled} />
      )}

      {/* ── Zone 3: Performance ── */}
      {/* The graph is the primary workspace. P14/P18/P19/P20 are the graph
          header summary — not a separate panel. Click-to-highlight links the
          pills to the graph's limiting frequency. */}
      {layoutChosen && hasResults && (
        <div className="space-y-3">
          <Suspense fallback={<div className="text-[11px] text-[#8A7B6A]">Loading graph…</div>}>
            <div className="rounded-lg border border-[#DCDBD6] bg-white p-3 space-y-2 relative">
              {isCalculating && hasResults && (
                <div className="absolute top-2 right-2 flex items-center gap-1.5 text-[10px] font-medium text-[#625143] bg-[#F4F1EC] px-2 py-1 rounded-md border border-[#E0DCD5]" style={{ zIndex: 10 }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#213428] animate-pulse" />
                  Analysing updated design…
                </div>
              )}
              {/* RP22 summary as graph header strip */}
              <div className={isPlacementPreview ? "opacity-45" : ""}>
                <GraphHeaderPills />
              </div>
              {/* The graph — visual authority for every RP22 result */}
              {shared?.authoritative ? (
                <BassResponse
                  frontSubsCfg={frontSubsCfg}
                  rearSubsCfg={rearSubsCfg}
                  subWarnings={subWarnings}
                  hideHeader={true}
                  engineeringDetailCollapsed={true}
                />
              ) : (
                <div className="text-[11px] text-[#8A7B6A]">Loading graph…</div>
              )}
            </div>
          </Suspense>
          {/* Per-seat P19/P20 detail below the graph */}
          <div className={isPlacementPreview ? "opacity-45" : ""}>
            <PerSeatResults />
          </div>
        </div>
      )}

      {/* ── Zone 4: Recommended Improvement ── */}
      {layoutChosen && (
        <OptimiseAndCalculate
          roomDims={roomDims || appState?.roomDims}
          seatingPositions={seatingPositions}
          subwooferInstances={subwooferInstances}
          frontSubsCfg={frontSubsCfg}
          rearSubsCfg={rearSubsCfg}
          commitInstances={compat.commitInstances}
          commitSeating={appState?.setSeatingPositions}
          commitSeatingProvenance={appState?.setAppliedSeatingProvenance}
          appliedSeatingProvenance={appState?.appliedSeatingProvenance}
          hasCanonicalInstances={compat.hasCanonicalInstances}
          appState={appState}
          disabled={disabled}
          hasResults={hasResults}
        />
      )}
    </div>
  );
}