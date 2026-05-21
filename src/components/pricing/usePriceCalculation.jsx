// components/pricing/usePriceCalculation.jsx
import { useMemo } from 'react';
import { getSpeakerModelMeta, normaliseModelKey } from "@/components/models/speakers/registry";

const VAT_RATE = 0.2;
const CPH_1000D_PRICE_EX_VAT = 675;

const FIXED_RETAIL_PRICES_EX_VAT = {
  "q4-3": 1516.67,
  "q4-3_s": 1516.67,
  "q6-3": 1741.67,
  "q6-3_s": 1741.67,
  "q4-5": 3258.33,
  "q4-5_s": 3258.33,
  "q8-5": 4775,
  "q8-5_s": 4775,
  "evolve-2-1": 650,
  "evolve-2-1_s": 650,
  "evolve-3-1": 975,
  "evolve-3-1_s": 975,
  "evolve-4-2": 1483.33,
  "evolve-4-2_s": 1483.33,
  "evolve-6-3": 1875,
  "evolve-6-3_s": 1875,
  "evolve-8-4": 2266.67,
  "evolve-8-4_s": 2266.67,
  "architect-2-1": 616.67,
  "architect-4-2": 1025,
  "architect-pas2-2": 1000,
  "c-1": 766.67,
  "sub2-12": 1825,
  "sub3-12": 3116.67,
  "sub4-12": 5500,
  "cph-1000d": CPH_1000D_PRICE_EX_VAT,
};

export const SOUNDBAR_PRICE_OPTIONS = {
  "c4-1": [
    { value: "1222", label: "1222mm", priceExVat: 1616.67 },
    { value: "1449", label: "1449mm", priceExVat: 1733.33 },
    { value: "1672", label: "1672mm", priceExVat: 1825 },
    { value: "1904", label: "1904mm", priceExVat: 1991.67 },
  ],
  "multi-lcr": [
    { value: "1222-m", label: "1222 M", priceExVat: 2383.33 },
    { value: "1441-l", label: "1441 L", priceExVat: 2650 },
    { value: "1711-xl", label: "1711 XL", priceExVat: 2866.67 },
    { value: "1842-xxl", label: "1842 XXL", priceExVat: 3366.67 },
    { value: "2230-xxxl", label: "2230 XXXL", priceExVat: 4641.67 },
  ],
  "multi-mono": [
    { value: "1222-m", label: "1222 M", priceExVat: 2383.33 },
    { value: "1441-l", label: "1441 L", priceExVat: 2650 },
    { value: "1711-xl", label: "1711 XL", priceExVat: 2866.67 },
    { value: "1842-xxl", label: "1842 XXL", priceExVat: 3366.67 },
    { value: "2230-xxxl", label: "2230 XXXL", priceExVat: 4641.67 },
  ],
  "hspl-lcr": [
    { value: "1669-1800", label: "1669–1800mm", priceExVat: 4141.67 },
    { value: "1801-2000", label: "1801–2000mm", priceExVat: 4400 },
    { value: "2001-2200", label: "2001–2200mm", priceExVat: 6150 },
    { value: "2201-2600", label: "2201–2600mm", priceExVat: 6808.33 },
  ],
  "hspl-mono": [
    { value: "1669-1800", label: "1669–1800mm", priceExVat: 4141.67 },
    { value: "1801-2000", label: "1801–2000mm", priceExVat: 4400 },
    { value: "2001-2200", label: "2001–2200mm", priceExVat: 6150 },
    { value: "2201-2600", label: "2201–2600mm", priceExVat: 6808.33 },
  ],
};

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

