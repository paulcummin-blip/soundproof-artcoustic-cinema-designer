import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Upload, ChevronDown, ChevronUp, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useActiveProjectId } from "@/components/state/project-session";
import { useRoomDimensions } from "@/components/hooks/useRoomDimensions";
import { useProductMaster } from "@/components/products/useProductMaster";
import { PRODUCT_ROLES } from "@/components/products/productMaster";
import { normaliseModelKey } from "@/components/models/speakers/registry";
import { computeSpeakerCapabilityAtDistance } from "@/components/utils/spl/centralSplEngine";
import { resolveP12P13DualLevels } from "@/components/report/technical/roomParameterLevelAuthority";
import { normalizeCompetitor, competitorMetaForComparison } from "@/components/utils/spl/competitorNormalization";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { resolveSpeakerSplMeta } from "@/components/utils/spl/speakerSplMeta";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin } from "@/lib/accountAccess";

const BRAND = {
  bg: "#F8F8F7",
  panel: "#FFFFFF",
  border: "#DCDBD6",
  text: "#1B1A1A",
  subtext: "#3E4349",
  hint: "#625143",
  soft: "#F1F0EE",
  accent: "#C1B6AD",
};

const LEVEL_RANK = { "—": 0, "N/A": 0, FAIL: 0, L1: 1, L2: 2, L3: 3, L4: 4 };

function isSubwooferEntry(s) {
  const cat = String(s?.type || s?.category || "").toLowerCase();
  const label = `${s?.brand || ""} ${s?.model || ""}`.toLowerCase();
  return cat.includes("sub") || /\bsub\b|\bsubwoofer\b/.test(label);
}

