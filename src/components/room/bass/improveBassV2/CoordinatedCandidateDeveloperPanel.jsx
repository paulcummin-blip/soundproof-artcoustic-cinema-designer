// CoordinatedCandidateDeveloperPanel.jsx
// Developer-only panel that invokes the coordinated candidate evaluator once
// for the Room D reference and exposes its actual result, evidence and
// failure reason. Rendered ONLY behind the internal debug gate
// (useOptimiserDeveloperDiagnostics) — a dealer never sees it.
//
// This is an acceptance-test bridge, not a dealer-facing ADI feature. It never
// runs the full V2 optimisation, never applies geometry, never autosaves and
// never publishes engineering results. The single allowed calculation is the
// proposed candidate.

import React, { useCallback, useMemo } from "react";
import { useSyncExternalStore } from "react";
import { Loader2, FlaskConical, X, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  subscribeCoordinatedDeveloperRun,
  getCoordinatedDeveloperRunResult,
  runCoordinatedCandidateDeveloper,
  clearCoordinatedDeveloperRun,
} from "./coordinatedCandidateDeveloperRun";
import { useSharedBassResults } from "../bassResultsStore";
import { useAppState } from "@/components/AppStateProvider";
import {
  validateRoomDSavedSeatingReference,
  ROOM_D_COORDINATES,
  ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M,
  ROOM_D_SELECTED_SUB_MODEL,
  ROOM_D_CROSSOVER,
  ROOM_D_EXPECTED_SEAT_IDS,
  ROOM_D_EXPECTED_X_POSITIONS,
  ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M,
  ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M,
} from "./coordinatedCandidateFixture";
import { buildLcrIntegrationSources } from "../lcrIntegrationSources";

const MUTED = "text-[10px] text-[#8A7B6A] leading-relaxed";
const LINE = "text-[11px] text-[#3E4349] leading-relaxed";
const LABEL = "text-[10px] font-semibold uppercase tracking-wide text-[#8A7B6A]";

function fmt(value, unit = "") {
  if (value === null || value === undefined || value === "") return "—";
  return `${value}${unit}`;
}

