import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useActiveProjectId } from "@/components/state/project-session";
import { useRoomDimensions } from "@/components/hooks/useRoomDimensions";
import { useProductMaster } from "@/components/products/useProductMaster";
import { PRODUCT_ROLES } from "@/components/products/productMaster";
import { getModelsByCategoryOrdered, normaliseModelKey } from "@/components/models/speakers/registry";
import { computeSpeakerCapabilityAtDistance } from "@/components/utils/spl/centralSplEngine";
import { resolveP12P13DualLevels } from "@/components/report/technical/roomParameterLevelAuthority";
import { competitorMetaForComparison } from "@/components/utils/spl/competitorNormalization";
import { getLevelColors } from "@/components/utils/rp22Colors";
import { resolveSpeakerSplMeta } from "@/components/utils/spl/speakerSplMeta";
import { resolveRp22DesignValue } from "@/components/utils/rp22/resolveRp22DesignValue";
import { useAuth } from "@/lib/AuthContext";
import { isMasterAdmin } from "@/lib/accountAccess";
import { shouldShowDataWarning, shouldShowOpenBackWarning } from "@/components/spl/ComparisonWarnings";
import SpeakerInfo from "@/components/spl/SpeakerInfo";
import ComparisonDataStatusSection from "@/components/spl/ComparisonDataStatusSection";
import CompetitorPriceManager from "@/components/spl/CompetitorPriceManager";

import { loadComparisonCandidates } from "@/components/utils/spl/speakerDbComparisonCandidates";

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

const ROW_GRID = "minmax(200px, 260px) 48px 140px 110px 110px 72px";

function DataNote({ record }) {
  if (!record) return null;
  const showData = shouldShowDataWarning(record);
  const showOpenBack = shouldShowOpenBackWarning(record);
  if (!showData && !showOpenBack) return null;
  return (
    <div style={{ gridColumn: "4 / 6", fontSize: 11, color: "#7A5C00", lineHeight: 1.4, paddingTop: 2 }}>
      {showData && <div>Capability calculated from published data — the source panel shows the power authority behind it.</div>}
      {showOpenBack && <div>Open-back design — subject to inconsistent installed results.</div>}
    </div>
  );
}

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

