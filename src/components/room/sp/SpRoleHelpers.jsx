// Role map helpers and speaker utility functions extracted from SpeakerPlacement
import { getCanonicalRole } from "@/components/utils/surroundRoleMap";

export const CANONICAL_ROLE_MAP = {
  FL: "FL", L: "FL",
  FC: "FC", C: "FC",
  FR: "FR", R: "FR",
  SL: "SL", LS: "SL",
  SR: "SR", RS: "SR",
  SBL: "SBL", RL: "SBL", RSL: "SBL", LR: "SBL", LRS: "SBL", BL: "SBL",
  SBR: "SBR", RR: "SBR", RSR: "SBR", RRS: "SBR", BR: "SBR", RB: "SBR",
  LW: "LW", FWL: "LW",
  RW: "RW", FWR: "RW",
  TFL: "TFL", TF: "TFL",
  TFR: "TFR",
  TL: "TL", TML: "TL", TSL: "TL",
  TR: "TR", TMR: "TR", TSR: "TR",
  TBL: "TBL", TRL: "TBL",
  TBR: "TBR", TRR: "TBR",
  UFL: "UFL", UFR: "UFR", UBL: "UBL", UBR: "UBR",
};

const CANONICAL_TO_ALIASES_MAP = new Map();
for (const alias in CANONICAL_ROLE_MAP) {
  const canonical = CANONICAL_ROLE_MAP[alias];
  if (!CANONICAL_TO_ALIASES_MAP.has(canonical)) {
    CANONICAL_TO_ALIASES_MAP.set(canonical, new Set());
  }
  CANONICAL_TO_ALIASES_MAP.get(canonical).add(alias);
}

export function allAliases(role) {
  const canonical = getCanonicalRole(role);
  return Array.from(CANONICAL_TO_ALIASES_MAP.get(canonical) || new Set([String(role || "").toUpperCase()]));
}

export function getByAnyRole(aliases, byRoleMap) {
  for (const alias of aliases) {
    const speaker = byRoleMap.get(alias);
    if (speaker) return speaker;
  }
  return null;
}

export function applyModelToAnyRoles(list, preferredRoles, model) {
  const targets = new Set(preferredRoles.map(getCanonicalRole));
  return (Array.isArray(list) ? list : []).map(s => {
    const canon = getCanonicalRole(s.role);
    return targets.has(canon) ? { ...s, model } : s;
  });
}

export function applyToAllSurrounds(prev, model) {
  const BED_SURROUND = new Set(["SL","SR","SBL","SBR","LW","RW"]);
  return (Array.isArray(prev)? prev: []).map(s => {
    const canon = getCanonicalRole(s.role);
    return BED_SURROUND.has(canon) ? { ...s, model } : s;
  });
}

export function buildRoleMap(list) {
  const m = new Map();
  (Array.isArray(list) ? list : []).forEach((s) => {
    const raw = String(s.role || "").toUpperCase();
    const canon = getCanonicalRole(raw);
    m.set(raw, s);
    m.set(canon, s);
  });
  return m;
}

export const isValidModel = (m) => {
  const s = String(m ?? "").trim().toLowerCase();
  return !!s && s !== "off" && s !== "none";
};

export function preserveSurroundModels(prevList, nextList, appState) {
  const prev = Array.isArray(prevList) ? prevList : [];
  const next = Array.isArray(nextList) ? nextList : [];
  const surroundCanon = new Set(["SL", "SR", "SBL", "SBR", "LW", "RW"]);
  const prevByCanon = new Map();
  prev.forEach((s) => { prevByCanon.set(getCanonicalRole(s?.role), s); });

  return next.map((s) => {
    const canon = getCanonicalRole(s?.role);
    if (!surroundCanon.has(canon)) return s;
    if (isValidModel(s?.model)) return s;
    const pm = prevByCanon.get(canon)?.model;
    if (isValidModel(pm)) return { ...s, model: pm };
    const gm = appState?.globalSurroundModel;
    if (isValidModel(gm)) return { ...s, model: gm };
    return s;
  });
}

