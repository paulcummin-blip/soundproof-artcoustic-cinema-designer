// Shim re-export.
// Some hooks import computeFrontWideZonesStrict from "@/components/room/utils/frontWideZones"
// but the real implementation lives in "@/components/utils/frontWideZones"

export { computeFrontWideZonesStrict } from "@/components/utils/frontWideZones";