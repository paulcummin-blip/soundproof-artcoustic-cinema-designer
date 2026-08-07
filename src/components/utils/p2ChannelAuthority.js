import { audioConfigurations } from '@/components/data/audioConfigurations';

/**
 * Counts discrete rendered speakers (excluding subwoofers) for a given format.
 * Derives the count from the existing audioConfigurations speaker list.
 *
 * @param {string} preset - Format key (e.g. '5.1', '7.1.4', '9.1.6')
 * @returns {number} Discrete speaker count excluding subwoofers
 */
export function countDiscreteSpeakers(preset) {
  const config = audioConfigurations[preset];
  if (!config || !Array.isArray(config.speakers)) return 0;
  return config.speakers.filter(s => s.type !== 'sub').length;
}

/**
 * Derives the RP22 Parameter 2 level from the discrete speaker count.
 *
 *   5–10 channels  → L1
 *   11–14 channels → L2
 *   15+ channels   → L4
 *
 * L3 is intentionally ignored per spec.
 *
 * @param {string} preset - Format key
 * @returns {string} P2 level label ('L1', 'L2', 'L4') or '' if unknown
 */
export function p2LevelForFormat(preset) {
  const count = countDiscreteSpeakers(preset);
  if (count <= 0) return '';
  if (count >= 15) return 'L4';
  if (count >= 11) return 'L2';
  if (count >= 5) return 'L1';
  return '';
}