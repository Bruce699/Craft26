export const backdropDefaults = Object.freeze({
  enabled: true,
  color: '#040404',
  scale: 0.79,
  offsetX: 0,
  offsetY: 0,
  depth: 20,
  relief: 3.85,
  metalness: 0.35,
  roughness: 1,
  wallReflection: 0.185,
  wear: 0.12,
  grain: 1,
})

export const lightingDefaults = Object.freeze({
  followCursor: true,
  intensity: 40,
  distance: 138,
  cursorRange: 180,
  height: 60,
  color: '#696969',
  smoothing: 6,
  ambient: 0.3,
  wallRadius: 65,
  wallSoftness: 1,
  carvingContrast: 6,
})

// One continuous wall material. Relief and wear affect the lettering's normals.
// Keep both folders open so the backdrop and lighting can be tuned together.
export const backdropControls = {
  _collapsed: false,
  enabled: backdropDefaults.enabled,
  color: backdropDefaults.color,
  scale: [backdropDefaults.scale, 0.4, 2.5, 0.01],
  offsetX: [backdropDefaults.offsetX, -100, 100, 0.5],
  offsetY: [backdropDefaults.offsetY, -100, 100, 0.5],
  depth: [backdropDefaults.depth, 20, 180, 1],
  relief: [backdropDefaults.relief, 0, 4, 0.05],
  metalness: [backdropDefaults.metalness, 0, 1, 0.01],
  roughness: [backdropDefaults.roughness, 0, 1, 0.01],
  wallReflection: [backdropDefaults.wallReflection, 0, 1, 0.005],
  wear: [backdropDefaults.wear, 0, 1, 0.01],
  grain: [backdropDefaults.grain, 0, 1, 0.01],
}

export const lightingControls = {
  _collapsed: false,
  followCursor: lightingDefaults.followCursor,
  // The shared cursor light uses constant attenuation across both surfaces.
  intensity: [lightingDefaults.intensity, 0, 40, 0.25],
  distance: [lightingDefaults.distance, 20, 240, 1],
  cursorRange: [lightingDefaults.cursorRange, 0, 180, 1],
  height: [lightingDefaults.height, -80, 160, 1],
  color: lightingDefaults.color,
  smoothing: [lightingDefaults.smoothing, 0.5, 20, 0.5],
  ambient: [lightingDefaults.ambient, 0, 1, 0.01],
  wallRadius: [lightingDefaults.wallRadius, 10, 140, 1],
  wallSoftness: [lightingDefaults.wallSoftness, 0.1, 1, 0.01],
  carvingContrast: [lightingDefaults.carvingContrast, 0.5, 6, 0.1],
}
