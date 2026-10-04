import { reportFirstPageMeta } from '../reportFirstPageMeta.js';

/**
 * The first-page project metadata line for the Visual Report:
 *
 *   Marquee Home · Noble Projects · Version: Level 4 version · Ref: 6ABBCA66 · 29 September 2026
 *
 * Project, Client, Version, Reference and Date, composed once by the shared
 * builder so the on-screen masthead and the exported PDF first page state the
 * identical line. Only the dealer-assigned project reference is a report
 * reference: the client name is never used as one, and vice versa. The design
 * version is always stated, so a multi-version project's report names the
 * version it documents.
 *
 * @param {Object} projectDetails - the Project record
 * @param {{number?: number, name?: string}|null} [version] - the design version this report belongs to
 * @returns {string}
 */
export function clientReportHeaderMeta(projectDetails, version = null) {
  return reportFirstPageMeta(projectDetails, version);
}