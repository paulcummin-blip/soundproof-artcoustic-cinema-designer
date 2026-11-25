import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { planProposalImages, composeSectionSlots } from '../src/components/proposal/images/proposalImagePlanner.js';
import ProposalPackDocument from '../src/components/proposal/print/ProposalPackDocument.jsx';

const types = ['cover', 'system_design_summary', 'spatial_resolution', 'dynamic_range', 'timbre_matching', 'key_performance_highlights', 'overall_design', 'room_images'];
const sections = types.map((section_type, i) => ({ id: 's-' + section_type, section_type, is_enabled: true, order_index: i, title: section_type, body: '<p>Saved narrative remains unchanged.</p>' }));
const assets = [
  { id: 'cover', file_url: 'https://example.test/cover.png', usage: 'cover', image_presentation: 'full_width' },
  { id: 'room', file_url: 'https://example.test/room.png', usage: 'gallery', image_presentation: 'full_width' },
  ...['plan', 'elevation'].map(id => ({ id, file_url: 'https://example.test/' + id + '.png', usage: 'gallery', image_presentation: 'detail', image_purpose: 'layout_drawing', section_target: 'system_design_summary' })),
];
const plan = (images = assets) => planProposalImages({ assets: images, sectionSlots: composeSectionSlots({ sections, sectionTypes: types }), coverAssetId: 'cover' });

test('both explicit drawings remain with the same target, once each, without changing sources', () => {
  const before = JSON.stringify(assets);
  const result = plan();
  assert.deepEqual(result.detailImagesAwaitingTarget, []);
  for (const id of ['plan', 'elevation']) {
    const matches = result.placements.filter(p => p.source_asset_id === id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].section_id, 's-system_design_summary');
    assert.equal(matches[0].crop_allowed, false);
  }
  assert.equal(JSON.stringify(assets), before);
});

test('a missing target is still withheld rather than assigned arbitrarily', () => {
  const result = plan([...assets, { id: 'unassigned', file_url: 'https://example.test/unassigned.png', image_presentation: 'detail' }]);
  assert.deepEqual(result.detailImagesAwaitingTarget, ['unassigned']);
});

test('the actual print component contains both drawings once within their target section', () => {
  const html = renderToStaticMarkup(React.createElement(ProposalPackDocument, {
    proposal: { proposal_type: 'system_summary', created_date: '2026-11-25' },
    projectName: 'Fixture cinema', sections, projectImages: assets, coverImageUrl: assets[0].file_url,
  }));
  for (const id of ['plan', 'elevation']) {
    assert.equal(html.split('src="https://example.test/' + id + '.png"').length - 1, 1);
  }
  const start = html.indexOf('data-editorial-section="system_design_summary"');
  const end = html.indexOf('data-editorial-section="spatial_resolution"', start);
  const summary = html.slice(start, end);
  assert.ok(summary.includes('src="https://example.test/plan.png"'));
  assert.ok(summary.includes('src="https://example.test/elevation.png"'));
  assert.ok(summary.includes('data-editorial-composition="continuing"'));
  assert.ok(summary.includes('data-crops="no"'));
});
