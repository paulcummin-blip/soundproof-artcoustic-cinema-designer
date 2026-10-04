/**
 * ImageScopeSelect
 * ----------------
 * The scope choice on one image: use it for the whole project, or for the
 * current version only. Project-wide is the default, and choosing the version
 * scope needs the version that is open.
 *
 * Presentation and choice only — the write belongs to the gallery panel.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { IMAGE_SCOPE, resolveImageVersionId } from './imageScopeAuthority';

export default function ImageScopeSelect({
  asset,
  activeVersionId = null,
  activeVersionName = null,
  onChange,
}) {
  const value = resolveImageVersionId(asset) ? IMAGE_SCOPE.VERSION : IMAGE_SCOPE.PROJECT;

  return (
    <label className="flex items-center gap-2 text-xs text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
      Scope
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border border-[#DCDBD6] bg-white px-2 py-1 text-xs text-[#1B1A1A]"
        style={{ fontFamily: REPORT_FONT_BODY }}
      >
        <option value={IMAGE_SCOPE.PROJECT}>Use for whole project</option>
        <option value={IMAGE_SCOPE.VERSION} disabled={!activeVersionId}>
          {activeVersionName ? `Use for ${activeVersionName} only` : 'Use for current version only'}
        </option>
      </select>
    </label>
  );
}