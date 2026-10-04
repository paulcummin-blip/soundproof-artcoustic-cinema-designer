/**
 * reportTypography.js
 * -------------------
 * THE single shared typography system for every generated client-facing
 * Sound Proof output:
 *
 *   - Visual Report (RP22ClientReport)
 *   - Technical Report (RP22Report)
 *   - Proposal / System Design Summary / System Design Comparison documents
 *   - every exported PDF and on-screen preview of the above
 *
 * Nothing in this file changes report content, calculations, scoring or
 * layout logic. It only decides how type is set.
 *
 * ── FONT RULES ────────────────────────────────────────────────────────────
 *   Headings: Futura PT Light
 *   Body:     Didact Gothic Regular, Didact Gothic Italic where italics apply
 *   Fallback: Century Gothic when a preferred face is unavailable
 *
 * ── RATIOS ────────────────────────────────────────────────────────────────
 *   A4 documents
 *     title      60pt   tracking +100   line height 1.2   uppercase
 *     header     22pt   tracking +100   line height 1.2   uppercase
 *     subheader  14pt   tracking +100   line height 1.2   uppercase
 *     body        9pt   tracking  +50   line height 1.4   sentence case
 *     meta        8pt   tracking  +50   line height 1.4   sentence case
 *
 *   Presentations (1920 x 1080)
 *     title 60pt   header 40pt   subheader 24pt   body 14pt   meta 12pt
 *
 * The relationship between title, header, subheader and body is fixed. A
 * consumer may adapt absolute sizes to its output format, but always through
 * the profile here, never with a local number.
 *
 * Trackings are expressed in em: +100 = 0.1em, +50 = 0.05em.
 *
 * Pure module: no React, no side effects, no runtime APIs.
 */

/* ── Fonts ─────────────────────────────────────────────────────────────── */

export const REPORT_FONT_HEADING =
  "'Futura PT Light', 'Futura PT', 'Century Gothic', 'Didact Gothic', sans-serif";

export const REPORT_FONT_BODY =
  "'Didact Gothic', 'Century Gothic', sans-serif";

/** Tracking values (+100 for headings, +50 for body). */
export const REPORT_TRACKING_HEADING = '0.1em';
export const REPORT_TRACKING_BODY = '0.05em';

/** Line heights for headings and body copy. */
export const REPORT_LEADING_HEADING = 1.2;
export const REPORT_LEADING_BODY = 1.4;

/* ── Profiles ──────────────────────────────────────────────────────────── */

export const REPORT_PROFILES = {
  /** A4 printed / exported documents. */
  a4: {
    key: 'a4',
    label: 'A4 document',
    title: '60pt',
    header: '22pt',
    subheader: '14pt',
    body: '9pt',
    meta: '8pt',
  },
  /** 16:9 presentation output (1920 x 1080). */
  presentation: {
    key: 'presentation',
    label: 'Presentation (1920 x 1080)',
    title: '60pt',
    header: '40pt',
    subheader: '24pt',
    body: '14pt',
    meta: '12pt',
  },
};

export const DEFAULT_REPORT_PROFILE = 'a4';

/**
 * @param {string} [profile]
 * @returns {{key: string, label: string, title: string, header: string, subheader: string, body: string}}
 */
export function resolveReportProfile(profile = DEFAULT_REPORT_PROFILE) {
  return REPORT_PROFILES[profile] || REPORT_PROFILES[DEFAULT_REPORT_PROFILE];
}

/**
 * The canonical CSS custom properties for a profile. Consumers set these once
 * on their report root and then reference them (var(--report-body-size) etc.)
 * so a size is never written twice.
 *
 * @param {string} [profile]
 * @returns {Record<string, string>}
 */
export function reportTypographyVars(profile = DEFAULT_REPORT_PROFILE) {
  const resolved = resolveReportProfile(profile);
  return {
    '--report-font-heading': REPORT_FONT_HEADING,
    '--report-font-body': REPORT_FONT_BODY,
    '--report-title-size': resolved.title,
    '--report-header-size': resolved.header,
    '--report-subheader-size': resolved.subheader,
    '--report-body-size': resolved.body,
    '--report-meta-size': resolved.meta,
    '--report-heading-tracking': REPORT_TRACKING_HEADING,
    '--report-body-tracking': REPORT_TRACKING_BODY,
    '--report-heading-leading': String(REPORT_LEADING_HEADING),
    '--report-body-leading': String(REPORT_LEADING_BODY),
  };
}

