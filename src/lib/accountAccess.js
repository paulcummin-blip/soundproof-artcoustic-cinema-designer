export const ACCESS_LEVELS = Object.freeze({
  FULL_ACCESS: "FULL_ACCESS",
  SOUND_PROOF_ONLY: "SOUND_PROOF_ONLY",
  PRICE_LIST_ONLY: "PRICE_LIST_ONLY",
});

export const ACCESS_LABELS = Object.freeze({
  FULL_ACCESS: "Full Access",
  SOUND_PROOF_ONLY: "Sound Proof Only",
  PRICE_LIST_ONLY: "Price List Only",
});

export function isMasterAdmin(user) {
  return user?.role === "admin" || user?.access_context?.capabilities?.masterAdmin === true;
}

export function hasCapability(user, capability) {
  if (!user) return false;
  if (isMasterAdmin(user)) return true;
  return user?.access_context?.capabilities?.[capability] === true;
}

export function defaultPathForUser(user) {
  if (isMasterAdmin(user)) return "/admin";
  if (hasCapability(user, "soundProof")) return "/Projects";
  if (hasCapability(user, "priceList")) return "/PriceList";
  if (hasCapability(user, "manageUsers")) return "/account/users";
  return "/";
}
