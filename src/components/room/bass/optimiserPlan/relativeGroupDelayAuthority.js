// relativeGroupDelayAuthority.js
// ---------------------------------------------------------------------------
// HOW SUBWOOFER TIMING IS STATED: as a RELATIVE GROUP OFFSET, never as two
// absolute processor delays.
//
// Product rule this exists to satisfy: for sub-to-sub bass summation the value
// that matters is the timing RELATIONSHIP between the subwoofer groups. A panel
// that leads with "front 3 ms / rear 4 ms" hides the only installable fact —
// that the rear group sits one millisecond later than the front group. The
// designer should never have to subtract two processor values to see it.
//
// DISPLAY ONLY. This module reads values that already exist — the design's own
// group delays, or a candidate's own applied values — and re-expresses them as
// offsets from the lowest delay among the involved groups. It changes no tuning
// value, applies nothing, saves nothing, scores nothing and touches no acoustic
// calculation. The absolute saved processor delays remain the authority; they
// are shown in Engineer details instead of in the main panel.
//
// Normalisation (display only):
//   • the LOWEST delay among the involved groups is the reference (0 ms)
//   • every other group states its offset from that reference
//   • a positive offset means that group is LATER than the reference, and the
//     reference group is never restated as a bare number ahead of it
//
// A group whose delay or physical side is not recorded is never guessed at: the
// statement is then unavailable (null) and the panel keeps the absolute
// presentation it already had.
//
// Pure: no React, no side effects, no stores.
// ---------------------------------------------------------------------------

/** The mandated one-line explanation of why timing is stated relatively. */
export const RELATIVE_GROUP_DELAY_NOTE =
  "Subwoofer timing is shown as a relative group offset because bass summation depends on the timing relationship between the sub groups.";

/** The block titles the panel and Engineer details use. */
export const RELATIVE_GROUP_DELAY_TITLE = "Best acoustic delay";
export const ABSOLUTE_GROUP_DELAY_TITLE = "Absolute processor delays";

/** The reference word used for the group that carries no offset. */
export const GROUP_DELAY_REFERENCE_WORD = "reference";

/** The installable name of each physical group. */
export const GROUP_REFERENCE_LABEL = Object.freeze({
  front: "Front sub group",
  rear: "Rear sub group",
});

/** "the front group" / "the rear group" — the side a group is named against. */
const GROUP_SHORT_LABEL = Object.freeze({
  front: "front group",
  rear: "rear group",
});

/** The group order the statement names them in. */
const GROUP_ORDER = Object.freeze(["front", "rear"]);

/** An offset smaller than this reads as no offset at all. */
const TOLERANCE_MS = 0.05;

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function round1(value) {
  return value == null ? null : Math.round(Number(value) * 10) / 10;
}

function msText(value) {
  const ms = round1(finite(value));
  if (ms == null) return null;
  return Number.isInteger(ms) ? `${ms}` : ms.toFixed(1);
}

/** "3 ms" · "3.5 ms" — an absolute processor delay, whole where it is whole. */
export function formatGroupDelayMs(value) {
  const text = msText(value);
  return text == null ? null : `${text} ms`;
}

/** "0 ms (reference)" · "+1 ms" · "−1 ms" — a signed RELATIVE group offset. */
export function formatRelativeGroupDelayMs(value) {
  const ms = round1(finite(value));
  if (ms == null) return null;
  if (Math.abs(ms) < TOLERANCE_MS) return `0 ms (${GROUP_DELAY_REFERENCE_WORD})`;
  return `${ms > 0 ? "+" : "−"}${msText(Math.abs(ms))} ms`;
}

/**
 * The physical side a subwoofer belongs to: the wall group it is stamped with,
 * or — with no stamp — which half of the room it sits in, exactly as the
 * placement census reads it. Never guessed beyond that.
 */
export function resolveSubwooferRole(instance, roomDims = null) {
  const declared = String(instance?.legacyGroup || instance?.group || "").toLowerCase();
  if (declared === "front" || declared === "rear") return declared;
  const lengthM = finite(roomDims?.lengthM ?? roomDims?.length);
  const y = finite(instance?.position?.y ?? instance?.y);
  if (lengthM == null || y == null) return null;
  return y < lengthM / 2 ? "front" : "rear";
}

/** The applied (candidate) delay a decision's own delay rows state per group. */
function appliedDelayByGroup(settings) {
  const rows = Array.isArray(settings) ? settings : [];
  const byRole = new Map();
  rows.forEach((row) => {
    const isDelay = row?.setting === "Delay"
      || String(row?.key || "").startsWith("delay:")
      || (row?.setting === undefined && Number.isFinite(Number(row?.toMs)));
    if (!isDelay) return;
    const role = String(row?.group || "").toLowerCase();
    if (role !== "front" && role !== "rear") return;
    const applied = finite(parseFloat(row?.to))
      ?? finite(row?.toMs);
    if (applied == null) return;
    byRole.set(role, applied);
  });
  return byRole;
}

