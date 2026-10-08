/**
 * projectReportEntries.js
 * -----------------------
 * The report destinations behind the Room Designer's ONE report action, and the
 * SHARED report route each one opens.
 *
 * The action bar used to show two separate report buttons (Visual Report and
 * Technical Report), which asked the designer to decide from the header which
 * report they wanted. The single "Project Report" action replaces them; this
 * module is the plain list it offers, so the menu stays presentational and the
 * mapping can be read and tested without the UI.
 *
 * The routes are the shared report routes — the same ones the reports, the
 * Project Library and the report pairing links already use. No report
 * generation, authority, readiness or export naming lives here.
 */

import { REPORT_ROUTE } from "@/components/report/reportLibraryContext";

/** The report destinations this single action offers, in reading order. */
export const PROJECT_REPORT_ENTRIES = Object.freeze([
  { key: "visual", label: "Visual Report", icon: "eye", route: REPORT_ROUTE.VISUAL },
  { key: "technical", label: "Technical Report", icon: "file-text", route: REPORT_ROUTE.TECHNICAL },
  { key: "designReview", label: "Design Review", icon: "clipboard-list", route: REPORT_ROUTE.DESIGN_REVIEW },
]);

/** The shared report route a chosen entry opens. */
export function projectReportRoute(key) {
  return PROJECT_REPORT_ENTRIES.find((entry) => entry.key === key)?.route || null;
}