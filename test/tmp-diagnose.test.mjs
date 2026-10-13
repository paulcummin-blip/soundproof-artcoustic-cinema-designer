import { test } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ProposalPackDocument from '../src/components/proposal/print/ProposalPackDocument.jsx';
import { GENESIS_ASSETS, genesisPackProps } from './fixtures/genesisProposalFixture.mjs';

test('diagnostic', () => {
  const html = renderToStaticMarkup(React.createElement(ProposalPackDocument, genesisPackProps()));
  // Page inventory at frame level
  const frames = [...html.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1].split(' ').filter((c) => c.startsWith('pp-page')).join(' '));
  console.log('FRAMES:', JSON.stringify(frames, null, 0));
  const comps = [...html.matchAll(/data-editorial-composition="([^"]*)"/g)].map((m) => m[1]);
  console.log('COMPOSITIONS:', JSON.stringify(comps));
  console.log('PILLARS:', (html.match(/pp-pillars__title/g) || []).length, 'pillar groups:', (html.match(/data-editorial-block="pillar"/g) || []).length);
  const app = html.indexOf('Appendix');
  console.log('APPENDIX INDEX:', app, 'ENDNOTE:', html.includes('pp-endnote'), 'ROWS:', (html.match(/data-row-key=/g) || []).length);
  GENESIS_ASSETS.filter((a) => a.comparison_enabled).forEach((asset) => {
    const idx = [];
    let from = 0;
    for (;;) {
      const at = html.indexOf(asset.file_url, from);
      if (at === -1) break;
      idx.push(at);
      from = at + 1;
    }
    console.log(`ASSET ${asset.comparison_option_label}: ${idx.length} occurrences`);
    idx.forEach((at) => console.log('   ctx:', html.slice(Math.max(0, at - 220), at + 60).replace(/\s+/g, ' ')));
  });
});