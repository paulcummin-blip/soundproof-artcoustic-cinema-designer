import { test } from 'vitest';
import {
  HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE,
  HIGH_CHANNEL_PREFERRED_SENTENCE,
  isSpacingSentence,
  mentionsHighChannelCopyDefect,
  mentionsHighChannelUpgrade,
  mentionsProcessorCostClaim,
  mentionsRoomGeometryConstraintClaim,
  plainText,
  stripHighChannelUpgradeCopy,
} from '../src/components/proposal/highChannelLayoutAuthority.js';
import { HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE as SHARED_LEGACY } from '../base44/shared/highChannelDensityRule.js';

test('diag', () => {
  const body = `<p>${HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE}</p>`;
  const out = {
    sameConstant: HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE === SHARED_LEGACY,
    plain: plainText(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE).slice(0, 80),
    claims: {
      upgrade: mentionsHighChannelUpgrade(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE),
      geometry: mentionsRoomGeometryConstraintClaim(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE),
      processor: mentionsProcessorCostClaim(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE),
      defect: mentionsHighChannelCopyDefect(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE),
      spacing: isSpacingSentence(HIGH_CHANNEL_LEGACY_CONSTRAINT_SENTENCE),
    },
    cleaned: stripHighChannelUpgradeCopy(body),
    preferred: HIGH_CHANNEL_PREFERRED_SENTENCE.slice(0, 60),
  };
  console.log('DIAG ' + JSON.stringify(out, null, 2));
  if (!out.claims.geometry) throw new Error('detector false: ' + JSON.stringify(out, null, 2));
});