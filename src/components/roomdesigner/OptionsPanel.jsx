import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const formatPrice = (value) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.round(value || 0));

export default function OptionsPanel({ showPrices, setShowPrices, difficultyMultiplier, setDifficultyMultiplier, priceData }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-prices" className="text-sm font-medium">Show Prices</Label>
        <Switch id="show-prices" checked={showPrices} onCheckedChange={setShowPrices} />
      </div>

      {showPrices && priceData && (
        <div className="p-3 bg-[#F3F2EF] rounded-lg border border-[#DCDBD6]">
          <div className="text-xs font-medium text-[#3E4349] mb-1">Loudspeaker system price, inc VAT</div>
          <div className="text-2xl font-bold text-[#213428]">{formatPrice(priceData.finalTotal)}</div>
          {priceData.difficultyMultiplier !== 1.0 && (
            <div className="text-xs text-[#625143] mt-1">
              Base {formatPrice(priceData.baseTotal)} × {priceData.difficultyMultiplier.toFixed(2)}
            </div>
          )}
        </div>
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