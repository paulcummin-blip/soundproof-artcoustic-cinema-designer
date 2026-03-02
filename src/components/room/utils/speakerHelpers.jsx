// Pure speaker helper functions extracted from RoomDesigner
// No React dependencies - safe to import anywhere

export const preserveSurroundModels = (prevList, nextList) => {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(nextList) ? nextList : [];

  const canon = (r) => String(r || "").toUpperCase();

  const isValidModel = (m) => {
    const s = String(m ?? "").trim().toLowerCase();
    return !!s && s !== "off" && s !== "none" && s !== "null" && s !== "undefined";
  };

  const surroundRoles = new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);
  const prevByRole = new Map(prev.map((s) => [canon(s?.role), s]));

  return next.map((s) => {
    const role = canon(s?.role);
    if (!surroundRoles.has(role)) return s;

    const prevMatch = prevByRole.get(role);
    const nextModelOk = isValidModel(s?.model);
    const prevModelOk = isValidModel(prevMatch?.model);

    if (!nextModelOk && prevModelOk) {
      return { ...s, model: prevMatch.model };
    }
    return s;
  });
};

export const CANON_MAP = {
  LS: 'SL', SL: 'SL', RS: 'SR', SR: 'SR',
  RL: 'SBL', RR: 'SBR', RSL: 'SBL', RSR: 'SBR', LRS: 'SBL', RRS: 'SBR',
  FWL: 'LW', FWR: 'RW', LW: 'LW', RW: 'RW',
  SBL: 'SBL', SBR: 'SBR',
  FL: "FL", L: "FL", FC: "FC", C: "FC", FR: "FR", R: "FR",
  TFL: "TFL", TFR: "TFR",
  TML: "TML", TMR: "TMR", TL: "TML", TR: "TMR",
  TRL: "TRL", TRR: "TRR", TBL: "TRL", TBR: "TRR",
  TFC: "TFC", TRC: "TRC", TBC: "TRC"
};

export const canon = (r) => CANON_MAP[String(r || '').toUpperCase()] || String(r || '').toUpperCase();

export const safeCanon = (r) => {
  try { return canon(r); } catch { return String(r || "").toUpperCase(); }
};

export const speakersEqual = (listA, listB) => {
  if (!listA || !listB) return listA === listB;
  if (listA.length !== listB.length) return false;

  const aMap = new Map(listA.map((s) => [s.id, s]));

  for (const speakerB of listB) {
    const speakerA = aMap.get(speakerB.id);
    if (!speakerA) return false;
    if (speakerA.role !== speakerB.role || speakerA.model !== speakerB.model) return false;

    const posA = speakerA.position || {};
    const posB = speakerB.position || {};
    if (Math.abs((posA.x ?? 0) - (posB.x ?? 0)) > 0.001) return false;
    if (Math.abs((posA.y ?? 0) - (posB.y ?? 0)) > 0.001) return false;
    if (Math.abs((posA.z ?? 0) - (posB.z ?? 0)) > 0.001) return false;
  }

  return true;
};

export function carryModel(prevSpeakers, roleFrom, roleTo, fallbackHint = null) {
  const byCanon = new Map();
  (prevSpeakers || []).forEach((s) => byCanon.set(safeCanon(s.role), s));

  const from = byCanon.get(safeCanon(roleFrom));
  const existing = byCanon.get(safeCanon(roleTo));
  return existing?.model ?? from?.model ?? fallbackHint ?? undefined;
}

export function isOverheadRole(role) {
  const r = safeCanon(role);
  return r.startsWith('T') || r.startsWith('U');
}

