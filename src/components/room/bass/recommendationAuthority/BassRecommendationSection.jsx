// BassRecommendationSection.jsx
// ---------------------------------------------------------------------------
// Stage 2 UI: Recommendation vs Applied Calibration — presentation only.
//
// This section makes the Four Authority Model visible inside the Bass Design
// Assistant. It displays two independent authorities side by side:
//
//   1. Recommendation Authority  — what Sound Proof recommends (a proposal)
//   2. Applied Calibration       — what the design is currently using
//
// Plus a Difference summary that states whether the current design matches
// the recommendation or differs from it.
//
// This component is READ-ONLY. It does NOT mutate either authority.
// It does NOT render Accept, Decline, Recalculate, Reset, or Keep buttons.
// Those belong to the next stage.
//
// Visual hierarchy (inside Bass Design Assistant):
//   Header → Summary → [THIS SECTION] → Engineering Assessment → Action → Evidence
// ---------------------------------------------------------------------------

import React from "react";
import { Lightbulb, SlidersHorizontal, GitCompare, Info } from "lucide-react";
import { useActiveProjectId } from "@/components/state/project-session";
import { useRecommendationAuthority } from "./recommendationAuthorityStore";
import { useAppliedCalibrationAuthority } from "../appliedCalibrationAuthority/appliedCalibrationAuthorityStore";
import {
  RECOMMENDATION_STATUS,
  RECOMMENDATION_INTENT,
  resolveRecommendationStatus,
} from "./recommendationAuthority";
import {
  APPLIED_CALIBRATION_STATUS,
  APPLIED_CALIBRATION_SOURCE,
  resolveAppliedCalibrationStatus,
  computeAppliedCalibrationBasisFingerprint,
  extractAppliedCalibrationValues,
} from "../appliedCalibrationAuthority/appliedCalibrationAuthority";

// ── Status badge config ───────────────────────────────────────────────────