/**
 * The delay each physical group carries, read from the design's own subwoofers
 * (the group's mean, so a group whose members differ by a hair still states one
 * value) and, where the decision recorded an applied value for that group, from
 * that value instead — a held candidate is not in the design yet.
 *
 * @param {object} params
 * @param {Array} params.instances - the design's subwoofer instances
 * @param {Array} [params.settings] - the decision's own setting rows
 * @param {object|null} [params.roomDims] - { lengthM } for the wall fallback
 * @returns {{available: boolean, groups: Array, reason: string|null}}
 */
export function resolveGroupDelays({ instances = [], settings = [], roomDims = null } = {}) {
  const active = (Array.isArray(instances) ? instances : []).filter((sub) => sub?.enabled !== false);
  if (!active.length) return { available: false, groups: [], reason: "no-subwoofers" };

  const byRole = new Map();
  for (const sub of active) {
    const role = resolveSubwooferRole(sub, roomDims);
    const value = finite(sub?.delayMs);
    if (!role || value == null) return { available: false, groups: [], reason: "group-not-recorded" };
    byRole.set(role, [...(byRole.get(role) || []), value]);
  }
  if (byRole.size < 2) return { available: false, groups: [], reason: "single-group" };

  const applied = appliedDelayByGroup(settings);
  const groups = GROUP_ORDER
    .filter((role) => byRole.has(role))
    .map((role) => {
      const values = byRole.get(role);
      const recorded = applied.get(role);
      const value = recorded != null
        ? recorded
        : values.reduce((total, entry) => total + entry, 0) / values.length;
      return {
        role,
        label: GROUP_REFERENCE_LABEL[role],
        delayMs: round1(value),
        source: recorded != null ? "candidate" : "design",
      };
    });

  return { available: true, groups, reason: null };
}

/**
 * The complete relative presentation of the involved subwoofer groups, or null
 * when the groups are not recorded (then the panel states nothing new).
 *
 * @param {object} params
 * @param {Array} params.instances - the design's subwoofer instances
 * @param {Array} [params.settings] - the decision's own setting rows
 * @param {object|null} [params.roomDims] - { lengthM } for the wall fallback
 * @returns {object|null}
 */
export function buildRelativeGroupDelays({ instances = [], settings = [], roomDims = null } = {}) {
  const resolved = resolveGroupDelays({ instances, settings, roomDims });
  if (!resolved.available) return null;

  // The reference is the LOWEST delay among the involved groups: every group is
  // then stated as an offset from it, so no absolute pair leads the panel.
  const reference = resolved.groups.reduce(
    (lowest, group) => (group.delayMs < lowest.delayMs ? group : lowest),
    resolved.groups[0],
  );

  const rows = resolved.groups.map((group) => {
    const relativeMs = round1(group.delayMs - reference.delayMs);
    return {
      role: group.role,
      label: group.label,
      absoluteMs: group.delayMs,
      relativeMs,
      absoluteText: formatGroupDelayMs(group.delayMs),
      relativeText: formatRelativeGroupDelayMs(relativeMs),
      source: group.source,
    };
  });

  const offset = rows
    .filter((row) => row.relativeMs > TOLERANCE_MS)
    .sort((a, b) => b.relativeMs - a.relativeMs)[0] || null;

  const statement = offset
    ? `${offset.label} ${formatRelativeGroupDelayMs(offset.relativeMs)} relative to the ${
      GROUP_SHORT_LABEL[reference.role] || "reference group"}`
    : "The sub groups are already aligned — no relative delay offset.";

  return {
    statement,
    hasOffset: Boolean(offset),
    reference: {
      role: reference.role,
      label: reference.label,
      delayMs: reference.delayMs,
      text: formatRelativeGroupDelayMs(0),
    },
    offset: offset
      ? {
        role: offset.role,
        label: offset.label,
        relativeMs: offset.relativeMs,
        text: formatRelativeGroupDelayMs(offset.relativeMs),
        laterThan: reference.label,
      }
      : null,
    rows,
    // Engineer details state the absolute saved processor delays beside the
    // relative offset, so the applied values stay traceable.
    absoluteRows: rows.map((row) => ({ role: row.role, label: row.label, text: row.absoluteText })),
    relativeRows: rows.map((row) => ({ role: row.role, label: row.label, text: row.relativeText })),
    note: RELATIVE_GROUP_DELAY_NOTE,
  };
}