export function mergePreserveOverheads(prevList, draftNextList, activeDolbyPreset) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(draftNextList) ? draftNextList : [];

  const normalizedPreset = activeDolbyPreset
    ? String(activeDolbyPreset).split(" ")[0].split("_")[0]
    : "";

  const parts = normalizedPreset.split(".");
  const heights = parts.length >= 3 ? (parseInt(parts[2], 10) || 0) : 0;
  const layoutAllowsOverheads = heights > 0;

  const nextBeds = next.filter((s) => !isOverheadRole(safeCanon(s?.role)));
  const nextOverheads = next.filter((s) => isOverheadRole(safeCanon(s?.role)));

  if (!layoutAllowsOverheads) {
    return [...nextBeds];
  }

  const prevOverheads = prev.filter((s) => isOverheadRole(safeCanon(s?.role)));
  const overheadsToKeep = nextOverheads.length > 0 ? nextOverheads : prevOverheads;

  const overheadMap = new Map();
  overheadsToKeep.forEach((s) => {
    overheadMap.set(safeCanon(s?.role), s);
  });

  const mergedOverheads = Array.from(overheadMap.values());
  return [...nextBeds, ...mergedOverheads];
}

export function cloneRoleWithModel(byRole, fromRole, toRole, fallbackModel) {
  const src = byRole.get(fromRole);
  return {
    id: toRole, role: toRole, label: toRole,
    model: src?.model ?? fallbackModel ?? undefined,
    position: null
  };
}

export function logPlacedSpeakers(message, speakers) {
  const rows = (speakers || []).map((s) => ({
    roleRaw: s.role,
    roleCanon: canon(s.role),
    model: s.model || "(none)"
  }));

  if (typeof console !== 'undefined' && typeof console.groupCollapsed === 'function') {
    console.groupCollapsed(message);
    if (typeof console.table === 'function') console.table(rows);
    if (typeof console.groupEnd === 'function') console.groupEnd();
  } else if (typeof console !== 'undefined' && typeof console.log === 'function') {
    if (globalThis.__B44_LOGS) console.log(message, rows);
  }
}

// --- IN-ROOM DEPTH HELPERS ---
export const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);

export const degToRad = (deg) => (deg * Math.PI) / 180;

export const halfNormalExtentM = (widthM, depthM, yawDeg, normalAxis) => {
  const halfW = (isFiniteNum(widthM) ? widthM : 0.12) / 2;
  const halfD = (isFiniteNum(depthM) ? depthM : 0.08) / 2;
  const a = degToRad(isFiniteNum(yawDeg) ? yawDeg : 0);

  if (normalAxis === "x") {
    return Math.abs(Math.cos(a)) * halfW + Math.abs(Math.sin(a)) * halfD;
  }
  return Math.abs(Math.sin(a)) * halfW + Math.abs(Math.cos(a)) * halfD;
};

export const inRoomDepthM = ({ speaker, wall, roomW, roomL, widthM, depthM, yawDeg }) => {
  if (!speaker?.position) return null;
  const x = speaker.position.x;
  const y = speaker.position.y;
  if (!isFiniteNum(x) || !isFiniteNum(y)) return null;
  if (!isFiniteNum(roomW) || !isFiniteNum(roomL)) return null;

  let dCentre = null;
  let normalAxis = "x";

  if (wall === "left") { dCentre = x; normalAxis = "x"; }
  else if (wall === "right") { dCentre = roomW - x; normalAxis = "x"; }
  else if (wall === "back") { dCentre = roomL - y; normalAxis = "y"; }
  else if (wall === "front") { dCentre = y; normalAxis = "y"; }

  if (!isFiniteNum(dCentre)) return null;

  const halfN = halfNormalExtentM(widthM, depthM, yawDeg, normalAxis);
  return dCentre + halfN;
};

export const rotatedHalfExtentToWall = (yawDeg, widthM_spk, depthM_spk, wallAxis) => {
  const halfW = Math.max(0, (Number(widthM_spk) || 0) / 2);
  const halfD = Math.max(0, (Number(depthM_spk) || 0) / 2);
  const a = Math.abs(Math.cos(degToRad(Number(yawDeg) || 0)));
  const b = Math.abs(Math.sin(degToRad(Number(yawDeg) || 0)));

  return wallAxis === "x"
    ? (a * halfW + b * halfD)
    : (b * halfW + a * halfD);
};

export const yawDegToMLP = (pos, mlp) => {
  if (!pos || !mlp) return 0;
  const dx = mlp.x - pos.x;
  const dy = mlp.y - pos.y;
  return -Math.atan2(dx, dy) * (180 / Math.PI);
};