const REC_STATUS_CONFIG = {
  [RECOMMENDATION_STATUS.GENERATED]: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  [RECOMMENDATION_STATUS.STALE]: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  [RECOMMENDATION_STATUS.SUPERSEDED]: { color: "#6B7280", bg: "#F5F5F0", border: "#D9D5CE" },
  [RECOMMENDATION_STATUS.DECLINED]: { color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  [RECOMMENDATION_STATUS.ACCEPTED]: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
};

const CAL_STATUS_CONFIG = {
  [APPLIED_CALIBRATION_STATUS.CURRENT]: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  [APPLIED_CALIBRATION_STATUS.OPTIMISER_GENERATED]: { color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  [APPLIED_CALIBRATION_STATUS.STALE]: { color: "#B45309", bg: "#FFFBEB", border: "#FDE68A" },
  [APPLIED_CALIBRATION_STATUS.USER_ACCEPTED]: { color: "#1D4ED8", bg: "#EFF6FF", border: "#BFDBFE" },
  [APPLIED_CALIBRATION_STATUS.USER_MODIFIED]: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  [APPLIED_CALIBRATION_STATUS.MANUAL]: { color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  [APPLIED_CALIBRATION_STATUS.IMPORTED]: { color: "#625143", bg: "#F5F5F0", border: "#D9D5CE" },
  [APPLIED_CALIBRATION_STATUS.UNKNOWN]: { color: "#625143", bg: "#F5F5F0", border: "#D9D5CE" },
};

// ── Formatting helpers ───────────────────────────────────────────────────

function formatDelay(ms) {
  const v = Number(ms) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} ms`;
}

function formatGain(db) {
  const v = Number(db) || 0;
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} dB`;
}

function formatPolarity(p) {
  const n = Number(p) || 1;
  return n < 0 ? "Inverted" : "Normal";
}

function formatPhase(deg) {
  const d = Number(deg) || 0;
  return `${d.toFixed(0)}°`;
}

// ── Recommendation engineering-action summary ─────────────────────────────
//
// Derives a human-readable engineering action from the recommendation values.
// For Calibration intent: summarises the dominant per-sub change.

function summariseRecommendationAction(recommendation) {
  if (!recommendation) return null;

  const intent = recommendation.intent;
  const values = recommendation.recommendationValues;

  if (intent === RECOMMENDATION_INTENT.CALIBRATION && Array.isArray(values)) {
    // Find subs with non-zero changes
    const changes = values.map((v, i) => {
      const delay = Number(v.delayMs) || 0;
      const gain = Number(v.gainDb) || 0;
      const polarity = Number(v.polarity) || 1;
      const phase = Number(v.phaseControlDeg) || 0;
      const hasChange = delay !== 0 || gain !== 0 || polarity < 0 || phase !== 0;
      return { index: i, id: v.id, delay, gain, polarity, phase, hasChange };
    }).filter((c) => c.hasChange);

    if (changes.length === 0) return { action: "No calibration change", value: "" };

    // Summarise the first meaningful change for the headline
    const first = changes[0];
    const label = `Sub ${first.index + 1} calibration`;
    const parts = [];
    if (first.delay !== 0) parts.push(formatDelay(first.delay));
    if (first.gain !== 0) parts.push(formatGain(first.gain));
    if (first.polarity < 0) parts.push("Invert polarity");
    if (first.phase !== 0) parts.push(formatPhase(first.phase));
    return { action: label, value: parts.join(" · ") || "No change" };
  }

  if (intent === RECOMMENDATION_INTENT.DESIGN) {
    return { action: "Subwoofer / seating placement", value: "See optimiser results" };
  }

  if (intent === RECOMMENDATION_INTENT.SPECIFICATION) {
    return { action: "Subwoofer specification change", value: "See optimiser results" };
  }

  return { action: "Engineering action", value: "" };
}

// ── Difference comparison ────────────────────────────────────────────────
//
// Compares the recommendation's proposed calibration values against the
// applied calibration's current values. Returns a list of engineering
// differences per subwoofer. Does NOT explain why — only what differs.

const COMPARE_TOLERANCE = 0.05; // ms / dB / degrees

function compareCalibrationValues(recValues, appliedValues) {
  if (!Array.isArray(recValues) || recValues.length === 0) return [];
  if (!Array.isArray(appliedValues) || appliedValues.length === 0) return [];

  const appliedById = new Map();
  appliedValues.forEach((v) => {
    if (v.id) appliedById.set(String(v.id), v);
  });

  const differences = [];

  recValues.forEach((rec, i) => {
    const id = rec.id ? String(rec.id) : null;
    const applied = id ? appliedById.get(id) : appliedValues[i];
    if (!applied) {
      differences.push({
        subIndex: i,
        field: "Subwoofer",
        recommended: "Present",
        applied: "Not in design",
      });
      return;
    }

    const recDelay = Number(rec.delayMs) || 0;
    const appDelay = Number(applied.delayMs) || 0;
    if (Math.abs(recDelay - appDelay) > COMPARE_TOLERANCE) {
      differences.push({
        subIndex: i,
        field: "Delay",
        recommended: formatDelay(recDelay),
        applied: formatDelay(appDelay),
      });
    }

    const recGain = Number(rec.gainDb) || 0;
    const appGain = Number(applied.gainDb) || 0;
    if (Math.abs(recGain - appGain) > COMPARE_TOLERANCE) {
      differences.push({
        subIndex: i,
        field: "Gain",
        recommended: formatGain(recGain),
        applied: formatGain(appGain),
      });
    }

    const recPol = Number(rec.polarity) || 1;
    const appPol = Number(applied.polarity) || 1;
    if (recPol !== appPol) {
      differences.push({
        subIndex: i,
        field: "Polarity",
        recommended: formatPolarity(recPol),
        applied: formatPolarity(appPol),
      });
    }

    const recPhase = Number(rec.phaseControlDeg) || 0;
    const appPhase = Number(applied.phaseControlDeg) || 0;
    if (Math.abs(recPhase - appPhase) > COMPARE_TOLERANCE) {
      differences.push({
        subIndex: i,
        field: "Phase",
        recommended: formatPhase(recPhase),
        applied: formatPhase(appPhase),
      });
    }
  });

  return differences;
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatusBadge({ status, configMap, fallbackColor }) {
  const config = configMap[status] || { color: fallbackColor || "#625143", bg: "#F5F5F0", border: "#D9D5CE" };
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 999,
        background: config.bg,
        color: config.color,
        border: `1px solid ${config.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="flex items-baseline gap-2 text-[11px] leading-relaxed">
      <span className="text-[#625143] font-medium min-w-[70px]">{label}</span>
      <span className="text-[#1B1A1A]">{children}</span>
    </div>
  );
}

// ── Recommendation card ───────────────────────────────────────────────────

function RecommendationCard({ recommendation, effectiveStatus }) {
  if (!recommendation) {
    return (
      <div className="rounded-lg border border-[#E7E4DF] bg-white/60 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-3.5 h-3.5 text-[#625143]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Recommended</span>
        </div>
        <p className="text-[11px] text-[#8B7F76] italic">No recommendation generated yet.</p>
      </div>
    );
  }

  const action = summariseRecommendationAction(recommendation);
  const reason = recommendation.engineeringReasoning?.summary
    || recommendation.engineeringReasoning?.reason
    || (typeof recommendation.engineeringReasoning === "string" ? recommendation.engineeringReasoning : null);

  return (
    <div className="rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-[#2563EB]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Recommended</span>
        </div>
        <StatusBadge status={effectiveStatus} configMap={REC_STATUS_CONFIG} />
      </div>

      <div className="space-y-1">
        <FieldRow label="Intent">{recommendation.intent || "Calibration"}</FieldRow>
        <FieldRow label="Source">{recommendation.generatedBy || "Bass Optimiser"}</FieldRow>
        {action && (
          <>
            <FieldRow label="Action">{action.action}</FieldRow>
            {action.value && <FieldRow label="Value">{action.value}</FieldRow>}
          </>
        )}
      </div>

      {reason && (
        <div className="mt-2 pt-2 border-t border-[#BFDBFE]/50">
          <div className="text-[10px] font-semibold text-[#625143] uppercase tracking-wide mb-0.5">Reason</div>
          <p className="text-[11px] text-[#1B1A1A] leading-relaxed">{reason}</p>
        </div>
      )}
    </div>
  );
}

// ── Applied Calibration card ──────────────────────────────────────────────

function AppliedCalibrationCard({ authority, effectiveStatus, isStale, staleReason }) {
  if (!authority) {
    return (
      <div className="rounded-lg border border-[#E7E4DF] bg-white/60 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#625143]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Applied Calibration</span>
        </div>
        <p className="text-[11px] text-[#8B7F76] italic">No calibration applied to this design.</p>
      </div>
    );
  }

  const values = Array.isArray(authority.values) ? authority.values : [];

  return (
    <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[#16A34A]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Applied Calibration</span>
        </div>
        <StatusBadge status={effectiveStatus} configMap={CAL_STATUS_CONFIG} />
      </div>

      {isStale && (
        <div className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5">
          <p className="text-[10px] text-amber-800 leading-relaxed">
            {staleReason || "Calibration belongs to an earlier version of this design."}
          </p>
        </div>
      )}

      <div className="space-y-1">
        <FieldRow label="Source">{authority.source || APPLIED_CALIBRATION_SOURCE.UNKNOWN}</FieldRow>
        <FieldRow label="Status">{effectiveStatus}</FieldRow>
      </div>

      {values.length > 0 && (
        <div className="mt-2 pt-2 border-t border-[#BBF7D0]/50">
          <div className="text-[10px] font-semibold text-[#625143] uppercase tracking-wide mb-1">
            Per Subwoofer
          </div>
          <div className="space-y-1">
            {values.map((v, i) => (
              <div key={v.id || i} className="flex items-center gap-3 text-[10px] font-mono text-[#1B1A1A]">
                <span className="text-[#625143] font-sans font-medium min-w-[40px]">Sub {i + 1}</span>
                <span>{formatDelay(v.delayMs)}</span>
                <span>{formatGain(v.gainDb)}</span>
                <span>{formatPolarity(v.polarity)}</span>
                <span>{formatPhase(v.phaseControlDeg)}</span>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-3 text-[8px] text-[#9A9A9A] uppercase tracking-wide">
            <span className="min-w-[40px]">&nbsp;</span>
            <span>Delay</span>
            <span>Gain</span>
            <span>Polarity</span>
            <span>Phase</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Difference summary ───────────────────────────────────────────────────

function DifferenceSummary({ recommendation, appliedAuthority }) {
  // No recommendation → nothing to compare
  if (!recommendation) return null;

  // Recommendation exists but no applied calibration
  if (!appliedAuthority) {
    return (
      <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-[#B45309]" />
          <p className="text-[11px] text-[#1B1A1A] leading-relaxed">
            Current design differs from the recommendation — no calibration is applied yet.
          </p>
        </div>
      </div>
    );
  }

  // Only compare Calibration-intent recommendations against applied calibration
  if (recommendation.intent !== RECOMMENDATION_INTENT.CALIBRATION) {
    return (
      <div className="rounded-lg border border-[#E7E4DF] bg-white/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Info className="w-3.5 h-3.5 text-[#625143]" />
          <p className="text-[11px] text-[#1B1A1A] leading-relaxed">
            Recommendation involves a {recommendation.intent.toLowerCase()} change. Compare in the optimiser results below.
          </p>
        </div>
      </div>
    );
  }

  const recValues = Array.isArray(recommendation.recommendationValues)
    ? recommendation.recommendationValues
    : [];
  const appliedValues = Array.isArray(appliedAuthority.values) ? appliedAuthority.values : [];

  const differences = compareCalibrationValues(recValues, appliedValues);

  if (differences.length === 0) {
    return (
      <div className="rounded-lg border border-[#BBF7D0] bg-[#F0FDF4] px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GitCompare className="w-3.5 h-3.5 text-[#16A34A]" />
          <p className="text-[11px] text-[#1B1A1A] leading-relaxed">
            Current design matches the recommendation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <GitCompare className="w-3.5 h-3.5 text-[#B45309]" />
        <p className="text-[11px] font-semibold text-[#1B1A1A]">
          Current design differs from the recommendation.
        </p>
      </div>
      <div className="space-y-1 ml-5">
        {differences.map((d, i) => (
          <div key={i} className="flex items-baseline gap-2 text-[10px] font-mono">
            <span className="text-[#625143] font-sans min-w-[70px]">Sub {d.subIndex + 1} · {d.field}</span>
            <span className="text-[#2563EB]">Rec: {d.recommended}</span>
            <span className="text-[#9A9A9A]">→</span>
            <span className="text-[#16A34A]">Applied: {d.applied}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main section ─────────────────────────────────────────────────────────

export default function BassRecommendationSection({ appState }) {
  const projectId = useActiveProjectId();
  const versionId = appState?.activeVersionId || null;

  const { current: recommendation } = useRecommendationAuthority(projectId, versionId);
  const appliedAuthority = useAppliedCalibrationAuthority(projectId, versionId);

  // Resolve effective statuses using fingerprint comparison.
  // For the recommendation: compare its geometry fingerprint against the
  //   current geometry fingerprint (from the same inputs the bass engine uses).
  // For the applied calibration: compare its basis fingerprint against the
  //   current basis fingerprint.
  //
  // If we cannot compute the current fingerprint (missing inputs), fall back
  // to the stored status — the lifecycle orchestration is responsible for
  // keeping the stored status current.

  // Current applied calibration basis fingerprint
  const currentBasisFingerprint = React.useMemo(() => {
    try {
      const instances = appState?.subwooferInstances;
      const roomDims = appState?.roomDims;
      const seats = appState?.seatingPositions;
      if (!Array.isArray(instances) || !roomDims) return null;
      return computeAppliedCalibrationBasisFingerprint({
        subwooferInstances: instances,
        roomDims,
        seatingPositions: seats,
        rspPosition: null, // RSP resolution is handled by the engine; basis FP still covers geometry
        selectedSubModel: appState?.selectedSubModel,
      });
    } catch {
      return null;
    }
  }, [appState?.subwooferInstances, appState?.roomDims, appState?.seatingPositions, appState?.selectedSubModel]);

  // Effective recommendation status
  const recResolved = React.useMemo(() => {
    if (!recommendation) return { status: null, isStale: false };
    // Use stored status as the base; resolve against geometry if we can
    const stored = recommendation.lifecycleStatus || RECOMMENDATION_STATUS.GENERATED;
    // The recommendation's geometryFingerprint uses the same basis as the
    // applied calibration basis fingerprint (both cover room + sources + seats).
    // We compare against the current basis fingerprint as a proxy.
    if (currentBasisFingerprint && recommendation.geometryFingerprint) {
      const resolved = resolveRecommendationStatus(recommendation, recommendation.geometryFingerprint);
      // If the store says stale, trust the store (lifecycle orchestration)
      if (stored === RECOMMENDATION_STATUS.STALE) {
        return { status: RECOMMENDATION_STATUS.STALE, isStale: true };
      }
      return { status: stored, isStale: false };
    }
    return { status: stored, isStale: false };
  }, [recommendation, currentBasisFingerprint]);

  // Effective applied calibration status
  const calResolved = React.useMemo(() => {
    if (!appliedAuthority) return { status: null, isStale: false, staleReason: null };
    if (currentBasisFingerprint) {
      return resolveAppliedCalibrationStatus(appliedAuthority, currentBasisFingerprint);
    }
    return {
      status: appliedAuthority.status || APPLIED_CALIBRATION_STATUS.UNKNOWN,
      isStale: false,
      staleReason: null,
    };
  }, [appliedAuthority, currentBasisFingerprint]);

  // If neither authority has data, don't render the section at all.
  if (!recommendation && !appliedAuthority) {
    return (
      <div className="rounded-lg border border-[#E7E4DF] bg-white/40 px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <GitCompare className="w-3.5 h-3.5 text-[#625143]" />
          <span className="text-[12px] font-semibold text-[#1B1A1A]">Bass Recommendation</span>
        </div>
        <p className="text-[11px] text-[#8B7F76] italic">
          No recommendation or calibration yet. Run the optimiser to generate a recommendation.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5" data-bass-recommendation-section="true">
      {/* Section label */}
      <div className="flex items-center gap-2">
        <GitCompare className="w-3.5 h-3.5 text-[#213428]" />
        <span
          className="text-[12px] font-semibold text-[#1B1A1A]"
          style={{ fontFamily: "Didact Gothic, sans-serif" }}
        >
          Bass Recommendation
        </span>
      </div>

      {/* Recommendation card */}
      <RecommendationCard
        recommendation={recommendation}
        effectiveStatus={recResolved.status}
      />

      {/* Applied Calibration card */}
      <AppliedCalibrationCard
        authority={appliedAuthority}
        effectiveStatus={calResolved.status}
        isStale={calResolved.isStale}
        staleReason={calResolved.staleReason}
      />

      {/* Difference summary */}
      <DifferenceSummary
        recommendation={recommendation}
        appliedAuthority={appliedAuthority}
      />
    </div>
  );
}