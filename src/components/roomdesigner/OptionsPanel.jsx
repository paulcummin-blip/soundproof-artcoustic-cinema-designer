import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { SOUNDBAR_PRICE_OPTIONS, usePriceCalculation } from "@/components/pricing/usePriceCalculation";

const formatPrice = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value || 0));

const emptyManualItem = () => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: '',
  quantity: 1,
  unitPriceExVat: '',
});

export default function OptionsPanel({
  showPrices,
  setShowPrices,
  difficultyMultiplier,
  setDifficultyMultiplier,
  priceData,
  placedSpeakers = [],
  frontSubsCfg = null,
  rearSubsCfg = null,
}) {
  const [priceMode, setPriceMode] = React.useState('incVat');
  const [manualExtras, setManualExtras] = React.useState([]);
  const [soundbarSelections, setSoundbarSelections] = React.useState({});

  const commercialPriceData = usePriceCalculation({
    placedSpeakers,
    frontSubsCfg,
    rearSubsCfg,
    difficultyMultiplier,
    priceMode,
    manualExtras,
    soundbarSelections,
  });

  const activePriceData = commercialPriceData || priceData;

  const updateManualItem = (id, patch) => {
    setManualExtras((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const removeManualItem = (id) => {
    setManualExtras((items) => items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-prices" className="text-sm font-medium">Show Prices</Label>
        <Switch id="show-prices" checked={showPrices} onCheckedChange={setShowPrices} />
      </div>

      {showPrices && activePriceData && (
        <>
          <div className="p-3 bg-[#F3F2EF] rounded-lg border border-[#DCDBD6] space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="price-display" className="text-xs font-medium text-[#3E4349]">Price display</Label>
              <select
                id="price-display"
                value={priceMode}
                onChange={(e) => setPriceMode(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 rounded bg-white"
              >
                <option value="exVat">Ex VAT</option>
                <option value="incVat">Inc VAT</option>
              </select>
            </div>

            <div>
              <div className="text-xs font-medium text-[#3E4349] mb-1">
                Loudspeaker system price, {priceMode === 'incVat' ? 'inc VAT' : 'ex VAT'}
              </div>
              <div className="text-2xl font-bold text-[#213428]">{formatPrice(activePriceData.displayTotal ?? activePriceData.finalTotal)}</div>
              {activePriceData.difficultyMultiplier !== 1.0 && (
                <div className="text-xs text-[#625143] mt-1">
                  Base {formatPrice(activePriceData.baseTotal)} × {activePriceData.difficultyMultiplier.toFixed(2)}
                </div>
              )}
              {priceMode === 'incVat' && (
                <div className="text-xs text-[#625143] mt-1">
                  VAT {formatPrice(activePriceData.vatAmount)} included
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium text-gray-700">Selected product breakdown</div>
            <div className="border border-[#DCDBD6] rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_42px_76px_82px] gap-2 bg-[#F3F2EF] px-2 py-2 text-[11px] font-semibold text-[#3E4349]">
                <div>Description</div>
                <div>Qty</div>
                <div>Unit</div>
                <div>Total</div>
              </div>
              {(activePriceData.breakdown || []).length === 0 ? (
                <div className="px-2 py-3 text-xs text-gray-500">No priced products selected.</div>
              ) : (
                (activePriceData.breakdown || []).map((line, index) => {
                  const soundbarOptions = SOUNDBAR_PRICE_OPTIONS[line.model] || null;
                  return (
                    <div key={`${line.model}-${line.sizeValue || 'fixed'}-${index}`} className="grid grid-cols-[1fr_42px_76px_82px] gap-2 px-2 py-2 border-t border-[#EEEDEA] text-xs items-start">
                      <div className="min-w-0">
                        <div className="font-medium text-[#213428] truncate">{line.description}</div>
                        {soundbarOptions && (
                          <select
                            value={soundbarSelections[line.model] || line.sizeValue || soundbarOptions[0]?.value}
                            onChange={(e) => setSoundbarSelections((prev) => ({ ...prev, [line.model]: e.target.value }))}
                            className="mt-1 w-full text-[11px] px-2 py-1 border border-gray-300 rounded bg-white"
                          >
                            {soundbarOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        )}
                        {line.note && <div className="text-[11px] text-amber-700 mt-1">{line.note}</div>}
                      </div>
                      <div>{line.qty ?? line.count}</div>
                      <div>{formatPrice(line.displayUnitPrice ?? line.price)}</div>
                      <div className="font-medium">{formatPrice(line.displaySubtotal ?? line.subtotal)}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">Manual extras</div>
              <button
                type="button"
                onClick={() => setManualExtras((items) => [...items, emptyManualItem()])}
                className="text-xs px-2 py-1 rounded border border-[#DCDBD6] bg-white hover:bg-[#F3F2EF]"
              >
                Add manual item
              </button>
            </div>

            {manualExtras.length > 0 && (
              <div className="space-y-2">
                {manualExtras.map((item) => (
                  <div key={item.id} className="grid grid-cols-[1fr_56px_92px_auto] gap-2 items-center">
                    <input
                      type="text"
                      placeholder="Category / item"
                      value={item.description}
                      onChange={(e) => updateManualItem(item.id, { description: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={item.quantity}
                      onChange={(e) => updateManualItem(item.id, { quantity: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Unit £"
                      value={item.unitPriceExVat}
                      onChange={(e) => updateManualItem(item.id, { unitPriceExVat: e.target.value })}
                      className="px-2 py-1 border border-gray-300 rounded text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeManualItem(item.id)}
                      className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 bg-white hover:bg-red-50"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label htmlFor="difficulty" className="text-sm font-medium">Difficulty Rating</Label>
        <div className="text-xs text-gray-500 mb-2">
          Multiplies hardware prices to reflect installation difficulty (1.00 = baseline)
        </div>
        <input
          id="difficulty"
          type="number"
          step="0.01"
          value={difficultyMultiplier.toFixed(2)}
          onChange={(e) => {
            const val = parseFloat(e.target.value);
            if (Number.isFinite(val) && val > 0) setDifficultyMultiplier(Math.round(val * 100) / 100);
          }}
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            if (!Number.isFinite(val) || val <= 0) setDifficultyMultiplier(1.0);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        />
      </div>
    </div>
  );
}