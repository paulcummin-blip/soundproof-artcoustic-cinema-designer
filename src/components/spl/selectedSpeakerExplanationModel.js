// selectedSpeakerExplanationModel.js
// ---------------------------------------------------------------------------
// Pure logic for the always-visible selected-speaker data-confidence
// explanation. Extracted from the React component so it is testable without a
// JSX loader. The component imports this and renders the result.
//
// buildSelectedSpeakerExplanation returns { label, tone, why, calculated,
// assumed, dontKnow } for one normalized competitor record, where any of
// calculated/assumed/dontKnow may be null.
// ---------------------------------------------------------------------------

import { classifyDataAdequacy, DATA_ADEQUACY } from "./dataAdequacyClassification";
import { PEAK_TO_CONTINUOUS_ALLOWANCE_DB } from "@/components/utils/spl/maxSplAuthority";
import { PEAK_TO_CONTINUOUS_FACTOR } from "@/components/utils/spl/peakPowerAssumption";

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== "" && Number.isFinite(Number(value));

function db(value, suffix = " dB") {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return `${Math.round(n)}${suffix}`;
}

function watts(value) {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return `${Number(n.toFixed(0))} W`;
}

function ohms(value) {
  if (!hasValue(value)) return null;
  const n = Number(value);
  return `${Number(n.toFixed(0))} Ω`;
}

function publishedPeakFigure(record) {
  return record.halfspace_published_max_peak_spl_db_1m
    ?? record.halfspace_published_max_continuous_spl_db_1m
    ?? null;
}

function isPublishedPowerRating(record) {
  return record.normalized_continuous_power_w != null
    && Number(record.normalized_continuous_power_w) > 0;
}

function powerAuthorityPhrase(record) {
  return isPublishedPowerRating(record) ? "power rating" : "amplifier recommendation";
}

export function buildSelectedSpeakerExplanation(record, candidate = null) {
  if (!record) return null;
  const adequacy = candidate?.adequacy || classifyDataAdequacy(record);

  // LIMITED: not eligible
  if (record.p12_p13_eligible !== true) {
    const warnings = Array.isArray(record.normalization_warnings) ? record.normalization_warnings : [];
    const missing = warnings.map((w) => String(w || "").trim()).filter(Boolean);
    const dontKnow = missing.length > 0
      ? missing.join("; ")
      : "The manufacturer does not publish enough information to determine the speaker's capability.";
    return {
      label: adequacy.label,
      tone: adequacy.tone,
      why: "Sound Proof cannot reliably calculate RP22 capability from the information the manufacturer publishes.",
      calculated: null,
      assumed: null,
      dontKnow,
    };
  }

  // LIMITED: provisional peak-power estimate
  if (record.provisional_peak_assumed === true) {
    const peakW = watts(record.published_peak_power_w);
    const assumed = [
      peakW ? `${PEAK_TO_CONTINUOUS_FACTOR * 100}% of the published ${peakW} peak power rating as continuous-equivalent power` : null,
      "No continuous power rating, recommended amplifier maximum or maximum SPL is published",
    ].filter(Boolean).join(". ");
    return {
      label: adequacy.label,
      tone: adequacy.tone,
      why: "The manufacturer does not publish a continuous power rating, recommended amplifier maximum or maximum SPL. Sound Proof has used a provisional estimate to produce a comparison figure.",
      calculated: null,
      assumed,
      dontKnow: "A continuous power rating, recommended amplifier maximum and maximum SPL are all unavailable, so the result depends on a substantial assumption.",
    };
  }

  const authority = record.max_spl_authority_type;

  // FULL: manufacturer publishes an explicit continuous max SPL.
  // But a passive speaker (with a power handling rating) that lacks sensitivity
  // cannot support an amplifier-dependent P12/P13 prediction — the published
  // max SPL is a ceiling, not a prediction at the selected amplifier power.
  if (authority === "published_continuous") {
    const spl = db(record.halfspace_published_max_continuous_spl_db_1m);
    if (adequacy.key === DATA_ADEQUACY.INCOMPLETE.key) {
      return {
        label: adequacy.label,
        tone: adequacy.tone,
        why: "The manufacturer publishes maximum SPL, but not the sensitivity needed to estimate output at different amplifier powers. Sound Proof cannot reliably predict P12/P13 performance at the selected amplifier setting.",
        calculated: null,
        assumed: null,
        dontKnow: spl
          ? `Published continuous maximum SPL (${spl}) is available as manufacturer information, but without sensitivity the amplifier-dependent output cannot be determined.`
          : "Without sensitivity, the amplifier-dependent output cannot be determined.",
      };
    }
    return {
      label: adequacy.label,
      tone: adequacy.tone,
      why: `The manufacturer publishes a continuous maximum SPL${spl ? ` (${spl})` : ""}, so Sound Proof can use it directly for RP22 capability on a data-quality basis comparable with Artcoustic.`,
      calculated: "No additional SPL estimate is required — the manufacturer's stated continuous capability is used directly.",
      assumed: null,
      dontKnow: null,
    };
  }

  // GOOD: peak / assumed-peak — the −6 dB allowance
  if (authority === "published_peak" || authority === "assumed_peak") {
    const peak = db(publishedPeakFigure(record));
    const estimated = db(record.halfspace_estimated_continuous_from_peak_spl_db_1m);
    return {
      label: adequacy.label,
      tone: adequacy.tone,
      why: "The manufacturer publishes a maximum SPL but does not confirm continuous output. Sound Proof applies the agreed peak-to-continuous allowance.",
      calculated: `Sound Proof uses the published ${peak || "maximum"} SPL with an assumed ${PEAK_TO_CONTINUOUS_ALLOWANCE_DB} dB peak-to-continuous allowance, giving an estimated continuous maximum of ${estimated || "—"}.`,
      assumed: null,
      dontKnow: "The manufacturer does not explicitly identify its maximum SPL as continuous, so the continuous figure is an assumption rather than a stated speaker capability.",
    };
  }

  // GOOD: no published max SPL, capability calculated from published inputs.
  // The manufacturer supplies sufficient sensitivity, impedance where
  // required, and power information to estimate maximum output. Sound Proof
  // calculates the capability — no −6 dB peak allowance applies because no
  // maximum SPL is published.
  const sens = db(record.sensitivity_value_db);
  const sensRef = String(record.sensitivity_reference || "").trim();
  const imp = ohms(record.sensitivity_impedance_used_ohm ?? record.rated_impedance_ohm);
  const power = watts(record.power_authority_w);
  const phrase = powerAuthorityPhrase(record);
  const article = phrase === "amplifier recommendation" ? "an" : "a";
  const calcSpl = db(record.halfspace_calculated_max_continuous_spl_db_1m);

  const inputParts = [
    sens ? `the published ${sens}${sensRef ? ` @ ${sensRef}` : ""} sensitivity` : null,
    imp ? `${imp} impedance` : null,
    power ? `${power} ${phrase}` : null,
  ].filter(Boolean);

  return {
    label: adequacy.label,
    tone: adequacy.tone,
    why: `The manufacturer provides sensitivity, impedance and ${power ? article + " " + phrase : "power data"}, allowing Sound Proof to estimate output capability for RP22.`,
    calculated: calcSpl
      ? `Approximately ${calcSpl} at 1 m from ${inputParts.join(", ") || "the published specifications"}.`
      : `Maximum output from ${inputParts.join(", ") || "the published specifications"}.`,
    assumed: null,
    dontKnow: "The manufacturer does not publish maximum SPL, so this is an estimate rather than a stated speaker capability.",
  };
}