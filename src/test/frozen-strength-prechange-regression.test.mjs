import { test } from 'vitest';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as currentImportance from '../../shared/strengthImportance.js';
import * as currentStories from '../../shared/strengthStories.js';
import {
  buildStrengthSourcesFromReportEvidence, evidenceProductsSelected,
} from '../../shared/strengthEvidenceContext.js';
import { buildSpecificationConnections } from '../components/report/projectReport/adiDesignHighlights.js';

// Read-only historical execution: no checkout, writes, SDK or database access.
// c298d61a is the direct parent of the context/state implementation commit.
const revision = 'c298d61a';
const root = fileURLToPath(new URL('../../', import.meta.url));
const gitRead = file => execFileSync('git', ['show', `${revision}:${file}`], { cwd: root, encoding: 'utf8' });
const urls = new Map();
function historicalModuleUrl(file) {
  if (urls.has(file)) return urls.get(file);
  assert.ok(file.startsWith('base44/shared/'), `historical dependency must remain pure: ${file}`);
  const source = gitRead(file).replace(/from\s+(['"])(\.\/[^'"]+)\1/g, (_, quote, relative) => {
    const dependency = path.posix.join(path.posix.dirname(file), relative);
    return `from ${quote}${historicalModuleUrl(dependency)}${quote}`;
  });
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  urls.set(file, url);
  return url;
}
const oldImportance = await import(/* @vite-ignore */ historicalModuleUrl('base44/shared/strengthImportance.js'));
const oldStories = await import(/* @vite-ignore */ historicalModuleUrl('base44/shared/strengthStories.js'));
const read = name => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
const cases = [
  { name: 'Genesis', publication: 'genesisAdiEvidence.json', evidence: 'genesisReportEvidence.json', fingerprint: 'eng:v1:c3bc6139a955a04f' },
  { name: 'Marquee', publication: 'marqueeLiveAdiEvidence.json', evidence: 'marqueeReportEvidence.json', fingerprint: 'eng:v1:bcd7564a7c3136f8' },
];
const shape = stories => stories.map(story => ({
  id: story.id, order: story.order, level: story.level, scope: story.scope,
  evidence_ids: story.sources,
  lines: (story.evidence || []).map(line => ({ id: line.key, level: line.level })),
}));
function select(sources, importance, stories) {
  const evidence = importance.collectEligibleEvidence(sources.engineeringSummary);
  const floor = importance.tierFloor(importance.classifySpecTier(evidence.distribution));
  const connections = sources.connections ?? buildSpecificationConnections(sources);
  const { candidates } = stories.buildCandidates(sources, { byKey: evidence.byKey, floor, connections });
  const admission = stories.admitStrengthStories(candidates, { floor });
  const ranked = stories.rankStrengthStories(admission.admitted, importance.MAX_HIGHLIGHTS);
  const rejected = stories.auditOmittedStories({ candidates, selectedIds: ranked.map(story => story.id), floor,
    strongCount: admission.strongCount, fillFromLowerLevels: admission.fillFromLowerLevels,
    engineeringSummary: sources.engineeringSummary, productsSelected: sources.productsSelected, byKey: evidence.byKey,
  });
  return { ranked: shape(ranked), rejected, p19: evidence.byKey.p19 };
}
function copiedWithRecordedState(stored, publication) {
  const copy = structuredClone(stored);
  const authority = publication.engineeringSummary.parameterAuthority;
  const stamp = row => {
    const canonical = authority[`p${row.parameter_id}`];
    row.state = canonical?.state ?? null;
    for (const seat of row.supporting_per_seat || []) {
      seat.state = canonical?.seats?.[String(seat.seat_id ?? seat.seatId)]?.state ?? row.state;
    }
  };
  copy.parameters.forEach(stamp);
  Object.values(copy.parameter_index || {}).forEach(stamp);
  return copy;
}

// This acceptance assertion is IDENTICAL for both implementations.
function assertParity(publication, evidence) {
  assert.deepEqual(evidence.ranked, publication.ranked);
  assert.deepEqual(evidence.rejected, publication.rejected);
  assert.equal(evidence.p19.state, publication.p19.state);
  assert.equal(evidence.p19.eligible, false);
}

test('historical revision had no frozen evidence context mapper', () => {
  const files = execFileSync('git', ['ls-tree', '-r', '--name-only', revision], { cwd: root, encoding: 'utf8' });
  assert.ok(!files.split('\n').includes('base44/shared/strengthEvidenceContext.js'));
  assert.match(gitRead('base44/shared/strengthImportance.js'), /return level \? 'scored' : 'unavailable'/);
});

for (const item of cases) {
  const publication = read(item.publication);
  const stored = read(item.evidence);
  const before = JSON.stringify(stored);
  const copied = copiedWithRecordedState(stored, publication);
  const publicationSources = {
    engineeringSummary: publication.engineeringSummary,
    productsSelected: evidenceProductsSelected(stored),
    seatingPositions: publication.seatingPositions,
    dolbyConfig: publication.project?.dolby_config || stored.system.layout,
    displayType: stored.screen.display_type,
  };
  const expected = select(publicationSources, currentImportance, currentStories);
  // Historical module exposes only a summary reader, not a context adapter.
  // Baseline deliberately passes that reader output with the story builder's
  // existing defaults. It does not invent a missing historical mapper.
  const old = select({ engineeringSummary: oldImportance.summaryFromReportEvidence(copied) }, oldImportance, oldStories);
  const modern = select(buildStrengthSourcesFromReportEvidence(copied), currentImportance, currentStories);

  test(`${item.name}: pre-change failure is the known context/state regression`, () => {
    assert.equal(stored.identity.engineering_fingerprint, item.fingerprint);
    assert.equal(expected.p19.state, 'provisional');
    assert.equal(expected.p19.eligible, false);
    assert.ok(expected.ranked.some(story => story.id === 'immersive-layout'));
    assert.ok(!old.ranked.some(story => story.id === 'immersive-layout'));
    assert.equal(old.p19.state, 'scored');
    assert.equal(old.p19.eligible, true);
    const raw = oldImportance.collectEligibleEvidence(oldImportance.summaryFromReportEvidence(stored));
    assert.equal(raw.byKey.p19.state, 'scored');
    assert.equal(raw.byKey.p19.eligible, true);
    assertParity(expected, select(publicationSources, oldImportance, oldStories));
    const describe = selection => ({
      stories: selection.ranked.map(story => story.id),
      p19: { state: selection.p19.state, eligible: selection.p19.eligible },
    });
    console.log('[REGRESSION]', JSON.stringify({ name: item.name, revision, fingerprint: item.fingerprint,
      publication: describe(expected), preChange: describe(old), postChange: describe(modern),
    }));
  });

  test.fails(`${item.name}: PRE-CHANGE same parity assertion MUST fail`, () => assertParity(expected, old));
  test(`${item.name}: POST-CHANGE same parity assertion passes`, () => assertParity(expected, modern));

  test(`${item.name}: absent terminal state is ineligible post-change; fixtures stay untouched`, () => {
    const raw = currentImportance.collectEligibleEvidence(currentImportance.summaryFromReportEvidence(stored));
    assert.equal(raw.byKey.p19.state, 'unavailable');
    assert.equal(raw.byKey.p19.eligible, false);
    assert.equal(JSON.stringify(stored), before);
    assert.deepEqual(read(item.evidence), stored);
  });
}