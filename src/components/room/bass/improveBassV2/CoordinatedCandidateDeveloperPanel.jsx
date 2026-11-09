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

import React, { useCallback } from "react";
import { useSyncExternalStore } from "react";
import { Loader2, FlaskConical, X } from "lucide-react";
import {
  subscribeCoordinatedDeveloperRun,
  getCoordinatedDeveloperRunResult,
  runCoordinatedCandidateDeveloper,
  clearCoordinatedDeveloperRun,
} from "./coordinatedCandidateDeveloperRun";
import { useSharedBassResults } from "../bassResultsStore";

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

export default function CoordinatedCandidateDeveloperPanel() {
  const result = useSyncExternalStore(
    subscribeCoordinatedDeveloperRun,
    getCoordinatedDeveloperRunResult,
    getCoordinatedDeveloperRunResult,
  );
  const shared = useSharedBassResults();
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState(null);

  // Derive a live integration context from the shared bass results so the
  // coordinated candidate is evaluated with the same LCR sources and crossover
  // the live design carries. Falls back to sub-only when unavailable.
  const integrationContext = React.useMemo(() => {
    const auth = shared?.authoritative;
    if (!auth?.combinedAuthorityEnabled) return null;
    if (!auth.lcrSources?.length) return null;
    return {
      roomDims: { widthM: 3.5, lengthM: 8.0, heightM: 3.0 },
      seatingPositions: [], // filled by the bundle's proposed seating
      rspPosition: { x: 1.75, y: 2.8, z: 1.2 },
      speakerSources: auth.lcrSources,
      crossover: { type: "lowpass", frequencyHz: 95, order: 4, enabled: true },
      physics: auth.physics || null,
    };
  }, [shared?.authoritative]);

  const handleRun = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    try {
      await runCoordinatedCandidateDeveloper({
        integrationContext,
        amplifierPowerPerSubW: shared?.authoritative?.amplifierPowerPerSubW || 0,
      });
    } catch (err) {
      setError(err?.message || "Run failed");
    } finally {
      setRunning(false);
    }
  }, [running, integrationContext, shared]);

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

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleRun}
          disabled={running}
          className="rounded-md bg-[#213428] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-45"
        >
          {running ? "Evaluating…" : "Run once"}
        </button>
        {running && <Loader2 className="h-3 w-3 animate-spin text-[#213428]" />}
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