export function applyLcrModel(placed, model) {
  if (!Array.isArray(placed)) return Array.isArray(placed) ? placed : [];
  const LCR_ROLES = new Set(["FL", "FC", "FR"]);
  return placed.map((spk) => {
    const role = String(spk?.role || "").toUpperCase();
    if (LCR_ROLES.has(role)) return { ...spk, model };
    return spk;
  });
}

export const applyLCRModel = applyLcrModel;

export function ensureSpeaker(spk, role) {
  return spk && spk.role === role ? spk : { id: `${role}-${Date.now()}`, role };
}

export function yawDegToMLP(spkPos, mlpPos) {
  const dx = mlpPos.x - spkPos.x;
  const dy = mlpPos.y - spkPos.y;
  const yawRad = Math.atan2(dx, dy);
  return yawRad * 180 / Math.PI;
}

export function applyLcrAim(placedSpeakers, mlpPoint, mode) {
  const LCR_ROLES = new Set(["FL", "FC", "FR"]);
  const speakers = Array.isArray(placedSpeakers) ? [...placedSpeakers] : [];
  if (!mlpPoint) return speakers;
  if (mode !== "angled") {
    return speakers.map(s =>
      LCR_ROLES.has(getCanonicalRole(s.role)) ? { ...s, rotation: { x:0, y:0, z:0 } } : s
    );
  }
  return speakers.map(s => {
    if (!LCR_ROLES.has(getCanonicalRole(s.role))) return s;
    if (!s.position) return s;
    const angle = yawDegToMLP(s.position, mlpPoint);
    return { ...s, rotation: { ...(s.rotation||{}), y: angle } };
  });
}

export const REAR_ALIASES = new Set(["SBL","SBR","RL","RR","RSL","RSR","LR","LRS","RRS","LB","RB"]);
export const REAR_CANON = new Set(["SBL", "SBR"]);
export const isRearByAnyRole = (role) => {
  const r = String(role||"").toUpperCase();
  return REAR_ALIASES.has(r) || REAR_CANON.has(getCanonicalRole(r));
};

export function formatDolbyLabel(key) {
  const [a = "5", b = "1", c = "0"] = String(key).split(".");
  const overheads = Number(c) || 0;
  return overheads > 0 ? `${a}.${b}.${overheads} Dolby Atmos` : `${a}.${b} Surround`;
}

export function getSurroundGroups(dolbyPreset) {
  const major = Number(String(dolbyPreset || "5.1").split(".")[0]) || 5;
  const groups = [
    { key: "wides", label: "Front Wides", roles: ["LW", "RW"], required: false },
    { key: "sides", label: "Side Surrounds", roles: ["SL", "SR"], required: false },
    { key: "rears", label: "Rear Surrounds", roles: ["SBL", "SBR"], required: false },
  ];
  if (major === 5) return groups.map(g => g.key === "sides" ? { ...g, required: true } : { ...g, required: false });
  if (major === 7) {
    return groups.map(g => {
      if (g.key === "sides") return { ...g, required: true };
      if (g.key === "rears") return { ...g, required: true };
      if (g.key === "wides") return { ...g, required: false };
      return g;
    });
  }
  if (major >= 9) return groups.map(g => ({ ...g, required: true }));
  return groups;
}

export function getOverheadGroups(dolbyPreset) {
  const parts = String(dolbyPreset || "").split(".");
  const overheadCount = Number(parts[2] || 0);
  const base = [
    { key: "oh-front",  label: "Front Overhead",  roles: ["TFL", "TFR"], required: false },
    { key: "oh-middle", label: "Middle Overhead", roles: ["TL", "TR"],   required: false },
    { key: "oh-rear",   label: "Rear Overhead",   roles: ["TBL", "TBR"], required: false },
  ];
  if (overheadCount >= 6) return base.map(g => ({ ...g, required: true }));
  if (overheadCount === 4) return base.map(g => g.key === "oh-front" || g.key === "oh-rear" ? { ...g, required: true } : { ...g, required: false });
  if (overheadCount === 2) return base.map(g => g.key === "oh-middle" ? { ...g, required: true } : { ...g, required: false });
  return base;
}