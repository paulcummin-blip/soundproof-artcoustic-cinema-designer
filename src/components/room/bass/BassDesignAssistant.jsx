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
import OptimiseAndCalculate from "@/components/room/bass/optimiseWorkflow/OptimiseAndCalculate";
import StartingLayoutCards from "@/components/room/bass/bda/StartingLayoutCards";
import CurrentLayoutBanner from "@/components/room/bass/bda/CurrentLayoutBanner";
import ChooseDesignTarget from "@/components/room/bass/bda/ChooseDesignTarget";
import CurrentSystemSummary from "@/components/room/bass/bda/CurrentSystemSummary";

const BassResponse = React.lazy(() =>
  import("@/components/room/BassResponse").then((m) => ({ default: m.default ?? m.BassResponse }))
);
const BassResultCards = React.lazy(() =>
  import("@/components/room/bass/BassResultCards").then((m) => ({ default: m.default }))
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
  const isStale = shared?.bassLifecycleState === "stale_needs_recalculation" || shared?.calculationOutcome === "stale";

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
          className="text-[15px] font-bold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Subwoofer Design
        </h3>
        <div className="text-[10px] font-medium text-[#625143]" style={{ letterSpacing: '0.04em' }}>
          Powered by Artcoustic Design Intelligence
        </div>
      </div>

      {/* ── Current System summary (hardware owned by Speakers) ── */}
      {layoutChosen && (
        <CurrentSystemSummary
          frontModel={compat.frontModelDisplay}
          frontCount={compat.frontCount}
          rearModel={compat.rearModelDisplay}
          rearCount={compat.rearCount}
          onChangeConfig={onChangeSpeakerConfig}
        />
      )}

      {/* ── Stage 1: Choose Layout ── */}
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

      {/* ── Current Layout banner ── */}
      {layoutChosen && (
        <CurrentLayoutBanner
          subwooferInstances={subwooferInstances}
          roomDims={roomDims}
          hasResults={hasResults}
          isCalculating={isCalculating}
          isStale={isStale}
          onChange={() => setShowLayoutCards(true)}
        />
      )}

      {/* ── ADI presence ── */}
      {layoutChosen && !hasResults && !isCalculating && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#625143]">
          <span className="h-1 w-1 rounded-full bg-[#213428]" />
          ADI is ready to analyse this design.
        </div>
      )}
      {layoutChosen && isCalculating && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#625143]">
          <span className="h-1 w-1 rounded-full bg-[#213428] animate-pulse" />
          ADI is analysing this design…
        </div>
      )}

      {/* ── Stage 2: Choose Design Target ── */}
      {layoutChosen && (
        <ChooseDesignTarget disabled={disabled} />
      )}

      {/* ── Performance: graph + RP22 parameters ── */}
      {layoutChosen && hasResults && (
        <div className="space-y-3">
          <Suspense fallback={<div className="text-[11px] text-[#8A7B6A]">Loading results…</div>}>
            <BassResultCards />
          </Suspense>
          <Suspense fallback={<div className="text-[11px] text-[#8A7B6A]">Loading graph…</div>}>
            <BassResponse
              frontSubsCfg={frontSubsCfg}
              rearSubsCfg={rearSubsCfg}
              subWarnings={subWarnings}
              hideHeader={true}
              engineeringDetailCollapsed={true}
            />
          </Suspense>
        </div>
      )}

      {/* ── ADI presence: analysed ── */}
      {layoutChosen && hasResults && !isStale && (
        <div className="flex items-center gap-1.5 text-[11px] text-[#625143]">
          <span className="h-1 w-1 rounded-full bg-[#213428]" />
          ADI has analysed this design.
        </div>
      )}

      {/* ── Optimise Bass ── */}
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