// commercialPriceBreakdown.js
// ---------------------------
// The PURE core of the commercial pricing engine, extracted verbatim from
// usePriceCalculation so a non-React consumer (per-version reporting) can price
// a design with the same engine that the Room Designer and reports use.
//
// NOTHING here is new pricing: the calculation, the VAT basis, the difficulty
// multiplier, the CPH-1000D subwoofer amplifier line and the Abfuser (500027)
// line are the same code that has always produced the priced schedule. Only the
// React wrapper (auth + territory + price master loading) stays in the hook.
//
// Pure: no React, no side effects, no entity access.

import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";
import { canonicalProductId } from "@/components/utils/modelKeyNormaliser";

const VAT_RATE = 0.2;

function displayAmount(exVatAmount, priceMode) {
  const safe = Number(exVatAmount) || 0;
  return priceMode === 'incVat' ? safe * (1 + VAT_RATE) : safe;
}

function getModelLabel(modelKey) {
  const key = normaliseModelKey(modelKey);
  if (key === 'cph-1000d') return 'CPH-1000D';

  const meta = getSpeakerModelMeta(modelKey);
  return meta?.notFound ? String(modelKey) : (meta?.label || String(modelKey));
}

export function getCommercialPrice(modelKey, soundbarSelections = {}, priceMap = null, soundbarOptions = null) {
  // Pricing is keyed on product identity, never on role. Canonicalising here
  // means a surround placed from a legacy "_s" id still resolves to its real
  // product, instead of falling through to an inactive legacy alias and
  // producing no price line.
  const key = canonicalProductId(modelKey);
  const options = (soundbarOptions || {})[key];

  if (options) {
    const selectedValue = soundbarSelections[key] || options[0]?.value;
    const selectedOption = options.find((option) => option.value === selectedValue) || options[0];
    const priceExVat = selectedOption?.priceExVat;
    const hasPrice = priceExVat !== null && priceExVat !== undefined;
    return {
      key,
      priceExVat: hasPrice ? Number(priceExVat) : null,
      sizeLabel: selectedOption?.label || '',
      sizeValue: selectedOption?.value || '',
      isSoundbar: true,
      note: selectedOption && hasPrice ? '' : 'price not set',
    };
  }

  if (priceMap && priceMap.has(key)) {
    const rec = priceMap.get(key);
    if (rec.active === false) {
      return { key, priceExVat: null, sizeLabel: '', sizeValue: '', isSoundbar: false, note: 'inactive' };
    }
    const priceExVat = rec.price_ex_vat;
    const hasPrice = priceExVat !== null && priceExVat !== undefined;
    return {
      key,
      priceExVat: hasPrice ? Number(priceExVat) : null,
      sizeLabel: '',
      sizeValue: '',
      isSoundbar: false,
      note: hasPrice ? '' : 'price not set',
    };
  }

  return { key, priceExVat: null, sizeLabel: '', sizeValue: '', isSoundbar: false, note: 'price not set' };
}

const ABFUSER_LABEL = "Artcoustic Abfuser, Black";

function addAbfuserLine(linesByKey, qty, priceMap) {
  if (!qty || qty <= 0) return;
  const rec = priceMap?.get("500027");
  const priceExVat = rec && rec.price_ex_vat !== null && rec.price_ex_vat !== undefined ? Number(rec.price_ex_vat) : null;
  const hasPrice = priceExVat !== null;
  const existing = linesByKey.get("500027");
  if (existing) {
    existing.count = qty;
    existing.qty = qty;
    existing.subtotalExVat = hasPrice ? priceExVat * qty : null;
    existing.subtotal = existing.subtotalExVat;
    existing.price = priceExVat;
    existing.unitPriceExVat = priceExVat;
    existing.note = hasPrice ? "" : "price not set";
    return;
  }
  linesByKey.set("500027", {
    model: "500027",
    description: ABFUSER_LABEL,
    price: priceExVat,
    unitPriceExVat: priceExVat,
    count: qty,
    qty,
    subtotal: hasPrice ? priceExVat * qty : null,
    subtotalExVat: hasPrice ? priceExVat * qty : null,
    rolesList: ["Acoustic treatment"],
    note: hasPrice ? "" : "price not set",
    isSoundbar: false,
    sizeValue: "",
    sizeLabel: "",
    isAbfuser: true,
  });
}