function Rp22Pill({ parameter, level, subLabel = null }) {
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
      {subLabel && (
        <div style={{ fontSize: 9, fontWeight: 600, marginTop: 3, opacity: 0.85 }}>{subLabel}</div>
      )}
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

function buildArtcousticWarningRecord(speaker) {
  if (!speaker) return null;
  const meta = resolveSpeakerSplMeta(speaker.p12Key || speaker.p13Key || speaker.id);
  return {
    product_type: null,
    open_back: null,
    spl_authority: meta?.max_spl_cont_db_1m_halfspace != null ? "Published continuous SPL" : "Calculated from sensitivity + power",
    data_confidence: meta?.max_spl_cont_db_1m_halfspace != null ? "High" : "Medium",
    p12_p13_eligible: true,
  };
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

// What each column's comparison actually rests on. An Artcoustic row is
// published measured capability; a competitor row is calculated from published
// specifications; a C row is an ADI estimate from partial manufacturer data and
// is never presented as the same evidence as a published measurement.
function evidenceStanding(record) {
  if (!record) return "—";
  // An admin-approved secondary document is an estimate whatever class the values
  // would otherwise reach — it is never published measured capability.
  if (record.evidence_source === "secondary" || record.secondary_evidence) {
    return "ADI estimate from an admin-approved secondary manufacturer document";
  }
  if (record.p12_p13_eligible !== true) return "Insufficient published data";
  // The standing states where the graded SPL figure came from — manufacturer
  // measured, manufacturer calculated, a manufacturer figure whose basis is not
  // stated, or a Sound Proof estimate. A calculated figure never reads as
  // published measured capability.
  return record.spl_evidence_statement || record.spl_evidence_label || "—";
}

// The C-class comparison statement is defined once, alongside the confidence
// classes, in speakerDbComparisonCandidates (ADI_ESTIMATE_STATEMENT).

function artcousticInfoRows(speaker, price, result = null) {
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
    ["Evidence standing", "Published measured capability (Artcoustic registry)"],
    ["Calculated SPL at RSP", infoValue(result?.designSpl ?? result?.rawSpl, " dB")],
    ["Graded from", "Calculated SPL at RSP, whole dB"],
    ["Source", "Canonical Sound Proof speaker registry"],
  ];
}

function SpeakerRow({ eyebrow, name, price, result, accent = false, note = null, dataNoteRecord = null, onRemove = null, infoRows = null, sourceUrl = null, datasheetUrl = null }) {
  const showDataNote = dataNoteRecord && (shouldShowDataWarning(dataNoteRecord) || shouldShowOpenBackWarning(dataNoteRecord));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: ROW_GRID,
        gridTemplateRows: showDataNote ? "auto auto" : "auto",
        gap: "8px 12px",
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
      <div />
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
      {showDataNote && <DataNote record={dataNoteRecord} />}
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
  const [loadingCompetitors, setLoadingCompetitors] = useState(true);

  useEffect(() => {
    loadDims(activeId || null);
  }, [activeId, loadDims]);

  const loadCompetitors = useCallback(async () => {
    setLoadingCompetitors(true);
    try {
      // Excel imports and database records share one candidate and grading path.
      const candidates = await loadComparisonCandidates({ includeUnpublished: canManageCompetitors });
      setCompetitorRows(candidates);
      setSelectedCompetitorIds((prev) => prev.filter((id) => candidates.some((c) => c.id === id)));
    } catch (error) {
      console.warn("[RP22 Speaker Capability] comparison candidates unavailable", error);
      setCompetitorRows([]);
    } finally {
      setLoadingCompetitors(false);
    }
  }, [canManageCompetitors]);

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

    // P12: exact same LCR selector authority as the Room Designer.
    const canonicalSelectors = getModelsByCategoryOrdered() || {};
    (canonicalSelectors.LCR || []).forEach((item) => add(item, 'p12'));

    // P13: exact same live Product Master role options as Surrounds and Overheads.
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
    return rec?.price_ex_vat != null && Number.isFinite(Number(rec.price_ex_vat))
      ? Number(rec.price_ex_vat) * 1.2
      : null;
  }, [priceMap]);

  const calculateArtResult = useCallback((speaker) => {
    if (!speaker || !Number.isFinite(d) || !Number.isFinite(p)) {
      return { spl: null, rawSpl: null, designSpl: null, grades: { p12: "—", p13: "—" } };
    }

    const runForKey = (modelKey) => {
      if (!modelKey) return null;
      // RP22 Comparison applies no automatic EQ headroom deduction, so the
      // Artcoustic row and every competitor row are graded from the calculated
      // capability at the RSP in the same units.
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

    const designSpl = p12Capability?.spl ?? p13Capability?.spl ?? null;

    return {
      spl: designSpl,
      designSpl,
      rawSpl: designSpl,
      p12Capability,
      p13Capability,
      grades: { p12: p12Grade, p13: p13Grade },
    };
  }, [d, p, roomVolumeM3, basis]);

  const artResult = useMemo(() => calculateArtResult(art), [art, calculateArtResult]);

  const artWarningRecord = buildArtcousticWarningRecord(art);
  const artShowDataNote = artWarningRecord && (shouldShowDataWarning(artWarningRecord) || shouldShowOpenBackWarning(artWarningRecord));

  const candidateById = useMemo(() => new Map(competitorRows.map((c) => [c.id, c])), [competitorRows]);

  const competitorResultFor = useCallback((record) => {
    if (!record || !Number.isFinite(d) || !Number.isFinite(p)) {
      return { spl: null, rawSpl: null, designSpl: null, grades: { p12: "—", p13: "—" } };
    }
    const speakerMeta = competitorMetaForComparison(record);
    if (!speakerMeta) return { spl: null, rawSpl: null, designSpl: null, grades: { p12: "—", p13: "—" } };
    // Competitors are graded from the calculated capability at the RSP, exactly
    // as the Artcoustic rows are. RP22 Comparison applies no automatic EQ
    // headroom deduction to either side.
    const capability = computeSpeakerCapabilityAtDistance({
      speakerModelId: `competitor:${record.id}`,
      distance_m: d,
      powerW: p,
      roomVolumeM3,
      speakerMeta,
    });
    return {
      ...capability,
      rawSpl: capability.spl,
      designSpl: capability.spl,
      grades: gradeFromSpl(capability.spl, basis),
    };
  }, [d, p, roomVolumeM3, basis]);

  const selectedCompetitors = useMemo(
    () => selectedCompetitorIds.map((id) => candidateById.get(id)?.record).filter(Boolean),
    [selectedCompetitorIds, candidateById],
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

  // A price saved in Manage Prices shows in the comparison above immediately,
  // without reloading the candidate set or disturbing the selection.
  const handlePriceSaved = useCallback((recordId, price) => {
    setCompetitorRows((rows) => rows.map((row) => (
      row.id === recordId || row.record?.id === recordId
        ? { ...row, record: { ...row.record, retail_price_inc_vat: price } }
        : row
    )));
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: BRAND.bg, color: BRAND.text, padding: 24, fontFamily: '"Didact Gothic", "Century Gothic", sans-serif' }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0, letterSpacing: "0.01em" }}>RP22 Speaker Capability</h1>
        </div>

        <div style={{ background: BRAND.panel, border: `1px solid ${BRAND.border}`, borderRadius: 14, padding: 18, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px 220px 280px", justifyContent: "start", gap: 14 }}>
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
          <div style={{ display: "grid", gridTemplateColumns: ROW_GRID, gap: "8px 12px", alignItems: "end", padding: "0 16px 8px", fontSize: 11, color: BRAND.hint, textTransform: "uppercase", letterSpacing: "0.07em" }}>
            <div>Speaker</div><div /><div style={{ textAlign: "right" }}>Retail inc VAT</div><div style={{ textAlign: "center" }}><div style={{ fontWeight: 700, color: BRAND.subtext }}>LCR SPL</div><div style={{ fontSize: 9, color: BRAND.hint, marginTop: 1, letterSpacing: 0 }}>P12</div></div><div style={{ textAlign: "center" }}><div style={{ fontWeight: 700, color: BRAND.subtext }}>Surround SPL</div><div style={{ fontSize: 9, color: BRAND.hint, marginTop: 1, letterSpacing: 0 }}>P13</div></div><div />
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: ROW_GRID, gridTemplateRows: artShowDataNote ? "auto auto" : "auto", gap: "8px 12px", alignItems: "center", padding: "14px 16px", border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel }}>
              <select value={art?.id || ""} onChange={(e) => setArtId(e.target.value)} style={{ border: `1px solid ${BRAND.border}`, borderRadius: 10, padding: "10px 12px", background: "#FFF", fontWeight: 700, color: BRAND.text }}>
                {artcousticVisible.map((s) => <option key={s.id} value={s.id}>Artcoustic · {s.model}</option>)}
              </select>
              <div />
              <div style={{ fontWeight: 600, textAlign: "right" }}>{formatPrice(artPrice(art))}</div>
              <Rp22Pill parameter="P12" level={artResult?.grades?.p12} />
              <Rp22Pill parameter="P13" level={artResult?.grades?.p13} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                <SpeakerInfo rows={artcousticInfoRows(art, artPrice(art), artResult)} />
              </div>
              {artShowDataNote && <DataNote record={artWarningRecord} />}
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
                dataNoteRecord={buildArtcousticWarningRecord(suggestedArt?.speaker)}
                infoRows={artcousticInfoRows(suggestedArt.speaker, suggestedArt.price, suggestedArt.result)}
              />
            </div>
          )}

          <div style={{ height: 1, background: BRAND.border, margin: "14px 0" }} />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Other speakers</div>
              <div style={{ fontSize: 12, color: BRAND.subtext }}>All speakers, including Artcoustic, are compared using the same conditions and RP22 grading method.</div>
            </div>
            <button type="button" onClick={addCompetitor} disabled={selectedCompetitorIds.length >= 5 || competitorRows.length === 0} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: 9, border: `1px solid ${BRAND.border}`, background: "#FFF", color: BRAND.text, cursor: competitorRows.length ? "pointer" : "not-allowed", opacity: selectedCompetitorIds.length >= 5 || competitorRows.length === 0 ? 0.45 : 1 }}><Plus size={15} /> Add speaker</button>
          </div>

          {loadingCompetitors ? (
            <div style={{ padding: 18, color: BRAND.subtext }}>Loading comparison data…</div>
          ) : selectedCompetitorIds.length === 0 ? (
            <div style={{ border: `1px dashed ${BRAND.border}`, borderRadius: 12, padding: 18, color: BRAND.subtext, fontSize: 13 }}>No comparison speakers selected. {competitorRows.length === 0 ? "No comparison speaker is available yet — add the model in the Speaker Database." : "Choose Add speaker to begin."}</div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {selectedCompetitorIds.map((id, index) => {
                const candidate = candidateById.get(id);
                const record = candidate?.record;
                const item = competitorResults.find((x) => x.record.id === id);
                const compShowDataNote = record && shouldShowOpenBackWarning(record);
                return (
                  <div key={`${id}-${index}`}>
                    <div style={{ display: "grid", gridTemplateColumns: ROW_GRID, gridTemplateRows: compShowDataNote ? "auto auto" : "auto", gap: "8px 12px", alignItems: "center", padding: "14px 16px", border: `1px solid ${BRAND.border}`, borderRadius: 12, background: BRAND.panel }}>
                      <div style={{ minWidth: 0 }}>
                        <select value={id} onChange={(e) => updateSelectedCompetitor(index, e.target.value)} style={{ width: "100%", border: 0, background: "transparent", fontSize: 15, fontWeight: 700, color: id ? BRAND.text : BRAND.subtext, minWidth: 0 }}>
                          <option value="">Choose alternative speaker</option>
                          {competitorRows.map((c) => <option key={c.id} value={c.id}>{c.optionLabel}</option>)}
                        </select>
                        {candidate && (
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                            <span title="Open source data for the figures and assumptions used" style={{ fontSize: 11, fontWeight: 700, color: candidate.adequacy?.tone || "#9A6E00" }}>{candidate.badgeLabel}</span>
                          </div>
                        )}
                      </div>
                      <div />
                      <div style={{ fontWeight: 600, textAlign: "right" }}>{record ? formatPrice(numeric(record?.retail_price_inc_vat)) : "—"}</div>
                      <Rp22Pill parameter="P12" level={item?.result?.grades?.p12} subLabel={candidate?.pillLabel} />
                      <Rp22Pill parameter="P13" level={item?.result?.grades?.p13} subLabel={candidate?.pillLabel} />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
                        {record && (
                          <SpeakerInfo
                            dataQuality={
                              <ComparisonDataStatusSection
                                record={record}
                                candidate={candidate}
                                price={formatPrice(numeric(record?.retail_price_inc_vat))}
                                sourceUrl={candidate?.sourceUrl || record.source_url}
                                datasheetUrl={candidate?.datasheetUrl || record.datasheet_url}
                              />
                            }
                          />
                        )}
                        <button type="button" onClick={() => setSelectedCompetitorIds((prev) => prev.filter((_, i) => i !== index))} aria-label="Remove comparison" style={{ border: 0, background: "transparent", cursor: "pointer", color: BRAND.hint, padding: 4 }}><Trash2 size={16} /></button>
                      </div>
                      {compShowDataNote && <div style={{ gridColumn: "4 / 6", fontSize: 11, color: "#7A5C00" }}>Open-back design — installed results vary.</div>}
                    </div>
                    {candidate?.classKey === "D" && (
                      <div style={{ padding: "5px 16px", fontSize: 12, color: BRAND.hint }}>
                        Missing essential specifications — see source data.
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

        {canManageCompetitors && <CompetitorPriceManager onPriceSaved={handlePriceSaved} />}
      </div>
    </div>
  );
}