// src/components/utils/rp22RuntimeDiagnostic.js
//
// TEMPORARY READ-ONLY DIAGNOSTIC INSTRUMENTATION.
//
// Purpose: capture the actual live runtime state causing Yarm Cinema
// P5/P9/P10/P17 to remain NOT CALCULATED.
//
// SAFETY:
//   - Does NOT mutate any state.
//   - Does NOT alter any dependency array.
//   - Does NOT trigger any calculation.
//   - Does NOT alter memoisation.
//   - Does NOT change result authority.
//   - Does NOT add fallbacks.
//   - Does NOT change project data.
//
// This module only READS values and logs them to the console.
// It builds a fingerprint from the snapshot and only logs when the
// fingerprint changes — avoiding noisy logs on every render.
//
// All logs are prefixed with: [RP22_RUNTIME_DIAGNOSTIC]

let _lastEngineFingerprint = null;
let _lastSplFingerprint = null;

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

const safeRoles = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s?.role ?? "?")).filter(Boolean);
};

const safeUppers = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter((s) => String(s?.role ?? "").toUpperCase().startsWith("T"))
    .map((s) => ({
      role: String(s?.role ?? "?"),
      x: s?.position?.x,
      y: s?.position?.y,
      z: s?.position?.z,
      model: s?.model ?? null,
    }));
};

const buildEngineFingerprint = (snap) => {
  const parts = [
    `settled=${snap.isRspSettled}`,
    `placed=${snap.placedSpeakersLength}`,
    `visible=${snap.visiblePlanSpeakersLength}`,
    `seats=${snap.seatsLength}`,
    `rsp=${snap.rspId}:${snap.rspX?.toFixed?.(3)},${snap.rspY?.toFixed?.(3)}`,
    `resolved=${snap.speakersWithResolvedOverheadsLength}`,
    `p5Gap=${snap.p5?.worstGapDeg}`,
    `p5Level=${snap.p5?.level}`,
    `p9Gap=${snap.p9?.maxVerticalGapDeg}`,
    `p9Level=${snap.p9?.level}`,
    `p10Level=${snap.p10?.level}`,
    `p17Level=${snap.p17?.level}`,
    `perSeatKeys=${snap.perSeatKeys?.join(",")}`,
  ];
  return parts.join("|");
};

const buildSplFingerprint = (snap) => {
  const seatKeys = Object.keys(snap?.seats || {}).sort();
  const parts = seatKeys.map((seatId) => {
    const s = snap.seats[seatId];
    return `${seatId}:uppers=[${s?.upperKeys?.join(",")}]`;
  });
  return parts.join("|");
};

/**
 * Log the full RP22 engine diagnostic snapshot.
 * Only logs when the fingerprint has changed.
 */
