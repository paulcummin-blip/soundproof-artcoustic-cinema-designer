// Shared utility for safe array handling across the app
export const asSpeakersArray = (x) =>
  Array.isArray(x) ? x : (x ? [x].flat().filter(Boolean) : []);

export const asSeatsArray = (x) => 
  Array.isArray(x) ? x.filter(s => s && typeof s.x === 'number' && typeof s.y === 'number') : [];

export const safeSpeakerClone = (speakers) =>
  asSpeakersArray(speakers).map(s => ({
    ...s,
    position: s?.position ? { ...s.position } : { x: 0, y: 0, z: 0 },
  }));