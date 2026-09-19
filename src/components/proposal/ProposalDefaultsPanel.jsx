import React from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const DEFAULT_TOGGLES = [
  { key: 'include_about_us', label: 'Include About Us' },
  { key: 'include_warranty', label: 'Include Warranty' },
  { key: 'include_product_gallery', label: 'Include Product Gallery' },
  { key: 'include_rp22_overview', label: 'Include RP22 Overview' },
  { key: 'include_technical_appendix', label: 'Include Technical Appendix' },
];

const TONES = [
  { value: 'luxury_residential', label: 'Luxury Residential' },
  { value: 'technical', label: 'Technical' },
  { value: 'architect', label: 'Architect' },
  { value: 'commercial', label: 'Commercial' },
];

/**
 * Proposal Defaults panel — dealer-level settings controlling
 * proposal tone and which sections are included by default.
 *
 * Props:
 * - values: { [key]: boolean | string }
 * - onChange: (key, value) => void
 */
export default function ProposalDefaultsPanel({ values, onChange }) {
  const currentTone = values.proposal_tone || 'luxury_residential';

  return (
    <div className="space-y-6">
      {/* ── Proposal Tone ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#3E4349]">Proposal Tone</h3>
          <p className="text-xs text-[#625143] mt-1">
            Sound Proof uses this tone when generating proposal narrative.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TONES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange('proposal_tone', value)}
              className={`px-3 py-2 text-sm rounded-md border transition-colors text-left flex items-center gap-2 ${
                currentTone === value
                  ? 'bg-[#213428] text-white border-[#213428]'
                  : 'bg-white text-[#3E4349] border-[#DCDBD6] hover:bg-[#F5F4F0]'
              }`}
            >
              <span
                className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${
                  currentTone === value ? 'border-white' : 'border-[#625143]'
                }`}
                style={currentTone === value ? { backgroundColor: 'white' } : {}}
              />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Proposal Sections ── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[#3E4349]">Proposal Sections</h3>
          <p className="text-xs text-[#625143] mt-1">
            These sections will be included in new proposals by default. Override per-proposal later.
          </p>
        </div>
        {DEFAULT_TOGGLES.map(({ key, label }) => (
          <div
            key={key}
            className="flex items-center justify-between py-2 border-b border-[#DCDBD6] last:border-0"
          >
            <Label className="text-sm text-[#1B1A1A] cursor-pointer">{label}</Label>
            <Switch
              checked={values[key] ?? true}
              onCheckedChange={(checked) => onChange(key, checked)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}