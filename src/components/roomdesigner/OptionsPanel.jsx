import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function OptionsPanel({ showPrices, setShowPrices, difficultyMultiplier, setDifficultyMultiplier }) {
  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <Label htmlFor="show-prices" className="text-sm font-medium">Show Prices</Label>
        <Switch id="show-prices" checked={showPrices} onCheckedChange={setShowPrices} />
      </div>
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