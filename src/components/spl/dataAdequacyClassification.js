// dataAdequacyClassification.js
// ---------------------------------------------------------------------------
// Admin-facing data-adequacy labels for the RP22 competitor library:
// FULL DATA / GOOD DATA / LIMITED DATA.
//
// These describe whether the manufacturer evidence supports a defensible
// P12/P13 result. They are NOT the engine's A/B/C/D confidence classes and are
// not derived from them — they are classified directly from the normalised
// record's own max-SPL authority, so the label can never drift from the data
// that produced it.
//
// The classification reflects whether the RP22 calculation has sufficient
// reliable input data, not how many database fields happen to be populated.
// A speaker is not downgraded because unrelated fields (measurement space,
// sensitivity basis, recommended amplifier) are blank when a continuous
// maximum SPL is already published directly. FULL DATA is not a laboratory
// certification standard — it means the manufacturer publishes enough
// information to determine the relevant capability directly.
//
//   FULL     — the manufacturer publishes an explicit continuous maximum SPL.
//               The capability figure is used directly; no additional
//               assumptions are required.
//   GOOD     — the manufacturer publishes a maximum SPL but does not confirm
//               continuous output. Sound Proof applies the agreed −6 dB
//               crest-factor allowance to estimate continuous capability.
//   LIMITED  — no published maximum SPL (capability calculated from
//               sensitivity and power handling), or essential capability
//               information is missing. A fair P12/P13 comparison is not
//               available.
// ---------------------------------------------------------------------------

export const DATA_ADEQUACY = Object.freeze({
  FULL: {
    key: "FULL",
    label: "FULL DATA",
    short: "FULL",
    tone: "#213428",
    meaning: "Manufacturer publishes an explicit continuous maximum SPL, so the RP22 capability figure is determined directly on the same evidence basis used for Artcoustic. No material additional assumptions are required.",
  },
  GOOD: {
    key: "GOOD",
    label: "GOOD DATA",
    short: "GOOD",
    tone: "#9A6E00",
    meaning: "Manufacturer publishes a maximum SPL but does not confirm continuous output. Sound Proof applies a −6 dB crest-factor allowance to estimate continuous capability — a controlled assumption.",
  },
  INCOMPLETE: {
    key: "INCOMPLETE",
    label: "LIMITED DATA",
    short: "LIMITED",
    tone: "#B23A3A",
    meaning: "Limited data — no published maximum SPL, so capability is estimated from sensitivity and power handling, or essential capability information is missing. Fair P12/P13 comparison not available.",
  },
});

/**
 * Classify one normalised competitor record (the shape normalizeCompetitor
 * returns — the same object loadComparisonCandidates puts on candidate.record).
 *
 * The classification is driven by the max-SPL authority: whether the manufacturer
 * published a continuous SPL (FULL), a non-continuous SPL that needs the −6 dB
 * allowance (GOOD), or no SPL at all (LIMITED). It does not require confirmed
 * measurement space, sensitivity basis or recommended amplifier power when a
 * continuous maximum SPL is already available.
 *
 * @param {object} record normalised competitor record
 * @returns {{ key, label, short, tone, meaning }}
 */
export function classifyDataAdequacy(record) {
  if (!record || record.p12_p13_eligible !== true) return DATA_ADEQUACY.INCOMPLETE;

  // A provisional peak-to-continuous power estimate (no max SPL, only peak
  // power) depends substantially on estimated performance — always LIMITED.
  if (record.provisional_peak_assumed === true) return DATA_ADEQUACY.INCOMPLETE;

  const authority = record.max_spl_authority_type;

  // FULL: manufacturer publishes an explicit continuous maximum SPL. The
  // capability figure is used directly. Unrelated fields (measurement space,
  // sensitivity basis, recommended amplifier) are not required.
  if (authority === "published_continuous") return DATA_ADEQUACY.FULL;

  // GOOD: manufacturer publishes a maximum SPL but does not confirm continuous
  // output. Sound Proof applies the −6 dB crest-factor allowance — a
  // meaningful, controlled assumption.
  if (authority === "published_peak" || authority === "assumed_peak") return DATA_ADEQUACY.GOOD;

  // LIMITED: no published maximum SPL. The capability is calculated from
  // sensitivity and power handling, so the comparison depends on estimated
  // rather than directly published performance.
  return DATA_ADEQUACY.INCOMPLETE;
}