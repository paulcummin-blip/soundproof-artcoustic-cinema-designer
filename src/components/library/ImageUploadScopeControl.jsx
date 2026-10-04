/**
 * ImageUploadScopeControl
 * -----------------------
 * The Image Library's structure, in one control: every scope the project has,
 * named exactly as it is saved.
 *
 *   All images        — every gallery, each labelled with its own scope
 *   Project-wide      — images used by every design version
 *   Level 1 version   — images used by that version only
 *   Level 4 version   — images used by that version only
 *
 * Selecting a version shows that version's own slots (Cover Image, Image 1 to
 * Image 10) and makes it the destination for new uploads — so images for Level 4
 * version are added without switching the project's active design version.
 *
 * Names come from the saved ProjectVersion.version_name values. A slot number is
 * never turned into a label.
 *
 * Props:
 * - value: the selected key — 'all', 'project', or 'version:<id>'
 * - onChange: (key) => void
 * - versions: the project's saved versions
 * - activeVersionId: the version that is open, marked as such
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { IMAGE_SCOPE_FILTER, imageScopeOptions } from './imageScopeAuthority';

export default function ImageUploadScopeControl({
  value = IMAGE_SCOPE_FILTER.ALL,
  onChange,
  versions = [],
  activeVersionId = null,
}) {
  const options = React.useMemo(
    () => imageScopeOptions({ versions, activeVersionId }),
    [versions, activeVersionId],
  );

  const tabs = React.useMemo(
    () => [
      { key: IMAGE_SCOPE_FILTER.ALL, label: 'All images', isActiveVersion: false },
      ...options.map(({ key, label, isActiveVersion }) => ({ key, label, isActiveVersion })),
    ],
    [options],
  );

  const versionNames = options
    .filter((option) => option.scope === 'version')
    .map((option) => option.label);

  return (
    <div className="bg-white border border-[#DCDBD6] rounded-lg p-5" data-image-library-scope={value}>
      <h3
        className="text-[13px] uppercase tracking-[0.16em] text-[#625143]"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        Image library
      </h3>
      <p className="text-xs text-[#8A8477] mt-1" style={{ fontFamily: REPORT_FONT_BODY }}>
        Each scope keeps its own Cover Image and Image 1 to Image 10. Select a version to see and add
        images used by that version only — the project&rsquo;s open version does not change.
      </p>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        {tabs.map(({ key, label, isActiveVersion }) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              data-image-upload-scope-option={key}
              data-checked={selected ? 'true' : 'false'}
              aria-pressed={selected}
              onClick={() => onChange(key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                selected
                  ? 'bg-[#213428] text-white border-[#213428]'
                  : 'bg-white text-[#3E4349] border-[#E5E1D8] hover:border-[#213428]'
              }`}
              style={{ fontFamily: REPORT_FONT_BODY }}
            >
              {label}
              {isActiveVersion && <span className="opacity-70"> · open</span>}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[#213428] mt-3" style={{ fontFamily: REPORT_FONT_BODY }}>
        {versionNames.length > 0
          ? `Adding images for one version only? Select that version above, then upload in its section.`
          : 'This project has one design version, so every image is used by it.'}
      </p>
    </div>
  );
}