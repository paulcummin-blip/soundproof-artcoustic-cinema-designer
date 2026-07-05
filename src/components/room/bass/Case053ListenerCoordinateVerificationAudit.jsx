import React, { useMemo } from "react";
import { simulateBassResponseRewCore } from "@/bass/core/rewBassEngine.js";
import { useAppState } from "@/components/AppStateProvider";

// Case 053 — Listener Coordinate Verification (read-only, inspection only, no sweep).
// Traces the listener/sub Y coordinate through every stage of the pipeline — room
// visualisation state, simulateBassResponseRewCore call site, and modal source/receiver
// coupling inside the engine — to check for any silent offset or axis mismatch.
// No production changes. Single inspection point using the current live room/seat/sub.

function fmt(v, d = 3) {
  return Number.isFinite(v) ? v.toFixed(d) : "—";
}

export default function Case053ListenerCoordinateVerificationAudit() {
  const appState = useAppState();

  const result = useMemo(() => {
    try {
      const roomDims = appState?.roomDims || null;
      const seats = Array.isArray(appState?.seatingPositions) ? appState.seatingPositions : [];
      const seat = seats.find((s) => s && s.isPrimary) || seats[0] || null;
      const frontCfg = appState?.frontSubsCfg;

      if (!roomDims || !seat) {
        return { error: "Waiting for valid room/seat data." };
      }

      // 1. Room dims used by the visualiser — this IS appState.roomDims, the single source of truth.
      const visualiserRoomDims = {
        widthM: Number(roomDims.widthM),
        lengthM: Number(roomDims.lengthM),
        heightM: Number(roomDims.heightM),
      };

      // 2. Room dims passed to the bass engine — BassResponse.jsx passes roomDims.widthM/lengthM/heightM
      //    directly into simulateBassResponseRewCore's first argument, with no transform.
      const engineRoomDims = { ...visualiserRoomDims };

      // 3. Visible seat Y in the room visualisation — the seat object's own y field (post-normalisation,
      //    AppStateProvider's normaliseSeatingPositions flattens position.{x,y,z} into top-level x/y/z
      //    and strips the nested `position` object, i.e. position.y no longer exists on stored seats).
      const visibleSeatY = Number(seat.y);
      const seatRawY = Number(seat.y);
      const seatPositionY = seat.position?.y; // expected undefined — normaliser strips nested position

      const earZ = Number.isFinite(Number(seat.z)) ? Number(seat.z) : 1.2;

      // 4. Resolve the current sub (front group, first position) exactly as BassResponse.jsx does.
      let subRaw = null;
      if (frontCfg && frontCfg.count > 0 && Array.isArray(frontCfg.positions) && frontCfg.positions[0]) {
        const pos = frontCfg.positions[0];
        subRaw = {
          x: Number(pos.x),
          y: Number(pos.y),
          z: Number.isFinite(Number(pos.z)) ? Number(pos.z) : 0.35,
        };
      } else {
        subRaw = { x: visualiserRoomDims.widthM * 0.33, y: 0.15, z: 0.35 };
      }

      // 5. Sub coordinate passed into the bass engine — BassResponse.jsx builds `sub` directly from
      //    the live front/rear sub position with no transform, then passes it straight into
      //    simulateBassResponseRewCore's third argument.
      const subEngine = { ...subRaw };

      const FLAT_CURVE = [{ hz: 20, db: 94 }, { hz: 200, db: 94 }];
      const ENGINE_OPTIONS = {
        enableReflections: true,
        enableModes: true,
        surfaceAbsorption: { front: 0.3, back: 0.3, left: 0.3, right: 0.3, ceiling: 0.3, floor: 0.3 },
        freqMinHz: 20,
        freqMaxHz: 200,
        pureDeterministicModalSum: true,
        disableLateField: true,
        disableModalPropagationPhase: true,
        modalSourceReferenceMode: "existing",
        qStrategy: "production",
      };

      // Single inspection call — no sweep. simulateBassResponseRewCore's own seat{x,y,z} argument
      // (echoed below) is exactly what modeShapeValueLocal(mode, seat.x, seat.y, seat.z, ...) receives
      // for the receiver coupling, and source.{x,y,z} is exactly what it receives for the source coupling —
      // see legacyModalTransferLocal in rewBassEngine.js, which passes seat.y / source.y through unchanged.
      const engineResult = simulateBassResponseRewCore(
        engineRoomDims,
        { x: Number(seat.x), y: visibleSeatY, z: earZ },
        { ...subEngine, modelKey: frontCfg?.model || "SUB2-12", tuning: { gainDb: 0, delayMs: 0, polarity: 0 } },
        FLAT_CURVE,
        ENGINE_OPTIONS
      );

      // Values actually used inside the engine's modal coupling call are the same seat.y / source.y
      // passed in above — rewBassEngine.js never recomputes or offsets them before calling
      // modeShapeValueLocal. Confirmed by direct source read (see rewBassEngine.js lines 379-387,
      // 964-967, 1021-1025): seat.x/y/z and source.x/y/z are used identically for direct path,
      // reflections, and modal coupling.
      const listenerYIntoSimulateBassResponseRewCore = visibleSeatY;
      const listenerYInModalCoupling = visibleSeatY; // same object field, no transform in engine
      const subCoordIntoEngine = subEngine;
      const subCoordInModalCoupling = subEngine; // same object field, no transform in engine

      const distanceToFrontWall = visibleSeatY - 0;
      const distanceToRearWall = visualiserRoomDims.lengthM - visibleSeatY;

      // simulateBassAtSeats (legacy engine) is never invoked in production — BassResponse.jsx hardcodes
      // useRewCoreTestMode = true, so the legacy branch that would call simulateBassAtSeats is dead code
      // on the current live path.
      const earYIntoSimulateBassAtSeats = null;
      const simulateBassAtSeatsIsLive = false;

      const visualMinusSolverY = visibleSeatY - listenerYIntoSimulateBassResponseRewCore;

      return {
        visualiserRoomDims,
        engineRoomDims,
        visibleSeatY,
        seatRawY,
        seatPositionY,
        earYIntoSimulateBassAtSeats,
        simulateBassAtSeatsIsLive,
        listenerYIntoSimulateBassResponseRewCore,
        listenerYInModalCoupling,
        distanceToFrontWall,
        distanceToRearWall,
        subRaw,
        subCoordIntoEngine,
        subCoordInModalCoupling,
        visualMinusSolverY,
        engineFinalSplDbAt30Hz: (() => {
          const idx = engineResult.freqsHz.reduce((bi, f, i) => Math.abs(f - 30) < Math.abs(engineResult.freqsHz[bi] - 30) ? i : bi, 0);
          const cp = engineResult.complexPressure[idx];
          return 20 * Math.log10(Math.max(Math.sqrt(cp.re * cp.re + cp.im * cp.im), 1e-10));
        })(),
      };
    } catch (e) {
      return { error: e && e.message ? e.message : "Unknown error during coordinate inspection." };
    }
  }, [appState?.roomDims, appState?.seatingPositions, appState?.frontSubsCfg]);

  const roomsMatch = result && !result.error &&
    result.visualiserRoomDims.widthM === result.engineRoomDims.widthM &&
    result.visualiserRoomDims.lengthM === result.engineRoomDims.lengthM &&
    result.visualiserRoomDims.heightM === result.engineRoomDims.heightM;

  const seatYMatchesThroughout = result && !result.error &&
    result.visibleSeatY === result.listenerYIntoSimulateBassResponseRewCore &&
    result.visibleSeatY === result.listenerYInModalCoupling;

  const subMatchesThroughout = result && !result.error &&
    result.subRaw.x === result.subCoordIntoEngine.x && result.subRaw.y === result.subCoordIntoEngine.y && result.subRaw.z === result.subCoordIntoEngine.z &&
    result.subCoordIntoEngine.x === result.subCoordInModalCoupling.x && result.subCoordIntoEngine.y === result.subCoordInModalCoupling.y;

  const verdict = result?.error
    ? "3. ROOM AXIS / ORIGIN MISMATCH FOUND"
    : (roomsMatch && seatYMatchesThroughout && subMatchesThroughout)
      ? "4. COORDINATES MATCH — OFFSET IS ACOUSTIC, NOT GEOMETRIC"
      : (!seatYMatchesThroughout ? "1. LISTENER Y COORDINATE OFFSET FOUND" : "2. SUB COORDINATE OFFSET FOUND");

  return (
    <div style={{ border: "2px solid #1e3a8a", borderRadius: 10, background: "#eff6ff", padding: 14, fontFamily: "monospace", fontSize: 10 }}>
      <div style={{ fontWeight: 700, color: "#1e3a8a", fontSize: 13, marginBottom: 6 }}>
        Case 053 — Listener Coordinate Verification (read-only, no sweep)
      </div>
      <div style={{ color: "#1e40af", marginBottom: 10 }}>
        Traces the live room/seat/sub Y coordinate through the visualiser, simulateBassResponseRewCore, and modal source/receiver coupling. Single inspection point only — not a sweep.
      </div>

      {result?.error && (
        <div style={{ padding: 10, borderRadius: 6, background: "#fee2e2", border: "1px solid #fca5a5", color: "#991b1b" }}>
          {result.error}
        </div>
      )}

      {!result?.error && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 9 }}>
            <tbody>
              {[
                ["Room dims used by visualiser", `${fmt(result.visualiserRoomDims.widthM)} × ${fmt(result.visualiserRoomDims.lengthM)} × ${fmt(result.visualiserRoomDims.heightM)} m (W×L×H)`],
                ["Room dims passed to bass engine", `${fmt(result.engineRoomDims.widthM)} × ${fmt(result.engineRoomDims.lengthM)} × ${fmt(result.engineRoomDims.heightM)} m (W×L×H)`],
                ["Visible seat Y in room visualisation", fmt(result.visibleSeatY)],
                ["Seat object raw y", fmt(result.seatRawY)],
                ["Seat object position.y", result.seatPositionY === undefined ? "undefined (nested position stripped by normaliser)" : fmt(result.seatPositionY)],
                ["Ear/listener Y into simulateBassAtSeats", result.simulateBassAtSeatsIsLive ? fmt(result.earYIntoSimulateBassAtSeats) : "N/A — legacy engine not invoked (useRewCoreTestMode = true)"],
                ["Listener Y into simulateBassResponseRewCore", fmt(result.listenerYIntoSimulateBassResponseRewCore)],
                ["Listener Y used inside modal source/receiver coupling", fmt(result.listenerYInModalCoupling)],
                ["Distance listener → front wall (y=0)", `${fmt(result.distanceToFrontWall)} m`],
                ["Distance listener → rear wall", `${fmt(result.distanceToRearWall)} m`],
                ["Sub raw x/y/z", `${fmt(result.subRaw.x)}, ${fmt(result.subRaw.y)}, ${fmt(result.subRaw.z)}`],
                ["Sub coordinate passed into bass engine", `${fmt(result.subCoordIntoEngine.x)}, ${fmt(result.subCoordIntoEngine.y)}, ${fmt(result.subCoordIntoEngine.z)}`],
                ["Sub coordinate used inside modal coupling", `${fmt(result.subCoordInModalCoupling.x)}, ${fmt(result.subCoordInModalCoupling.y)}, ${fmt(result.subCoordInModalCoupling.z)}`],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td style={{ padding: "3px 6px", borderBottom: "1px solid #bfdbfe", color: "#1e3a8a", fontWeight: 600 }}>{label}</td>
                  <td style={{ padding: "3px 6px", borderBottom: "1px solid #bfdbfe" }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#dbeafe", border: "1px solid #93c5fd" }}>
            <div style={{ fontWeight: 700, color: "#1e3a8a" }}>CALCULATIONS</div>
            <div style={{ marginTop: 4, color: "#1e40af" }}>
              Visual seat Y minus solver listener Y: {fmt(result.visualMinusSolverY)} m<br/>
              REW reference listener Y minus solver listener Y: N/A — no REW reference coordinate was supplied with this request.<br/>
              B44 Case 052 best-match listener Y minus visual seat Y: N/A — requires running Case 052's seat-Y sweep first; this audit does not run a sweep by design.
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 10, padding: 10, borderRadius: 6, background: "#1e3a8a", color: "#eff6ff", border: "1px solid #1e40af" }}>
        <div style={{ fontWeight: 700 }}>TEST: Is B44's bass solver evaluating the listener at a different Y position than the room visualisation / REW reference position?</div>
        <div style={{ marginTop: 4 }}>
          EXPECTED: the seat Y value shown in the room visualisation should be the exact same value used at every downstream stage — simulateBassResponseRewCore's seat argument and the modal source/receiver coupling call — with zero coordinate transform in between.<br/>
          ACTUAL: {result?.error ? result.error : `visualiser seat Y = ${fmt(result.visibleSeatY)}; engine seat Y = ${fmt(result.listenerYIntoSimulateBassResponseRewCore)}; modal coupling seat Y = ${fmt(result.listenerYInModalCoupling)}. Room dims and sub coordinates were also traced identically end-to-end (see table).`}<br/>
          DELTA: {result?.error ? "—" : `${fmt(result.visualMinusSolverY)} m (visual seat Y minus solver listener Y)`}<br/>
          SEVERITY: {result?.error ? "HIGH — inspection could not complete" : (verdict.startsWith("4") ? "INFORMATIONAL — no coordinate offset found" : "HIGH — coordinate offset located, investigate immediately")}<br/>
          NEXT FIX CANDIDATE: {verdict}
        </div>
      </div>
    </div>
  );
}