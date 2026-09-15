import { useEffect } from "react";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";

// ── INSTRUMENTATION (diagnostic only — no behaviour change) ──────────────
let __subSyncRunCounter = 0;
const __SUB_SYNC_TAG = "color: #ff6b6b; font-weight: bold; font-size: 13px;";
const __SUB_SYNC_END = "color: #ff6b6b; font-weight: bold;";
// ── END INSTRUMENTATION ──────────────────────────────────────────────────

/**
 * Syncs appState.subwoofers from the canonical authority.
 *
 * AUTHORITY STATE MACHINE (subwooferInstancesStatus):
 *   valid:         subwooferInstances → bassInputAdapter → appState.subwoofers
 *   absent_legacy: clear runtime subwoofers and do nothing (transitional —
 *                  hydration owns all CFG migration)
 *   error:         clear runtime subwoofers and do nothing
 *   uninitialised: clear runtime subwoofers and do nothing (wait for hydration)
 *
 * CFG is NEVER read as an authority. Hydration is the sole owner of migration.
 */
export function useSubwooferSync({ appState }) {
  const status = appState?.subwooferInstancesStatus ?? INSTANCE_STATUS.UNINITIALISED;
  const frontOrientation = appState?.frontSubsCfg?.orientation ?? null;
  const rearOrientation = appState?.rearSubsCfg?.orientation ?? null;

  useEffect(() => {
    const setSubwoofers = appState?.setSubwoofers;
    if (typeof setSubwoofers !== "function") return;

    // -----------------------------------------------------------------------
    // ERROR, UNINITIALISED, or ABSENT_LEGACY: clear runtime subwoofers, do
    // nothing. ABSENT_LEGACY is transitional — hydration owns all CFG
    // migration. By the time this hook runs, hydration has either migrated to
    // VALID or set ERROR.
    // -----------------------------------------------------------------------
    if (
      status === INSTANCE_STATUS.ERROR ||
      status === INSTANCE_STATUS.UNINITIALISED ||
      status === INSTANCE_STATUS.ABSENT_LEGACY
    ) {
      const current = Array.isArray(appState?.subwoofers) ? appState.subwoofers : [];
      if (current.length > 0) setSubwoofers([]);
      return;
    }

    // -----------------------------------------------------------------------
    // VALID: subwooferInstances → bassInputAdapter → appState.subwoofers
    // -----------------------------------------------------------------------
    if (status === INSTANCE_STATUS.VALID) {
      const instances = Array.isArray(appState?.subwooferInstances) ? appState.subwooferInstances : [];
      const adapted = bassInputAdapter(instances, { frontOrientation, rearOrientation });
      const current = Array.isArray(appState?.subwoofers) ? appState.subwoofers : [];

      // ── INSTRUMENTATION (diagnostic only — no behaviour change) ──────────
      const runNum = ++__subSyncRunCounter;
      const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV === true;

      if (isDev) {
        console.log(`%c[useSubwooferSync] Run #${runNum} START`, __SUB_SYNC_TAG);
        console.log(`[useSubwooferSync] Run #${runNum} | frontOrientation=${frontOrientation} rearOrientation=${rearOrientation}`);
        console.log(`[useSubwooferSync] Run #${runNum} | adapted.length=${adapted.length} current.length=${current.length}`);

        const maxLen = Math.max(adapted.length, current.length);
        for (let i = 0; i < maxLen; i++) {
          const s = adapted[i];
          const c = current[i];
          const subId = s?.id || c?.id || `(index ${i} — missing)`;
          console.log(`[useSubwooferSync] Run #${runNum} | Sub: ${subId}`);
          console.log(`  Previous:  x=${c?.x ?? "—"}  y=${c?.y ?? "—"}  z=${c?.z ?? "—"}  orientation=${c?.orientation ?? "—"}  gain=${c?.gainDb ?? "—"}  delay=${c?.delay ?? "—"}  polarity=${c?.polarity ?? "—"}  enabled=${c?.enabled ?? "—"}`);
          console.log(`  Adapted:   x=${s?.x ?? "—"}  y=${s?.y ?? "—"}  z=${s?.z ?? "—"}  orientation=${s?.orientation ?? "—"}  gain=${s?.gainDb ?? "—"}  delay=${s?.delay ?? "—"}  polarity=${s?.polarity ?? "—"}  enabled=${s?.enabled ?? "—"}`);
        }
      }
      // ── END INSTRUMENTATION ──────────────────────────────────────────────

      const same =
        adapted.length === current.length &&
        adapted.every((s, i) => {
          const c = current[i];
          if (!c) return false;
          return (
            String(s.id) === String(c.id) &&
            String(s.model) === String(c.model) &&
            Math.abs((s.x ?? 0) - (c.x ?? 0)) < 0.001 &&
            Math.abs((s.y ?? 0) - (c.y ?? 0)) < 0.001 &&
            Math.abs((s.z ?? 0) - (c.z ?? 0)) < 0.001 &&
            Math.abs((s.gainDb ?? 0) - (c.gainDb ?? 0)) < 0.001 &&
            Math.abs((s.delay ?? 0) - (c.delay ?? 0)) < 0.001 &&
            (s.polarity ?? 1) === (c.polarity ?? 1)
          );
        });

      // ── INSTRUMENTATION: same result + failed comparisons ─────────────────
      if (isDev) {
        console.log(`[useSubwooferSync] Run #${runNum} | same = ${same}`);

        if (!same) {
          console.log(`[useSubwooferSync] Run #${runNum} | FAILED COMPARISONS:`);
          if (adapted.length !== current.length) {
            console.log(`  FAIL: length differs (adapted=${adapted.length}, current=${current.length})`);
          }
          adapted.forEach((s, i) => {
            const c = current[i];
            if (!c) {
              console.log(`  FAIL: [${s?.id}] current entry missing at index ${i}`);
              return;
            }
            if (String(s.id) !== String(c.id))
              console.log(`  FAIL: [${s.id}] id differs (adapted=${s.id}, current=${c.id})`);
            if (String(s.model) !== String(c.model))
              console.log(`  FAIL: [${s.id}] model differs (adapted=${s.model}, current=${c.model})`);
            if (s?.enabled !== c?.enabled)
              console.log(`  FAIL: [${s?.id}] enabled differs (adapted=${s?.enabled}, current=${c?.enabled}) — NOT checked by same()`);
            if (Math.abs((s.x ?? 0) - (c.x ?? 0)) >= 0.001)
              console.log(`  FAIL: [${s.id}] x differs (adapted=${s.x}, current=${c.x}, delta=${((s.x ?? 0) - (c.x ?? 0)).toFixed(6)})`);
            if (Math.abs((s.y ?? 0) - (c.y ?? 0)) >= 0.001)
              console.log(`  FAIL: [${s.id}] y differs (adapted=${s.y}, current=${c.y}, delta=${((s.y ?? 0) - (c.y ?? 0)).toFixed(6)})`);
            if (Math.abs((s.z ?? 0) - (c.z ?? 0)) >= 0.001)
              console.log(`  FAIL: [${s.id}] z differs (adapted=${s.z}, current=${c.z}, delta=${((s.z ?? 0) - (c.z ?? 0)).toFixed(6)})`);
            if (Math.abs((s.gainDb ?? 0) - (c.gainDb ?? 0)) >= 0.001)
              console.log(`  FAIL: [${s.id}] gainDb differs (adapted=${s.gainDb}, current=${c.gainDb}, delta=${((s.gainDb ?? 0) - (c.gainDb ?? 0)).toFixed(6)})`);
            if (Math.abs((s.delay ?? 0) - (c.delay ?? 0)) >= 0.001)
              console.log(`  FAIL: [${s.id}] delay differs (adapted=${s.delay}, current=${c.delay}, delta=${((s.delay ?? 0) - (c.delay ?? 0)).toFixed(6)})`);
            if ((s.polarity ?? 1) !== (c.polarity ?? 1))
              console.log(`  FAIL: [${s.id}] polarity differs (adapted=${s.polarity}, current=${c.polarity})`);
            // orientation is NOT in same() but affects z — log for root-cause trace
            if (s?.orientation !== c?.orientation)
              console.log(`  FAIL: [${s?.id}] orientation differs (adapted=${s?.orientation}, current=${c?.orientation}) — NOT checked by same() but affects z via deriveCentreZ`);
          });
        }

        console.log(`[useSubwooferSync] Run #${runNum} | setSubwoofers() called: ${!same ? "YES" : "NO"}`);

        if (!same) {
          // Determine whether actual values differ or only object references changed
          const valuesActuallyDifferent =
            adapted.length !== current.length ||
            adapted.some((s, i) => {
              const c = current[i];
              if (!c) return true;
              return (
                String(s.id) !== String(c.id) ||
                String(s.model) !== String(c.model) ||
                Math.abs((s.x ?? 0) - (c.x ?? 0)) >= 0.001 ||
                Math.abs((s.y ?? 0) - (c.y ?? 0)) >= 0.001 ||
                Math.abs((s.z ?? 0) - (c.z ?? 0)) >= 0.001 ||
                Math.abs((s.gainDb ?? 0) - (c.gainDb ?? 0)) >= 0.001 ||
                Math.abs((s.delay ?? 0) - (c.delay ?? 0)) >= 0.001 ||
                (s.polarity ?? 1) !== (c.polarity ?? 1)
              );
            });
          console.log(`[useSubwooferSync] Run #${runNum} | ${valuesActuallyDifferent ? "Values changed" : "Only object reference changed"}`);

          // ── CORRELATION: report active worker state ──────────────────────
          const diag = typeof window !== "undefined" ? window.__BASS_WORKER_DIAG__ : null;
          if (diag) {
            console.log(`%c[useSubwooferSync] Run #${runNum} | CORRELATION`, "color: #ffa500; font-weight: bold;");
            console.log(`  Current Worker ID: ${diag.activeWorkerId ?? "—"}`);
            console.log(`  Current calculation phase: ${diag.calculationPhase ?? "—"}`);
            console.log(`  Current calibration fingerprint: ${diag.calibrationFingerprint ?? "—"}`);
            console.log(`  Current simulation fingerprint: ${diag.simulationFingerprint ?? "—"}`);
            console.log(`  Worker will be terminated on next render if deps changed (check for [AuthWorker] TERMINATED log)`);
          }
          // ── END CORRELATION ───────────────────────────────────────────────
        }

        console.log(`%c[useSubwooferSync] Run #${runNum} END`, __SUB_SYNC_END);
      }
      // ── END INSTRUMENTATION ──────────────────────────────────────────────

      if (!same) setSubwoofers(adapted);
      return;
    }

  }, [
    appState?.setSubwoofers,
    status,
    appState?.subwooferInstances,
    frontOrientation,
    rearOrientation,
  ]);
}