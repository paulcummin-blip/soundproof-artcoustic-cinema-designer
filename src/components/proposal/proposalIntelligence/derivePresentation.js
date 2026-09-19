/**
 * derivePresentation.js
 * --------------------------------
 * Derive image story and audience awareness.
 *
 * Image story          = editorial intent for where project images should
 *                        support the proposal (not layout, only intent).
 * Audience awareness   = how emphasis shifts depending on the audience
 *                        (homeowner, architect, interior designer, commercial).
 *
 * Pure function. No GPT. No side effects. No invention.
 */

import { withDecisionConfidence } from './confidence';

const IMAGE_SECTIONS = [
  { section: 'cover', editorial_intent: 'Establish the room as a destination — the first impression of the space.' },
  { section: 'executive_summary', editorial_intent: 'A single image that communicates the complete system vision.' },
  { section: 'system_overview', editorial_intent: 'Product hero shots showing the key loudspeakers and subwoofers.' },
  { section: 'room_images', editorial_intent: 'Room construction and proportions — the acoustic foundation.' },
  { section: 'performance', editorial_intent: 'Visual evidence of engineering results where available.' },
  { section: 'construction', editorial_intent: 'Build quality and installation detail.' },
];

/**
 * Recommend where project images should support the proposal.
 * Only editorial intent — no layout, no positioning, no sizing.
 */
export function deriveImageStory({ engineeringAuthority, engineeringFloor }) {
  const images = engineeringAuthority?.images;
  const hasImages = images && (images.total > 0 || (images.assets && images.assets.length > 0));

  // If no images available, return intent-only recommendations
  if (!hasImages) {
    return IMAGE_SECTIONS.map((s) => ({
      section: s.section,
      editorial_intent: s.editorial_intent,
      available: false,
      ...withDecisionConfidence(engineeringFloor),
    }));
  }

  // Map available assets to sections by type
  const assetsByType = {};
  if (Array.isArray(images.assets)) {
    for (const asset of images.assets) {
      const type = asset.asset_type || asset.type || 'gallery';
      if (!assetsByType[type]) assetsByType[type] = [];
      assetsByType[type].push(asset);
    }
  }

  return IMAGE_SECTIONS.map((s) => {
    const mappedType = mapSectionToAssetType(s.section);
    const available = !!(assetsByType[mappedType] && assetsByType[mappedType].length > 0);
    return {
      section: s.section,
      editorial_intent: s.editorial_intent,
      available,
      asset_type: available ? mappedType : null,
      ...withDecisionConfidence(engineeringFloor),
    };
  });
}

function mapSectionToAssetType(section) {
  const map = {
    cover: 'cover_image',
    executive_summary: 'front_view',
    system_overview: 'gallery',
    room_images: 'plan',
    performance: 'technical_drawings',
    construction: 'construction',
  };
  return map[section] || 'gallery';
}

const AUDIENCE_PROFILES = {
  homeowner: {
    emphasis_shifts: [
      'Lead with the experience — what it feels like to watch a film in this room.',
      'Emphasise usability and family enjoyment over technical measurement.',
      'Explain engineering results in plain language — what they mean for the viewer.',
      'Acknowledge limitations honestly but frame them as practical trade-offs.',
    ],
  },
  architect: {
    emphasis_shifts: [
      'Lead with spatial integration — how the system fits the architectural vision.',
      'Emphasise coordination: speaker placement, screen wall construction, acoustic treatment.',
      'Use technical language freely — the architect understands building physics.',
      'Reference RP22 and CEDIA standards as professional benchmarks.',
    ],
  },
  interior_designer: {
    emphasis_shifts: [
      'Lead with visual integration — how the speakers and screen fit the interior scheme.',
      'Emphasise finish options, minimal visual impact, and on-wall/in-wall solutions.',
      'Explain acoustic treatment as a design element, not just a technical add-on.',
      'Minimise technical measurement detail; focus on the experiential outcome.',
    ],
  },
  commercial: {
    emphasis_shifts: [
      'Lead with ROI and durability — the system as a business investment.',
      'Emphasise compliance: RP22 levels, CEDIA standards, and warranty coverage.',
      'Reference scalability and future-proofing for multi-phase projects.',
      'Use formal, business-focused language throughout.',
    ],
  },
};

/**
 * Derive audience awareness — how the proposal emphasis should shift
 * depending on the audience. The engineering remains identical; only
 * emphasis changes.
 */
export function deriveAudienceAwareness({ engineeringAuthority, engineeringFloor }) {
  const audience = engineeringAuthority?.metadata?.audience || 'homeowner';
  const profile = AUDIENCE_PROFILES[audience] || AUDIENCE_PROFILES.homeowner;

  return {
    audience,
    emphasis_shifts: profile.emphasis_shifts,
    ...withDecisionConfidence(engineeringFloor),
  };
}