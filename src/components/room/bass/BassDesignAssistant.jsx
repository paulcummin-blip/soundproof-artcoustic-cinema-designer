// BassDesignAssistant.jsx
//
// Bass Design Assistant — Frozen UX Workflow
//
// The workflow is:
//   Room → Choose Starting Layout → Current Layout → Calculate Performance →
//   Performance → Improve Design → Presentation Mode
//
// This sequence is fixed. Do not redesign it. Do not reinterpret it.
//
// This is a PRESENTATION and INFORMATION-ARCHITECTURE change only.
// It does NOT change acoustics maths, P14/P18/P19/P20 grading, optimiser
// scoring, subwoofer prediction logic, or canonical result authority.
//
// It consumes existing shared authority only:
//   - useSharedBassResults()           → lifecycle, authority, seating
//   - BassHeadlinePills                 → P14/P18/P19/P20 pills
//   - OptimiseAndCalculate              → single calculation action
//   - StartingLayoutCards              → Stage 1 (replaces BestSubLayoutGuide)
//   - CurrentLayoutBanner              → compact layout summary
//   - CapabilitySelector               → P14 renamed, instant switching
//   - ImproveDesignCard                → single recommendation card
//   - PresentationModeToggle           → viewing mode
//   - BassResponse                     → graph (embedded, header hidden)
//
// The four designer questions:
//   1. Where should the subs go?
//   2. How well does this perform?
//   3. How can I improve it?
//   4. How do I explain it?

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Waves } from "lucide-react";
import { useSharedBassResults } from "@/components/room/bass/bassResultsStore";
import { useSubwooferCompatibilityActions } from "@/components/hooks/useSubwooferCompatibilityActions";
import BassHeadlinePills from "@/components/room/bass/BassHeadlinePills";
import OptimiseAndCalculate from "@/components/room/bass/optimiseWorkflow/OptimiseAndCalculate";
import StartingLayoutCards from "@/components/room/bass/bda/StartingLayoutCards";
import CurrentLayoutBanner from "@/components/room/bass/bda/CurrentLayoutBanner";
import CapabilitySelector from "@/components/room/bass/bda/CapabilitySelector";
import ImproveDesignCard from "@/components/room/bass/bda/ImproveDesignCard";
import PresentationModeToggle from "@/components/room/bass/bda/PresentationModeToggle";

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
}) {
  const compat = useSubwooferCompatibilityActions(appState, frontSubsCfg, rearSubsCfg);
  const shared = useSharedBassResults();
  const [showLayoutCards, setShowLayoutCards] = useState(true);
  const [presentationMode, setPresentationMode] = useState(false);
  const hadSubsRef = useRef(false);

  const subwooferInstances = appState?.subwooferInstances || [];
  const hasSubwoofers = subwooferInstances.some((s) => s?.enabled !== false);
  const hasResults = shared?.hasCurrentResult === true;

  // Auto-collapse layout cards when subwoofers first appear
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

  return (
    <div className="rounded-xl border border-[#DCDBD6] bg-white p-4 space-y-4" data-bda-workflow="true">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <Waves className="w-5 h-5 text-[#213428]" />
        <h3
          className="text-[15px] font-bold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Bass Design Assistant
        </h3>
      </div>

      {/* ── Stage 1: Choose Starting Layout ── */}
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
      {!showLayoutCards && hasSubwoofers && (
        <CurrentLayoutBanner
          subwooferInstances={subwooferInstances}
          onChange={() => setShowLayoutCards(true)}
        />
      )}

      {/* ── Stage 2: Calculate Performance ── */}
      {hasSubwoofers && (
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
        />
      )}

      {/* ── Stage 3: Performance ── */}
      {hasResults && !presentationMode && (
        <div className="space-y-3" data-bda-stage="performance">
          <BassHeadlinePills />
          <CapabilitySelector disabled={disabled} />
          <React.Suspense fallback={<div className="p-4 text-sm text-[#625143]">Loading graph…</div>}>
            <BassResponse
              hideHeader
              frontSubsCfg={frontSubsCfg}
              rearSubsCfg={rearSubsCfg}
              subWarnings={subWarnings || {}}
            />
          </React.Suspense>
        </div>
      )}

      {/* ── Stage 4: Improve Design ── */}
      {hasResults && !presentationMode && (
        <ImproveDesignCard appState={appState} />
      )}

      {/* ── Stage 5: Presentation Mode ── */}
      {hasResults && (
        <>
          <PresentationModeToggle
            isPresentationMode={presentationMode}
            onToggle={setPresentationMode}
          />
          {presentationMode && (
            <div className="space-y-3" data-bda-stage="presentation">
              <BassHeadlinePills />
              <React.Suspense fallback={<div className="p-4 text-sm text-[#625143]">Loading graph…</div>}>
                <BassResponse
                  hideHeader
                  frontSubsCfg={frontSubsCfg}
                  rearSubsCfg={rearSubsCfg}
                  subWarnings={subWarnings || {}}
                />
              </React.Suspense>
            </div>
          )}
        </>
      )}
    </div>
  );
}