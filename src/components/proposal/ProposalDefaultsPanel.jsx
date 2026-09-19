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

/**
 * Proposal Defaults panel — dealer-level toggles controlling which
 * sections are included in new proposals by default.
 *
 * Props:
 * - values: { [key]: boolean }
 * - onChange: (key, checked) => void
 */
export default function ProposalDefaultsPanel({ values, onChange }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-[#3E4349]">Proposal Defaults</h3>
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
  );
}