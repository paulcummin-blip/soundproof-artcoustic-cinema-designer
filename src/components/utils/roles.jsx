// roles.js — tiny helpers used by pipeline and overlays

export const isOverheadRole = (role = "") => /^T(F|M|R)[LR]$/.test(String(role).toUpperCase());

// P5 includes ALL bed-layer surrounds + wides; excludes LCR, subs, overheads.
export const isP5SurroundRole = (role = "") => {
  const r = String(role).toUpperCase();
  if (isOverheadRole(r)) return false;
  if (["L", "C", "R"].includes(r)) return false;
  if (r.includes("SUB")) return false;
  return /^(LW|RW|LS|RS|LSS|RSS|LRS|RRS|LBS|RBS)$/.test(r);
};