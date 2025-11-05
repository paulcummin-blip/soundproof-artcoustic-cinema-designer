// components/utils/normalize.js
export const A = (x) => (Array.isArray(x) ? x : []);
export const speakersArray = (s) => A(s).filter(Boolean);
export const seatsArray = (s) => A(s).filter(
  (t) => t && Number.isFinite(t.x) && Number.isFinite(t.y)
);

// Optional deep-ish clone for safe mutation
export const cloneSpeakers = (speakers) =>
  speakersArray(speakers).map((s) => ({
    ...s,
    position: s?.position ? { ...s.position } : { x: 0, y: 0, z: 0 },
  }));