function addProductLine(linesByKey, modelKey, qty, roles, soundbarSelections, priceMap, soundbarOptions) {
  if (!modelKey || modelKey === 'off' || modelKey === 'OFF') return;

  const resolved = getCommercialPrice(modelKey, soundbarSelections, priceMap, soundbarOptions);
  const lineKey = resolved.isSoundbar ? `${resolved.key}:${resolved.sizeValue}` : resolved.key;
  const existing = linesByKey.get(lineKey);
  const hasPrice = resolved.priceExVat !== null && resolved.priceExVat !== undefined;

  if (existing) {
    existing.count += qty;
    existing.qty = existing.count;
    existing.rolesList.push(...roles);
    existing.subtotalExVat = hasPrice && existing.unitPriceExVat !== null
      ? existing.unitPriceExVat * existing.count
      : null;
    existing.subtotal = existing.subtotalExVat;
    return;
  }

  const label = getModelLabel(resolved.key);
  const description = resolved.sizeLabel ? `${label} — ${resolved.sizeLabel}` : label;

  linesByKey.set(lineKey, {
    model: resolved.key,
    description,
    price: resolved.priceExVat,
    unitPriceExVat: resolved.priceExVat,
    count: qty,
    qty,
    subtotal: hasPrice ? resolved.priceExVat * qty : null,
    subtotalExVat: hasPrice ? resolved.priceExVat * qty : null,
    rolesList: [...roles],
    note: resolved.note,
    isSoundbar: resolved.isSoundbar,
    sizeValue: resolved.sizeValue,
    sizeLabel: resolved.sizeLabel,
    inactive: resolved.note === 'inactive',
  });
}

/**
 * Price one design. Same inputs, same output shape and same rules as the
 * usePriceCalculation hook, which now delegates here.
 *
 * @param {Object} input
 * @returns {Object} the priced breakdown (see usePriceCalculation)
 */
