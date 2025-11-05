export function createBus(channelName = "project-bus") {
  const ch = typeof window !== "undefined" && "BroadcastChannel" in window ? new BroadcastChannel(channelName) : null;
  const publish = (e) => ch?.postMessage(e);
  const subscribe = (fn) => {
    if (!ch) return () => {};
    const handler = (ev) => fn(ev.data);
    ch.addEventListener("message", handler);
    return () => ch.removeEventListener("message", handler);
  };
  return { publish, subscribe, close: () => ch?.close?.() };
}

// Pre-configured bus (not wired yet; for future 2-way sync)
export const ProjectBus = createBus();