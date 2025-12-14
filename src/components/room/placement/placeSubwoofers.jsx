import { subDimsMM, subHeightDefault } from "@/components/data/subwooferData";

// helpers
const mmToM = v => (v ?? 0) / 1000;

export function placeSubwoofers({
  room,                   // { width_m, length_m, height_m }
  wallY_m,                // front wall Y (likely 0)
  screenPlaneY_m,         // current screen plane from wall
  wallBuffer_m = 0.02,
  screenBuffer_m = 0.01,
  lcr,                    // { L, C, R } with { x_m, y_m, dims?: { w_m } }
  group,                  // "front" | "rear"
  cfg,                    // { model, qty }
  speakerDimsFallback_m = 0.25 // if L/C/R width missing (we warn instead)
}) {
  const warnings = [];
  const model = cfg?.model;
  const qty = Math.max(0, Math.min(4, cfg?.qty ?? 0));

  const dims = subDimsMM[model];
  if (!dims) {
    warnings.push(`No dimensions found for ${model}.`);
    return { placed: [], neededScreenDepth_m: 0, warnings };
  }
  const subW_m = mmToM(dims.w), subH_m = mmToM(dims.h), subD_m = mmToM(dims.d);

  if (!lcr?.L || !lcr?.C || !lcr?.R) {
    warnings.push("LCR positions unavailable — cannot derive LC/RC sub slots.");
    return { placed: [], neededScreenDepth_m: 0, warnings };
  }

  const wL_m = lcr.L.dims?.w_m ?? speakerDimsFallback_m;
  const wC_m = lcr.C.dims?.w_m ?? speakerDimsFallback_m;
  const wR_m = lcr.R.dims?.w_m ?? speakerDimsFallback_m;

  // compute “inner edge” corridors between cabinets
  const innerGapLC_m = Math.abs((lcr.C.x_m - wC_m/2) - (lcr.L.x_m + wL_m/2));
  const innerGapRC_m = Math.abs((lcr.R.x_m - wR_m/2) - (lcr.C.x_m + wC_m/2));

  const needClearance_m = subW_m + 0.10; // 5 cm each side
  const slotOK = {
    LC: innerGapLC_m >= needClearance_m,
    RC: innerGapRC_m >= needClearance_m
  };

  // horizontal x positions: centre each corridor
  const xLC_m = ( (lcr.L.x_m + wL_m/2) + (lcr.C.x_m - wC_m/2) ) / 2;
  const xRC_m = ( (lcr.C.x_m + wC_m/2) + (lcr.R.x_m - wR_m/2) ) / 2;

  // depth Y and screen depth requirement
  const isFront = group === "front";
  const baseY_m = isFront
    ? wallY_m + wallBuffer_m + subD_m / 2 // Center of sub depth
    : (room.length_m - wallBuffer_m - subD_m / 2);

  // height Z (BOTTOM-referenced now)
  const hDef = subHeightDefault[model] || { mode: "bottom", z_mm: 800 };
  const bottomZ_m = Math.max(mmToM(hDef.z_mm), 0.05); // keep 5 cm safety from floor
  let z_m = bottomZ_m + (subH_m / 2);                 // convert bottom -> centre

  // keep 5 cm headroom from ceiling for the top of cabinet
  if (z_m + subH_m / 2 > room.height_m - 0.05) {
    z_m = room.height_m - 0.05 - subH_m / 2;
  }

  // compute “needed” screen depth if front
  const neededScreenDepth_m = isFront ? (wallBuffer_m + subD_m + screenBuffer_m) : 0;

  // build desired slots order for qty 1..4
  const order = ["LC", "RC", "LC2", "RC2"]; // LC2/RC2 are stacked instances
  const xBySlot = { LC: xLC_m, RC: xRC_m, LC2: xLC_m, RC2: xRC_m };
  const corridorOK = { LC: slotOK.LC, RC: slotOK.RC, LC2: slotOK.LC, RC2: slotOK.RC };

  const placed = [];
  for (let i = 0; i < qty; i++) {
    const slot = order[i];
    if (!corridorOK[slot]) {
      warnings.push(`${group.toUpperCase()} ${slot.replace("2","")} slot: does not fit (need ${needClearance_m.toFixed(3)} m, have ${(slot.includes("LC")?innerGapLC_m:innerGapRC_m).toFixed(3)} m).`);
      continue;
    }
    // stacking logic: second in a corridor stacks vertically
    const stackIdx = slot.endsWith("2") ? 1 : 0;
    const zStack_m = z_m + (stackIdx === 1 ? (subH_m + 0.05) : 0);
    if (zStack_m + subH_m/2 > room.height_m - 0.05) {
      warnings.push(`${group.toUpperCase()} ${slot.replace("2","")} stack: not enough height to stack.`);
      continue;
    }
    placed.push({
      id: `${group.toUpperCase()}_SUB_${i+1}`,
      role: "SUB",
      model,
      position: { x: xBySlot[slot], y: baseY_m, z: zStack_m },
      dims_m: { w: subW_m, h: subH_m, d: subD_m },
      group,
      enabled: true,
      phaseAdjust: 0,
      delay: 0,
      gainDb: 0,
      polarity: 1,
    });
  }

  return { placed, neededScreenDepth_m, warnings };
}