// Safe helper for getting current timestamp
export const timeNowMs = () => (Date.now ? Date.now() : new Date().getTime());