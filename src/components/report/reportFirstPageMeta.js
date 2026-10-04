/**
 * reportFirstPageMeta
 * -------------------
 * The first-page project metadata line, composed once for EVERY report:
 *
 *   Marquee Home · Noble Projects · Version: Level 4 version · Ref: 34 AR · 29 September 2026
 *
 * Project, Client, Version, Reference, Date — in that order. The Visual Report's
 * masthead and the Technical Report's cover both read this one line, on screen
 * and in the exported PDF, so the two never state a different identity.
 *
 * Only populated fields appear: a blank client or reference is omitted rather
 * than filled from another field, and the client name is never used as the
 * reference or the reverse. Client and reference keep their own values.
 *
 * Pure module: no React, no side effects, no runtime APIs.
 */

import { reportVersionMetaStatement } from './reportVersionIdentity.js';

/**
 * The project's own report date (en-GB, long), or null when it has none.
 *
 * @param {Object} project
 * @returns {string|null}
 */
export function reportDateLabel(project) {
  const raw = project?.created_date;
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * @param {Object} project - the Project record
 * @param {{number?: number, name?: string}|null} [version] - the design version this report belongs to
 * @returns {string} the single first-page metadata line
 */
export function reportFirstPageMeta(project, version = null) {
  const clientName = project?.client_name?.trim() || '';
  const projectReference = project?.project_reference?.trim() || '';

  return [
    project?.name || 'Untitled',
    clientName || null,
    version ? reportVersionMetaStatement(version) : null,
    projectReference ? `Ref: ${projectReference}` : null,
    reportDateLabel(project),
  ].filter(Boolean).join(' · ');
}