export function logRp22EngineDiagnostic(snapshot) {
  try {
    const fp = buildEngineFingerprint(snapshot);
    if (fp === _lastEngineFingerprint) return;
    _lastEngineFingerprint = fp;

    console.log("[RP22_RUNTIME_DIAGNOSTIC] ════════════════════════════════════════");
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ENGINE SNAPSHOT — fingerprint changed");
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ════════════════════════════════════════");

    // ── 1. TOP LEVEL ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 1. TOP LEVEL ──");
    console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
      projectId: snapshot.projectId,
      projectName: snapshot.projectName,
      isRspSettled: snapshot.isRspSettled,
      engineSpeakersLength: snapshot.engineSpeakersLength,
      effectivePlacedSpeakersLength: snapshot.placedSpeakersLength,
      settledPlacedSpeakersLength: snapshot.settledPlacedSpeakersLength,
      visiblePlanSpeakersLength: snapshot.visiblePlanSpeakersLength,
      analysisSpeakersLength: snapshot.analysisSpeakersLength,
      seatsLength: snapshot.seatsLength,
      rspId: snapshot.rspId,
      rspPosition: { x: snapshot.rspX, y: snapshot.rspY, z: snapshot.rspZ },
    });
    console.log("[RP22_RUNTIME_DIAGNOSTIC] placedSpeakers roles:", safeRoles(snapshot.placedSpeakersRef));
    console.log("[RP22_RUNTIME_DIAGNOSTIC] visiblePlanSpeakers roles:", safeRoles(snapshot.visiblePlanSpeakersRef));
    console.log("[RP22_RUNTIME_DIAGNOSTIC] analysisSpeakers roles:", safeRoles(snapshot.analysisSpeakersRef));
    console.log("[RP22_RUNTIME_DIAGNOSTIC] uppers in placedSpeakers:", safeUppers(snapshot.placedSpeakersRef));
    console.log("[RP22_RUNTIME_DIAGNOSTIC] uppers in visiblePlanSpeakers:", safeUppers(snapshot.visiblePlanSpeakersRef));

    // ── 2. P5 ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 2. P5 ──");
    console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
      speakersWithResolvedOverheadsLength: snapshot.speakersWithResolvedOverheadsLength,
      eligibleP5SurroundCount: snapshot.p5?.eligibleCount,
      eligibleP5SurroundRoles: snapshot.p5?.eligibleRoles,
      computeSurroundRingGapsResult: snapshot.p5?.ringGapsResult,
      worstGapDeg: snapshot.p5?.worstGapDeg,
      p5Level: snapshot.p5?.level,
    });

    // ── 3. P9 ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 3. P9 ──");
    if (snapshot.p9?.upperEntries) {
      console.log("[RP22_RUNTIME_DIAGNOSTIC] P9 upper entries (from safeSpeakers):");
      for (const entry of snapshot.p9.upperEntries) {
        console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
          role: entry.role,
          x: entry.x,
          y: entry.y,
          z: entry.z,
          finiteX: isNum(entry.x),
          finiteY: isNum(entry.y),
          finiteZ: isNum(entry.z),
          accepted: entry.accepted,
        });
      }
    }
    console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
      upperSpeakersLength: snapshot.p9?.upperSpeakersLength,
      maxVerticalGapDeg: snapshot.p9?.maxVerticalGapDeg,
      p9Level: snapshot.p9?.level,
    });

    // ── 4. P10 ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 4. P10 ──");
    if (snapshot.p10?.seats) {
      for (const [seatId, p10] of Object.entries(snapshot.p10.seats)) {
        console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
          seatId,
          seatUppersKeys: p10?.seatUppersKeys,
          rspUppersKeys: p10?.rspUppersKeys,
          seatUppers: p10?.seatUppers,
          rspUppers: p10?.rspUppers,
          normalisedDeltas: p10?.normalisedDeltas,
          normalisedDeltasLength: p10?.normalisedDeltas?.length,
          computeP10Result: p10?.result,
          p10Level: p10?.level,
        });
      }
    }

    // ── 5. P17 ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 5. P17 ──");
    console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
      speakersWithResolvedOverheadsLength: snapshot.p17?.speakersWithResolvedOverheadsLength,
      realModelCount: snapshot.p17?.realModelCount,
      p17SpeakersLength: snapshot.p17?.p17SpeakersLength,
      p17SpeakerRoles: snapshot.p17?.p17SpeakerRoles,
    });
    if (snapshot.p17?.excludedSpeakers) {
      console.log("[RP22_RUNTIME_DIAGNOSTIC] P17 excluded non-LCR speakers:");
      for (const ex of snapshot.p17.excludedSpeakers) {
        console.log("[RP22_RUNTIME_DIAGNOSTIC]", ex);
      }
    }
    if (snapshot.p17?.seatResults) {
      for (const [seatId, res] of Object.entries(snapshot.p17.seatResults)) {
        console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
          seatId,
          p17Result: res,
        });
      }
    }

    // ── 6. PUBLICATION ──
    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── 6. PUBLICATION ──");
    if (snapshot.publication) {
      for (const [seatId, pub] of Object.entries(snapshot.publication)) {
        console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
          seatId,
          perSeatRp22_p5: pub?.perSeatRp22_p5,
          perSeatRp22_p9: pub?.perSeatRp22_p9,
          perSeatRp22_p10: pub?.perSeatRp22_p10,
          perSeatRp22_p17: pub?.perSeatRp22_p17,
        });
      }
    }

    console.log("[RP22_RUNTIME_DIAGNOSTIC] ════════════════════════════════════════ END SNAPSHOT");
  } catch (e) {
    console.error("[RP22_RUNTIME_DIAGNOSTIC] Error logging engine diagnostic:", e);
  }
}

/**
 * Log the SPL uppers diagnostic snapshot.
 * Captures the actual `uppers` object keys for each seat.
 */
export function logRp22SplDiagnostic(snapshot) {
  try {
    const fp = buildSplFingerprint(snapshot);
    if (fp === _lastSplFingerprint) return;
    _lastSplFingerprint = fp;

    console.log("[RP22_RUNTIME_DIAGNOSTIC] ── SPL UPPERS DIAGNOSTIC ──");
    for (const [seatId, seatData] of Object.entries(snapshot.seats || {})) {
      console.log("[RP22_RUNTIME_DIAGNOSTIC]", {
        seatId,
        upperKeys: seatData.upperKeys,
        upperValues: seatData.upperValues,
        hasTML: seatData.upperKeys?.includes("TML"),
        hasTMR: seatData.upperKeys?.includes("TMR"),
        hasTL: seatData.upperKeys?.includes("TL"),
        hasTR: seatData.upperKeys?.includes("TR"),
      });
    }
  } catch (e) {
    console.error("[RP22_RUNTIME_DIAGNOSTIC] Error logging SPL diagnostic:", e);
  }
}