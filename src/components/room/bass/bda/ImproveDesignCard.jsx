// ImproveDesignCard.jsx
// ---------------------------------------------------------------------------
// Stage 4 — Improve Design
//
// Displays exactly ONE recommendation card. Never multiple.
//
// Hierarchy: Calibration → Physical → Specification
//
// The card contains exactly:
//   - Action
//   - Benefit
//   - Expected Improvement
//   - RP22 Evidence
//   - Remaining Limitation
//
// "No further action" is a first-class outcome when the assessment is
// Good or Excellent.
//
// This component wraps the existing BassDecisionActions for the Accept /
// Continue / Recalculate / Reset interaction, but presents the recommendation
// in the frozen 5-field structure.
// ---------------------------------------------------------------------------

import React from "react";
import { Lightbulb, Check, AlertTriangle } from "lucide-react";
import { useActiveProjectId } from "@/components/state/project-session";
import { useRecommendationAuthority } from "@/components/room/bass/recommendationAuthority/recommendationAuthorityStore";
import { useAppliedCalibrationAuthority } from "@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthorityStore";
import {
  RECOMMENDATION_STATUS,
  RECOMMENDATION_INTENT,
} from "@/components/room/bass/recommendationAuthority/recommendationAuthority";
import {
  APPLIED_CALIBRATION_STATUS,
  resolveAppliedCalibrationStatus,
  computeAppliedCalibrationBasisFingerprint,
} from "@/components/room/bass/appliedCalibrationAuthority/appliedCalibrationAuthority";
import BassDecisionActions from "@/components/room/bass/recommendationAuthority/BassDecisionActions";

const INTENT_LABEL = {
  [RECOMMENDATION_INTENT.CALIBRATION]: "Calibration",
  [RECOMMENDATION_INTENT.DESIGN]: "Physical",
  [RECOMMENDATION_INTENT.SPECIFICATION]: "Specification",
};

function FieldRow({ label, children }) {
  return (
    <div className="flex items-baseline gap-2 text-[12px] leading-relaxed">
      <span className="text-[#625143] font-medium min-w-[130px] flex-shrink-0">{label}</span>
      <span className="text-[#1B1A1A]">{children}</span>
    </div>
  );
}

function summariseAction(recommendation) {
  if (!recommendation) return null;
  const intent = recommendation.intent;
  const values = recommendation.recommendationValues;

  if (intent === RECOMMENDATION_INTENT.CALIBRATION && Array.isArray(values)) {
    const changes = values.map((v) => {
      const delay = Number(v.delayMs) || 0;
      const gain = Number(v.gainDb) || 0;
      const polarity = Number(v.polarity) || 1;
      const phase = Number(v.phaseControlDeg) || 0;
      const hasChange = delay !== 0 || gain !== 0 || polarity < 0 || phase !== 0;
      return { delay, gain, polarity, phase, hasChange };
    }).filter((c) => c.hasChange);

    if (changes.length === 0) return "Apply calibration alignment";
    const parts = [];
    if (changes.some((c) => c.delay !== 0)) parts.push("delay");
    if (changes.some((c) => c.gain !== 0)) parts.push("gain");
    if (changes.some((c) => c.polarity < 0)) parts.push("polarity");
    if (changes.some((c) => c.phase !== 0)) parts.push("phase");
    return `Adjust ${parts.join(", ")} across ${changes.length} subwoofer${changes.length > 1 ? "s" : ""}`;
  }
  if (intent === RECOMMENDATION_INTENT.DESIGN) return "Adjust subwoofer or seating placement";
  if (intent === RECOMMENDATION_INTENT.SPECIFICATION) return "Change subwoofer specification";
  return "Engineering action";
}

function deriveBenefit(intent) {
  if (intent === RECOMMENDATION_INTENT.CALIBRATION) return "Reduces seat-to-seat variation and improves response smoothness";
  if (intent === RECOMMENDATION_INTENT.DESIGN) return "Improves modal balance and bass consistency across the seating area";
  if (intent === RECOMMENDATION_INTENT.SPECIFICATION) return "Increases low-frequency capability and headroom";
  return "Improves the bass response";
}

