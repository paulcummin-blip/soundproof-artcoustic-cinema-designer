/**
 * DUAL-MONO CENTRE — P4 ACCEPTANCE HARNESS
 *
 * Runs the REAL production chain against the REAL Genesis design:
 *   layout visibility (AppStateProvider.getSpeakerVisibilityFor + the centre
 *   cabinet branch) → analysis speaker list → centralSplEngine → the seat
 *   `screen` SPL category → P4 input authority → existing RP22 grading.
 *
 * NO calculations, thresholds or grading are re-implemented here: every number
 * below comes from the shipping modules.
 */
import { describe, it, expect } from 'vitest';

import { computeAllSeatSplMetrics } from '@/components/utils/spl/centralSplEngine';
import { p4ScreenChannelDeltaDb, p4ChannelSplDb } from '@/components/utils/rp22/p4ScreenChannelAuthority';
import { rp22LevelForP4 } from '@/components/utils/seatMetrics';
import { getSpeakerVisibilityFor } from '@/components/AppStateProvider';
import { isCentreCabinetRole } from '@/components/utils/frontStageModeAuthority';
import { resolveSpeakerSplMeta } from '@/components/utils/spl/speakerSplMeta';
import { getSpeakerModelMeta } from '@/components/models/speakers/registry';

import {
  GENESIS_ROOM,
  GENESIS_SPL,
  GENESIS_SPEAKERS,
  GENESIS_SEATS,
  GENESIS_RSP,
  GENESIS_P4_PUBLISHED,
} from './fixtures/genesisDualCentre.mjs';

/* ------------------------------------------------------------------ *
 * Production mirrors (lookup tables only — no engineering logic)      *
 * ------------------------------------------------------------------ */

// The exact canonical map useAllSeatSplMetrics passes into the engine.
const CANON = {
  SL: 'SL', LS: 'SL', SR: 'SR', RS: 'SR', SBL: 'SBL', SBR: 'SBR', LW: 'LW', RW: 'RW',
  FL: 'FL', L: 'FL', FC: 'FC', C: 'FC', FR: 'FR', R: 'FR',
  TFL: 'TFL', TFR: 'TFR', TL: 'TL', TML: 'TL', TR: 'TR', TMR: 'TR', TBL: 'TBL', TBR: 'TBR',
};
const canon = (role) => CANON[String(role || '').toUpperCase()] || String(role || '').toUpperCase();

// AppStateProvider.getEffectiveSplInputs for THIS project (all groups 100 W,
// half-space). Same shape the engine consumes.
const getEffectiveSplInputs = () => ({
  powerW: GENESIS_SPL.lcrW,
  eqHeadroomDb: GENESIS_SPL.globalEqHeadroomDb,
  radiationMode: GENESIS_SPL.radiationMode,
});

const getModelDimsM = (model) => resolveSpeakerSplMeta(model, getSpeakerModelMeta);

/** The 9.1.6 layout's visible roles, exactly as AppStateProvider resolves them. */
const VISIBLE_ROLES = getSpeakerVisibilityFor('9.1.6', 'rears');

/**
 * AppStateProvider.getSpeakerVisibility, faithfully mirrored for the roles in
 * this design: FCL/FCR are physical cabinets of the ONE logical FC channel and
 * stay in the analysis input; everything else defers to layout visibility.
 */
export function isVisibleByLayout(role) {
  const c = canon(role);
  if (isCentreCabinetRole(c)) return VISIBLE_ROLES.has('FC');
  if (c.startsWith('LFE')) return false;
  return VISIBLE_ROLES.has(c);
}

/** useAnalysisSpeakers: finite position + a real model + layout visibility. */
export function analysisSpeakers(speakers) {
  return (speakers || []).filter((s) => {
    const p = s?.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    const m = String(s?.model ?? '').trim().toLowerCase();
    if (!m || m === 'off' || m === 'none') return false;
    return isVisibleByLayout(s.role);
  });
}

function metricsFor(speakers, seats, rsp) {
  return computeAllSeatSplMetrics({
    seats,
    placedSpeakers: analysisSpeakers(speakers),
    getCanonicalRole: canon,
    getEffectiveSplInputs,
    getModelDimsM,
    screenLoss_dB: 0,
    eqHeadroom_dB: 0,
    mlpPoint: rsp,
    heightM: GENESIS_ROOM.heightM,
    widthM: GENESIS_ROOM.widthM,
    lengthM: GENESIS_ROOM.lengthM,
  });
}

const screenOf = (metrics, seatId) => metrics.get(seatId)?.spl?.screen || null;

/** The shipping P4 metric — the single authority under test. */
const p4 = (screen) => p4ScreenChannelDeltaDb(screen);

/** The effective (allowance-bearing) channel SPL the panel and P12 state. */
const effective = (entry) => {
  const v = Number(entry?.value);
  return Number.isFinite(v) ? v : null;
};

/** Independent cross-check: spread of the effective logical channel SPLs. */
function effectiveSpread(screen) {
  const spls = ['FL', 'FC', 'FR'].map((r) => effective(screen?.[r])).filter(Number.isFinite);
  if (spls.length < 2) return null;
  return Math.max(...spls) - Math.min(...spls);
}

