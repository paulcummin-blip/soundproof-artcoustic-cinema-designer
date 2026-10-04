/**
 * ImageUploadScopeControl
 * -----------------------
 * The explicit answer to "where will a new image be used?": Project-wide, or the
 * version that is open. The chosen scope is the authority for every new upload,
 * so an image is never written to a scope the designer did not choose.
 *
 * Deliberately separate from the Library's filter, which only decides what is
 * listed — this control decides where an upload goes.
 *
 * Presentation and choice only — the write belongs to the gallery panel.
 */

import React from 'react';
import { Layers, MonitorPlay } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { IMAGE_SCOPE } from './imageScopeAuthority';

export default function ImageUploadScopeControl({
  value = IMAGE_SCOPE.PROJECT,
  onChange,
  activeVersionId = null,
  activeVersionName = null,
}) {
  // The version scope needs the version that is open: without one the choice
  // reads as project-wide, which is also the default.
  const resolved = value === IMAGE_SCOPE.VERSION && !activeVersionId ? IMAGE_SCOPE.PROJECT : value;

  const options = [
    {
      key: IMAGE_SCOPE.PROJECT,
      label: 'Project-wide',
      description: 'Use for all design versions.',
      Icon: Layers,
      disabled: false,
    },
    {
      key: IMAGE_SCOPE.VERSION,
      label: activeVersionName ? `Current version: ${activeVersionName}` : 'Current version',
      description: 'Use only for this design version.',
      Icon: MonitorPlay,
      disabled: !activeVersionId,
    },
  ];

  return (
    <div
      className="bg-white border border-[#DCDBD6] rounded-lg p-5"
      data-image-upload-scope={resolved}
    >
      <h3
        className="text-[13px] uppercase tracking-[0.16em] text-[#625143]"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        Image scope
      </h3>
      <p className="text-xs text-[#8A8477] mt-1" style={{ fontFamily: REPORT_FONT_BODY }}>
        Choose where new uploads should be used.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {options.map(({ key, label, description, Icon, disabled }) => {
          const checked = resolved === key;
          return (
            <label
              key={key}
              data-image-upload-scope-option={key}
              data-checked={checked ? 'true' : 'false'}
              className={`flex items-start gap-3 border rounded-lg p-3 transition-colors ${
                disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
              } ${checked ? 'border-[#213428] bg-[#F5F4F0]' : 'border-[#E5E1D8] bg-white'}`}
            >
              <input
                type="radio"
                name="image-upload-scope"
                value={key}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(key)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span
                  className="flex items-center gap-2 text-sm text-[#1B1A1A]"
                  style={{ fontFamily: REPORT_FONT_BODY }}
                >
                  <Icon className="w-4 h-4 text-[#A79E8C] shrink-0" />
                  {label}
                </span>
                <span
                  className="block text-xs text-[#8A8477] mt-0.5"
                  style={{ fontFamily: REPORT_FONT_BODY }}
                >
                  {description}
                </span>
              </span>
            </label>
          );
        })}
      </div>

      {!activeVersionId && (
        <p className="text-xs text-[#8A8477] mt-3" style={{ fontFamily: REPORT_FONT_BODY }}>
          Open a design version to upload images used only by that version.
        </p>
      )}
    </div>
  );
}