import React from "react";

const OPTIONS = [
  ["off", "Off"],
  ["plan", "Plan"],
  ["table", "Table"],
  ["both", "Both"],
];

export default function SpeakerPositionsControl({ value, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <div className="text-sm font-medium text-gray-700">Speaker Positions</div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="text-xs px-2 py-1 border border-gray-300 rounded"
      >
        {OPTIONS.map(([optionValue, label]) => (
          <option key={optionValue} value={optionValue}>{label}</option>
        ))}
      </select>
    </div>
  );
}