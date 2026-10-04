/**
 * ImageScopeSelect
 * ----------------
 * The scope choice on one stored image: use it for the whole project, or for one
 * named design version. Options are the project's scopes in full — Project-wide
 * and every saved version by its exact saved name — so an image can be moved to
 * any version without switching the project's active version.
 *
 * Presentation and choice only — the write belongs to the gallery panel. The
 * value is a scope key: 'project' or 'version:<id>'.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { imageScopeOptions, scopeKeyOfAsset } from './imageScopeAuthority';

export default function ImageScopeSelect({
  asset,
  versions = [],
  activeVersionId = null,
  onChange,
}) {
  const options = React.useMemo(
    () => imageScopeOptions({ versions, activeVersionId }),
    [versions, activeVersionId],
  );
  const currentKey = scopeKeyOfAsset(asset);
  // An image whose version is no longer saved keeps its own entry rather than
  // silently reading as project-wide.
  const value = options.some((option) => option.key === currentKey) ? currentKey : 'project';

  return (
    <label className="flex items-center gap-2 text-xs text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
      Scope
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-[#DCDBD6] bg-white px-2 py-1 text-xs text-[#1B1A1A] max-w-[200px]"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        {options.map(({ key, label }) => (
          <option key={key} value={key}>
            {key === 'project' ? 'Use for whole project' : `Use for ${label} only`}
          </option>
        ))}
      </select>
    </label>
  );
}