function getCommercialPrice(modelKey, soundbarSelections = {}) {
  const key = normaliseModelKey(modelKey);
  const soundbarOptions = SOUNDBAR_PRICE_OPTIONS[key];

  if (soundbarOptions) {
    const selectedValue = soundbarSelections[key] || soundbarOptions[0]?.value;
    const selectedOption = soundbarOptions.find((option) => option.value === selectedValue) || soundbarOptions[0];
    return {
      key,
      priceExVat: Number(selectedOption?.priceExVat) || 0,
      sizeLabel: selectedOption?.label || '',
      sizeValue: selectedOption?.value || '',
      isSoundbar: true,
      note: selectedOption ? '' : 'price not set',
    };
  }

  if (Object.prototype.hasOwnProperty.call(FIXED_RETAIL_PRICES_EX_VAT, key)) {
    return { key, priceExVat: Number(FIXED_RETAIL_PRICES_EX_VAT[key]) || 0, sizeLabel: '', sizeValue: '', isSoundbar: false, note: '' };
  }

  return { key, priceExVat: 0, sizeLabel: '', sizeValue: '', isSoundbar: false, note: 'price not set' };
}

function addProductLine(linesByKey, modelKey, qty, roles, soundbarSelections) {
  if (!modelKey || modelKey === 'off' || modelKey === 'OFF') return;

  const resolved = getCommercialPrice(modelKey, soundbarSelections);
  const lineKey = resolved.isSoundbar ? `${resolved.key}:${resolved.sizeValue}` : resolved.key;
  const existing = linesByKey.get(lineKey);

  if (existing) {
    existing.count += qty;
    existing.qty = existing.count;
    existing.rolesList.push(...roles);
    existing.subtotalExVat = existing.unitPriceExVat * existing.count;
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
    subtotal: resolved.priceExVat * qty,
    subtotalExVat: resolved.priceExVat * qty,
    rolesList: [...roles],
    note: resolved.note,
    isSoundbar: resolved.isSoundbar,
    sizeValue: resolved.sizeValue,
    sizeLabel: resolved.sizeLabel,
  });
}

export function usePriceCalculation({
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
  difficultyMultiplier = 1.0,
  priceMode = 'incVat',
  manualExtras = [],
  soundbarSelections = {},
}) {
  return useMemo(() => {
    const mode = priceMode === 'exVat' ? 'exVat' : 'incVat';
    const linesByKey = new Map();
    let subwooferCount = 0;

    for (const spk of placedSpeakers) {
      if (!spk?.model || spk.model === 'off') continue;
      const role = String(spk.role || '').toUpperCase();
      if (role === 'LFE') continue;
      addProductLine(linesByKey, String(spk.model), 1, [role], soundbarSelections);
    }

    if (frontSubsCfg?.model && Number(frontSubsCfg?.count) > 0) {
      const count = Number(frontSubsCfg.count) || 0;
      subwooferCount += count;
      addProductLine(linesByKey, frontSubsCfg.model, count, ['SUB (Front)'], soundbarSelections);
    }

    if (rearSubsCfg?.model && Number(rearSubsCfg?.count) > 0) {
      const count = Number(rearSubsCfg.count) || 0;
      subwooferCount += count;
      addProductLine(linesByKey, rearSubsCfg.model, count, ['SUB (Rear)'], soundbarSelections);
    }

    if (subwooferCount > 0) {
      addProductLine(linesByKey, 'cph-1000d', subwooferCount, ['Subwoofer amp'], soundbarSelections);
    }

    const productBreakdown = Array.from(linesByKey.values()).map((line) => ({
      ...line,
      roles: line.rolesList.join(', '),
      subtotal: line.subtotalExVat,
      displayUnitPrice: displayAmount(line.unitPriceExVat, mode),
      displaySubtotal: displayAmount(line.subtotalExVat, mode),
    }));

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
    const baseTotalExVat = breakdown.reduce((sum, line) => sum + (Number(line.subtotalExVat) || 0), 0);
    const multiplier = Number.isFinite(difficultyMultiplier) && difficultyMultiplier > 0 ? difficultyMultiplier : 1.0;
    const finalTotalExVat = baseTotalExVat * multiplier;
    const vatAmount = finalTotalExVat * VAT_RATE;
    const finalTotalIncVat = finalTotalExVat + vatAmount;
    const displayTotal = mode === 'incVat' ? finalTotalIncVat : finalTotalExVat;
    const baseTotal = displayAmount(baseTotalExVat, mode);

    return {
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
    };
  }, [placedSpeakers, frontSubsCfg, rearSubsCfg, difficultyMultiplier, priceMode, manualExtras, soundbarSelections]);
}