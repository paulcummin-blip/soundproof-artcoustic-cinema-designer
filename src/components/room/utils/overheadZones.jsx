// Shim re-export.
// Some hooks import computeOverheadZones from "@/components/room/utils/overheadZones"
// but the real implementation lives in "@/components/room/overlays/OverheadZones.jsx"

export { computeOverheadZones, renderOverheadBandsSVG } from "@/components/room/overlays/OverheadZones";