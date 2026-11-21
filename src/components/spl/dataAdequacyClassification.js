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
//   GOOD     — EITHER the manufacturer publishes a maximum SPL but does not
//               confirm continuous output (Sound Proof applies the agreed
//               −6 dB crest-factor allowance), OR no maximum SPL is published
//               but the normalizer has successfully calculated capability from
//               adequate manufacturer inputs (published sensitivity, reference,
//               impedance and a valid power authority such as a recommended
//               amplifier maximum or a stated power rating).
//   LIMITED  — essential capability information is missing, or the calculation
//               depends on a substantial provisional assumption that makes the
//               result unreliable. A peak-power estimate alone is not a
//               disqualifier when the manufacturer also publishes sensitivity
//               (so a credible amplifier-dependent calculation is possible) and
//               any published maximum SPL cap is respected; it stays LIMITED
//               when sensitivity is missing and no defensible amplifier-dependent
//               output curve can be produced.
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
    meaning: "The manufacturer publishes enough information for a credible RP22 estimate, but a meaningful part of the capability is calculated or extrapolated — either a maximum SPL that needs the −6 dB peak-to-continuous allowance, or a capability calculated from published sensitivity, impedance and a valid power authority when no maximum SPL is published.",
  },
  INCOMPLETE: {
    key: "INCOMPLETE",
    label: "LIMITED DATA",
    short: "LIMITED",
    tone: "#B23A3A",
    meaning: "Important manufacturer information needed to determine capability is missing, or the calculation depends on a substantial provisional assumption. The RP22 prediction is significantly less reliable.",
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

  const authority = record.max_spl_authority_type;

  // FULL: manufacturer publishes an explicit continuous maximum SPL. The
  // capability figure is used directly. Unrelated fields (measurement space,
  // sensitivity basis, recommended amplifier) are not required — UNLESS the
  // speaker is passive (has a published power handling rating) and lacks
  // sensitivity. In that case the comparison requires amplifier-dependent
  // output, and without sensitivity there is no defensible power-to-output
  // curve. The published max SPL is a ceiling, not a prediction at the
  // selected amplifier power, so FULL DATA is not justified.
  if (authority === "published_continuous") {
    if (record.missing_sensitivity_with_power_rating === true) {
      return DATA_ADEQUACY.INCOMPLETE;
    }
    return DATA_ADEQUACY.FULL;
  }

  // A provisional peak-to-continuous power estimate (continuous power and
  // recommended amplifier maximum both unavailable, power taken as 50% of the
  // published peak rating) is a controlled assumption, not an automatic
  // disqualifier. When the manufacturer also publishes sensitivity — so a
  // credible amplifier-dependent calculation is possible — and any published
  // maximum SPL cap is respected, GOOD DATA is appropriate: the result rests
  // on published sensitivity and a stated, conservative power assumption. It
  // stays LIMITED when sensitivity is missing, because without it there is no
  // defensible amplifier-dependent output curve and the published max SPL (if
  // any) is only a ceiling, not a prediction at the selected amplifier power.
  if (record.provisional_peak_assumed === true) {
    if (record.halfspace_sensitivity_db_1w_1m == null) return DATA_ADEQUACY.INCOMPLETE;
    return DATA_ADEQUACY.GOOD;
  }

  // GOOD: manufacturer publishes a maximum SPL but does not confirm continuous
  // output. Sound Proof applies the −6 dB crest-factor allowance — a
  // meaningful, controlled assumption.
  if (authority === "published_peak" || authority === "assumed_peak") return DATA_ADEQUACY.GOOD;

  // No published maximum SPL. The normalizer has already confirmed the row is
  // eligible (published sensitivity, a recognised reference, impedance where
  // required, and a valid power authority), so capability is calculated from
  // adequate manufacturer data. That is a credible estimate — GOOD DATA — not
  // LIMITED. A provisional peak-power estimate (the only remaining case here,
  // already guarded above) stays LIMITED.
  if (authority === "none") return DATA_ADEQUACY.GOOD;

  // Defensive: any other authority value on an eligible, non-provisional row.
  return DATA_ADEQUACY.GOOD;
}