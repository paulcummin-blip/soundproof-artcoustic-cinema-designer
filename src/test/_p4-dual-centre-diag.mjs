// TEMPORARY DIAGNOSTIC — dual-mono centre P4. Delete after the fix.
import { test } from 'vitest';
import { computeAllSeatSplMetrics, getSeatSplMetrics } from '../components/utils/spl/centralSplEngine.jsx';
import { p4ScreenChannelDeltaDb } from '../components/utils/rp22/p4ScreenChannelAuthority.js';
import { getSpeakerVisibilityFor } from '../components/AppStateProvider.jsx';
import { resolveSpeakerSplMeta } from '../components/utils/spl/speakerSplMeta.js';
import { getSpeakerModelMeta } from '../components/models/speakers/registry.jsx';

const spk = (role, model, x, y) => ({ id: `${role}-1`, role, model, position: { x, y, z: 1.2 } });

const SPEAKERS = [
  spk('FL', 'Q8-5', 0.6, 0.2),
  spk('FR', 'Q8-5', 4.0, 0.2),
  spk('FCL', 'Q8-5', 2.0, 0.15),
  spk('FCR', 'Q8-5', 2.6, 0.15),
  spk('SL', 'Q6-3', 0.2, 2.4), spk('SR', 'Q6-3', 4.4, 2.4),
  spk('SBL', 'Q6-3', 0.4, 5.4), spk('SBR', 'Q6-3', 4.2, 5.4),
  spk('LW', 'Q6-3', 0.2, 0.9), spk('RW', 'Q6-3', 4.4, 0.9),
  spk('TFL', 'Spitfire Cloud', 1.2, 1.4), spk('TFR', 'Spitfire Cloud', 3.4, 1.4),
  spk('TML', 'Spitfire Cloud', 1.2, 3.0), spk('TMR', 'Spitfire Cloud', 3.4, 3.0),
  spk('TRL', 'Spitfire Cloud', 1.2, 4.6), spk('TRR', 'Spitfire Cloud', 3.4, 4.6),
];

const SEATS = [
  { id: 'seat-r1-c1', x: 1.2, y: 3.4 }, { id: 'seat-r1-c2', x: 2.2, y: 3.4 },
  { id: 'seat-r1-c3', x: 3.2, y: 3.4 }, { id: 'seat-r1-c4', x: 4.0, y: 3.4 },
  { id: 'seat-r2-c1', x: 0.8, y: 4.8 }, { id: 'seat-r2-c2', x: 1.9, y: 4.8 },
  { id: 'seat-r2-c3', x: 2.9, y: 4.8 }, { id: 'seat-r2-c4', x: 4.0, y: 4.8 },
];

// Mirrors useAllSeatSplMetrics' own canonical-role map (FCL/FCR pass through unmapped).
const getCanonicalRole = (role) => {
  const map = { SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW',
    FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR',
    TFL: 'TFL', TFR: 'TFR', TL: 'TL', TML: 'TL', TR: 'TR', TMR: 'TR', TBL: 'TBL', TBR: 'TBR' };
  return map[String(role || '').toUpperCase()] || String(role || '').toUpperCase();
};

const run = (speakers) => computeAllSeatSplMetrics({
  seats: SEATS,
  placedSpeakers: speakers,
  getCanonicalRole,
  getEffectiveSplInputs: () => ({ powerW: 100 }),
  getModelDimsM: (model) => resolveSpeakerSplMeta(model, getSpeakerModelMeta),
  screenLoss_dB: 0,
  eqHeadroom_dB: 0,
  mlpPoint: { x: 2.5, y: 3.4 },
  heightM: 2.6, widthM: 4.6, lengthM: 5.6,
});

test('DIAG — where does the logical FC disappear?', () => {
  const visible = getSpeakerVisibilityFor('9.1.6', 'rears');
  console.log('visible roles:', [...visible].join(', '));
  console.log('FCL visible by layout rule:', visible.has('FCL'), '| FCR:', visible.has('FCR'));

  const filtered = SPEAKERS.filter((s) => {
    const canon = getCanonicalRole(s.role);
    if (canon === 'LFE') return false;
    if (['SL', 'SR', 'SBL', 'SBR', 'LW', 'RW'].includes(canon)) return visible.has(canon);
    return visible.has(canon);
  });
  console.log('analysisSpeakers roles:', filtered.map((s) => s.role).join(', '));

  const full = run(SPEAKERS);
  const filteredMap = run(filtered);

  for (const [label, map] of [['ALL SPEAKERS', full], ['AFTER VISIBILITY FILTER', filteredMap]]) {
    const mlp = getSeatSplMetrics(map, 'mlp');
    const screen = mlp?.spl?.screen || {};
    console.log(`\n── ${label}`);
    console.log('screen keys:', Object.keys(screen).join(', '));
    console.log('screen values:', Object.fromEntries(Object.entries(screen).map(([k, v]) => [k, v?.value?.toFixed?.(1)])));
    console.log('P4 mlp:', p4ScreenChannelDeltaDb(screen));
    for (const s of SEATS) {
      console.log('  P4', s.id, p4ScreenChannelDeltaDb(getSeatSplMetrics(map, s.id)?.spl?.screen));
    }
  }
});