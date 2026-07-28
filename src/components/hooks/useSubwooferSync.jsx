import { useEffect } from "react";
import { bassInputAdapter } from "@/components/utils/subwooferInstanceMigration";
import { INSTANCE_STATUS } from "@/components/utils/subwooferInstanceCompatibility";

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