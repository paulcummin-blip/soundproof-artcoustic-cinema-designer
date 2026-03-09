// Dolby preset constants and speaker seeding helpers extracted from RoomDesigner
// No React dependencies

import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Canonical Dolby layout → role list
export const DOLBY_PRESETS = {
  "5.1": ["FL", "FC", "FR", "SL", "SR", "LFE"],
  "7.1": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LFE"],
  "9.1": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW", "LFE"],

  "5.1.2": ["FL", "FC", "FR", "SL", "SR", "TML", "TMR", "LFE"],
  "5.1.4": ["FL", "FC", "FR", "SL", "SR", "TFL", "TFR", "TRL", "TRR", "LFE"],
  "5.1.6": ["FL", "FC", "FR", "SL", "SR", "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"],

  "7.1.2": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "TML", "TMR", "LFE"],
  "7.1.4": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "TFL", "TFR", "TRL", "TRR", "LFE"],
  "7.1.6": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"],

  "9.1.2": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW", "TML", "TMR", "LFE"],
  "9.1.4": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW", "TFL", "TFR", "TRL", "TRR", "LFE"],
  "9.1.6": ["FL", "FC", "FR", "SL", "SR", "SBL", "SBR", "LW", "RW", "TFL", "TFR", "TML", "TMR", "TRL", "TRR", "LFE"]
};

export const OVERHEAD_IDS_BY_LAYOUT = {
  "5.1.2": ["TML", "TMR"],
  "5.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "5.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"],
  "7.1.2": ["TML", "TMR"],
  "7.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "7.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"],
  "9.1.2": ["TML", "TMR"],
  "9.1.4": ["TFL", "TFR", "TRL", "TRR"],
  "9.1.6": ["TFL", "TFR", "TML", "TMR", "TRL", "TRR"]
};

export function getTargetOverheadIds(preset) {
  if (!preset) return [];
  const normalized = String(preset)
    .split(" ")[0]
    .split("_")[0]
    .toLowerCase();
  return OVERHEAD_IDS_BY_LAYOUT[normalized] || [];
}

export function seedSpeakersFromPreset({ preset, roomDimensions, listeningArea = null }) {
  if (globalThis.__B44_LOGS) console.log(
    "[RD SEED] called with preset =", preset,
    "DOLBY_PRESETS[preset] =", DOLBY_PRESETS ? DOLBY_PRESETS[preset] : undefined
  );

  const w = Number(roomDimensions?.width) || 4.5;
  const l = Number(roomDimensions?.length) || 6.0;
  const h = Number(roomDimensions?.height) || 2.8;

  const m = 0.02;
  const yFront = m;
  const yRear = l - m;
  const earZ = 1.1;
  const topZ = Math.max(0.3, h - 0.15);

  const x25 = w * 0.25;
  const x50 = w * 0.50;
  const x75 = w * 0.75;

  // LCR seed: use the same physics as the RoomDesigner LCR lock effect:
  //   wallY = gapM + halfDepth  (gapM=0.01, default depthM=0.082 → halfDepth=0.041)
  // This places FL/FC/FR exactly where the lock effect will put them, so no correction
  // is needed on first render and the speakers appear in the correct front zone.
  const DEFAULT_LCR_DEPTH_M = 0.082;
  const yLcr = 0.01 + DEFAULT_LCR_DEPTH_M / 2; // = 0.051 m

  const la = listeningArea && typeof listeningArea === "object" ? listeningArea : null;
  const sideY = la ? la.midY : l * 0.60;
  const backLeftX = la ? Math.max(m, la.minX) : x25;
  const backRightX = la ? Math.min(w - m, la.maxX) : x75;

  const posForRole = (role) => {
    switch (role) {
      case "FL": return { x: x25, y: yLcr, z: earZ };
      case "FC": return { x: x50, y: yLcr, z: earZ };
      case "FR": return { x: x75, y: yLcr, z: earZ };
      case "FCL": return { x: Math.max(m, x25 - 0.2), y: yFront, z: earZ };
      case "FCR": return { x: Math.min(w - m, x75 + 0.2), y: yFront, z: earZ };
      case "SL": return { x: m, y: Math.max(m, Math.min(sideY, la ? la.maxY : sideY)), z: earZ };
      case "SR": return { x: w - m, y: Math.max(m, Math.min(sideY, la ? la.maxY : sideY)), z: earZ };
      case "SBL":
      case "SBR": {
        const xPos = role === "SBL" ? x25 : x75;
        return { x: Math.max(m, Math.min(xPos, w - m)), y: l - 0.10, z: earZ };
      }
      case "RBL": return { x: Math.max(m, Math.min(backLeftX, w - m)), y: Math.min(yRear, l - m), z: earZ };
      case "RBR": return { x: Math.max(m, Math.min(backRightX, w - m)), y: Math.min(yRear, l - m), z: earZ };
      case "LW": return { x: w * 0.15, y: l * 0.4, z: earZ };
      case "RW": return { x: w * 0.85, y: l * 0.4, z: earZ };
      case "TML": return { x: x25, y: l * 0.50, z: topZ };
      case "TMR": return { x: x75, y: l * 0.50, z: topZ };
      case "TFL": return { x: x25, y: l * 0.35, z: topZ };
      case "TFR": return { x: x75, y: l * 0.35, z: topZ };
      case "TFC": return { x: x50, y: l * 0.35, z: topZ };
      case "TRL": return { x: x25, y: l * 0.70, z: topZ };
      case "TRR": return { x: x75, y: l * 0.70, z: topZ };
      case "TRC": return { x: x50, y: l * 0.70, z: topZ };
      case "TL": return { x: x25, y: l * 0.50, z: topZ };
      case "TR": return { x: x75, y: l * 0.50, z: topZ };
      case "TBL": return { x: x25, y: l * 0.70, z: topZ };
      case "TBR": return { x: x75, y: l * 0.70, z: topZ };
      case "TBC": return { x: x50, y: l * 0.70, z: topZ };
      case "LFE": return { x: x50, y: yFront + 0.20, z: 0.3 };
      default: return { x: x50, y: l * 0.60, z: earZ };
    }
  };

  const roles = DOLBY_PRESETS[preset] || [];
  const seeded = roles.map((role) => ({
    id: role,
    role,
    label: role,
    model: undefined,
    position: posForRole(role)
  }));

  if (globalThis.__B44_LOGS) console.log(
    "[RD SEED] result roles =",
    Array.isArray(seeded) ? seeded.map((s) => s.role) : "(not array)"
  );

  return seeded;
}

