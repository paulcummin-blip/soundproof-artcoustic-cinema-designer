// productCapabilityEnvelope.js
// Product-aware frequency-dependent capability envelope and P14/P18 authority.
//
// CORE MODEL:
// 1. The fixed house-curve shape (artcousticHouseCurveOffsetAt) is normalised to
//    the selected P14 target. This target is immutable throughout fitting.
// 2. A frequency-dependent maximum deliverable SPL curve is built from the
//    approved manufacturer data, subwoofer quantity, and the raw room response
//    (which already includes distance and boundary gain).
// 3. P14 = highest operating level at which the house curve fits within the
//    capability envelope, C-weighted power-summed.
// 4. P18 = lowest contiguous frequency at which the post-EQ response at the
//    P14 operating level remains within -3 dB of the target, confirmed against
//    the capability envelope.
// 5. Cuts consume zero product-output headroom. Boosts are limited by the
//    frequency-dependent available headroom.

import { getSystemSourceCapability, getCurrentSystemSourceOutput } from "@/components/utils/subwooferCapability";
import { artcousticHouseCurveOffsetAt } from "@/components/utils/artcousticHouseCurve";

const isFinite = (value) => Number.isFinite(Number(value));

// C-weighting attenuation (dB) at standard ISO 266 frequencies.
// In the bass region (20–120 Hz) the C-weighting reduces the effective level.
const C_WEIGHTING_DB = Object.freeze({
  20: -6.2, 25: -4.4, 31.5: -3.0, 40: -2.0, 50: -1.3, 63: -0.8,
  80: -0.5, 100: -0.3, 125: -0.2, 160: -0.1, 200: 0.0,
});

function cWeightingDb(frequency) {
  const freqs = Object.keys(C_WEIGHTING_DB).map(Number).sort((a, b) => a - b);
  if (frequency <= freqs[0]) return C_WEIGHTING_DB[freqs[0]];
  if (frequency >= freqs[freqs.length - 1]) return C_WEIGHTING_DB[freqs[freqs.length - 1]];
  for (let i = 0; i < freqs.length - 1; i++) {
    if (frequency >= freqs[i] && frequency <= freqs[i + 1]) {
      const ratio = (frequency - freqs[i]) / (freqs[i + 1] - freqs[i]);
      return C_WEIGHTING_DB[freqs[i]] + (C_WEIGHTING_DB[freqs[i + 1]] - C_WEIGHTING_DB[freqs[i]]) * ratio;
    }
  }
  return 0;
}

// ── Maximum deliverable SPL at the RSP ──
// The raw room response already includes distance attenuation and boundary gain.
// The system source capability (from manufacturer curves, power-summed for
// multiple subwoofers) gives the max SPL at 1 m at each frequency.
// The available headroom at each frequency is:
//   availableHeadroomDb(f) = systemCapabilityDb(f) - currentSystemSourceOutputDb
// The maximum deliverable SPL at the RSP is:
//   maximumDeliverableSplAtRspDb(f) = rawRoomResponseDb(f) + availableHeadroomDb(f)
export function buildMaximumDeliverableSplAtRspDb(rawRoomResponse, activeSubs, requestedSystemOutputDb) {
  const systemOutputDb = isFinite(requestedSystemOutputDb)
    ? Number(requestedSystemOutputDb)
    : getCurrentSystemSourceOutput(activeSubs);

  return (rawRoomResponse || [])
    .filter((point) => isFinite(point?.frequency) && isFinite(point?.spl))
    .map((point) => {
      const frequency = Number(point.frequency);
      const rawSplDb = Number(point.spl);
      const systemCapabilityDb = getSystemSourceCapability(activeSubs, frequency);
      if (!isFinite(systemCapabilityDb) || !isFinite(systemOutputDb)) return null;
      const availableHeadroomDb = systemCapabilityDb - systemOutputDb;
      const maximumDeliverableSplDb = rawSplDb + availableHeadroomDb;
      return {
        frequency,
        spl: maximumDeliverableSplDb,
        rawSplDb,
        systemCapabilityDb,
        availableHeadroomDb,
      };
    })
    .filter(Boolean);
}