/* ── Inline role styles ────────────────────────────────────────────────── */
/**
 * Inline counterparts of the CSS roles, for components that must set type
 * through the style attribute (cover pages, SVG text, portals).
 *
 * Roles: 'title' | 'header' | 'subheader' | 'body'
 *
 * @param {'title'|'header'|'subheader'|'body'} role
 * @param {string} [profile]
 * @returns {React.CSSProperties}
 */
export function reportRoleStyle(role, profile = DEFAULT_REPORT_PROFILE) {
  const resolved = resolveReportProfile(profile);
  if (role === 'body') {
    return {
      fontFamily: REPORT_FONT_BODY,
      fontSize: resolved.body,
      letterSpacing: REPORT_TRACKING_BODY,
      lineHeight: REPORT_LEADING_BODY,
      textTransform: 'none',
    };
  }
  const sizeByRole = {
    title: resolved.title,
    header: resolved.header,
    subheader: resolved.subheader,
  };
  return {
    fontFamily: REPORT_FONT_HEADING,
    fontSize: sizeByRole[role] || resolved.subheader,
    fontWeight: 300,
    letterSpacing: REPORT_TRACKING_HEADING,
    lineHeight: REPORT_LEADING_HEADING,
    textTransform: 'uppercase',
  };
}

/* ── CSS builder ───────────────────────────────────────────────────────── */

/**
 * The shared typography stylesheet for one report root.
 *
 * Emits the profile's custom properties on the scope root, then:
 *   - the title role (.report-title) for a document title on its cover
 *   - the header role (h1, h2, .report-header) for section headings —
 *     in these reports h1 is a page's section heading, never the
 *     document title, so it stays at header scale
 *   - the subheader role (h3, h4, .report-subheader)
 *   - the body role (p, li, td, th, .report-body)
 *
 * A consumer that needs a narrower context (a print-only block, a specific
 * page frame) passes `scope` as that selector list and optionally `prefix`
 * to raise specificity to match surrounding rules.
 *
 * @param {Object} options
 * @param {string} options.scope   Root selector, e.g. '.rp22-report'
 * @param {string} [options.profile]
 * @param {string} [options.prefix] Optional selector prefix (e.g. 'body.printing ')
 * @param {boolean} [options.includeBodyRole] Set false on a screen-only
 *   preview that keeps its own screen-adapted body sizes but still shares
 *   the families, custom properties and heading roles.
 * @returns {string} CSS text
 */
export function buildReportTypographyCss({
  scope,
  profile = DEFAULT_REPORT_PROFILE,
  prefix = '',
  includeBodyRole = true,
} = {}) {
  const root = `${prefix}${scope}`;
  const vars = reportTypographyVars(profile);

  const varBlock = Object.entries(vars)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  const headingBase = [
    'font-family: var(--report-font-heading) !important;',
    'font-weight: 300;',
    'letter-spacing: var(--report-heading-tracking);',
    'line-height: var(--report-heading-leading);',
    'text-transform: uppercase;',
  ].join('\n    ');

  const bodyBase = [
    'font-family: var(--report-font-body);',
    'letter-spacing: var(--report-body-tracking);',
    'line-height: var(--report-body-leading);',
  ].join('\n    ');

  const bodyRoleBlock = includeBodyRole
    ? `
${root} p,
${root} li,
${root} td,
${root} th,
${root} .report-body {
  ${bodyBase}
  font-size: var(--report-body-size);
  text-transform: none;
}
`
    : '';

  return `
/* ── Shared report typography — generated by reportTypography.js ── */
${root} {
${varBlock}
  font-family: var(--report-font-body);
}

${root} .report-title {
  ${headingBase}
  font-size: var(--report-title-size);
}

${root} h1,
${root} h2,
${root} .report-header {
  ${headingBase}
  font-size: var(--report-header-size);
}

${root} h3,
${root} h4,
${root} .report-subheader {
  ${headingBase}
  font-size: var(--report-subheader-size);
}
${bodyRoleBlock}`.trim();
}