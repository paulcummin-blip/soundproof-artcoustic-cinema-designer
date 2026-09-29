/**
 * ReportTypographyStyles
 * ----------------------
 * Mounts the shared report typography system (reportTypography.js) for one
 * report root. Every generated client-facing surface — Visual Report,
 * Technical Report, Proposal documents — mounts this once, so no report
 * component ever declares its own font choice or type ratios.
 *
 * Render it BEFORE the surface's own print stylesheet: the shared block
 * establishes the canonical baseline, and the surface's tuned rules then take
 * precedence on equal specificity.
 *
 * Props:
 * - scope:   CSS selector of the report root (e.g. '.rp22-report')
 * - profile: 'a4' (default) or 'presentation'
 * - prefix:  optional selector prefix for higher specificity
 * - includeBodyRole: set false for a screen-only preview that keeps its own
 *   screen-adapted body sizes but still shares families and heading roles.
 */

import React from 'react';
import { buildReportTypographyCss, DEFAULT_REPORT_PROFILE } from './reportTypography';

export default function ReportTypographyStyles({
  scope,
  profile = DEFAULT_REPORT_PROFILE,
  prefix = '',
  includeBodyRole = true,
}) {
  if (!scope) return null;
  return <style>{buildReportTypographyCss({ scope, profile, prefix, includeBodyRole })}</style>;
}