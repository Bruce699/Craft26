export const formDefaults = Object.freeze({
  bendX: 0,
  bendY: 0,
  twist: 0,
  taperTop: 0,
  taperBottom: 0,
  skewX: 0,
  skewY: 0,
  bulge: 0,
  topRight: 0,
  bottomRight: 0,
  bottomLeft: 0,
  topLeft: 0,
})

// Mount under shape.form. These axes follow the visible window: X points right
// and Y points up. Positive taper narrows an end; positive corners pull outward.
export const formControls = Object.fromEntries(
  Object.keys(formDefaults).map((key) => [key, [0, -1, 1, 0.01]]),
)

export const formPresetNames = Object.freeze(['slab', 'pebble', 'spire', 'crescent', 'craggy'])

const presets = {
  slab: {
    width: 1.95, height: 0.62, depth: 0.48, seed: 218,
    outline: { top: -0.4, right: 0.25, bottom: -0.35, left: 0.25, angularity: 0.22, asymmetry: 0.12 },
    surface: { ridges: 0.15, ridgeScale: 1.8, dents: 0.2, dentScale: 2.6 },
    form: { twist: 0.12, taperTop: -0.25, taperBottom: -0.15, skewX: 0.25, bulge: -0.55, topRight: 0.5, bottomRight: 0.45, bottomLeft: 0.35, topLeft: 0.4 },
  },
  pebble: {
    width: 1.08, height: 1.28, depth: 1.65, seed: 1207,
    outline: { top: 0.35, right: 0.1, bottom: 0.35, left: 0.1, angularity: 0.05, asymmetry: 0.1 },
    surface: { ridges: 0.05, ridgeScale: 1.3, dents: 0.1, dentScale: 1.8 },
    form: { bendX: -0.12, bendY: 0.15, taperTop: 0.2, taperBottom: 0.15, bulge: 0.8, topRight: -0.2, bottomRight: -0.15, bottomLeft: -0.2, topLeft: -0.15 },
  },
  spire: {
    width: 0.65, height: 2, depth: 0.9, seed: 4301,
    outline: { top: 1, right: -0.45, bottom: 0.25, left: -0.35, angularity: 0.4, asymmetry: 0.2 },
    surface: { ridges: 0.35, ridgeScale: 2.1, dents: 0.2, dentScale: 2.4 },
    form: { bendX: 0.25, twist: 0.15, taperTop: 0.95, taperBottom: -0.55, skewX: -0.2, bulge: 0.05, topRight: -0.55, bottomRight: 0.45, bottomLeft: 0.45, topLeft: -0.55 },
  },
  crescent: {
    width: 1.45, height: 1.5, depth: 0.8, seed: 6260,
    outline: { top: 0.4, right: 0.65, bottom: 0.4, left: -0.65, angularity: 0.2, asymmetry: 0.65 },
    surface: { ridges: 0.3, ridgeScale: 1.6, dents: 0.4, dentScale: 2 },
    form: { bendX: 0.9, bendY: -0.4, twist: -0.45, taperTop: 0.45, taperBottom: 0.45, skewX: 0.55, skewY: 0.2, bulge: -0.25, topRight: 0.85, bottomRight: 0.85, bottomLeft: -0.6, topLeft: -0.6 },
  },
  craggy: {
    width: 1.7, height: 1.2, depth: 1.4, seed: 9001,
    outline: { top: 0.8, right: 0.6, bottom: -0.6, left: 0.3, angularity: 0.95, asymmetry: 0.85 },
    surface: { ridges: 0.95, ridgeScale: 2.4, dents: 0.8, dentScale: 2.8 },
    form: { bendX: -0.6, bendY: 0.65, twist: 0.6, taperTop: -0.4, taperBottom: 0.55, skewX: -0.55, skewY: 0.45, bulge: 0.4, topRight: 0.95, bottomRight: -0.85, bottomLeft: 0.75, topLeft: -0.5 },
  },
}

// Return complete, independent shape values so switching families cannot retain
// macro values from the previous family or mutate the preset definitions.
export function formPreset(name) {
  const preset = presets[name] ?? presets.pebble
  return {
    width: preset.width,
    height: preset.height,
    depth: preset.depth,
    seed: preset.seed,
    outline: { ...preset.outline },
    surface: { ...preset.surface },
    form: { ...formDefaults, ...preset.form },
  }
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const random = (min, max) => min + Math.random() * (max - min)
const rounded = (value) => Number(value.toFixed(2))
const vary = (value, amount, min, max) => rounded(clamp(value + random(-amount, amount), min, max))

export function newOrganicForm() {
  const family = formPresetNames[Math.floor(Math.random() * formPresetNames.length)]
  const shape = formPreset(family)
  shape.seed = Math.floor(random(1, 10000))
  shape.width = vary(shape.width, 0.16, 0.5, 2.1)
  shape.height = vary(shape.height, 0.16, 0.5, 2.1)
  shape.depth = vary(shape.depth, 0.15, 0.4, 2)
  for (const key of ['top', 'right', 'bottom', 'left']) shape.outline[key] = vary(shape.outline[key], 0.18, -1, 1)
  for (const key of ['angularity', 'asymmetry']) shape.outline[key] = vary(shape.outline[key], 0.12, 0, 1)
  for (const key of ['ridges', 'dents']) shape.surface[key] = vary(shape.surface[key], 0.14, 0, 1)
  for (const key of ['ridgeScale', 'dentScale']) shape.surface[key] = vary(shape.surface[key], 0.5, 1, 5)
  for (const key of Object.keys(formDefaults)) shape.form[key] = vary(shape.form[key], 0.14, -1, 1)
  return shape
}