const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : '—');

/* ------------------------------------------------------------------ *
 * Evidence dump — the before/after picture                            *
 * ------------------------------------------------------------------ */

describe('dual-mono centre: live evidence', () => {
  it('dumps the Genesis screen-channel and P4 tables', () => {
    const filtered = analysisSpeakers(GENESIS_SPEAKERS);
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const rspScreen = screenOf(metrics, 'mlp');

    console.log('\n--- ANALYSIS SPEAKER ROLES (after visibility filter) ---');
    console.log(filtered.map((s) => s.role).join(', '));
    console.log('FCL present:', filtered.some((s) => s.role === 'FCL'),
      '| FCR present:', filtered.some((s) => s.role === 'FCR'));

    console.log('\n--- RSP (mlp) LOGICAL SCREEN CHANNELS ---');
    console.log('screen keys:', Object.keys(rspScreen || {}).join(', '));
    ['FL', 'FC', 'FR'].forEach((r) => {
      const e = rspScreen?.[r];
      console.log(`  ${r}: effective=${fmt(e?.value)}  ownPropagation=${fmt(e?.splBeforeArrangementAllowanceDb)}`);
    });
    console.log('RSP P4 (authority):', fmt(p4(rspScreen)), 'dB →', rp22LevelForP4(p4(rspScreen)));
    console.log('RSP raw spread:', effectiveSpread(rspScreen).toFixed(4), 'dB | before fix (pre-allowance):',
      (() => {
        const s = ['FL', 'FC', 'FR']
          .map((r) => Number(rspScreen?.[r]?.splBeforeArrangementAllowanceDb))
          .filter(Number.isFinite);
        return (Math.max(...s) - Math.min(...s)).toFixed(4);
      })(), 'dB →', (() => {
        const s = ['FL', 'FC', 'FR']
          .map((r) => Number(rspScreen?.[r]?.splBeforeArrangementAllowanceDb))
          .filter(Number.isFinite);
        return rp22LevelForP4(Math.max(...s) - Math.min(...s));
      })());

    console.log('\n--- PER SEAT ---');
    console.log('Seat | FL | FC | FR | P4 dB | P4 level | published (FL/FR only)');
    GENESIS_SEATS.forEach((seat) => {
      const sc = screenOf(metrics, seat.id);
      console.log([
        seat.id,
        fmt(effective(sc?.FL)),
        fmt(effective(sc?.FC)),
        fmt(effective(sc?.FR)),
        fmt(p4(sc)),
        rp22LevelForP4(p4(sc)),
        GENESIS_P4_PUBLISHED[seat.id],
      ].join(' | '));
    });
    console.log('');

    expect(filtered.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 1. Single centre regression — must be untouched                     *
 * ------------------------------------------------------------------ */

describe('P4: single centre regression', () => {
  it('treats a conventional single FC exactly as before', () => {
    const singleCentre = [
      ...GENESIS_SPEAKERS.filter((s) => !isCentreCabinetRole(canon(s.role))),
      { role: 'FC', model: 'c4-1', position: { x: 2.32, y: 0.0605, z: 1.4611349708257664 } },
    ];
    const metrics = metricsFor(singleCentre, GENESIS_SEATS, GENESIS_RSP);

    GENESIS_SEATS.forEach((seat) => {
      const sc = screenOf(metrics, seat.id);
      // A single centre carries no arrangement allowance: its effective SPL and
      // its own propagation result are the same number, so the fix cannot move a
      // single-centre result.
      ['FL', 'FC', 'FR'].forEach((r) => {
        expect(sc?.[r]?.splBeforeArrangementAllowanceDb).toBe(sc?.[r]?.value);
      });
      expect(p4(sc)).toBeCloseTo(effectiveSpread(sc), 5);
      expect(Number.isFinite(p4(sc))).toBe(true);
    });
  });
});

/* ------------------------------------------------------------------ *
 * 2. Dual mono resolves to ONE logical FC                             *
 * ------------------------------------------------------------------ */

describe('P4: dual-mono logical centre', () => {
  it('exposes exactly FL/FC/FR and never FCL/FCR as channels', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'seat-r1-c1');
    expect(Object.keys(screen).sort()).toEqual(['FC', 'FL', 'FR']);
  });

  it('places the logical FC at the pair midpoint', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'seat-r1-c1');
    const midpoint = (0.950927708361081 + 3.6890722916389187) / 2;
    expect(screen.FC.debug.logicalCentrePosition.x).toBeCloseTo(midpoint, 6);
  });

  it('drives the pair at full power with the allowance applied once', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'seat-r1-c1');
    expect(screen.FC.debug.dualCentreAllowanceDb).toBe(4);
    expect(screen.FC.value - screen.FC.splBeforeArrangementAllowanceDb).toBeCloseTo(4, 6);
  });

  it('reads the logical FC at its effective SPL, not the pre-allowance figure', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'mlp');
    expect(p4ChannelSplDb(screen.FC)).toBe(effective(screen.FC));
    expect(p4ChannelSplDb(screen.FC)).not.toBe(screen.FC.splBeforeArrangementAllowanceDb);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Genesis RSP                                                      *
 * ------------------------------------------------------------------ */

describe('P4: Genesis RSP', () => {
  it('reports 108 / 104 / 108 dB and P4 = 4.0 dB, graded L2', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'mlp');

    expect(effective(screen.FL)).toBeCloseTo(108, 0);
    expect(effective(screen.FC)).toBeCloseTo(104, 0);
    expect(effective(screen.FR)).toBeCloseTo(108, 0);
    expect(screen.FC.value - screen.FC.splBeforeArrangementAllowanceDb).toBe(4);

    // 4.0 dB stated at 0.1 dB (raw 4.04 dB): just over the whole-dB L3 boundary,
    // so the corrected metric lands on the EXISTING thresholds' L2.
    expect(p4(screen)).toBeCloseTo(4.0, 1);
    expect(p4(screen)).toBeGreaterThan(4);
    expect(rp22LevelForP4(p4(screen))).toBe('L2');
    expect(rp22LevelForP4(p4(screen))).not.toBe('—');
  });
});

