/**
 * TEMPORARY verification (removed after the run): P20 reports whole dB, always
 * rounded DOWN, graded from that same floored integer, and no surface formats a
 * P20 value itself.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gradeP20, floorBassDeviation, bassLevelFromRank } from '../components/utils/rp22/bassGradingAuthority.js';
import { formatP19P20DeviationText, floorP19P20Deviation } from '../components/utils/rp22/resolveRp22DesignValue.js';
import { resolveP20SeatDisplay, p20GradeText } from '../components/room/bass/p20DisplayAuthority.js';

const levelOf = (raw) => bassLevelFromRank(gradeP20(raw));
const displayOf = (raw) => formatP19P20DeviationText(raw);

describe('P20 integer floor reporting', () => {
  it('floors, never rounds to nearest', () => {
    const cases = [
      [2.99, 2], [3.99, 3], [4.99, 4], [5.80, 5], [5.99, 5], [6.00, 6], [10.80, 10],
      [0.99, 0], [12.2, 12], [10.6, 10], [12.9, 12],
    ];
    for (const [raw, expected] of cases) {
      expect(floorBassDeviation(raw), `${raw} → ${expected}`).toBe(expected);
      expect(floorP19P20Deviation(raw), `${raw} → ${expected}`).toBe(expected);
    }
  });

  it('grades the validation set from the floored integer', () => {
    expect([displayOf(5.80), levelOf(5.80)]).toEqual(['±5 dB', 'L1']);
    expect([displayOf(4.99), levelOf(4.99)]).toEqual(['±4 dB', 'L2']);
    expect([displayOf(2.99), levelOf(2.99)]).toEqual(['±2 dB', 'L4']);
    expect([displayOf(6.00), levelOf(6.00)]).toEqual(['±6 dB', 'L1']);
  });

  it('holds the stated level boundaries and has no FAIL', () => {
    expect(levelOf(0)).toBe('L4');
    expect(levelOf(2)).toBe('L4');
    expect(levelOf(2.5)).toBe('L4');
    expect(levelOf(3)).toBe('L3');
    expect(levelOf(3.99)).toBe('L3');
    expect(levelOf(4)).toBe('L2');
    expect(levelOf(4.99)).toBe('L2');
    expect(levelOf(5)).toBe('L1');
    for (const raw of [0, 1, 2, 2.99, 3, 4, 4.99, 5, 5.8, 6, 11.4, 40, 1000]) {
      expect(levelOf(raw), `${raw} is never a FAIL`).not.toBe('FAIL');
      expect(levelOf(raw), `${raw} is never level 0`).not.toBe(0);
    }
  });

  it('the displayed value and the graded level agree for every raw value', () => {
    for (const raw of [0, 0.4, 1.9, 2.99, 3.0, 3.99, 4.0, 4.99, 5.0, 5.8, 6.0, 9.99, 10.8]) {
      const display = resolveP20SeatDisplay({ seatId: 'seat-r1-c1', variationDbRaw: raw, level: gradeP20(raw) });
      const whole = Number(display.displayVariationText.replace(/[^0-9]/g, ''));
      expect(whole, `${raw} display matches the floored integer`).toBe(floorBassDeviation(raw));
      expect(p20GradeText(display.grade)).toBe(levelOf(raw));
      expect(display.roundingMethod).toContain('floor');
    }
  });

  it('preserves full precision underneath', () => {
    expect(resolveP20SeatDisplay({ seatId: 'seat-r1-c1', variationDbRaw: 5.8413 }).exactDeviationDb).toBe(5.8413);
  });

  it('no surface formats a P20 deviation itself', () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) { walk(path); continue; }
        if (!/\.(js|jsx)$/.test(path)) continue;
        const source = readFileSync(path, 'utf8');
        if (/p20VariationDb\s*\)?\s*\.toFixed|p20VariationDb\}\s*\.toFixed|p20VariationDb\s*\}\s*`?\s*\.toFixed/.test(source)) {
          offenders.push(path);
        }
        if (/p20VariationDb[^\n]*Math\.round|Math\.round[^\n]*p20VariationDb/.test(source)) {
          offenders.push(path);
        }
      }
    };
    walk(join(process.cwd(), 'src', 'components'));
    expect(offenders).toEqual([]);
  });

  it('the corrected surfaces read the one canonical floor helper', () => {
    for (const file of [
      'src/components/room/bass/BassPostCalculationActions.jsx',
      'src/components/room/bass/improveBassV2/TradeOffCard.jsx',
      'src/components/adi/recommendationBuilder.js',
    ]) {
      expect(readFileSync(join(process.cwd(), file), 'utf8')).toContain('formatP19P20DeviationText');
      expect(readFileSync(join(process.cwd(), file), 'utf8')).not.toMatch(/deviation\)\.toFixed\(1\)/);
    }
  });
});