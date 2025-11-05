export function toFriendlyError(e) {
  let raw = e;
  if (raw && typeof raw === "object") {
    raw = raw.message || raw.error || raw.reason || raw.code || JSON.stringify(raw);
  }
  const s = String(raw || "");
  if (s.includes("no_api_key")) return { title: "No API key", desc: "Click the API badge (top-right) to set your Base44 key." };
  if (s.includes("api_disabled")) return { title: "Offline mode", desc: "API calls are disabled for this session." };
  if (/timeout|request_timeout/i.test(s)) return { title: "Network timeout", desc: "Your network seems slow. Please try again." };
  if (/auth|unauthor/i.test(s)) return { title: "Authentication required", desc: "Open Base44 in a new tab, sign in, then return here." };
  return { title: "Something went wrong", desc: s };
}
export default toFriendlyError;