/* ------------------------------------------------------------------ *
 * 4. Every seat                                                       *
 * ------------------------------------------------------------------ */

describe('P4: every seat', () => {
  it('calculates a finite, graded P4 for all eight seats', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    GENESIS_SEATS.forEach((seat) => {
      const value = p4(screenOf(metrics, seat.id));
      expect(Number.isFinite(value), `${seat.id} P4`).toBe(true);
      expect(value, `${seat.id} not '—'`).not.toBe(null);
      expect(['L1', 'L2', 'L3', 'L4']).toContain(rp22LevelForP4(value));
    });
  });
});

/* ------------------------------------------------------------------ *
 * 5. Incomplete pair — existing rule preserved                        *
 * ------------------------------------------------------------------ */

describe('P4: incomplete dual-centre pair', () => {
  it('carries no allowance and still resolves one FC', () => {
    const openHalf = GENESIS_SPEAKERS.filter((s) => s.role !== 'FCR');
    const metrics = metricsFor(openHalf, GENESIS_SEATS, GENESIS_RSP);
    const screen = screenOf(metrics, 'seat-r1-c1');

    expect(Object.keys(screen).sort()).toEqual(['FC', 'FL', 'FR']);
    expect(screen.FC.debug.dualCentreAllowanceDb).toBe(0);
    expect(screen.FC.value).toBe(screen.FC.splBeforeArrangementAllowanceDb);

    // With no allowance on an incomplete pair the effective SPL IS the own
    // propagation result, so the fix cannot move this result at all: the metric
    // must equal the pre-fix (own-propagation) spread exactly.
    const ownPropagationSpread = (() => {
      const spls = ['FL', 'FC', 'FR']
        .map((r) => Number(screen?.[r]?.splBeforeArrangementAllowanceDb))
        .filter(Number.isFinite);
      return Math.max(...spls) - Math.min(...spls);
    })();
    expect(Number.isFinite(p4(screen))).toBe(true);
    expect(p4(screen)).toBeCloseTo(ownPropagationSpread, 4);
    console.log('\nIncomplete pair (FCL only): P4 =', fmt(p4(screen)), 'dB →', rp22LevelForP4(p4(screen)));
  });
});

/* ------------------------------------------------------------------ *
 * 6. Publication completeness                                         *
 * ------------------------------------------------------------------ */

describe('P4: publication completeness', () => {
  it('scopes P4 as scored for every seat', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const p4Seats = {};
    GENESIS_SEATS.forEach((seat) => {
      const value = p4(screenOf(metrics, seat.id));
      p4Seats[seat.id] = Number.isFinite(value)
        ? { state: 'scored', level: rp22LevelForP4(value) }
        : { state: 'not_calculated', level: null };
    });
    const allScored = Object.values(p4Seats).every((s) => s.state === 'scored' && s.level !== '—');
    console.log('\nP4 seat authority:', JSON.stringify(p4Seats));
    expect(allScored).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 7. P16 consistency (observation only — no P16 change)               *
 * ------------------------------------------------------------------ */

describe('P16 consistency', () => {
  it('does not consume the physical centre cabinets', () => {
    const metrics = metricsFor(GENESIS_SPEAKERS, GENESIS_SEATS, GENESIS_RSP);
    const s = GENESIS_SEATS[0];
    const surrounds = metrics.get(s.id)?.spl?.surrounds || {};
    const listenerLevel = metrics.get(s.id)?.spl?.listenerLevelSurrounds || {};

    expect(Object.keys(surrounds)).not.toContain('FCL');
    expect(Object.keys(surrounds)).not.toContain('FCR');
    expect(Object.keys(listenerLevel)).not.toContain('FCL');
    expect(Object.keys(listenerLevel)).not.toContain('FCR');
    console.log('\nP16 surrounds keys:', Object.keys(surrounds).join(', '));
    console.log('P16 listener-level keys:', Object.keys(listenerLevel).join(', '));
  });
});