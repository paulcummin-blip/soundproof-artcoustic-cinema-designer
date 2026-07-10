import React, { useMemo } from "react";
import { useAppState } from "@/components/AppStateProvider";
import { simulateBassAtSeats } from "@/components/bass/bassSimulationEngine";

const PROBE_FREQUENCIES = [15, 16, 18, 20, 22, 25, 31.5, 40, 50, 60, 80, 100];
const fmt = (value, digits = 3) => Number.isFinite(value) ? value.toFixed(digits) : "—";
const phaseDeg = (radians) => Number.isFinite(radians) ? (radians * 180 / Math.PI).toFixed(1) : "—";

export default function LiveEngineProbe({ roomDims, subsForSimulation }) {
  const { mlpY_m, splConfig } = useAppState();
  const probe = useMemo(() => {
    const widthM = Number(roomDims?.widthM);
    const lengthM = Number(roomDims?.lengthM);
    const heightM = Number(roomDims?.heightM);
    if (![widthM, lengthM, heightM, mlpY_m].every(Number.isFinite) || !Array.isArray(subsForSimulation) || !subsForSimulation.length) return null;

    return simulateBassAtSeats({
      roomDims: { widthM, lengthM, heightM },
      seats: [{ id: "rsp", x: widthM / 2, y: mlpY_m, z: 1.2, isPrimary: true }],
      subs: subsForSimulation,
      splConfig: {
        globalPowerW: splConfig?.globalPowerW ?? 100,
        globalEqHeadroomDb: splConfig?.globalEqHeadroomDb ?? 0,
        radiationMode: splConfig?.radiationMode ?? "half-space",
        modesEnabled: true,
        roomDamping: 20,
        sbirEnabled: true,
      },
      options: { debugProbe: { enabled: true, seatId: "rsp", freqsHz: PROBE_FREQUENCIES, topModes: 8 } },
    })?.audit?.modeProbe ?? null;
  }, [roomDims?.widthM, roomDims?.lengthM, roomDims?.heightM, mlpY_m, splConfig, subsForSimulation]);

  if (!probe?.rows?.length) return null;
  return (
    <details style={{ border: "2px solid #0f766e", borderRadius: 8, background: "#f0fdfa", padding: "10px 12px", marginBottom: 8 }}>
      <summary style={{ color: "#115e59", cursor: "pointer", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>
        TEMPORARY — Live Engine Probe: Synthetic RSP
      </summary>
      <div style={{ color: "#134e4a", fontFamily: "monospace", fontSize: 10, marginTop: 8 }}>
        Exact <code>bassSimulationEngine</code> runtime values. No smoothing, grading, EQ transform, or reconstructed acoustic maths.
      </div>
      {probe.rows.map((row) => (
        <div key={row.frequencyHz} style={{ borderTop: "1px solid #99f6e4", marginTop: 8, paddingTop: 8 }}>
          <div style={{ color: "#115e59", fontFamily: "monospace", fontSize: 12, fontWeight: 700, marginBottom: 5 }}>{row.frequencyHz} Hz — final SPL {fmt(row.final?.finalSplDb, 2)} dB</div>
          {row.contributors.map((sub) => (
            <div key={sub.subId} style={{ overflowX: "auto", marginBottom: 8 }}>
              <div style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: "#134e4a", marginBottom: 4 }}>modelKey: {sub.modelKey} · sub: {sub.subId}</div>
              <table style={{ borderCollapse: "collapse", fontFamily: "monospace", fontSize: 9, minWidth: 980, width: "100%" }}>
                <thead><tr>{["db0", "distance", "dbDist", "dbBoundary", "dbGain", "dbEq", "direct Re", "direct Im", "SBIR Re", "SBIR Im", "pre Re", "pre Im", "H mag", "H phase°", "filtered Re", "filtered Im", "sum Re", "sum Im", "final SPL"].map((label) => <th key={label} style={{ borderBottom: "1px solid #5eead4", padding: "3px 5px", textAlign: "right", color: "#115e59" }}>{label}</th>)}</tr></thead>
                <tbody><tr>{[
                  fmt(sub.db0, 2), fmt(sub.distance), fmt(sub.dbDist, 2), fmt(sub.dbBoundary, 2), fmt(sub.dbGain, 2), fmt(sub.dbEq, 2),
                  fmt(sub.direct?.real), fmt(sub.direct?.imag), fmt(sub.sbirComposite?.real), fmt(sub.sbirComposite?.imag),
                  fmt(sub.preModal?.real), fmt(sub.preModal?.imag), fmt(sub.modalMultiplier?.mag), phaseDeg(sub.modalMultiplier?.phaseRad),
                  fmt(sub.filtered?.real), fmt(sub.filtered?.imag), fmt(row.final?.sumReal), fmt(row.final?.sumImag), fmt(row.final?.finalSplDb, 2),
                ].map((value, index) => <td key={index} style={{ borderBottom: "1px solid #ccfbf1", padding: "3px 5px", textAlign: "right" }}>{value}</td>)}</tr></tbody>
              </table>
              <div style={{ fontWeight: 700, margin: "7px 0 3px" }}>Top modal contributors</div>
              <table style={{ borderCollapse: "collapse", fontFamily: "monospace", fontSize: 9, minWidth: 600 }}>
                <thead><tr>{["mode", "frequency", "coupling", "contribution magnitude", "contribution phase°"].map((label) => <th key={label} style={{ borderBottom: "1px solid #5eead4", padding: "2px 5px", textAlign: "right", color: "#115e59" }}>{label}</th>)}</tr></thead>
                <tbody>{(sub.topModes || []).map((mode) => <tr key={`${mode.nx}-${mode.ny}-${mode.nz}-${mode.f0Hz}`}><td style={{ padding: "2px 5px", textAlign: "right" }}>({mode.nx},{mode.ny},{mode.nz})</td><td style={{ padding: "2px 5px", textAlign: "right" }}>{fmt(mode.f0Hz, 2)}</td><td style={{ padding: "2px 5px", textAlign: "right" }}>{fmt(mode.coupling, 5)}</td><td style={{ padding: "2px 5px", textAlign: "right" }}>{fmt(mode.contributionMagnitude, 6)}</td><td style={{ padding: "2px 5px", textAlign: "right" }}>{phaseDeg(mode.contributionPhaseRad)}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </div>
      ))}
    </details>
  );
}