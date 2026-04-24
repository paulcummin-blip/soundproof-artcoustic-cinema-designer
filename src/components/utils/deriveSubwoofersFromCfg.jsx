import { subDimsMM } from "@/components/data/subwooferData";

/**
 * Derives a flat array of placed subwoofer objects from frontSubsCfg / rearSubsCfg.
 * Used as a save-time fallback when appState.subwoofers is empty.
 */
export function deriveSubwoofersFromCfg(frontSubsCfg, rearSubsCfg, roomDims, stableDimensions) {
  const width =
    Number(roomDims?.widthM) ||
    Number(stableDimensions?.width) ||
    4.5;

  const length =
    Number(roomDims?.lengthM) ||
    Number(stableDimensions?.length) ||
    6.0;

  const getQty = (cfg) =>
    Math.max(0, Number(cfg?.count ?? cfg?.qty ?? 0) || 0);

  const buildSubs = (cfg, group) => {
    if (!cfg) return [];
    const qty = getQty(cfg);
    if (qty === 0 || !cfg.model) return [];

    const dims = subDimsMM[cfg.model];
    const subHeight = Number(dims?.h ?? 0) / 1000;
    const mountMode = cfg?.mountMode === "wall" ? "wall" : "floor";
    const z = mountMode === "wall" ? 0.80 + subHeight / 2 : 0.10 + subHeight / 2;
    const y = group === "front" ? 0.16 : length - 0.16;
    const positions = Array.isArray(cfg.positions) ? cfg.positions : [];

    return Array.from({ length: qty }, (_, i) => {
      let x;
      const saved = positions[i]?.x;
      if (Number.isFinite(saved)) {
        x = saved;
      } else if (qty === 1) {
        x = width * 0.5;
      } else {
        const margin = width * 0.15;
        const span = width - 2 * margin;
        x = margin + (span / (qty - 1)) * i;
      }

      const num = i + 1;
      return {
        id: `sub-${group}-${num}`,
        group,
        role: group === "front" ? `SUBF${num}` : `SUBR${num}`,
        model: cfg.model,
        isSub: true,
        position: { x, y, z },
      };
    });
  };

  return [
    ...buildSubs(frontSubsCfg, "front"),
    ...buildSubs(rearSubsCfg, "rear"),
  ];
}