export function getQueryParam(name, search = typeof window !== "undefined" ? window.location.search : "") {
  const params = new URLSearchParams(search || "");
  const v = params.get(name);
  return v === null ? undefined : v;
}