export function computeCommercialPriceBreakdown({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  difficultyMultiplier = 1.0,
  priceMode = 'incVat',
  manualExtras = [],
  soundbarSelections = {},
  acousticTreatmentEnabled = false,
  selectedAbfuserQty = 0,
  priceMap = null,
  soundbarOptions = null,
  priceListAvailable = false,
  priceListLoading = false,
  territoryCode = null,
  territoryLabel = null,
  currency = null,
} = {}) {
  const mode = priceMode === 'exVat' ? 'exVat' : 'incVat';
  const linesByKey = new Map();
  let subwooferCount = 0;

  for (const spk of placedSpeakers) {
    if (!spk?.model || spk.model === 'off') continue;
    const role = String(spk.role || '').toUpperCase();
    if (role === 'LFE') continue;
    addProductLine(linesByKey, String(spk.model), 1, [role], soundbarSelections, priceMap, soundbarOptions);
  }

  if (frontSubsCfg?.model && Number(frontSubsCfg?.count) > 0) {
    const count = Number(frontSubsCfg.count) || 0;
    subwooferCount += count;
    addProductLine(linesByKey, frontSubsCfg.model, count, ['SUB (Front)'], soundbarSelections, priceMap, soundbarOptions);
  }

  if (rearSubsCfg?.model && Number(rearSubsCfg?.count) > 0) {
    const count = Number(rearSubsCfg.count) || 0;
    subwooferCount += count;
    addProductLine(linesByKey, rearSubsCfg.model, count, ['SUB (Rear)'], soundbarSelections, priceMap, soundbarOptions);
  }

  if (subwooferCount > 0) {
    addProductLine(linesByKey, 'cph-1000d', subwooferCount, ['Subwoofer amp'], soundbarSelections, priceMap, soundbarOptions);
  }

  if (acousticTreatmentEnabled && Number(selectedAbfuserQty) > 0) {
    addAbfuserLine(linesByKey, Number(selectedAbfuserQty), priceMap);
  }

  // Split active and inactive product lines. Inactive products never appear
  // in the active breakdown, never contribute to totals, and are reported
  // separately in inactiveBreakdown.
  const allLines = Array.from(linesByKey.values());
  const activeLines = allLines.filter((line) => !line.inactive);
  const inactiveLines = allLines.filter((line) => line.inactive);
  const inactiveBreakdown = inactiveLines.map((line) => ({
    ...line,
    roles: line.rolesList.join(', '),
    subtotal: line.subtotalExVat,
    displayUnitPrice: null,
    displaySubtotal: null,
    inactiveReason: 'Product is inactive',
  }));

  // Territory without a connected price list: return product structure with
  // quantities intact but ALL monetary fields null. No UK fallback, no £0.
  if (!priceListAvailable) {
    const unavailableBreakdown = activeLines.map((line) => ({
      ...line,
      price: null,
      unitPriceExVat: null,
      subtotal: null,
      subtotalExVat: null,
      displayUnitPrice: null,
      displaySubtotal: null,
    }));

    return {
      priceListAvailable: false,
      territoryCode,
      territoryLabel,
      currency,
      baseTotal: null,
      finalTotal: null,
      displayTotal: null,
      difficultyMultiplier: Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 ? difficultyMultiplier : 1.0,
      breakdown: unavailableBreakdown,
      baseTotalExVat: null,
      vatAmount: null,
      finalTotalExVat: null,
      finalTotalIncVat: null,
      priceMode: mode,
      incompletePriceCount: 0,
      soundbarOptions: null,
      priceMapLoading: priceListLoading,
      inactiveBreakdown,
    };
  }

  const productBreakdown = activeLines.map((line) => {
    const hasPrice = line.unitPriceExVat !== null && line.unitPriceExVat !== undefined;
    return {
      ...line,
      roles: line.rolesList.join(', '),
      subtotal: line.subtotalExVat,
      displayUnitPrice: hasPrice ? displayAmount(line.unitPriceExVat, mode) : null,
      displaySubtotal: hasPrice ? displayAmount(line.subtotalExVat, mode) : null,
    };
  });

  const manualBreakdown = (Array.isArray(manualExtras) ? manualExtras : [])
    .map((item) => {
      const description = String(item?.description || '').trim();
      const qty = Math.max(0, Number(item?.quantity) || 0);
      const unitPriceExVat = Math.max(0, Number(item?.unitPriceExVat) || 0);
      const subtotalExVat = qty * unitPriceExVat;
      if (!description && unitPriceExVat <= 0) return null;

      return {
        model: 'manual-extra',
        description: description || 'Manual item',
        price: unitPriceExVat,
        unitPriceExVat,
        count: qty,
        qty,
        subtotal: subtotalExVat,
        subtotalExVat,
        roles: 'Manual extra',
        note: unitPriceExVat <= 0 ? 'price not set' : '',
        isManual: true,
        displayUnitPrice: displayAmount(unitPriceExVat, mode),
        displaySubtotal: displayAmount(subtotalExVat, mode),
      };
    })
    .filter(Boolean);

  const breakdown = [...productBreakdown, ...manualBreakdown];
  const incompletePriceCount = productBreakdown.filter(
    (line) => line.unitPriceExVat === null || line.unitPriceExVat === undefined
  ).length;
  const baseTotalExVat = breakdown.reduce((sum, line) => {
    if (line.subtotalExVat === null || line.subtotalExVat === undefined) return sum;
    return sum + (Number(line.subtotalExVat) || 0);
  }, 0);
  const multiplier = Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 ? difficultyMultiplier : 1.0;
  const finalTotalExVat = baseTotalExVat * multiplier;
  const vatAmount = finalTotalExVat * VAT_RATE;
  const finalTotalIncVat = finalTotalExVat + vatAmount;
  const displayTotal = mode === 'incVat' ? finalTotalIncVat : finalTotalExVat;
  const baseTotal = displayAmount(baseTotalExVat, mode);

  return {
    priceListAvailable: true,
    territoryCode,
    territoryLabel,
    currency,
    baseTotal,
    finalTotal: displayTotal,
    difficultyMultiplier: multiplier,
    breakdown,
    baseTotalExVat,
    vatAmount,
    finalTotalExVat,
    finalTotalIncVat,
    displayTotal,
    priceMode: mode,
    incompletePriceCount,
    soundbarOptions,
    priceMapLoading: priceListLoading,
    inactiveBreakdown,
  };
}