function BoundaryGate({ name, gate }) {
  if (!gate) return null;
  const ok = gate.valid;
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? "text-[#213428]" : "text-[#A33]"}>{ok ? "✓" : "✗"}</span>
      <div>
        <span className="text-[11px] font-medium text-[#3E4349]">{name}</span>
        {!ok && gate.issues?.length > 0 && (
          <ul className="ml-3 list-disc text-[10px] text-[#A33]">
            {gate.issues.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EvidenceView({ evidence }) {
  if (!evidence) return null;
  return (
    <div className="space-y-2">
      <div className={LINE}>
        <span className="font-medium">Candidate:</span> {evidence.candidateId || "—"}
      </div>
      <div className={LINE}>
        <span className="font-medium">Response basis:</span> {evidence.responseBasis || "—"}
        {evidence.crossover ? ` · crossover ${fmt(evidence.crossover.frequencyHz, " Hz")}` : ""}
      </div>
      <div className={LINE}>
        <span className="font-medium">P14 / headroom:</span>{" "}
        target {fmt(evidence.p14?.targetDb, " dB")} · achieved {fmt(evidence.p14?.achievedDb, " dB")} · headroom {fmt(evidence.p14?.headroomDb, " dB")}
      </div>
      <div className={LINE}>
        <span className="font-medium">P19 at RSP:</span>{" "}
        {fmt(evidence.p19?.variationDb, " dB")} · level {fmt(evidence.p19?.level)}
      </div>
      <div className={LINE}>
        <span className="font-medium">Primary P20:</span>{" "}
        worst {fmt(evidence.p20Primary?.variationDb, " dB")} · {fmt(evidence.p20Primary?.level)} ·{" "}
        {evidence.p20Primary?.seatId || "—"}
        {evidence.p20Primary?.worstFrequencyHz != null ? ` @ ${evidence.p20Primary.worstFrequencyHz} Hz` : ""}
      </div>
      <div className={LINE}>
        <span className="font-medium">Secondary P20:</span>{" "}
        worst {fmt(evidence.p20Secondary?.variationDb, " dB")} · {fmt(evidence.p20Secondary?.level)} ·{" "}
        {evidence.p20Secondary?.seatId || "—"}
      </div>
      <div className={LINE}>
        <span className="font-medium">Tuning:</span>{" "}
        {Array.isArray(evidence.tuning) ? `${evidence.tuning.length} sources` : "—"}
      </div>
      <div className={LINE}>
        <span className="font-medium">Receipt:</span>{" "}
        {evidence.receipt?.selectedCandidateId || "—"}
      </div>
      <div className={MUTED}>
        {evidence.perSeatP20?.length || 0} individual-seat P20 rows ·{" "}
        {evidence.postEqRspCurve?.length || 0} RSP curve points ·{" "}
        {evidence.postEqPerSeatCurves?.length || 0} per-seat curves
      </div>
      <div className={LINE}>
        <span className="font-medium">Shared cancellations:</span>{" "}
        {evidence.sharedCancellations?.hasSharedCancellations ? "detected" : "none"}
        {evidence.sharedCancellations?.hasSeriousSharedCancellations ? " (serious)" : ""}
      </div>
    </div>
  );
}

function CheckRow({ label, ok, children }) {
  return (
    <div className="flex items-start gap-2">
      <span className={ok ? "text-[#213428]" : "text-[#A33]"}>
        {ok ? <CheckCircle2 className="h-3 w-3 mt-0.5" /> : <AlertTriangle className="h-3 w-3 mt-0.5" />}
      </span>
      <div className="text-[10px] text-[#3E4349] leading-relaxed">
        <span className="font-medium">{label}:</span> {children}
      </div>
    </div>
  );
}

function PreRunInspection({ refCheck, integrationContext }) {
  const s = refCheck?.summary;
  const ok = refCheck?.valid === true;
  const crossoverActive = integrationContext?.crossover?.frequencyHz === 95;
  return (
    <div
      className="rounded-md border border-[#E7E5E0] bg-white px-2.5 py-2 space-y-1.5"
      data-coordinated-pre-run-inspection="true"
    >
      <div className={LABEL}>Pre-run input inspection</div>

      <CheckRow label="Saved seats" ok={s?.seatCount === 6}>
        {s ? `${s.seatCount} (expected 6)` : "none — live saved seating required"}
      </CheckRow>
      <CheckRow
        label="Seat IDs"
        ok={ok && s?.seatIds?.join(",") === ROOM_D_EXPECTED_SEAT_IDS.join(",")}
      >
        {s ? s.seatIds.join(", ") : "—"}
      </CheckRow>
      <CheckRow
        label="X positions"
        ok={ok && s?.xPositions?.join(",") === ROOM_D_EXPECTED_X_POSITIONS.join(",")}
      >
        {s ? s.xPositions.join(", ") : "—"} m (expected {ROOM_D_EXPECTED_X_POSITIONS.join(", ")} m)
      </CheckRow>
      <CheckRow label="Original row centres" ok={ok && s?.rowCentres?.length === 2}>
        {s ? `${s.rowCentres.join(", ")} m (expected 4, 5.8 m)` : "—"}
      </CheckRow>
      <CheckRow
        label="Ear heights"
        ok={ok && s?.frontEarHeight === ROOM_D_EXPECTED_FRONT_EAR_HEIGHT_M && s?.rearEarHeight === ROOM_D_EXPECTED_REAR_EAR_HEIGHT_M}
      >
        {s ? `front ${s.frontEarHeight} m · rear ${s.rearEarHeight} m (expected 1.2 / 1.7 m)` : "—"}
      </CheckRow>
      <CheckRow label="Proposed row centres" ok={ok && s?.proposedRowCentres?.length === 2}>
        {s ? `${s.proposedRowCentres.join(", ")} m (expected 3.4, 5.2 m)` : "—"}
      </CheckRow>
      <CheckRow
        label="Proposed RSP"
        ok={ok && s?.proposedRsp && s.proposedRsp.x === 1.75 && s.proposedRsp.y === 3.4 && s.proposedRsp.z === 1.2}
      >
        {s?.proposedRsp ? `(${s.proposedRsp.x}, ${s.proposedRsp.y}, ${s.proposedRsp.z})` : "—"} (expected 1.75, 3.4, 1.2)
      </CheckRow>
      <CheckRow label="Designated seat" ok={ok && !!s?.designatedSeatId}>
        {s?.designatedSeatId || "—"}
      </CheckRow>
      <CheckRow label="Four-sub geometry" ok={ROOM_D_COORDINATES.length === 4}>
        {ROOM_D_SELECTED_SUB_MODEL} · {ROOM_D_COORDINATES.length} cabinets · bottom {ROOM_D_SUBWOOFER_BOTTOM_HEIGHT_M} m
      </CheckRow>
      <CheckRow label="Auto alignment" ok={true}>
        OFF
      </CheckRow>
      <CheckRow label="95 Hz integration" ok={crossoverActive}>
        {crossoverActive
          ? `live LCR (${integrationContext?.speakerSources?.length || 0} sources) + 95 Hz crossover`
          : "no live LCR context — run will reject (acceptance mode)"}
      </CheckRow>

      {!ok && (
        <div className="space-y-1 pt-1 border-t border-[#E7E5E0]">
          <div className="text-[10px] font-semibold text-[#A33]">Input mismatch — Run once is blocked</div>
          <ul className="ml-3 list-disc text-[10px] text-[#A33]">
            {refCheck?.issues?.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function CoordinatedCandidateDeveloperPanel() {
  const result = useSyncExternalStore(
    subscribeCoordinatedDeveloperRun,
    getCoordinatedDeveloperRunResult,
    getCoordinatedDeveloperRunResult,
  );
  const shared = useSharedBassResults();
  const appState = useAppState();
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState(null);

  // The live saved seating from the currently open project. The acceptance
  // bridge must use the actual listener geometry, not the synthetic fallback.
  const savedSeating = useMemo(() => {
    const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
    return seats.length ? seats : null;
  }, [appState?.seatingPositions]);

  // Strictly validate the live saved seating against the accepted Room D
  // reference. The Run-once button is only enabled when every check passes.
  const refCheck = useMemo(
    () => validateRoomDSavedSeatingReference(savedSeating),
    [savedSeating],
  );

  // Trace the SAME live LCR source path the normal calculation uses
  // (buildLcrIntegrationSources from placedSpeakers), so the coordinated
  // candidate is evaluated with the same screen-channel transfers the live
  // design carries — not a derived flag that may be stale or null before the
  // authoritative hook has populated. When no LCR speakers are placed the
  // context is null and the run rejects explicitly (acceptance mode), never a
  // silent sub-only fallback.
  const integrationContext = useMemo(() => {
    const lcrSources = buildLcrIntegrationSources(appState?.speakerSystem?.placedSpeakers);
    if (!lcrSources.length) return null;
    return {
      roomDims: { widthM: 3.5, lengthM: 8.0, heightM: 3.0 },
      seatingPositions: [], // filled by the bundle's proposed seating
      rspPosition: { x: 1.75, y: 3.4, z: 1.2 },
      speakerSources: lcrSources,
      crossover: ROOM_D_CROSSOVER,
      physics: shared?.authoritative?.physics || null,
    };
  }, [appState?.speakerSystem?.placedSpeakers, shared?.authoritative?.physics]);

  const handleRun = useCallback(async () => {
    if (running) return;
    if (!refCheck?.valid) return;
    setRunning(true);
    setError(null);
    try {
      await runCoordinatedCandidateDeveloper({
        integrationContext,
        amplifierPowerPerSubW: shared?.authoritative?.amplifierPowerPerSubW || 0,
        savedSeating,
        requireCombined: true,
      });
    } catch (err) {
      setError(err?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }, [running, integrationContext, shared, refCheck, savedSeating]);

  const handleClear = useCallback(() => {
    clearCoordinatedDeveloperRun();
    setError(null);
  }, []);

  return (
    <div
      className="rounded-md border border-[#E7E5E0] bg-[#FAF9F6] px-3 py-3 space-y-2"
      data-coordinated-candidate-developer="true"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-3.5 w-3.5 text-[#213428]" />
          <span className={LABEL}>Coordinated candidate (developer)</span>
        </div>
        {result && (
          <button
            type="button"
            onClick={handleClear}
            className="text-[10px] text-[#8A7B6A] hover:text-[#1B1A1A]"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className={MUTED}>
        Evaluates one Room D coordinated candidate (4 SUB3-12, −600 mm seating, 95 Hz crossover)
        through the canonical pipeline. No Apply, no autosave, no publication.
      </div>

      <PreRunInspection refCheck={refCheck} integrationContext={integrationContext} />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={running || !refCheck?.valid}
          className="rounded-md bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
          data-coord-run-disabled={!refCheck?.valid}
        >
          {running ? "Evaluating…" : "Run once"}
        </button>
        {running && <Loader2 className="h-3 w-3 animate-spin text-[#213428]" />}
        {!refCheck?.valid && (
          <span className="text-[10px] text-[#A33]">Inputs must match before running</span>
        )}
      </div>

      {error && <div className="text-[10px] text-[#A33]">{error}</div>}

      {result && (
        <div className="space-y-2">
          <div className={LINE}>
            <span className="font-medium">Status:</span>{" "}
            <span data-coord-status={result.status}>{result.status}</span>
          </div>
          {result.issues?.length > 0 && (
            <div className="space-y-1">
              <div className={LABEL}>Issues</div>
              <ul className="ml-3 list-disc text-[10px] text-[#A33]">
                {result.issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {result.boundaries && (
            <div className="space-y-1">
              <div className={LABEL}>Integrity gates</div>
              <BoundaryGate name="pre-transfer" gate={result.boundaries.preTransfer} />
              <BoundaryGate name="pre-confirm" gate={result.boundaries.preConfirm} />
              <BoundaryGate name="post-confirm" gate={result.boundaries.postConfirm} />
            </div>
          )}
          {result.evidence && (
            <div className="space-y-1">
              <div className={LABEL}>Evidence</div>
              <EvidenceView evidence={result.evidence} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}