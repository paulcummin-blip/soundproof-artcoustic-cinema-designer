// bucketTone.js
// -------------
// One place that maps a canonical status bucket to a display tone, so every
// table and panel shows the same colour for the same bucket.

const TONES = {
  prospective: 'info',
  live: 'good',
  completed: 'good',
  lost: 'bad',
  archived: 'neutral',
  unclassified: 'warn',
};

export function bucketTone(bucket) {
  return TONES[bucket] || 'neutral';
}

export default bucketTone;