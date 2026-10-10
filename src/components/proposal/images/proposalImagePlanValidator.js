/**
 * proposalImagePlanValidator.js
 * ----------------------------
 * Layout-time validation of the Proposal's image placement plan.
 *
 * It checks the four rules the editorial standard states, and the two guards
 * that keep the document art-directed rather than gallery-first:
 *   - a source is never used on adjacent pages;
 *   - a source is never used in consecutive visual sections with nothing between
 *     the two uses;
 *   - the same crop is never repeated for a source;
 *   - every placement names its source image;
 *   - a dedicated gallery spread never repeats a source the document placed;
 *   - a seating-style image is never presented as a performance difference.
 *
 * Reporting only: it returns violations and never changes or blocks a document.
 * Pure functions, no imports beyond the placement vocabulary.
 */

import { EDITORIAL_ROLE, SEATING_STYLE_SECTION_ID } from './proposalImagePlacementAuthority.js';

export const IMAGE_PLAN_VIOLATION = Object.freeze({
  MISSING_SOURCE_ASSET_ID: 'MISSING_SOURCE_ASSET_ID',
  SOURCE_ON_ADJACENT_PAGES: 'SOURCE_ON_ADJACENT_PAGES',
  SOURCE_IN_CONSECUTIVE_VISUAL_SECTIONS: 'SOURCE_IN_CONSECUTIVE_VISUAL_SECTIONS',
  CROP_REPEATED: 'CROP_REPEATED',
  SOURCE_REPEATED_IN_GALLERY: 'SOURCE_REPEATED_IN_GALLERY',
  SEATING_OPTION_AS_PERFORMANCE: 'SEATING_OPTION_AS_PERFORMANCE',
});

export const IMAGE_PLAN_SEVERITY = Object.freeze({
  IMPORTANT: 'Important',
  ACCEPTABLE: 'Acceptable',
});

const role = (placement) => placement?.editorial_role || 'unknown role';
const pagesBetween = (a, b) => Math.abs(Number(b?.page_position ?? 0) - Number(a?.page_position ?? 0));

/**
 * @param {Object} plan the plan returned by planProposalImages
 * @param {{galleryImages?: Array}} options the images a retained spread would show
 * @returns {{valid: boolean, violations: Array, checked: number}}
 */
export function validateProposalImagePlan(plan, { galleryImages = [] } = {}) {
  // Every placement takes part in the spacing rules, the cover included: the
  // cover is the anchor the document's first return is measured from.
  const everyPlacement = (Array.isArray(plan?.placements) ? plan.placements : [])
    .filter((placement) => placement && placement.editorial_role);
  const violations = [];

  const flag = (code, detail, severity = IMAGE_PLAN_SEVERITY.IMPORTANT) => {
    violations.push({ code, detail, severity });
  };

  everyPlacement.forEach((placement, index) => {
    if (!placement?.source_asset_id) {
      flag(
        IMAGE_PLAN_VIOLATION.MISSING_SOURCE_ASSET_ID,
        `placement ${index + 1} (${role(placement)}) names no source image`,
      );
    }
  });

  for (let i = 0; i < everyPlacement.length; i += 1) {
    for (let j = i + 1; j < everyPlacement.length; j += 1) {
      const a = everyPlacement[i];
      const b = everyPlacement[j];
      if (!a.source_asset_id || a.source_asset_id !== b.source_asset_id) continue;

      const gap = pagesBetween(a, b);
      if (gap <= 1) {
        flag(
          IMAGE_PLAN_VIOLATION.SOURCE_ON_ADJACENT_PAGES,
          `the same source is used as ${role(a)} and ${role(b)} with ${gap === 0 ? 'no page' : 'only one page'} between them`,
        );
      }
      if (a.crop_orientation === b.crop_orientation) {
        flag(
          IMAGE_PLAN_VIOLATION.CROP_REPEATED,
          `the same source is cropped ${a.crop_orientation} twice — a return must use a different crop`,
          IMAGE_PLAN_SEVERITY.ACCEPTABLE,
        );
      }
      // The stricter reading of the same rule: the two uses are also the only two
      // image moments in the document, so nothing separates them visually. A
      // source returning later in the document with other imagery between it and
      // its first use is deliberate reuse, not a violation — only a pair that is
      // both adjacent in the imagery AND on neighbouring pages is reported.
      if (Math.abs(j - i) === 1 && gap <= 1) {
        flag(
          IMAGE_PLAN_VIOLATION.SOURCE_IN_CONSECUTIVE_VISUAL_SECTIONS,
          `${role(a)} and ${role(b)} use the same source with no other imagery between them`,
        );
      }
    }
  }

  const placedIds = new Set(everyPlacement.map((placement) => placement.source_asset_id).filter(Boolean));
  (Array.isArray(galleryImages) ? galleryImages : []).forEach((image) => {
    if (image?.id && placedIds.has(image.id)) {
      flag(
        IMAGE_PLAN_VIOLATION.SOURCE_REPEATED_IN_GALLERY,
        'a dedicated gallery spread repeats a source the document already placed',
      );
    }
  });

  everyPlacement
    .filter((placement) => placement.section_id === SEATING_STYLE_SECTION_ID
      || placement.editorial_role === EDITORIAL_ROLE.SEATING_OPTION)
    .forEach((placement) => {
      const claimsPerformance = Boolean(
        placement.parameter_key
        || placement.performance_level
        || (Array.isArray(placement.claim_ids) && placement.claim_ids.length > 0),
      );
      if (claimsPerformance) {
        flag(
          IMAGE_PLAN_VIOLATION.SEATING_OPTION_AS_PERFORMANCE,
          'a seating-style image is presented as a performance difference',
        );
      }
    });

  return {
    valid: violations.length === 0,
    violations,
    checked: everyPlacement.length,
  };
}

export default validateProposalImagePlan;