function deriveExpectedEffect(intent) {
  if (intent === RECOMMENDATION_INTENT.CALIBRATION) return "Tighter, more consistent bass across all seats";
  if (intent === RECOMMENDATION_INTENT.DESIGN) return "Better modal distribution and reduced cancellation";
  if (intent === RECOMMENDATION_INTENT.SPECIFICATION) return "Greater extension and output capability";
  return "Improved bass performance";
}

export default function ImproveDesignCard({ appState }) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;
  const { current: recommendation } = useRecommendationAuthority(projectId, versionId);
  const appliedAuthority = useAppliedCalibrationAuthority(projectId, versionId);

  const currentBasisFingerprint = React.useMemo(() => {
    try {
      const instances = appState?.subwooferInstances;
      const roomDims = appState?.roomDims;
      if (!Array.isArray(instances) || !roomDims) return null;
      return computeAppliedCalibrationBasisFingerprint({
        subwooferInstances: instances,
        roomDims,
        seatingPositions: appState?.seatingPositions,
        rspPosition: null,
        selectedSubModel: appState?.selectedSubModel,
      });
    } catch {
      return null;
    }
  }, [appState?.subwooferInstances, appState?.roomDims, appState?.seatingPositions, appState?.selectedSubModel]);

  const recResolved = React.useMemo(() => {
    if (!recommendation) return { status: null, isStale: false };
    const stored = recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED;
    if (stored === RECOMMENDATION_STATUS.STALE) return { status: RECOMMENDATION_STATUS.STALE, isStale: true };
    if (stored === RECOMMENDATION_STATUS.ACCEPTED || stored === RECOMMENDATION_STATUS.SUPERSEDED) return { status: stored, isStale: false };
    return { status: stored, isStale: false };
  }, [recommendation]);

  // No recommendation at all
  if (!recommendation && !appliedAuthority) {
    return (
      <div className="rounded-lg border border-[#E7E4DF] bg-white/60 px-4 py-3" data-bda-stage="improve-design">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-3.5 h-3.5 text-[#625143]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Improve Design</span>
        </div>
        <p className="text-[11px] text-[#8B7F76] italic">
          Calculate performance to generate a recommendation.
        </p>
      </div>
    );
  }

  // No recommendation but calibration exists — check if it matches
  if (!recommendation && appliedAuthority) {
    return (
      <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3" data-bda-stage="improve-design">
        <div className="flex items-center gap-2 mb-1">
          <Check className="w-3.5 h-3.5 text-[#16A34A]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Improve Design</span>
        </div>
        <p className="text-[11px] text-[#1B1A1A] leading-relaxed">
          No further action recommended. The current calibration is applied.
        </p>
      </div>
    );
  }

  const intent = recommendation.intent || RECOMMENDATION_INTENT.CALIBRATION;
  const action = summariseAction(recommendation);
  const benefit = deriveBenefit(intent);
  const expectedEffect = deriveExpectedEffect(intent);
  const isStale = recResolved.isStale;

  return (
    <div className="space-y-2.5" data-bda-stage="improve-design">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-3.5 h-3.5 text-[#213428]" />
        <span
          className="text-[12px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Improve Design
        </span>
      </div>

      {/* The single recommendation card — 5 fields */}
      <div className={`rounded-lg border px-4 py-3 ${isStale ? "border-amber-300 bg-amber-50" : "border-[#BFDBFE] bg-[#EFF6FF]"}`}>
        {isStale && (
          <div className="mb-2 flex items-center gap-2 rounded border border-amber-300 bg-amber-100 px-2 py-1.5">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
            <p className="text-[10px] text-amber-800">Recommendation is stale. Re-optimise required.</p>
          </div>
        )}
        <div className="space-y-1.5">
          <FieldRow label="Action">{action}</FieldRow>
          <FieldRow label="Benefit">{benefit}</FieldRow>
          <FieldRow label="Expected Improvement">{expectedEffect}</FieldRow>
          <FieldRow label="RP22 Evidence">{INTENT_LABEL[intent] || "Calibration"} recommendation</FieldRow>
          <FieldRow label="Remaining Limitation">Determined after recalculation</FieldRow>
        </div>
      </div>

      {/* Decision actions — Accept / Continue / Recalculate / Reset */}
      <BassDecisionActions
        appState={appState}
        commitInstances={appState?.setSubwooferInstances || null}
      />
    </div>
  );
}