export function ensureAtmosOverheads({
  placedSpeakers,
  dolbyPreset,
  roomDimensions,
  overheadGlobalModel = null,
  overheadFrontOverride = null,
  overheadMidOverride = null,
  overheadRearOverride = null,
  useFrontGlobal = true,
  useMidGlobal = true,
  useRearGlobal = true
}) {
  const current = Array.isArray(placedSpeakers) ? placedSpeakers : [];

  const normalizedPreset = dolbyPreset
    ? String(dolbyPreset).split(" ")[0].split("_")[0]
    : "";

  const parts = normalizedPreset.split(".");
  const heights = parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;

  if (!heights) {
    const withoutOverheads = current.filter((spk) => {
      const role = String(spk?.role || "").toUpperCase();
      return !(role.startsWith("T") || role.startsWith("U"));
    });
    if (withoutOverheads.length === current.length) return current;
    return withoutOverheads;
  }

  const targetOverheadIds = getTargetOverheadIds(normalizedPreset);
  if (!targetOverheadIds || targetOverheadIds.length === 0) return current;

  const bedSpeakers = [];
  const currentOverheads = [];

  for (const spk of current) {
    const role = String(spk?.role || "").toUpperCase();
    if (role.startsWith("T")) {
      currentOverheads.push(spk);
    } else {
      bedSpeakers.push(spk);
    }
  }

  const existingByRole = new Map(
    currentOverheads.map((spk) => [String(spk.role || "").toUpperCase(), spk])
  );

  const seeded = seedSpeakersFromPreset({ preset: normalizedPreset, roomDimensions, listeningArea: null }) || [];

  const seededOverheadsByRole = new Map(
    seeded
      .filter((spk) => typeof spk?.role === "string" && spk.role.toUpperCase().startsWith("T"))
      .map((spk) => [String(spk.role || "").toUpperCase(), spk])
  );

  const nextOverheads = [];

  for (const id of targetOverheadIds) {
    const canonId = String(id || "").toUpperCase();
    const existing = existingByRole.get(canonId);
    if (existing) {
      nextOverheads.push(existing);
      continue;
    }

    const seededSpk = seededOverheadsByRole.get(canonId);
    if (seededSpk) {
      nextOverheads.push(seededSpk);
    }
  }

  let merged = [...bedSpeakers, ...nextOverheads];

  if (overheadGlobalModel) {
    const OVERHEAD_CANON_ROLES = new Set([
      "TFL", "TFR", "TML", "TMR", "TRL", "TRR",
      "TL", "TR", "TBL", "TBR", "TFC", "TRC", "TBC"
    ]);

    merged = merged.map((spk) => {
      const canonRole = String(spk.role || "").toUpperCase();
      if (!OVERHEAD_CANON_ROLES.has(canonRole)) return spk;

      const currentModel = (spk.model || "").toString().trim().toLowerCase();
      if (!currentModel || currentModel === "off" || currentModel === "none") {
        let modelFromOverrides = overheadGlobalModel;

        if (['TFL', 'TFR', 'TFC'].includes(canonRole)) {
          modelFromOverrides = useFrontGlobal ? overheadGlobalModel : overheadFrontOverride || overheadGlobalModel;
        } else if (['TML', 'TMR', 'TL', 'TR'].includes(canonRole)) {
          modelFromOverrides = useMidGlobal ? overheadGlobalModel : overheadMidOverride || overheadGlobalModel;
        } else if (['TRL', 'TRR', 'TRC', 'TBL', 'TBR'].includes(canonRole)) {
          modelFromOverrides = useRearGlobal ? overheadGlobalModel : overheadRearOverride || overheadGlobalModel;
        }

        return { ...spk, model: modelFromOverrides };
      }

      return spk;
    });
  }

  return merged;
}