// ── Available P14 capability ──
// Shift the fixed house-curve shape vertically. Find the highest operating
// level L at which the house curve does not exceed the product capability
// envelope across the assessed bass range. C-weighted power-sum the
// supported curve to obtain availableP14CapabilityDbC.
//
//   L + houseCurveOffset(f) <= maximumDeliverableSplAtRspDb(f)  for all f in [20, 120]
//
// The limiting frequency is where the house curve first touches the envelope.
export function calculateAvailableP14Capability(maximumDeliverableSpl, assessmentStartHz = 20, assessmentEndHz = 120) {
  const envelope = (maximumDeliverableSpl || [])
    .filter((point) => point.frequency >= assessmentStartHz && point.frequency <= assessmentEndHz);
  if (!envelope.length) return null;

  let limitingLevel = Infinity;
  let limitingFrequency = null;
  let limitingHeadroomDb = null;

  for (const point of envelope) {
    const offset = artcousticHouseCurveOffsetAt(point.frequency);
    const maxLevel = point.spl - offset;
    if (maxLevel < limitingLevel) {
      limitingLevel = maxLevel;
      limitingFrequency = point.frequency;
      limitingHeadroomDb = point.availableHeadroomDb;
    }
  }

  if (!isFinite(limitingLevel)) return null;

  // Build the supported house curve at the limiting level.
  const supportedCurve = envelope.map((point) => ({
    frequency: point.frequency,
    spl: limitingLevel + artcousticHouseCurveOffsetAt(point.frequency),
  }));

  // C-weighted power-sum: 10*log10(mean(10^((spl + cWeight)/10)))
  const cWeightedSum = supportedCurve.reduce((sum, point) => {
    const cWeight = cWeightingDb(point.frequency);
    return sum + Math.pow(10, (point.spl + cWeight) / 10);
  }, 0);
  const availableP14CapabilityDbC = 10 * Math.log10(cWeightedSum / supportedCurve.length);

  return {
    availableP14CapabilityDbC,
    limitingFrequencyHz: limitingFrequency,
    limitingLevelDb: limitingLevel,
    limitingHeadroomDb,
    supportedCurve,
    source: "product-aware-frequency-dependent-capability-envelope",
  };
}

// ── Product-aware P18 extension ──
// P18 is assessed at the selected P14 operating level. Starting from the upper
// bass range, move downward. Find the lowest contiguous frequency at which the
// achieved post-EQ response remains within the -3 dB extension rule relative to
// the fixed house target. Confirm that this frequency is achieved without
// exceeding the product capability envelope.
//
// A frequency does NOT qualify for P18 when:
// - It exists only at a lower operating volume.
// - It is below target because product headroom has run out.
// - It relies on EQ boost beyond the product envelope.
// - It relies only on the manufacturer's nominal LF cutoff.
// - It is a protected room null.
export function assessProductAwareP18Extension({
  postEqResponse,
  maximumDeliverableSpl,
  targetHouseCurve,
  protectedNullRegions = [],
  assessmentStartHz = 20,
  assessmentEndHz = 120,
  extensionToleranceDb = 3,
}) {
  const finite = (v) => Number.isFinite(Number(v));
  const interpolate = (curve, freq, key = "spl") => {
    const points = (curve || []).filter((p) => finite(p?.frequency) && finite(p?.[key])).sort((a, b) => a.frequency - b.frequency);
    if (!points.length || freq < points[0].frequency || freq > points[points.length - 1].frequency) return null;
    const upper = points.findIndex((p) => p.frequency >= freq);
    if (upper <= 0) return points[0][key];
    const low = points[upper - 1];
    const high = points[upper];
    const ratio = (freq - low.frequency) / (high.frequency - low.frequency);
    return low[key] + (high[key] - low[key]) * ratio;
  };

  const isProtected = (freq) => (protectedNullRegions || []).some((region) => freq >= region.startHz && freq <= region.endHz);

  // Build assessment points sorted from high to low (upper bass → downward).
  const assessmentPoints = (postEqResponse || [])
    .filter((p) => finite(p?.frequency) && finite(p?.spl) && p.frequency >= assessmentStartHz && p.frequency <= assessmentEndHz)
    .map((p) => ({ frequency: Number(p.frequency), postEqSpl: Number(p.spl) }))
    .sort((a, b) => b.frequency - a.frequency);

  if (!assessmentPoints.length) return null;

  // Walk downward from the upper bass. Find the lowest contiguous frequency
  // at which the post-EQ response remains within -3 dB of the target AND the
  // capability envelope supports it.
  let achievedExtensionHz = assessmentPoints[0].frequency;
  let failureFrequencyHz = null;
  let failureReason = null;

  for (const point of assessmentPoints) {
    const targetSpl = interpolate(targetHouseCurve, point.frequency);
    const capabilitySpl = interpolate(maximumDeliverableSpl, point.frequency);

    if (targetSpl == null) {
      failureFrequencyHz = point.frequency;
      failureReason = "No house target at this frequency";
      break;
    }

    // Check -3 dB extension rule: post-EQ must be within -3 dB of target.
    const deviationDb = point.postEqSpl - targetSpl;
    if (deviationDb < -extensionToleranceDb) {
      failureFrequencyHz = point.frequency;
      failureReason = `Post-EQ response ${deviationDb.toFixed(1)} dB below target (exceeds -${extensionToleranceDb} dB extension rule)`;
      break;
    }

    // Check capability envelope: post-EQ must not exceed the product capability.
    if (capabilitySpl != null && point.postEqSpl > capabilitySpl + 0.05) {
      failureFrequencyHz = point.frequency;
      failureReason = `Post-EQ response exceeds product capability envelope by ${(point.postEqSpl - capabilitySpl).toFixed(1)} dB`;
      break;
    }

    // Check protected null: a protected room null does not qualify.
    if (isProtected(point.frequency)) {
      failureFrequencyHz = point.frequency;
      failureReason = "Protected room null — frequency does not qualify for P18";
      break;
    }

    achievedExtensionHz = point.frequency;
  }

  return {
    achievedExtensionHz,
    failureFrequencyHz,
    failureReason,
    assessmentRangeHz: [assessmentStartHz, assessmentEndHz],
    extensionToleranceDb,
    source: "product-aware-p18-extension-at-p14-operating-level",
  };
}