function numeric(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function gradeFromSpl(spl, basis) {
  if (!Number.isFinite(spl)) return { p12: "—", p13: "—" };
  // Main Sound Proof P12/P13 presentation grades the whole-dB design value.
  const p12 = resolveP12P13DualLevels(12, resolveRp22DesignValue(12, spl));
  const p13 = resolveP12P13DualLevels(13, resolveRp22DesignValue(13, spl));
  const key = basis === "recommended" ? "recommended" : "minimum";
  return {
    p12: p12?.[key] === "—" ? "FAIL" : p12?.[key] || "—",
    p13: p13?.[key] === "—" ? "FAIL" : p13?.[key] || "—",
  };
}

function Rp22Pill({ parameter, level }) {
  const normalized = /^L[1-4]$/.test(String(level))
    ? String(level)
    : level === "FAIL"
      ? "FAIL"
      : level === "N/A"
        ? "N/A"
        : null;
  const colorLevel = normalized?.startsWith("L") ? Number(normalized.slice(1)) : normalized;
  const colors = getLevelColors(colorLevel);
  return (
    <div
      style={{
        minWidth: 86,
        padding: "7px 12px",
        borderRadius: 8,
        border: `1px solid ${colors?.border || BRAND.border}`,
        background: colors?.bg || BRAND.soft,
        color: colors?.text || BRAND.text,
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
      }}
    >
      {parameter} · {normalized || "—"}
    </div>
  );
}

function formatPrice(value) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function resultRank(result) {
  return {
    p12: LEVEL_RANK[result?.grades?.p12] || 0,
    p13: LEVEL_RANK[result?.grades?.p13] || 0,
  };
}

function infoValue(value, suffix = "") {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.join(" – ") + suffix;
  if (typeof value === "number" && Number.isFinite(value)) return `${Number(value.toFixed(3))}${suffix}`;
  return `${value}${suffix}`;
}

function artcousticInfoRows(speaker, price) {
  if (!speaker) return [];
  const key = speaker.p12Key || speaker.p13Key || speaker.id;
  const meta = resolveSpeakerSplMeta(key);
  return [
    ["Manufacturer", "Artcoustic"],
    ["Model", speaker.model],
    ["Sound Proof role availability", [speaker.p12Key ? "Screen / P12" : null, speaker.p13Key ? "Non-screen / P13" : null].filter(Boolean).join(" · ")],
    ["Retail inc VAT", formatPrice(price)],
    ["Sensitivity 1 W / 1 m", infoValue(meta?.sensitivity_db_1w_1m, " dB")],
    ["Sensitivity 2.83 V / 1 m", infoValue(meta?.sensitivity_dB_2p83, " dB")],
    ["Nominal impedance", infoValue(meta?.nominalOhms, " Ω")],
    ["Continuous power", infoValue(meta?.power_handling_w ?? meta?.max_power, " W")],
    ["Continuous SPL @ 1 m · Half Space", infoValue(meta?.max_spl_cont_db_1m_halfspace ?? meta?.max_spl_cont_db_1m ?? meta?.max_spl, " dB")],
    ["Peak SPL @ 1 m · Half Space", infoValue(meta?.max_spl_peak_db_cf6_1m_halfspace ?? meta?.max_spl_peak_db_cf6_1m ?? meta?.peak_spl, " dB")],
    ["Continuous SPL @ 1 m · Anechoic", infoValue(meta?.max_spl_cont_db_1m_anechoic, " dB")],
    ["Peak SPL @ 1 m · Anechoic", infoValue(meta?.max_spl_peak_db_cf6_1m_anechoic, " dB")],
    ["Usable LF response (-6 dB)", infoValue(meta?.usable_lf_hz_minus6db, " Hz")],
    ["Measurement basis", "Artcoustic published Half Space authority"],
    ["Source", "Canonical Sound Proof speaker registry"],
  ];
}

function competitorInfoRows(record) {
  if (!record) return [];
  return [
    ["Manufacturer", record.manufacturer],
    ["Model", record.model],
    ["Product type", record.product_type],
    ["Retail inc VAT", formatPrice(numeric(record.retail_price_inc_vat))],
    ["Published sensitivity", infoValue(record.sensitivity_value_db, " dB")],
    ["Sensitivity reference", record.sensitivity_reference || "—"],
    ["Sensitivity measurement basis", record.sensitivity_measurement_basis || "Unstated → assumed Half Space"],
    ["Rated impedance", infoValue(record.rated_impedance_ohm, " Ω")],
    ["Minimum impedance", infoValue(record.minimum_impedance_ohm, " Ω")],
    ["Continuous / RMS / AES power", infoValue(record.continuous_power_w, " W")],
    ["Power rating type / standard", record.power_rating_type || "—"],
    ["Program power", infoValue(record.program_power_w, " W")],
    ["Peak power", infoValue(record.peak_power_w, " W")],
    ["Published max continuous SPL @ 1 m", infoValue(record.published_max_continuous_spl_db_1m, " dB")],
    ["Published max peak SPL @ 1 m", infoValue(record.published_max_peak_spl_db_1m, " dB")],
    ["Max SPL measurement basis", record.max_spl_measurement_basis || "Unstated → assumed Half Space"],
    ["Normalised sensitivity 1 W / 1 m", infoValue(record.normalized_sensitivity_db_1w_1m, " dB")],
    ["Half-space sensitivity 1 W / 1 m", infoValue(record.halfspace_sensitivity_db_1w_1m, " dB")],
    ["Half-space max continuous SPL @ 1 m", infoValue(record.halfspace_published_max_continuous_spl_db_1m ?? record.halfspace_calculated_max_continuous_spl_db_1m, " dB")],
    ["Sensitivity basis provenance", record.sensitivity_space_provenance || "—"],
    ["Max SPL basis provenance", record.max_spl_space_provenance || "—"],
    ["Frequency range", record.frequency_range || "—"],
    ["Usable LF response (-6 dB)", infoValue(record.usable_lf_minus6db_hz, " Hz")],
    ["Horizontal coverage", infoValue(record.horizontal_coverage_deg, "°")],
    ["Vertical coverage", infoValue(record.vertical_coverage_deg, "°")],
    ["Recommended amplifier power", infoValue(record.recommended_amplifier_power_w, " W")],
    ["SPL authority", record.spl_authority || "—"],
    ["Data confidence", record.data_confidence || "—"],
    ["Date checked", record.date_checked || "—"],
    ["Notes", record.notes || "—"],
  ];
}

function SpeakerInfo({ rows, sourceUrl = null, datasheetUrl = null }) {
  const [open, setOpen] = useState(false);
  if (!Array.isArray(rows) || rows.length === 0) return <div />;
  return (
    <div
      style={{ position: "relative", display: "inline-flex", justifyContent: "center" }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="Show source speaker data"
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        style={{ width: 26, height: 26, borderRadius: 999, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.hint, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}
      >
        <Info size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", zIndex: 100, right: 0, top: 32, width: 390, maxHeight: 500, overflowY: "auto", background: "#FFF", border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.14)", color: BRAND.text }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Published / comparison data</div>
          <div style={{ display: "grid", gap: 0 }}>
            {rows.map(([label, value], idx) => (
              <div key={`${label}-${idx}`} style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 10, padding: "6px 0", borderTop: idx === 0 ? 0 : `1px solid ${BRAND.soft}`, fontSize: 11, lineHeight: 1.35 }}>
                <div style={{ color: BRAND.subtext }}>{label}</div>
                <div style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{value || "—"}</div>
              </div>
            ))}
          </div>
          {(sourceUrl || datasheetUrl) && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${BRAND.border}`, display: "flex", gap: 12, flexWrap: "wrap", fontSize: 11 }}>
              {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>Manufacturer source</a>}
              {datasheetUrl && <a href={datasheetUrl} target="_blank" rel="noreferrer" style={{ color: BRAND.hint, textDecoration: "underline" }}>Datasheet</a>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function loadSheetJs() {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-soundproof-xlsx="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.XLSX), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load Excel reader")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    script.async = true;
    script.dataset.soundproofXlsx = "true";
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => reject(new Error("Could not load Excel reader"));
    document.head.appendChild(script);
  });
}

function firstValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  }
  return null;
}

function normalizeImportedRow(row, index) {
  const manufacturer = String(firstValue(row, ["Manufacturer", "manufacturer", "Brand", "brand"]) || "").trim();
  const model = String(firstValue(row, ["Model", "model"]) || "").trim();
  const ratedImpedance = numeric(firstValue(row, ["Rated Impedance Ω", "Rated Impedance Ohm", "rated_impedance_ohm", "Nominal Impedance Ω"]));
  const sensitivityValue = numeric(firstValue(row, ["Sensitivity Value dB", "sensitivity_value_db", "Sensitivity (dB)"]));
  const sensitivityReference = String(firstValue(row, ["Sensitivity Reference", "sensitivity_reference", "Sensitivity Spec"]) || "").trim();
  const sensitivityImpedance = numeric(firstValue(row, ["Sensitivity Impedance Used Ω", "sensitivity_impedance_used_ohm"])) || ratedImpedance;
  const continuousPower = numeric(firstValue(row, ["Continuous / RMS / AES Power W", "Continuous Power W", "continuous_power_w", "Max Power (W)"]));
  const publishedContinuous = numeric(firstValue(row, ["Published Max Continuous SPL dB @1m", "published_max_continuous_spl_db_1m"]));

  const sensitivityBasis = String(firstValue(row, ["Sensitivity Measurement Basis", "sensitivity_measurement_basis", "Sensitivity Space Basis"]) ?? "").trim();
  const maxSplBasis = String(firstValue(row, ["Max SPL Measurement Basis", "max_spl_measurement_basis", "Max SPL Space Basis", "SPL Measurement Basis"]) ?? "").trim();
  const legacyMeasurementSpace = String(firstValue(row, ["Measurement Space Basis", "Measurement Basis", "Measurement Space", "Full Space / Half Space", "measurement_space_basis"]) ?? "").trim();
  const normalized = normalizeCompetitor({
      manufacturer,
      model,
      product_type: String(firstValue(row, ["Product Type", "product_type"]) || "").trim(),
      retail_price_inc_vat: numeric(firstValue(row, ["Retail Price inc VAT", "retail_price_inc_vat"])),
      currency: String(firstValue(row, ["Currency", "currency"]) || "GBP").trim() || "GBP",
      rated_impedance_ohm: ratedImpedance,
      minimum_impedance_ohm: numeric(firstValue(row, ["Minimum Impedance Ω", "minimum_impedance_ohm"])),
      sensitivity_value_db: sensitivityValue,
      sensitivity_reference: sensitivityReference,
      sensitivity_impedance_used_ohm: sensitivityImpedance,
      sensitivity_band_conditions: String(firstValue(row, ["Sensitivity Band / Conditions", "sensitivity_band_conditions"]) || "").trim(),
      continuous_power_w: continuousPower,
      power_rating_type: String(firstValue(row, ["Power Rating Type / Standard", "power_rating_type"]) || "").trim(),
      program_power_w: numeric(firstValue(row, ["Program Power W", "program_power_w"])),
      peak_power_w: numeric(firstValue(row, ["Peak Power W", "peak_power_w"])),
      published_max_continuous_spl_db_1m: publishedContinuous,
      published_max_peak_spl_db_1m: numeric(firstValue(row, ["Published Max Peak SPL dB @1m", "published_max_peak_spl_db_1m"])),
      max_spl_test_conditions: String(firstValue(row, ["Max SPL Test Standard / Conditions", "max_spl_test_conditions"]) || "").trim(),
      frequency_range: String(firstValue(row, ["Frequency Range", "frequency_range"]) || "").trim(),
      usable_lf_minus6db_hz: numeric(firstValue(row, ["Usable LF / -6 dB Point", "usable_lf_minus6db_hz"])),
      horizontal_coverage_deg: numeric(firstValue(row, ["Horizontal Coverage °", "horizontal_coverage_deg"])),
      vertical_coverage_deg: numeric(firstValue(row, ["Vertical Coverage °", "vertical_coverage_deg"])),
      recommended_amplifier_power_w: numeric(firstValue(row, ["Recommended Amplifier Power W", "recommended_amplifier_power_w"])),
      source_url: String(firstValue(row, ["Source URL", "source_url"]) || "").trim(),
      datasheet_url: String(firstValue(row, ["Datasheet URL", "datasheet_url"]) || "").trim(),
      date_checked: String(firstValue(row, ["Date Checked", "date_checked"]) || "").trim(),
      notes: String(firstValue(row, ["Notes", "notes"]) || "").trim(),
      measurement_space_basis: legacyMeasurementSpace,
      sensitivity_measurement_basis: sensitivityBasis,
      max_spl_measurement_basis: maxSplBasis,
      active: true,
  });
  return {
    rowNumber: index + 2,
    record: normalized,
    warnings: [
      !manufacturer ? "Missing manufacturer" : null,
      !model ? "Missing model" : null,
      ...normalized.normalization_warnings,
    ].filter(Boolean),
  };
}

function SpeakerRow({ eyebrow, name, price, result, accent = false, note = null, onRemove = null, infoRows = null, sourceUrl = null, datasheetUrl = null }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(260px, 1fr) 120px 92px 92px 64px",
        gap: 12,
        alignItems: "center",
        padding: "14px 16px",
        border: `1px solid ${accent ? BRAND.accent : BRAND.border}`,
        background: accent ? "#FCFBFA" : BRAND.panel,
        borderRadius: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND.hint, marginBottom: 2 }}>{eyebrow}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
        {note && <div style={{ marginTop: 3, fontSize: 12, color: BRAND.subtext }}>{note}</div>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.text, textAlign: "right" }}>{formatPrice(price)}</div>
      <Rp22Pill parameter="P12" level={result?.grades?.p12} />
      <Rp22Pill parameter="P13" level={result?.grades?.p13} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
        {infoRows && <SpeakerInfo rows={infoRows} sourceUrl={sourceUrl} datasheetUrl={datasheetUrl} />}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove comparison" style={{ border: 0, background: "transparent", cursor: "pointer", color: BRAND.hint, padding: 4 }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default function SPLCalculatorPage() {
  const activeId = useActiveProjectId();
  const { user } = useAuth();
  const canManageCompetitors = isMasterAdmin(user);
  const { dims, loadDims } = useRoomDimensions(activeId);
  const { priceMap, roleOptions } = useProductMaster(true);

  const [distance, setDistance] = useState("3.0");
  const [ampPower, setAmpPower] = useState("100");
  const [basis, setBasis] = useState("minimum");
  const [artId, setArtId] = useState("");
  const [competitorRows, setCompetitorRows] = useState([]);
  const [selectedCompetitorIds, setSelectedCompetitorIds] = useState([]);
  const [adminOpen, setAdminOpen] = useState(false);
  const [importPreview, setImportPreview] = useState([]);
  const [importFileName, setImportFileName] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [loadingCompetitors, setLoadingCompetitors] = useState(true);

  useEffect(() => {
    loadDims(activeId || null);
  }, [activeId, loadDims]);

  const loadCompetitors = useCallback(async () => {
    setLoadingCompetitors(true);
    try {
      const rows = await base44.entities.CompetitorSpeaker.list("manufacturer", 500);
      setCompetitorRows((rows || []).filter((r) => r.active !== false).map(normalizeCompetitor));
    } catch (error) {
      console.warn("[RP22 Speaker Capability] competitor data unavailable", error);
      setCompetitorRows([]);
    } finally {
      setLoadingCompetitors(false);
    }
  }, []);

  useEffect(() => { loadCompetitors(); }, [loadCompetitors]);

  const artcousticVisible = useMemo(() => {
    const merged = new Map();
    const add = (item, capability) => {
      if (!item) return;
      const labelKey = String(item.label || item.key || '').trim().toLowerCase();
      if (!labelKey) return;
      const existing = merged.get(labelKey) || {
        id: item.key,
        brand: 'Artcoustic',
        model: item.label,
        p12Key: null,
        p13Key: null,
        sourceMeta: item,
      };
      if (capability === 'p12' && !existing.p12Key) existing.p12Key = item.key;
      if (capability === 'p13' && !existing.p13Key) existing.p13Key = item.key;
      if (!existing.sourceMeta || capability === 'p12') existing.sourceMeta = item;
      merged.set(labelKey, existing);
    };
    [
      ...(roleOptions?.[PRODUCT_ROLES.LCR] || []),
      ...(roleOptions?.[PRODUCT_ROLES.CENTRE_SOUNDBAR] || []),
    ].forEach((item) => add(item, 'p12'));
    [
      ...(roleOptions?.[PRODUCT_ROLES.SURROUND] || []),
      ...(roleOptions?.[PRODUCT_ROLES.REAR_SURROUND] || []),
      ...(roleOptions?.[PRODUCT_ROLES.FRONT_WIDE] || []),
      ...(roleOptions?.[PRODUCT_ROLES.OVERHEAD] || []),
    ].forEach((item) => add(item, 'p13'));
    return Array.from(merged.values());
  }, [roleOptions]);

  useEffect(() => {
    if (!artId && artcousticVisible.length) setArtId(artcousticVisible[0].id);
  }, [artId, artcousticVisible]);

  const art = useMemo(() => artcousticVisible.find((s) => s.id === artId) || artcousticVisible[0] || null, [artId, artcousticVisible]);
  const d = numeric(distance);
  const p = numeric(ampPower);
  const roomVolumeM3 = Number.isFinite(Number(dims?.width_m)) && Number.isFinite(Number(dims?.length_m)) && Number.isFinite(Number(dims?.height_m))
    ? Number(dims.width_m) * Number(dims.length_m) * Number(dims.height_m)
    : null;

  const artPrice = useCallback((speaker) => {
    if (!speaker) return null;
    const preferredKey = speaker.p12Key || speaker.p13Key || normaliseModelKey(speaker.model || speaker.id);
    const baseKey = String(preferredKey || '').replace(/_s$/, '');
    const rec = priceMap?.get(preferredKey) || priceMap?.get(baseKey);
    return Number.isFinite(Number(rec?.price_ex_vat)) ? Number(rec.price_ex_vat) * 1.2 : null;
  }, [priceMap]);

  const calculateArtResult = useCallback((speaker) => {
    if (!speaker || !Number.isFinite(d) || !Number.isFinite(p)) return { spl: null, grades: { p12: "—", p13: "—" } };

    const runForKey = (modelKey) => {
      if (!modelKey) return null;
      return computeSpeakerCapabilityAtDistance({
        speakerModelId: modelKey,
        speakerMeta: resolveSpeakerSplMeta(modelKey),
        distance_m: d,
        powerW: p,
        roomVolumeM3,
      });
    };

    const p12Capability = runForKey(speaker.p12Key);
    const p13Capability = runForKey(speaker.p13Key);
    const p12Grade = speaker.p12Key
      ? gradeFromSpl(p12Capability?.spl, basis).p12
      : "N/A";
    const p13Grade = speaker.p13Key
      ? gradeFromSpl(p13Capability?.spl, basis).p13
      : "N/A";

    return {
      spl: p12Capability?.spl ?? p13Capability?.spl ?? null,
      p12Capability,
      p13Capability,
      grades: { p12: p12Grade, p13: p13Grade },
    };
  }, [d, p, roomVolumeM3, basis]);

  const artResult = useMemo(() => calculateArtResult(art), [art, calculateArtResult]);

  const competitorById = useMemo(() => new Map(competitorRows.map((r) => [r.id, r])), [competitorRows]);

  const competitorResultFor = useCallback((record) => {
    if (!record || !Number.isFinite(d) || !Number.isFinite(p)) return { spl: null, grades: { p12: "—", p13: "—" } };
    const speakerMeta = competitorMetaForComparison(record);
    if (!speakerMeta) return { spl: null, grades: { p12: "—", p13: "—" } };
    const capability = computeSpeakerCapabilityAtDistance({
      speakerModelId: `competitor:${record.id}`,
      distance_m: d,
      powerW: p,
      roomVolumeM3,
      speakerMeta,
    });
    return { ...capability, grades: gradeFromSpl(capability.spl, basis) };
  }, [d, p, roomVolumeM3, basis]);

  const selectedCompetitors = useMemo(
    () => selectedCompetitorIds.map((id) => competitorById.get(id)).filter(Boolean),
    [selectedCompetitorIds, competitorById],
  );

  const competitorResults = useMemo(
    () => selectedCompetitors.map((record) => ({ record, result: competitorResultFor(record) })),
    [selectedCompetitors, competitorResultFor],
  );

  const suggestedArt = useMemo(() => {
    if (!art || competitorResults.length === 0) return null;
    const artRank = resultRank(artResult);
    let req12 = artRank.p12;
    let req13 = artRank.p13;
    let needsSuggestion = false;
    for (const { result } of competitorResults) {
      const rank = resultRank(result);
      if (rank.p12 > artRank.p12 || rank.p13 > artRank.p13) needsSuggestion = true;
      req12 = Math.max(req12, rank.p12);
      req13 = Math.max(req13, rank.p13);
    }
    if (!needsSuggestion) return null;

    const candidates = artcousticVisible
      .map((speaker) => ({ speaker, result: calculateArtResult(speaker), price: artPrice(speaker) }))
      .filter(({ result }) => {
        const rank = resultRank(result);
        return rank.p12 >= req12 && rank.p13 >= req13;
      })
      .sort((a, b) => {
        const ap = Number.isFinite(a.price) ? a.price : Infinity;
        const bp = Number.isFinite(b.price) ? b.price : Infinity;
        return ap - bp;
      });
    const match = candidates[0] || null;
    if (!match || match.speaker.id === art.id) return null;
    return match;
  }, [art, artResult, competitorResults, artcousticVisible, calculateArtResult, artPrice]);

  const addCompetitor = () => {
    if (selectedCompetitorIds.length >= 5 || competitorRows.length === 0) return;
    setSelectedCompetitorIds((prev) => [...prev, ""]);
  };

  const updateSelectedCompetitor = (index, id) => {
    setSelectedCompetitorIds((prev) => {
      const next = prev.map((v, i) => i === index ? id : v);
      const hasBlankRow = next.some((v) => !v);
      const selectedCount = next.filter(Boolean).length;
      if (id && !hasBlankRow && selectedCount < 5) {
        next.push("");
      }
      return next;
    });
  };

  const handleImportFile = async (file) => {
    if (!file) return;
    setImportStatus("Reading spreadsheet…");
    setImportFileName(file.name);
    try {
      const XLSX = await loadSheetJs();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const normalized = rawRows.map(normalizeImportedRow).filter((r) => r.record.manufacturer || r.record.model);
      setImportPreview(normalized);
      const warningCount = normalized.reduce((sum, r) => sum + r.warnings.length, 0);
      setImportStatus(`${normalized.length} rows ready · ${warningCount} validation warning${warningCount === 1 ? "" : "s"}`);
    } catch (error) {
      setImportPreview([]);
      setImportStatus(error?.message || "Could not read spreadsheet");
    }
  };

  const applyImport = async () => {
    const validRows = importPreview.filter((r) => r.record.manufacturer && r.record.model);
    if (!validRows.length) return;
    setImportStatus("Applying import…");
    try {
      const existing = await base44.entities.CompetitorSpeaker.list("-created_date", 500);
      await Promise.all((existing || []).map((r) => base44.entities.CompetitorSpeaker.delete(r.id)));
      const batch = new Date().toISOString();
      for (const row of validRows) {
        await base44.entities.CompetitorSpeaker.create({ ...row.record, import_batch: batch });
      }
      setImportStatus(`Applied ${validRows.length} competitor speakers from ${importFileName}`);
      setImportPreview([]);
      setSelectedCompetitorIds([]);
      await loadCompetitors();
    } catch (error) {
      setImportStatus(error?.message || "Import failed");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.text, padding: 24, fontFamily: '"Didact Gothic", "Century Gothic", sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: "0.01em" }}>RP22 Speaker Capability</h1>
        </div>

        <div style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
            <label style={{ fontSize: 13, color: BRAND.subtext }}>
              Speaker to RSP distance
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input value={distance} onChange={(e) => setDistance(e.target.value)} inputMode="decimal" style={{ width: "100%", border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "10px 11px", fontSize: 15 }} />
                <span style={{ color: BRAND.hint }}>m</span>
              </div>
            </label>
            <label style={{ fontSize: 13, color: BRAND.subtext }}>
              Amplifier power available
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input value={ampPower} onChange={(e) => setAmpPower(e.target.value)} inputMode="numeric" style={{ width: "100%", border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "10px 11px", fontSize: 15 }} />
                <span style={{ color: BRAND.hint }}>W</span>
              </div>
            </label>
            <div>
              <div style={{ fontSize: 13, color: BRAND.subtext, marginBottom: 6 }}>RP22 target basis</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[
                  ["minimum", "Minimum"],
                  ["recommended", "Recommended"],
                ].map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setBasis(value)} style={{ flex: 1, padding: "10px 12px", borderRadius: 9, border: `1px solid ${basis === value ? BRAND.text : BRAND.border}`, background: basis === value ? BRAND.text : "#FFF", color: basis === value ? "#FFF" : BRAND.text, cursor: "pointer", fontSize: 13 }}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 120px 92px 92px 64px", gap: 12, alignItems: "end", padding: "0 16px 8px", fontSize: 11, color: BRAND.hint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            <div>Speaker</div><div style={{ textAlign: "right" }}>Retail inc VAT</div><div style={{ textAlign: "center" }}>P12</div><div style={{ textAlign: "center" }}>P13</div><div />
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ marginBottom: 7, display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 120px 92px 92px 64px", gap: 12, alignItems: "center" }}>
              <select value={art?.id || ""} onChange={(e) => setArtId(e.target.value)} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: "10px 12px", background: "#FFF", fontWeight: 700, color: BRAND.text }}>
                {artcousticVisible.map((s) => <option key={s.id} value={s.id}>Artcoustic · {s.model}</option>)}
              </select>
              <div style={{ fontWeight: 600, textAlign: "right", minWidth: 92 }}>{formatPrice(artPrice(art))}</div>
              <Rp22Pill parameter="P12" level={artResult?.grades?.p12} />
              <Rp22Pill parameter="P13" level={artResult?.grades?.p13} />
              <SpeakerInfo rows={artcousticInfoRows(art, artPrice(art))} />
            </div>
          </div>

          {suggestedArt && (
            <div style={{ marginBottom: 8 }}>
              <SpeakerRow
                eyebrow="Suggested Artcoustic equivalent"
                name={`Artcoustic · ${suggestedArt.speaker.model}`}
                price={suggestedArt.price}
                result={suggestedArt.result}
                accent
                note="Lowest-priced Artcoustic option that matches or exceeds the strongest selected comparison result."
                infoRows={artcousticInfoRows(suggestedArt.speaker, suggestedArt.price)}
              />
            </div>
          )}

          <div style={{ height: 1, background: BRAND.border, margin: "14px 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Other speakers</div>
              <div style={{ fontSize: 12, color: BRAND.subtext }}>Up to five speakers, all assessed at the same distance, power and RP22 basis.</div>
            </div>
            <button type="button" onClick={addCompetitor} disabled={selectedCompetitorIds.length >= 5 || competitorRows.length === 0} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, cursor: competitorRows.length ? "pointer" : "not-allowed", opacity: selectedCompetitorIds.length >= 5 || competitorRows.length === 0 ? 0.45 : 1 }}><Plus size={15} /> Add speaker</button>
          </div>

          {loadingCompetitors ? (
            <div style={{ padding: 18, color: BRAND.subtext }}>Loading comparison data…</div>
          ) : selectedCompetitorIds.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.border}`, borderRadius: 12, padding: 18, color: BRAND.subtext, fontSize: 13 }}>No comparison speakers selected. {competitorRows.length === 0 ? "Upload the competitor spreadsheet below to populate the comparison library." : "Choose Add speaker to begin."}</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {selectedCompetitorIds.map((id, index) => {
                const record = competitorById.get(id);
                const item = competitorResults.find((x) => x.record.id === id);
                return (
                  <div key={`${id}-${index}`}>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) 120px 92px 92px 64px", gap: 12, alignItems: "center", padding: "14px 16px", border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel }}>
                      <select value={id} onChange={(e) => updateSelectedCompetitor(index, e.target.value)} style={{ border: 0, background: "transparent", fontSize: 15, fontWeight: 700, color: id ? BRAND.text : BRAND.subtext, minWidth: 0 }}>
                        <option value="">Choose alternative speaker</option>
                        {competitorRows.map((r) => <option key={r.id} value={r.id}>{r.manufacturer} · {r.model}</option>)}
                      </select>
                      <div style={{ fontWeight: 600, textAlign: "right" }}>{record ? formatPrice(numeric(record?.retail_price_inc_vat)) : "—"}</div>
                      <Rp22Pill parameter="P12" level={item?.result?.grades?.p12} />
                      <Rp22Pill parameter="P13" level={item?.result?.grades?.p13} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        {record && <SpeakerInfo rows={competitorInfoRows(record)} sourceUrl={record.source_url} datasheetUrl={record.datasheet_url} />}
                        <button type="button" onClick={() => setSelectedCompetitorIds((prev) => prev.filter((_, i) => i !== index))} aria-label="Remove comparison" style={{ border: 0, background: "transparent", cursor: "pointer", color: BRAND.hint, padding: 4 }}><Trash2 size={16} /></button>
                      </div>
                    </div>
                    {record?.normalization_warnings?.length > 0 && (
                      <div style={{ padding: "5px 16px", fontSize: 12, color: BRAND.hint }}>
                        Speaker specification needs confirmation
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ marginTop: 14, background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: BRAND.text }}>RP22 reference</div>
            <div style={{ fontSize: 11, color: BRAND.hint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Reference only</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>
            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, background: "#FFF" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 5 }}>P12 · Screen speakers SPL capability at RSP</div>
              <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.45, marginBottom: 12 }}>
                Post calibration EQ, within assigned bandwidth, without clipping.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "90px repeat(4, 1fr)", border: `1px solid ${BRAND.border}`, borderRadius: 9, overflow: "hidden", fontSize: 12 }}>
                <div style={{ padding: "8px 9px", background: BRAND.soft, fontWeight: 700 }}>Target</div>
                {["L1", "L2", "L3", "L4"].map((level) => <div key={`p12h-${level}`} style={{ padding: "8px 9px", background: BRAND.soft, fontWeight: 700, textAlign: "center" }}>{level}</div>)}
                <div style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}` }}>Minimum</div>
                {[99, 102, 105, 108].map((value) => <div key={`p12m-${value}`} style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}`, textAlign: "center", fontWeight: 600 }}>{value}</div>)}
                <div style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}` }}>Recommended</div>
                {[102, 105, 108, 111].map((value) => <div key={`p12r-${value}`} style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}`, textAlign: "center", fontWeight: 600 }}>{value}</div>)}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: BRAND.hint }}>Unit: dB SPL (C) · Room parameter</div>
            </div>

            <div style={{ border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: 16, background: "#FFF" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: BRAND.text, marginBottom: 5 }}>P13 · Non-screen speakers SPL capability at RSP</div>
              <div style={{ fontSize: 12, color: BRAND.subtext, lineHeight: 1.45, marginBottom: 12 }}>
                Post calibration EQ within assigned bandwidth, without clipping, including amplifier headroom.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "90px repeat(4, 1fr)", border: `1px solid ${BRAND.border}`, borderRadius: 9, overflow: "hidden", fontSize: 12 }}>
                <div style={{ padding: "8px 9px", background: BRAND.soft, fontWeight: 700 }}>Target</div>
                {["L1", "L2", "L3", "L4"].map((level) => <div key={`p13h-${level}`} style={{ padding: "8px 9px", background: BRAND.soft, fontWeight: 700, textAlign: "center" }}>{level}</div>)}
                <div style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}` }}>Minimum</div>
                {[96, 99, 102, 105].map((value) => <div key={`p13m-${value}`} style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}`, textAlign: "center", fontWeight: 600 }}>{value}</div>)}
                <div style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}` }}>Recommended</div>
                {[99, 102, 105, 108].map((value) => <div key={`p13r-${value}`} style={{ padding: "8px 9px", borderTop: `1px solid ${BRAND.border}`, textAlign: "center", fontWeight: 600 }}>{value}</div>)}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: BRAND.hint }}>Unit: dB SPL (C) · Room parameter</div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 11, color: BRAND.subtext, lineHeight: 1.5 }}>
            Sound Pressure Level at the Reference Seating Position is the recommended minimum long-term SPL according to AES75-2022 or ANSI-CTA-2034-A, Section 8. Additional speaker SPL capability should be considered at bass frequencies for bass contours and for positive EQ.
          </div>
        </div>

        {canManageCompetitors && (
        <div style={{ marginTop: 14, background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14 }}>
          <button type="button" onClick={() => setAdminOpen((v) => !v)} style={{ width: "100%", border: 0, background: "transparent", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", color: BRAND.text }}>
            <span style={{ fontWeight: 700 }}>Admin · Competitor speaker data</span>
            {adminOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
          </button>
          {adminOpen && (
            <div style={{ borderTop: `1px solid ${BRAND.border}`, padding: 18 }}>
              <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <label style={{ display: "inline-flex", alignItems: "center", gap: 8, border: `1px solid ${BRAND.border}`, borderRadius: 9, padding: "9px 12px", cursor: "pointer", background: "#FFF", fontSize: 13 }}>
                  <Upload size={15} /> Upload Excel / CSV
                  <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleImportFile(e.target.files?.[0])} style={{ display: "none" }} />
                </label>
                {importPreview.length > 0 && <button type="button" onClick={applyImport} style={{ border: 0, borderRadius: 9, padding: "10px 14px", background: BRAND.text, color: "#FFF", cursor: "pointer", fontSize: 13 }}>Apply import</button>}
                <span style={{ color: BRAND.subtext, fontSize: 12 }}>{importStatus}</span>
              </div>

              {importPreview.length > 0 && (
                <div style={{ marginTop: 14, maxHeight: 280, overflow: "auto", border: `1px solid ${BRAND.border}`, borderRadius: 10 }}>
                  {importPreview.map((row) => (
                    <div key={row.rowNumber} style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr 1fr", gap: 8, padding: "9px 11px", borderBottom: `1px solid ${BRAND.soft}`, fontSize: 12 }}>
                      <div style={{ color: BRAND.hint }}>Row {row.rowNumber}</div>
                      <div>{row.record.manufacturer || "—"}</div>
                      <div>{row.record.model || "—"}</div>
                      <div style={{ color: row.warnings.length ? "#7A1E19" : BRAND.subtext }}>{row.warnings.length ? row.warnings.join(" · ") : row.record.spl_authority}</div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 12, color: BRAND.hint }}>The spreadsheet remains the source of truth. Applying an import replaces the current competitor library after preview. Raw published values are retained alongside normalized 1 W / 1 m fields.</div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}