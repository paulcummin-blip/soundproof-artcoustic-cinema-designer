// src/components/admin/speaker-db/SpeakerDbSettings.jsx
//
// Settings section for the Speaker Capability Database.
// Displays validation rule framework and database configuration.
// No calculations are performed — this is the framework definition only.

import React from "react";
import { Settings, Shield, Database } from "lucide-react";

const BRAND = {
  text: "#1B1A1A",
  subtext: "#625143",
  border: "#DCDBD6",
  card: "#FFFFFF",
  green: "#213428",
};

const VALIDATION_RULES = [
  { field: "Sensitivity", range: "75–105 dB", description: "Sensitivity values outside this range create a warning." },
  { field: "Maximum SPL", range: "85–140 dB", description: "Maximum continuous SPL values outside this range create a warning." },
  { field: "Nominal Impedance", range: "2–16 Ω", description: "Nominal impedance values outside this range create a warning." },
  { field: "Frequency Low", range: "10–200 Hz", description: "Lowest frequency response values outside this range create a warning." },
];

const CONFIDENCE_LEVELS = [
  { level: "A", label: "Published", description: "Data published directly by the manufacturer." },
  { level: "B", label: "Calculated", description: "Data calculated from published specifications." },
  { level: "C", label: "Estimated", description: "Data estimated from related products or partial data." },
  { level: "D", label: "Engineering Estimate", description: "Data estimated by an engineer without manufacturer backing." },
];

const EVIDENCE_QUALITY = [
  { label: "Manufacturer Published", description: "Specifications taken directly from manufacturer documentation." },
  { label: "Manufacturer Calculated", description: "Specifications calculated by the manufacturer from raw data." },
  { label: "Engineering Estimate", description: "Specifications estimated by Sound Proof engineering team." },
  { label: "Unknown", description: "Source of the data is not known." },
];

export default function SpeakerDbSettings() {
  return (
    <div className="space-y-6">
      {/* Validation Rules Framework */}
      <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4" style={{ color: BRAND.green }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.text }}>Validation Rules Framework</h3>
        </div>
        <div className="text-xs mb-4" style={{ color: BRAND.subtext }}>
          The framework is defined below. Values outside these ranges will generate validation warnings when data is entered. No calculations are performed at this stage.
        </div>
        <div className="space-y-2">
          {VALIDATION_RULES.map((rule) => (
            <div key={rule.field} className="flex items-center justify-between py-2 px-3 rounded-md" style={{ background: "#F8F8F7" }}>
              <div>
                <div className="text-sm font-medium" style={{ color: BRAND.text }}>{rule.field}</div>
                <div className="text-xs" style={{ color: BRAND.subtext }}>{rule.description}</div>
              </div>
              <span className="text-sm font-mono px-2 py-1 rounded" style={{ background: BRAND.green + "15", color: BRAND.green }}>{rule.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Confidence Levels */}
      <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
        <div className="flex items-center gap-2 mb-4">
          <Settings className="w-4 h-4" style={{ color: BRAND.green }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.text }}>Confidence Levels</h3>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {CONFIDENCE_LEVELS.map((c) => (
            <div key={c.level} className="p-3 rounded-md" style={{ background: "#F8F8F7" }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold" style={{ background: BRAND.green + "15", color: BRAND.green }}>{c.level}</span>
                <span className="text-sm font-medium" style={{ color: BRAND.text }}>{c.label}</span>
              </div>
              <div className="text-xs" style={{ color: BRAND.subtext }}>{c.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Evidence Quality */}
      <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: BRAND.card }}>
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4" style={{ color: BRAND.green }} />
          <h3 className="text-sm font-bold uppercase tracking-wide" style={{ color: BRAND.text }}>Evidence Quality</h3>
        </div>
        <div className="space-y-2">
          {EVIDENCE_QUALITY.map((e) => (
            <div key={e.label} className="py-2 px-3 rounded-md" style={{ background: "#F8F8F7" }}>
              <div className="text-sm font-medium" style={{ color: BRAND.text }}>{e.label}</div>
              <div className="text-xs" style={{ color: BRAND.subtext }}>{e.description}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture Note */}
      <div className="rounded-lg p-5" style={{ border: `1px solid ${BRAND.border}`, background: "#F8F8F7" }}>
        <div className="text-xs" style={{ color: BRAND.subtext }}>
          This database is designed as the permanent foundation for all loudspeaker capability data in Sound Proof.
          Future stages (crawler, AI extraction, Excel export, RP22 calculations, recommendation engine) will plug into this schema without requiring database redesign.
        </div>
      </div>
    </div>
  );
}