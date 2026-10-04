/**
 * ImageScopeBadge
 * ---------------
 * The small scope label a project image carries: Project-wide, or the version it
 * belongs to. Presentation only.
 */

import React from 'react';
import { Layers, MonitorPlay } from 'lucide-react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';
import { IMAGE_SCOPE, resolveImageVersionId } from './imageScopeAuthority';

export default function ImageScopeBadge({ asset, versionNameById = new Map(), className = '' }) {
  const versionId = resolveImageVersionId(asset);
  const versionName = versionId ? versionNameById.get(versionId) : null;
  // The saved name already reads as a version ("Level 1 version"), so it is
  // shown exactly as saved and never suffixed again.
  const label = versionId
    ? (versionName || 'Version-specific')
    : 'Project-wide';
  const Icon = versionId ? MonitorPlay : Layers;

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      data-image-scope={versionId ? IMAGE_SCOPE.VERSION : IMAGE_SCOPE.PROJECT}
    >
      <Icon className="w-3.5 h-3.5 text-[#A79E8C]" />
      <span className="text-[11px] uppercase tracking-[0.12em] text-[#8A8477]" style={{ fontFamily: REPORT_FONT_BODY }}>
        {label}
      </span>
    </span>
  );
}