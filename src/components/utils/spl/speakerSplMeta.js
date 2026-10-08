import { getSpeakerModelMeta } from "@/components/models/speakers/registry";

// Shared main-design SPL metadata adapter. Preserve registry values and surround cap inheritance.
export function resolveSpeakerSplMeta(model, resolvedGetMeta = getSpeakerModelMeta) {
  const meta = resolvedGetMeta(model);
  if (meta && !meta.notFound) {
    const modelKey = String(meta.key || model || "");
    const baseMeta = modelKey.endsWith("_s")
      ? resolvedGetMeta(modelKey.replace(/_s$/, ""))
      : null;
    const capSource = baseMeta && !baseMeta.notFound ? baseMeta : {};

    return {
      ...meta,
      sensitivity_db_1w_1m: meta.sensitivity_db_1w_1m || meta.sensitivity_dB_1w1m || meta.sensitivity_dB_1w1m || meta.sensitivity || 87,
      power_handling_w: meta.power_handling_w || meta.max_power || Infinity,
      max_spl_cont_db_1m_halfspace: meta.max_spl_cont_db_1m_halfspace ?? capSource.max_spl_cont_db_1m_halfspace ?? null,
      max_spl_cont_db_1m_anechoic: meta.max_spl_cont_db_1m_anechoic ?? capSource.max_spl_cont_db_1m_anechoic ?? null,
      max_spl_cont_db_1m: meta.max_spl_cont_db_1m ?? capSource.max_spl_cont_db_1m ?? null,
      max_spl: meta.max_spl ?? capSource.max_spl ?? null,
      peak_spl: meta.peak_spl ?? capSource.peak_spl ?? null,
      max_spl_peak_db_cf6_1m_halfspace: meta.max_spl_peak_db_cf6_1m_halfspace ?? capSource.max_spl_peak_db_cf6_1m_halfspace ?? null,
      max_spl_peak_db_cf6_1m_anechoic: meta.max_spl_peak_db_cf6_1m_anechoic ?? capSource.max_spl_peak_db_cf6_1m_anechoic ?? null,
    };
  }
  // NO PRODUCT DATA. The model does not resolve to an Artcoustic catalogue
  // product, so there is no honest sensitivity, power handling or SPL ceiling to
  // report. `notFound` states that plainly: consumers must expose the missing
  // model rather than fall back to a generic figure that would read as this
  // product's capability. Geometry placeholders are kept for the placement
  // callers that only need a footprint.
  return { widthM: 0.27, depthM: 0.082, notFound: true, model: String(model ?? "") };
}