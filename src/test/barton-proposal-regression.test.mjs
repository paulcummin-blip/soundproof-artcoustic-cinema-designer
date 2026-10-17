import { describe, expect, it } from 'vitest';

import {
  HIGHLIGHT_DISPLAY_LIMIT,
  HIGHLIGHT_MIN_PRINTED_ROWS,
  buildClientSummaryRows,
} from '../components/proposal/keyPerformanceHighlightsAuthority.js';

const headline = (parameter_id, level, formatted_value) => ({
  parameter_id,
  level,
  formatted_value,
});

const BARTON_SNAPSHOT = {
  system: {
    configuration: { dolby_config: '9.1.6' },
    channel_layout: { subwoofer_count: 3 },
  },
  rp22: {
    parameter_headlines: [
      headline(2, 'L4', '15 speakers'),
      headline(12, 'L4', '110 dBC'),
      headline(13, 'L3', '102 dBC (FW)'),
      headline(14, 'L3', '115 dBC'),
      headline(16, 'L4', '±0.5 dB'),
      headline(17, 'L4', '≤1.5 dB window'),
      headline(18, 'L2', '22 Hz'),
      headline(19, 'L4', '±0 dB'),
      headline(20, 'L1', '±9.6 dB'),
    ],
  },
};

describe('Barton proposal client-summary authority', () => {
  it('publishes exactly four client-relevant rows', () => {
    const rows = buildClientSummaryRows(BARTON_SNAPSHOT);
    expect(HIGHLIGHT_DISPLAY_LIMIT).toBe(4);
    expect(HIGHLIGHT_MIN_PRINTED_ROWS).toBe(4);
    expect(rows).toHaveLength(4);
  });

  it('uses the physical three-subwoofer client format without changing codec authority', () => {
    const [system] = buildClientSummaryRows(BARTON_SNAPSHOT);
    expect(system.result).toContain('9.3.6');
    expect(system.result).not.toContain('9.1.6');
  });

  it('states whole-system dynamics and the honest seat-to-seat bass limitation', () => {
    const rows = buildClientSummaryRows(BARTON_SNAPSHOT);
    const dynamic = rows.find((row) => row.key === 'client_dynamic');
    const bass = rows.find((row) => row.key === 'client_bass');
    expect(dynamic.result).toContain('110 dBC');
    expect(dynamic.result).toContain('102 dBC (FW)');
    expect(dynamic.result).toContain('115 dBC');
    expect(bass.result).toContain('22 Hz');
    expect(bass.result).toContain('±9.6 dB');
    expect(bass.gain).toMatch(/greater variation across the other seats/i);
  });
});
