import { it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import ProposalPackDocument from '../components/proposal/print/ProposalPackDocument.jsx';
import { planProposalImages, composeSectionSlots } from '../components/proposal/images/proposalImagePlanner.js';
import { genesisPackProps, genesisSections, GENESIS_ASSETS } from '../../test/fixtures/genesisProposalFixture.mjs';

const URLS = {
  cover: GENESIS_ASSETS.find((a) => a.slot === 'cover').file_url,
  one: GENESIS_ASSETS.find((a) => a.slot === 'image_1').file_url,
  two: GENESIS_ASSETS.find((a) => a.slot === 'image_2').file_url,
  three: GENESIS_ASSETS.find((a) => a.slot === 'image_3').file_url,
};

const ASSETS = [
  { ...GENESIS_ASSETS[0], id: 'a-cover', image_presentation: 'full_width', image_purpose: 'whole_room' },
  { ...GENESIS_ASSETS[1], id: 'a-one', slot: 'image_1', image_presentation: 'full_width', image_purpose: 'whole_room', comparison_enabled: false, comparison_group: null },
  { ...GENESIS_ASSETS[2], id: 'a-two', slot: 'image_2', image_presentation: 'full_width', image_purpose: 'whole_room', comparison_enabled: false, comparison_group: null },
  { ...GENESIS_ASSETS[3], id: 'a-three', slot: 'image_3', image_presentation: 'detail', image_purpose: 'layout_drawing', comparison_enabled: false, comparison_group: null },
];

it('probe: where each presented image lands', () => {
  const sections = genesisSections();
  const props = genesisPackProps();
  const sectionTypes = sections.map((s) => s.section_type);

  const plan = planProposalImages({
    assets: ASSETS,
    sectionSlots: composeSectionSlots({ sections, sectionTypes }),
    coverAssetId: 'a-cover',
  });

  const typeById = new Map(sections.map((s) => [s.id, s.section_type]));
  const report = plan.placements.map((p) => ({
    asset: p.source_asset_id,
    role: p.editorial_role,
    section: typeById.get(p.section_id) || p.section_id,
    presentation: p.image_presentation,
    purpose: p.image_purpose,
    protectedDrawing: p.crop_protected,
  }));

  const html = renderToStaticMarkup(React.createElement(ProposalPackDocument, {
    ...props,
    sections,
    projectImages: ASSETS,
    coverImageUrl: URLS.cover,
  }));

  const where = Object.entries(URLS).map(([key, url]) => {
    const index = html.indexOf(url);
    if (index < 0) return { key, placed: false };
    const before = html.slice(Math.max(0, index - 6000), index);
    const sectionMatches = [...before.matchAll(/data-editorial-section="([a-z_]+)"/g)];
    const pageMatches = [...before.matchAll(/class="[^"]*pp-page--([a-z_]+)/g)];
    const rowAt = before.lastIndexOf('pp-media-row');
    const closeFigureAt = before.lastIndexOf('</figure>');
    return {
      key,
      placed: true,
      role: /pp-media--(\w+)/.exec(html.slice(index - 400, index))?.[1] || null,
      presentationClass: [...html.slice(index - 300, index).matchAll(/pp-media--presentation-(\w+)/g)].map((m) => m[1]).pop() || null,
      inMediaRow: rowAt > closeFigureAt,
      section: sectionMatches.length ? sectionMatches[sectionMatches.length - 1][1] : null,
      page: pageMatches.length ? pageMatches[pageMatches.length - 1][1] : null,
    };
  });

  console.log('PLAN', JSON.stringify(report, null, 1));
  console.log('WHERE', JSON.stringify(where, null, 1));
  expect(true).toBe(true);
});