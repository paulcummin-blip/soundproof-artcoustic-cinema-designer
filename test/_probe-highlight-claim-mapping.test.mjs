/**
 * TEMPORARY STAGE-1 PROBE — ADI highlight → allowed-claim mapping.
 * Prints, for each selected highlight, its identity, evidence, scope and whether
 * the frozen-evidence strength authority mints a claim for it. No assertions.
 * Deleted once the mapping is confirmed.
 */
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { selectAdiHighlights } from '../src/components/report/projectReport/adiDesignHighlights.js';
import { buildProposalStrengthStories } from '../base44/shared/proposalEvidence/proposalStrengthStories.js';
import { selectStrengthStoriesFromReportEvidence } from '../base44/shared/strengthEvidenceContext.js';

const read = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../src/test/fixtures/${name}`, import.meta.url)), 'utf8'));

/** The stored row's terminal state, from its own recorded publication (read-only). */
function withRecordedState(evidence, publication) {
  const authority = publication?.engineeringSummary?.parameterAuthority || {};
  const next = JSON.parse(JSON.stringify(evidence));
  const stamp = (row) => {
    const entry = authority[`p${Number(row?.parameter_id)}`];
    if (!entry) return;
    row.state = entry.state ?? null;
    for (const seat of (Array.isArray(row.supporting_per_seat) ? row.supporting_per_seat : [])) {
      const seatId = String(seat?.seat_id ?? seat?.seatId ?? '');
      seat.state = entry.seats?.[seatId]?.state ?? row.state;
    }
  };
  (next.parameters || []).forEach(stamp);
  Object.values(next.parameter_index || {}).forEach(stamp);
  return next;
}

const GENESIS_PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'Q6-3 × 2, C4-1 × 2' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'Evolve 2-1 × 6' },
    { key: 'overheads', area: 'Overheads', value: 'Architect 2-1 × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB3-12 × 2 (front), SUB3-12 × 2 (rear)' },
    { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'Artcoustic Abfuser × 6' },
  ],
};
const MARQUEE_PRODUCTS = {
  rows: [
    { key: 'lcr', area: 'LCR', value: 'Q8-5 × 3' },
    { key: 'surrounds', area: 'Surrounds / wides', value: 'Q6-3 × 6' },
    { key: 'overheads', area: 'Overheads', value: 'Spitfire Cloud × 6' },
    { key: 'subwoofers', area: 'Subwoofers', value: 'SUB4-12 × 2 (front), SUB4-12 × 2 (rear)' },
    { key: 'acoustic_treatment', area: 'Acoustic treatment', value: 'Artcoustic Abfuser × 8' },
  ],
};

const CASES = [
  {
    name: 'GENESIS',
    publication: read('genesisAdiEvidence.json'),
    evidence: read('genesisReportEvidence.json'),
    products: GENESIS_PRODUCTS,
    roomDims: { widthM: 4.64, lengthM: 5.09, heightM: 2.4 },
    displayType: 'tv',
  },
  {
    name: 'MARQUEE',
    publication: read('marqueeLiveAdiEvidence.json'),
    evidence: read('marqueeReportEvidence.json'),
    products: MARQUEE_PRODUCTS,
    roomDims: { widthM: 5.42, lengthM: 5.25, heightM: 2.4 },
    displayType: 'projector_screen',
  },
];

for (const testCase of CASES) {
  test(`MAP ${testCase.name}`, () => {
    const { name, publication, evidence, products, roomDims, displayType } = testCase;
    const frozen = withRecordedState(evidence, publication);
    const selection = selectAdiHighlights({
      engineeringSummary: publication.engineeringSummary,
      productsSelected: products,
      seatingPositions: publication.seatingPositions,
      roomDims,
      dolbyConfig: publication.project?.dolby_config || '9.1.6',
      displayType,
    });
    const stories = buildProposalStrengthStories(frozen);
    const fromEvidence = selectStrengthStoriesFromReportEvidence(frozen);
    const byId = new Map(stories.strength_stories.map((story) => [story.story_id, story]));

    console.log(`\n===== ${name} =====`);
    console.log(`frozen evidence keys: ${Object.keys(frozen).join(', ')}`);
    console.log(`identity: ${JSON.stringify(frozen.identity || null)}`);
    console.log(`room.dimensions: ${JSON.stringify(frozen.room?.dimensions ?? null)}`);
    console.log(`evidence.seating: ${JSON.stringify(frozen.seating ?? null).slice(0, 260)}`);
    console.log(`evidence.screen: ${JSON.stringify(frozen.screen ?? null).slice(0, 160)}`);
    console.log(`publication seatingPositions: ${Array.isArray(publication.seatingPositions) ? publication.seatingPositions.length : 'none'}`);
    console.log(`publication engineeringSummary keys: ${Object.keys(publication.engineeringSummary || {}).join(', ')}`);
    console.log(`evidence-path sources: seatingPositions=${JSON.stringify(fromEvidence.sources.seatingPositions)} roomDims=${JSON.stringify(fromEvidence.sources.roomDims ?? null)}`);
    console.log(`report-path ranked ids: ${selection.highlights.map((h) => h.id).join(', ')}`);
    console.log(`evidence-path ranked ids: ${fromEvidence.ranked.map((s) => s.id).join(', ')}`);
    console.log(`pack strength_stories: ${stories.strength_stories.map((s) => `${s.rank}:${s.story_id}[${s.level}/${s.scope}]`).join('  ')}`);
    console.log(`pack omitted: ${(stories.omitted_stories || []).map((s) => s.story_id).join(', ') || 'none'}`);

    selection.highlights.forEach((highlight, index) => {
      const story = byId.get(highlight.id);
      console.log(`--- ${index + 1}. id=${highlight.id}  "${highlight.title}"  [${highlight.category}]  level=${highlight.level}  weight=${highlight.weight}  scope=${highlight.scope}`);
      console.log(`    pills: ${(highlight.evidence || []).map((line) => `${line.key}${line.level ? ` ${line.level}` : ''}${line.value ? ` — ${line.value}` : ''}`).join(' | ') || 'none'}`);
      console.log(`    sources: ${JSON.stringify(highlight.sources || [])}`);
      console.log(`    pack claim: ${story ? `claim_story_${highlight.id}_01  (story level=${story.level}, scope=${story.scope}, params=${JSON.stringify(story.evidence_parameter_ids)})` : 'MISSING — no story for this id in the pack'}`);
      console.log(`    copy: ${highlight.explanation}`);
    });
  });
}