
/* Pad constrainers — pin icons inside pads; L/R allow ±50% X overhang; C locks to centre; Y locks to pad mid with 12mm clearance */
export function makePadConstrainers(
  padsById = {},
  screenMode = "baffle",
  frontPadOffsetM = 0.2
) {
  const isFloating = String(screenMode).startsWith("floating");
  const CLEAR = 0.012;         // 12 mm inside the plane
  // Signed plane: +0.30 floating (in front of wall), -0.30 baffle (behind wall)
  const PLANE = isFloating ? 0.30 : -0.30;
  // Absolute Y we want L/C/R on:
  const FRONT_Y_LOCK = PLANE + (PLANE > 0 ? -CLEAR : +CLEAR);

  const getRect = (key) => (padsById && padsById[key]) ? padsById[key] : null;

  // Utility with 12 mm inset on all clamps
  const lockToRect = (p) => ({
    clampX: (x) => {
      const inset = 0.012;
      const minX = p.x + inset;
      const maxX = p.x + p.width - inset;
      return Math.max(minX, Math.min(maxX, x));
    },
    clampY: (y) => {
      const inset = 0.012;
      const minY = p.y + inset;
      const maxY = p.y + p.height - inset;
      return Math.max(minY, Math.min(maxY, y));
    },
    midX: p.x + p.width / 2,
    midY: p.y + p.height / 2,
    // edges (meters) - these are not used for L/R/C anymore as Y is fixed to PLANE
    nearY: p.y, // Kept for other roles that might still use it or for backward compatibility if needed outside this function's immediate scope.
    farY: p.y + p.height, // Kept for other roles.
  });

  return function constrain(roleRaw, pos) {
    const role = String(roleRaw || "").toUpperCase();
    const current = { x: Number(pos?.x) || 0, y: Number(pos?.y) || 0 };

    // Resolve pad for role (including front aliases)
    let r = getRect(role);
    if (!r) {
      if (role === "L") r = getRect("FRONT-L") || getRect("L");
      if (role === "R") r = getRect("FRONT-R") || getRect("R");
      if (role === "C") r = getRect("C") || getRect("CENTRE");
    }
    // Added roles for leg pads and speaker pads if they are not picked up by the initial `getRect(role)`
    if (!r) {
      if (["SL","LS","LSS"].includes(role)) r = getRect("SL-leg");
      if (["SR","RS","RSS"].includes(role)) r = getRect("SR-leg");
      if (["LRS","RR","RRS","SBL"].includes(role)) r = getRect("REAR-L"); // Assuming LRS/SBL maps to REAR-L
      if (["RR","RRS","SBR"].includes(role)) r = getRect("REAR-R"); // Assuming RRS/SBR maps to REAR-R
      if (["FWL","LW"].includes(role)) r = getRect("FWL");
      if (["FWR","RW"].includes(role)) r = getRect("FWR");
    }

    if (!r) return current;

    const R = lockToRect(r);

    // Front L/R/C: ignore pad Y entirely, lock to the signed plane (+/-0.30 ± 12 mm)
    if (role === "L" || role === "R" || role === "C") {
      return { x: role === "C" ? R.midX : R.clampX(current.x), y: FRONT_Y_LOCK };
    }

    // Other roles: clamp within their pads with inset
    return {
      x: R.clampX(current.x),
      y: R.clampY(current.y),
    };
  };
}

export default { makePadConstrainers };
